import { NextResponse } from 'next/server';
import { isAdminLoginRateLimited, isDbConfigured, logAdminLoginAttempt } from '@/lib/db';

// Admin credentials are read from environment variables only — confirmed set
// in Vercel production/preview (ADMIN_USERNAME, ADMIN_PASSWORD,
// ADMIN_SESSION_TOKEN). No hardcoded fallback: a previous version fell back
// to a hard-coded default password and a fixed session token if the env
// vars were ever unset, which would have silently shipped a guessable admin
// password. That fallback was removed; the value must come from
// ADMIN_PASSWORD. Failing closed instead — if any of these are missing, the
// admin panel is unreachable until they're configured, which is safer than
// a silent weak default.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_TOKEN = process.env.ADMIN_SESSION_TOKEN;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: Request) {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !SESSION_TOKEN) {
    console.error('[admin/login] ADMIN_USERNAME/ADMIN_PASSWORD/ADMIN_SESSION_TOKEN not configured');
    return NextResponse.json({ error: 'Admin login is not configured.' }, { status: 503 });
  }

  const { username, password, rememberMe } = await request.json();
  const ip = getClientIp(request);

  // Brute-force protection — same ip_address/attempted_at pattern as the
  // product-verification rate limiter (src/lib/db.ts isRateLimited). Fails
  // OPEN (never blocks login) if the check itself throws — e.g. the
  // admin_login_attempts table not having been migrated onto this database
  // yet. The whole point of this feature is to add a safety net on top of
  // login, never to be a new way for login itself to break.
  if (isDbConfigured()) {
    const rateLimited = await isAdminLoginRateLimited(ip).catch(err => {
      console.error('[admin/login] Rate-limit check failed, allowing through:', err);
      return false;
    });
    if (rateLimited) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }
    await logAdminLoginAttempt(ip).catch(() => {});
  }

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // 8 hours was too short for a single-admin internal tool — a long form-filling
  // session (e.g. adding a product) could outlast it and hit a 401 on save.
  const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7; // 30 days or 7 days

  const response = NextResponse.json({ success: true });
  response.cookies.set('wb_admin_session', SESSION_TOKEN, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
  return response;
}
