import { randomBytes } from 'crypto';
import { requireDb } from '@/lib/db/client';
import { createSecurityReviewCase } from '@/lib/db/securityReviews';

// Keep the unfinished scheme dark on the live shop until the terms and launch are approved.
// The original referral-stamp scheme and the order-loyalty Glow Card are
// mutually exclusive. Keeping the old routes dark when the replacement is on
// prevents one real order from earning two different kinds of reward.
export const referralsEnabled = () => process.env.WG_MEMBER_REFERRALS_ENABLED === 'true'
  && process.env.WG_GLOW_CARD_LOYALTY_ENABLED !== 'true';

export const REFERRAL_MIN_FIRST_ORDER = 30;
export const REFERRAL_HOLD_DAYS = 0;
export const REFERRAL_ACTIVITY_WINDOW_DAYS = 30;
export const REFERRAL_SHARED_IP_ACCOUNT_LIMIT = 3;
export const REFERRAL_REWARDS = [
  { stamps: 5, amount: 10, deliveryDiscountPercent: 50 },
  { stamps: 10, amount: 20, deliveryDiscountPercent: 50 },
  { stamps: 15, amount: 30, deliveryDiscountPercent: 50 },
] as const;

export function applyReferralDeliveryDiscount(
  shippingCost: number,
  isStandardUkDelivery: boolean,
  discountPercent: number,
) {
  if (!isStandardUkDelivery || shippingCost <= 0 || discountPercent <= 0) return Math.max(0, shippingCost);
  const safePercent = Math.max(0, Math.min(100, discountPercent));
  return Math.round(shippingCost * (1 - safePercent / 100) * 100) / 100;
}

function randomCode(prefix: string) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return prefix + Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

function normalisePhone(value: unknown): string {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('0044')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('44') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

function normaliseAddress(line1: unknown, postcode: unknown): string {
  const line = String(line1 ?? '').replace(/\W/g, '').toUpperCase();
  const post = String(postcode ?? '').replace(/\W/g, '').toUpperCase();
  return line && post ? `${line}|${post}` : '';
}

export function normaliseReferralCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const clean = code.trim().toUpperCase();
  return /^WG-R-[A-HJ-NP-Z2-9]{10}$/.test(clean) ? clean : null;
}

export async function findReferrerByCode(code: string): Promise<number | null> {
  const rows = await requireDb()`
    SELECT c.customer_id FROM member_referral_codes c
    JOIN customers m ON m.id = c.customer_id
    WHERE c.code = ${code} AND m.email_verified = true
      AND m.banned_at IS NULL AND m.glow_card_frozen_at IS NULL
      AND m.account_status = 'active'
  `;
  return rows.length ? Number(rows[0].customer_id) : null;
}

export async function getOrCreateReferralCode(customerId: number): Promise<string> {
  const db = requireDb();
  const allowed = await db`
    SELECT 1 FROM customers
    WHERE id = ${customerId} AND banned_at IS NULL
      AND glow_card_frozen_at IS NULL AND account_status = 'active'
  `;
  if (!allowed.length) throw new Error('Glow Card access is not available');
  const existing = await db`SELECT code FROM member_referral_codes WHERE customer_id = ${customerId}`;
  if (existing.length) return String(existing[0].code);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode('WG-R-');
    const created = await db`
      INSERT INTO member_referral_codes (customer_id, code)
      VALUES (${customerId}, ${code})
      ON CONFLICT DO NOTHING RETURNING code
    `;
    if (created.length) return String(created[0].code);
    const concurrent = await db`SELECT code FROM member_referral_codes WHERE customer_id = ${customerId}`;
    if (concurrent.length) return String(concurrent[0].code);
  }
  throw new Error('Could not create a referral code');
}

