-- Reviewed deployment prerequisite for the SELECT-only dashboard activity feed.
-- Previous activity reads installed this existing column lazily. Apply this
-- migration to Beauty before publishing the new reader, even on a fresh setup.
-- Does not clear activity, change statuses or delete/modify any saved values.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS activity_cleared_at TIMESTAMPTZ;
COMMIT;
