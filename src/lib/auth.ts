import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { findCustomerByValidSessionToken, isDbConfigured, type CustomerRow } from '@/lib/db';

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, derivedHex] = stored.split(':');
  if (!salt || !derivedHex) return false;

  const derived = Buffer.from(derivedHex, 'hex');
  const supplied = scryptSync(password, salt, KEY_LENGTH);
  if (derived.length !== supplied.length) return false;
  return timingSafeEqual(derived, supplied);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function generateOrderNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easier to read and type
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `WB-${suffix}`;
}

export const CUSTOMER_SESSION_COOKIE = 'wb_customer_session';
export const CUSTOMER_SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export const PASSWORD_RESET_TOKEN_DURATION_MS = 1000 * 60 * 60; // 1 hour

// Longer than the password reset window — verification is lower-stakes
// (no account compromise risk) and people often don't check email right
// after signing up, so a generous window avoids forcing an unnecessary resend.
// Default 48h (Kieran, 2026-07-07); override with EMAIL_VERIFICATION_TOKEN_HOURS
// in env. Every email template reads EMAIL_VERIFICATION_TOKEN_HOURS so the
// emailed wording always matches the real window. (Client-side copy in the
// signup modal states "48 hours" — update it if this default ever changes.)
const parsedVerificationHours = Number(process.env.EMAIL_VERIFICATION_TOKEN_HOURS);
export const EMAIL_VERIFICATION_TOKEN_HOURS =
  Number.isFinite(parsedVerificationHours) && parsedVerificationHours > 0
    ? parsedVerificationHours
    : 48;
export const EMAIL_VERIFICATION_TOKEN_DURATION_MS = 1000 * 60 * 60 * EMAIL_VERIFICATION_TOKEN_HOURS;

export function getSessionTokenFromRequest(request: Request, cookieName: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === cookieName) return rest.join('=');
  }
  return null;
}

export async function resolveCustomerFromRequest(request: Request): Promise<CustomerRow | null> {
  if (!isDbConfigured()) return null;
  const token = getSessionTokenFromRequest(request, CUSTOMER_SESSION_COOKIE);
  if (!token) return null;
  return findCustomerByValidSessionToken(token);
}