export async function recordMemberReferral(referrerId: number, referredId: number): Promise<boolean> {
  if (referrerId === referredId) return false;
  const rows = await requireDb()`
    INSERT INTO member_referrals (referrer_id, referred_id)
    SELECT ${referrerId}, c.id FROM customers c
    WHERE c.id = ${referredId}
      AND c.banned_at IS NULL AND c.glow_card_frozen_at IS NULL
      AND (SELECT glow_card_frozen_at FROM customers WHERE id = ${referrerId}) IS NULL
      AND lower(c.email) <> (SELECT lower(email) FROM customers WHERE id = ${referrerId})
      AND NOT EXISTS (
        SELECT 1 FROM orders WHERE lower(email) = lower(c.email)
          AND payment_confirmed_at IS NOT NULL
      )
    ON CONFLICT (referred_id) DO NOTHING
    RETURNING id
  `;
  if (rows.length) return true;
  const existing = await requireDb()`
    SELECT 1 FROM member_referrals WHERE referred_id = ${referredId}
      AND referrer_id = ${referrerId} LIMIT 1
  `;
  return existing.length > 0;
}

interface ReferralRow {
  id: number;
  referrer_id: number;
  referred_id: number;
  status: string;
  first_order_id: number | null;
  created_at: string;
  review_reason: string | null;
  referrer_phone: string | null;
  referred_phone: string | null;
  referrer_postcode: string | null;
  referred_postcode: string | null;
  referrer_address: string | null;
  referred_address: string | null;
  referrer_banned: string | null;
  referred_banned: string | null;
  referrer_frozen_at: string | null;
  referred_frozen_at: string | null;
  referred_verified: boolean;
}

function isSimilarityReviewReason(reason: string | null): boolean {
  if (!reason) return false;
  return reason === 'Matching phone numbers'
    || reason === 'Matching delivery addresses'
    || reason === 'Phone number already used by another referred account'
    || reason === 'Delivery address already used by another referred account'
    || /referred accounts used the same internet connection/.test(reason)
    || reason === 'Matching phone details need staff review'
    || reason === 'Matching delivery details need staff review'
    || reason === 'Connected accounts need staff review';
}

