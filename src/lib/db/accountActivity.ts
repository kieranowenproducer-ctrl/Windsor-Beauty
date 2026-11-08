import { requireDb } from './client';
import { isApplePrivateRelay } from '@/lib/applePrivateRelay';

// When was an account last active, and when was it last on a particular connection?
//
// Samuel, 30 September 2026: every second-account finding should say when BOTH accounts last
// logged in, and when each was on the connection they share. A shared connection from a year ago
// and one from this morning are very different findings.
//
// Everything comes from ip_activity_log, which already records sign-ins, sign-ups, orders and the
// rest with the customer attached. Nothing new is collected to answer it.

// The events ipActivity.ts records, in the words somebody would use.
const EVENT_WORDS: Record<string, string> = {
  sign_in: 'logged in',
  register: 'signed up',
  verification: 'checked a batch code',
  research_question: 'asked a research question',
  enquiry: 'sent an enquiry',
  qr_scan: 'scanned a QR code',
  order: 'placed an order',
  earlier_record: 'older record',
};

/**
 * A database timestamp as a standard ISO string. Postgres writes "2026-09-30 06:47:18.7+00", which
 * Chrome reads but older Safari may not, and these are read on iPhones.
 */
export function isoTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function eventWord(event: string): string {
  return EVENT_WORDS[event] ?? event.replace(/_/g, ' ');
}

export interface AccountActivity {
  /** Last sign-in. Signing up logs you in, so that counts too. Null when never recorded. */
  lastLoggedIn: string | null;
  /** The last thing of any kind the site recorded for them. */
  lastSeen: string | null;
  lastSeenDoing: string | null;
}

export interface ConnectionVisit {
  ip: string;
  applePrivateRelay: boolean;
  /** Per customer id: when they were first and last on this connection. */
  visits: Record<number, { firstSeen: string; lastSeen: string }>;
}

const NO_ACTIVITY: AccountActivity = { lastLoggedIn: null, lastSeen: null, lastSeenDoing: null };

/** Last login and last activity for each of these customers, in two queries whatever the count. */
export async function activityFor(ids: number[]): Promise<Map<number, AccountActivity>> {
  const out = new Map<number, AccountActivity>();
  const unique = Array.from(new Set(ids.filter(Number.isInteger)));
  if (unique.length === 0) return out;
  const db = requireDb();
  const rows = (await db`
    SELECT DISTINCT ON (customer_id) customer_id, created_at::text AS created_at, event,
      max(created_at) FILTER (WHERE event IN ('sign_in', 'register')) OVER (PARTITION BY customer_id)::text AS last_login
    FROM ip_activity_log
    WHERE customer_id = ANY(${unique})
    ORDER BY customer_id, created_at DESC
  `) as { customer_id: number; created_at: string; event: string; last_login: string | null }[];
  for (const row of rows) {
    out.set(Number(row.customer_id), {
      lastLoggedIn: isoTime(row.last_login),
      lastSeen: isoTime(row.created_at),
      lastSeenDoing: eventWord(row.event),
    });
  }
  for (const id of unique) if (!out.has(id)) out.set(id, NO_ACTIVITY);
  return out;
}

/**
 * Every connection used by at least two of these customers, with when each was on it. 'unknown'
 * is what the logger writes when a request had no address, and is never a shared connection.
 */
export async function sharedConnectionsAmong(ids: number[]): Promise<ConnectionVisit[]> {
  const unique = Array.from(new Set(ids.filter(Number.isInteger)));
  if (unique.length < 2) return [];
  const db = requireDb();
  const rows = (await db`
    SELECT ip_address, customer_id, min(created_at)::text AS first_seen, max(created_at)::text AS last_seen
    FROM ip_activity_log
    WHERE customer_id = ANY(${unique}) AND ip_address IS NOT NULL AND ip_address <> 'unknown'
    GROUP BY ip_address, customer_id
  `) as { ip_address: string; customer_id: number; first_seen: string; last_seen: string }[];
  const byIp = new Map<string, ConnectionVisit>();
  for (const row of rows) {
    const visit = byIp.get(row.ip_address) ?? { ip: row.ip_address, applePrivateRelay: isApplePrivateRelay(row.ip_address), visits: {} };
    visit.visits[Number(row.customer_id)] = { firstSeen: isoTime(row.first_seen) ?? row.first_seen, lastSeen: isoTime(row.last_seen) ?? row.last_seen };
    byIp.set(row.ip_address, visit);
  }
  return Array.from(byIp.values()).filter(v => Object.keys(v.visits).length >= 2);
}

/** The connections two particular customers have in common. */
export function connectionsBetween(all: ConnectionVisit[], a: number, b: number): ConnectionVisit[] {
  return all.filter(v => v.visits[a] && v.visits[b]);
}
