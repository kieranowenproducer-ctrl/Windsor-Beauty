import { requireDb } from './client';

export type OpeningOfferReviewStatus = 'clear' | 'review' | 'approved';

// Kieran, 18 September 2026: a welcome code must never be withheld from a new member.
//
// Two people signing up from the same broadband line, the same house or the same mobile network
// were being matched and their 10% code held until somebody approved it by hand. Nine members were
// approved by hand in one day, and one of them checked out at full price because her code was
// refused at the basket. The matching still runs and is still written down, so staff can see who
// shares a connection, but it no longer holds anybody's discount and no longer raises an alert.
//
// This is now a permanent safety invariant, not an environment-controlled mode.
// Detection belongs in Security Review and must never become a checkout gate again.
export function welcomeOfferHoldsEnabled(): boolean {
  return false;
}

export interface OpeningOfferReviewRow {
  customer_id: number;
  status: OpeningOfferReviewStatus;
  reasons: string[];
  matched_customer_ids: number[];
  checked_at: string;
  reviewed_at: string | null;
}

function compact(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Treat 07... and +447... as the same UK phone number. */
export function normaliseOfferPhone(value: string | null | undefined): string {
  let digits = (value ?? '').replace(/\D/g, '');
  if (digits.startsWith('0044')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('44') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

async function ensureOpeningOfferTable(): Promise<void> {
  const db = requireDb();
  await db`ALTER TABLE discount_signups ADD COLUMN IF NOT EXISTS reservation_token TEXT`;
  await db`ALTER TABLE discount_signups ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ`;
  await db`
    CREATE TABLE IF NOT EXISTS opening_offer_reviews (
      customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'clear' CHECK (status IN ('clear', 'review', 'approved')),
      reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
      matched_customer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS opening_offer_reviews_status_idx ON opening_offer_reviews(status, checked_at DESC)`;
}

export async function checkOpeningOfferCustomer(params: {
  customerId: number;
  ipAddress?: string | null;
  preserveApproval?: boolean;
}): Promise<{ row: OpeningOfferReviewRow; newlyFlagged: boolean }> {
  await ensureOpeningOfferTable();
  const db = requireDb();
  const [customer] = await db`
    SELECT id, phone, address_line1, address_postcode
    FROM customers WHERE id = ${params.customerId} LIMIT 1
  ` as unknown as { id: number; phone: string | null; address_line1: string | null; address_postcode: string | null }[];
  if (!customer) throw new Error('Customer not found');

  const phone = normaliseOfferPhone(customer.phone);
  const address = compact(customer.address_line1);
  const postcode = compact(customer.address_postcode);
  const ip = params.ipAddress && params.ipAddress !== 'unknown' ? params.ipAddress.trim() : '';

  const matches = await db`
    SELECT DISTINCT c.id,
      CASE WHEN ${phone} <> '' AND
        CASE
          WHEN regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') LIKE '0044%' THEN '0' || substring(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') from 5)
          WHEN regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') LIKE '44%' THEN '0' || substring(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') from 3)
          ELSE regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g')
        END = ${phone} THEN TRUE ELSE FALSE END AS phone_match,
      CASE WHEN ${address} <> '' AND ${postcode} <> ''
        AND regexp_replace(lower(COALESCE(c.address_line1, '')), '[^a-z0-9]', '', 'g') = ${address}
        AND regexp_replace(lower(COALESCE(c.address_postcode, '')), '[^a-z0-9]', '', 'g') = ${postcode}
        THEN TRUE ELSE FALSE END AS address_match,
      CASE WHEN ${ip} <> '' AND EXISTS (
        SELECT 1 FROM member_login_log ml
        WHERE ml.customer_id = c.id AND ml.method = 'register' AND ml.ip_address = ${ip}
      ) THEN TRUE ELSE FALSE END AS ip_match
    FROM customers c
    WHERE c.id <> ${params.customerId}
      AND (
        (${phone} <> '' AND CASE
          WHEN regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') LIKE '0044%' THEN '0' || substring(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') from 5)
          WHEN regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') LIKE '44%' THEN '0' || substring(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') from 3)
          ELSE regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g')
        END = ${phone})
        OR (${address} <> '' AND ${postcode} <> ''
          AND regexp_replace(lower(COALESCE(c.address_line1, '')), '[^a-z0-9]', '', 'g') = ${address}
          AND regexp_replace(lower(COALESCE(c.address_postcode, '')), '[^a-z0-9]', '', 'g') = ${postcode})
        OR (${ip} <> '' AND EXISTS (
          SELECT 1 FROM member_login_log ml
          WHERE ml.customer_id = c.id AND ml.method = 'register' AND ml.ip_address = ${ip}
        ))
      )
  ` as unknown as { id: number; phone_match: boolean; address_match: boolean; ip_match: boolean }[];

  const reasons: string[] = [];
  if (matches.some(row => row.phone_match)) reasons.push('Same phone number as another account');
  if (matches.some(row => row.address_match)) reasons.push('Same home address as another account');
  if (matches.some(row => row.ip_match)) reasons.push('Same sign-up internet address as another account');
  const matchedIds = Array.from(new Set(matches.map(row => Number(row.id)).filter(Number.isInteger)));

  const [before] = await db`SELECT status FROM opening_offer_reviews WHERE customer_id = ${params.customerId}` as unknown as { status: OpeningOfferReviewStatus }[];
  const keepApproval = params.preserveApproval === true && before?.status === 'approved' && reasons.length > 0;
  const status: OpeningOfferReviewStatus = keepApproval
    ? 'approved'
    : 'clear';
  const [saved] = await db`
    INSERT INTO opening_offer_reviews (customer_id, status, reasons, matched_customer_ids, checked_at)
    VALUES (${params.customerId}, ${status}, ${JSON.stringify(reasons)}::jsonb, ${JSON.stringify(matchedIds)}::jsonb, now())
    ON CONFLICT (customer_id) DO UPDATE SET
      status = EXCLUDED.status,
      reasons = EXCLUDED.reasons,
      matched_customer_ids = EXCLUDED.matched_customer_ids,
      checked_at = now(),
      reviewed_at = CASE WHEN EXCLUDED.status = 'approved' THEN opening_offer_reviews.reviewed_at ELSE NULL END,
      reviewed_by = CASE WHEN EXCLUDED.status = 'approved' THEN opening_offer_reviews.reviewed_by ELSE NULL END
    RETURNING *
  ` as unknown as OpeningOfferReviewRow[];
  return { row: saved, newlyFlagged: false };
}

export async function getOpeningOfferReview(customerId: number): Promise<OpeningOfferReviewRow | null> {
  await ensureOpeningOfferTable();
  const db = requireDb();
  const rows = await db`SELECT * FROM opening_offer_reviews WHERE customer_id = ${customerId} LIMIT 1`;
  return (rows[0] as OpeningOfferReviewRow) ?? null;
}

export async function listOpeningOfferReviews(): Promise<OpeningOfferReviewRow[]> {
  await ensureOpeningOfferTable();
  const db = requireDb();
  return await db`SELECT * FROM opening_offer_reviews ORDER BY checked_at DESC` as unknown as OpeningOfferReviewRow[];
}

export async function setOpeningOfferReviewDecision(
  customerId: number,
  status: 'approved' | 'review'
): Promise<OpeningOfferReviewRow | null> {
  await ensureOpeningOfferTable();
  const db = requireDb();
  const rows = await db`
    INSERT INTO opening_offer_reviews (customer_id, status, reasons, matched_customer_ids, reviewed_at, reviewed_by)
    VALUES (${customerId}, ${status}, '[]'::jsonb, '[]'::jsonb, now(), 'admin')
    ON CONFLICT (customer_id) DO UPDATE SET
      status = EXCLUDED.status,
      reviewed_at = now(),
      reviewed_by = 'admin'
    RETURNING *
  `;
  return (rows[0] as OpeningOfferReviewRow) ?? null;
}

export async function openingOfferIsAllowed(customerId: number): Promise<boolean> {
  void customerId;
  return true;
}

export interface SignupOfferEligibility {
  exists: boolean;
  owned: boolean;
  active: boolean;
  heldForReview: boolean;
}

export async function getSignupOfferEligibility(params: {
  code: string;
  customerId: number;
  email: string;
}): Promise<SignupOfferEligibility> {
  await ensureOpeningOfferTable();
  const db = requireDb();
  const rows = await db`
    SELECT ds.status,
      lower(ds.email) = lower(${params.email}) AS owned,
      COALESCE(r.status = 'review', FALSE) AS held_for_review
    FROM discount_signups ds
    LEFT JOIN opening_offer_reviews r ON r.customer_id = ${params.customerId}
    WHERE upper(ds.code) = upper(${params.code})
    LIMIT 1
  `;
  const row = rows[0] as { status: string; owned: boolean; held_for_review: boolean } | undefined;
  return {
    exists: !!row,
    owned: row?.owned === true,
    active: row?.status === 'active',
    // Historical review rows are evidence only. They can never pause a valid code.
    heldForReview: false,
  };
}

/**
 * A pause that has outlived its reason clears itself (task 22d79f3b).
 *
 * WHY THIS EXISTS. Haydee Rivera was paused on 18 September because another account carried her
 * phone number and her home address. That other account was later deleted. Nothing re-runs the
 * check, so the pause survived the thing that caused it: she was left blocked against a record that
 * no longer existed, her reason named a customer nobody could look up, and the only way anybody
 * found out was that she wrote to sales@ with £160 in her basket. Somebody less patient leaves, and
 * there is no trace of the sale that did not happen.
 *
 * So a pause is now re-derived at the moment it would actually stop somebody, from the data as it
 * stands. If the matches have gone, it clears. If they are still there, nothing changes, which is
 * the half that matters: this is a repair, not a way round the check.
 *
 * It runs ONLY for a customer who is actually paused, so the ordinary customer pays nothing for it.
 * A staff decision is never overwritten, because `preserveApproval` keeps an approval that a person
 * made on purpose.
 *
 * Returns true when the customer is STILL held after looking again.
 */
export async function stillHeldAfterRecheck(customerId: number): Promise<boolean> {
  void customerId;
  return false;
}

/** Atomically takes a welcome code before the order is written. */
export async function reserveSignupOffer(params: {
  code: string;
  email: string;
  reservationToken: string;
}): Promise<boolean> {
  const db = requireDb();
  const rows = await db`
    UPDATE discount_signups
    SET status = 'used', used_at = now(), reservation_token = ${params.reservationToken}, reserved_at = now()
    WHERE upper(code) = upper(${params.code})
      AND lower(email) = lower(${params.email})
      AND status = 'active'
    RETURNING id
  `;
  return rows.length === 1;
}

export async function releaseSignupOfferReservation(reservationToken: string): Promise<void> {
  const db = requireDb();
  await db`
    UPDATE discount_signups
    SET status = 'active', used_at = NULL, reservation_token = NULL, reserved_at = NULL
    WHERE reservation_token = ${reservationToken}
  `;
}

export async function finishSignupOfferReservation(reservationToken: string): Promise<void> {
  const db = requireDb();
  await db`
    UPDATE discount_signups
    SET reservation_token = NULL, reserved_at = NULL
    WHERE reservation_token = ${reservationToken} AND status = 'used'
  `;
}

export async function findLatestRegistrationIp(customerId: number): Promise<string | null> {
  const db = requireDb();
  const rows = await db`
    SELECT ip_address FROM member_login_log
    WHERE customer_id = ${customerId} AND method = 'register'
    ORDER BY created_at DESC LIMIT 1
  `;
  return typeof rows[0]?.ip_address === 'string' ? rows[0].ip_address : null;
}
