import { randomBytes } from 'crypto';
import type { OrderRow } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { ensureGlowCardLoyalty } from '@/lib/db/schema-parts/glow-card-loyalty';

export const GLOW_CARD_ORDER_MINIMUM = 30;
export const GLOW_CARD_REWARDS = [
  { milestone: 5, amount: 10, deliveryDiscountPercent: 50 },
  { milestone: 10, amount: 20, deliveryDiscountPercent: 50 },
  { milestone: 15, amount: 30, deliveryDiscountPercent: 50 },
] as const;

export const glowCardLoyaltyEnabled = () => process.env.WG_GLOW_CARD_LOYALTY_ENABLED === 'true';

export type GlowCardOrderResult = {
  enabled: boolean;
  earnedPoint: boolean;
  reason: 'earned' | 'below_minimum' | 'not_signed_in' | 'not_eligible' | 'already_processed' | 'disabled';
  card: GlowCardSummary | null;
  newlyUnlocked: 5 | 10 | 15 | null;
  /** Every reward unlocked by this payment, including a separate referral
   * bonus for either the buyer or the referrer. */
  newlyUnlockedMilestones: { customerId: number; milestone: 5 | 10 | 15 }[];
};

export type GlowCardSummary = {
  cycle: number;
  points: number;
  nextMilestone: 5 | 10 | 15 | null;
  nextRewardAmount: number | null;
  pointsAway: number;
  rewards: { milestone: number; amount: number; status: string; code: string | null }[];
  /** Unclaimed rewards earned on completed earlier cards. They remain valid
   * after a £30 claim starts a new card. */
  carriedRewards: { cycle: number; milestone: number; amount: number; status: string; code: string | null }[];
};

async function ready() {
  const db = requireDb();
  await ensureGlowCardLoyalty(db);
  return db;
}

function rewardFor(points: number) {
  return GLOW_CARD_REWARDS.find(reward => points <= reward.milestone) ?? null;
}

async function ensureCycle(customerId: number) {
  const db = await ready();
  await db`
    INSERT INTO glow_card_cycles (customer_id, cycle_number, points)
    VALUES (${customerId}, 1, 0)
    ON CONFLICT (customer_id, cycle_number) DO NOTHING
  `;
  const rows = await db`
    SELECT cycle_number, points FROM glow_card_cycles
    WHERE customer_id = ${customerId}
    ORDER BY cycle_number DESC LIMIT 1
  `;
  return { cycle: Number(rows[0].cycle_number), points: Number(rows[0].points) };
}

async function createMilestone(customerId: number, cycle: number, points: number) {
  const reward = GLOW_CARD_REWARDS.find(candidate => candidate.milestone === points);
  if (!reward) return null;
  const db = await ready();
  const inserted = await db`
    INSERT INTO glow_card_rewards (customer_id, cycle_number, milestone, amount)
    VALUES (${customerId}, ${cycle}, ${reward.milestone}, ${reward.amount})
    ON CONFLICT (customer_id, cycle_number, milestone) DO NOTHING
    RETURNING milestone
  `;
  return inserted.length ? reward.milestone : null;
}

async function addPoint(params: {
  customerId: number;
  eventKey: string;
  source: 'qualifying_order' | 'referral_bonus';
  orderId?: number | null;
  referralId?: number | null;
}) {
  const db = await ready();
  await ensureCycle(params.customerId);
  // Lock, event insert and balance increment are one statement.  Without this,
  // two payment callbacks at 14 points could both add a ledger event while the
  // visible balance stopped at 15. A full card does not accept another point
  // until its £30 reward is claimed and starts the next cycle.
  const changed = await db`
    WITH locked_cycle AS MATERIALIZED (
      SELECT customer_id, cycle_number, points FROM glow_card_cycles
      WHERE customer_id = ${params.customerId}
      ORDER BY cycle_number DESC LIMIT 1 FOR UPDATE
    ), event AS (
      INSERT INTO glow_card_events
        (customer_id, cycle_number, event_key, source, points_delta, order_id, referral_id)
      SELECT ${params.customerId}, cycle_number, ${params.eventKey}, ${params.source}, 1,
        ${params.orderId ?? null}, ${params.referralId ?? null}
      FROM locked_cycle WHERE points < 15
      ON CONFLICT DO NOTHING
      RETURNING cycle_number
    ), balance AS (
      UPDATE glow_card_cycles c SET
        points = c.points + 1,
        completed_at = CASE WHEN c.points + 1 >= 15 THEN COALESCE(c.completed_at, now()) ELSE c.completed_at END
      FROM event
      WHERE c.customer_id = ${params.customerId} AND c.cycle_number = event.cycle_number
      RETURNING c.cycle_number, c.points
    )
    SELECT cycle_number, points FROM balance
  `;
  if (!changed.length) return { added: false, newlyUnlocked: null as 5 | 10 | 15 | null };
  const cycle = Number(changed[0].cycle_number);
  const points = Number(changed[0].points);
  return { added: true, newlyUnlocked: await createMilestone(params.customerId, cycle, points) };
}

