import { createHash } from 'crypto';
import { requireDb } from './client';

// Website contact-form enquiries and the replies sent back from the admin
// panel. See ensureSchema() for the tables.
//
// Since 2026-08-02 this is also where the AI concierge hands a customer to a human. That is the
// whole point of putting it here rather than in the concierge's own tables: the team works one
// queue, and a customer who could not be helped by the assistant should arrive in it alongside
// everyone who filled in the contact form, clearly marked as having come from the assistant.

export type EnquiryStatus = 'new' | 'replied' | 'closed';
export type EnquirySource = 'website_form' | 'ai_concierge' | 'direct_email' | 'manual_email';
export type EnquiryPriority = 'normal' | 'high' | 'urgent';

export interface EnquiryRow {
  id: number;
  name: string;
  email: string;
  subject_key: string;
  subject_label: string;
  order_number: string | null;
  message: string;
  status: EnquiryStatus;
  created_at: string;
  updated_at: string;
  /* Everything below is null or defaulted on a website form submission. */
  source: EnquirySource;
  priority: EnquiryPriority;
  conversation_id: string | null;
  escalation_reason: string | null;
  ai_summary: string | null;
  customer_id: number | null;
  assigned_to: string | null;
  transcript: { role: string; content: string }[] | null;
  attention_flag: string | null;
  escalation_key: string | null;
  inbound_message_id?: string | null;
  inbound_attachments?: InboundAttachment[] | null;
}

