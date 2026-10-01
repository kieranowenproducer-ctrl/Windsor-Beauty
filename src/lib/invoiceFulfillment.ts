// Bridges the invoice document into the existing order/stock/Royal-Mail/email
// pipeline. Two functions:
//   convertInvoiceToOrder — called once, when an invoice is first sent.
//   onInvoiceOrderPaid    — called from the three existing payment-confirmation
//     routes (Fena webhook, Fena confirm, admin mark-paid) the moment an
//     invoice-linked order's payment clears.
//
// Deliberately does not touch checkout's own behaviour anywhere — invoice
// orders take a different stock-decrement timing (on payment, not on
// creation) because an unpaid wholesale invoice can sit for weeks and
// shouldn't lock stock the whole time; see invoice_stock_decremented_at on
// `orders` for the guard that makes this safe to call repeatedly.
import {
  applyInvoicePaypalFee,
  createOrder,
  decrementProductStock,
  decrementProductVariantStock,
  findInvoiceById,
  findOrderByNumber,
  getShippingSettings,
  linkOrderToInvoice,
  markInvoiceOrderStockDecremented,
  markInvoicePaid,
  markInvoiceSent,
  PAYMENT_CONFIRMED_STATUSES,
  setOrderPaymentMethod,
  updateOrderContactFromInvoice,
  updateOrderFinancials,
  type OrderRow,
} from '@/lib/db';
import { generateOrderNumber } from '@/lib/auth';
import { afterStockMovement } from '@/lib/retireProducts';
import { buildOrderItemsFromInvoice, calculateInvoicePaypalFee, joinAddressLines } from '@/lib/invoices';
import { anonymiseTrialLines } from '@/lib/invoiceTrialLines';
import { calculateParcel, getProductsBySlug } from '@/lib/shipping';

export interface ConvertInvoiceToOrderResult {
  ok: boolean;
  orderNumber?: string;
  error?: string;
}

// Idempotent — if this invoice already has a linked order (e.g. "Send" is
// retried after an email-send failure), reuses it instead of creating a
// second order, the same dedup principle already used for Royal Mail orders.
export async function convertInvoiceToOrder(invoiceId: number): Promise<ConvertInvoiceToOrderResult> {
  const invoice = await findInvoiceById(invoiceId);
  if (!invoice) return { ok: false, error: 'Invoice not found.' };

  if (invoice.order_number) {
    const existing = await findOrderByNumber(invoice.order_number);
    if (existing) return { ok: true, orderNumber: existing.order_number };
  }

  const [productsBySlug, settings] = await Promise.all([getProductsBySlug(), getShippingSettings()]);
  // buildOrderItemsFromInvoice already resolves each item's weight (catalogue
  // lookup for slug-linked items, or the admin's manual override for custom
  // items) — calculateParcel only falls back to the global default for items
  // that genuinely have neither, so no further snapshotting step is needed
  // (and re-snapshotting here would actually discard a custom item's manual
  // weight override, since it has no catalogue entry to look up).
  // Anonymised first, so the order this becomes carries its permanent Product code rather
  // than the trial product's name into the confirmation email, the packing
  // slip and the customer's order page (task ae168547).
  const items = buildOrderItemsFromInvoice(anonymiseTrialLines(invoice.line_items), productsBySlug);
  const parcel = calculateParcel(items, productsBySlug, settings);

  const shippingAddress = joinAddressLines([
    invoice.shipping_line1 ?? invoice.billing_line1,
    invoice.shipping_line2 ?? invoice.billing_line2,
    invoice.shipping_city ?? invoice.billing_city,
    invoice.shipping_postcode ?? invoice.billing_postcode,
    invoice.shipping_country ?? invoice.billing_country,
  ]);

  // Reuses checkout's own WB-XXXXXX generator (rather than an INV-ORD-prefixed
  // scheme) for two reasons: it keeps invoice-spawned orders indistinguishable
  // from checkout orders in the order number itself (the "Invoice Order" badge
  // already carries that distinction via orders.invoice_id), and — found via
  // production logs after Fena rejected every invoice send with "reference:
  // Maximum length is 12 symbols" — Fena's payment-link reference field is
  // capped at 12 characters, so a longer prefix breaks the Fena button outright.
  let orderNumber = generateOrderNumber();
  for (let attempt = 0; attempt < 5 && (await findOrderByNumber(orderNumber)); attempt += 1) {
    orderNumber = generateOrderNumber();
  }

  const order = await createOrder({
    orderNumber,
    customerId: null,
    email: invoice.email,
    customerName: invoice.customer_name,
    items,
    subtotal: Number(invoice.subtotal),
    discountCode: invoice.discount_code,
    discountAmount: Number(invoice.discount_amount),
    shippingLabel: invoice.shipping_label || 'UK Delivery',
    shippingCost: Number(invoice.shipping_amount),
    total: Number(invoice.total),
    shippingAddress,
    shippingLine1: invoice.shipping_line1 ?? invoice.billing_line1,
    shippingLine2: invoice.shipping_line2 ?? invoice.billing_line2,
    shippingCity: invoice.shipping_city ?? invoice.billing_city,
    shippingPostcode: invoice.shipping_postcode ?? invoice.billing_postcode,
    shippingCountry: invoice.shipping_country ?? invoice.billing_country ?? 'GB',
    // Who the parcel is for, when that is not the person being invoiced. Only the name on the
    // parcel: customer_name above stays the person who owes the money (task 77b818aa).
    shippingRecipient: invoice.shipping_recipient,
    phone: invoice.phone,
    // intended_payment_method is set when the admin already knows the real
    // method up front (a cash/bank-transfer/manual sale) — carried straight
    // through. Left unset, this falls back to the original placeholder
    // behaviour: 'fena', corrected by onInvoiceOrderPaid() to whichever of
    // Fena/PayPal the customer actually clicks, since a standard invoice
    // offers both together and we don't know in advance which one they'll use.
    paymentMethod: invoice.intended_payment_method ?? 'fena',
    fulfilmentType: invoice.fulfilment_type,
    automationFlags: invoice.automation_flags,
    parcelWeightGrams: parcel.totalWeightGrams,
    parcelPackageFormat: parcel.packageFormat,
    packagingWeightGrams: parcel.packagingWeightGrams,
    // Nobody went through checkout for this one: we raised it from an invoice. Saying so is the
    // point — left unset it would read "not recorded", which is what an order from before this
    // existed says, and these two are not the same thing at all. (task e0858a61)
    accountLink: 'admin_created',
  });

  if (!order) return { ok: false, error: 'Could not create the linked order for this invoice.' };

  await linkOrderToInvoice(order.order_number, invoice.id);
  await markInvoiceSent(invoice.id, order.order_number);

  return { ok: true, orderNumber: order.order_number };
}

