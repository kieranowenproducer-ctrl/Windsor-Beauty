import { NextResponse } from 'next/server';
import { affiliateInvitationLink, affiliatesEnabled, createAffiliateInvitation, findAffiliateRequestProfile, markInvitationDelivery } from '@/lib/affiliates';
import { sendAffiliateInvitationEmail } from '@/lib/affiliateEmail';
import { findMarketingContactByEmail } from '@/lib/db/marketing';

export const dynamic = 'force-dynamic';
const acknowledgement = 'If this address can receive an invitation, Windsor Glow will email the private link shortly. Please check your inbox.';
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'production' && new URL(request.url).searchParams.get('preview') === '1') {
    return NextResponse.json({ message: 'Preview only. No email was sent or saved.' }, { headers });
  }
  if (!affiliatesEnabled()) return NextResponse.json({ error: 'Invitations are not open yet.' }, { status: 404, headers });
  const body = await request.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400, headers });
  }
  const profile = await findAffiliateRequestProfile(key).catch(() => null);
  if (!profile) return NextResponse.json({ error: 'This request page is not available.' }, { status: 404, headers });
  // A recipient-requested email is not a marketing-list opt-in. Never revive an unsubscribe.
  try {
    const contact = await findMarketingContactByEmail(email);
    if (contact?.unsubscribed_at) return NextResponse.json({ message: acknowledgement }, { headers });
    const invitation = await createAffiliateInvitation(Number(profile.customer_id), email, 'recipient');
    const link = affiliateInvitationLink(request, invitation.token);
    const sent = await sendAffiliateInvitationEmail({
      invitationId: invitation.id, email, affiliateName: String(profile.display_name), link, expiresAt: invitation.expiresAt, requested: true,
    });
    await markInvitationDelivery(invitation.id, sent.ok, sent.id).catch(() => null);
  } catch {
    // Existing account, duplicate request, limit, and provider errors all get the same answer.
    // The send is tried twice with one idempotency key; a failure is kept for staff to see.
  }
  return NextResponse.json({ message: acknowledgement }, { headers });
}
