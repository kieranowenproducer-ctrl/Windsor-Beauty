import { NextResponse } from 'next/server';
import { findReferrerByCode, normaliseReferralCode, referralsEnabled } from '@/lib/memberReferrals';

export async function GET(request: Request, props: { params: Promise<{ code: string }> }) {
  if (!referralsEnabled()) return new Response('Member referrals are not available yet.', { status: 404 });
  const { code: supplied } = await props.params;
  const code = normaliseReferralCode(supplied);
  if (!code || !(await findReferrerByCode(code))) {
    return new Response('That member referral link is not valid.', { status: 404 });
  }
  const destination = new URL('/account/register', request.url);
  destination.searchParams.set('referralCode', code);
  return NextResponse.redirect(destination);
}
