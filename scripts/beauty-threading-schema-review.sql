-- REVIEW ONLY. Run only after explicit schema approval and duplicate/history
-- preflight. No delete, historical rewrite or guessed SMTP backfill is allowed.
BEGIN;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS inbound_message_id TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS inbound_attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE enquiry_replies ADD COLUMN IF NOT EXISTS inbound_attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE enquiry_replies ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'out';
CREATE UNIQUE INDEX IF NOT EXISTS enquiries_inbound_message_id_unique ON enquiries(inbound_message_id) WHERE inbound_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS enquiry_replies_provider_message_id ON enquiry_replies(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS beauty_enquiry_smtp_metadata (
  provider_id TEXT PRIMARY KEY,
  smtp_message_id TEXT UNIQUE NOT NULL,
  from_address TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  public_mailbox TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS beauty_inbound_email_routes (
  provider_id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  sender TEXT NOT NULL,
  public_mailbox TEXT NOT NULL,
  capture_address TEXT NOT NULL,
  smtp_message_id TEXT UNIQUE NOT NULL,
  target_enquiry_id INTEGER REFERENCES enquiries(id),
  recorded_enquiry_id INTEGER REFERENCES enquiries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMIT;
