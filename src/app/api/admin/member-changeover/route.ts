import { timingSafeEqual } from 'crypto';
import { getSessionTokenFromRequest } from '@/lib/auth';
import { isDbConfigured } from '@/lib/db/client';
import { findMemberChangeoverRecipient, memberChangeoverReviewRows, reserveMemberChangeover,
  claimMemberChangeover, finishMemberChangeover } from '@/lib/db/memberChangeoverNotice';
import { MEMBER_CHANGEOVER_CAMPAIGN, MEMBER_CHANGEOVER_CONTENT_HASH, MEMBER_CHANGEOVER_TEXT,
  eligibleNoticeMember, snapshotAllowsMember, noticeRequestOrigin, noticeLaunchPermits, noticePayload, sendOneMemberNotice } from '@/lib/email/memberChangeoverNotice';
import { sendEmail } from '@/lib/email/send';
import { readMemberNoticeSuppressions } from '@/lib/email/memberNoticeSuppressions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store' };
function answer(body: unknown, status = 200) { return Response.json(body, { status, headers }); }

function administrator(request: Request): string | null {
  const expected = process.env.ADMIN_SESSION_TOKEN;
  const supplied = getSessionTokenFromRequest(request, 'wb_admin_session');
  if (!expected || !supplied) return null;
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b) ? expected : null;
}

export async function GET(request: Request) {
  if (!administrator(request)) return answer({ error: 'Administrator sign-in required.' }, 401);
  if (!isDbConfigured()) return answer({ error: 'Database unavailable.' }, 503);
  try {
    const members = await memberChangeoverReviewRows();
    const snapshot = await readMemberNoticeSuppressions();
    const ids = new Set(members.map(member => member.id));
    const eligible = members.filter(member => eligibleNoticeMember(member) && !member.already_reserved && snapshotAllowsMember(snapshot, member, Date.now()));
    const eligibleCustomerIds = Array.from(new Set(eligible.map(member => member.id)));
    return answer({ campaignKey: MEMBER_CHANGEOVER_CAMPAIGN, contentHash: MEMBER_CHANGEOVER_CONTENT_HASH,
      draftText: MEMBER_CHANGEOVER_TEXT, counts: { currentMembersReviewed: ids.size, eligible: eligibleCustomerIds.length,
        excludedOrReserved: ids.size - eligibleCustomerIds.length }, eligibleCustomerIds,
      sendGateOpen: noticeLaunchPermits(request.url, process.env.WINDSOR_STOREFRONT_MODE, request.headers.get('host')),
      audienceRule: 'Verified, active members who opted in; unsubscribed, locally suppressed or unverified members excluded. A complete fresh provider-suppression GET is also required before each send.',
      noAutomaticCampaignOrRetry: true });
  } catch { return answer({ error: 'Member notice review is unavailable. Installer and permissions require review.' }, 503); }
}

export async function POST(request: Request) {
  const secret = administrator(request);
  if (!secret) return answer({ error: 'Administrator sign-in required.' }, 401);
  const origin = noticeRequestOrigin(request.url, request.headers.get('host'));
  if (!origin || request.headers.get('origin') !== origin) return answer({ error: 'Same-site Administrator request required.' }, 403);
  if (!noticeLaunchPermits(request.url, process.env.WINDSOR_STOREFRONT_MODE, request.headers.get('host'))) {
    return answer({ error: 'The public .is launch must be complete first.' }, 503);
  }
  if (!isDbConfigured() || !process.env.RESEND_API_KEY_BEAUTY_IS || !process.env.RESEND_INBOUND_API_KEY_BEAUTY_IS) return answer({ error: 'Notice dependencies unavailable.' }, 503);
  const body = await request.json().catch(() => null);
  if (body?.action !== 'send-one' || body?.approvedContentHash !== MEMBER_CHANGEOVER_CONTENT_HASH ||
      body?.campaignKey !== MEMBER_CHANGEOVER_CAMPAIGN || body?.retirementAndMemberSmokeApproved !== true ||
      !Number.isSafeInteger(body?.customerId) || body.customerId <= 0) {
    return answer({ error: 'Exact reviewed notice, one member and launch acceptance are required.' }, 400);
  }
  try {
    const result = await sendOneMemberNotice(body.customerId, {
      findMember: findMemberChangeoverRecipient, reserve: reserveMemberChangeover, claim: claimMemberChangeover,
      finish: finishMemberChangeover, now: Date.now,
      suppressions: readMemberNoticeSuppressions,
      send: async (member, key) => sendEmail(noticePayload(member), {
        idempotencyKey: key, filing: { emailType: 'member_changeover_notice' },
      }),
    });
    return answer({ outcome: result.outcome }, result.status);
  } catch { return answer({ error: 'Notice held for reconciliation. Do not retry this member.' }, 503); }
}
