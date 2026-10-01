import { after, NextResponse } from 'next/server';
import { canSpendWelcomeCode } from '@/lib/welcomeDiscount';
import { reportRefusedDiscount } from '@/lib/discountRefusalAlert';
import { randomBytes } from 'crypto';
import {
  createOrder,
  decrementProductVariantStock,
  findCustomerByEmail,
  findDiscountCodeByCode,
  findDiscountSignupByCode,
  findInsufficientVariantStock,
  findOrderByNumber,
  getActivePercentagePromotion,
  getShippingSettings,
  getQrCampaignBySlug,
  isDbConfigured,
  listActivePromotionRules,
  listCustomProducts,
  markCheckoutStockDecremented,
  redeemDiscountCode,
  redeemDiscountCodeAtomic,
  upsertMarketingContact,
  type OrderAccountLink,
  type OrderItemRecord,
  type ShippingSettingsRow,
} from '@/lib/db';
import { resolveAccountLink } from '@/lib/orderAccountLink';
import { ipContextFromRequest, recordIpActivity } from '@/lib/db/ipActivity';
import { createSecurityReviewCase } from '@/lib/db/securityReviews';
import { afterStockMovement } from '@/lib/retireProducts';
import { getProductsBySlug, resolveServiceFromLabel, snapshotItemShipping, calculateParcel } from '@/lib/shipping';
import { isValidItem, resolveServerItemPrice, round2, type IncomingItem } from '@/lib/orderPricing';
import { percentOf, sumMoney } from '@/lib/money';
import { discountCodeInfoFromRow, isRafPersonalDiscountCode, resolveDiscountAmount, staffCodeRefusal, type DiscountCodeInfo, type DiscountScopeItem } from '@/lib/discountCodes';
import { siteSaleConfigFromPromotion } from '@/lib/siteSale';
import {
  evaluateCartRules,
  parsePromotionRule,
  notNull,
  toAppliedRuleSummary,
  toOrderItemRecord,
  toRuleCartItems,
  type AppliedRuleSummary,
} from '@/lib/promotionRules';
import { generateOrderNumber, resolveCustomerFromRequest } from '@/lib/auth';
import { checkoutConfirmationRecord, CHECKOUT_CONFIRMATIONS_ERROR } from '@/lib/complianceConfirmations';
import { mergeProducts, PRODUCTS, effectiveAvailability, type Product } from '@/data/products';
import {
  finishSignupOfferReservation,
  getSignupOfferEligibility,
  releaseSignupOfferReservation,
  reserveSignupOffer,
} from '@/lib/db/openingOfferProtection';
import {
  REFERRAL_MIN_FIRST_ORDER,
  applyReferralDeliveryDiscount,
  referralVoucherDeliveryDiscountPercent,
  referralVoucherOwnedBy,
  referralsEnabled,
  releaseReferralVoucherReservation,
  reserveReferralVoucher,
} from '@/lib/memberReferrals';
import {
  glowCardLoyaltyEnabled,
  glowCardVoucherOwnedBy,
  releaseGlowCardVoucherReservation,
  reserveGlowCardVoucher,
} from '@/lib/glowCardLoyalty';
import { affiliatesEnabled, affiliateCodeOwnedBy, affiliateCreditOwnedBy, recordAffiliateOrder } from '@/lib/affiliates';
import { reportAutomationFailure } from '@/lib/automationFailure';

const SIGNUP_DISCOUNT_PERCENT = 10;

// The browser sends a discountAmount alongside the order, but that's a value
// it calculated itself — trusting it outright would let a tampered request
// claim any discount it likes. Re-derive the rate from the authoritative
// record (whichever table the code lives in) and recompute from the
// server-trusted subtotal, so the stored amount can never be manipulated.
// `subtotal` here is the order subtotal after automatic promotion rules —
// for whole-order ("all" scope) codes the discount is taken from that figure
// directly (unchanged from before scoping was added); for category/product
// scoped codes it's taken from the portion of the (pre-rule) item prices that
// fall within scope, capped so it can never exceed `subtotal`.
function toScopeItems(items: OrderItemRecord[], productsBySlug: Map<string, Product> | null): DiscountScopeItem[] {
  return items.map((item) => ({
    slug: item.slug ?? null,
    price: item.price,
    quantity: item.quantity,
    categories: (item.slug && productsBySlug?.get(item.slug)?.categories) || [],
  }));
}

