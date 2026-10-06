import { createHash } from 'crypto';
import { isSendableEmailAddress } from '@/lib/emailAddress';
import { emailDocument } from '@/lib/email/shared';
import { storefrontRequestHostname } from '@/lib/storefrontHostPolicy';

export const MEMBER_CHANGEOVER_CAMPAIGN = 'windsor-beauty-is-member-changeover-2026-10';
export const MEMBER_CHANGEOVER_SUBJECT = 'Windsor Beauty has completed its move';
export const MEMBER_CHANGEOVER_FROM = 'Windsor Beauty <no-reply@windsorbeauty.is>';
export const MEMBER_CHANGEOVER_TEXT = `Hi,

Windsor Beauty has now completed its move to windsorbeauty.is.

The old .com and .co.uk storefront pages have been retired. Please use our new address from now on:
https://www.windsorbeauty.is/

Your member account has not changed. Sign in with the same email address and password you already use.

Sign in before browsing the full range. Products marked members-only are shown only to eligible members who are signed in.

If you need any help, email info@windsorbeauty.is.

Thank you for being a Windsor Beauty member.

Windsor Beauty`;
export const MEMBER_CHANGEOVER_CONTENT_HASH = createHash('sha256')
  .update(JSON.stringify([MEMBER_CHANGEOVER_CAMPAIGN, MEMBER_CHANGEOVER_SUBJECT, MEMBER_CHANGEOVER_FROM, MEMBER_CHANGEOVER_TEXT]))
  .digest('hex');

export interface NoticeMember {
  id: number; email: string; membership_status: string; marketing_consent: boolean;
  email_verified: boolean; account_status: string;
  banned_at: string | null; contact_consent: boolean; unsubscribed_at: string | null;
  unsubscribe_token: string; contact_matches: number; locally_suppressed: boolean;
}

export function eligibleNoticeMember(member: NoticeMember): boolean {
  return Number.isSafeInteger(member.id) && member.id > 0 && isSendableEmailAddress(member.email) &&
    member.membership_status === 'member' && member.email_verified === true && member.account_status === 'active' && member.banned_at === null && member.marketing_consent === true &&
    member.contact_matches === 1 && member.contact_consent === true && member.unsubscribed_at === null &&
    typeof member.unsubscribe_token === 'string' && /^[a-zA-Z0-9_-]{20,128}$/.test(member.unsubscribe_token) &&
    member.locally_suppressed === false;
}

export function noticeRequestOrigin(requestUrl: string, host: string | null): string | null {
  try {
    const url = new URL(requestUrl);
    const hostname = storefrontRequestHostname(host, url.hostname);
    // Match the existing storefront policy's original Host precedence. Forwarded headers are never read.
    if (url.protocol !== 'https:' || !hostname || !['windsorbeauty.is', 'www.windsorbeauty.is'].includes(hostname) ||
        (host !== null && host.includes(':') && !host.endsWith(':443')) || (host === null && url.port !== '')) return null;
    return `https://${hostname}`;
  } catch { return null; }
}

export function noticeLaunchPermits(requestUrl: string, mode: string | undefined, host: string | null = null): boolean {
  return mode === 'public' && noticeRequestOrigin(requestUrl, host) !== null;
}

export interface NoticeSuppressionSnapshot {
  complete: true; checkedAt: number; evidenceSha256: string; emails: ReadonlySet<string>;
}

export function snapshotAllowsMember(snapshot: NoticeSuppressionSnapshot, member: NoticeMember, now: number): boolean {
  return snapshot.complete === true && Number.isFinite(snapshot.checkedAt) && snapshot.checkedAt <= now &&
    now - snapshot.checkedAt <= 300_000 && /^[a-f0-9]{64}$/.test(snapshot.evidenceSha256) &&
    !snapshot.emails.has(member.email.trim().toLowerCase());
}

export function noticeIdempotencyKey(customerId: number): string {
  return `member-changeover/${createHash('sha256').update(`${MEMBER_CHANGEOVER_CAMPAIGN}:${customerId}:${MEMBER_CHANGEOVER_CONTENT_HASH}`).digest('hex')}`;
}