export async function getGlowCardSummary(customerId: number): Promise<GlowCardSummary> {
  const db = await ready();
  const cycle = await ensureCycle(customerId);
  const rewards = await db`
    SELECT milestone, amount, status, code FROM glow_card_rewards
    WHERE customer_id = ${customerId} AND cycle_number = ${cycle.cycle}
    ORDER BY milestone
  `;
  const carriedRewards = await db`
    SELECT cycle_number, milestone, amount, status, code FROM glow_card_rewards
    WHERE customer_id = ${customerId} AND cycle_number < ${cycle.cycle}
      AND milestone IN (5, 10) AND status IN ('ready', 'claimed')
    ORDER BY cycle_number, milestone
  `;
  const next = rewardFor(cycle.points);
  return {
    cycle: cycle.cycle,
    points: cycle.points,
    nextMilestone: next?.milestone ?? null,
    nextRewardAmount: next?.amount ?? null,
    pointsAway: next ? Math.max(0, next.milestone - cycle.points) : 0,
    rewards: rewards.map(row => ({
      milestone: Number(row.milestone), amount: Number(row.amount), status: String(row.status),
      code: row.code ? String(row.code) : null,
    })),
    carriedRewards: carriedRewards.map(row => ({
      cycle: Number(row.cycle_number), milestone: Number(row.milestone), amount: Number(row.amount),
      status: String(row.status), code: row.code ? String(row.code) : null,
    })),
  };
}

export async function awardGlowCardOrderPoint(order: OrderRow): Promise<GlowCardOrderResult> {
  if (!glowCardLoyaltyEnabled()) {
    return { enabled: false, earnedPoint: false, reason: 'disabled', card: null, newlyUnlocked: null, newlyUnlockedMilestones: [] };
  }
  if (!order.customer_id || !order.payment_confirmed_at || ['refunded', 'cancelled'].includes(order.status)) {
    return { enabled: true, earnedPoint: false, reason: 'not_eligible', card: null, newlyUnlocked: null, newlyUnlockedMilestones: [] };
  }
  if (order.account_link !== 'signed_in') {
    return { enabled: true, earnedPoint: false, reason: 'not_signed_in', card: await getGlowCardSummary(order.customer_id), newlyUnlocked: null, newlyUnlockedMilestones: [] };
  }
  if (Number(order.subtotal) < GLOW_CARD_ORDER_MINIMUM) {
    return { enabled: true, earnedPoint: false, reason: 'below_minimum', card: await getGlowCardSummary(order.customer_id), newlyUnlocked: null, newlyUnlockedMilestones: [] };
  }
  const result = await addPoint({
    customerId: order.customer_id,
    eventKey: `order:${order.id}`,
    source: 'qualifying_order',
    orderId: order.id,
  });
  // A failed referral-bonus attempt must self-heal when a payment webhook is
  // retried. Its own event keys make this safe even when the order point was
  // already recorded by the first callback.
  const referralMilestones = await awardReferralBonusForQualifyingFirstOrder(order).catch(() => []);
  return {
    enabled: true,
    earnedPoint: result.added,
    reason: result.added ? 'earned' : 'already_processed',
    card: await getGlowCardSummary(order.customer_id),
    newlyUnlocked: result.newlyUnlocked,
    newlyUnlockedMilestones: [
      ...(result.newlyUnlocked ? [{ customerId: order.customer_id, milestone: result.newlyUnlocked }] : []),
      ...referralMilestones,
    ],
  };
}

