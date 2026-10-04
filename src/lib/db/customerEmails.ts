import { requireDb } from './client';

// ─── Customer email history (task b2084076) ─────────────────────────────────
// One row per email exchanged with a customer outside the website: messages
// staff send from the dashboard ('sent') and replies captured from the
// customer's own email ('received'). This exists because a customer replied
// to an order email and the reply lived only in the sales@ mailbox — the
// site had no record of the conversation under the customer at all.
//
// Rows are matched to a customer by id when one is known, and always carry
// the bare counterparty address, so history typed to an address BEFORE that
// person registered still shows up on their page afterwards (the lookup
// matches on either).

// 'draft' (task 72260d57): an email written but not sent, kept under the
// customer so it can be reopened, edited and sent any time. For drafts,
// our_address holds the chosen SENDER KEY (e.g. 'sales'), not an address —
// that is what the composer needs back to restore its dropdown.
export type CustomerEmailDirection = 'sent' | 'received' | 'draft';

export interface CustomerEmailRow {
  id: number;
  direction: CustomerEmailDirection;
  customer_id: number | null;
  /** The customer's address — who it went to ('sent') or came from ('received'). */
  email: string;
  /** Our address on the exchange — the from ('sent') or the mailbox it was addressed to ('received'). */
  our_address: string | null;
  subject: string;
  body_text: string;
  provider_id: string | null;
  /** A WG order reference spotted in the subject or body, for context. */
  order_ref: string | null;
  /**
   * The formatted email, exactly as the customer received it (task ce308493).
   *
   * Only the plain-text half used to be kept, which meant "show me the email you sent" could not
   * really be answered: what came back was a stripped-down shadow of it, not the thing with the
   * logo, the buttons and the tracking link. Null on older rows, which were saved before this
   * existed, and on anything sent without a formatted half.
   */
  body_html: string | null;
  created_at: string;
  email_type: string | null;
  delivery_status: string | null;
  delivery_updated_at: string | null;
}

