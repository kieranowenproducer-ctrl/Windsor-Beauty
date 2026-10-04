import { beautyOperationalAddress } from '@/lib/operationalAddress';
import { NextResponse } from 'next/server';
import { createEmailVerificationToken, findCustomerById, isDbConfigured } from '@/lib/db';
import { EMAIL_VERIFICATION_TOKEN_DURATION_MS, generateSessionToken } from '@/lib/auth';
import { deliverVerificationEmail } from '@/lib/verificationDelivery';
import { ensureMemberDiscountCode } from '@/lib/memberDiscountCode';

export const dynamic = 'force-dynamic';

// POST /api/admin/customers/[id]/resend-verification
//
// The fix for the case this whole feature came from: a customer says their
// verification email never arrived, and the person on the phone to them can
// put it right there and then instead of waiting for tomorrow's reminder cron.
//
// Uses the same delivery wrapper as every other send, so a failure here is
// recorded on System Health and alerted like any other.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid customer id.' }, { status: 400 });
  }

  const customer = await findCustomerById(id);
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }

  if (customer.email_verified) {
    return NextResponse.json({ error: 'This customer has already verified their email address.' }, { status: 409 });
  }

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_DURATION_MS);
  await createEmailVerificationToken({ customerId: customer.id, token, expiresAt });

  /* Their code is created here rather than on the click, so a staff resend always carries a
   * working discount. Kieran's decision, 2 August: the customer has already been failed once by
   * the normal route, and asking them to clear the same hurdle again to get what they were
   * promised is how a small email problem turns into a lost sale. Returned to the caller too, so
   * it can be read down the phone if email is the thing that is broken. */
  const discountCode = await ensureMemberDiscountCode(customer);

  const origin = beautyOperationalAddress(process.env.NEXT_PUBLIC_SITE_URL) || beautyOperationalAddress(new URL(request.url).origin);
  const sent = await deliverVerificationEmail({
    to: customer.email,
    customerName: customer.first_name || customer.email.split('@')[0],
    verifyUrl: `${origin}/account/verify-email?token=${token}`,
    source: 'admin_resend',
    discountCode,
  });

  if (!sent) {
    return NextResponse.json(
      {
        error: 'The email would not send, even after a retry. It has been recorded on System Health.',
        discountCode,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    sentTo: customer.email,
    sentAt: new Date().toISOString(),
    discountCode,
  });
}