/** A referral is never an account-creation reward. It is earned only when the
 * referred member completes their first paid, signed-in £30+ product order. */
export async function awardReferralBonusForQualifyingFirstOrder(order: OrderRow): Promise<{ customerId: number; milestone: 5 | 10 | 15 }[]> {
  if (!glowCardLoyaltyEnabled() || !order.customer_id || order.account_link !== 'signed_in' ||
      !order.payment_confirmed_at || Number(order.subtotal) < GLOW_CARD_ORDER_MINIMUM) return [];
  const db = await ready();
  const referrals = await db`
    SELECT r.id, r.referrer_id, r.referred_id,
      EXISTS (SELECT 1 FROM affiliate_profiles ap WHERE ap.customer_id = r.referrer_id) AS referrer_is_affiliate
    FROM member_referrals r
    JOIN customers referred ON referred.id = r.referred_id
    JOIN customers referrer ON referrer.id = r.referrer_id
    WHERE r.referred_id = ${order.customer_id}
      AND referred.banned_at IS NULL AND referrer.banned_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM orders earlier
        WHERE earlier.customer_id = r.referred_id AND earlier.id <> ${order.id}
          AND earlier.payment_confirmed_at IS NOT NULL
      )
  `;
  const milestones: { customerId: number; milestone: 5 | 10 | 15 }[] = [];
  for (const referral of referrals) {
    const id = Number(referral.id);
    const referrerId = Number(referral.referrer_id);
    const referredId = Number(referral.referred_id);
    // Affiliate earnings replace referrer stamps, even for an older member link
    // and even while the affiliate profile is paused. The buyer keeps theirs.
    const [forReferrer, forReferred] = await Promise.all([
      referral.referrer_is_affiliate ? Promise.resolve(null) : addPoint({ customerId: referrerId, eventKey: `referral:${id}:referrer`, source: 'referral_bonus', referralId: id }),
      addPoint({ customerId: referredId, eventKey: `referral:${id}:referred`, source: 'referral_bonus', referralId: id }),
    ]);
    if (forReferrer?.newlyUnlocked) milestones.push({ customerId: referrerId, milestone: forReferrer.newlyUnlocked });
    if (forReferred.newlyUnlocked) milestones.push({ customerId: referredId, milestone: forReferred.newlyUnlocked });
  }
  return milestones;
}

type ReversalResult = {
  reversedEvents: number;
  disabledRewardCodes: number;
};

/**
 * Remove loyalty value earned from an order that has subsequently been
 * cancelled or refunded. This is deliberately an append-only reversal: the
 * original award remains in the ledger and a unique negative event records
 * why the balance changed. Calling it again is safe.
 *
 * A referred member's qualifying first order can create three awards: their
 * own order point plus the two referral bonus points. When that exact first
 * order is reversed, all three are reversed as well.
 */
