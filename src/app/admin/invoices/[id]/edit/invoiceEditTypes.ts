// Moved out of page.tsx unchanged: the invoice types, the option lists, the
// shared input classes and the small money/date helpers. Only `export` added.

export interface InvoiceLineItem {
  // A picked Trial product remains type='trial' with trial:id in saved invoice
  // JSON so every outward surface can enforce its permanent code.
  type: 'product' | 'custom' | 'trial';
  slug?: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  weightGrams?: number;
  batchCodes?: string[];
}

export interface InvoiceEditLogEntry { at: string; summary: string; }

// Shape returned by the admin-only invoice picker. The name is for the admin's
// eyes in the builder; the code is what the invoice and Royal Mail show.
export interface TrialPick {
  id: number;
  name: string;
  code: string;
  variants: { dosage: string; price: number; stock: number }[];
}

// A customer the admin can pick from the lookup box to prefill the invoice.
export interface CustomerMatch {
  source: 'member' | 'order' | 'invoice';
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  /**
   * TRUE when the address above is a real billing address (their own saved details, or a past
   * invoice). FALSE when all we hold is where a past parcel was delivered, which can be a one-off
   * and must never be dropped into the billing fields (task 77b818aa).
   */
  billingAddressIsReal: boolean;
}

export const CUSTOMER_SOURCE_LABEL: Record<CustomerMatch['source'], string> = {
  member: 'Member',
  order: 'Past order',
  invoice: 'Past invoice',
};

export interface InvoiceRow {
  id: number;
  invoice_number: string;
  status: 'draft' | 'sent' | 'viewed' | 'payment_pending' | 'paid' | 'cancelled';
  customer_name: string;
  email: string;
  phone: string | null;
  company_name: string | null;
  billing_line1: string | null;
  billing_line2: string | null;
  billing_city: string | null;
  billing_postcode: string | null;
  billing_country: string | null;
  shipping_line1: string | null;
  shipping_line2: string | null;
  shipping_city: string | null;
  shipping_postcode: string | null;
  shipping_country: string | null;
  /** Who the parcel is for, when that is not the person being invoiced. Null = the customer. */
  shipping_recipient: string | null;
  invoice_date: string;
  due_date: string | null;
  subject: string | null;
  message: string | null;
  footer_text: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  line_items: InvoiceLineItem[];
  shipping_label: string | null;
  shipping_amount: string;
  discount_code: string | null;
  discount_amount: string;
  subtotal: string;
  total: string;
  paypal_fee_amount: string;
  order_number: string | null;
  payment_method_used: 'fena' | 'paypal' | 'cash' | 'bank_transfer' | 'manual' | null;
  intended_payment_method: 'fena' | 'paypal' | 'cash' | 'bank_transfer' | 'manual' | null;
  fulfilment_type: 'royal_mail' | 'collection' | 'hand_delivered' | 'no_delivery' | 'other_manual';
  automation_flags: {
    sendPaymentLink: boolean;
    sendConfirmation: boolean;
    triggerRoyalMail: boolean;
    sendDispatchEmail: boolean;
  };
  public_token: string;
  sent_at: string | null;
  viewed_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  edit_log: InvoiceEditLogEntry[];
  created_at: string;
}

export const INPUT_CLASS = 'border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors disabled:bg-stone-50 disabled:text-stone-400 w-full';
export const SELECT_CLASS = `${INPUT_CLASS} bg-white`;
export const LABEL_CLASS = 'text-[10px] tracking-[0.15em] uppercase text-stone-400';

export const STATUS_TONE: Record<InvoiceRow['status'], string> = {
  draft: 'bg-stone-100 text-stone-500',
  sent: 'bg-blue-50 text-blue-700',
  viewed: 'bg-indigo-50 text-indigo-700',
  payment_pending: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-400',
};

export type PaymentMethod = NonNullable<InvoiceRow['intended_payment_method']>;
export type FulfilmentType = InvoiceRow['fulfilment_type'];
export type AutomationFlags = InvoiceRow['automation_flags'];

export const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'fena', label: 'Fena' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'manual', label: 'Other Manual' },
];

export const FULFILMENT_TYPE_OPTIONS: Array<{ value: FulfilmentType; label: string }> = [
  { value: 'royal_mail', label: 'Ship via Royal Mail' },
  { value: 'collection', label: 'Collection' },
  { value: 'hand_delivered', label: 'Hand Delivered / In Person' },
  { value: 'no_delivery', label: 'No Delivery Required' },
  { value: 'other_manual', label: 'Other Manual' },
];

export const DEFAULT_AUTOMATION_FLAGS: AutomationFlags = {
  sendPaymentLink: true, sendConfirmation: true, triggerRoyalMail: true, sendDispatchEmail: true,
};

export function emptyLineItem(): InvoiceLineItem {
  return { type: 'custom', name: '', description: '', quantity: 1, unitPrice: 0, discount: 0, lineTotal: 0 };
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeLineTotal(quantity: number, unitPrice: number, discount: number): number {
  return roundMoney(Math.max(0, quantity * unitPrice - discount));
}

export function formatDateInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

// Normalises a stored country value into the ISO code CountrySelect expects.
// Early invoices (before this field became a <select>) stored the free-text
// label "United Kingdom" instead of "GB" — royalMailDispatch.ts's
// international check is a strict `countryCode !== 'GB'` comparison, so that
// label silently misclassified UK orders as international. Re-saving an
// invoice through this form now corrects it going forward.
export function normalizeCountry(value: string | null): string {
  if (!value) return 'GB';
  if (value.trim().toLowerCase() === 'united kingdom') return 'GB';
  return value;
}


// ─── The number boxes on an invoice line ─────────────────────────────────────
// Split out of InvoiceLineItems so the behaviour can be tested by a script that
// fails the build, rather than only by looking at it.
//
// The boxes used to read `Math.max(1, Number(raw) || 1)` on every keystroke. Clear the box and raw
// is '', Number('') is 0, and `0 || 1` puts a 1 straight back before anything can be typed. On a
// phone, where the whole field cannot easily be selected first, every new number then gets typed
// onto the end of that 1 — reported from a real invoice as a quantity of 1222222 and a line total
// of £177 million.

/**
 * What to commit WHILE typing. `null` means commit nothing and leave the last good value alone,
 * so a half-typed or momentarily empty box does not send the line total flickering to zero.
 */
export function liveNumber(raw: string, min: number): number | null {
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, n);
}

/** What to commit when the box loses focus. An empty or nonsense box settles at `min`. */
export function settleNumber(raw: string, min: number): number {
  const n = Number(raw);
  if (raw === '' || !Number.isFinite(n)) return min;
  return Math.max(min, n);
}

/** Untracked stock and no stock are different things and must never read the same. */
export function stockWord(n: number | null): string {
  return n === null ? 'stock not tracked' : `${n} in stock`;
}
