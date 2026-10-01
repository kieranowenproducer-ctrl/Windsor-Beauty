import { requireDb } from './client';
// Extracted verbatim from db.ts on 2026-08-11 (Phase 2 of "thin it out").
// Everything here is re-exported from '@/lib/db', so no call site changed.

// ─── Spam protection ─────────────────────────────────────────────────────────

// Brute-force protection for /api/admin/login — tighter window/limit than
// product verification since this guards the entire admin panel, not just a
// lookup. 8 attempts per 15 minutes per IP.
const ADMIN_LOGIN_WINDOW_MINUTES = 15;
const ADMIN_LOGIN_ATTEMPT_LIMIT = 8;

export async function isAdminLoginRateLimited(ip: string): Promise<boolean> {
  const db = requireDb();
  const rows = await db`
    SELECT count(*)::int AS count FROM admin_login_attempts
    WHERE ip_address = ${ip} AND attempted_at > now() - (${ADMIN_LOGIN_WINDOW_MINUTES} || ' minutes')::interval
  `;
  const count = (rows[0]?.count as number) ?? 0;
  return count >= ADMIN_LOGIN_ATTEMPT_LIMIT;
}

// Discourages farming multiple discount codes from one IP by signing up
// with a fresh email each time. Generous enough not to bother a real
// household/office sharing one IP (5 signups / 30 minutes).
const SIGNUP_WINDOW_MINUTES = 30;
const SIGNUP_ATTEMPT_LIMIT = 5;

export async function isSignupRateLimited(ip: string): Promise<boolean> {
  const db = requireDb();
  const rows = await db`
    SELECT count(*)::int AS count FROM signup_attempts
    WHERE ip_address = ${ip} AND attempted_at > now() - (${SIGNUP_WINDOW_MINUTES} || ' minutes')::interval
  `;
  const count = (rows[0]?.count as number) ?? 0;
  return count >= SIGNUP_ATTEMPT_LIMIT;
}

export async function logSignupAttempt(ip: string): Promise<void> {
  const db = requireDb();
  await db`INSERT INTO signup_attempts (ip_address) VALUES (${ip})`;
}

export async function logAdminLoginAttempt(ip: string): Promise<void> {
  const db = requireDb();
  await db`INSERT INTO admin_login_attempts (ip_address) VALUES (${ip})`;
}