export interface SyncOrderFinancialsResult {
  ok: boolean;
  skipped?: 'no-linked-order' | 'already-paid';
  error?: string;
}

// Called from the admin invoice PATCH route whenever an already-sent
// invoice's financial fields (line items, shipping, discount, total) are
// edited. convertInvoiceToOrder() only ever copies these onto the linked
// order ONCE, at first send — without this, the order (and anything that
// prices off it, like a Fena payment link, which reads order.total) keeps
// the pre-edit total forever. This is the exact mechanism behind the
// 2026-06-29 incident: an invoice was edited from £487 to £647 after first
// send, and the regenerated Fena link still charged £487 because the order
// itself was never resynced.
//
// Deliberately a no-op once the order has reached a payment-confirmed status
// (PAYMENT_CONFIRMED_STATUSES) — a paid/dispatched order's total, items and
// parcel weight must never move underneath a completed sale (stock may
// already be decremented and a Royal Mail label may already exist for the
// old item list). The admin's existing "adjustment" override on a paid
// invoice intentionally only edits the invoice's own record, not the order;
// correcting an order after the fact is a manual, case-by-case admin action.
export async function syncOrderFinancialsFromInvoice(invoiceId: number): Promise<SyncOrderFinancialsResult> {
  const invoice = await findInvoiceById(invoiceId);
  if (!invoice || !invoice.order_number) return { ok: true, skipped: 'no-linked-order' };

  const order = await findOrderByNumber(invoice.order_number);
  if (!order) return { ok: true, skipped: 'no-linked-order' };

  if (PAYMENT_CONFIRMED_STATUSES.includes(order.status)) {
    return { ok: true, skipped: 'already-paid' };
  }

  const [productsBySlug, settings] = await Promise.all([getProductsBySlug(), getShippingSettings()]);
  // Editing an unpaid invoice must not reintroduce its private trial name into
  // the linked order after the first send. The initial conversion follows this
  // same path; both keep the saved Product code and fulfilment reference.
  const items = buildOrderItemsFromInvoice(anonymiseTrialLines(invoice.line_items), productsBySlug);
  const parcel = calculateParcel(items, productsBySlug, settings);

  const updated = await updateOrderFinancials(order.order_number, {
    items,
    subtotal: Number(invoice.subtotal),
    discountCode: invoice.discount_code,
    discountAmount: Number(invoice.discount_amount),
    shippingLabel: invoice.shipping_label || order.shipping_label,
    shippingCost: Number(invoice.shipping_amount),
    total: Number(invoice.total),
    parcelWeightGrams: parcel.totalWeightGrams,
    parcelPackageFormat: parcel.packageFormat,
    packagingWeightGrams: parcel.packagingWeightGrams,
  });

  if (!updated) return { ok: false, error: 'Could not update the linked order.' };

  // Also push the customer contact details (email/name/phone/address) onto the
  // linked order — mirrors convertInvoiceToOrder's shipping-then-billing
  // fallback exactly. Without this, correcting a bad customer email on an
  // already-sent invoice never reaches the order the Fena payment link reads
  // from, so the regenerated link keeps failing with "customerEmail: Incorrect
  // email". (updateOrderFinancials above only ever synced the money fields.)
  const shippingAddress = joinAddressLines([
    invoice.shipping_line1 ?? invoice.billing_line1,
    invoice.shipping_line2 ?? invoice.billing_line2,
    invoice.shipping_city ?? invoice.billing_city,
    invoice.shipping_postcode ?? invoice.billing_postcode,
    invoice.shipping_country ?? invoice.billing_country,
  ]);
  const contactSynced = await updateOrderContactFromInvoice(order.order_number, {
    email: invoice.email,
    customerName: invoice.customer_name,
    phone: invoice.phone,
    shippingAddress,
    shippingLine1: invoice.shipping_line1 ?? invoice.billing_line1,
    shippingLine2: invoice.shipping_line2 ?? invoice.billing_line2,
    shippingCity: invoice.shipping_city ?? invoice.billing_city,
    shippingPostcode: invoice.shipping_postcode ?? invoice.billing_postcode,
    shippingCountry: invoice.shipping_country ?? invoice.billing_country ?? 'GB',
    // Editing an already-sent invoice must move the delivery name too, or a correction here
    // would leave the parcel addressed to whoever it said before.
    shippingRecipient: invoice.shipping_recipient,
  });
  if (!contactSynced) return { ok: false, error: 'Could not sync customer contact details to the linked order.' };

  return { ok: true };
}

