import { NextResponse } from 'next/server';
import {
  createCustomerSession,
  deleteCustomerSessionsByCustomerId,
  resetCustomerPasswordByToken,
  isDbConfigured,
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
    const recovered = await resetCustomerPasswordByToken(token, hashPassword(password));
    if (!recovered) {
      return NextResponse.json(
        { error: 'This password reset link is invalid or has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // A password reset is a strong signal the old password may be compromised —
    // sign the customer out everywhere and issue one fresh session below.
    await deleteCustomerSessionsByCustomerId(recovered.id);

    // Recovery confirms email ownership, but a lead must still complete the
    // full registration checks before receiving an account session.
    if (recovered.account_status === 'pending_password') {
      return NextResponse.json({ success: true, redirect: '/account/register' });
    }

    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_DURATION_MS);
    await createCustomerSession({ customerId: recovered.id, token: sessionToken, expiresAt });
    recordMemberLogin({
      customerId: recovered.id,
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
