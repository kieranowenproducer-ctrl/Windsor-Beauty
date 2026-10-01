import { requireDb } from './client';
import type { AppliedRuleSummary } from '../promotionRules';
// Extracted from db.ts on 2026-08-16, following the same pattern as every other
// file in this folder: the code moved verbatim and '@/lib/db' re-exports it, so
// no call site changed.
//
// This file exists to be the landing place for the Orders section, which is the
// largest thing still left in db.ts. It starts with the two row shapes and the
// one delete, because db/invoices.ts needs them and a database module importing
// back out of db.ts would be a circular import: the one thing none of the other
// files in this folder do.
//
// Take another piece of Orders with you when you are next working in here.

// ─── Orders: row shapes and deletion ────────────────────────────────────────

export interface OrderItemRecord {
  name: string;
  variant: string;
  price: number;
  quantity: number;
  /** Product slug — used to check and decrement stock at order time. Optional so older orders without it still validate. */
  slug?: string;
  /** Per-unit shipping snapshot, captured from Product.shipping at order time so later catalogue edits don't change historic parcel weights. */
  weightGrams?: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  /** Batch identifying code(s) allocated to this product before dispatch. Stored in the items JSONB — no schema change. */
  batchCodes?: string[];
  /**
   * The neutral name this line ships under at Royal Mail, e.g. "Product 284" (task 9e2f4a11).
   *
   * Only ever set on a trial-product line, by anonymiseTrialLines, which is the last point that
   * still knows which trial product it is. Snapshotted here rather than recomputed at dispatch
   * because by then the line has no trial identity left at all, and because a consignment should
   * keep the reference it actually shipped under. Stored in the items JSONB, so no schema change.
   */
  fulfilmentRef?: string;
}

