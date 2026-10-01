import type { AppliedRuleSummary } from '@/lib/promotionRules';
import { searchHaystack } from '@/lib/adminSearch';

// Moved out of page.tsx unchanged: the order types, the status tables and the
// two small formatting helpers. Only the word `export` was added.

export type OrderStatus = 'pending' | 'awaiting_payment' | 'paid' | 'awaiting_dispatch' | 'processing' | 'exported' | 'dispatched' | 'delivered' | 'payment_failed' | 'payment_cancelled' | 'refunded' | 'cancelled';

export type RoyalMailLabelStatus = 'none' | 'created' | 'error';

export type FulfilmentType = 'royal_mail' | 'collection' | 'hand_delivered' | 'no_delivery' | 'other_manual';

// Chosen on the invoice that created the order (or defaulted to royal_mail
// for ordinary checkout orders) — drives which dispatch panel below applies.
// Only 'royal_mail' orders go anywhere near Royal Mail/Click & Drop; the
// other four are all "admin handles this outside the post" variants that
// share one simple manual-fulfilment flow instead.
export const FULFILMENT_LABELS: Record<FulfilmentType, string> = {
  royal_mail: 'Royal Mail',
  collection: 'Customer Collection',
  hand_delivered: 'Hand Delivered',
  no_delivery: 'No Delivery Required',
  other_manual: 'Other (Manual)',
};

// How an order came to be attached to the account it is attached to (task e0858a61). The words
// and the type both come from the one file that decides it, so the screen can never drift from
// what was actually recorded.
export { ACCOUNT_LINK_LABELS } from '@/lib/orderAccountLink';
export type { OrderAccountLink as AccountLink } from '@/lib/orderAccountLink';

export const ACCOUNT_LINK_STYLES: Record<import('@/lib/orderAccountLink').OrderAccountLink, string> = {
  signed_in:     'bg-green-50 text-green-600',
  email_match:   'bg-yellow-50 text-yellow-600',
  guest:         'bg-stone-50 text-stone-500',
  admin_created: 'bg-gold-50 text-gold-700',
  not_recorded:  'bg-stone-50 text-stone-400',
};

export interface OrderItem {
  name: string;
  variant: string;
  price: number;
  quantity: number;
}

// A one-line "what was bought" summary for the orders list, so the products
// are visible at a glance without opening each order (e.g. "2x Serum,
// 1x Cleanser"). Variant is appended in brackets only when it adds information.
export function summariseItems(items: OrderItem[]): string {
  if (!items || items.length === 0) return 'No items';
  return items
    .map((item) => {
      const label = item.variant && item.variant !== item.name ? `${item.name} (${item.variant})` : item.name;
      return `${item.quantity}× ${label}`;
    })
    .join(', ');
}

export interface Order {
  orderNumber: string;
  customerName: string;
  email: string;
  phone: string | null;
  total: number;
  paypalFee: number;
  discountCode: string | null;
  discountAmount: number;
  ruleDiscountAmount: number;
  appliedRules: AppliedRuleSummary[];
  items: OrderItem[];
  status: OrderStatus;
  paymentMethod: string | null;
  createdAt: string;
  /** Null while this row is only an unpaid payment attempt. */
  paymentConfirmedAt: string | null;
  /** What Royal Mail last said about the parcel (task d912f632). Never delivery: they do not tell us. */
  royalMailPrintedOn?: string | null;
  royalMailShippedOn?: string | null;
  royalMailCheckedAt?: string | null;
  /** When it was marked delivered. Null on orders delivered before the shop recorded it (task 831a4461). */
  deliveredAt?: string | null;
  /** When somebody moved it to Archived orders by hand. */
  archivedAt?: string | null;
  dispatchedAt?: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippingAddress: string;
  shippingLabel: string;
  shippingCountry: string | null;
  royalMailOrderId: string | null;
  royalMailLabelStatus: RoyalMailLabelStatus | null;
  royalMailLabelError: string | null;
  parcelWeightGrams: number | null;
  parcelPackageFormat: string | null;
  packagingWeightGrams: number | null;
  shippingEmailSentAt: string | null;
  adminNotes: string | null;
  qrCampaignSlug: string | null;
  qrCampaignName: string | null;
  qrCampaignType: string | null;
  qrPartnerName: string | null;
  invoiceId: number | null;
  fulfilmentType: FulfilmentType;
  // Invoice notes surfaced on the order for admin transparency (task e6e75b32)
  invoiceSubject: string | null;
  invoiceMessage: string | null;
  invoiceInternalNotes: string | null;
  invoiceCustomerNotes: string | null;
  accountLink: import('@/lib/orderAccountLink').OrderAccountLink;
  /** What they ticked before paying, with the exact wording they were shown. Null = not captured. */
  checkoutConfirmations: import('@/lib/complianceConfirmations').CheckoutConfirmationRecord | null;
}

// Mirrors db.ts's PAYMENT_CONFIRMED_STATUSES — used here only to decide which
// dispatch controls to show; the API routes enforce the real gating.
export const PAYMENT_CONFIRMED_STATUSES: OrderStatus[] = [
  'paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered',
];

export const STATUS_OPTIONS: OrderStatus[] = [
  'pending', 'awaiting_payment', 'paid', 'awaiting_dispatch', 'processing',
  'exported', 'dispatched', 'delivered', 'payment_failed', 'payment_cancelled', 'refunded', 'cancelled',
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:            'Pending',
  awaiting_payment:   'Awaiting Payment',
  paid:               'Paid',
  awaiting_dispatch:  'Awaiting Dispatch',
  processing:         'Processing',
  exported:           'Exported',
  dispatched:         'Dispatched',
  delivered:          'Delivered',
  payment_failed:     'Payment Failed',
  payment_cancelled:  'Cancelled (Payment)',
  refunded:           'Refunded',
  cancelled:          'Cancelled',
};

