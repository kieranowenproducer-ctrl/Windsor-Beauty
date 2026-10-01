// Pure helpers for the invoice builder — no DB/network calls. Mirrors the
// equivalent pure-calculation helpers already used by checkout
// (src/lib/orderPricing.ts, src/lib/shipping.ts) rather than inventing a
// parallel money-handling convention.
import { percentOf, roundMoney, sumMoney } from '@/lib/money';
import type { Product } from '@/data/products';
import type { InvoiceLineItem, OrderItemRecord } from '@/lib/db';
import { trialIdFromSlug, trialRoyalMailRef } from '@/lib/trialRoyalMailRef';

// Matches checkout's PayPal surcharge exactly (src/app/checkout/page.tsx —
// `percentOf(preFeeTotal, 3.5)`). An invoice offers Fena and PayPal together
// without the customer picking upfront, so the fee can't be baked into the
// invoice's one fixed total the way checkout does it before creating the
// order — instead the PayPal button requests total+fee, and the same fee is
// applied to the linked order at payment-confirmation time (see
// onInvoiceOrderPaid in invoiceFulfillment.ts) once we actually know PayPal
// was used. Fena never carries this fee.
export const INVOICE_PAYPAL_FEE_PERCENT = 3.5;

export function calculateInvoicePaypalFee(total: number): number {
  return percentOf(total, INVOICE_PAYPAL_FEE_PERCENT);
}

// Same approach as generateOrderNumber() in src/lib/auth.ts — no 0/O/1/I so
// it's easy to read and type back in, prefixed INV- instead of WB- so an
// invoice number is never visually confused with an order number.
export function generateInvoiceNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `INV-${suffix}`;
}

// Net line total after the per-line discount — never negative.
export function computeLineTotal(quantity: number, unitPrice: number, discount: number): number {
  return roundMoney(Math.max(0, quantity * unitPrice - discount));
}

export interface InvoiceTotals {
  subtotal: number;
  total: number;
}

// subtotal = sum of each line's already-net lineTotal. The invoice-level
// discount (manual amount or resolved discount code) is then subtracted,
// and the shipping line added — no VAT anywhere, per the brief.
export function calculateInvoiceTotals(
  lineItems: InvoiceLineItem[],
  shippingAmount: number,
  discountAmount: number
): InvoiceTotals {
  const subtotal = sumMoney(lineItems.map((item) => item.lineTotal));
  const total = sumMoney([Math.max(0, subtotal - discountAmount), shippingAmount]);
  return { subtotal, total };
}

// Maps invoice line items to the exact OrderItemRecord shape createOrder()/
// calculateParcel()/dispatchOrderToRoyalMail() already expect, so a paid
// invoice's linked order rides that pipeline unmodified.
//
// `price` is stored as the line's *effective* (post-discount) unit price
// rather than the gross unitPrice — this keeps sum(item.price * quantity)
// consistent with the order's subtotal everywhere that figure gets
// recomputed for display (order confirmation email, admin orders page),
// since OrderItemRecord has no separate per-item discount field of its own.
// The invoice's own `line_items` JSONB still retains the full
// unitPrice/discount/lineTotal breakdown for the invoice's own display.
export function buildOrderItemsFromInvoice(
  lineItems: InvoiceLineItem[],
  productsBySlug: Map<string, Product>
): OrderItemRecord[] {
  return lineItems.map((item) => {
    const product = item.slug ? productsBySlug.get(item.slug) : undefined;
    const shipping = product?.shipping;
    const effectivePrice = item.quantity > 0 ? roundMoney(item.lineTotal / item.quantity) : item.unitPrice;
    return {
      name: item.name,
      variant: item.description ?? '',
      price: effectivePrice,
      quantity: item.quantity,
      slug: item.slug,
      weightGrams: shipping?.weightGrams ?? item.weightGrams,
      lengthMm: shipping?.lengthMm,
      widthMm: shipping?.widthMm,
      heightMm: shipping?.heightMm,
      // Set on a trial line by anonymiseTrialLines, which runs before this. Carried onto the
      // order so the Royal Mail shipment can name it (task 9e2f4a11); undefined on every
      // ordinary line, which changes nothing for them.
      fulfilmentRef: item.fulfilmentRef,
    };
  });
}

// Joins the structured shipping_* fields the same way the Fena confirm/
// webhook routes already do for orders, so a printed/displayed address
// looks identical whether it came from checkout or an invoice.
export function joinAddressLines(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join('\n');
}

const MAX_LINE_QUANTITY = 100000;
const MAX_LINE_PRICE = 1000000;

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// Normalises an allocated-batch-codes input into a clean, de-duped string array.
// Accepts either an array of strings or a single comma-separated string, so the
// same helper works for the invoice editor and the orders allocation API.
export function normaliseBatchCodes(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const code = typeof entry === 'string' ? entry.trim() : '';
    if (!code) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(code);
  }
  return out;
}

export type InvoiceInputFields = Omit<import('@/lib/db').InvoiceWriteParams, 'invoiceNumber'>;