export function noticePayload(member: NoticeMember) {
  const unsubscribeUrl = `https://windsorbeauty.is/unsubscribe?token=${encodeURIComponent(member.unsubscribe_token)}`;
  const oneClick = `https://windsorbeauty.is/api/marketing/unsubscribe?token=${encodeURIComponent(member.unsubscribe_token)}`;
  const bodyHtml = MEMBER_CHANGEOVER_TEXT.split('\n\n').map(paragraph =>
    `<p>${paragraph.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>`).join('');
  return {
    from: MEMBER_CHANGEOVER_FROM, replyTo: 'no-reply@windsorbeauty.is', to: member.email.trim().toLowerCase(),
    subject: MEMBER_CHANGEOVER_SUBJECT,
    html: emailDocument({ title: MEMBER_CHANGEOVER_SUBJECT, headerLabel: 'Member update',
      preheader: 'Our website is now at windsorbeauty.is. Your existing member login still works.',
      bodyHtml: `${bodyHtml}<p><a href="${unsubscribeUrl}">Email preferences</a></p>`,
      senderNotice: 'This address is not monitored. For help, email info@windsorbeauty.is.' }),
    text: `${MEMBER_CHANGEOVER_TEXT}\n\nEmail preferences: ${unsubscribeUrl}\n\nThis address is not monitored. For help, email info@windsorbeauty.is.`,
    headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

export interface NoticeDependencies {
  findMember(id: number): Promise<NoticeMember | null>;
  reserve(member: NoticeMember, evidenceHash: string, idempotencyKey: string): Promise<boolean>;
  claim(member: NoticeMember): Promise<boolean>;
  finish(id: number, state: 'sent' | 'held', providerId: string | null): Promise<void>;
  send(member: NoticeMember, idempotencyKey: string): Promise<{ ok: boolean; id: string | null }>;
  suppressions(): Promise<NoticeSuppressionSnapshot>;
  now(): number;
}

export async function sendOneMemberNotice(id: number, deps: NoticeDependencies) {
  const member = await deps.findMember(id);
  if (!member || !eligibleNoticeMember(member)) return { status: 409, outcome: 'ineligible' };
  let snapshot: NoticeSuppressionSnapshot;
  try { snapshot = await deps.suppressions(); } catch { return { status: 503, outcome: 'provider-suppressions-unavailable' }; }
  if (!snapshotAllowsMember(snapshot, member, deps.now())) return { status: 409, outcome: 'suppressed-or-stale-provider-evidence' };
  const key = noticeIdempotencyKey(id);
  if (!await deps.reserve(member, snapshot.evidenceSha256, key)) return { status: 409, outcome: 'already-reserved-or-ineligible' };
  // Claim only after re-reading the member; opt-outs/configuration changes cannot be guessed away.
  const current = await deps.findMember(id);
  if (!current || !eligibleNoticeMember(current) || current.email !== member.email ||
      current.unsubscribe_token !== member.unsubscribe_token ||
      !snapshotAllowsMember(snapshot, current, deps.now()) || !await deps.claim(current)) {
    await deps.finish(id, 'held', null);
    return { status: 409, outcome: 'held-before-send' };
  }
  try {
    const sent = await deps.send(current, key);
    // Even a definitive rejection remains held. This endpoint never retries a recipient.
    if (!sent.ok || !sent.id || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(sent.id)) {
      await deps.finish(id, 'held', null);
      return { status: 503, outcome: 'held-send-outcome' };
    }
    await deps.finish(id, 'sent', sent.id);
    return { status: 200, outcome: 'sent' };
  } catch {
    // A process failure after provider acceptance leaves a permanent reservation.
    // Do not let a failed bookkeeping update cause another network send.
    await deps.finish(id, 'held', null).catch(() => {});
    return { status: 503, outcome: 'held-unknown-outcome' };
  }
}
