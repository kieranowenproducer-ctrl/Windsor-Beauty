import { NextResponse } from 'next/server';
import { createEmailVerificationToken } from '@/lib/db';
import { EMAIL_VERIFICATION_TOKEN_DURATION_MS, generateSessionToken, resolveCustomerFromRequest } from '@/lib/auth';
import { deliverVerificationEmail } from '@/lib/verificationDelivery';

export const dynamic = 'force-dynamic';

// POST /api/account/resend-verification — for the "Resend verification
// email" button on the account page banner. Requires an active customer
// session (the customer must already be logged in to see that banner).
export async function POST(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) {
    return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });
  }

  if (customer.email_verified) {
    return NextResponse.json({ success: true, alreadyVerified: true });
  }

  try {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_DURATION_MS);
    await createEmailVerificationToken({ customerId: customer.id, token, expiresAt });

    const origin = new URL(request.url).origin;
    const verifyUrl = `${origin}/account/verify-email?token=${token}`;
    const sent = await deliverVerificationEmail({
      to: customer.email,
      customerName: customer.first_name || customer.email.split('@')[0],
      verifyUrl,
      source: 'customer_resend',
    });

    if (!sent) {
      return NextResponse.json({ error: 'Could not send the verification email. Please try again shortly.' }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again shortly.' }, { status: 500 });
  }
}