async function syncOneReferral(row: ReferralRow) {
  if (row.status === 'rejected') return;
  const db = requireDb();
  if (row.status === 'ready') {
    const current = await db`SELECT status FROM orders WHERE id = ${row.first_order_id}`;
    if (!current.length || !['refunded', 'cancelled'].includes(String(current[0].status))) return;
    // A late refund removes unspent stamps and closes any unused voucher
    // bought with these stamps. A used voucher remains an audit issue for staff.
    await db`
      WITH rejected AS (
        UPDATE member_referrals SET status = 'rejected',
          review_reason = 'First order refunded after stamps were issued; check any used rewards'
        WHERE id = ${row.id} AND status = 'ready'
        RETURNING id, referrer_id, created_at, qualified_at
      ), revoked AS (
        UPDATE member_referral_stamps s SET revoked_at = now()
        FROM rejected r WHERE s.referral_id = r.id AND s.revoked_at IS NULL
        RETURNING s.id
      ), affected AS (
        SELECT DISTINCT x.reward_id FROM member_referral_stamp_spends x
        JOIN revoked s ON s.id = x.stamp_id
      ), disabled AS (
        UPDATE discount_codes d SET active = false
        FROM member_referral_rewards w, affected a
        WHERE w.id = a.reward_id AND d.code = w.code AND d.times_redeemed = 0
        RETURNING d.code
      ), freed AS (
        DELETE FROM member_referral_stamp_spends x
        USING member_referral_rewards w, disabled d
        WHERE x.reward_id = w.id AND w.code = d.code
          AND NOT EXISTS (SELECT 1 FROM revoked r WHERE r.id = x.stamp_id)
        RETURNING x.stamp_id
      ), released AS (
        UPDATE member_referral_months m SET credited = greatest(0, m.credited - 1)
        FROM rejected r WHERE m.referrer_id = r.referrer_id
          AND m.month_start = date_trunc('month', coalesce(r.qualified_at, r.created_at))::date
        RETURNING m.referrer_id
      )
      SELECT count(*) FROM revoked
    `;
    return;
  }
  if (row.referrer_frozen_at || row.referred_frozen_at) {
    await db`
      UPDATE member_referrals SET status = 'review',
        review_reason = 'A Glow Card account is frozen by staff'
      WHERE id = ${row.id} AND status NOT IN ('ready', 'rejected')
    `;
    return;
  }
  const orders = await db`
    SELECT id, subtotal, status, dispatched_at, payment_confirmed_at, account_link,
      shipping_line1, shipping_postcode, phone
    FROM orders
    WHERE customer_id = ${row.referred_id} AND payment_confirmed_at IS NOT NULL
    ORDER BY payment_confirmed_at, id LIMIT 1
  `;
  const first = orders[0];
  if (!first) return;
  const firstId = Number(first.id);
  const subtotal = Number(first.subtotal);
  if (subtotal < REFERRAL_MIN_FIRST_ORDER || first.account_link !== 'signed_in' ||
      ['refunded', 'cancelled'].includes(String(first.status))) {
    await db`
      UPDATE member_referrals SET first_order_id = ${firstId}, status = 'rejected',
        review_reason = ${subtotal < REFERRAL_MIN_FIRST_ORDER ? 'First order below £30' :
          first.account_link !== 'signed_in' ? 'First order was not placed while signed in' :
          'First order refunded or cancelled'}
      WHERE id = ${row.id} AND status <> 'ready'
    `;
    return;
  }
  // Historical similarity reviews are advisory now and must not trap a reward.
  // Explicit staff freezes, bans and limit reviews keep their existing controls.
  if (row.status === 'review' && !isSimilarityReviewReason(row.review_reason)) return;
  if (row.referrer_banned || row.referred_banned) {
    await db`
      UPDATE member_referrals SET first_order_id = ${firstId}, status = 'review',
        review_reason = 'An account is banned'
      WHERE id = ${row.id} AND status NOT IN ('ready', 'rejected')
    `;
    return;
  }
  if (!row.referred_verified) {
    await db`
      UPDATE member_referrals SET first_order_id = ${firstId}, status = 'waiting_verification',
        review_reason = NULL
      WHERE id = ${row.id} AND status NOT IN ('ready', 'rejected')
    `;
    return;
  }

  const buyerPhone = normalisePhone(first.phone || row.referred_phone);
  const buyerAddress = normaliseAddress(
    first.shipping_line1 || row.referred_address,
    first.shipping_postcode || row.referred_postcode,
  );
  const samePhone = buyerPhone && normalisePhone(row.referrer_phone) === buyerPhone;
  const sameAddress = buyerAddress && normaliseAddress(row.referrer_address, row.referrer_postcode) === buyerAddress;

  const otherReferrals = await db`
    SELECT r.id, coalesce(o.phone, c.phone) AS phone,
      coalesce(o.shipping_line1, c.address_line1) AS address_line1,
      coalesce(o.shipping_postcode, c.address_postcode) AS postcode
    FROM member_referrals r
    JOIN customers c ON c.id = r.referred_id
    LEFT JOIN orders o ON o.id = r.first_order_id
    WHERE r.id <> ${row.id} AND r.status <> 'rejected'
      AND r.created_at > now() - interval '12 months'
  `;
  const duplicatePhone = buyerPhone && otherReferrals.some(other => normalisePhone(other.phone) === buyerPhone);
  const duplicateAddress = buyerAddress && otherReferrals.some(other =>
    normaliseAddress(other.address_line1, other.postcode) === buyerAddress
  );

  const sharedInternet = await db`
    WITH buyer_addresses AS (
      SELECT DISTINCT ip_address FROM member_login_log
      WHERE customer_id = ${row.referred_id} AND ip_address IS NOT NULL
        AND created_at > now() - interval '30 days'
    )
    SELECT l.ip_address, count(DISTINCT l.customer_id)::int AS accounts
    FROM member_login_log l
    JOIN buyer_addresses b ON b.ip_address = l.ip_address
    JOIN member_referrals r ON r.referred_id = l.customer_id
    WHERE l.customer_id IS NOT NULL
      AND l.created_at > now() - interval '30 days'
      AND r.status <> 'rejected'
    GROUP BY l.ip_address
    HAVING count(DISTINCT l.customer_id) >= ${REFERRAL_SHARED_IP_ACCOUNT_LIMIT}
    LIMIT 1
  `;
  const reason = samePhone ? 'Matching phone numbers' :
    sameAddress ? 'Matching delivery addresses' :
    duplicatePhone ? 'Phone number already used by another referred account' :
    duplicateAddress ? 'Delivery address already used by another referred account' :
    sharedInternet.length ? `${sharedInternet[0].accounts} referred accounts used the same internet connection within ${REFERRAL_ACTIVITY_WINDOW_DAYS} days` : null;
  if (reason) {
    // Similarity is evidence for Security Review, not a reward verdict. This
    // write is best-effort and the qualification flow continues regardless.
    await createSecurityReviewCase({
      customerId: row.referred_id,
      sourceEvent: 'order',
      ipAddress: sharedInternet[0]?.ip_address ? String(sharedInternet[0].ip_address) : null,
      caseType: 'referral_similarity',
    });
  }
  const dispatchedAt = first.dispatched_at ? new Date(String(first.dispatched_at)).getTime() : 0;
  const holdEnded = dispatchedAt > 0 && Date.now() >= dispatchedAt + REFERRAL_HOLD_DAYS * 86400000;
  if (!holdEnded || !['dispatched', 'delivered'].includes(String(first.status))) {
    await db`
      UPDATE member_referrals SET first_order_id = ${firstId},
        status = ${row.status === 'approved' ? 'approved' : 'holding'}, review_reason = NULL
      WHERE id = ${row.id} AND status NOT IN ('ready', 'rejected')
    `;
    return;
  }
  // The month counter is reserved in the same statement as both stamps. Its
  // guarded upsert enforces the cap even when two card requests run together.
  await db`
    WITH candidate AS (
      SELECT id, referrer_id, status FROM member_referrals
      WHERE id = ${row.id} AND status NOT IN ('ready', 'rejected') FOR UPDATE
    ), reserved AS (
      INSERT INTO member_referral_months (referrer_id, month_start, credited)
      SELECT referrer_id, date_trunc('month', now())::date, 1 FROM candidate WHERE true
      ON CONFLICT (referrer_id, month_start) DO UPDATE
        SET credited = member_referral_months.credited + 1
        WHERE member_referral_months.credited < 5
      RETURNING referrer_id
    ), made_ready AS (
      UPDATE member_referrals SET first_order_id = ${firstId}, status = 'ready',
        review_reason = NULL, qualified_at = now()
      FROM reserved WHERE member_referrals.id = ${row.id}
      RETURNING member_referrals.id, member_referrals.referrer_id, member_referrals.referred_id
    )
    INSERT INTO member_referral_stamps (customer_id, referral_id, source)
    SELECT referrer_id, id, 'referrer' FROM made_ready
    UNION ALL
    SELECT referred_id, id, 'referred_buyer' FROM made_ready
    ON CONFLICT (referral_id, source) DO NOTHING
  `;
  const latest = await db`SELECT status FROM member_referrals WHERE id = ${row.id}`;
  if (['approved', 'holding', 'waiting_order', 'waiting_verification'].includes(String(latest[0]?.status))) {
    await db`
      UPDATE member_referrals SET first_order_id = ${firstId}, status = 'review',
        review_reason = 'Monthly referral limit reached'
      WHERE id = ${row.id} AND status IN ('approved', 'holding', 'waiting_order', 'waiting_verification')
    `;
  }
}

