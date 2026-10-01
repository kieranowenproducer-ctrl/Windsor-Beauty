import { randomBytes } from 'crypto';
import { requireDb } from './client';
import { ensureOrderPaymentConfirmationTracking } from './orders';
import { isSendableEmailAddress } from '../emailAddress';
// Extracted verbatim from db.ts on 2026-07-05 (see db/client.ts).

// ─── Email marketing ────────────────────────────────────────────────────────

export interface MarketingContactRow {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  customer_id: number | null;
  source: string;
  consent: boolean;
  opted_in_at: string;
  unsubscribed_at: string | null;
  unsubscribe_token: string;
  created_at: string;
  updated_at: string;
}

export interface MarketingCampaignRow {
  id: number;
  subject: string;
  body_html: string;
  // The raw text the admin typed, kept so a past campaign can be loaded back
  // into the composer for editing (task 842923ab). Null on campaigns sent
  // before this column existed — reconstruct from body_html for those.
  body_text: string | null;
  // 'sent' | 'draft'. Saving never updates a row: a draft saved again, or a
  // reused campaign sent again, is always a NEW row with its own timestamp,
  // so the version history is never overwritten.
  status: string;
  // Which From address the campaign used ('no-reply' | 'marketing'), so
  // reusing it restores the same choice. Null on older rows.
  sender: string | null;
  // The gold button and the band above the logo. Null means the defaults
  // ("Shop Now" to the shop, under a "Special Offer" band) — see
  // lib/marketingEmail.ts resolveMarketingCta.
  cta_label: string | null;
  cta_url: string | null;
  header_label: string | null;
  recipient_count: number;
  success_count: number;
  failure_count: number;
  sent_at: string;
}

// Adds or refreshes an opted-in contact. Called whenever a customer ticks the
// marketing consent checkbox — at registration, in account settings, on the
// discount-signup popup, or at checkout. Re-subscribing a previously
// unsubscribed email clears `unsubscribed_at` and resets `opted_in_at` so the
// consent timestamp always reflects the most recent opt-in. Existing
// name/phone/customer link are preserved when the new values are unknown
// (e.g. the discount popup only ever supplies an email).
export async function upsertMarketingContact(params: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  customerId?: number | null;
  source: string;
}): Promise<MarketingContactRow | null> {
  const db = requireDb();
  const email = params.email.trim().toLowerCase();
  // Only ever "is it empty" before, so anything a form let through was stored
  // and then emailed forever. A checkout test on 2026-06-21 put the literal
  // text "hhh" on this list, and every campaign to the whole list failed for it
  // and lit the red banner on the admin dashboard. Every caller ignores the
  // return value, so refusing here simply means no contact row is created.
  if (!isSendableEmailAddress(email)) return null;
  const token = randomBytes(24).toString('hex');

  const rows = await db`
    INSERT INTO marketing_contacts (
      email, first_name, last_name, phone, customer_id, source, consent, opted_in_at, unsubscribe_token
    )
    VALUES (
      ${email}, ${params.firstName ?? null}, ${params.lastName ?? null}, ${params.phone ?? null},
      ${params.customerId ?? null}, ${params.source}, TRUE, now(), ${token}
    )
    ON CONFLICT (email) DO UPDATE SET
      first_name = COALESCE(EXCLUDED.first_name, marketing_contacts.first_name),
      last_name = COALESCE(EXCLUDED.last_name, marketing_contacts.last_name),
      phone = COALESCE(EXCLUDED.phone, marketing_contacts.phone),
      customer_id = COALESCE(EXCLUDED.customer_id, marketing_contacts.customer_id),
      consent = TRUE,
      opted_in_at = CASE WHEN marketing_contacts.consent THEN marketing_contacts.opted_in_at ELSE now() END,
      unsubscribed_at = NULL,
      updated_at = now()
    RETURNING *
  `;
  // Opting in anywhere also records it on the customer account, so the
  // Customers page and the Email Marketing page always agree (task 99476dc9).
  // Harmless when the email belongs to a signup with no account yet.
  await db`
    UPDATE customers SET marketing_consent = TRUE WHERE lower(email) = ${email}
  `;
  return (rows[0] as MarketingContactRow) ?? null;
}

