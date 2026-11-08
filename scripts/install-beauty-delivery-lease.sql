-- Additive prerequisite for the Beauty delivery editor and shared dispatch lock.
-- Review/install separately before deploying the app. Does not touch saved orders.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_dispatch_lease_token TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_dispatch_lease_until TIMESTAMPTZ;
-- These existing parcel-state fields were previously installed lazily by
-- ensureRoyalMailParcelState. Make their prerequisite explicit before editing.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_printed_on TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_shipped_on TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_checked_at TIMESTAMPTZ;
COMMIT;
