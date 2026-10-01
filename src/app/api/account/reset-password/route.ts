import { NextResponse } from 'next/server';
import {
  createCustomerSession,
  deleteCustomerSessionsByCustomerId,
  findValidPasswordResetToken,
  isDbConfigured,
  markPasswordResetTokenUsed,
  updateCustomerPassword,
} from '@/lib/db';
import { recordMemberLogin } from '@/lib/db/memberLogins';
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_DURATION_MS,
  generateSessionToken,
  hashPassword,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'Password reset is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!token) {
    return NextResponse.json({ error: 'This password reset link is invalid. Please request a new one.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Your new password must be at least 8 characters long.' }, { status: 400 });
  }

  try {
    const resetToken = await findValidPasswordResetToken(token);
    if (!resetToken) {
      return NextResponse.json(
        { error: 'This password reset link is invalid or has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    await updateCustomerPassword(resetToken.customer_id, hashPassword(password));
    await markPasswordResetTokenUsed(token);

    // A password reset is a strong signal the old password may be compromised —
    // sign the customer out everywhere and issue one fresh session below.
    await deleteCustomerSessionsByCustomerId(resetToken.customer_id);

    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_DURATION_MS);
    await createCustomerSession({ customerId: resetToken.customer_id, token: sessionToken, expiresAt });
    recordMemberLogin({
      customerId: resetToken.customer_id,
      method: 'password_reset',
      request,
    }).catch(() => {});

    const response = NextResponse.json({ success: true, redirect: '/account' });
    response.cookies.set(CUSTOMER_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: 'Something went wrong while resetting your password. Please try again shortly.' },
      { status: 500 }
    );
  }
}
