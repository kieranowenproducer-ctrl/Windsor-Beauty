import { randomBytes } from 'crypto';
import { requireDb } from './client';
import { deleteOrder, type OrderRow } from './orders';
import { parseSearchGroups } from '../adminSearch';
import { SEARCH_ALIAS_GROUPS } from '../searchAliases';
// Extracted verbatim from db.ts on 2026-08-16. Everything here is re-exported
// from '@/lib/db', so no call site changed.
//
// See src/lib/invoiceFulfillment.ts for how a paid invoice bridges into the
// existing orders/stock/Royal-Mail/email pipeline. This file is pure CRUD/data
// access for the `invoices` table itself.


/**
 * There is no migration step in this app: a new column exists only once some page happens to call
 * ensureSchema(). Deploy a column addition and, until that happens, every invoice save writes
 * against a column the live database does not have and fails outright.
 *
 * So: on a missing-column error ONLY (Postgres 42703), create the schema and try exactly once
 * more. Nothing else is retried — the same habit createOrder already uses, and for the same
 * reason. Added with shipping_recipient (task 77b818aa), which is the first column this table has
 * gained since it was written.
 */
async function withSchemaRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const e = err as { code?: unknown; message?: unknown } | null;
    const missingColumn = (e && typeof e === 'object' && e.code === '42703')
      || /column .* does not exist/i.test(e && typeof e.message === 'string' ? e.message : String(err ?? ''));
    if (!missingColumn) throw err;
    const { ensureSchema } = await import('./schema');
    await ensureSchema();
    return await run();
  }
}

export interface InvoiceLineItem {
  // 'trial' marks a line taken from the separate trial inventory. It is stored
  // like any other line, and every customer-facing document replaces its name
  // with 'Product 1', 'Product 2' and so on (task ae168547, src/lib/invoiceTrialLines.ts).
  type: 'product' | 'custom' | 'trial';
  slug?: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  /** Only meaningful for custom (non-catalogue) items — optional per-line weight override. */
  weightGrams?: number;
  /** Batch identifying code(s) allocated to this product, shown on the invoice. Stored in JSONB — no schema change. A line can carry more than one (e.g. two items from two batches). */
  batchCodes?: string[];
  /**
   * Set by anonymiseTrialLines on a trial line only: the fixed neutral name that trial product
   * dispatches under at Royal Mail, e.g. "Product 284" (task 9e2f4a11). Never stored on the
   * invoice itself and never rendered to a customer; it exists so the value can travel from the
   * point the trial id is still known to the order the invoice becomes.
   */
  fulfilmentRef?: string;
}

export interface InvoiceEditLogEntry {
  at: string;
  summary: string;
}

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
  /** Who the parcel is for, when that is not the person being invoiced. NULL = the customer. */
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
  // Royal Mail tracking from the invoice's fulfilled order, joined in by
  // listInvoices (not a native invoices column). Null until the order exists and
  // Click & Drop has assigned a tracking number.
  tracking_number?: string | null;
  tracking_url?: string | null;
  payment_method_used: 'fena' | 'paypal' | 'cash' | 'bank_transfer' | 'manual' | null;
  paypal_marked_paid_by: string | null;
  paypal_marked_paid_at: string | null;
  // Admin-set intent, before any payment happens — see ensureSchema.
  intended_payment_method: 'fena' | 'paypal' | 'cash' | 'bank_transfer' | 'manual' | null;
  fulfilment_type: 'royal_mail' | 'collection' | 'hand_delivered' | 'no_delivery' | 'other_manual';
  automation_flags: {
    sendPaymentLink: boolean;
    sendConfirmation: boolean;
    triggerRoyalMail: boolean;
    sendDispatchEmail: boolean;
  };
  public_token: string;
  // Customer-facing /pay/<public_token> page: the Fena link generated at
  // send time (reused, never re-minted per visit) and the durable record of
  // the customer ticking the T&C acknowledgement before paying.
  fena_payment_url: string | null;
  terms_accepted_at: string | null;
  terms_accepted_ip: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  edit_log: InvoiceEditLogEntry[];
  created_at: string;
  updated_at: string;
}

