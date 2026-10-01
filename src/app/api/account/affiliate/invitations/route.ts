import { NextResponse } from 'next/server';
import { resolveCustomerFromRequest } from '@/lib/auth';
import {
  affiliateInvitationLink,
  affiliateShareMessage,
  affiliatesEnabled,
  createAffiliateInvitation,
  getActiveAffiliateName,
  markInvitationDelivery,
} from '@/lib/affiliates';
import { sendAffiliateInvitationEmail } from '@/lib/affiliateEmail';
import { findMarketingContactByEmail } from '@/lib/db/marketing';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

/**
 * Raf types the person's email address and presses Send. Windsor Glow emails the invitation from
 * info@windsorglow.com, and the same link always comes back with a ready-made message, so Raf can
 * send it from his own phone whether or not the email goes through.
 */
export async function POST(request: Request) {
  if (!affiliatesEnabled()) return NextResponse.json({ error: 'Affiliate invitations are not open yet.' }, { status: 404, headers });
  const body = await request.json().catch(() => null);
  const recipientEmail = typeof body?.recipientEmail === 'string' ? body.recipientEmail.trim().toLowerCase() : '';
  const sendByEmail = body?.send !== false;

  if (process.env.NODE_ENV !== 'production' && new URL(request.url).searchParams.get('preview') === '1') {
    const email = recipientEmail || 'example@example.com';
    const link = `${new URL(request.url).origin}/account/register?affiliateInvite=${'a'.repeat(64)}`;
    return NextResponse.json({
      link,
      shareMessage: affiliateShareMessage('Raf', email, link),
      recipientEmail: email,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      email: sendByEmail ? (email.includes('fail') ? 'not_sent' : 'sent') : 'not_requested',
      preview: true,
    }, { headers });
  }

  const customer = await resolveCustomerFromRequest(request);
  if (!customer) return NextResponse.json({ error: 'Sign in to invite someone.' }, { status: 401, headers });
  const affiliateName = await getActiveAffiliateName(customer.id).catch(() => null);
  if (!affiliateName) return NextResponse.json({ error: 'Your affiliate account is not active.' }, { status: 403, headers });

  let invitation;
  try {
    invitation = await createAffiliateInvitation(customer.id, recipientEmail, 'affiliate', { sendEmail: sendByEmail });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The invitation could not be made.' }, { status: 400, headers });
  }
  const link = affiliateInvitationLink(request, invitation.token);
  const shareMessage = affiliateShareMessage(affiliateName, invitation.recipientEmail, link);

  let email: 'sent' | 'not_sent' | 'not_requested' = 'not_requested';
  if (sendByEmail) {
    email = 'not_sent';
    try {
      // Someone who unsubscribed from Windsor Glow email is not emailed again. Raf can still send
      // the link himself; the answer he sees is the same as any other failed send.
      const contact = await findMarketingContactByEmail(invitation.recipientEmail);
      if (!contact?.unsubscribed_at) {
        const sent = await sendAffiliateInvitationEmail({
          invitationId: invitation.id,
          email: invitation.recipientEmail,
          affiliateName,
          link,
          expiresAt: invitation.expiresAt,
          requested: false,
        });
        await markInvitationDelivery(invitation.id, sent.ok, sent.id).catch(() => null);
        if (sent.ok) email = 'sent';
      } else {
        await markInvitationDelivery(invitation.id, false, null).catch(() => null);
      }
    } catch {
      await markInvitationDelivery(invitation.id, false, null).catch(() => null);
    }
  }

  return NextResponse.json({ link, shareMessage, recipientEmail: invitation.recipientEmail, expiresAt: invitation.expiresAt, email }, { headers });
}
