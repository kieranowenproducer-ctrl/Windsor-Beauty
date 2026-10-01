import { requireDb } from './client';
import { findLatestRegistrationIp } from './openingOfferProtection';
import { createSecurityReviewCase, ensureSecurityReviewTables } from './securityReviews';
import { syncMemberReferrals } from '@/lib/memberReferrals';

/** Idempotent migration from obsolete red warnings and offer holds into advisory cases. */
export async function migrateLegacySecurityReviews() {
  await ensureSecurityReviewTables();
  const db = requireDb();
  const legacyReviews = await db`
    SELECT customer_id FROM opening_offer_reviews
    WHERE jsonb_array_length(reasons) > 0 OR status = 'review'
  `;
  let backfilled = 0;
  for (const review of legacyReviews) {
    const customerId = Number(review.customer_id);
    const ipAddress = await findLatestRegistrationIp(customerId).catch(() => null);
    const result = await createSecurityReviewCase({
      customerId, sourceEvent: 'historical_alert', ipAddress, notify: false,
    });
    if (result.row) backfilled += 1;
  }

  const closed = await db`
    UPDATE automation_failures SET resolved_at = now()
    WHERE resolved_at IS NULL
      AND category IN ('duplicate_account_suspected', 'opening_offer_review', 'welcome_offer_blocked')
    RETURNING id
  `;
  await db`UPDATE opening_offer_reviews SET status = 'clear' WHERE status = 'review'`;

  const releasedReferrals = await db`
    UPDATE member_referrals SET status = 'holding', review_reason = NULL
    WHERE status = 'review' AND (
      review_reason IN (
        'Matching phone numbers', 'Matching delivery addresses',
        'Phone number already used by another referred account',
        'Delivery address already used by another referred account',
        'Matching phone details need staff review',
        'Matching delivery details need staff review',
        'Connected accounts need staff review'
      ) OR review_reason ~ 'referred accounts used the same internet connection'
    )
    RETURNING referred_id
  `;
  for (const row of releasedReferrals) await syncMemberReferrals(Number(row.referred_id));

  return {
    schemaReady: true,
    historicalCasesBackfilled: backfilled,
    obsoleteWarningsClosed: closed.length,
    similarityReferralHoldsReleased: releasedReferrals.length,
  };
}
