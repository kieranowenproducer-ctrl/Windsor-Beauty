import type { requireDb } from '../client';

export async function ensureReferrals(db: ReturnType<typeof requireDb>) {
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS glow_card_frozen_at TIMESTAMPTZ`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS glow_card_frozen_reason TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS glow_card_frozen_by TEXT`;
  await db`CREATE INDEX IF NOT EXISTS idx_customers_glow_card_frozen ON customers (glow_card_frozen_at) WHERE glow_card_frozen_at IS NOT NULL`;
  await db`
    CREATE TABLE IF NOT EXISTS member_referral_codes (
      customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS member_referrals (
      id SERIAL PRIMARY KEY,
      referrer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      referred_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
      first_order_id INTEGER UNIQUE REFERENCES orders(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'waiting_order',
      review_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      qualified_at TIMESTAMPTZ,
      CHECK (referrer_id <> referred_id)
    )
  `;
  await db`ALTER TABLE member_referrals ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`;
  await db`ALTER TABLE member_referrals ADD COLUMN IF NOT EXISTS review_note TEXT`;
  await db`ALTER TABLE member_referrals ADD COLUMN IF NOT EXISTS review_decision TEXT`;
  await db`CREATE INDEX IF NOT EXISTS idx_member_referrals_referrer ON member_referrals (referrer_id, created_at DESC)`;
  await db`
    CREATE TABLE IF NOT EXISTS member_referral_months (
      referrer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      month_start DATE NOT NULL,
      credited INTEGER NOT NULL DEFAULT 0 CHECK (credited >= 0),
      PRIMARY KEY (referrer_id, month_start)
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS member_referral_stamps (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      referral_id INTEGER NOT NULL REFERENCES member_referrals(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('referred_buyer', 'referrer')),
      earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (referral_id, source)
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_member_referral_stamps_customer ON member_referral_stamps (customer_id, earned_at)`;
  await db`ALTER TABLE member_referral_stamps ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ`;
  await db`
    CREATE TABLE IF NOT EXISTS member_referral_rewards (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      amount NUMERIC(10,2) NOT NULL,
      stamp_cost INTEGER NOT NULL,
      milestone INTEGER,
      delivery_discount_percent INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`ALTER TABLE member_referral_rewards ADD COLUMN IF NOT EXISTS milestone INTEGER`;
  await db`ALTER TABLE member_referral_rewards ADD COLUMN IF NOT EXISTS delivery_discount_percent INTEGER NOT NULL DEFAULT 0`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS idx_member_referral_rewards_stage ON member_referral_rewards (customer_id, milestone) WHERE milestone IS NOT NULL`;
  await db`
    CREATE TABLE IF NOT EXISTS member_referral_stamp_spends (
      stamp_id INTEGER PRIMARY KEY REFERENCES member_referral_stamps(id) ON DELETE CASCADE,
      reward_id INTEGER NOT NULL REFERENCES member_referral_rewards(id) ON DELETE CASCADE
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS member_referral_freeze_log (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('freeze', 'restore')),
      note TEXT NOT NULL,
      staff_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_member_referral_freeze_log_customer ON member_referral_freeze_log (customer_id, created_at DESC)`;
  await db`
    CREATE TABLE IF NOT EXISTS member_referral_stage_reports (
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      milestone INTEGER NOT NULL CHECK (milestone IN (5, 10, 15)),
      status TEXT NOT NULL CHECK (status IN ('clear', 'review')),
      summary TEXT NOT NULL,
      referral_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (customer_id, milestone)
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_member_referral_stage_reports_checked ON member_referral_stage_reports (checked_at DESC)`;
}
