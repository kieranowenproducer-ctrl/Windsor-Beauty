import { beautyOperationalAddress } from '@/lib/operationalAddress';
import { NextResponse } from 'next/server';
import { createPasswordResetToken, findCustomerByEmail, isDbConfigured, logAutomationFailure } from '@/lib/db';
import { generateSessionToken, PASSWORD_RESET_TOKEN_DURATION_MS } from '@/lib/auth';
import { isPasswordResetEmailConfigured, sendPasswordResetEmail } from '@/lib/passwordResetEmail';

export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENERIC_MESSAGE = 'If an account exists for that email address, we have sent a link to reset your password.';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  // Always return the same response whether or not the email matches an
  // account — revealing that would let someone enumerate registered emails.
  const genericResponse = NextResponse.json({ success: true, message: GENERIC_MESSAGE });

  if (!isDbConfigured() || !isPasswordResetEmailConfigured()) {
    return genericResponse;
  }

  try {
    const customer = await findCustomerByEmail(email);
    if (customer) {
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_DURATION_MS);
      await createPasswordResetToken({ customerId: customer.id, token, expiresAt });

      const origin = beautyOperationalAddress(new URL(request.url).origin);
      const resetUrl = `${origin}/account/reset-password?token=${token}`;
      await sendPasswordResetEmail({
        to: customer.email,
        customerName: customer.first_name || customer.email.split('@')[0],
        resetUrl,
      });
    }
  } catch (err) {
    // The HTTP response must stay generic either way (anti-enumeration) —
    // but logging server-side (admin-only, never exposed to the requester)
    // is safe and means a Resend outage here is no longer invisible.
    await logAutomationFailure('customer_email', 'Password reset email failed to send', { detail: err }).catch(() => {});
  }

  return genericResponse;
}