export async function syncMemberReferrals(customerId: number) {
  const rows = await requireDb()`
    SELECT r.*, a.phone AS referrer_phone, b.phone AS referred_phone,
      a.address_postcode AS referrer_postcode, b.address_postcode AS referred_postcode,
      a.address_line1 AS referrer_address, b.address_line1 AS referred_address,
      a.banned_at AS referrer_banned, b.banned_at AS referred_banned,
      a.glow_card_frozen_at AS referrer_frozen_at,
      b.glow_card_frozen_at AS referred_frozen_at,
      b.email_verified AS referred_verified
    FROM member_referrals r
    JOIN customers a ON a.id = r.referrer_id
    JOIN customers b ON b.id = r.referred_id
    WHERE r.referrer_id = ${customerId} OR r.referred_id = ${customerId}
    ORDER BY r.created_at DESC LIMIT 100
  `;
  for (const row of rows) await syncOneReferral(row as unknown as ReferralRow);
}

export async function syncPendingMemberReferrals(limit = 200) {
  const rows = await requireDb()`
    SELECT DISTINCT r.referred_id AS customer_id
    FROM member_referrals r
    LEFT JOIN orders o ON o.id = r.first_order_id
    WHERE r.status IN ('waiting_order', 'waiting_verification', 'holding', 'approved')
       OR (r.status = 'ready' AND o.status IN ('refunded', 'cancelled'))
    ORDER BY r.referred_id
    LIMIT ${limit}
  `;
  for (const row of rows) await syncMemberReferrals(Number(row.customer_id));
  return rows.length;
}