// Called from the four existing payment-confirmation routes immediately
// after dispatchOrderToRoyalMail(). No-ops instantly (and cheaply — one
// lookup) for every ordinary checkout order, since those never have
// invoice_id set. Returns the freshest order row (reflecting any PayPal fee
// just applied) so callers building a confirmation email don't email out a
// stale pre-fee total — see markOrderPaidManually.ts, the only caller that
// can pass anything other than 'fena' (the Fena webhook/confirm routes
// always pass 'fena', which never carries a fee).
export async function onInvoiceOrderPaid(
  orderNumber: string,
  paidVia: 'fena' | 'paypal' | 'cash' | 'bank_transfer' | 'manual'
): Promise<OrderRow | null> {
  const order = await findOrderByNumber(orderNumber);
  if (!order || !order.invoice_id) return null;

  // Correct the placeholder payment_method set at creation — markOrderPaidByAdmin
  // only ever COALESCEs this (never overwrites), so it's still 'fena' from
  // convertInvoiceToOrder() even if the customer actually paid via PayPal.
  await setOrderPaymentMethod(orderNumber, paidVia);

  // One-time guard — stock is decremented on payment for invoice orders
  // (not on send/creation, unlike checkout), so this must never double-fire
  // across retries (webhook + redirect-confirm racing, or a re-sent webhook).
  // The PayPal fee is applied inside this same guard for the same reason —
  // it must only ever be added to the order's total once.
  let paypalFee = 0;
  if (!order.invoice_stock_decremented_at) {
    const slugItems = order.items
      .filter((item): item is typeof item & { slug: string } => typeof item.slug === 'string' && item.slug.length > 0);
    const stockItems = slugItems.map((item) => ({ slug: item.slug, quantity: item.quantity }));
    if (stockItems.length) {
      // Legacy whole-product decrement — kept moving so the old aggregate
      // table doesn't silently freeze for invoice-derived orders.
      await decrementProductStock(stockItems);

      // Best-effort per-dosage decrement too. Invoice line items only ever
      // capture a free-text description (see buildOrderItemsFromInvoice in
      // src/lib/invoices.ts), not a structured dosage, so this can only
      // resolve a variant when the product has exactly one dosage, or when
      // the description happens to match a dosage label exactly — anything
      // else is skipped rather than guessed, leaving it for manual
      // reconciliation. The admin invoice builder doesn't yet offer a
      // dosage picker per line item; see the "Product variant/dosage
      // management" admin-panel audit item for that follow-up.
      const productsBySlug = await getProductsBySlug();
      const variantStockItems = slugItems.flatMap((item) => {
        const product = productsBySlug.get(item.slug);
        if (!product || product.variants.length === 0) return [];
        const dosage =
          product.variants.length === 1
            ? product.variants[0].dosage
            : product.variants.find((v) => v.dosage.trim().toLowerCase() === item.variant.trim().toLowerCase())?.dosage;
        if (!dosage) {
          console.warn(`[invoiceFulfillment] Could not resolve a dosage for "${item.slug}" (description: "${item.variant}") — skipping per-variant stock decrement.`);
          return [];
        }
        return [{ slug: item.slug, dosage, quantity: item.quantity }];
      });
      if (variantStockItems.length) {
        await decrementProductVariantStock(variantStockItems);
        // This payment may have taken a variant below the reorder threshold —
        // catches its own errors, so it can never fail the fulfilment.
        await afterStockMovement();
      }
    }
    await markInvoiceOrderStockDecremented(orderNumber);

    if (paidVia === 'paypal') {
      paypalFee = calculateInvoicePaypalFee(Number(order.total));
      if (paypalFee > 0) {
        await applyInvoicePaypalFee(orderNumber, paypalFee);
      }
    }
  }

  await markInvoicePaid(order.invoice_id, paidVia, paypalFee > 0 ? { paypalFeeAmount: paypalFee } : undefined);

  return findOrderByNumber(orderNumber);
}