export interface OrderRow {
  id: number;
  order_number: string;
  customer_id: number | null;
  email: string;
  customer_name: string;
  items: OrderItemRecord[];
  subtotal: string;
  discount_code: string | null;
  discount_amount: string;
  shipping_label: string;
  shipping_cost: string;
  total: string;
  /**
   * Operational status. Progression for a Fena payment:
   *   pending → (Fena webhook) → paid → awaiting_dispatch → exported → dispatched → delivered
   * For PayPal/manual:
   *   pending → (admin marks paid) → awaiting_dispatch → exported → dispatched → delivered
   * Terminal error states: payment_failed | payment_cancelled | cancelled
   */
  status:
    | 'pending'              // created, no payment action yet (legacy + initial state)
    | 'awaiting_payment'     // Fena payment URL sent to customer, awaiting webhook
    | 'payment_failed'       // Fena/PayPal reported failure
    | 'payment_cancelled'    // Customer cancelled the payment
    | 'paid'                 // Payment confirmed
    | 'awaiting_dispatch'    // Paid, not yet exported to Royal Mail
    | 'processing'           // Legacy — treat as awaiting_dispatch in new code
    | 'exported'             // Included in a Royal Mail Click & Drop CSV export
    | 'dispatched'           // Tracking number confirmed, parcel handed to carrier
    | 'delivered'            // Delivered (customer-confirmed or courier-reported)
    | 'refunded'             // Order refunded — terminal state
    | 'cancelled';           // Admin-cancelled order
  shipping_address: string;
  tracking_number: string | null;
  created_at: string;
  /** Null while this is only a payment attempt; set once money is confirmed. */
  payment_confirmed_at: string | null;
  /** When it was marked delivered. Null on orders delivered before this was recorded (task 831a4461). */
  delivered_at?: string | null;
  /** When somebody moved it to Archived orders by hand. Null means the 7-day rule decides (task 831a4461). */
  archived_at?: string | null;
  /** When its LINE was taken off the dashboard feed. Never hides the order itself (task 535c24f9). */
  activity_cleared_at?: string | null;
  /** What Royal Mail last told us about this parcel (task d912f632). Never a delivery status: they do not give one. */
  royal_mail_printed_on?: string | null;
  royal_mail_shipped_on?: string | null;
  royal_mail_checked_at?: string | null;
  // Structured address — populated for orders placed after the Royal Mail
  // integration was added; older orders fall back to `shipping_address`.
  shipping_line1: string | null;
  shipping_line2: string | null;
  shipping_city: string | null;
  shipping_postcode: string | null;
  shipping_country: string | null;
  /** Who the parcel is addressed to, when that is not the person who paid. NULL = the customer. */
  shipping_recipient: string | null;
  phone: string | null;
  // Royal Mail Click & Drop shipment — set once a label has been generated
  royal_mail_order_id: string | null;
  parcel_weight_grams: number | null;
  shipping_email_sent_at: string | null;
  // tracking_url: deep link to Royal Mail's tracking page for this parcel.
  tracking_url: string | null;
  // royal_mail_label_status: 'none' (no label yet) | 'created' |
  // 'pending_postage' (Royal Mail accepted/created the order but is
  // withholding the tracking number until postage is paid manually in
  // Click & Drop — a normal, expected state, not a failure) | 'error'
  // (a genuine API rejection). Independent of `status` — an order can be
  // 'awaiting_dispatch' with a label already created, pending postage, or
  // with a failed attempt that can be retried.
  royal_mail_label_status: 'none' | 'created' | 'pending_postage' | 'error';
  royal_mail_label_error: string | null;
  royal_mail_label_created_at: string | null;
  royal_mail_label_error_at: string | null;
  royal_mail_last_response: string | null;
  // Package format + packaging allowance actually used for the label/CSV row.
  parcel_package_format: string | null;
  packaging_weight_grams: number | null;
  // Payment integration
  payment_method: 'fena' | 'paypal' | 'manual' | 'cash' | 'bank_transfer';
  fena_payment_id: string | null;
  fena_payment_url: string | null;
  paypal_order_id: string | null;
  paypal_fee: string;
  payment_access_token: string | null;
  reservation_expires_at: string | null;
  payment_reminder_sent_at: string | null;
  checkout_stock_decremented_at: string | null;
  checkout_stock_items: { slug: string; dosage: string; quantity: number }[];
  stock_restored_at: string | null;
  // Admin-controlled fulfilment + automation overrides — see ensureSchema for
  // the rationale. Every checkout-created order keeps the defaults below
  // ('royal_mail' / all flags true), reproducing today's behaviour exactly.
  fulfilment_type: 'royal_mail' | 'collection' | 'hand_delivered' | 'no_delivery' | 'other_manual';
  automation_flags: {
    sendPaymentLink: boolean;
    sendConfirmation: boolean;
    triggerRoyalMail: boolean;
    sendDispatchEmail: boolean;
  };
  // Shipping workflow timestamps
  exported_at: string | null;
  dispatched_at: string | null;
  admin_notes: string | null;
  // Automatic promotion rules (BOGO/bundle/spend-threshold) applied at order
  // time, separate from the manual discount_amount above.
  rule_discount_amount: string;
  applied_rules: AppliedRuleSummary[];
  // QR campaign attribution — set at checkout if a wb_ref cookie is present.
  qr_campaign_id: number | null;
  qr_campaign_slug: string | null;
  qr_campaign_name: string | null;
  qr_campaign_type: string | null;
  qr_partner_name: string | null;
  // Set when this order was created by the invoice system (src/lib/invoiceFulfillment.ts)
  // rather than the live checkout — doubles as the "Invoice Order" admin badge condition.
  invoice_id: number | null;
  // Guards the one-time, payment-time (not creation-time) stock decrement
  // that's deliberately deferred for invoice orders — never set for ordinary
  // checkout orders, which decrement stock inline at creation already.
  invoice_stock_decremented_at: string | null;
  // Set by the Fena webhook when its signed payload's reported amount
  // doesn't match this order's total — see ensureSchema for the rationale.
  payment_amount_mismatch: string | null;
  // How this order reached the account it is attached to (task e0858a61). A customer_id alone
  // never proved the person was signed in: checkout also links an order by matching the typed
  // email to an existing account. See ensureSchema for what each value means. 'not_recorded' is
  // every order placed before the column existed, and means exactly that — not a guess.
  account_link: import('../orderAccountLink').OrderAccountLink;
  /* What they confirmed before paying: that they accept the Terms. Carries the
     exact sentences they were shown, so an old order still reads as what THAT customer agreed to
     rather than as today's wording. NULL means not captured, never 'declined' and never an
     assumed yes: orders placed before this existed, and invoice orders, which are made by the
     shop rather than by somebody at a checkout. */
  checkout_confirmations: import('../complianceConfirmations').CheckoutConfirmationRecord | null;
}

// A deploy reaches the live code before anybody can press "Run Database
// Setup". Any query that relies on the new confirmation time calls this small
// idempotent guard first, so there is no broken window between code and schema.
// One promise per server process also prevents a busy dashboard from issuing
// the same ALTER several times in parallel.
let paymentConfirmationTracking: Promise<void> | null = null;

