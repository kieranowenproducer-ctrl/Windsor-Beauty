import { NextResponse } from 'next/server';
import { completePendingCustomer, createCustomerSession, findCustomerByEmail, isDbConfigured } from '@/lib/db';
import { recordMemberLogin } from '@/lib/db/memberLogins';
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_DURATION_MS,
  generateSessionToken,
  hashPassword,
} from '@/lib/auth';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'Account activation is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body?.lastName === 'string' ? body.lastName.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }
  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'Please enter your first and last name.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Your password must be at least 8 characters long.' }, { status: 400 });
  }

  try {
    const customer = await findCustomerByEmail(email);
    if (!customer || customer.account_status !== 'pending_password') {
      return NextResponse.json(
        { error: 'We could not find a pending account for this email address.' },
        { status: 404 }
      );
    }

    const updated = await completePendingCustomer(customer.id, {
      passwordHash: hashPassword(password),
      firstName,
      lastName,
    });

    if (!updated) {
      return NextResponse.json({ error: 'We could not activate your account. Please try again shortly.' }, { status: 500 });
    }

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_DURATION_MS);
    await createCustomerSession({ customerId: updated.id, token, expiresAt });
    recordMemberLogin({
      customerId: updated.id,
      name: `${firstName} ${lastName}`,
      email: updated.email,
      method: 'password_set',
      request,
    }).catch(() => {});

    const response = NextResponse.json({ success: true, redirect: '/account' });
    response.cookies.set(CUSTOMER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Something went wrong while activating your account. Please try again shortly.' }, { status: 500 });
  }
}
