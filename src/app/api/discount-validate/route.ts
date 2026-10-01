import { NextResponse } from 'next/server';
import { canSpendWelcomeCode } from '@/lib/welcomeDiscount';
import { findActiveDiscountCode, findDiscountCodeByCode, isDbConfigured } from '@/lib/db';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { getProductsBySlug } from '@/lib/shipping';
import { percentOf } from '@/lib/money';
import {
  discountAmountLabel,
  discountCodeInfoFromRow,
  discountScopeLabel,
  eligibleSubtotal,
  isRafPersonalDiscountCode,
  resolveDiscountAmount,
  type DiscountScopeItem,
} from '@/lib/discountCodes';
import type { Product } from '@/data/products';
import { getSignupOfferEligibility } from '@/lib/db/openingOfferProtection';
import { referralVoucherDeliveryDiscountPercent, referralVoucherOwnedBy, referralsEnabled } from '@/lib/memberReferrals';
import { reportRefusedDiscount } from '@/lib/discountRefusalAlert';
import { glowCardLoyaltyEnabled, glowCardVoucherDeliveryDiscountPercent, glowCardVoucherOwnedBy } from '@/lib/glowCardLoyalty';
import { affiliatesEnabled, affiliateCodeOwnedBy, affiliateCreditOwnedBy } from '@/lib/affiliates';

const SIGNUP_DISCOUNT_PERCENT = 10;

function poundsFormat(value: number) {
  return `£${value.toFixed(2)}`;
}

/**
 * Refuse a code, and make sure somebody finds out.
 *
 * Every refusal below goes through here, so a refusal can never again happen in silence. The
 * customer sees `message`; the dashboard gets `reason`, which may be blunter, but still never names
 * another customer. `serious` marks the ones that are our fault rather than the customer's.
 */
async function refuse(params: {
  email: string | null;
  code: string;
  message: string;
  reason?: string;
  serious?: boolean;
  status?: number;
}) {
  await reportRefusedDiscount({
    email: params.email,
    code: params.code,
    reason: params.reason ?? params.message,
    stage: 'basket',
    serious: params.serious,
  });
  return NextResponse.json(
    { valid: false, message: params.message },
    params.status ? { status: params.status } : undefined
  );
}