export interface InboundAttachment {
  id: string;
  emailId: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface EnquiryNoteRow {
  id: number;
  enquiry_id: number;
  body: string;
  author: string;
  created_at: string;
}

/** 'out' is a message we sent. 'in' is the customer answering it. */
export type EnquiryReplyDirection = 'out' | 'in';

export interface EnquiryReplyRow {
  id: number;
  enquiry_id: number;
  body: string;
  /** Who it came from: our address on an 'out' row, the customer's on an 'in' row. */
  from_address: string;
  provider_message_id: string | null;
  direction: EnquiryReplyDirection;
  created_at: string;
  inbound_attachments?: InboundAttachment[] | null;
}

export interface EnquiryWithReplies extends EnquiryRow {
  replies: EnquiryReplyRow[];
  /** Anything the concierge added after the enquiry was first raised. Empty on a form submission. */
  notes: EnquiryNoteRow[];
}

export async function createEnquiry(params: {
  name: string;
  email: string;
  subjectKey: string;
  subjectLabel: string;
  orderNumber: string | null;
  message: string;
  priority?: EnquiryPriority;
  source?: 'website_form' | 'manual_email';
}): Promise<EnquiryRow | null> {
  const db = requireDb();
  const priority: EnquiryPriority = params.priority === 'urgent' ? 'urgent' : params.priority === 'normal' ? 'normal' : 'high';
  const rows = await db`
    INSERT INTO enquiries (name, email, subject_key, subject_label, order_number, message, priority, source)
    VALUES (${params.name}, ${params.email}, ${params.subjectKey}, ${params.subjectLabel},
            ${params.orderNumber}, ${params.message}, ${priority}, ${params.source ?? 'website_form'})
    RETURNING *
  `;
  return (rows[0] as EnquiryRow) ?? null;
}

let inboundColumnsEnsured = false;
export async function ensureInboundEnquiryColumns(): Promise<void> {
  if (inboundColumnsEnsured) return;
  const db = requireDb();
  await db`ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS inbound_message_id TEXT`;
  await db`ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS inbound_attachments JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await db`ALTER TABLE enquiry_replies ADD COLUMN IF NOT EXISTS inbound_attachments JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS enquiries_inbound_message_id_unique ON enquiries (inbound_message_id) WHERE inbound_message_id IS NOT NULL`;
  inboundColumnsEnsured = true;
}

/** A direct email becomes work in the same queue as a website form. The provider id is the retry key. */
export async function createInboundEmailEnquiry(params: {
  emailId: string;
  name: string;
  email: string;
  subject: string;
  orderNumber: string | null;
  message: string;
  attachments: InboundAttachment[];
  priority: EnquiryPriority;
}): Promise<{ enquiry: EnquiryRow; created: boolean } | null> {
  await ensureInboundEnquiryColumns();
  const db = requireDb();
  const attachments = JSON.stringify(params.attachments);
  const rows = await db`
    INSERT INTO enquiries (name, email, subject_key, subject_label, order_number, message,
                          source, priority, attention_flag, inbound_message_id, inbound_attachments)
    VALUES (${params.name}, ${params.email.toLowerCase()}, 'email', ${params.subject},
            ${params.orderNumber}, ${params.message}, 'direct_email', ${params.priority},
            ${params.priority === 'urgent' ? 'urgent' : null}, ${params.emailId}, ${attachments}::jsonb)
    ON CONFLICT (inbound_message_id) WHERE inbound_message_id IS NOT NULL DO NOTHING
    RETURNING *
  `;
  if (rows.length) return { enquiry: rows[0] as EnquiryRow, created: true };
  const existing = await db`SELECT * FROM enquiries WHERE inbound_message_id = ${params.emailId} LIMIT 1`;
  return existing.length ? { enquiry: existing[0] as EnquiryRow, created: false } : null;
}

export async function isInboundAttachmentRecorded(emailId: string, attachmentId: string): Promise<boolean> {
  await ensureInboundEnquiryColumns();
  const db = requireDb();
  const item = JSON.stringify([{ emailId, id: attachmentId }]);
  const rows = await db`
    SELECT 1 FROM enquiries WHERE inbound_attachments @> ${item}::jsonb
    UNION ALL
    SELECT 1 FROM enquiry_replies WHERE inbound_attachments @> ${item}::jsonb
    LIMIT 1
  `;
  return rows.length > 0;
}

// One query for the whole inbox: replies are aggregated per enquiry so the
// admin page can render a thread without an extra request per row.
export async function listEnquiries(limit = 200): Promise<EnquiryWithReplies[]> {
  const db = requireDb();
  const rows = await db`
    SELECT e.*,
      COALESCE(
        (SELECT json_agg(r ORDER BY r.created_at)
         FROM enquiry_replies r WHERE r.enquiry_id = e.id),
        '[]'::json
      ) AS replies,
      COALESCE(
        (SELECT json_agg(n ORDER BY n.created_at)
         FROM enquiry_notes n WHERE n.enquiry_id = e.id),
        '[]'::json
      ) AS notes
    FROM enquiries e
    ORDER BY
      /* Anything flagged for attention floats, then anything urgent, then newest first. A
         customer who said something that needs a person should not be three screens down
         because two contact forms arrived after them. */
      CASE WHEN e.status = 'closed' THEN 1 ELSE 0 END,
      CASE WHEN e.attention_flag IS NOT NULL THEN 0 ELSE 1 END,
      CASE e.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
      e.created_at DESC
    LIMIT ${limit}
  `;
  return rows as EnquiryWithReplies[];
}

export async function findEnquiryById(id: number): Promise<EnquiryRow | null> {
  const db = requireDb();
  const rows = await db`SELECT * FROM enquiries WHERE id = ${id} LIMIT 1`;
  return (rows[0] as EnquiryRow) ?? null;
}

export async function setEnquiryStatus(id: number, status: EnquiryStatus): Promise<EnquiryRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE enquiries SET status = ${status}, updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as EnquiryRow) ?? null;
}

// Recorded only after the provider has accepted the message. Sending the answer
// finishes the work, so the enquiry becomes Done immediately. If the customer
// asks another real question later, inbound capture reopens it automatically.
export async function recordEnquiryReply(params: {
  enquiryId: number;
  body: string;
  fromAddress: string;
  providerMessageId: string | null;
}): Promise<EnquiryReplyRow | null> {
  const db = requireDb();
  const rows = await db`
    WITH saved_reply AS (
      INSERT INTO enquiry_replies (enquiry_id, body, from_address, provider_message_id)
      VALUES (${params.enquiryId}, ${params.body}, ${params.fromAddress}, ${params.providerMessageId})
      RETURNING *
    ), marked_done AS (
      UPDATE enquiries
      SET status = 'closed', updated_at = now()
      WHERE id = ${params.enquiryId}
      RETURNING id
    )
    SELECT saved_reply.*
    FROM saved_reply
    JOIN marked_done ON marked_done.id = saved_reply.enquiry_id
  `;
  return (rows[0] as EnquiryReplyRow) ?? null;
}

/**
 * Adds a provider-verified email that was sent outside the normal dashboard
 * route. This never sends mail. Recording the sent answer finishes the work.
 * The provider reference makes retries harmless.
 */
export async function recordExistingEnquiryReply(params: {
  enquiryId: number;
  body: string;
  fromAddress: string;
  providerMessageId: string;
}): Promise<{ reply: EnquiryReplyRow; created: boolean } | null> {
  const db = requireDb();
  const rows = await db`
    WITH saved_reply AS (
      INSERT INTO enquiry_replies (enquiry_id, body, from_address, provider_message_id)
      SELECT ${params.enquiryId}, ${params.body}, ${params.fromAddress}, ${params.providerMessageId}
      WHERE NOT EXISTS (
        SELECT 1 FROM enquiry_replies WHERE provider_message_id = ${params.providerMessageId}
      )
      RETURNING *
    ), marked_done AS (
      UPDATE enquiries
      SET status = 'closed', updated_at = now()
      WHERE id = ${params.enquiryId}
        AND EXISTS (SELECT 1 FROM saved_reply)
      RETURNING id
    )
    SELECT saved_reply.*
    FROM saved_reply
    JOIN marked_done ON marked_done.id = saved_reply.enquiry_id
  `;
  const created = (rows[0] as EnquiryReplyRow) ?? null;
  if (created) return { reply: created, created: true };

  const existing = await db`
    SELECT * FROM enquiry_replies
    WHERE provider_message_id = ${params.providerMessageId}
    LIMIT 1
  `;
  const reply = (existing[0] as EnquiryReplyRow) ?? null;
  if (!reply || reply.enquiry_id !== params.enquiryId) return null;
  return { reply, created: false };
}

/* ── The customer's own reply, arriving by email (task bb0a850f) ───────────────
 *
 * The direction column is added here as well as in the setup script, once per running instance,
 * the same way customer_emails and pearl_email_drafts create themselves. The webhook that needs it
 * is called by Resend from outside and cannot wait for somebody to press Run Database Setup: an
 * email arriving before that happened would be refused by the database and lost, which is the
 * exact failure this whole task exists to stop.
 */
let replyDirectionEnsured = false;
async function ensureReplyDirection(): Promise<void> {
  if (replyDirectionEnsured) return;
  const db = requireDb();
  await db`ALTER TABLE enquiry_replies ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'out'`;
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS enquiry_replies_provider_message_id
      ON enquiry_replies (provider_message_id) WHERE provider_message_id IS NOT NULL`;
  replyDirectionEnsured = true;
}

/*
 *
 * Kieran answered Emma's website enquiry from the dashboard, she pressed Reply in her email, and
 * the dashboard never saw a word of it. His words: "my main concern is that because they're
 * responding direct it bypasses the dashboard". These two functions are the missing half: work out
 * which enquiry an incoming email belongs to, and put it on that thread.
 */

/**
 * The enquiry an email from this address is answering, or null when there is nothing to attach to.
 *
 * An OPEN enquiry always wins, newest first: that is the conversation somebody is actually in the
 * middle of. Failing that, a recently closed one is reopened rather than lost, because "closed"
 * only ever meant we had finished, not that the customer had. Beyond that window the email is a
 * new subject rather than a reply, so nothing is guessed and the caller keeps its own record.
 */
export async function findEnquiryForCustomerEmail(
  email: string,
  opts: { closedWithinDays?: number } = {},
): Promise<EnquiryRow | null> {
  const address = email.trim().toLowerCase();
  if (!address) return null;
  const db = requireDb();
  const rows = await db`
    SELECT * FROM enquiries
    WHERE lower(email) = ${address}
      AND (status <> 'closed' OR updated_at > now() - make_interval(days => ${opts.closedWithinDays ?? 60}))
    ORDER BY (status = 'closed'), created_at DESC
    LIMIT 1
  `;
  return (rows[0] as EnquiryRow) ?? null;
}

/**
 * Puts a customer's emailed reply on its enquiry thread and hands the enquiry back to the team.
 *
 * The status goes to 'new', including on an enquiry that had been closed. A message nobody has
 * answered belongs at the top of the queue, and an enquiry marked 'replied' reads as finished on
 * the admin page, which is exactly the impression that lost Emma's question in the first place.
 * A short courtesy acknowledgement such as "Thank you" is the exception: it is recorded on the
 * thread and closed automatically, because there is nothing for the team to answer.
 *
 * Writing twice is impossible rather than unlikely: the provider's own message id carries a unique
 * index, so a webhook Resend retries collides instead of duplicating, and the existing row is
 * returned so the caller can answer the retry with a plain success.
 */
export async function recordInboundEnquiryReply(params: {
  enquiryId: number;
  body: string;
  fromAddress: string;
  /** Resend's id for the received email. Null only when a person is typing one in by hand. */
  providerMessageId: string | null;
  attachments?: InboundAttachment[];
  closeAsAcknowledged?: boolean;
}): Promise<{ reply: EnquiryReplyRow; created: boolean } | null> {
  await ensureReplyDirection();
  await ensureInboundEnquiryColumns();
  const db = requireDb();

  if (params.providerMessageId) {
    const already = await db`
      SELECT * FROM enquiry_replies WHERE provider_message_id = ${params.providerMessageId} LIMIT 1
    `;
    const seen = (already[0] as EnquiryReplyRow) ?? null;
    if (seen) return seen.enquiry_id === params.enquiryId && seen.direction === 'in' && seen.from_address.toLowerCase() === params.fromAddress.toLowerCase() ? { reply: seen, created: false } : null;
  }

  const rows = await db`
    WITH saved_reply AS (
      INSERT INTO enquiry_replies (enquiry_id, body, from_address, provider_message_id, direction, inbound_attachments)
      VALUES (${params.enquiryId}, ${params.body}, ${params.fromAddress.toLowerCase()},
              ${params.providerMessageId}, 'in', ${JSON.stringify(params.attachments ?? [])}::jsonb)
      ON CONFLICT (provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING
      RETURNING *
    ), reopened AS (
      UPDATE enquiries
      SET status = CASE WHEN ${params.closeAsAcknowledged ?? false} THEN 'closed' ELSE 'new' END,
          updated_at = now()
      WHERE id = ${params.enquiryId}
        AND EXISTS (SELECT 1 FROM saved_reply)
      RETURNING id
    )
    SELECT saved_reply.*
    FROM saved_reply
    JOIN reopened ON reopened.id = saved_reply.enquiry_id
  `;
  const reply = (rows[0] as EnquiryReplyRow) ?? null;
  if (reply) return { reply, created: true };
  if (!params.providerMessageId) return null;
  const existing = await db`SELECT * FROM enquiry_replies WHERE provider_message_id=${params.providerMessageId} LIMIT 1`;
  const saved = (existing[0] as EnquiryReplyRow) ?? null;
  return saved && saved.enquiry_id===params.enquiryId && saved.direction==='in' && saved.from_address.toLowerCase()===params.fromAddress.toLowerCase() ? {reply:saved,created:false} : null;
}

/**
 * The last thing the customer said on this thread, or null when they have not written since.
 *
 * What the automatic draft has to answer. Without this it answers `enquiries.message`, which is
 * the question they asked at the start and which somebody has already replied to, so a follow-up
 * would get a second copy of the answer they were given yesterday.
 */
/**
 * Puts a message typed in the dashboard onto a Website Enquiries thread (Kieran, 18 September 2026).
 *
 * WHY THIS EXISTS. A message sent to a customer from the dashboard was stored under that customer
 * and nowhere else. Website Enquiries never heard about it. So when we wrote to Maria Findrihan to
 * apologise for her discount, there was no case to see it in, and when she replied her answer would
 * have opened a brand new case containing only her half of it: a reply to a conversation nobody
 * could read. Kieran asked for the whole thread to live in one place.
 *
 * An open or recent thread for that address is reused, so writing to somebody twice does not make
 * two cases. Otherwise a new one is opened. Either way the status becomes 'replied': we have
 * spoken, nothing is owed by us, and their answer will flip it back to 'new' the moment it lands.
 *
 * Never throws. Recording the conversation must not be able to fail a message that has already
 * gone out; the caller has nothing useful it could do about it anyway.
 */
/**
 * Puts what we already said to somebody on the thread their reply just opened.
 *
 * Kieran, 18 September 2026: "all the thread to stay in there". Messages sent from the dashboard
 * before that change were filed under the customer only, so a reply to one of them would open a
 * case holding the customer's half and nothing else: an answer to a question nobody could see.
 * Maria Findrihan is the live example, apologised to at 8:55pm with no case to show for it.
 *
 * So when a direct email opens a new case, anything we sent that address in the last 60 days is
 * lifted onto the thread above it, oldest first, keeping its original time so the conversation
 * reads in the order it happened. The customer_emails row id is the de-duplication key, so this
 * cannot double up if it ever runs twice.
 *
 * Never throws. A case that opened is worth more than a tidy history, so a failure here leaves the
 * case exactly as it was.
 */
export async function attachEarlierSentMessages(params: {
  enquiryId: number;
  email: string;
  withinDays?: number;
}): Promise<number> {
  try {
    const db = requireDb();
    const rows = await db`
      INSERT INTO enquiry_replies (enquiry_id, body, from_address, provider_message_id, direction, created_at)
      SELECT ${params.enquiryId}, ce.body_text, COALESCE(ce.our_address, 'Windsor Beauty'),
             'history-' || ce.id::text, 'out', ce.created_at
      FROM customer_emails ce
      WHERE lower(ce.email) = lower(${params.email})
        AND ce.direction = 'sent'
        AND ce.created_at > now() - make_interval(days => ${params.withinDays ?? 60})
        AND NOT EXISTS (
          SELECT 1 FROM enquiry_replies r WHERE r.provider_message_id = 'history-' || ce.id::text
        )
      ORDER BY ce.created_at
      RETURNING id
    `;
    return rows.length;
  } catch {
    return 0;
  }
}

export async function recordDashboardMessageOnThread(params: {
  name: string;
  email: string;
  subject: string;
  message: string;
  fromAddress: string;
  providerMessageId: string;
  orderNumber?: string | null;
}): Promise<number | null> {
  try {
    const db = requireDb();
    const existing = await findEnquiryForCustomerEmail(params.email);
    let enquiryId: number;
    if (existing) {
      const saved = await recordExistingEnquiryReply({
        enquiryId: existing.id,
        body: params.message,
        fromAddress: params.fromAddress,
        providerMessageId: params.providerMessageId,
      });
      if (!saved) return null;
      enquiryId = existing.id;
    } else {
      const created = await createEnquiry({
        name: params.name || params.email,
        email: params.email,
        subjectKey: 'email',
        subjectLabel: params.subject,
        orderNumber: params.orderNumber ?? null,
        // The thread opens with what WE said, because that is how this conversation started.
        message: params.message,
        priority: 'normal',
        source: 'manual_email',
      });
      if (!created) return null;
      enquiryId = created.id;
    }
    await db`UPDATE enquiries SET status = 'replied', updated_at = now() WHERE id = ${enquiryId}`;
    return enquiryId;
  } catch {
    return null;
  }
}

export async function findLatestCustomerReply(enquiryId: number): Promise<EnquiryReplyRow | null> {
  await ensureReplyDirection();
  const db = requireDb();
  const rows = await db`
    SELECT * FROM enquiry_replies
    WHERE enquiry_id = ${enquiryId} AND direction = 'in'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return (rows[0] as EnquiryReplyRow) ?? null;
}

export async function deleteClosedEnquiry(id: number): Promise<boolean> {
  const db = requireDb();
  const rows = await db`
    DELETE FROM enquiries
    WHERE id = ${id} AND status = 'closed'
    RETURNING id
  `;
  return rows.length > 0;
}

/* ── The AI concierge handing a customer to a human ─────────────────────────*/

export interface ConciergeHandover {
  /** The conversation it came out of. The key to everything below. */
  conversationId: string;
  /** Short category: complaint, damaged_item, missing_item, vat_invoice, payment, callback, other. */
  kind: string;
  /** The assistant's own one or two sentences about what the problem is. */
  summary: string;
  /** Why it gave up. The thing a person most wants to know before reading anything else. */
  reason: string;
  /** What the customer last said, in their own words. */
  customerMessage: string;
  name: string | null;
  email: string | null;
  orderNumber: string | null;
  customerId: number | null;
  priority: EnquiryPriority;
  attentionFlag: 'upset' | 'vulnerable' | 'urgent' | null;
  /** The conversation so far, already redacted. Trimmed to the last few turns by the caller. */
  transcript: { role: string; content: string }[];
}

export type HandoverOutcome =
  | { ok: true; enquiryId: number; created: 'new' }
  /** An open handover for this conversation already existed, so this was added to it. */
  | { ok: true; enquiryId: number; created: 'appended' }
  /** This exact escalation had already been written. Nothing changed, and nothing needed to. */
  | { ok: true; enquiryId: number; created: 'duplicate' }
  | { ok: false; error: string };

/**
 * What makes one escalation the same as another.
 *
 * A hash of the conversation, the category and the assistant's summary. A retry of the same tool
 * call produces the identical key and collides on the unique index; a genuinely different problem
 * raised later produces a different summary and so a different key. Deliberately NOT a random id
 * generated per call, which would make every retry look new, which is the failure this prevents.
 */
export function escalationKey(h: Pick<ConciergeHandover, 'conversationId' | 'kind' | 'summary'>): string {
  return createHash('sha256')
    .update(`${h.conversationId}|${h.kind}|${h.summary.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

/** How the enquiry list and the email subject describe each kind, in words. */
const KIND_LABELS: Record<string, string> = {
  complaint: 'Complaint',
  damaged_item: 'Damaged item',
  missing_item: 'Missing item',
  vat_invoice: 'VAT invoice request',
  payment: 'Payment problem',
  refund: 'Refund request',
  callback: 'Asked to speak to someone',
  urgent_medical: 'Urgent, mentioned a reaction',
  account_access: 'Cannot get into their account',
  order_problem: 'Problem with an order',
  other: 'Passed to the team',
};

export function handoverLabel(kind: string): string {
  return KIND_LABELS[kind] ?? 'Passed to the team';
}

/**
 * Write a handover, or add to the one already open for this conversation.
 *
 * THE THREE OUTCOMES AND WHY THERE ARE THREE.
 *
 *   duplicate  The identical escalation has already been written. The assistant retried, or the
 *              same tool call ran twice. Nothing changes and the customer is still told their
 *              message is with the team, because it is.
 *   appended   A DIFFERENT problem, in a conversation that already has an open handover. The team
 *              gets one thread with both on it rather than two rows to work out are related.
 *   new        A conversation with no open handover. The ordinary case.
 *
 * Everything is decided by the database rather than by reading first and writing after. Two turns
 * arriving at once would both read "nothing open" and both insert; the unique indexes make that
 * impossible, and the conflict is then handled rather than thrown.
 */
export async function createConciergeHandover(h: ConciergeHandover): Promise<HandoverOutcome> {
  const db = requireDb();
  const key = escalationKey(h);
  const label = handoverLabel(h.kind);

  try {
    /* Attempt the insert first and let the indexes arbitrate.
     *
     * `ON CONFLICT DO NOTHING` covers BOTH unique indexes: the escalation key and the one open
     * handover per conversation. Which one it hit is worked out below, because the two mean
     * different things to the customer and to the team. */
    const inserted = await db`
      INSERT INTO enquiries
        (name, email, subject_key, subject_label, order_number, message,
         source, priority, conversation_id, escalation_reason, ai_summary,
         customer_id, transcript, attention_flag, escalation_key)
      VALUES
        (${h.name ?? 'Not given'}, ${h.email ?? ''}, ${h.kind}, ${label},
         ${h.orderNumber}, ${h.customerMessage},
         'ai_concierge', ${h.priority}, ${h.conversationId}, ${h.reason}, ${h.summary},
         ${h.customerId}, ${JSON.stringify(h.transcript)}::jsonb, ${h.attentionFlag}, ${key})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    if (inserted.length) {
      return { ok: true, enquiryId: Number((inserted[0] as { id: number }).id), created: 'new' };
    }

    // Something blocked it. The same escalation already written is the harmless case.
    const [sameKey] = (await db`
      SELECT id FROM enquiries WHERE escalation_key = ${key} LIMIT 1`) as { id: number }[];
    if (sameKey) {
      return { ok: true, enquiryId: Number(sameKey.id), created: 'duplicate' };
    }

    // Otherwise this conversation already has an open handover about something else. Add to it.
    const [open] = (await db`
      SELECT id FROM enquiries
       WHERE source = 'ai_concierge' AND conversation_id = ${h.conversationId}
         AND status <> 'closed'
       ORDER BY created_at DESC LIMIT 1`) as { id: number }[];

    if (!open) {
      // Neither index explains it, so something else refused the row. Reported rather than
      // guessed at, because the customer is about to be told whether this worked.
      return { ok: false, error: 'The enquiry could not be written and it is not a duplicate.' };
    }

    await db`
      INSERT INTO enquiry_notes (enquiry_id, body, author)
      VALUES (${open.id},
              ${`${label}. ${h.summary}\n\nWhy it was passed on: ${h.reason}`
                + `\n\nWhat the customer said: ${h.customerMessage}`},
              'AI Concierge')`;

    /* Raise the priority if this one is more serious, never lower it. A conversation that starts
     * as a delivery question and turns into a complaint is a complaint. */
    await db`
      UPDATE enquiries
         SET priority = CASE
               WHEN ${h.priority} = 'urgent' THEN 'urgent'
               WHEN ${h.priority} = 'high' AND priority = 'normal' THEN 'high'
               ELSE priority END,
             attention_flag = COALESCE(${h.attentionFlag}, attention_flag),
             status = CASE WHEN status = 'replied' THEN 'new' ELSE status END,
             updated_at = now()
       WHERE id = ${open.id}`;

    return { ok: true, enquiryId: Number(open.id), created: 'appended' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The enquiry could not be written.',
    };
  }
}

/** Everything added to one enquiry after it was created. */
export async function listEnquiryNotes(enquiryId: number): Promise<EnquiryNoteRow[]> {
  const db = requireDb();
  return (await db`
    SELECT * FROM enquiry_notes WHERE enquiry_id = ${enquiryId} ORDER BY created_at
  `) as EnquiryNoteRow[];
}

/** Who is dealing with it. Null clears it. */
export async function assignEnquiry(id: number, who: string | null): Promise<void> {
  const db = requireDb();
  await db`UPDATE enquiries SET assigned_to = ${who}, updated_at = now() WHERE id = ${id}`;
}

/**
 * How many website enquiries nobody has answered, and how many days the oldest
 * has been waiting (task 0c1101e1, for the dashboard banner).
 *
 * The age matters more than the count. On 7 September a real customer's enquiry
 * from 29 July was still sitting at 'new', forty days later, because nothing on
 * the dashboard ever mentioned enquiries. "4 waiting" reads as a small pile.
 * "the oldest has been waiting 40 days" reads as somebody being ignored.
 *
 * Counts 'new' only: 'replied' and 'closed' have been dealt with.
 */
export interface RecentEnquiryAlert {
  id: number;
  name: string;
  subject_label: string;
  source: EnquirySource;
  priority: EnquiryPriority;
  order_number: string | null;
  updated_at: string;
}

export async function countNewEnquiries(): Promise<{
  newCount: number;
  oldestDays: number;
  latestUpdatedAt: string | null;
  recent: RecentEnquiryAlert[];
}> {
  const db = requireDb();
  const [rows, recent] = await Promise.all([db`
    SELECT count(*)::int AS n,
           COALESCE(EXTRACT(DAY FROM now() - min(created_at))::int, 0) AS oldest_days
    FROM enquiries WHERE status = 'new'
  `, db`
    SELECT id, name, subject_label, source, priority, order_number, updated_at
    FROM enquiries WHERE status = 'new'
    ORDER BY updated_at DESC, id DESC LIMIT 3
  `]);
  const counts = rows as { n: number; oldest_days: number }[];
  const alerts = recent as RecentEnquiryAlert[];
  return {
    newCount: counts[0]?.n ?? 0,
    oldestDays: counts[0]?.oldest_days ?? 0,
    latestUpdatedAt: alerts[0]?.updated_at ?? null,
    recent: alerts,
  };
}
