import { NextResponse } from 'next/server';
import { affiliatesEnabled, findAffiliateInvitation } from '@/lib/affiliates';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!affiliatesEnabled()) return NextResponse.json({ valid: false }, { status: 404 });
  const token = new URL(request.url).searchParams.get('token') || '';
  const invitation = await findAffiliateInvitation(token).catch(() => null);
  // The link is a one-person secret, so whoever holds it is the person it was made for. Returning
  // their address lets the sign-up form fill it in, which removes the easiest way to get it wrong.
  return NextResponse.json({
    valid: Boolean(invitation),
    email: invitation ? String(invitation.recipient_email) : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