// Which statuses are sensible to move to *from* a given status — shown as
// the only selectable options in "Update Status" so an admin can't, say,
// set "dispatched" on an order that was never marked paid. Terminal states
// (refunded/cancelled) have no forward moves; the UI disables the dropdown
// entirely for those rather than offering an empty/confusing list.
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:            ['awaiting_payment', 'cancelled'],
  awaiting_payment:   ['paid', 'payment_failed', 'payment_cancelled', 'cancelled'],
  paid:               ['awaiting_dispatch', 'refunded', 'cancelled'],
  awaiting_dispatch:  ['processing', 'exported', 'dispatched', 'refunded', 'cancelled'],
  processing:         ['exported', 'dispatched', 'refunded', 'cancelled'],
  exported:           ['dispatched', 'refunded', 'cancelled'],
  dispatched:         ['delivered', 'refunded'],
  delivered:          ['refunded'],
  payment_failed:     ['awaiting_payment', 'cancelled'],
  payment_cancelled:  ['awaiting_payment', 'cancelled'],
  refunded:           [],
  // A cancelled order can be brought back to awaiting payment (task 477f3453):
  // when the customer pays a cancelled order anyway, this is how the books are
  // put right, by reinstating it and then marking it paid.
  cancelled:          ['awaiting_payment'],
};

export const STATUS_STYLES: Record<OrderStatus, string> = {
  pending:            'bg-yellow-50 text-yellow-600',
  awaiting_payment:   'bg-orange-50 text-orange-600',
  paid:               'bg-blue-50 text-blue-600',
  awaiting_dispatch:  'bg-sky-50 text-sky-600',
  processing:         'bg-purple-50 text-purple-600',
  exported:           'bg-indigo-50 text-indigo-600',
  dispatched:         'bg-gold-50 text-gold-700',
  delivered:          'bg-green-50 text-green-600',
  payment_failed:     'bg-red-50 text-red-400',
  payment_cancelled:  'bg-red-50 text-red-400',
  refunded:           'bg-rose-50 text-rose-500',
  cancelled:          'bg-red-50 text-red-500',
};


/**
 * Everything on an order that is worth searching, as one block of text.
 *
 * Kieran, 2026-09-24: typing "Amber Reta" found nothing, because the search only looked at the
 * name, the email and the order number, one at a time, for that whole phrase. The product was
 * never searched at all. Putting the fields together in one place is what lets a customer and a
 * product be typed together and still find the order. See src/lib/adminSearch.ts for the matching.
 *
 * Deliberately NOT in here: the money. "120" would otherwise match a total, an order number and a
 * postcode all at once, and the list would feel random. Search by name, product, place or number.
 */
export function orderSearchText(order: Order): string {
  return searchHaystack([
    order.orderNumber,
    order.customerName,
    order.email,
    order.phone,
    order.items?.map(item => `${item.name} ${item.variant ?? ''}`).join(' '),
    STATUS_LABELS[order.status],
    order.discountCode,
    order.shippingAddress,
    order.shippingLabel,
    order.shippingCountry,
    order.trackingNumber,
    order.paymentMethod,
    order.qrCampaignName,
    order.qrPartnerName,
    order.adminNotes,
    order.invoiceSubject,
  ]);
}

/** The orders list can be put in any of these orders. `newest` is the default and always was. */
export type OrderSort = 'newest' | 'oldest' | 'name_az' | 'name_za' | 'total_high' | 'total_low';

export const ORDER_SORT_LABELS: Record<OrderSort, string> = {
  newest:     'Newest first',
  oldest:     'Oldest first',
  name_az:    'Name A to Z',
  name_za:    'Name Z to A',
  total_high: 'Biggest total first',
  total_low:  'Smallest total first',
};

/**
 * Sorts a copy of the list, never the list itself.
 *
 * Every option falls back to newest-first when two rows tie, so the order on screen is stable and
 * a name sort does not reshuffle a customer's own orders at random.
 */
export function sortOrders(orders: Order[], sort: OrderSort): Order[] {
  const newestFirst = (a: Order, b: Order) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const byName = (a: Order, b: Order) =>
    a.customerName.localeCompare(b.customerName, 'en-GB', { sensitivity: 'base' });

  const compare: Record<OrderSort, (a: Order, b: Order) => number> = {
    newest:     newestFirst,
    oldest:     (a, b) => -newestFirst(a, b),
    name_az:    (a, b) => byName(a, b) || newestFirst(a, b),
    name_za:    (a, b) => -byName(a, b) || newestFirst(a, b),
    total_high: (a, b) => (b.total - a.total) || newestFirst(a, b),
    total_low:  (a, b) => (a.total - b.total) || newestFirst(a, b),
  };

  return [...orders].sort(compare[sort] ?? newestFirst);
}

/**
 * The day an order was placed, as YYYY-MM-DD in UK time, which is what the date boxes hold.
 * Compared as text on purpose: no timezone can shift a day boundary that way.
 */
export function orderDayInUk(order: Order): string {
  const date = new Date(order.createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });
}


/**
 * What the tabs on the Orders screen can be set to (task 831a4461).
 *
 * 'archived' is not an order status and never will be: an archived order keeps whatever status it
 * had. It is a folder the screen looks in, which is why it lives alongside the statuses here rather
 * than being added to them.
 */
export type OrderTab = OrderStatus | 'all' | 'archived';