function randomToken(): string {
  return randomBytes(24).toString('hex');
}

export interface InvoiceWriteParams {
  invoiceNumber: string;
  customerName: string;
  email: string;
  phone?: string | null;
  companyName?: string | null;
  billingLine1?: string | null;
  billingLine2?: string | null;
  billingCity?: string | null;
  billingPostcode?: string | null;
  billingCountry?: string | null;
  shippingLine1?: string | null;
  shippingLine2?: string | null;
  shippingCity?: string | null;
  shippingPostcode?: string | null;
  shippingCountry?: string | null;
  /** Optional name for the parcel when it is not going to the person being invoiced. */
  shippingRecipient?: string | null;
  invoiceDate?: string;
  dueDate?: string | null;
  subject?: string | null;
  message?: string | null;
  footerText?: string | null;
  internalNotes?: string | null;
  customerNotes?: string | null;
  lineItems: InvoiceLineItem[];
  shippingLabel?: string | null;
  shippingAmount: number;
  discountCode?: string | null;
  discountAmount: number;
  subtotal: number;
  total: number;
  intendedPaymentMethod?: InvoiceRow['intended_payment_method'];
  fulfilmentType?: InvoiceRow['fulfilment_type'];
  automationFlags?: InvoiceRow['automation_flags'];
}

const DEFAULT_AUTOMATION_FLAGS: InvoiceRow['automation_flags'] = {
  sendPaymentLink: true, sendConfirmation: true, triggerRoyalMail: true, sendDispatchEmail: true,
};

export async function createInvoice(params: InvoiceWriteParams): Promise<InvoiceRow> {
  const db = requireDb();
  const rows = await withSchemaRetry(() => db`
    INSERT INTO invoices (
      invoice_number, customer_name, email, phone, company_name,
      billing_line1, billing_line2, billing_city, billing_postcode, billing_country,
      shipping_line1, shipping_line2, shipping_city, shipping_postcode, shipping_country,
      shipping_recipient,
      invoice_date, due_date, subject, message, footer_text, internal_notes, customer_notes,
      line_items, shipping_label, shipping_amount, discount_code, discount_amount,
      subtotal, total, public_token, intended_payment_method, fulfilment_type, automation_flags
    )
    VALUES (
      ${params.invoiceNumber}, ${params.customerName}, ${params.email}, ${params.phone ?? null}, ${params.companyName ?? null},
      ${params.billingLine1 ?? null}, ${params.billingLine2 ?? null}, ${params.billingCity ?? null}, ${params.billingPostcode ?? null}, ${params.billingCountry ?? null},
      ${params.shippingLine1 ?? null}, ${params.shippingLine2 ?? null}, ${params.shippingCity ?? null}, ${params.shippingPostcode ?? null}, ${params.shippingCountry ?? null},
      ${params.shippingRecipient ?? null},
      ${params.invoiceDate ?? new Date().toISOString().slice(0, 10)}, ${params.dueDate ?? null},
      ${params.subject ?? null}, ${params.message ?? null}, ${params.footerText ?? null}, ${params.internalNotes ?? null}, ${params.customerNotes ?? null},
      ${JSON.stringify(params.lineItems)}, ${params.shippingLabel ?? null}, ${params.shippingAmount}, ${params.discountCode ?? null}, ${params.discountAmount},
      ${params.subtotal}, ${params.total}, ${randomToken()},
      ${params.intendedPaymentMethod ?? null}, ${params.fulfilmentType ?? 'royal_mail'}, ${JSON.stringify(params.automationFlags ?? DEFAULT_AUTOMATION_FLAGS)}
    )
    RETURNING *
  `);
  return rows[0] as InvoiceRow;
}

