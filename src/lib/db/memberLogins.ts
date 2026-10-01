import { requireDb } from './client';

// Append-only audit trail of member sign-ins, read by /admin/member-logins.
// See ensureSchema() for the table.
//
// Every route that starts a member session records one row here. Writing is
// deliberately fire-and-forget: an audit-log failure must never stop somebody
// signing in to their account.

export type LoginMethod =
  | 'login'           // the normal sign-in form
  | 'register'        // brand new member, signed in as part of registering
  | 'password_set'    // lock-page invite, setting a password for the first time
  | 'password_reset'  // finished a password reset and was signed straight in
  | 'earlier_record'; // backfilled from data recorded before this log existed

export interface MemberLoginRow {
  id: number;
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  method: LoginMethod;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Same derivation as /api/verify and /api/admin/login use.
export function loginContextFromRequest(request?: Request): {
  ip: string | null;
  userAgent: string | null;
} {
  if (!request) return { ip: null, userAgent: null };
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded
    ? forwarded.split(',')[0].trim()
    : request.headers.get('x-real-ip') || null;
  return { ip, userAgent: request.headers.get('user-agent') || null };
}

// Never throws. Callers use it without awaiting, so an unhandled rejection here
// would be an unhandled rejection in a sign-in request.
export async function recordMemberLogin(params: {
  customerId: number;
  name?: string | null;
  email?: string | null;
  method: LoginMethod;
  request?: Request;
}): Promise<void> {
  const { ip, userAgent } = loginContextFromRequest(params.request);
  // Name and email fall back to the customer's current record, so a caller that
  // only has an id (the password-reset route) still produces a readable row.
  const insert = async () => {
    const db = requireDb();
    await db`
      INSERT INTO member_login_log
        (customer_id, customer_name, customer_email, method, ip_address, user_agent)
      SELECT c.id,
             COALESCE(${params.name ?? null}::text, c.first_name || ' ' || c.last_name),
             COALESCE(${params.email ?? null}::text, c.email),
             ${params.method}::text, ${ip}::text, ${userAgent}::text
      FROM customers c
      WHERE c.id = ${params.customerId}
    `;
  };

  try {
    await insert();
  } catch {
    // First sign-in after this feature ships runs before the table exists. Same
    // self-healing retry the admin routes use, so no sign-in is lost waiting for
    // somebody to open the admin page.
    try {
      const { ensureSchema } = await import('./schema');
      await ensureSchema();
      await insert();
    } catch (err) {
      console.error('[memberLogins] could not record sign-in:', err);
    }
  }

  /* Also recorded on the where-people-come-from log, which keeps the location
     as well as the address. Done here rather than in each of the four routes
     that sign somebody in, so no route can be added later that quietly misses
     it. Never throws, and nothing waits for it. */
  try {
    const { recordIpActivity } = await import('./ipActivity');
    await recordIpActivity({
      event: params.method === 'register' ? 'register' : 'sign_in',
      request: params.request,
      customerId: params.customerId,
      name: params.name ?? null,
      email: params.email ?? null,
      detail: `Member ${params.method.replace(/_/g, ' ')}`,
    });
  } catch (err) {
    console.error('[memberLogins] could not record where the sign-in came from:', err);
  }
}

export async function listMemberLogins(limit = 500): Promise<MemberLoginRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT id, customer_id, customer_name, customer_email, method,
           ip_address, user_agent, created_at
    FROM member_login_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as MemberLoginRow[];
}

// Seeds the log once from sign-in times that were already being recorded before
// this table existed, so the page opens with real history instead of nothing:
//   - every row in customer_sessions (a session row IS a sign-in), and
//   - each customer's last_login_at.
// Nothing is invented. A sign-in that was never recorded anywhere cannot appear,
// so this is a floor on past activity, not a complete history.
//
// A single sign-in usually left BOTH a session row and a last_login_at stamp a
// few milliseconds apart, so the two sources are collapsed per customer per
// minute and the genuine earliest timestamp of the pair is kept.
export async function backfillEarlierLogins(): Promise<number> {
  const db = requireDb();

  const existing = await db`
    SELECT 1 FROM member_login_log WHERE method = 'earlier_record' LIMIT 1
  `;
  if (existing.length > 0) return 0;

  const inserted = await db`
    INSERT INTO member_login_log
      (customer_id, customer_name, customer_email, method, created_at)
    SELECT c.id,
           c.first_name || ' ' || c.last_name,
           c.email,
           'earlier_record',
           t.at
    FROM (
      SELECT customer_id, MIN(at) AS at
      FROM (
        SELECT customer_id, created_at AS at FROM customer_sessions
        UNION ALL
        SELECT id AS customer_id, last_login_at AS at
        FROM customers WHERE last_login_at IS NOT NULL
      ) raw
      GROUP BY customer_id, date_trunc('minute', at)
    ) t
    JOIN customers c ON c.id = t.customer_id
    RETURNING id
  `;
  return inserted.length;
}