interface CartItemInput {
  slug?: string | null;
  price: number;
  quantity: number;
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    // The one refusal that cannot be written down: reporting needs the same database that is
    // missing. Site-wide monitoring covers this case.
    return NextResponse.json(
      { valid: false, message: 'Discount codes are temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }

  // Discount codes require an authenticated account — guests cannot apply them.
  const customer = await resolveCustomerFromRequest(request);
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!customer) {
    // Signed out, so we cannot say who it was, but a visitor holding a code and being turned away
    // is still worth seeing on the dashboard.
    return refuse({
      email: null,
      code,
      message: 'Please log in or create an account to use discount codes.',
      reason: 'They were not signed in. Codes belong to an account.',
      status: 401,
    });
  }
  const subtotal = typeof body?.subtotal === 'number' && Number.isFinite(body.subtotal) ? body.subtotal : 0;
  const originalSubtotal = typeof body?.originalSubtotal === 'number' && Number.isFinite(body.originalSubtotal)
    ? body.originalSubtotal
    : subtotal;
  const rawItems: CartItemInput[] = Array.isArray(body?.items)
    ? body.items.filter((item: unknown): item is CartItemInput =>
        !!item && typeof item === 'object' &&
        typeof (item as Record<string, unknown>).price === 'number' &&
        typeof (item as Record<string, unknown>).quantity === 'number'
      )
    : [];

  if (!code) {
    // Not a refused code, just an empty box. Nothing to report.
    return NextResponse.json({ valid: false, message: 'Please enter a discount code.' }, { status: 400 });
  }

  try {
    // Admin-managed codes take precedence and carry their own configurable
    // rate, expiry, redemption cap, and minimum-order rules — check these
    // first so we can give a specific reason when one can't be applied.
    const adminCode = await findDiscountCodeByCode(code);
    if (adminCode) {
      if (isRafPersonalDiscountCode(code) && (!affiliatesEnabled() || !(await affiliateCodeOwnedBy(code, customer.id)))) {
        return refuse({ email: customer.email, code, message: 'That RAF discount code belongs to a different member or has expired.', reason: 'A personal RAF code that is not theirs.' });
      }
      if (code.toUpperCase().startsWith('RAF-CREDIT-') && !(await affiliateCreditOwnedBy(code, customer.id))) {
        return refuse({ email: customer.email, code, message: 'That RAF shop credit belongs to a different account.', reason: 'Affiliate shop credit that is not theirs.' });
      }
      if (code.toUpperCase().startsWith('WB-STAMP-')) {
        if (!referralsEnabled() || !(await referralVoucherOwnedBy(code, customer.id))) {
          return refuse({
            email: customer.email,
            code,
            message: 'That Glow Card reward code is not available for your account.',
            reason: 'A Glow Card reward code that is not theirs.',
          });
        }
      }
      if (code.toUpperCase().startsWith('WB-GLOW-')) {
        if (!glowCardLoyaltyEnabled() || !(await glowCardVoucherOwnedBy(code, customer.id))) {
          return refuse({
            email: customer.email, code,
            message: 'That Glow Card reward code is not available for your account.',
            reason: 'A Glow Card order-loyalty reward code that is not theirs.',
          });
        }
      }
      if (!adminCode.active) {
        return refuse({ email: customer.email, code, message: 'That code is no longer active.',
          reason: 'The code has been switched off in the admin panel.' });
      }
      if (adminCode.expires_at && new Date(adminCode.expires_at).getTime() <= Date.now()) {
        return refuse({ email: customer.email, code, message: 'That code has expired.',
          reason: `The code expired on ${new Date(adminCode.expires_at).toDateString()}.` });
      }
      if (adminCode.usage_limit !== null && adminCode.times_redeemed >= adminCode.usage_limit) {
        return refuse({ email: customer.email, code, message: 'That code has reached its usage limit.',
          reason: `The code has been used ${adminCode.times_redeemed} times and its limit is ${adminCode.usage_limit}.` });
      }
      if (adminCode.min_order_value !== null) {
        const minOrder = Number(adminCode.min_order_value);
        const qualifyingSubtotal = code.toUpperCase().startsWith('WB-STAMP-') || isRafPersonalDiscountCode(code) ? originalSubtotal : subtotal;
        if (qualifyingSubtotal < minOrder) {
          return refuse({
            email: customer.email,
            code,
            message: `This code requires a minimum order of ${poundsFormat(minOrder)}.`,
            reason: `Their basket was under the ${poundsFormat(minOrder)} minimum for this code.`,
          });
        }
      }

      const info = discountCodeInfoFromRow(adminCode);
      const deliveryDiscountPercent = code.toUpperCase().startsWith('WB-STAMP-')
        ? await referralVoucherDeliveryDiscountPercent(code, customer.id)
        : code.toUpperCase().startsWith('WB-GLOW-')
          ? await glowCardVoucherDeliveryDiscountPercent(code, customer.id)
          : 0;
      const productsBySlug: Map<string, Product> = await getProductsBySlug().catch(() => new Map());
      const scopeItems: DiscountScopeItem[] = rawItems.map((item) => ({
        slug: item.slug ?? null,
        price: item.price,
        quantity: item.quantity,
        categories: (item.slug && productsBySlug.get(item.slug)?.categories) || [],
      }));

      if (info.scopeType !== 'all') {
        const eligible = eligibleSubtotal(info, scopeItems);
        if (eligible <= 0) {
          return refuse({
            email: customer.email,
            code,
            message: `This code only applies to ${discountScopeLabel(info)} and isn't in your cart.`,
            reason: `The code only covers ${discountScopeLabel(info)}, which was not in their basket.`,
          });
        }
      }

      return NextResponse.json({
        valid: true,
        code: adminCode.code,
        discountType: info.discountType,
        percentage: info.percentage,
        fixedAmount: info.fixedAmount,
        scopeType: info.scopeType,
        scopeCategories: info.scopeCategories,
        scopeProductSlugs: info.scopeProductSlugs,
        discountAmount: resolveDiscountAmount(info, isRafPersonalDiscountCode(code) ? originalSubtotal : subtotal, scopeItems),
        deliveryDiscountPercent,
        message: info.scopeType === 'all'
          ? `Code applied: ${discountAmountLabel(info)} your order.${isRafPersonalDiscountCode(code) ? ' Other shop offers will not be added.' : ''}${deliveryDiscountPercent > 0 ? ' Half-price standard UK delivery will also be applied.' : ''}`
          : `Code applied: ${discountAmountLabel(info)} ${discountScopeLabel(info)}.`,
      });
    }

    // Fall back to the auto-issued first-order signup codes (always 10%).
    //
    // A welcome code belongs to the account it was issued to (task c76f31fb). The same rule runs
    // again at order placement; it is here as well so the customer is told at the basket rather
    // than being shown a discount that quietly disappears when they come to pay.
    const signupCode = await findActiveDiscountCode(code);
    if (signupCode) {
      const decision = canSpendWelcomeCode(signupCode, customer.email);
      if (!decision.allowed) {
        return refuse({ email: customer.email, code, message: decision.message ?? 'That code cannot be used.',
          reason: `Welcome code refused: ${decision.reason ?? 'unknown'}.` });
      }
      const eligibility = await getSignupOfferEligibility({ code, customerId: customer.id, email: customer.email });
      if (!eligibility.owned) {
        return refuse({ email: customer.email, code, message: 'That welcome code belongs to a different member.',
          reason: 'The welcome code was issued to a different account.' });
      }
      return NextResponse.json({
        valid: true,
        code: signupCode.code,
        discountType: 'percentage',
        percentage: SIGNUP_DISCOUNT_PERCENT,
        fixedAmount: null,
        scopeType: 'all',
        scopeCategories: [],
        scopeProductSlugs: [],
        discountAmount: percentOf(subtotal, SIGNUP_DISCOUNT_PERCENT),
        message: `Code applied: ${SIGNUP_DISCOUNT_PERCENT}% off your order.`,
      });
    }

    return refuse({
      email: customer.email,
      code,
      message: 'That code is not valid, has already been used, or has expired.',
      reason: 'The code was not recognised at all. Usually a typo, but worth a look if it repeats.',
    });
  } catch {
    // Our fault, not theirs: they had a code and the shop could not answer.
    return refuse({
      email: customer.email,
      code,
      message: 'Something went wrong while checking your code. Please try again shortly.',
      reason: 'The shop failed while checking the code.',
      serious: true,
      status: 500,
    });
  }
}