export async function findInvoiceById(id: number): Promise<InvoiceRow | null> {
  const db = requireDb();
  const rows = await db`SELECT * FROM invoices WHERE id = ${id} LIMIT 1`;
  return (rows[0] as InvoiceRow) ?? null;
}

export async function findInvoiceByPublicToken(token: string): Promise<InvoiceRow | null> {
  const db = requireDb();
  const rows = await db`SELECT * FROM invoices WHERE public_token = ${token} LIMIT 1`;
  return (rows[0] as InvoiceRow) ?? null;
}

export async function setInvoiceFenaPaymentUrl(id: number, url: string): Promise<void> {
  const db = requireDb();
  await db`UPDATE invoices SET fena_payment_url = ${url}, updated_at = now() WHERE id = ${id}`;
}

// Idempotent: the first acceptance wins — re-ticking the box (second tab,
// page refresh) never overwrites the original timestamp/IP evidence.
export async function recordInvoiceTermsAcceptance(id: number, ip: string): Promise<void> {
  const db = requireDb();
  await db`
    UPDATE invoices
    SET terms_accepted_at = COALESCE(terms_accepted_at, now()),
        terms_accepted_ip = COALESCE(terms_accepted_ip, ${ip}),
        updated_at = now()
    WHERE id = ${id}
  `;
}

export async function findInvoiceByOrderNumber(orderNumber: string): Promise<InvoiceRow | null> {
  const db = requireDb();
  const rows = await db`SELECT * FROM invoices WHERE order_number = ${orderNumber} LIMIT 1`;
  return (rows[0] as InvoiceRow) ?? null;
}

/**
 * What the Invoices list can be sorted by. `newest` is the long-standing default and stays the
 * default, so nobody's screen changes until they choose something else.
 */
export type InvoiceSort = 'newest' | 'oldest' | 'name_az' | 'name_za' | 'total_high' | 'total_low' | 'due_soon';

export const INVOICE_SORTS: InvoiceSort[] = ['newest', 'oldest', 'name_az', 'name_za', 'total_high', 'total_low', 'due_soon'];

export interface InvoiceListFilters {
  status?: string;
  /** What was typed in the search box. Every word has to be found: see src/lib/adminSearch.ts. */
  q?: string;
  sort?: InvoiceSort;
  /** Inclusive day range on when the invoice was created, as YYYY-MM-DD read in UK time. */
  from?: string;
  to?: string;
}

