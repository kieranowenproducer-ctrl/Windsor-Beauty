import { NextResponse } from 'next/server';
import { createCustomerSession, findCustomerByEmail, isDbConfigured, touchCustomerLastLogin } from '@/lib/db';
import { recordMemberLogin } from '@/lib/db/memberLogins';
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_DURATION_MS,
  generateSessionToken,
  verifyPassword,
} from '@/lib/auth';

// Admin credentials, required from environment variables only — no
// hardcoded fallback. Mirrors the same fix already applied to
// /api/admin/login: a published default here would be just as exploitable
// via this "single portal" shortcut as it would be on the dedicated admin
// login route.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SESSION_TOKEN = process.env.ADMIN_SESSION_TOKEN;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!identifier || !password) {
    return NextResponse.json({ error: 'Please enter your email/username and password.' }, { status: 400 });
  }

  // Single portal: staff sign in with the admin username and are routed straight
  // to the staff panel, customers sign in with their email and reach their account.
  if (ADMIN_USERNAME && ADMIN_PASSWORD && ADMIN_SESSION_TOKEN && identifier === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const response = NextResponse.json({ success: true, redirect: '/admin/dashboard' });
    response.cookies.set('wb_admin_session', ADMIN_SESSION_TOKEN, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      // 30 days, matching /admin/login + the middleware's rolling refresh —
      // the old 8-hour cookie here was why admins who signed in through the
      // public portal found themselves logged out later the same day.
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
    return response;
  }

  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'Account sign-in is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }

  try {
    const customer = await findCustomerByEmail(identifier);
    if (!customer) {
      return NextResponse.json({ error: 'Incorrect email/username or password.' }, { status: 401 });
    }

    // A lock-page lead (account_status='pending_password') has no password
    // to check yet — never call verifyPassword() on a null hash. Tell the
    // frontend to send them to set one up instead of a generic auth failure.
    if (!customer.password_hash) {
      return NextResponse.json(
        { error: 'needsPassword', redirect: `/account/create-password?email=${encodeURIComponent(customer.email)}` },
        { status: 403 }
      );
    }

    if (!verifyPassword(password, customer.password_hash)) {
      return NextResponse.json({ error: 'Incorrect email/username or password.' }, { status: 401 });
    }

    if (customer.account_status === 'pending_password') {
      return NextResponse.json({ error: 'needsPassword', redirect: '/account/register' }, { status: 403 });
    }

    // A banned account (task 9cd55f28). Checked AFTER the password, so a wrong password never
    // reveals that an address belongs to a banned account, and worded without the reason: the
    // reason is staff's, and telling somebody exactly what gave them away only teaches them to
    // hide it better next time.
    if (customer.banned_at) {
      return NextResponse.json(
        { error: 'This account has been closed. Please contact us if you think that is a mistake.' },
        { status: 403 }
      );
    }

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_DURATION_MS);
    await createCustomerSession({ customerId: customer.id, token, expiresAt });
    touchCustomerLastLogin(customer.id).catch(() => {});
    recordMemberLogin({
      customerId: customer.id,
      name: `${customer.first_name} ${customer.last_name}`,
      email: customer.email,
      method: 'login',
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
    return NextResponse.json({ error: 'Something went wrong while signing you in. Please try again shortly.' }, { status: 500 });
  }
}