export async function memberReferralCard(customerId: number) {
  await syncMemberReferrals(customerId);
  const db = requireDb();
  const code = await getOrCreateReferralCode(customerId);
  const [balance, referrals, rewards] = await Promise.all([
    db`
      SELECT least(count(*), 15)::int AS total FROM member_referral_stamps s
      JOIN member_referrals r ON r.id = s.referral_id
      WHERE s.customer_id = ${customerId}
        AND s.revoked_at IS NULL
        AND r.status = 'ready'
    `,
    db`
      SELECT r.id, r.status, r.review_reason, r.created_at, r.qualified_at
      FROM member_referrals r
      WHERE r.referrer_id = ${customerId} ORDER BY r.created_at DESC LIMIT 50
    `,
    db`
      SELECT w.code, w.amount, coalesce(w.milestone, w.stamp_cost) AS milestone,
        w.delivery_discount_percent, w.created_at,
        d.times_redeemed, d.expires_at, d.active
      FROM member_referral_rewards w JOIN discount_codes d ON d.code = w.code
      WHERE w.customer_id = ${customerId} ORDER BY w.created_at DESC LIMIT 20
    `,
  ]);
  return {
    code,
    availableStamps: Number(balance[0]?.total ?? 0),
    rewards: REFERRAL_REWARDS,
    referrals: referrals.map(r => ({
      id: Number(r.id), status: String(r.status), reason: r.review_reason ? String(r.review_reason) : null,
      date: String(r.created_at), qualifiedAt: r.qualified_at ? String(r.qualified_at) : null,
    })),
    vouchers: rewards.map(r => ({
      code: String(r.code), amount: Number(r.amount), stamps: Number(r.milestone),
      deliveryDiscountPercent: Number(r.delivery_discount_percent ?? 0),
      date: String(r.created_at), used: Number(r.times_redeemed) > 0,
      active: Boolean(r.active),
      expiresAt: r.expires_at ? String(r.expires_at) : null,
    })),
  };
}

