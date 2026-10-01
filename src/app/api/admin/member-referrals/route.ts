import { NextResponse } from 'next/server';
import { requireDb } from '@/lib/db/client';
import { referralsEnabled, setGlowCardFreeze, syncMemberReferrals } from '@/lib/memberReferrals';

// The proxy protects all /api/admin routes. Staff decisions and notes remain visible after the referral changes status.
export async function GET() {
  if (!referralsEnabled()) return NextResponse.json({ error: 'Member referrals are not available yet.' }, { status: 404 });
  const db = requireDb();
  const toCheck = await db`
    SELECT DISTINCT r.referrer_id FROM member_referrals r
    JOIN orders o ON o.customer_id = r.referred_id
    WHERE r.status IN ('waiting_order', 'waiting_verification', 'holding', 'approved')
      AND o.payment_confirmed_at IS NOT NULL
    LIMIT 10
  `;
  for (const row of toCheck) await syncMemberReferrals(Number(row.referrer_id));
  const rows = await db`
    SELECT r.id, r.status, r.review_reason, r.reviewed_at, r.review_note, r.review_decision, r.created_at, r.qualified_at,
      a.id AS referrer_id, a.email AS referrer_email,
      a.glow_card_frozen_at AS referrer_frozen_at,
      a.glow_card_frozen_reason AS referrer_frozen_reason,
      b.id AS buyer_id, b.email AS buyer_email,
      b.glow_card_frozen_at AS buyer_frozen_at,
      b.glow_card_frozen_reason AS buyer_frozen_reason,
      a.address_postcode AS referrer_postcode, b.address_postcode AS buyer_postcode,
      a.phone AS referrer_phone, b.phone AS buyer_phone,
      o.order_number, o.subtotal, o.status AS order_status, o.dispatched_at
    FROM member_referrals r
    JOIN customers a ON a.id = r.referrer_id
    JOIN customers b ON b.id = r.referred_id
    LEFT JOIN orders o ON o.id = r.first_order_id
    ORDER BY r.created_at DESC LIMIT 200
  `;
  const reports = await db`
    SELECT report.customer_id, report.milestone, report.status, report.summary,
      report.referral_ids, report.checked_at,
      customer.email, customer.glow_card_frozen_at, customer.glow_card_frozen_reason,
      reward.code, code.active AS code_active, code.times_redeemed
    FROM member_referral_stage_reports report
    JOIN customers customer ON customer.id = report.customer_id
    LEFT JOIN member_referral_rewards reward
      ON reward.customer_id = report.customer_id AND reward.milestone = report.milestone
    LEFT JOIN discount_codes code ON code.code = reward.code
    ORDER BY report.checked_at DESC
    LIMIT 100
  `;
  return NextResponse.json({ referrals: rows, reports });
}

export async function PATCH(request: Request) {
  if (!referralsEnabled()) return NextResponse.json({ error: 'Member referrals are not available yet.' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  const decision = body?.decision;
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : '';
  if (['freeze', 'restore'].includes(decision)) {
    const customerId = Number(body?.customerId);
    if (!Number.isInteger(customerId) || customerId < 1) {
      return NextResponse.json({ error: 'Choose a member account.' }, { status: 400 });
    }
    if (note.length < 5) {
      return NextResponse.json({ error: 'Add a short reason for the staff action.' }, { status: 400 });
    }
    const changed = await setGlowCardFreeze({
      customerId,
      frozen: decision === 'freeze',
      note,
    });
    if (!changed) return NextResponse.json({ error: 'That member account was not found.' }, { status: 404 });
    return NextResponse.json({ success: true, frozen: decision === 'freeze' });
  }
  if (!Number.isInteger(id) || id < 1 || !['approve', 'reject'].includes(decision)) {
    return NextResponse.json({ error: 'Choose a referral and approve or reject it.' }, { status: 400 });
  }
  if (note.length < 5) {
    return NextResponse.json({ error: 'Add a short reason for the staff decision.' }, { status: 400 });
  }
  const db = requireDb();
  const rows = decision === 'approve'
    ? await db`
        UPDATE member_referrals
        SET status = CASE
            WHEN EXISTS (
              SELECT 1 FROM member_referral_stamps s
              WHERE s.referral_id = member_referrals.id AND s.revoked_at IS NULL
            ) THEN 'ready'
            ELSE 'approved'
          END,
          review_reason = NULL,
          reviewed_at = now(), review_note = ${note}, review_decision = ${decision}
        WHERE id = ${id} AND status = 'review'
        RETURNING id, referrer_id, status
      `
    : await db`
        UPDATE member_referrals
        SET status = 'rejected', review_reason = 'Rejected after staff review',
          reviewed_at = now(), review_note = ${note}, review_decision = ${decision}
        WHERE id = ${id} AND status = 'review'
        RETURNING id, referrer_id, status
      `;
  if (!rows.length) return NextResponse.json({ error: 'That referral is no longer waiting for review.' }, { status: 409 });
  if (decision === 'approve' && rows[0].status === 'ready') {
    // A final claim checks a five-stamp stage as one unit. Approving the
    // flagged referral therefore approves that exact group of five, so the
    // next claim does not immediately raise the same shared-detail warning.
    await db`
      WITH ranked AS (
        SELECT s.referral_id,
          row_number() OVER (ORDER BY s.earned_at, s.id) AS stamp_number
        FROM member_referral_stamps s
        WHERE s.customer_id = ${Number(rows[0].referrer_id)} AND s.revoked_at IS NULL
      ), target AS (
        SELECT stamp_number FROM ranked WHERE referral_id = ${id} LIMIT 1
      ), stage AS (
        SELECT referral_id FROM ranked, target
        WHERE stamp_number > ((target.stamp_number - 1) / 5) * 5
          AND stamp_number <= (((target.stamp_number - 1) / 5) + 1) * 5
      )
      UPDATE member_referrals r
      SET review_decision = 'approve', reviewed_at = now(), review_note = ${note}
      WHERE r.id IN (SELECT referral_id FROM stage) AND r.status = 'ready'
    `;
  }
  if (decision === 'approve' && rows[0].status === 'approved') await syncMemberReferrals(Number(rows[0].referrer_id));
  return NextResponse.json({ success: true, status: rows[0].status });
}
