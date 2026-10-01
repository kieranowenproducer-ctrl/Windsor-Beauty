import type { requireDb } from '../client';

/**
 * The order-loyalty replacement for the old referral-stamp tables.  These
 * tables deliberately have different names: old referral history remains an
 * auditable record and can never be mistaken for a paid-order point.
 */
export async function ensureGlowCardLoyalty(db: ReturnType<typeof requireDb>) {
  await db`
    CREATE TABLE IF NOT EXISTS glow_card_cycles (
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      cycle_number INTEGER NOT NULL DEFAULT 1 CHECK (cycle_number > 0),
      points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0 AND points <= 15),
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ,
      PRIMARY KEY (customer_id, cycle_number)
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS glow_card_events (
      id BIGSERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      cycle_number INTEGER NOT NULL,
      event_key TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL CHECK (source IN ('qualifying_order', 'referral_bonus', 'reversal', 'staff_adjustment')),
      points_delta INTEGER NOT NULL CHECK (points_delta IN (-1, 1)),
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      referral_id INTEGER REFERENCES member_referrals(id) ON DELETE SET NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_glow_card_events_customer ON glow_card_events (customer_id, created_at DESC)`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS idx_glow_card_events_order ON glow_card_events (order_id) WHERE source = 'qualifying_order'`;
  await db`
    CREATE TABLE IF NOT EXISTS glow_card_rewards (
      id BIGSERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      cycle_number INTEGER NOT NULL,
      milestone INTEGER NOT NULL CHECK (milestone IN (5, 10, 15)),
      amount NUMERIC(10,2) NOT NULL CHECK (amount IN (10, 20, 30)),
      delivery_discount_percent INTEGER NOT NULL DEFAULT 50 CHECK (delivery_discount_percent BETWEEN 0 AND 100),
      status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'claimed', 'used', 'cancelled')),
      code TEXT UNIQUE,
      reached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      claimed_at TIMESTAMPTZ,
      used_at TIMESTAMPTZ,
      UNIQUE (customer_id, cycle_number, milestone)
    )
  `;
  await db`ALTER TABLE glow_card_rewards ADD COLUMN IF NOT EXISTS delivery_discount_percent INTEGER NOT NULL DEFAULT 50`;
  await db`CREATE INDEX IF NOT EXISTS idx_glow_card_rewards_customer ON glow_card_rewards (customer_id, cycle_number DESC, milestone)`;
}