// Used when a customer unticks marketing consent in their account settings —
// keeps the contact row (and its history) but marks it unsubscribed so it's
// excluded from future sends.
//
// Writes the same answer onto the customer record as well (task 99476dc9).
// Marketing consent was stored in two places that nothing kept in step, so the
// Customers page could say "Marketing: Yes" for somebody the Email Marketing
// page had down as unsubscribed. One press, both rows, no disagreement.
export async function setMarketingConsentByEmail(email: string, consent: boolean): Promise<void> {
  const db = requireDb();
  await db`
    UPDATE marketing_contacts
    SET consent = ${consent},
        unsubscribed_at = ${consent ? null : new Date().toISOString()},
        updated_at = now()
    WHERE lower(email) = lower(${email})
  `;
  await db`
    UPDATE customers SET marketing_consent = ${consent} WHERE lower(email) = lower(${email})
  `;
}

/**
 * Put the marketing list and the customer list back in step (task 99476dc9).
 *
 * These are two tables holding one fact, and nothing joined them: `customers`
 * is written at registration, checkout and by the admin edit, while
 * `marketing_contacts` was only ever written by five specific opt-in moments.
 * The result on the live shop was 21 of 53 customers with no contact row at
 * all — 13 of them with consent recorded on their own account — so real
 * buyers were invisible on the Email Marketing page and could not be written
 * to. A further 20 contacts had no name stored even though the matching
 * customer had one.
 *
 * Idempotent, and deliberately narrow about consent:
 *   - a contact row is only ever CREATED for a customer whose own record
 *     already says marketing_consent = TRUE. This propagates a consent that
 *     exists; it never invents one.
 *   - consent on an EXISTING row is never touched, so an unsubscribe can
 *     never be undone by this running.
 *   - the opt-in date is the date they registered and ticked the box, not
 *     today, because today would be a false record.
 */
export async function syncMarketingContactsFromCustomers(): Promise<{ created: number; filled: number; aligned: number }> {
  const db = requireDb();

  // gen_random_uuid() is core Postgres (13+), so this needs no extension —
  // two of them stripped of dashes is a 64-character random token, the same
  // shape randomBytes(24).toString('hex') produces above.
  const created = await db`
    INSERT INTO marketing_contacts (
      email, first_name, last_name, phone, customer_id, source, consent, opted_in_at, unsubscribe_token
    )
    SELECT
      lower(c.email), c.first_name, c.last_name, c.phone, c.id, 'customer_account', TRUE, c.created_at,
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
    FROM customers c
    WHERE c.marketing_consent = TRUE
      AND NOT EXISTS (SELECT 1 FROM marketing_contacts m WHERE lower(m.email) = lower(c.email))
    ON CONFLICT (email) DO NOTHING
    RETURNING id
  `;

  // Names the contact row never got. COALESCE only ever fills a blank, so a
  // name somebody edited on the contact itself is never overwritten by the
  // customer record.
  const filled = await db`
    UPDATE marketing_contacts m
    SET first_name  = COALESCE(m.first_name, c.first_name),
        last_name   = COALESCE(m.last_name, c.last_name),
        phone       = COALESCE(m.phone, c.phone),
        customer_id = COALESCE(m.customer_id, c.id),
        updated_at  = now()
    FROM customers c
    WHERE lower(c.email) = lower(m.email)
      AND (
        (m.first_name IS NULL AND c.first_name IS NOT NULL) OR
        (m.last_name  IS NULL AND c.last_name  IS NOT NULL) OR
        (m.phone      IS NULL AND c.phone      IS NOT NULL) OR
        m.customer_id IS NULL
      )
    RETURNING m.id
  `;

  // And the other direction. Somebody who opted in through the discount popup
  // has an active marketing record but a customer record that still says no,
  // so the Customers page said "Marketing: No" for a person the Email
  // Marketing page was quite correctly about to email. The marketing record is
  // what decides who is written to, so the customer record is made to match it,
  // never the reverse. Nothing about WHO gets emailed changes here: it only
  // stops the two screens contradicting each other.
  const aligned = await db`
    UPDATE customers c
    SET marketing_consent = (m.consent AND m.unsubscribed_at IS NULL)
    FROM marketing_contacts m
    WHERE lower(c.email) = lower(m.email)
      AND c.marketing_consent <> (m.consent AND m.unsubscribed_at IS NULL)
    RETURNING c.id
  `;

  return { created: created.length, filled: filled.length, aligned: aligned.length };
}

