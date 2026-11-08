-- Explicit additive installer. Does not grant any customer staff rights.
CREATE TABLE IF NOT EXISTS admin_passkey_users (
 identity_key text PRIMARY KEY, user_handle text UNIQUE NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_passkeys (
 credential_id text PRIMARY KEY, identity_key text NOT NULL REFERENCES admin_passkey_users(identity_key),
 public_key text NOT NULL, counter bigint NOT NULL CHECK(counter>=0), transports jsonb NOT NULL DEFAULT '[]',
 device_type text NOT NULL, backed_up boolean NOT NULL, label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz, revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS admin_passkeys_identity ON admin_passkeys(identity_key,created_at DESC);
CREATE TABLE IF NOT EXISTS admin_passkey_challenges (
 token_hash text PRIMARY KEY, challenge text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('register','authenticate')),
 identity_key text, expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS admin_passkey_events (
 id bigserial PRIMARY KEY, identity_key text NOT NULL, credential_id text NOT NULL,
 event text NOT NULL CHECK(event IN ('registered','authenticated','revoked')),
 created_at timestamptz NOT NULL DEFAULT now()
);

-- Staff-only rate limiter; customer passkey tables are not installed for Beauty.
CREATE TABLE IF NOT EXISTS admin_passkey_rate_buckets (
 bucket_key text PRIMARY KEY, attempts integer NOT NULL, reset_at timestamptz NOT NULL
);