async function auditReferralStage(customerId: number, milestone: number): Promise<boolean> {
  await syncMemberReferrals(customerId);
  const db = requireDb();
  const candidates = await db`
    WITH ranked AS (
      SELECT s.id, s.referral_id,
        row_number() OVER (ORDER BY s.earned_at, s.id) AS stamp_number
      FROM member_referral_stamps s
      WHERE s.customer_id = ${customerId} AND s.revoked_at IS NULL
    )
    SELECT x.id AS stamp_id, r.id AS referral_id, r.referred_id, r.status, r.review_decision,
      o.status AS order_status, o.subtotal, o.payment_confirmed_at, o.dispatched_at,
      o.account_link, coalesce(o.phone, referred.phone) AS buyer_phone,
      coalesce(o.shipping_line1, referred.address_line1) AS buyer_address,
      coalesce(o.shipping_postcode, referred.address_postcode) AS buyer_postcode,
      referrer.phone AS referrer_phone, referrer.address_line1 AS referrer_address,
      referrer.address_postcode AS referrer_postcode,
      referred.email_verified, referred.banned_at AS referred_banned,
      referred.glow_card_frozen_at AS referred_frozen,
      referrer.banned_at AS referrer_banned,
      referrer.glow_card_frozen_at AS referrer_frozen
    FROM ranked x
    JOIN member_referrals r ON r.id = x.referral_id
    JOIN customers referred ON referred.id = r.referred_id
    JOIN customers referrer ON referrer.id = r.referrer_id
    LEFT JOIN orders o ON o.id = r.first_order_id
    WHERE x.stamp_number > ${milestone - 5} AND x.stamp_number <= ${milestone}
    ORDER BY x.stamp_number
  `;

  let eligibilityReason: string | null = null;
  let signalReason: string | null = null;
  if (candidates.length !== 5) eligibilityReason = 'Five verified invitations are required for this reward';
  const phones = new Set<string>();
  const addresses = new Set<string>();
  const approvedPhones = new Set<string>();
  const approvedAddresses = new Set<string>();
  for (const row of candidates) {
    const dispatchedAt = row.dispatched_at ? new Date(String(row.dispatched_at)).getTime() : 0;
    const holdPassed = dispatchedAt > 0 && Date.now() >= dispatchedAt + REFERRAL_HOLD_DAYS * 86400000;
    if (String(row.status) !== 'ready' || !row.payment_confirmed_at ||
        !['dispatched', 'delivered'].includes(String(row.order_status)) || !holdPassed ||
        Number(row.subtotal) < REFERRAL_MIN_FIRST_ORDER || row.account_link !== 'signed_in' ||
        !row.email_verified || row.referred_banned || row.referrer_banned ||
        row.referred_frozen || row.referrer_frozen) {
      eligibilityReason = eligibilityReason ?? 'One or more supporting invitations no longer passes the final checks';
    }
    const phone = normalisePhone(row.buyer_phone);
    const address = normaliseAddress(row.buyer_address, row.buyer_postcode);
    if (row.review_decision !== 'approve' && phone && !approvedPhones.has(phone) && (phone === normalisePhone(row.referrer_phone) || phones.has(phone))) {
      signalReason = signalReason ?? 'Matching phone details need staff review';
    }
    if (row.review_decision !== 'approve' && address && !approvedAddresses.has(address) && (address === normaliseAddress(row.referrer_address, row.referrer_postcode) || addresses.has(address))) {
      signalReason = signalReason ?? 'Matching delivery details need staff review';
    }
    if (phone) phones.add(phone);
    if (address) addresses.add(address);
    if (row.review_decision === 'approve' && phone) approvedPhones.add(phone);
    if (row.review_decision === 'approve' && address) approvedAddresses.add(address);
  }

  let sharedIp: string | null = null;
  if (candidates.length) {
    const sharedInternet = await db`
      WITH ranked AS (
        SELECT s.referral_id,
          row_number() OVER (ORDER BY s.earned_at, s.id) AS stamp_number
        FROM member_referral_stamps s
        WHERE s.customer_id = ${customerId} AND s.revoked_at IS NULL
      ), supporting_referrals AS (
        SELECT DISTINCT r.referred_id
        FROM ranked x JOIN member_referrals r ON r.id = x.referral_id
        WHERE x.stamp_number > ${milestone - 5} AND x.stamp_number <= ${milestone}
      ), addresses AS (
        SELECT DISTINCT ip_address FROM member_login_log
        WHERE customer_id IN (SELECT referred_id FROM supporting_referrals)
          AND ip_address IS NOT NULL AND created_at > now() - interval '30 days'
      )
      SELECT l.ip_address, count(DISTINCT l.customer_id)::int AS accounts
      FROM member_login_log l JOIN addresses a ON a.ip_address = l.ip_address
      WHERE l.customer_id IS NOT NULL AND l.created_at > now() - interval '30 days'
      GROUP BY l.ip_address
      HAVING count(DISTINCT l.customer_id) >= ${REFERRAL_SHARED_IP_ACCOUNT_LIMIT}
      LIMIT 1
    `;
    if (sharedInternet.length && !candidates.some(row => row.review_decision === 'approve')) {
      signalReason = signalReason ?? 'Connected accounts need staff review';
      sharedIp = String(sharedInternet[0].ip_address);
    }
  }

  if (signalReason && candidates.length) {
    for (const row of candidates) {
      await createSecurityReviewCase({
        customerId: Number(row.referred_id),
        sourceEvent: 'order',
        ipAddress: sharedIp,
        caseType: 'referral_similarity',
      });
    }
  }
  const reportStatus = eligibilityReason || signalReason ? 'review' : 'clear';
  const reportSummary = eligibilityReason ?? signalReason ?? 'All five supporting invitations passed the automatic final checks';
  const referralIds = candidates.map(row => Number(row.referral_id));
  await db`
    INSERT INTO member_referral_stage_reports
      (customer_id, milestone, status, summary, referral_ids, checked_at)
    VALUES (${customerId}, ${milestone}, ${reportStatus}, ${reportSummary},
      ${JSON.stringify(referralIds)}::jsonb, now())
    ON CONFLICT (customer_id, milestone) DO UPDATE SET
      status = EXCLUDED.status,
      summary = EXCLUDED.summary,
      referral_ids = EXCLUDED.referral_ids,
      checked_at = now()
  `;
  // Similarity never controls eligibility. Only the real reward invariants do.
  return !eligibilityReason;
}