/** A plain YYYY-MM-DD day, which is all the date boxes ever send. Anything else is ignored. */
function isIsoDay(value: string | undefined | null): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function listInvoices(filters?: InvoiceListFilters): Promise<InvoiceRow[]> {
  const db = requireDb();
  const status = filters?.status && filters.status !== 'all' ? filters.status : null;

  // Multi-word search. Kieran, 2026-09-24: typing "Amber Reta" found nothing, because the old query
  // looked for that whole phrase inside one column at a time. Now every word must appear somewhere
  // on the invoice and they can be in different places, so a customer plus a product works.
  // The words are split by the one shared helper Orders uses, so the two screens cannot drift.
  //
  // Each word arrives as a LIST: the word itself plus any words that mean the same thing. One of
  // each list has to be found, and every list has to be satisfied. src/lib/searchAliases.ts holds
  // the words that mean the same thing, and is empty for now.
  const groups = parseSearchGroups(filters?.q ?? '', SEARCH_ALIAS_GROUPS);
  const groupsJson = groups.length > 0 ? JSON.stringify(groups.map(g => g.any)) : null;

  const from = isIsoDay(filters?.from) ? filters.from : null;
  const to = isIsoDay(filters?.to) ? filters.to : null;
  const sort: InvoiceSort = filters?.sort && INVOICE_SORTS.includes(filters.sort) ? filters.sort : 'newest';

  // Pull the Royal Mail tracking number straight from the invoice's fulfilled
  // order (invoices.order_number -> orders.order_number). LEFT JOIN so an invoice
  // that hasn't been fulfilled into an order yet simply has null tracking. This
  // is what lets the Invoices view show the tracking number alongside Orders.
  //
  // `hay` is everything on the invoice worth searching, glued into one block of text and built once
  // per row. Line items are in there, which is what makes a product name findable.
  //
  // The sort is written out as one CASE per choice rather than pasted in as text: this is a
  // tagged-template query, so building ORDER BY by joining strings would be the one place in this
  // file where a typed value could turn into SQL. Not worth it for seven fixed choices.
  const rows = await withSchemaRetry(() => db`
    SELECT i.*, o.tracking_number, o.tracking_url
    FROM invoices i
    LEFT JOIN orders o ON o.order_number = i.order_number
    CROSS JOIN LATERAL (
      -- translate() flattens the common accents, so typing "jose" finds José here exactly as it
      -- does on Orders. Orders flattens every accent there is (JavaScript can); this covers the
      -- Western European ones, which is as far as Postgres goes without the unaccent extension.
      SELECT translate(lower(concat_ws(' | ',
        i.invoice_number, i.customer_name, i.company_name, i.email, i.phone,
        i.order_number, o.tracking_number, i.status, i.subject,
        i.billing_line1, i.billing_city, i.billing_postcode,
        i.shipping_recipient, i.shipping_line1, i.shipping_city, i.shipping_postcode,
        i.discount_code, i.internal_notes, i.customer_notes,
        (SELECT string_agg(concat_ws(' ', li->>'name', li->>'description', li->>'slug', li->>'batchCodes'), ' ')
           FROM jsonb_array_elements(i.line_items) AS li)
      )), 'áàâäãåéèêëíìîïóòôöõúùûüýÿñçšžłđ', 'aaaaaaeeeeiiiiooooouuuuyyncszld') AS text
    ) AS hay
    WHERE (${status}::text IS NULL OR i.status = ${status})
      AND (${from}::text IS NULL OR (i.created_at AT TIME ZONE 'Europe/London')::date >= ${from}::date)
      AND (${to}::text   IS NULL OR (i.created_at AT TIME ZONE 'Europe/London')::date <= ${to}::date)
      AND (
        ${groupsJson}::text IS NULL
        OR NOT EXISTS (
          -- "No word is missing" is the same as "every word was found", and phrasing it that way
          -- keeps it to one subquery however many words were typed.
          SELECT 1
          FROM jsonb_array_elements(${groupsJson}::jsonb) AS grp
          WHERE NOT EXISTS (
            -- ...and a word counts as found if ANY of its short names is there.
            SELECT 1
            FROM jsonb_array_elements_text(grp) AS term
            WHERE strpos(hay.text, term) > 0
              -- Or with punctuation and spacing stripped off both sides, so "motsc" still finds
              -- MOTS-C. Mirrors matchesSearchGroups() in src/lib/adminSearch.ts.
              OR strpos(
                regexp_replace(hay.text, '[^a-z0-9]+', '', 'g'),
                regexp_replace(term, '[^a-z0-9]+', '', 'g')
              ) > 0
          )
        )
      )
    ORDER BY
      CASE WHEN ${sort}::text = 'name_az'    THEN lower(i.customer_name) END ASC,
      CASE WHEN ${sort}::text = 'name_za'    THEN lower(i.customer_name) END DESC,
      CASE WHEN ${sort}::text = 'total_high' THEN i.total END DESC,
      CASE WHEN ${sort}::text = 'total_low'  THEN i.total END ASC,
      CASE WHEN ${sort}::text = 'due_soon'   THEN i.due_date END ASC NULLS LAST,
      CASE WHEN ${sort}::text = 'oldest'     THEN i.created_at END ASC,
      i.created_at DESC
    LIMIT 300
  `);
  return rows as InvoiceRow[];
}