// A customer's email is what links them to their contact row, so changing it
// in the admin panel has to carry the contact row with it — otherwise they
// stay on the mailing list under an address they no longer use, and a second
// row appears the next time they opt in anywhere.
export async function renameMarketingContactEmail(oldEmail: string, newEmail: string): Promise<void> {
  const db = requireDb();
  const from = oldEmail.trim().toLowerCase();
  const to = newEmail.trim().toLowerCase();
  if (!from || !to || from === to) return;
  await db`
    UPDATE marketing_contacts
    SET email = ${to}, updated_at = now()
    WHERE lower(email) = ${from}
      AND NOT EXISTS (SELECT 1 FROM marketing_contacts m2 WHERE lower(m2.email) = ${to})
  `;
}

export async function listMarketingContacts(): Promise<MarketingContactRow[]> {
  const db = requireDb();
  const rows = await db`SELECT * FROM marketing_contacts ORDER BY created_at DESC`;
  return rows as MarketingContactRow[];
}

// A contact row as the admin page shows it, plus the two things that page
// needs and the bare table cannot answer: whether this person exists only as
// a customer (no contact row at all), and which customer they are so the
// page can link to them.
export interface MarketingContactListRow extends MarketingContactRow {
  // TRUE = there is no marketing_contacts row for this person; the row you are
  // looking at was built from their customer record. By construction that only
  // happens for a customer who has NOT consented, because sync above gives
  // every consenting customer a real row.
  customer_only: boolean;
  order_count: number;
}

/**
 * The list behind the Email Marketing page (task 99476dc9): every marketing
 * contact AND every customer, one row per person, so it holds exactly the
 * same people as the Customers page.
 *
 * Names are resolved from the customer record when the contact row has none,
 * which is why the page stopped showing bare email addresses with a dash
 * where the name should be.
 */
export async function listMarketingContactsForAdmin(): Promise<MarketingContactListRow[]> {
  await ensureOrderPaymentConfirmationTracking();
  const db = requireDb();
  const rows = await db`
    SELECT
      m.id,
      m.email,
      COALESCE(m.first_name, c.first_name) AS first_name,
      COALESCE(m.last_name,  c.last_name)  AS last_name,
      COALESCE(m.phone,      c.phone)      AS phone,
      COALESCE(m.customer_id, c.id)        AS customer_id,
      m.source, m.consent, m.opted_in_at, m.unsubscribed_at, m.unsubscribe_token,
      m.created_at, m.updated_at,
      FALSE AS customer_only,
      COALESCE(c.order_count, 0)::int AS order_count
    FROM marketing_contacts m
    -- LATERAL, not a plain join: prefer the customer this contact is actually
    -- linked to, and return at most one either way.
    LEFT JOIN LATERAL (
      SELECT c.id, c.first_name, c.last_name, c.phone,
             (SELECT count(*)::int FROM orders o
               WHERE (o.customer_id = c.id OR lower(o.email) = lower(c.email))
                 AND o.payment_confirmed_at IS NOT NULL) AS order_count
      FROM customers c
      WHERE c.id = m.customer_id OR lower(c.email) = lower(m.email)
      ORDER BY (c.id = m.customer_id) DESC
      LIMIT 1
    ) c ON TRUE

    UNION ALL

    -- Customers with no contact row. They appear so the two pages hold the
    -- same people, and they are shown as not on the mailing list, which is
    -- the truth: there is no consent recorded and no unsubscribe link, so
    -- nothing can be sent to them from here.
    SELECT
      0 AS id,
      c.email, c.first_name, c.last_name, c.phone, c.id AS customer_id,
      'customer_account' AS source,
      -- What their own record says. After the sync above has run, everybody in
      -- this half is somebody who said no, so this is FALSE in normal running.
      -- Keeping the real value means a failed sync shows up rather than hiding.
      c.marketing_consent AS consent,
      c.created_at AS opted_in_at,
      NULL AS unsubscribed_at,
      '' AS unsubscribe_token,
      c.created_at, c.created_at AS updated_at,
      TRUE AS customer_only,
      (SELECT count(*)::int FROM orders o
        WHERE (o.customer_id = c.id OR lower(o.email) = lower(c.email))
          AND o.payment_confirmed_at IS NOT NULL) AS order_count
    FROM customers c
    WHERE NOT EXISTS (SELECT 1 FROM marketing_contacts m WHERE lower(m.email) = lower(c.email))

    ORDER BY created_at DESC
  `;
  return rows as MarketingContactListRow[];
}

