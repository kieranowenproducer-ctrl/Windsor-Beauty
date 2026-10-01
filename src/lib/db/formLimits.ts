// Spam brakes for the public forms anyone can post to without logging in:
// the contact form, review submission, and the back-in-stock signup.
//
// Registration, admin login and the AI assistant already had their own limits.
// These three did not, so a script could have hammered them as fast as it
// liked — filling the enquiries inbox, the review queue, or the alert list.
//
// HOW IT WORKS: every submission writes one row (which form, which connection,
// when). Before accepting the next one we count that connection's rows inside
// the recent window. Over the limit, we refuse with a 429.
//
// IT FAILS OPEN, ON PURPOSE. If the database is unreachable or the count query
// errors, the submission is allowed through. A customer with a genuine question
// must never be blocked because a spam counter is having a bad day. The cost of
// failing open is some spam; the cost of failing closed is a lost customer.

import { requireDb, isDbConfigured } from './client';

// The first request after this ships arrives before form_attempts exists. Rather
// than making someone press "Run Database Setup" before the brakes do anything,
// create the table on that first failure and try once more — the same approach
// the enquiries and IP-address routes already take.
//
// Guarded so it happens at most once per running instance: after the table
// exists the query stops failing, and a migration must never sit in the path of
// every submission.
let schemaRepairAttempted = false;

async function repairSchemaOnce(): Promise<boolean> {
  if (schemaRepairAttempted) return false;
  schemaRepairAttempted = true;
  try {
    const { ensureSchema } = await import('./schema');
    await ensureSchema();
    return true;
  } catch {
    return false;
  }
}

/** The connection a request came from, as best we can tell behind Vercel's proxy. */
export function clientIpOf(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * How many submissions each connection gets, and over what period.
 * Set generously: a real person filling in a form twice, changing their mind,
 * and trying again must never hit these. They exist to stop scripts.
 */
export const FORM_LIMITS = {
  /** Someone with a genuine problem might send two or three. Five is plenty. */
  contact: { limit: 5, windowMinutes: 15 },
  /** Reviewing several products in one sitting is normal. Reviewing ten is not. */
  review: { limit: 5, windowMinutes: 60 },
  /** Signing up for a few restock alerts at once is entirely reasonable. */
  'stock-alert': { limit: 10, windowMinutes: 60 },
} as const;

export type FormName = keyof typeof FORM_LIMITS;

/**
 * True when this connection has already had its allowance for this form.
 * Never throws — see the fail-open note at the top of this file.
 */
export async function isFormRateLimited(form: FormName, ip: string): Promise<boolean> {
  if (!isDbConfigured()) return false;
  const { limit, windowMinutes } = FORM_LIMITS[form];

  const count = async () => {
    const db = requireDb();
    const rows = await db`
      SELECT count(*)::int AS count FROM form_attempts
      WHERE form = ${form}
        AND ip_address = ${ip}
        AND attempted_at > now() - (${windowMinutes} || ' minutes')::interval
    `;
    return (rows[0]?.count as number) ?? 0;
  };

  try {
    return (await count()) >= limit;
  } catch {
    // Almost always a first run before the table exists.
    if (await repairSchemaOnce()) {
      try {
        return (await count()) >= limit;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Record one submission against this connection. Call it whether or not the
 * submission went on to succeed, so retrying a failing form still counts.
 * Never throws.
 */
export async function logFormAttempt(form: FormName, ip: string): Promise<void> {
  if (!isDbConfigured()) return;
  const insert = async () => {
    const db = requireDb();
    await db`INSERT INTO form_attempts (form, ip_address) VALUES (${form}, ${ip})`;
  };
  try {
    await insert();
  } catch {
    // Almost always a first run before the table exists.
    if (await repairSchemaOnce()) {
      try {
        await insert();
      } catch {
        // Losing a counter row is not worth failing a customer's submission over.
      }
    }
  }
}

/** The wording customers see when they hit a limit. Apologetic, not accusing. */
export const RATE_LIMIT_MESSAGE =
  'That is a few too many in a short space of time. Please wait a little while and try again.';
