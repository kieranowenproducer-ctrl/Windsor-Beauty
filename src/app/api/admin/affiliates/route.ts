import { NextResponse } from 'next/server';
import { affiliateInvitationLink, affiliateShareMessage, affiliatesEnabled, createAffiliateInvitation, createAffiliateProfile, getAffiliateAdminOverview, getOrCreateAffiliateRequestKey, handlePayoutRequest, setAffiliateDuration, setAffiliateStatus, type AffiliatePayoutAction } from '@/lib/affiliates';

import { affiliateInvitationEmail } from '@/lib/affiliateEmail';

export const dynamic = 'force-dynamic';

const preview = {
  profiles: [{ customer_id: 83, display_name: 'Raf', referral_code: 'RAF', status: 'active', first_name: 'Raf', last_name: 'Christian', email: 'raf@example.com', code_duration_days: 183, balance_pence: 1954, referral_count: 12, order_count: 8 }],
  payouts: [{ id: 12, affiliate_customer_id: 83, display_name: 'Raf', email: 'raf@example.com', amount_pence: 1900, method: 'cash', status: 'requested', requested_at: new Date().toISOString() }],
  invitations: [
    { id: 3, affiliate_customer_id: 83, recipient_email: 'sam@example.com', created_source: 'affiliate', state: 'delivered', created_at: '2026-09-26T10:00:00.000Z' },
    { id: 2, affiliate_customer_id: 83, recipient_email: 'jo@example.com', created_source: 'affiliate', state: 'email_failed', created_at: '2026-09-25T15:00:00.000Z' },
    { id: 1, affiliate_customer_id: 83, recipient_email: 'alex@example.com', created_source: 'recipient', state: 'joined', created_at: '2026-09-18T12:00:00.000Z' },
  ],
  referrals: [{ id: 1, affiliate_customer_id: 83, status: 'active', first_name: 'Alex', last_name: 'Morgan', email: 'alex@example.com', code: 'RAF5-A12B3C4D', code_active: true, expires_at: '2027-03-22T12:00:00.000Z', order_count: 3, earned_pence: 823, created_at: '2026-09-18T12:00:00.000Z' }],
};

export async function GET(request: Request) {
  // Staff can open the exact email a person Raf invites receives, with an example address and link.
  // Nothing is created or sent.
  if (new URL(request.url).searchParams.get('emailPreview') === '1') {
    const email = affiliateInvitationEmail({
      email: 'their.name@example.com',
      affiliateName: 'Raf',
      link: 'https://www.windsorbeauty.co.uk/account/register?affiliateInvite=example',
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      requested: new URL(request.url).searchParams.get('requested') === '1',
    });
    return new NextResponse(email.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  if (process.env.NODE_ENV !== 'production' && new URL(request.url).searchParams.get('preview') === '1') return NextResponse.json(preview);
  try { return NextResponse.json(await getAffiliateAdminOverview()); }
  catch { return NextResponse.json({ profiles: [], payouts: [], referrals: [], setupRequired: true }); }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  try {
    if (body?.action === 'request_link') {
      if (!affiliatesEnabled()) return NextResponse.json({ error: 'Affiliate customer access is not open yet.' }, { status: 404 });
      const customerId = Number(body.customerId);
      if (!Number.isInteger(customerId) || customerId <= 0) throw new Error('Choose a valid affiliate.');
      const key = await getOrCreateAffiliateRequestKey(customerId);
      const requestUrl = new URL(request.url);
      const localPreview = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(requestUrl.hostname);
      return NextResponse.json({ link: `${localPreview ? requestUrl.origin : 'https://www.windsorbeauty.co.uk'}/raf-invite/${key}` }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body?.action === 'create_invitation') {
      if (!affiliatesEnabled()) return NextResponse.json({ error: 'Affiliate customer access is not open yet.' }, { status: 404 });
      const customerId = Number(body.customerId);
      if (!Number.isInteger(customerId) || customerId <= 0) throw new Error('Choose a valid affiliate.');
      const invitation = await createAffiliateInvitation(customerId, String(body.recipientEmail || ''), 'staff');
      const link = affiliateInvitationLink(request, invitation.token);
      return NextResponse.json({ link, shareMessage: affiliateShareMessage('Raf', invitation.recipientEmail, link), recipientEmail: invitation.recipientEmail, expiresAt: invitation.expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body?.action === 'create_profile') {
      const customerId = Number(body.customerId);
      const durationDays = Number(body.durationDays ?? 183);
      if (!Number.isInteger(customerId) || customerId <= 0) throw new Error('Choose a valid customer.');
      const profile = await createAffiliateProfile({ customerId, displayName: String(body.displayName || 'Raf'), referralCode: String(body.referralCode || 'RAF'), durationDays });
      return NextResponse.json({ success: true, profile });
    }
    if (body?.action === 'set_duration') {
      await setAffiliateDuration(Number(body.customerId), Number(body.durationDays));
      return NextResponse.json({ success: true });
    }
    if (body?.action === 'set_status') {
      if (body.status !== 'active' && body.status !== 'paused') throw new Error('Choose active or paused.');
      await setAffiliateStatus(Number(body.customerId), body.status);
      return NextResponse.json({ success: true });
    }
    if (body?.action === 'approve' || body?.action === 'refuse' || body?.action === 'cancel' || body?.action === 'mark_paid') {
      await handlePayoutRequest(Number(body.id), body.action as AffiliatePayoutAction, String(body.note || ''), String(body.paymentReference || ''));
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Unknown affiliate action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The change could not be saved.' }, { status: 400 });
  }
}
