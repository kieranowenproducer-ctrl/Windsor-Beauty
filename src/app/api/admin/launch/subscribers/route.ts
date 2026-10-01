import { NextResponse } from 'next/server';
import { isDbConfigured, listLaunchSubscribersWithStatus } from '@/lib/db';
import { MARKETING_SENDER_OPTIONS } from '@/lib/email/marketingSender';

export const dynamic = 'force-dynamic';

// senderOptions rides along so the Pre-Launch card can offer the launch email's
// From choice without the client bundle hardcoding an address (task 286b1863).
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ dbConfigured: false, subscribers: [], senderOptions: MARKETING_SENDER_OPTIONS });
  }

  const subscribers = await listLaunchSubscribersWithStatus();
  return NextResponse.json({
    dbConfigured: true,
    senderOptions: MARKETING_SENDER_OPTIONS,
    subscribers: subscribers.map(s => ({
      id: s.id,
      email: s.email,
      createdAt: s.created_at,
      discountCode: s.discount_code,
      discountSignupStatus: s.discount_signup_status,
      hasAccount: s.has_account,
      customerId: s.customer_id,
      emailVerified: s.email_verified,
    })),
  });
}
