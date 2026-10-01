import type { requireDb } from '../client';

// Marketing contacts and campaigns, plus enquiries and their replies.
//
// Moved out of schema.ts unchanged, in the order it already ran. Pure DDL:
// CREATE TABLE IF NOT EXISTS and idempotent ALTERs, safe to run again.
export async function ensureMarketingAndEnquiries(db: ReturnType<typeof requireDb>) {
  // Email marketing — a single opt-in contact list, fed from registration,
  // account settings, the discount-signup popup, and checkout. `consent`
  // is the current subscription state; `unsubscribed_at` is kept even after
  // a contact re-subscribes (cleared back to NULL) so re-adding never loses
  // the audit trail. `unsubscribe_token` powers the one-click link in every
  // marketing email without requiring the recipient to sign in.
  await db`
    CREATE TABLE IF NOT EXISTS marketing_contacts (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'other',
      consent BOOLEAN NOT NULL DEFAULT TRUE,
      opted_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      unsubscribed_at TIMESTAMPTZ,
      unsubscribe_token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Log of marketing campaigns sent from /admin/marketing — lets the admin
  // see when a campaign went out, to how many contacts, and whether any
  // individual sends failed.
  await db`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id SERIAL PRIMARY KEY,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Reuse/edit support (task 842923ab): the raw editable text, a sent/draft
  // status, and the From-address choice. Also ensured lazily in
  // db/marketing.ts, mirrored here so Run Database Setup covers them.
  await db`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS body_text TEXT`;
  await db`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent'`;
  await db`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS sender TEXT`;

  // Website contact-form enquiries, kept so they can be read and answered from
  // /admin/enquiries instead of only landing in the sales inbox. Before this
  // table the form was fire-and-forget email, so a reply had to come from
  // whichever personal mailbox happened to open it.
  await db`
    CREATE TABLE IF NOT EXISTS enquiries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject_label TEXT NOT NULL,
      order_number TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS enquiries_created_at_idx ON enquiries (created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS enquiries_status_idx ON enquiries (status)`;

  /* ── Where an enquiry came from ───────────────────────────────────────────
   *
   * Added 2026-08-02, when the AI concierge stopped emailing the team and started writing here
   * instead. Every column is additive and nullable, and `source` defaults to the website form, so
   * the two enquiries already in the table keep meaning exactly what they meant.
   *
   * WHY THE HANDOVER LANDS HERE AND NOT IN THE CONCIERGE'S OWN TABLE. It used to write
   * `support_cases` in a different database and send an email, so a customer's problem arrived in
   * an inbox rather than in the queue the team actually works. Kieran's instruction was that a
   * handover should sit alongside the ordinary website enquiries, clearly marked. This is that
   * queue, so this is where it goes. `support_cases` still gets a row, pointing here, because the
   * concierge admin screen counts them. */
  for (const [column, type] of [
    // 'website_form' or 'ai_concierge'. Defaulted rather than backfilled: the default IS the
    // backfill, and it is correct for every row that existed before this line.
    ['source', `text NOT NULL DEFAULT 'website_form'`],
    ['priority', `text NOT NULL DEFAULT 'normal'`],
    // The concierge conversation this came out of. Text, not a foreign key: it points at a row in
    // a different database, and a type implying otherwise would promise a guarantee nothing keeps.
    ['conversation_id', 'text'],
    ['escalation_reason', 'text'],
    ['ai_summary', 'text'],
    ['customer_id', 'integer'],
    ['assigned_to', 'text'],
    // The conversation, as [{role, content}], so a person can read what led here. Written through
    // the same redaction the concierge already applies to a customer's own words.
    ['transcript', 'jsonb'],
    // 'upset' | 'vulnerable' | 'urgent'. Null on the ordinary majority.
    ['attention_flag', 'text'],
    // What makes writing a handover idempotent. See createConciergeEnquiry.
    ['escalation_key', 'text'],
  ] as const) {
    await db.query(`ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS ${column} ${type}`);
  }

  /* ONE OPEN HANDOVER PER CONVERSATION, enforced here rather than only in code.
   *
   * A customer who is not getting anywhere will say so three times, and each of those turns can
   * reach the escalation tool. Without this the team gets three identical enquiries about one
   * problem. The index is partial so it only constrains OPEN concierge handovers: a closed one
   * does not block a genuinely new problem raised later in the same conversation, and it never
   * touches the website form at all. */
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS enquiries_one_open_per_conversation
      ON enquiries (conversation_id)
      WHERE source = 'ai_concierge' AND conversation_id IS NOT NULL AND status <> 'closed'`;

  /* And a second, narrower guard: the same tool call retried must never write twice, even inside
   * one conversation and even if the first write is still open. The key is a hash of what was
   * escalated, so a retry collides and a genuinely different problem does not. */
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS enquiries_escalation_key
      ON enquiries (escalation_key) WHERE escalation_key IS NOT NULL`;

  await db`CREATE INDEX IF NOT EXISTS enquiries_source_idx ON enquiries (source, created_at DESC)`;
  // Direct mailbox messages use the received email id as their retry key.
  await db`ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS inbound_message_id TEXT`;
  await db`ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS inbound_attachments JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS enquiries_inbound_message_id_unique ON enquiries (inbound_message_id) WHERE inbound_message_id IS NOT NULL`;

  /* Anything added to an enquiry after it was created.
   *
   * The concierge's second and third escalations in one conversation append here instead of
   * creating another enquiry, so the team sees one thread with everything on it rather than three
   * rows they have to work out are the same problem. */
  await db`
    CREATE TABLE IF NOT EXISTS enquiry_notes (
      id SERIAL PRIMARY KEY,
      enquiry_id INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'AI Concierge',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS enquiry_notes_enquiry_idx ON enquiry_notes (enquiry_id, created_at)`;

  // Every reply sent from the admin panel, kept as the record of what the
  // customer was actually told. Deleting an enquiry takes its replies with it.
  await db`
    CREATE TABLE IF NOT EXISTS enquiry_replies (
      id SERIAL PRIMARY KEY,
      enquiry_id INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      from_address TEXT NOT NULL,
      provider_message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS enquiry_replies_enquiry_idx ON enquiry_replies (enquiry_id)`;
  await db`ALTER TABLE enquiry_replies ADD COLUMN IF NOT EXISTS inbound_attachments JSONB NOT NULL DEFAULT '[]'::jsonb`;

  /* ── Which way a message on the thread went (task bb0a850f) ───────────────
   *
   * Emma answered a website enquiry by replying to the address the email came
   * from, and the site had nowhere to put what she said: this table only ever
   * held OUR words, and the enquiry page labels every row "Sent reply". So her
   * half of the conversation lived in a mailbox and the dashboard showed a
   * question that looked answered and finished.
   *
   * 'out' is the default because everything written before this column existed
   * was sent by us. That default IS the backfill, and it is correct for all six
   * rows that were in the table when it was added. */
  await db`ALTER TABLE enquiry_replies ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'out'`;

  /* One captured email is written once, enforced here and not only in code.
   * Resend retries a webhook it did not hear back from, and two retries running
   * at the same moment would both find nothing and both insert. The index makes
   * that impossible; the caller handles the collision. */
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS enquiry_replies_provider_message_id
      ON enquiry_replies (provider_message_id) WHERE provider_message_id IS NOT NULL`;

}