export async function claimReferralReward(customerId: number, milestone: number) {
  const reward = REFERRAL_REWARDS.find(r => r.stamps === milestone);
  if (!reward) return null;
  const code = randomCode('WG-STAMP-');
  const db = requireDb();
  if (await isGlowCardFrozen(customerId)) return null;
  if (!(await auditReferralStage(customerId, milestone))) throw new Error('REFERRAL_STAGE_REVIEW');
  const rows = await db`
    WITH allowed_account AS MATERIALIZED (
      SELECT id FROM customers
      WHERE id = ${customerId} AND glow_card_frozen_at IS NULL
      FOR UPDATE
    ), ranked AS MATERIALIZED (
      SELECT s.id, s.referral_id,
        row_number() OVER (ORDER BY s.earned_at, s.id) AS stamp_number
      FROM member_referral_stamps s
      WHERE s.customer_id = ${customerId}
        AND EXISTS (SELECT 1 FROM allowed_account)
        AND s.revoked_at IS NULL
    ), available AS (
      SELECT s.id FROM ranked s
      JOIN member_referrals r ON r.id = s.referral_id
      JOIN orders o ON o.id = r.first_order_id
      JOIN customers referred ON referred.id = r.referred_id
      JOIN customers referrer ON referrer.id = r.referrer_id
      WHERE s.stamp_number > ${milestone - 5} AND s.stamp_number <= ${milestone}
        AND r.status = 'ready' AND o.payment_confirmed_at IS NOT NULL
        AND o.status IN ('dispatched', 'delivered')
        AND o.dispatched_at <= now() - (${REFERRAL_HOLD_DAYS} * interval '1 day')
        AND o.subtotal >= ${REFERRAL_MIN_FIRST_ORDER} AND o.account_link = 'signed_in'
        AND referred.email_verified = true
        AND referred.banned_at IS NULL AND referrer.banned_at IS NULL
        AND referred.glow_card_frozen_at IS NULL AND referrer.glow_card_frozen_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM member_referral_stamp_spends x WHERE x.stamp_id = s.id)
      ORDER BY s.stamp_number LIMIT 5
    ), voucher AS (
      INSERT INTO discount_codes
        (code, percentage, discount_type, fixed_amount, scope_type,
         active, expires_at, usage_limit, min_order_value)
      SELECT ${code}, NULL, 'fixed', ${reward.amount}, 'all', true,
        now() + interval '12 months', 1, 30
      WHERE (SELECT count(*) FROM available) = 5
        AND NOT EXISTS (
          SELECT 1 FROM member_referral_rewards
          WHERE customer_id = ${customerId} AND milestone = ${milestone}
        )
      ON CONFLICT (code) DO NOTHING RETURNING code
    ), saved_reward AS (
      INSERT INTO member_referral_rewards
        (customer_id, code, amount, stamp_cost, milestone, delivery_discount_percent)
      SELECT ${customerId}, code, ${reward.amount}, 5, ${milestone}, ${reward.deliveryDiscountPercent} FROM voucher
      ON CONFLICT (customer_id, milestone) WHERE milestone IS NOT NULL DO NOTHING
      RETURNING id, code
    ), spent AS (
      INSERT INTO member_referral_stamp_spends (stamp_id, reward_id)
      SELECT a.id, w.id FROM available a CROSS JOIN saved_reward w
      RETURNING stamp_id
    )
    SELECT w.code FROM saved_reward w
    WHERE (SELECT count(*) FROM spent) = 5
  `;
  return rows.length ? String(rows[0].code) : null;
}

export async function referralVoucherDeliveryDiscountPercent(code: string, customerId: number): Promise<number> {
  if (!code.toUpperCase().startsWith('WG-STAMP-')) return 0;
  const rows = await requireDb()`
    SELECT w.delivery_discount_percent
    FROM member_referral_rewards w
    JOIN discount_codes d ON d.code = w.code
    JOIN customers c ON c.id = w.customer_id
    WHERE upper(w.code) = upper(${code}) AND w.customer_id = ${customerId}
      AND d.active = true AND d.times_redeemed < 1 AND d.expires_at > now()
      AND c.glow_card_frozen_at IS NULL
    LIMIT 1
  `;
  return Math.max(0, Math.min(100, Number(rows[0]?.delivery_discount_percent ?? 0)));
}