// Full-row overwrite, mirroring the create params shape — the admin edit form
// always submits the complete invoice, so there's no partial-patch ambiguity
// to resolve here. Business rules (locking financial fields once paid,
// appending to edit_log once sent) are enforced by the API route, which has
// the context (old vs. new values, adjustment flag) to do so meaningfully —
// this function just writes whatever it's given.
export async function updateInvoice(id: number, params: InvoiceWriteParams): Promise<InvoiceRow | null> {
  const db = requireDb();
  const rows = await withSchemaRetry(() => db`
    UPDATE invoices SET
      invoice_number = ${params.invoiceNumber},
      customer_name = ${params.customerName},
      email = ${params.email},
      phone = ${params.phone ?? null},
      company_name = ${params.companyName ?? null},
      billing_line1 = ${params.billingLine1 ?? null},
      billing_line2 = ${params.billingLine2 ?? null},
      billing_city = ${params.billingCity ?? null},
      billing_postcode = ${params.billingPostcode ?? null},
      billing_country = ${params.billingCountry ?? null},
      shipping_line1 = ${params.shippingLine1 ?? null},
      shipping_line2 = ${params.shippingLine2 ?? null},
      shipping_city = ${params.shippingCity ?? null},
      shipping_postcode = ${params.shippingPostcode ?? null},
      shipping_country = ${params.shippingCountry ?? null},
      shipping_recipient = ${params.shippingRecipient ?? null},
      invoice_date = ${params.invoiceDate ?? new Date().toISOString().slice(0, 10)},
      due_date = ${params.dueDate ?? null},
      subject = ${params.subject ?? null},
      message = ${params.message ?? null},
      footer_text = ${params.footerText ?? null},
      internal_notes = ${params.internalNotes ?? null},
      customer_notes = ${params.customerNotes ?? null},
      line_items = ${JSON.stringify(params.lineItems)},
      shipping_label = ${params.shippingLabel ?? null},
      shipping_amount = ${params.shippingAmount},
      discount_code = ${params.discountCode ?? null},
      discount_amount = ${params.discountAmount},
      subtotal = ${params.subtotal},
      total = ${params.total},
      intended_payment_method = ${params.intendedPaymentMethod ?? null},
      fulfilment_type = ${params.fulfilmentType ?? 'royal_mail'},
      automation_flags = ${JSON.stringify(params.automationFlags ?? DEFAULT_AUTOMATION_FLAGS)},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `);
  return (rows[0] as InvoiceRow) ?? null;
}

export async function appendInvoiceEditLog(id: number, summary: string): Promise<void> {
  const db = requireDb();
  const entry: InvoiceEditLogEntry = { at: new Date().toISOString(), summary };
  await db`
    UPDATE invoices
    SET edit_log = edit_log || ${JSON.stringify([entry])}::jsonb
    WHERE id = ${id}
  `;
}

// Creates a fresh draft copy of an invoice — new number, new public token,
// no status/order/payment history carried over.
export async function duplicateInvoice(id: number, newInvoiceNumber: string): Promise<InvoiceRow | null> {
  const source = await findInvoiceById(id);
  if (!source) return null;
  return createInvoice({
    invoiceNumber: newInvoiceNumber,
    customerName: source.customer_name,
    email: source.email,
    phone: source.phone,
    companyName: source.company_name,
    billingLine1: source.billing_line1,
    billingLine2: source.billing_line2,
    billingCity: source.billing_city,
    billingPostcode: source.billing_postcode,
    billingCountry: source.billing_country,
    shippingLine1: source.shipping_line1,
    shippingLine2: source.shipping_line2,
    shippingCity: source.shipping_city,
    shippingPostcode: source.shipping_postcode,
    shippingCountry: source.shipping_country,
    shippingRecipient: source.shipping_recipient,
    dueDate: null,
    subject: source.subject,
    message: source.message,
    footerText: source.footer_text,
    internalNotes: source.internal_notes,
    customerNotes: source.customer_notes,
    lineItems: source.line_items,
    shippingLabel: source.shipping_label,
    shippingAmount: Number(source.shipping_amount),
    discountCode: source.discount_code,
    discountAmount: Number(source.discount_amount),
    subtotal: Number(source.subtotal),
    total: Number(source.total),
    intendedPaymentMethod: source.intended_payment_method,
    fulfilmentType: source.fulfilment_type,
    automationFlags: source.automation_flags,
  });
}

