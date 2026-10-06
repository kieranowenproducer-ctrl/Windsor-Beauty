-- REVIEW ONLY: root must bind actual runtime role/fingerprint and fresh recovery before installation.
-- Additive, explicit installation. No runtime lazy DDL, changes to customers/consent/history, or sends.
-- Caller must use one transaction; role is the already verified Glow runtime neondb_owner.
DO $$ BEGIN
  IF current_user <> 'neondb_owner' OR current_schema() <> 'public' THEN
    RAISE EXCEPTION 'Unexpected member notice installer role/schema';
  END IF;
  IF to_regclass('public.beauty_member_changeover_deliveries') IS NOT NULL THEN
    RAISE EXCEPTION 'Member notice ledger already exists; verify rather than reinstall';
  END IF;
END $$;
CREATE TABLE public.beauty_member_changeover_deliveries (
  campaign_key text NOT NULL CHECK (campaign_key='windsor-beauty-is-member-changeover-2026-10'),
  -- Immutable identity snapshot, not a live FK: normal account deletion must retain the once ledger.
  customer_id integer NOT NULL CHECK (customer_id>0),
  recipient_email text NOT NULL CHECK (recipient_email=lower(trim(recipient_email))),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  suppression_evidence_hash text NOT NULL CHECK (suppression_evidence_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','sending','sent','held')),
  provider_id uuid UNIQUE,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_key,customer_id),
  UNIQUE (campaign_key,recipient_email),
  CHECK ((state='sent' AND provider_id IS NOT NULL) OR (state<>'sent' AND provider_id IS NULL))
);
REVOKE ALL ON public.beauty_member_changeover_deliveries FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.beauty_member_changeover_deliveries TO neondb_owner;
-- Runtime never deletes reservations, including held/unknown outcomes.
-- Rollback before any use: root verifies this table is empty, then drops this table only.
-- After any reservation: retain ledger for recovery; do not DROP/reinstall or replay sends.