// Authoritative send list — only contacts who have consented and have not
// unsubscribed. Used by the campaign-send endpoint; never exposed directly.
export async function listOptedInMarketingContacts(): Promise<MarketingContactRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM marketing_contacts WHERE consent = TRUE AND unsubscribed_at IS NULL ORDER BY email
  `;
  return rows as MarketingContactRow[];
}

/**
 * Look up a contact WITHOUT changing anything.
 *
 * Deliberately not upsertMarketingContact: that sets consent = TRUE and clears
 * unsubscribed_at, so calling it merely to read somebody's unsubscribe token would
 * silently re-subscribe a person who had opted out. This is read only.
 *
 * Used by the launch and announcement sends to put a working one-click unsubscribe link
 * in bulk mail that previously had none.
 */
export async function findMarketingContactByEmail(email: string): Promise<MarketingContactRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM marketing_contacts WHERE lower(email) = lower(${email.trim()}) LIMIT 1
  `;
  return (rows[0] as MarketingContactRow) ?? null;
}

export async function findMarketingContactByToken(token: string): Promise<MarketingContactRow | null> {
  const db = requireDb();
  const rows = await db`SELECT * FROM marketing_contacts WHERE unsubscribe_token = ${token} LIMIT 1`;
  return (rows[0] as MarketingContactRow) ?? null;
}

// Public unsubscribe link target — token-based so recipients don't need to
// sign in to opt out.
export async function unsubscribeMarketingContactByToken(token: string): Promise<MarketingContactRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE marketing_contacts
    SET consent = FALSE, unsubscribed_at = now(), updated_at = now()
    WHERE unsubscribe_token = ${token}
    RETURNING *
  `;
  const contact = (rows[0] as MarketingContactRow) ?? null;
  // Carry the opt-out onto their customer record too (task 99476dc9), or the
  // Customers page would go on showing "Marketing: Yes" for somebody who has
  // just pressed unsubscribe.
  if (contact) {
    await db`
      UPDATE customers SET marketing_consent = FALSE WHERE lower(email) = lower(${contact.email})
    `;
  }
  return contact;
}

export async function deleteMarketingContact(id: number): Promise<boolean> {
  const db = requireDb();
  const rows = await db`DELETE FROM marketing_contacts WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

// Reuse/edit columns (task 842923ab), added lazily like `recipients` below.
// body_text is the editable original; status separates drafts from sends;
// sender remembers the From choice.
let reuseColumnsEnsured = false;
async function ensureReuseColumns(): Promise<void> {
  if (reuseColumnsEnsured) return;
  const db = requireDb();
  await db`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS body_text TEXT`;
  await db`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent'`;
  await db`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS sender TEXT`;
  // The gold button and the band above the logo, chosen per campaign. Null on
  // every row written before this existed, which reads as "use the defaults",
  // so old campaigns reuse exactly as they always did.
  await db`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS cta_label TEXT`;
  await db`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS cta_url TEXT`;
  await db`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS header_label TEXT`;
  reuseColumnsEnsured = true;
}

export async function recordMarketingCampaign(params: {
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  sender?: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  headerLabel?: string | null;
  recipientCount: number;
  successCount: number;
  failureCount: number;
}): Promise<MarketingCampaignRow | null> {
  const db = requireDb();
  await ensureReuseColumns();
  const rows = await db`
    INSERT INTO marketing_campaigns (subject, body_html, body_text, sender, cta_label, cta_url, header_label, status, recipient_count, success_count, failure_count)
    VALUES (${params.subject}, ${params.bodyHtml}, ${params.bodyText ?? null}, ${params.sender ?? null}, ${params.ctaLabel ?? null}, ${params.ctaUrl ?? null}, ${params.headerLabel ?? null}, 'sent', ${params.recipientCount}, ${params.successCount}, ${params.failureCount})
    RETURNING *
  `;
  return (rows[0] as MarketingCampaignRow) ?? null;
}