// Admin-driven delete from the Invoices list — works on any status (not just
// drafts; the edit page's own "Delete Draft" button stays draft-only at the
// UI layer, but this is the bulk-delete path). Cascades to the linked order
// if one was ever created, so a deleted invoice also disappears from Orders
// and Dispatch rather than leaving an orphaned order behind with no invoice
// to trace it back to.
export async function deleteInvoice(id: number): Promise<boolean> {
  const db = requireDb();
  const [invoice] = await db`SELECT order_number FROM invoices WHERE id = ${id} LIMIT 1`;
  if (!invoice) return false;
  if (invoice.order_number) {
    await deleteOrder(invoice.order_number);
  }
  const rows = await db`DELETE FROM invoices WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function markInvoiceSent(id: number, orderNumber: string): Promise<InvoiceRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE invoices
    SET status = 'sent', order_number = ${orderNumber}, sent_at = now(), updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as InvoiceRow) ?? null;
}

// Only advances 'sent' -> 'viewed' — never downgrades a later state (e.g. an
// invoice that's already paid shouldn't flip back to "viewed" just because
// the tracking pixel loads after the fact, e.g. someone reopening the email).
export async function markInvoiceViewed(id: number): Promise<void> {
  const db = requireDb();
  await db`
    UPDATE invoices
    SET status = 'viewed', viewed_at = COALESCE(viewed_at, now())
    WHERE id = ${id} AND status = 'sent'
  `;
}

// Cancels a sent-but-unpaid invoice (e.g. the customer no longer wants it).
// Mirrors deleteInvoice's draft-only guard with the inverse condition — never
// cancels an invoice that's already paid, so a paid invoice's record/order
// link is never silently invalidated.
export async function cancelInvoice(id: number): Promise<InvoiceRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE invoices
    SET status = 'cancelled', cancelled_at = now(), updated_at = now()
    WHERE id = ${id} AND status != 'paid'
    RETURNING *
  `;
  return (rows[0] as InvoiceRow) ?? null;
}

export async function markInvoicePaid(
  id: number,
  paidVia: 'fena' | 'paypal' | 'cash' | 'bank_transfer' | 'manual',
  options?: { paypalMarkedPaidBy?: string; paypalFeeAmount?: number }
): Promise<InvoiceRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE invoices
    SET status = 'paid',
        paid_at = now(),
        payment_method_used = ${paidVia},
        paypal_marked_paid_by = COALESCE(${options?.paypalMarkedPaidBy ?? null}, paypal_marked_paid_by),
        paypal_marked_paid_at = CASE WHEN ${paidVia} = 'paypal' THEN now() ELSE paypal_marked_paid_at END,
        paypal_fee_amount = ${options?.paypalFeeAmount ?? 0},
        updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as InvoiceRow) ?? null;
}

// Applies the PayPal surcharge to an invoice-spawned order once we know the
// customer actually paid via PayPal — see calculateInvoicePaypalFee() in
// src/lib/invoices.ts and onInvoiceOrderPaid() in invoiceFulfillment.ts for
// why this happens at payment time rather than when the order is created.
export async function applyInvoicePaypalFee(orderNumber: string, fee: number): Promise<OrderRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE orders
    SET total = total + ${fee}, paypal_fee = ${fee}
    WHERE order_number = ${orderNumber}
    RETURNING *
  `;
  return (rows[0] as OrderRow) ?? null;
}