export function ensureOrderPaymentConfirmationTracking(): Promise<void> {
  if (paymentConfirmationTracking) return paymentConfirmationTracking;
  const db = requireDb();
  paymentConfirmationTracking = (async () => {
    const existing = await db`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders'
        AND column_name = 'payment_confirmed_at'
      LIMIT 1
    `;
    if (existing.length > 0) {
      const [missingHistory, index] = await Promise.all([
        db`
          SELECT 1 FROM orders
          WHERE payment_confirmed_at IS NULL
            AND status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered', 'refunded')
          LIMIT 1
        `,
        db`
          SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'orders'
            AND indexname = 'idx_orders_payment_confirmed_at'
          LIMIT 1
        `,
      ]);
      // The normal path after the one-time migration is read-only. This
      // matters on local machines, whose safe database credential is
      // deliberately not allowed to alter the live schema.
      if (missingHistory.length === 0 && index.length > 0) return;
    }
    await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ`;
    await db`
      UPDATE orders
      SET payment_confirmed_at = created_at
      WHERE payment_confirmed_at IS NULL
        AND status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered', 'refunded')
    `;
    await db`CREATE INDEX IF NOT EXISTS idx_orders_payment_confirmed_at ON orders (payment_confirmed_at DESC) WHERE payment_confirmed_at IS NOT NULL`;
  })().catch((error) => {
    paymentConfirmationTracking = null;
    throw error;
  });
  return paymentConfirmationTracking;
}

// Archived orders (task 831a4461). Two columns, added the same careful way as the payment-time
// guard above, and for the same reason: a deploy reaches the live code before anybody can press
// "Run Database Setup", and the read-only fast path matters because the credential on a local
// machine is deliberately not allowed to alter the live schema.
//
// `delivered_at` is when an order was marked delivered. It is NOT backfilled: the shop never
// recorded it, so there is no honest value to write for the orders already delivered, and writing a
// guess into the database would make it look like a fact for ever. The archive rule falls back to
// dates that ARE known and says so on screen instead.
//
// `archived_at` is only ever set by somebody pressing the button. The 7-day rule is worked out when
// the screen is read, so it can never be stale and there is no nightly job to fail quietly.
let orderArchivingReady: Promise<void> | null = null;

export function ensureOrderArchiving(): Promise<void> {
  if (orderArchivingReady) return orderArchivingReady;
  const db = requireDb();
  orderArchivingReady = (async () => {
    const existing = await db`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders'
        AND column_name IN ('delivered_at', 'archived_at')
    `;
    if (existing.length === 2) return;
    await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ`;
    await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
  })().catch((error) => {
    orderArchivingReady = null;
    throw error;
  });
  return orderArchivingReady;
}

// When somebody took this order's line off the dashboard's Latest Activity list
// (task 535c24f9). Only the finished red ones can be, Cancelled and Payment
// failed, and it hides a LINE, never the order: the Orders screen, the customer
// and the money are all untouched by it.
//
// Same shape and the same reason as the guard above: a deploy reaches the live
// code before anybody can press "Run Database Setup", and the read-only fast
// path matters because the credential on a local machine is deliberately not
// allowed to alter the live schema.
let activityClearingReady: Promise<void> | null = null;

export function ensureOrderActivityClearing(): Promise<void> {
  if (activityClearingReady) return activityClearingReady;
  const db = requireDb();
  activityClearingReady = (async () => {
    const existing = await db`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders'
        AND column_name = 'activity_cleared_at'
      LIMIT 1
    `;
    if (existing.length > 0) return;
    await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS activity_cleared_at TIMESTAMPTZ`;
  })().catch((error) => {
    activityClearingReady = null;
    throw error;
  });
  return activityClearingReady;
}

// What Royal Mail last said about each parcel (task d912f632). Three columns: when they printed the
// label, when they took the parcel, and when we last asked. There is deliberately no delivery
// column, because Click & Drop has no delivery status to put in one, and an empty column called
// "delivered" would be read as "not delivered yet" rather than "we were never told".
//
// Same lazy shape and the same reason as the guards above: a deploy reaches the live code before
// anybody can press "Run Database Setup", and the read-only fast path matters because the local
// credential is deliberately not allowed to alter the live schema.
let royalMailStateReady: Promise<void> | null = null;

export function ensureRoyalMailParcelState(): Promise<void> {
  if (royalMailStateReady) return royalMailStateReady;
  const db = requireDb();
  royalMailStateReady = (async () => {
    const existing = await db`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders'
        AND column_name IN ('royal_mail_printed_on', 'royal_mail_shipped_on', 'royal_mail_checked_at')
    `;
    if (existing.length === 3) return;
    await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_printed_on TIMESTAMPTZ`;
    await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_shipped_on TIMESTAMPTZ`;
    await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_checked_at TIMESTAMPTZ`;
  })().catch((error) => {
    royalMailStateReady = null;
    throw error;
  });
  return royalMailStateReady;
}

/** @see OrderRow.account_link — defined in ../orderAccountLink.ts, alongside the one decision
 *  that produces it, so that decision can be run and proved on its own. */
export type { OrderAccountLink } from '../orderAccountLink';

export async function deleteOrder(orderNumber: string): Promise<boolean> {
  const db = requireDb();
  const rows = await db`DELETE FROM orders WHERE order_number = ${orderNumber} RETURNING order_number`;
  return rows.length > 0;
}

/**
 * The newest order placed with an email address. Website enquiries often omit
 * the order number, but the product on the most recent order can still give
 * PEARL the missing context. This is read-only and never changes an order.
 */
export async function findLatestOrderByEmail(email: string): Promise<OrderRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM orders
    WHERE lower(email) = lower(${email.trim()})
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return (rows[0] as OrderRow) ?? null;
}