// Saving a draft ALWAYS inserts a new row (task 842923ab): edits never
// replace what they were edited from, so every saved version keeps its own
// date and time.
export async function saveMarketingDraft(params: {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  sender?: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  headerLabel?: string | null;
}): Promise<MarketingCampaignRow | null> {
  const db = requireDb();
  await ensureReuseColumns();
  const rows = await db`
    INSERT INTO marketing_campaigns (subject, body_html, body_text, sender, cta_label, cta_url, header_label, status, recipient_count, success_count, failure_count)
    VALUES (${params.subject}, ${params.bodyHtml}, ${params.bodyText}, ${params.sender ?? null}, ${params.ctaLabel ?? null}, ${params.ctaUrl ?? null}, ${params.headerLabel ?? null}, 'draft', 0, 0, 0)
    RETURNING *
  `;
  return (rows[0] as MarketingCampaignRow) ?? null;
}

// Only drafts can be deleted — a sent campaign is the audit record of a real
// send and stays forever.
export async function deleteMarketingDraft(id: number): Promise<boolean> {
  const db = requireDb();
  await ensureReuseColumns();
  const rows = await db`DELETE FROM marketing_campaigns WHERE id = ${id} AND status = 'draft' RETURNING id`;
  return rows.length > 0;
}

export async function findMarketingCampaignById(id: number): Promise<MarketingCampaignRow | null> {
  const db = requireDb();
  await ensureReuseColumns();
  const rows = await db`SELECT * FROM marketing_campaigns WHERE id = ${id} LIMIT 1`;
  return (rows[0] as MarketingCampaignRow) ?? null;
}

// Announcement broadcasts (task 04a236c9 revision) additionally persist the
// full recipient list, so every send has an audit trail of exactly who it
// went to. The column is added lazily, same pattern as other late additions.
let recipientsColumnEnsured = false;
async function ensureRecipientsColumn(): Promise<void> {
  if (recipientsColumnEnsured) return;
  const db = requireDb();
  await db`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS recipients jsonb`;
  recipientsColumnEnsured = true;
}

export async function recordAnnouncementCampaign(params: {
  subject: string;
  bodyHtml: string;
  recipients: string[];
  successCount: number;
  failureCount: number;
}): Promise<MarketingCampaignRow | null> {
  const db = requireDb();
  await ensureRecipientsColumn();
  const rows = await db`
    INSERT INTO marketing_campaigns (subject, body_html, recipient_count, success_count, failure_count, recipients)
    VALUES (${params.subject}, ${params.bodyHtml}, ${params.recipients.length}, ${params.successCount}, ${params.failureCount}, ${JSON.stringify(params.recipients)}::jsonb)
    RETURNING *
  `;
  return (rows[0] as MarketingCampaignRow) ?? null;
}

export interface AnnouncementCampaignSummary {
  id: number;
  subject: string;
  sent_at: string;
  recipient_count: number;
  success_count: number;
  failure_count: number;
  recipients: string[];
}

export async function listAnnouncementCampaigns(limit = 20): Promise<AnnouncementCampaignSummary[]> {
  const db = requireDb();
  await ensureRecipientsColumn().catch(() => {});
  const rows = await db`
    SELECT id, subject, sent_at, recipient_count, success_count, failure_count, recipients
    FROM marketing_campaigns ORDER BY sent_at DESC LIMIT ${limit}
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    subject: String(r.subject ?? ''),
    sent_at: String(r.sent_at ?? ''),
    recipient_count: Number(r.recipient_count) || 0,
    success_count: Number(r.success_count) || 0,
    failure_count: Number(r.failure_count) || 0,
    recipients: Array.isArray(r.recipients) ? (r.recipients as string[]).filter((e) => typeof e === 'string') : [],
  }));
}

export async function listMarketingCampaigns(limit = 50): Promise<MarketingCampaignRow[]> {
  const db = requireDb();
  await ensureReuseColumns();
  const rows = await db`SELECT * FROM marketing_campaigns ORDER BY sent_at DESC LIMIT ${limit}`;
  return rows as MarketingCampaignRow[];
}