export async function referralVoucherOwnedBy(code: string, customerId: number): Promise<boolean | null> {
  if (!code.toUpperCase().startsWith('WG-STAMP-')) return null;
  const rows = await requireDb()`
    SELECT 1 FROM member_referral_rewards w
    JOIN discount_codes d ON upper(d.code) = upper(w.code)
    JOIN customers c ON c.id = w.customer_id
    WHERE upper(w.code) = upper(${code}) AND w.customer_id = ${customerId}
      AND d.active = true AND d.times_redeemed < 1
      AND d.expires_at > now() AND c.glow_card_frozen_at IS NULL LIMIT 1
  `;
  return rows.length > 0;
}

export async function reserveReferralVoucher(code: string, customerId: number): Promise<boolean> {
  const rows = await requireDb()`
    WITH allowed_account AS MATERIALIZED (
      SELECT id FROM customers
      WHERE id = ${customerId} AND glow_card_frozen_at IS NULL
      FOR UPDATE
    )
    UPDATE discount_codes d SET times_redeemed = times_redeemed + 1
    FROM member_referral_rewards w, allowed_account c
    WHERE d.code = w.code AND upper(d.code) = upper(${code})
      AND w.customer_id = ${customerId} AND d.active = true
      AND c.id = w.customer_id
      AND d.times_redeemed = 0 AND d.expires_at > now()
    RETURNING d.id
  `;
  return rows.length > 0;
}

export async function isGlowCardFrozen(customerId: number): Promise<boolean> {
  const rows = await requireDb()`
    SELECT glow_card_frozen_at FROM customers WHERE id = ${customerId} LIMIT 1
  `;
  return Boolean(rows[0]?.glow_card_frozen_at);
}

export async function setGlowCardFreeze(params: {
  customerId: number;
  frozen: boolean;
  note: string;
  staffName?: string;
}) {
  const db = requireDb();
  const rows = await db`
    WITH changed AS (
      UPDATE customers SET
        glow_card_frozen_at = CASE WHEN ${params.frozen}::boolean THEN now() ELSE NULL END,
        glow_card_frozen_reason = CASE WHEN ${params.frozen}::boolean THEN ${params.note} ELSE NULL END,
        glow_card_frozen_by = CASE WHEN ${params.frozen}::boolean THEN ${params.staffName ?? 'Windsor Glow staff'} ELSE NULL END
      WHERE id = ${params.customerId}
      RETURNING id, email, glow_card_frozen_at
    ), logged AS (
      INSERT INTO member_referral_freeze_log (customer_id, action, note, staff_name)
      SELECT id, CASE WHEN ${params.frozen}::boolean THEN 'freeze' ELSE 'restore' END,
        ${params.note}, ${params.staffName ?? 'Windsor Glow staff'} FROM changed
      RETURNING id
    ), held AS (
      UPDATE member_referrals SET status = 'review',
        review_reason = 'A Glow Card account is frozen by staff'
      WHERE ${params.frozen}::boolean
        AND (referrer_id = ${params.customerId} OR referred_id = ${params.customerId})
        AND status IN ('waiting_order', 'waiting_verification', 'holding', 'approved')
      RETURNING id
    )
    SELECT id, email, glow_card_frozen_at FROM changed
  `;
  return rows[0] ?? null;
}

export async function releaseReferralVoucherReservation(code: string, customerId: number) {
  await requireDb()`
    UPDATE discount_codes d SET times_redeemed = 0
    FROM member_referral_rewards w
    WHERE d.code = w.code AND upper(d.code) = upper(${code})
      AND w.customer_id = ${customerId} AND d.times_redeemed = 1
  `;
}

export async function releaseReferralVoucherForUnpaidOrder(orderNumber: string) {
  const rows = await requireDb()`
    UPDATE discount_codes d SET times_redeemed = 0
    FROM member_referral_rewards w, orders o
    WHERE d.code = w.code
      AND upper(o.discount_code) = upper(w.code)
      AND o.order_number = ${orderNumber}
      AND o.payment_confirmed_at IS NULL
      AND o.status IN ('payment_failed', 'payment_cancelled', 'cancelled')
      AND d.times_redeemed = 1
    RETURNING d.id
  `;
  return rows.length > 0;
}
