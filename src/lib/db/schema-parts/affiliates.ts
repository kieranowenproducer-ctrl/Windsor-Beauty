import type { requireDb } from '../client';

/** Paid affiliates. Kept separate from the customer Beauty Card referral scheme. */
export async function ensureAffiliates(db: ReturnType<typeof requireDb>) {
  await db`
    CREATE TABLE IF NOT EXISTS affiliate_profiles (
      customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      referral_code TEXT NOT NULL UNIQUE,
      request_key TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
      customer_discount_bps INTEGER NOT NULL DEFAULT 500 CHECK (customer_discount_bps BETWEEN 1 AND 10000),
      commission_bps INTEGER NOT NULL DEFAULT 500 CHECK (commission_bps BETWEEN 1 AND 10000),
      minimum_product_subtotal_pence INTEGER NOT NULL DEFAULT 3000 CHECK (minimum_product_subtotal_pence >= 0),
      code_duration_days INTEGER NOT NULL DEFAULT 183 CHECK (code_duration_days > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`ALTER TABLE affiliate_profiles ADD COLUMN IF NOT EXISTS request_key TEXT`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS affiliate_profiles_request_key_unique ON affiliate_profiles (request_key)`;
  await db`
    CREATE TABLE IF NOT EXISTS affiliate_referrals (
      id SERIAL PRIMARY KEY,
      affiliate_customer_id INTEGER NOT NULL REFERENCES affiliate_profiles(customer_id) ON DELETE CASCADE,
      referred_customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (affiliate_customer_id <> referred_customer_id)
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS affiliate_invitations (
      id BIGSERIAL PRIMARY KEY,
      affiliate_customer_id INTEGER NOT NULL REFERENCES affiliate_profiles(customer_id) ON DELETE CASCADE,
      recipient_email TEXT NOT NULL,
      created_source TEXT NOT NULL DEFAULT 'affiliate' CHECK (created_source IN ('affiliate', 'staff', 'recipient')),
      token_hash TEXT NOT NULL UNIQUE,
      delivery_status TEXT NOT NULL DEFAULT 'not_requested' CHECK (delivery_status IN ('not_requested', 'pending', 'sent', 'failed')),
      email_requested_at TIMESTAMPTZ,
      email_sent_at TIMESTAMPTZ,
      email_provider_id TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      redeemed_at TIMESTAMPTZ,
      referred_customer_id INTEGER UNIQUE REFERENCES customers(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (recipient_email = lower(recipient_email))
    )
  `;
  await db`ALTER TABLE affiliate_invitations ADD COLUMN IF NOT EXISTS created_source TEXT NOT NULL DEFAULT 'affiliate'`;
  await db`ALTER TABLE affiliate_invitations ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'not_requested'`;
  await db`ALTER TABLE affiliate_invitations ADD COLUMN IF NOT EXISTS email_requested_at TIMESTAMPTZ`;
  await db`ALTER TABLE affiliate_invitations ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ`;
  await db`ALTER TABLE affiliate_invitations ADD COLUMN IF NOT EXISTS email_provider_id TEXT`;
  await db`CREATE INDEX IF NOT EXISTS affiliate_invitations_request_limit ON affiliate_invitations (affiliate_customer_id, created_source, created_at)`;
  // The application blocks another request for seven days. A permanent unique
  // index would also block a legitimate new request after the old link expires.
  await db`DROP INDEX IF EXISTS affiliate_invitations_one_recipient_request`;
  await db`CREATE INDEX IF NOT EXISTS affiliate_invitations_recipient_requests ON affiliate_invitations (affiliate_customer_id, recipient_email, created_at DESC) WHERE created_source = 'recipient'`;
  await db`
    CREATE TABLE IF NOT EXISTS affiliate_customer_codes (
      id SERIAL PRIMARY KEY,
      referral_id INTEGER NOT NULL UNIQUE REFERENCES affiliate_referrals(id) ON DELETE CASCADE,
      affiliate_customer_id INTEGER NOT NULL REFERENCES affiliate_profiles(customer_id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
      discount_code_id INTEGER NOT NULL UNIQUE REFERENCES discount_codes(id) ON DELETE RESTRICT,
      code TEXT NOT NULL UNIQUE,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      expiry_reminder_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`ALTER TABLE affiliate_customer_codes ADD COLUMN IF NOT EXISTS expiry_reminder_sent_at TIMESTAMPTZ`;
  await db`
    CREATE TABLE IF NOT EXISTS affiliate_order_attributions (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      referral_id INTEGER NOT NULL REFERENCES affiliate_referrals(id) ON DELETE RESTRICT,
      affiliate_customer_id INTEGER NOT NULL REFERENCES affiliate_profiles(customer_id) ON DELETE RESTRICT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      code TEXT NOT NULL,
      product_paid_pence INTEGER NOT NULL CHECK (product_paid_pence >= 0),
      commission_pence INTEGER NOT NULL CHECK (commission_pence >= 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'earned', 'reversed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      earned_at TIMESTAMPTZ,
      reversed_at TIMESTAMPTZ
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS affiliate_payout_requests (
      id SERIAL PRIMARY KEY,
      affiliate_customer_id INTEGER NOT NULL REFERENCES affiliate_profiles(customer_id) ON DELETE RESTRICT,
      amount_pence INTEGER NOT NULL CHECK (amount_pence > 0 AND amount_pence % 100 = 0),
      method TEXT NOT NULL CHECK (method IN ('cash', 'store_credit')),
      status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'payment_pending', 'paid', 'refused', 'cancelled')),
      payment_reference TEXT,
      staff_note TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      approved_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS affiliate_ledger (
      id SERIAL PRIMARY KEY,
      affiliate_customer_id INTEGER NOT NULL REFERENCES affiliate_profiles(customer_id) ON DELETE RESTRICT,
      entry_type TEXT NOT NULL CHECK (entry_type IN ('commission', 'refund_reversal', 'cash_payout', 'store_credit', 'payout_release')),
      amount_pence INTEGER NOT NULL CHECK (amount_pence <> 0),
      order_attribution_id INTEGER REFERENCES affiliate_order_attributions(id) ON DELETE RESTRICT,
      payout_request_id INTEGER REFERENCES affiliate_payout_requests(id) ON DELETE RESTRICT,
      dedupe_key TEXT NOT NULL UNIQUE,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate ON affiliate_referrals (affiliate_customer_id, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS idx_affiliate_invitations_affiliate ON affiliate_invitations (affiliate_customer_id, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS idx_affiliate_attributions_affiliate ON affiliate_order_attributions (affiliate_customer_id, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS idx_affiliate_ledger_affiliate ON affiliate_ledger (affiliate_customer_id, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_status ON affiliate_payout_requests (status, requested_at)`;
}