// Created on first use as well as via Run Database Setup, mirroring the IP
// activity log: the webhook and the dashboard send must never fail on "the
// table does not exist yet".
let tableEnsured = false;
async function ensureTable(db: ReturnType<typeof requireDb>): Promise<void> {
  if (tableEnsured) return;
  await db`
    CREATE TABLE IF NOT EXISTS customer_emails (
      id SERIAL PRIMARY KEY,
      direction TEXT NOT NULL,
      customer_id INTEGER,
      email TEXT NOT NULL,
      our_address TEXT,
      subject TEXT NOT NULL DEFAULT '',
      body_text TEXT NOT NULL DEFAULT '',
      provider_id TEXT,
      order_ref TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS customer_emails_email_idx ON customer_emails (lower(email))`;
  await db`ALTER TABLE customer_emails ADD COLUMN IF NOT EXISTS email_type TEXT`;
  await db`ALTER TABLE customer_emails ADD COLUMN IF NOT EXISTS delivery_status TEXT`;
  await db`ALTER TABLE customer_emails ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMPTZ`;
  await db`ALTER TABLE customer_emails ADD COLUMN IF NOT EXISTS body_html TEXT`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS customer_emails_provider_id_unique ON customer_emails (provider_id) WHERE provider_id IS NOT NULL`;
  tableEnsured = true;
}

export async function recordCustomerEmail(params: {
  direction: CustomerEmailDirection;
  customerId: number | null;
  email: string;
  ourAddress: string | null;
  subject: string;
  bodyText: string;
  providerId?: string | null;
  orderRef?: string | null;
  emailType?: string | null;
  deliveryStatus?: string | null;
  bodyHtml?: string | null;
}): Promise<void> {
  const db = requireDb();
  await ensureTable(db);
  // A webhook retry delivers the same provider id twice — one row, not two.
  if (params.providerId) {
    const existing = await db`
      SELECT id FROM customer_emails WHERE provider_id = ${params.providerId} LIMIT 1
    `;
    if (existing.length) return;
  }
  await db`
    INSERT INTO customer_emails (direction, customer_id, email, our_address, subject, body_text, body_html, provider_id, order_ref, email_type, delivery_status, delivery_updated_at)
    VALUES (${params.direction}, ${params.customerId}, ${params.email.trim().toLowerCase()},
            ${params.ourAddress}, ${params.subject}, ${params.bodyText}, ${params.bodyHtml ?? null},
            ${params.providerId ?? null}, ${params.orderRef ?? null}, ${params.emailType ?? null},
            ${params.deliveryStatus ?? null}, ${params.deliveryStatus ? new Date().toISOString() : null})
    ON CONFLICT (provider_id) WHERE provider_id IS NOT NULL DO NOTHING
  `;
}

export async function updateCustomerEmailDelivery(providerId: string, status: string, occurredAt?: string | null): Promise<boolean> {
  const db = requireDb();
  await ensureTable(db);
  const parsedAt = occurredAt ? Date.parse(occurredAt) : NaN;
  const effectiveOccurredAt = Number.isFinite(parsedAt)
    ? new Date(parsedAt).toISOString()
    : new Date().toISOString();
  const rows = await db`
    UPDATE customer_emails
    SET delivery_status = ${status}, delivery_updated_at = ${effectiveOccurredAt}
    WHERE provider_id = ${providerId}
      AND (delivery_updated_at IS NULL OR delivery_updated_at <= ${effectiveOccurredAt})
    RETURNING id
  `;
  return rows.length > 0;
}

export async function listOrderEmailStatuses(orderRef: string): Promise<CustomerEmailRow[]> {
  const db = requireDb();
  await ensureTable(db);
  const rows = await db`
    SELECT * FROM customer_emails
    WHERE order_ref = ${orderRef} AND direction = 'sent'
    ORDER BY created_at DESC LIMIT 50
  `;
  return rows as CustomerEmailRow[];
}

// Save (or re-save) a draft under a customer. Passing `id` updates that
// draft in place; created_at is refreshed on every save so "when was this
// last saved" is what the history shows and an edited draft sits at the top.
export async function saveCustomerEmailDraft(params: {
  id?: number | null;
  customerId: number | null;
  email: string;
  senderKey: string;
  subject: string;
  bodyText: string;
}): Promise<number | null> {
  const db = requireDb();
  await ensureTable(db);
  if (params.id) {
    const rows = await db`
      UPDATE customer_emails
      SET subject = ${params.subject}, body_text = ${params.bodyText},
          our_address = ${params.senderKey}, created_at = now()
      WHERE id = ${params.id} AND direction = 'draft'
      RETURNING id
    `;
    if (rows.length) return Number((rows[0] as { id: number }).id);
    // The draft was discarded elsewhere in the meantime — fall through and
    // save what was typed as a fresh one rather than losing it.
  }
  const rows = await db`
    INSERT INTO customer_emails (direction, customer_id, email, our_address, subject, body_text)
    VALUES ('draft', ${params.customerId}, ${params.email.trim().toLowerCase()},
            ${params.senderKey}, ${params.subject}, ${params.bodyText})
    RETURNING id
  `;
  return rows.length ? Number((rows[0] as { id: number }).id) : null;
}

// Deliberately refuses to touch anything but a draft — sent and received
// rows are the permanent record.
export async function deleteCustomerEmailDraft(id: number): Promise<boolean> {
  const db = requireDb();
  await ensureTable(db);
  const rows = await db`DELETE FROM customer_emails WHERE id = ${id} AND direction = 'draft' RETURNING id`;
  return rows.length > 0;
}

// Everything exchanged with one person, newest first — by customer id OR by
// their address, so pre-registration history is not lost.
export async function listCustomerEmails(customerId: number, email: string): Promise<CustomerEmailRow[]> {
  const db = requireDb();
  await ensureTable(db);
  const rows = await db`
    SELECT * FROM customer_emails
    WHERE customer_id = ${customerId} OR lower(email) = ${email.trim().toLowerCase()}
    ORDER BY created_at DESC
    LIMIT 200
  `;
  return rows as CustomerEmailRow[];
}

// ─── Reading and removing one saved email (task ce308493) ───────────────────
// Kieran, 19 September 2026: "there must also be options to re-forward that email to a customer
// should the customer not receive that email or customer wants a copy of that email", and then:
// "There must also be an option to delete or edit saved emails too... if One member asks a
// question and we have that information already for another client in their email, we
// should be able to edit, copy, delete, do whatever to that email and use it for another member."

/** One saved email, including the formatted version, for reading and for sending again. */
export async function getCustomerEmail(id: number): Promise<CustomerEmailRow | null> {
  const db = requireDb();
  await ensureTable(db);
  const rows = await db`SELECT * FROM customer_emails WHERE id = ${id} LIMIT 1`;
  return (rows[0] as CustomerEmailRow) ?? null;
}

/**
 * Remove one saved email, of any kind.
 *
 * Wider than deleteCustomerEmailDraft on purpose, because Kieran asked to be able to clear out
 * saved emails, not only unsent drafts. It is a real delete and there is no undo, so the screen
 * asks first.
 *
 * WHAT IS DELIBERATELY NOT HERE IS AN EDIT. A 'sent' row is the record of what a customer was
 * actually sent, and a record that can be rewritten afterwards is no longer evidence of anything:
 * the next time somebody asks "what did we tell them", the honest answer would be "whatever it
 * says now". Reuse is handled by opening a copy in the composer instead, which is the thing that
 * was actually wanted — the same words, sent to somebody else, with the first email still saying
 * what it said. Drafts stay editable through saveCustomerEmailDraft, because a draft is not a
 * record of anything yet.
 */
export async function deleteCustomerEmail(id: number): Promise<boolean> {
  const db = requireDb();
  await ensureTable(db);
  const rows = await db`DELETE FROM customer_emails WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