async function resolveServerDiscountAmount(
  code: string | null,
  subtotal: number,
  items: OrderItemRecord[],
  productsBySlug: Map<string, Product> | null,
  customerEmail: string | null,
  minimumOrderSubtotal = subtotal,
): Promise<number> {
  if (!code) return 0;

  const adminCode = await findDiscountCodeByCode(code).catch(() => null);
  if (adminCode) {
    if (adminCode.min_order_value !== null && minimumOrderSubtotal < Number(adminCode.min_order_value)) return 0;
    const info = discountCodeInfoFromRow(adminCode);
    return resolveDiscountAmount(info, subtotal, toScopeItems(items, productsBySlug));
  }

  const signupCode = await findDiscountSignupByCode(code).catch(() => null);
  if (signupCode) {
    // A welcome code is once per customer and belongs to the account it was issued to. Until
    // 16 September 2026 neither was enforced here, so the same code took 10% off every order
    // forever and any member could spend anybody else's. The rule and the full story live in
    // src/lib/welcomeDiscount.ts, shared with the basket preview so the two cannot disagree.
    if (!canSpendWelcomeCode(signupCode, customerEmail).allowed) return 0;
    return percentOf(subtotal, SIGNUP_DISCOUNT_PERCENT);
  }

  return 0;
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'Orders cannot be placed right now. Please try again shortly or contact us.' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);

  const items = Array.isArray(body?.items) ? body.items.filter(isValidItem) as OrderItemRecord[] : [];
  let email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  let customerName = typeof body?.customerName === 'string' ? body.customerName.trim() : '';
  const shippingAddress = typeof body?.shippingAddress === 'string' ? body.shippingAddress.trim() : '';
  const shippingLabel = typeof body?.shippingLabel === 'string' ? body.shippingLabel : '';

  // Structured address fields — kept alongside the flattened `shippingAddress`
  // string above (used for display) so Royal Mail label generation has clean
  // fields to work with rather than needing to re-parse a joined string.
  const addr = (body && typeof body === 'object' && body.address && typeof body.address === 'object') ? body.address : {};
  const shippingLine1 = typeof addr.line1 === 'string' ? addr.line1.trim() : null;
  const shippingLine2 = typeof addr.line2 === 'string' && addr.line2.trim() ? addr.line2.trim() : null;
  const shippingCity = typeof addr.city === 'string' ? addr.city.trim() : null;
  const shippingPostcode = typeof addr.postcode === 'string' ? addr.postcode.trim() : null;
  const shippingCountry = typeof addr.country === 'string' ? addr.country.trim() : null;
  const shippingRecipient = typeof body?.shippingRecipient === 'string' && body.shippingRecipient.trim()
    ? body.shippingRecipient.trim().slice(0, 160) : null;
  let phone = typeof body?.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;
  const clientShippingCost = typeof body?.shippingCost === 'number' ? body.shippingCost : 0;
  const clientSubtotal = typeof body?.subtotal === 'number' ? body.subtotal : 0;
  const discountCode = typeof body?.discountCode === 'string' && body.discountCode ? body.discountCode : null;
  const paymentMethod: 'fena' | 'paypal' | 'manual' =
    body?.paymentMethod === 'paypal' ? 'paypal'
    : body?.paymentMethod === 'manual' ? 'manual'
    : 'fena'; // default to Fena (primary payment method)
  const marketingConsent = body?.marketingConsent === true;

  /* WHAT THEY CONFIRMED BEFORE PAYING, CHECKED HERE AND NOT ONLY ON THE SCREEN.
   *
   * Checkout greys out the Pay button until the Terms and Privacy box is ticked, and a grey
   * button is a courtesy, not a control: this endpoint is a plain POST and anything can call it.
   * So the order is REFUSED without it, rather than saved with a blank record. There is exactly
   * one confirmation; nothing else is required here. */
  const confirmedTerms = body?.confirmations?.terms === true;


  if (!items.length || !email || !customerName || !phone || !shippingAddress || !shippingLabel) {
    return NextResponse.json({ error: 'Your order details are incomplete. Please review and try again.' }, { status: 400 });
  }

  if (!confirmedTerms) {
    return NextResponse.json({
      error: CHECKOUT_CONFIRMATIONS_ERROR,
    }, { status: 400 });
  }

  // The verified session is the only authority for member pricing. A browser
  // must never be able to submit a lower member total just by changing its
  // local basket or request body.
  const customer = await resolveCustomerFromRequest(request);
  if (customer) {
    // Signed-in identity comes from the session, never editable checkout fields.
    email = customer.email.trim().toLowerCase();
    if (customer.first_name && customer.last_name) customerName = `${customer.first_name} ${customer.last_name}`;
    if (customer.phone) phone = customer.phone;
  }

  // Re-derive item prices, subtotal and shipping cost from the live catalogue
  // and shipping settings. Never fall back to browser-submitted prices: that
  // could let a guest bypass the non-member price while a database call fails.
  // productsBySlug/shippingSettings are reused below for the parcel weight
  // snapshot to avoid a second lookup.
  let serverItems: OrderItemRecord[] = items;
  let subtotal = clientSubtotal;
  let shippingCost = clientShippingCost;
  let productsBySlug: Map<string, Product> | null = null;
  let shippingSettings: ShippingSettingsRow | null = null;
  try {
    [productsBySlug, shippingSettings] = await Promise.all([getProductsBySlug(), getShippingSettings()]);
    serverItems = items.map((item) => ({ ...item, price: resolveServerItemPrice(item, productsBySlug!, Boolean(customer)) }));
    subtotal = sumMoney(serverItems.map((item) => item.price * item.quantity));
    const service = resolveServiceFromLabel(shippingLabel);
    const isIntl = service === 'international';
    const baseShippingCost = (isIntl
      ? shippingSettings.international_rate_pence
      : shippingSettings.uk_standard_rate_pence) / 100;
    const freeThreshold = shippingSettings.free_shipping_threshold_pence > 0
      ? shippingSettings.free_shipping_threshold_pence / 100
      : null;
    shippingCost = (!isIntl && freeThreshold !== null && subtotal >= freeThreshold) ? 0 : baseShippingCost;
  } catch {
    return NextResponse.json({
      error: 'We cannot confirm the latest prices right now. Please try again in a moment.',
    }, { status: 503 });
  }

  // A verified personal Raf code is a standalone offer. Check ownership before
  // suppressing automatic offers so an arbitrary RAF5-looking input cannot
  // silently make somebody pay more.
  const effectiveDiscountCode = (discountCode && customer) ? discountCode : null;
  const isAffiliateCode = isRafPersonalDiscountCode(effectiveDiscountCode);
  if (isAffiliateCode && (!affiliatesEnabled() || !(await affiliateCodeOwnedBy(effectiveDiscountCode!, customer!.id).catch(() => false)))) {
    return NextResponse.json({ error: 'That RAF discount code belongs to a different member or has expired.' }, { status: 403 });
  }

  // All other codes keep the established stacking behaviour.
  let ruleDiscountAmount = 0;
  let appliedRules: AppliedRuleSummary[] = [];
  let freeItemRecords: OrderItemRecord[] = [];
  try {
    const pbs = productsBySlug ?? await getProductsBySlug();
    const activeRules = isAffiliateCode ? [] : (await listActivePromotionRules()).map(parsePromotionRule).filter(notNull);
    if (activeRules.length) {
      const result = evaluateCartRules(toRuleCartItems(serverItems, pbs), activeRules, pbs);
      ruleDiscountAmount = result.ruleDiscountAmount;
      appliedRules = result.appliedRules.map(toAppliedRuleSummary);
      freeItemRecords = result.freeItems.map(toOrderItemRecord);
    }
  } catch {
    // Rules lookup/evaluation failed — proceed with no automatic discount.
  }

  const subtotalAfterRules = round2(subtotal - ruleDiscountAmount);

  // Automatic sale discount (admin-toggled, no code needed) — applies before
  // the manual discount code so the code can optionally stack on top. Same
  // scope model and eligibility math as discount codes (resolveDiscountAmount
  // already handles "all" vs category/product scoping correctly), just
  // sourced from the active percentage promotion instead of a
  // DiscountCodeRow.
  let siteSaleDiscountAmount = 0;
  try {
    const activePercentagePromo = isAffiliateCode ? null : await getActivePercentagePromotion();
    const sale = siteSaleConfigFromPromotion(activePercentagePromo);
    if (sale.enabled && sale.percent > 0) {
      const saleInfo: DiscountCodeInfo = {
        discountType: 'percentage',
        percentage: sale.percent,
        fixedAmount: null,
        scopeType: sale.scopeType,
        scopeCategories: sale.scopeCategories,
        scopeProductSlugs: sale.scopeProductSlugs,
      };
      siteSaleDiscountAmount = resolveDiscountAmount(saleInfo, subtotalAfterRules, toScopeItems(serverItems, productsBySlug));
    }
  } catch { /* Sale lookup failed — proceed without */ }

  const subtotalAfterSale = round2(subtotalAfterRules - siteSaleDiscountAmount);

  // Resolve customer session early — discount code eligibility requires an
  // authenticated account. The same result is reused below for order attribution.
  // Strip any submitted discount code from unauthenticated requests — guests
  // cannot use discount codes regardless of what the browser sends.
  if (discountCode && !customer) {
    // They had a code in the basket and arrived at the payment step signed out, most likely because
    // the session ended while they filled the form in. The order still goes through, at full price,
    // and without this nobody would ever know it happened.
    await reportRefusedDiscount({
      email: email || null,
      name: customerName || null,
      code: discountCode,
      reason: 'They reached the payment step signed out, so their code was dropped and they paid full price.',
      stage: 'checkout',
      serious: true,
    });
  }
  if (effectiveDiscountCode?.toUpperCase().startsWith('WB-STAMP-')) {
    if (!referralsEnabled() || !(await referralVoucherOwnedBy(effectiveDiscountCode, customer!.id))) {
      return NextResponse.json({ error: 'That Beauty Card reward code is not available for your account.' }, { status: 403 });
    }
  }
  if (effectiveDiscountCode?.toUpperCase().startsWith('WB-GLOW-')) {
    if (!glowCardLoyaltyEnabled() || !(await glowCardVoucherOwnedBy(effectiveDiscountCode, customer!.id))) {
      return NextResponse.json({ error: 'That Beauty Card reward code is not available for your account.' }, { status: 403 });
    }
  }
  if (effectiveDiscountCode?.toUpperCase().startsWith('RAF-CREDIT-') && !(await affiliateCreditOwnedBy(effectiveDiscountCode, customer!.id).catch(() => false))) {
    return NextResponse.json({ error: 'That RAF shop credit belongs to a different account.' }, { status: 403 });
  }
  const isLegacyGlowReward = Boolean(effectiveDiscountCode?.toUpperCase().startsWith('WB-STAMP-'));
  const isOrderGlowReward = Boolean(effectiveDiscountCode?.toUpperCase().startsWith('WB-GLOW-'));
  const isGlowReward = isLegacyGlowReward || isOrderGlowReward;
  const glowDeliveryDiscountPercent = isLegacyGlowReward
    ? await referralVoucherDeliveryDiscountPercent(effectiveDiscountCode!, customer!.id).catch(() => 0)
    : 0;

  // A welcome code is personal and genuinely one-use. Security evidence is
  // reviewed after the order and can never pause a valid code.
  let signupOfferToReserve = false;
  if (effectiveDiscountCode && customer) {
    const adminCode = await findDiscountCodeByCode(effectiveDiscountCode).catch(() => null);
    if (!adminCode) {
      const eligibility = await getSignupOfferEligibility({
        code: effectiveDiscountCode,
        customerId: customer.id,
        email: customer.email,
      });
      if (eligibility.exists && !eligibility.owned) {
        return NextResponse.json({ error: 'That welcome code belongs to a different member.' }, { status: 403 });
      }
      if (eligibility.exists && !eligibility.active) {
        return NextResponse.json({ error: 'That welcome code has already been used.' }, { status: 409 });
      }
      signupOfferToReserve = eligibility.exists && eligibility.owned && eligibility.active;
    } else {
      // A staff-made code (including RAF5 personal codes and one-use RAF-CREDIT shop credit) must
      // still be switched on, in date and under its usage limit when the order is placed, not
      // only when the basket previewed it. Until 27 Sep 2026 only the basket checked, so a request
      // sent straight here could spend a used-up, expired or switched-off code (Samuel).
      const refusal = staffCodeRefusal(adminCode);
      if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
    }
  }

  // There is deliberately NO automatic first-order discount here. Until
  // 2026-07-29 a first-time buyer who entered no code was silently given 10%
  // off, which made the issued signup codes worthless: the two could not
  // stack (this branch only ran when no code was applied), so every launch
  // subscriber got their 10% without ever using their code, and not one of
  // the 46 issued codes was ever redeemed. The code is now the only route to
  // the member discount, so it is worth having and its redemption is real.
  //
  // Ignore the client-calculated discountAmount/total entirely — recompute
  // from the authoritative code record and the server-trusted subtotal
  // (after automatic rules) so a tampered request can never claim a discount
  // it isn't entitled to.
  const discountAmount = round2(
    await resolveServerDiscountAmount(
      effectiveDiscountCode,
      subtotalAfterSale,
      serverItems,
      productsBySlug,
      customer?.email ?? null,
      isGlowReward ? subtotal : subtotalAfterSale,
    ).catch(() => 0)
  );
  if (isAffiliateCode && discountAmount <= 0) {
    return NextResponse.json({ error: 'Your RAF discount cannot be applied to this basket. Check that your products total at least £30.' }, { status: 400 });
  }
  if (effectiveDiscountCode && discountAmount <= 0) {
    // The basket promised them money off and the payment step worked out nothing. Whatever the
    // cause, the customer is about to pay full price believing they had a discount, so this is
    // always our problem and always worth an email.
    await reportRefusedDiscount({
      email: customer?.email ?? email ?? null,
      name: customerName || null,
      code: effectiveDiscountCode,
      reason: 'The code took nothing off at the payment step, so they paid full price.',
      stage: 'checkout',
      serious: true,
    });
  }
  if (isGlowReward && subtotal < REFERRAL_MIN_FIRST_ORDER) {
    return NextResponse.json({
      error: `Beauty Card rewards can be used when your products total £${REFERRAL_MIN_FIRST_ORDER} or more before delivery. Your reward code has not been used.`,
    }, { status: 400 });
  }
  const isStandardUkDelivery = resolveServiceFromLabel(shippingLabel) === 'uk-standard';
  if (isGlowReward) {
    shippingCost = applyReferralDeliveryDiscount(shippingCost, isStandardUkDelivery, glowDeliveryDiscountPercent);
  }
  const preFeeTotal = sumMoney([subtotalAfterSale, -discountAmount, shippingCost]);
  const paypalFee = paymentMethod === 'paypal' ? percentOf(preFeeTotal, 3.5) : 0;
  const total = sumMoney([preFeeTotal, paypalFee]);

  // Stock is tracked per (slug, dosage) — items without a slug (older
  // clients, or products the admin hasn't started tracking) are treated as
  // unlimited. Free items awarded by automatic rules also decrement stock.
  // `variant` is the dosage label the customer actually selected (e.g.
  // "10mg"), captured on the cart item — see CartItem/IncomingItem.variant.
  const stockItems = [...items, ...freeItemRecords]
    .filter((item): item is (IncomingItem | OrderItemRecord) & { slug: string } => typeof item.slug === 'string' && item.slug.length > 0)
    .map((item) => ({ slug: item.slug, dosage: item.variant, quantity: item.quantity }));

  if (stockItems.length) {
    try {
      const insufficient = await findInsufficientVariantStock(stockItems);
      if (insufficient.length) {
        const overrides = await listCustomProducts().catch(() => ({}));
        const catalogue = mergeProducts(PRODUCTS, overrides);
        const names = insufficient
          .map(({ slug, dosage }) => {
            const product = catalogue.find((p) => p.slug === slug);
            return product ? `${product.name} ${dosage}` : `${slug} ${dosage}`;
          })
          .join(', ');
        return NextResponse.json(
          {
            error: `Sorry — we don't have enough stock left to fulfil this order (${names}). Please reduce the quantity and try again.`,
          },
          { status: 409 }
        );
      }
    } catch {
      // If the stock check itself fails, fall through rather than blocking a sale —
      // the guarded decrement below still prevents stock from going negative.
    }
  }

  // Admin-set availability (Out of Stock / Coming Soon) overrides ordering
  // regardless of numeric stock — re-check here since a tampered cart could
  // otherwise still submit an unavailable item.
  if (productsBySlug) {
    const unavailableNames = items
      .filter((item) => item.slug)
      .map((item) => productsBySlug!.get(item.slug!))
      .filter((product): product is Product => !!product && effectiveAvailability(product) !== 'available')
      .map((product) => product.name);

    if (unavailableNames.length) {
      return NextResponse.json(
        {
          error: `Sorry — the following item(s) are no longer available to order (${unavailableNames.join(', ')}). Please remove them and try again.`,
        },
        { status: 409 }
      );
    }
  }

  // Resolve QR campaign attribution from the 30-day wb_ref cookie (last-touch).
  // Independent of any discount code — a scan without a code still gets credit.
  let qrCampaignId: number | null = null;
  let qrCampaignSlug: string | null = null;
  let qrCampaignName: string | null = null;
  let qrCampaignType: string | null = null;
  let qrPartnerName: string | null = null;
  let signupReservationToken: string | null = null;
  try {
    const refSlug = request.headers.get('cookie')
      ?.split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('wb_ref='))
      ?.slice('wb_ref='.length) ?? null;
    if (refSlug) {
      const campaign = await getQrCampaignBySlug(refSlug);
      if (campaign) {
        qrCampaignId = campaign.id;
        qrCampaignSlug = campaign.slug;
        qrCampaignName = campaign.name;
        qrCampaignType = campaign.campaign_type;
        qrPartnerName = campaign.partner_name;
      }
    }
  } catch { /* Attribution lookup failed — order still places fine. */ }

  // NOTE: Fena/PayPal orders are recorded here at checkout time rather than
  // from a payment-confirmation webhook — admin marks orders paid manually
  // (see /api/admin/orders/[orderNumber]/mark-paid) until that's automated.
  // (customer was already resolved above for discount-code eligibility)

  // Guests checking out with an email that matches an existing account get
  // their order linked to that account too, so it counts toward their order
  // history and totals without requiring them to be signed in.
  const linkedCustomer = customer ?? (await findCustomerByEmail(email).catch(() => null));

  // Record WHICH of those two things just happened (task e0858a61). Once the order is saved the
  // difference is invisible, and it is the difference between "this person was signed in" and
  // "somebody typed an address that happens to belong to a member". Both produce an order with a
  // customer_id on it, so the orders screen could not tell them apart and neither could anyone
  // reading it.
  const accountLink: OrderAccountLink = resolveAccountLink(customer?.id ?? null, linkedCustomer?.id ?? null);

  // A banned account cannot buy, signed in or not (task 9cd55f28). Without this a ban would be
  // decoration: this shop lets guests check out, so shutting the sign-in alone leaves the same
  // person ordering under the same email five seconds later.
  if (linkedCustomer?.banned_at) {
    return NextResponse.json(
      { error: 'We cannot take this order. Please contact us if you think that is a mistake.' },
      { status: 403 }
    );
  }

  let rewardReserved = false;
  let orderCommitted = false;
  if (isGlowReward) {
    rewardReserved = isLegacyGlowReward
      ? await reserveReferralVoucher(effectiveDiscountCode!, customer!.id).catch(() => false)
      : await reserveGlowCardVoucher(effectiveDiscountCode!, customer!.id).catch(() => false);
    if (!rewardReserved) {
      return NextResponse.json({ error: 'That Beauty Card reward code was already used or is no longer available.' }, { status: 409 });
    }
  }

  try {
    let orderNumber = generateOrderNumber();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await findOrderByNumber(orderNumber);
      if (!existing) break;
      orderNumber = generateOrderNumber();
    }

    // Snapshot each item's shipping weight/dimensions and compute the "safe
    // packaged" parcel weight/format at order time, so later catalogue edits
    // never change the shipping data for an already-placed order. If this
    // fails for any reason, fall back to unsnapshotted items — the Royal Mail
    // label route recomputes from the current catalogue + settings anyway.
    // Free items awarded by automatic rules are included so they're part of
    // the parcel weight and the order's item list.
    let itemsWithShipping: OrderItemRecord[] = [...serverItems, ...freeItemRecords];
    let parcelWeightGrams: number | null = null;
    let parcelPackageFormat: string | null = null;
    let packagingWeightGrams: number | null = null;
    try {
      const pbs = productsBySlug ?? (await getProductsBySlug());
      const settings = shippingSettings ?? (await getShippingSettings());
      itemsWithShipping = [...serverItems, ...freeItemRecords].map((item) => ({ ...item, ...snapshotItemShipping(item, pbs, settings) }));
      const parcel = calculateParcel(itemsWithShipping, pbs, settings);
      parcelWeightGrams = parcel.totalWeightGrams;
      parcelPackageFormat = parcel.packageFormat;
      packagingWeightGrams = parcel.packagingWeightGrams;
    } catch {
      // Shipping settings/catalogue lookup failed — order still places fine.
    }

    if (signupOfferToReserve && effectiveDiscountCode && customer) {
      signupReservationToken = randomBytes(24).toString('hex');
      const reserved = await reserveSignupOffer({
        code: effectiveDiscountCode,
        email: customer.email,
        reservationToken: signupReservationToken,
      });
      if (!reserved) {
        return NextResponse.json({ error: 'That welcome code has just been used. Please refresh your basket.' }, { status: 409 });
      }
    }

    const order = await createOrder({
      orderNumber,
      customerId: linkedCustomer?.id ?? null,
      email,
      customerName,
      items: itemsWithShipping,
      subtotal,
      discountCode: effectiveDiscountCode,
      discountAmount,
      shippingLabel,
      shippingCost,
      total,
      shippingAddress,
      shippingLine1,
      shippingLine2,
      shippingCity,
      shippingPostcode,
      shippingCountry,
      shippingRecipient,
      phone,
      paymentMethod,
      paypalFee,
      paymentAccessToken: randomBytes(24).toString('hex'),
      reservationExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      parcelWeightGrams,
      parcelPackageFormat,
      packagingWeightGrams,
      // Site-wide sale discount is folded into ruleDiscountAmount for storage
      // so the order totals stay balanced without a schema change.
      ruleDiscountAmount: round2(ruleDiscountAmount + siteSaleDiscountAmount),
      appliedRules,
      qrCampaignId,
      qrCampaignSlug,
      qrCampaignName,
      qrCampaignType,
      qrPartnerName,
      accountLink,
      /* Built HERE, from the wording this deployment actually shows, rather than from anything
         the browser sent. A record of what somebody agreed to must not be writable by the
         thing being agreed with. */
      checkoutConfirmations: checkoutConfirmationRecord(),
    });

    if (!order) {
      if (signupReservationToken) await releaseSignupOfferReservation(signupReservationToken).catch(() => {});
      if (rewardReserved) {
        const release = isLegacyGlowReward ? releaseReferralVoucherReservation : releaseGlowCardVoucherReservation;
        await release(effectiveDiscountCode!, customer!.id).catch(() => {});
      }
      return NextResponse.json({ error: 'We could not place your order. Please try again shortly.' }, { status: 500 });
    }
    orderCommitted = true;

    // Commission is earned ONLY on orders that use the customer's own verified RAF5 code
    // (Samuel, 27 Sep 2026). The 10% welcome code is for everyone, so an order using it, or
    // any other code, or no code at all, earns the affiliate nothing. isAffiliateCode is only
    // true here once affiliateCodeOwnedBy has confirmed the code belongs to this customer.
    if (affiliatesEnabled() && customer && isAffiliateCode) {
      await recordAffiliateOrder({
        orderId: order.id,
        customerId: customer.id,
        code: effectiveDiscountCode,
        subtotalAfterSale,
        discountAmount,
      }).catch(error => reportAutomationFailure('affiliate_commission', 'A referred order could not be linked to the affiliate ledger.', {
        orderNumber: order.order_number,
        detail: error,
        alertAdmin: true,
        whatToDo: 'Open the order and Affiliate control, then reconcile the missing commission before payout.',
      }));
    }

    if (signupReservationToken) {
      await finishSignupOfferReservation(signupReservationToken).catch(() => {});
    }

    /* Where this order was placed from (task e0858a61). Until now the address log recorded six
       things and buying was not one of them, so an order was the only important thing somebody
       could do here that left no trace on the IP Addresses screen. That was the exact gap behind
       "how did this member order without an address appearing".

       Deliberately not awaited, exactly like the sign-in log: writing down where somebody came
       from must never delay, and can never fail, the thing they came to do. recordIpActivity
       swallows its own errors and creates its own table if it has to. */
    void recordIpActivity({
      event: 'order',
      request,
      customerId: linkedCustomer?.id ?? null,
      name: customerName,
      email,
      detail: accountLink === 'signed_in'
        ? `Order ${order.order_number} placed while signed in`
        : accountLink === 'email_match'
          ? `Order ${order.order_number} placed without signing in, matched to a member by email`
          : `Order ${order.order_number} placed as a guest`,
    });
    if (linkedCustomer?.id) {
      const orderIp = ipContextFromRequest(request).ip;
      after(() => createSecurityReviewCase({
        customerId: linkedCustomer.id,
        sourceEvent: 'order',
        ipAddress: orderIp,
        orderNumber: order.order_number,
        discountCode: effectiveDiscountCode,
      }));
    }

    if (stockItems.length) {
      // Order is already placed — a decrement failure shouldn't block the
      // customer. The guarded UPDATE never lets a row go below zero.
      try {
        const decrementedItems = await decrementProductVariantStock(stockItems);
        await markCheckoutStockDecremented(order.order_number, decrementedItems);
      } catch {
        // Existing checkout policy: a stock-recording problem must not lose a
        // real order. Without the marker the expiry job will not guess and add
        // stock back later, avoiding an over-count.
      }
      // This sale may have taken a variant below the reorder threshold —
      // catches its own errors, so it can never fail the checkout.
      await afterStockMovement();
    }

    // Burn the discount code here, on the server, in the same request that
    // committed the order. THE ONLY PLACE A CODE IS EVER BURNED, and that is a
    // security property rather than tidiness.
    //
    // The browser used to do it itself, POSTing to /api/discount-redeem
    // immediately before redirecting to the payment provider, so the request
    // was routinely cancelled by the navigation and the code stayed reusable.
    // Commit ef9c5e4 on 29 July 2026 moved the burn here and deleted the
    // caller, but left the ROUTE live and reachable. It asked only for a
    // logged-in customer and then matched the code on upper(code) alone, with
    // no check that the code belonged to whoever was calling, so any account
    // holder could POST somebody else's WGLOW10-XXXXXX and burn it, or spend an
    // admin promo code's usage limit, without buying anything. Found in the
    // 29 July audit, deleted 1 August 2026.
    //
    // Both UPDATEs are guarded (signup codes by status = 'active', admin codes
    // by their usage limit), so this is safe to run once per order and a
    // failure here must never block the customer.
    if (effectiveDiscountCode && !isGlowReward) {
      try {
        const adminCode = await findDiscountCodeByCode(effectiveDiscountCode);
        if (adminCode) await redeemDiscountCodeAtomic(effectiveDiscountCode);
        else if (!signupReservationToken) await redeemDiscountCode(effectiveDiscountCode);
      } catch {
        // Order is already placed — never fail the checkout over this.
      }
    }

    // A signed-in member made their marketing choice in account settings.
    // Checkout must not re-subscribe them, even if a forged request sets this flag.
    if (marketingConsent && !customer) {
      const [firstName, ...rest] = customerName.split(' ');
      const lastName = rest.join(' ') || null;
      await upsertMarketingContact({
        email,
        firstName: firstName || null,
        lastName,
        phone,
        customerId: linkedCustomer?.id ?? null,
        source: 'checkout',
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      orderNumber: order.order_number,
      paymentMethod,
      paymentToken: order.payment_access_token,
      resumeUrl: order.payment_access_token ? `/resume-payment/${order.payment_access_token}` : null,
    });
  } catch {
    if (signupReservationToken) await releaseSignupOfferReservation(signupReservationToken).catch(() => {});
    if (rewardReserved && !orderCommitted) {
      const release = isLegacyGlowReward ? releaseReferralVoucherReservation : releaseGlowCardVoucherReservation;
      await release(effectiveDiscountCode!, customer!.id).catch(() => {});
    }
    return NextResponse.json({ error: 'Something went wrong while placing your order. Please try again shortly.' }, { status: 500 });
  }
}