// Validates and normalises an admin-submitted invoice payload, mirroring the
// parseProductInput()/parseShippingInput() pattern already used in
// src/data/products.ts — returns null if anything required is missing or
// malformed, so the caller can reject the save with a 400. Computes
// lineTotal/subtotal/total server-side rather than trusting client maths.
export function parseInvoiceInput(
  value: unknown,
  trialProducts: readonly Pick<import('@/lib/db/trialProducts').TrialProduct, 'id' | 'name' | 'productCode' | 'variants'>[] = [],
): InvoiceInputFields | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;

  const customerName = typeof v.customerName === 'string' ? v.customerName.trim() : '';
  const email = typeof v.email === 'string' ? v.email.trim().toLowerCase() : '';
  if (!customerName || !email) return null;

  const lineItemsRaw = Array.isArray(v.lineItems) ? v.lineItems : [];
  const lineItems: InvoiceLineItem[] = [];
  const comparableText = (value: string) => ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')} `;
  const protectedNames = trialProducts.map((p) => comparableText(p.name)).filter((name) => name.trim().length >= 4);
  const protectedCodes = trialProducts.map((p) => comparableText(trialRoyalMailRef(p.id, p.productCode)));
  for (const raw of lineItemsRaw) {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    const type: InvoiceLineItem['type'] = item.type === 'trial' ? 'trial' : item.type === 'product' ? 'product' : 'custom';
    const suppliedName = typeof item.name === 'string' ? item.name.trim() : '';
    const trialId = type === 'trial' ? trialIdFromSlug(strOrNull(item.slug)) : null;
    const trialProduct = trialId === null ? null : trialProducts.find((p) => p.id === trialId) ?? null;
    if (type === 'trial' && !trialProduct) return null;
    const name = trialProduct ? trialRoyalMailRef(trialProduct.id, trialProduct.productCode) : suppliedName;
    // A manual line must not pass a Trial name by adding dosage or punctuation,
    // or by claiming to be a catalogue product. Trial lines are resolved from
    // their inventory ID, so the hand-typed text is never trusted there.
    if (type !== 'trial') {
      const manualText = comparableText(`${suppliedName} ${typeof item.description === 'string' ? item.description : ''}`);
      if ([...protectedNames, ...protectedCodes].some((protectedText) => manualText.includes(protectedText))) return null;
    }

    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const discount = item.discount !== undefined ? Number(item.discount) : 0;
    const slugRaw = type === 'product' || type === 'trial' ? strOrNull(item.slug) : null;
    if (type !== 'trial' && trialIdFromSlug(strOrNull(item.slug)) !== null) return null;

    // The builder always starts a fresh invoice with one blank line item,
    // and "+ Add Line Item" adds another — silently skip a row that's still
    // sitting at every default value untouched (no name, no product picked,
    // qty 1, price 0, no discount) rather than hard-rejecting the ENTIRE
    // save over a leftover empty row the admin never got round to filling
    // in or removing. A row with *some* real data but a missing name is
    // still rejected below — that's a genuine mistake, not an unused default.
    const isUntouchedDefault = !name && !slugRaw && quantity === 1 && unitPrice === 0 && !discount;
    if (isUntouchedDefault) continue;

    if (!name) return null;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_LINE_QUANTITY) return null;
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > MAX_LINE_PRICE) return null;
    if (!Number.isFinite(discount) || discount < 0) return null;

    const slug = slugRaw ?? undefined;
    const description = strOrNull(item.description) ?? undefined;
    if (trialProduct && (!description || !trialProduct.variants.some((v) => v.dosage === description))) return null;
    const weightGramsRaw = item.weightGrams;
    const weightGrams = weightGramsRaw !== undefined && weightGramsRaw !== null && weightGramsRaw !== ''
      && Number.isFinite(Number(weightGramsRaw)) && Number(weightGramsRaw) >= 0
      ? Math.round(Number(weightGramsRaw))
      : undefined;

    // Batch codes allocated to this product. Accepts an array or a
    // comma-separated string, de-duped and trimmed; omitted entirely when empty.
    const batchCodes = normaliseBatchCodes(item.batchCodes);

    lineItems.push({
      type, slug, name, description, quantity, unitPrice, discount,
      lineTotal: computeLineTotal(quantity, unitPrice, discount),
      weightGrams,
      ...(batchCodes.length ? { batchCodes } : {}),
      ...(trialProduct ? { fulfilmentRef: name } : {}),
    });
  }

  const shippingAmount = Number.isFinite(Number(v.shippingAmount)) ? Math.max(0, Number(v.shippingAmount)) : 0;
  const discountAmount = Number.isFinite(Number(v.discountAmount)) ? Math.max(0, Number(v.discountAmount)) : 0;
  const { subtotal, total } = calculateInvoiceTotals(lineItems, shippingAmount, discountAmount);

  return {
    customerName,
    email,
    phone: strOrNull(v.phone),
    companyName: strOrNull(v.companyName),
    billingLine1: strOrNull(v.billingLine1),
    billingLine2: strOrNull(v.billingLine2),
    billingCity: strOrNull(v.billingCity),
    billingPostcode: strOrNull(v.billingPostcode),
    billingCountry: strOrNull(v.billingCountry),
    shippingLine1: strOrNull(v.shippingLine1),
    shippingLine2: strOrNull(v.shippingLine2),
    shippingCity: strOrNull(v.shippingCity),
    shippingPostcode: strOrNull(v.shippingPostcode),
    shippingCountry: strOrNull(v.shippingCountry),
    // The name on the parcel when it is not the person being invoiced. Never touches who is
    // being billed (task 77b818aa).
    shippingRecipient: strOrNull(v.shippingRecipient),
    invoiceDate: typeof v.invoiceDate === 'string' && v.invoiceDate ? v.invoiceDate : undefined,
    dueDate: strOrNull(v.dueDate),
    subject: strOrNull(v.subject),
    message: strOrNull(v.message),
    footerText: strOrNull(v.footerText),
    internalNotes: strOrNull(v.internalNotes),
    customerNotes: strOrNull(v.customerNotes),
    lineItems,
    shippingLabel: strOrNull(v.shippingLabel),
    shippingAmount,
    discountCode: strOrNull(v.discountCode),
    discountAmount,
    subtotal,
    total,
  };
}
