import { randomBytes } from 'crypto';
import { requireDb } from '@/lib/db/client';

export type GlowCardDesign = 'passport' | 'orbit' | 'folio';

const DEMO_EMAILS: Record<string, GlowCardDesign> = {
  'glowcard-passport@example.invalid': 'passport',
};

const STARTING_STAMPS: Record<GlowCardDesign, number> = { passport: 4, orbit: 9, folio: 14 };
const REFERRAL_REWARDS = [
  { stamps: 5, amount: 10, deliveryDiscountPercent: 50 },
  { stamps: 10, amount: 20, deliveryDiscountPercent: 50 },
  { stamps: 15, amount: 30, deliveryDiscountPercent: 50 },
];
const exampleReferrals = (stamps: number) => Array.from({ length: stamps }, (_, index) => ({
  id: index + 1, status: 'ready', reason: null,
  date: new Date(Date.now() - (stamps - index) * 86400000).toISOString(),
}));

export function glowCardDemoDesign(email: string): GlowCardDesign | null {
  return DEMO_EMAILS[email.trim().toLowerCase()] ?? null;
}

export async function ensureDemoTable() {
  await requireDb()`
    CREATE TABLE IF NOT EXISTS glow_card_demo_state (
      customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
      design TEXT NOT NULL CHECK (design IN ('passport', 'orbit', 'folio')),
      available_stamps INTEGER NOT NULL DEFAULT 0 CHECK (available_stamps BETWEEN 0 AND 15),
      referrals JSONB NOT NULL DEFAULT '[]'::jsonb,
      vouchers JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function ensureDemoState(customerId: number, design: GlowCardDesign) {
  await requireDb()`
    INSERT INTO glow_card_demo_state (customer_id, design, available_stamps, referrals)
    VALUES (${customerId}, ${design}, ${STARTING_STAMPS[design]}, ${JSON.stringify(exampleReferrals(STARTING_STAMPS[design]))}::jsonb)
    ON CONFLICT (customer_id) DO NOTHING
  `;
}

export async function getGlowCardDemo(customerId: number, design: GlowCardDesign) {
  await ensureDemoState(customerId, design);
  const rows = await requireDb()`
    SELECT available_stamps, referrals, vouchers FROM glow_card_demo_state
    WHERE customer_id = ${customerId} AND design = ${design}
  `;
  const state = rows[0];
  if (!state) throw new Error('Demo card unavailable');
  return {
    demo: true,
    design,
    code: `WG-DEMO-${design.toUpperCase()}`,
    availableStamps: Number(state.available_stamps),
    rewards: REFERRAL_REWARDS,
    referrals: state.referrals,
    vouchers: state.vouchers,
  };
}

export async function addGlowCardDemoStamp(customerId: number, design: GlowCardDesign) {
  await ensureDemoState(customerId, design);
  const event = JSON.stringify({ id: Date.now(), status: 'ready', reason: null, date: new Date().toISOString() });
  const rows = await requireDb()`
    UPDATE glow_card_demo_state SET
      available_stamps = available_stamps + 1,
      referrals = referrals || ${event}::jsonb,
      updated_at = now()
    WHERE customer_id = ${customerId} AND design = ${design} AND available_stamps < 15
    RETURNING customer_id
  `;
  return rows.length > 0;
}

export async function claimGlowCardDemoReward(customerId: number, design: GlowCardDesign, stamps: number) {
  const reward = REFERRAL_REWARDS.find(item => item.stamps === stamps);
  if (!reward) return false;
  await ensureDemoState(customerId, design);
  const code = `DEMO-${randomBytes(5).toString('hex').toUpperCase()}`;
  const voucher = JSON.stringify({ code, amount: reward.amount, stamps, deliveryDiscountPercent: reward.deliveryDiscountPercent, date: new Date().toISOString(), used: false, active: true, expiresAt: null });
  const rows = await requireDb()`
    UPDATE glow_card_demo_state SET
      vouchers = vouchers || ${voucher}::jsonb,
      updated_at = now()
    WHERE customer_id = ${customerId} AND design = ${design} AND available_stamps >= ${stamps}
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(vouchers) item
        WHERE (item->>'stamps')::int = ${stamps}
      )
    RETURNING customer_id
  `;
  return rows.length > 0;
}

export async function redeemGlowCardDemoReward(customerId: number, design: GlowCardDesign, code: string) {
  await ensureDemoState(customerId, design);
  const rows = await requireDb()`
    UPDATE glow_card_demo_state SET
      vouchers = (SELECT jsonb_agg(CASE WHEN item->>'code' = ${code} AND item->>'used' = 'false'
        THEN jsonb_set(item, '{used}', 'true'::jsonb) ELSE item END) FROM jsonb_array_elements(vouchers) item),
      updated_at = now()
    WHERE customer_id = ${customerId} AND design = ${design}
      AND vouchers @> ${JSON.stringify([{ code, used: false }])}::jsonb
    RETURNING customer_id
  `;
  return rows.length > 0;
}

export async function resetGlowCardDemo(customerId: number, design: GlowCardDesign) {
  await ensureDemoState(customerId, design);
  await requireDb()`
    UPDATE glow_card_demo_state SET available_stamps = ${STARTING_STAMPS[design]},
      referrals = ${JSON.stringify(exampleReferrals(STARTING_STAMPS[design]))}::jsonb, vouchers = '[]'::jsonb, updated_at = now()
    WHERE customer_id = ${customerId} AND design = ${design}
  `;
}