export async function reverseGlowCardOrderPoints(order: OrderRow): Promise<ReversalResult> {
  if (!glowCardLoyaltyEnabled() || !order.customer_id || !['refunded', 'cancelled'].includes(order.status)) {
    return { reversedEvents: 0, disabledRewardCodes: 0 };
  }

  const db = await ready();
  const originalEvents = await db`
    SELECT id, customer_id, cycle_number, event_key
    FROM glow_card_events
    WHERE order_id = ${order.id} AND source = 'qualifying_order' AND points_delta = 1
  `;

  // Referral events do not carry an order id, so only select them when this
  // order was the referred member's original paid order. That is the same
  // condition used to issue a referral bonus in the first place.
  const referralEvents = await db`
    SELECT e.id, e.customer_id, e.cycle_number, e.event_key
    FROM member_referrals r
    JOIN glow_card_events e ON e.referral_id = r.id
      AND e.source = 'referral_bonus' AND e.points_delta = 1
    WHERE r.referred_id = ${order.customer_id}
      AND NOT EXISTS (
        SELECT 1 FROM orders earlier
        WHERE earlier.customer_id = r.referred_id AND earlier.id <> ${order.id}
          AND earlier.payment_confirmed_at IS NOT NULL
      )
  `;

  const affected = [...originalEvents, ...referralEvents].map(row => ({
    customerId: Number(row.customer_id),
    cycle: Number(row.cycle_number),
    eventKey: String(row.event_key),
  }));
  const changedCycles = new Map<string, { customerId: number; cycle: number }>();
  let reversedEvents = 0;

  for (const event of affected) {
    const reversal = await db`
      INSERT INTO glow_card_events (customer_id, cycle_number, event_key, source, points_delta, note)
      VALUES (${event.customerId}, ${event.cycle}, ${`reversal:${event.eventKey}`}, 'reversal', -1,
        ${`Order ${order.order_number} ${order.status}`})
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id
    `;
    if (!reversal.length) continue;
    reversedEvents += 1;
    await db`
      UPDATE glow_card_cycles
      SET points = GREATEST(0, points - 1)
      WHERE customer_id = ${event.customerId} AND cycle_number = ${event.cycle}
    `;
    changedCycles.set(`${event.customerId}:${event.cycle}`, { customerId: event.customerId, cycle: event.cycle });
  }

  let disabledRewardCodes = 0;
  for (const changed of Array.from(changedCycles.values())) {
    const [balance] = await db`
      SELECT points FROM glow_card_cycles
      WHERE customer_id = ${changed.customerId} AND cycle_number = ${changed.cycle}
    `;
    const points = Number(balance?.points ?? 0);
    const noLongerEarned = await db`
      SELECT id, code, status FROM glow_card_rewards
      WHERE customer_id = ${changed.customerId} AND cycle_number = ${changed.cycle}
        AND milestone > ${points} AND status IN ('ready', 'claimed')
    `;
    for (const reward of noLongerEarned) {
      const code = reward.code ? String(reward.code) : null;
      if (!code) {
        await db`UPDATE glow_card_rewards SET status = 'cancelled' WHERE id = ${Number(reward.id)} AND status = 'ready'`;
        continue;
      }
      const disabled = await db`
        UPDATE discount_codes SET active = false
        WHERE code = ${code} AND times_redeemed = 0 AND active = true
        RETURNING code
      `;
      if (disabled.length) {
        disabledRewardCodes += 1;
        await db`UPDATE glow_card_rewards SET status = 'cancelled' WHERE id = ${Number(reward.id)} AND status = 'claimed'`;
      }
    }
  }
  return { reversedEvents, disabledRewardCodes };
}

function voucherCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(9);
  return `WG-GLOW-${Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')}`;
}

/** Claiming £10/£20 keeps the same card. Claiming the £30 reward completes
 * it and opens the next zero-point cycle. */
export async function claimGlowCardReward(customerId: number, milestone: 5 | 10 | 15, requestedCycle?: number) {
  const reward = GLOW_CARD_REWARDS.find(item => item.milestone === milestone);
  if (!reward) return null;
  const db = await ready();
  const currentCycle = await ensureCycle(customerId);
  const cycle = requestedCycle ?? currentCycle.cycle;
  if (!Number.isInteger(cycle) || cycle < 1 || cycle > currentCycle.cycle) return null;
  const code = voucherCode();
  const claimed = await db`
    UPDATE glow_card_rewards SET status = 'claimed', code = ${code}, claimed_at = now()
    WHERE customer_id = ${customerId} AND cycle_number = ${cycle}
      AND milestone = ${milestone} AND status = 'ready'
    RETURNING id
  `;
  if (!claimed.length) return null;
  await db`
    INSERT INTO discount_codes (code, percentage, discount_type, fixed_amount, scope_type, active, expires_at, usage_limit, min_order_value)
    VALUES (${code}, NULL, 'fixed', ${reward.amount}, 'all', true, now() + interval '12 months', 1, 30)
  `;
  if (milestone === 15 && cycle === currentCycle.cycle) {
    await db`
      INSERT INTO glow_card_cycles (customer_id, cycle_number, points)
      VALUES (${customerId}, ${currentCycle.cycle + 1}, 0)
      ON CONFLICT (customer_id, cycle_number) DO NOTHING
    `;
  }
  return { code, amount: reward.amount, reset: milestone === 15 && cycle === currentCycle.cycle };
}

