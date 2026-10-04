-- Additive owner-reviewed migration only. No runtime installer.
-- Run only against the independently verified Windsor Beauty database.
BEGIN;
ALTER TABLE product_visibility ADD COLUMN IF NOT EXISTS members_only BOOLEAN NOT NULL DEFAULT FALSE;
COMMIT;
-- Existing hidden flags, products, customer eligibility and ordered history are preserved.
-- Rollback: stop flag writes and publish previous reviewed code only after all flags are off.
-- Do not drop this column while any members-only flag remains true.