export async function glowCardVoucherOwnedBy(code: string, customerId: number) {
  if (!code.toUpperCase().startsWith('WG-GLOW-')) return null;
  const db = await ready();
  const rows = await db`
    SELECT 1 FROM glow_card_rewards r
    JOIN discount_codes d ON d.code = r.code
    WHERE upper(r.code) = upper(${code}) AND r.customer_id = ${customerId}
      AND r.status = 'claimed' AND d.active = true
      AND d.times_redeemed < 1 AND (d.expires_at IS NULL OR d.expires_at > now())
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function glowCardVoucherDeliveryDiscountPercent(code: string, customerId: number) {
  if (!code.toUpperCase().startsWith('WG-GLOW-')) return 0;
  const db = await ready();
  const rows = await db`
    SELECT r.delivery_discount_percent FROM glow_card_rewards r
    JOIN discount_codes d ON d.code = r.code
    WHERE upper(r.code) = upper(${code}) AND r.customer_id = ${customerId}
      AND r.status = 'claimed' AND d.active = true AND d.times_redeemed < 1
      AND (d.expires_at IS NULL OR d.expires_at > now()) LIMIT 1
  `;
  return Math.max(0, Math.min(100, Number(rows[0]?.delivery_discount_percent ?? 0)));
}

/** Reserve a claimed order-loyalty reward while its checkout order is being
 * created. The guarded counter prevents two tabs spending one code. */
export async function reserveGlowCardVoucher(code: string, customerId: number): Promise<boolean> {
  if (!code.toUpperCase().startsWith('WG-GLOW-')) return false;
  const db = await ready();
  const rows = await db`
    UPDATE discount_codes d SET times_redeemed = times_redeemed + 1
    FROM glow_card_rewards r
    JOIN customers c ON c.id = r.customer_id
    WHERE d.code = r.code AND upper(d.code) = upper(${code})
      AND r.customer_id = ${customerId} AND r.status = 'claimed'
      AND c.glow_card_frozen_at IS NULL
      AND d.active = true AND d.times_redeemed = 0
      AND (d.expires_at IS NULL OR d.expires_at > now())
    RETURNING d.id
  `;
  return rows.length > 0;
}

/** Undo a reservation when the checkout order was not saved. */
export async function releaseGlowCardVoucherReservation(code: string, customerId: number) {
  if (!code.toUpperCase().startsWith('WG-GLOW-')) return false;
  const db = await ready();
  const rows = await db`
    UPDATE discount_codes d SET times_redeemed = 0
    FROM glow_card_rewards r
    WHERE d.code = r.code AND upper(d.code) = upper(${code})
      AND r.customer_id = ${customerId} AND r.status = 'claimed'
      AND d.times_redeemed = 1
    RETURNING d.id
  `;
  return rows.length > 0;
}

/** Release a code held by an unpaid checkout that has expired or been
 * cancelled. A paid order remains spent. */
export async function releaseGlowCardVoucherForUnpaidOrder(orderNumber: string) {
  const db = await ready();
  const rows = await db`
    UPDATE discount_codes d SET times_redeemed = 0
    FROM glow_card_rewards r, orders o
    WHERE d.code = r.code AND upper(o.discount_code) = upper(r.code)
      AND o.order_number = ${orderNumber}
      AND o.payment_confirmed_at IS NULL
      AND o.status IN ('payment_failed', 'payment_cancelled', 'cancelled')
      AND r.status = 'claimed' AND d.times_redeemed = 1
    RETURNING d.id
  `;
  return rows.length > 0;
}

/** A reservation becomes a completed redemption only after payment reaches
 * the shop. The reward row then accurately tells the member it has been used. */
export async function markGlowCardVoucherUsedForPaidOrder(orderNumber: string) {
  const db = await ready();
  const rows = await db`
    UPDATE glow_card_rewards r SET status = 'used', used_at = now()
    FROM discount_codes d, orders o
    WHERE d.code = r.code AND upper(o.discount_code) = upper(r.code)
      AND o.order_number = ${orderNumber}
      AND o.payment_confirmed_at IS NOT NULL
      AND o.status NOT IN ('cancelled', 'refunded')
      AND r.status = 'claimed' AND d.times_redeemed = 1
    RETURNING r.id
  `;
  return rows.length > 0;
}
