import { requireDb } from './client';
import { activityFor, eventWord, isoTime, type AccountActivity } from './accountActivity';
import { addressKey, normalisePostcode } from './duplicateAccounts';
import { isApplePrivateRelay } from '@/lib/applePrivateRelay';
import {
  normaliseSecurityAddress,
  normaliseSecurityEmail,
  normaliseSecurityName,
  normaliseSecurityPhone,
} from './securityReviews';

// Two accounts side by side, for the Compare button on every "may be a second account" finding.
//
// Samuel, 30 September 2026: a finding that says "same address as Naomi Wye" or "associated customer
// records 83, 92, 103" asks the reader to take it on trust. He wanted to tap the other account and
// SEE what matched. So this answers one question, "what exactly do these two accounts have in
// common?", from the same rows the checks read, and marks each line as the same or different.
//
// SAME RULES AS THE CHECKS. Name, email, phone and address are compared with the exact normalisers
// the two checks use (securityReviews.ts and duplicateAccounts.ts). If this screen had its own idea
// of "same address" it would, sooner or later, show "different" beside a finding that says "same",
// and the reader would stop trusting both.
//
// READ ONLY. It writes nothing and emails nobody.

export type MatchState = 'same' | 'different' | 'missing';

export interface ComparedAccount {
  id: number;
  name: string | null;
  email: string;
}

export interface ComparisonField {
  label: string;
  subject: string;
  other: string;
  /** null when the line is there for context only and a match means nothing (eg sign-up date). */
  match: MatchState | null;
}

export interface ConnectionUse {
  firstSeen: string;
  lastSeen: string;
  times: number;
  /** What they were doing on it: signing up, logging in, ordering, and so on. */
  events: string[];
}

export interface SharedConnection {
  ip: string;
  place: string | null;
  /** On Apple's published list of iPhone Private Relay addresses: shared by thousands of strangers. */
  applePrivateRelay: boolean;
  subject: ConnectionUse;
  other: ConnectionUse;
}

export interface ComparedOrder {
  orderNumber: string;
  createdAt: string;
  status: string;
  discountCode: string | null;
}

export interface AccountComparison {
  subject: ComparedAccount;
  other: ComparedAccount;
  /** Plain one-line reasons, eg "Same home address". Empty means nothing matches today. */
  matches: string[];
  /** When each last logged in and was last seen anywhere on the site. */
  activity: { subject: AccountActivity; other: AccountActivity };
  fields: ComparisonField[];
  sharedConnections: SharedConnection[];
  /** How many connections each account has used that the other has NOT. */
  unsharedConnections: { subject: number; other: number };
  orders: { subject: ComparedOrder[]; other: ComparedOrder[] };
}

interface Row {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_postcode: string | null;
  address_country: string | null;
  created_at: string;
  email_verified: boolean | null;
  discount_code: string | null;
  banned_at: string | null;
  code_used_at: string | null;
}

function nameOf(row: Row): string | null {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}

function day(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', { dateStyle: 'medium', timeZone: 'Europe/London' });
}

function dayTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });
}

function addressText(row: Row): string {
  return [row.address_line1, row.address_line2, row.address_city].map(v => v?.trim()).filter(Boolean).join(', ');
}

/** Same when both have a value and the normalised values agree, missing when either is blank. */
function compare(a: string, b: string, normalisedA: string, normalisedB: string): MatchState {
  if (!a.trim() || !b.trim() || !normalisedA || !normalisedB) return 'missing';
  return normalisedA === normalisedB ? 'same' : 'different';
}

function welcomeCode(row: Row): string {
  if (!row.discount_code) return '';
  return row.code_used_at ? `${row.discount_code} (used ${day(row.code_used_at)})` : `${row.discount_code} (not used yet)`;
}

/**
 * Compare two accounts. Returns null when either one no longer exists, so the screen can say so
 * rather than drawing half a comparison.
 */
export async function compareAccounts(subjectId: number, otherId: number): Promise<AccountComparison | null> {
  const db = requireDb();

  const rows = (await db`
    SELECT c.id, c.email, c.first_name, c.last_name, c.phone,
           c.address_line1, c.address_line2, c.address_city, c.address_postcode, c.address_country,
           c.created_at, c.email_verified, c.discount_code, c.banned_at,
           s.used_at AS code_used_at
    FROM customers c
    LEFT JOIN discount_signups s ON lower(s.email) = lower(c.email)
    WHERE c.id IN (${subjectId}, ${otherId})
  `) as Row[];
  const a = rows.find(r => Number(r.id) === subjectId);
  const b = rows.find(r => Number(r.id) === otherId);
  if (!a || !b) return null;

  // Every connection either account has been seen on, grouped so each line is one address and one
  // kind of visit. 'unknown' is what the logger writes when a request had no address at all, and
  // treating those as one shared connection would link every such customer to every other.
  const ipRows = (await db`
    SELECT customer_id, ip_address, event,
           max(nullif(concat_ws(', ', city, country), ''))  AS place,
           min(created_at)::text AS first_seen, max(created_at)::text AS last_seen, count(*)::int AS times
    FROM ip_activity_log
    WHERE customer_id IN (${subjectId}, ${otherId})
      AND ip_address IS NOT NULL AND ip_address <> 'unknown'
    GROUP BY customer_id, ip_address, event
  `) as { customer_id: number; ip_address: string; event: string; place: string | null; first_seen: string; last_seen: string; times: number }[];

  type Use = ConnectionUse & { place: string | null };
  const usesBy = new Map<number, Map<string, Use>>();
  for (const row of ipRows) {
    const byIp = usesBy.get(Number(row.customer_id)) ?? new Map<string, Use>();
    const current = byIp.get(row.ip_address);
    if (!current) {
      byIp.set(row.ip_address, {
        firstSeen: isoTime(row.first_seen) ?? row.first_seen, lastSeen: isoTime(row.last_seen) ?? row.last_seen, times: row.times,
        events: [eventWord(row.event)], place: row.place,
      });
    } else {
      const first = isoTime(row.first_seen) ?? row.first_seen;
      const last = isoTime(row.last_seen) ?? row.last_seen;
      if (first < current.firstSeen) current.firstSeen = first;
      if (last > current.lastSeen) current.lastSeen = last;
      current.times += row.times;
      const word = eventWord(row.event);
      if (!current.events.includes(word)) current.events.push(word);
      current.place = current.place ?? row.place;
    }
    usesBy.set(Number(row.customer_id), byIp);
  }
  const subjectIps = usesBy.get(subjectId) ?? new Map<string, Use>();
  const otherIps = usesBy.get(otherId) ?? new Map<string, Use>();
  const sharedConnections: SharedConnection[] = [];
  for (const [ip, use] of Array.from(subjectIps.entries())) {
    const theirs = otherIps.get(ip);
    if (!theirs) continue;
    const { place, ...subjectUse } = use;
    const { place: otherPlace, ...otherUse } = theirs;
    sharedConnections.push({ ip, place: place ?? otherPlace ?? null, applePrivateRelay: isApplePrivateRelay(ip), subject: subjectUse, other: otherUse });
  }

  const orderRows = (await db`
    SELECT customer_id, order_number, created_at::text AS created_at, status, discount_code
    FROM (SELECT *, row_number() OVER (PARTITION BY customer_id ORDER BY created_at DESC,id DESC) AS rn
      FROM orders WHERE customer_id IN (${subjectId}, ${otherId})) recent
    WHERE rn<=100 ORDER BY created_at DESC
  `) as { customer_id: number; order_number: string; created_at: string; status: string; discount_code: string | null }[];
  const toOrder = (r: (typeof orderRows)[number]): ComparedOrder => ({
    orderNumber: r.order_number, createdAt: isoTime(r.created_at) ?? r.created_at, status: r.status, discountCode: r.discount_code,
  });
  const subjectOrders = orderRows.filter(r => Number(r.customer_id) === subjectId).map(toOrder);
  const otherOrders = orderRows.filter(r => Number(r.customer_id) === otherId).map(toOrder);

  // THE FRONT DOOR counts as the same if EITHER check would call it the same: the sign-up check
  // looks at first line plus postcode, the security queue at the whole address. Showing "different"
  // when one of them raised the finding on it would contradict the finding on the same screen.
  const doorA = addressKey(a.address_line1, a.address_postcode);
  const doorB = addressKey(b.address_line1, b.address_postcode);
  const fullA = normaliseSecurityAddress(a);
  const fullB = normaliseSecurityAddress(b);
  const addressMatch: MatchState = !doorA || !doorB
    ? 'missing'
    : doorA === doorB || (fullA && fullA === fullB) ? 'same' : 'different';

  const activity = await activityFor([subjectId, otherId]);
  const actA = activity.get(subjectId) ?? { lastLoggedIn: null, lastSeen: null, lastSeenDoing: null };
  const actB = activity.get(otherId) ?? { lastLoggedIn: null, lastSeen: null, lastSeenDoing: null };
  const seen = (x: AccountActivity) => x.lastSeen ? `${dayTime(x.lastSeen)} (${x.lastSeenDoing})` : 'Never recorded';

  const nameA = nameOf(a) ?? '';
  const nameB = nameOf(b) ?? '';
  const codesA = new Set(subjectOrders.map(o => o.discountCode?.toUpperCase()).filter(Boolean));
  const codesB = new Set(otherOrders.map(o => o.discountCode?.toUpperCase()).filter(Boolean));
  const sharedCode = Array.from(codesA).some(code => codesB.has(code));

  const fields: ComparisonField[] = [
    { label: 'Name', subject: nameA, other: nameB, match: compare(nameA, nameB, normaliseSecurityName(a.first_name, a.last_name), normaliseSecurityName(b.first_name, b.last_name)) },
    { label: 'Email', subject: a.email, other: b.email, match: compare(a.email, b.email, normaliseSecurityEmail(a.email), normaliseSecurityEmail(b.email)) },
    { label: 'Phone', subject: a.phone ?? '', other: b.phone ?? '', match: compare(a.phone ?? '', b.phone ?? '', normaliseSecurityPhone(a.phone), normaliseSecurityPhone(b.phone)) },
    { label: 'Home address', subject: addressText(a), other: addressText(b), match: addressMatch },
    { label: 'Postcode', subject: a.address_postcode ?? '', other: b.address_postcode ?? '', match: compare(a.address_postcode ?? '', b.address_postcode ?? '', normalisePostcode(a.address_postcode), normalisePostcode(b.address_postcode)) },
    { label: 'Account opened', subject: day(a.created_at), other: day(b.created_at), match: null },
    { label: 'Last logged in', subject: actA.lastLoggedIn ? dayTime(actA.lastLoggedIn) : 'Never recorded', other: actB.lastLoggedIn ? dayTime(actB.lastLoggedIn) : 'Never recorded', match: null },
    { label: 'Last seen on the site', subject: seen(actA), other: seen(actB), match: null },
    { label: 'Email confirmed', subject: a.email_verified ? 'Yes' : 'No', other: b.email_verified ? 'Yes' : 'No', match: null },
    { label: 'Welcome 10% code', subject: welcomeCode(a), other: welcomeCode(b), match: null },
    {
      label: 'Codes used at checkout',
      subject: Array.from(codesA).join(', '), other: Array.from(codesB).join(', '),
      // Only "same" means anything here: one code on two accounts. Two different codes is normal.
      match: sharedCode ? 'same' : null,
    },
    { label: 'Account status', subject: a.banned_at ? `Banned ${day(a.banned_at)}` : 'Active', other: b.banned_at ? `Banned ${day(b.banned_at)}` : 'Active', match: null },
  ];

  const matches: string[] = [];
  for (const field of fields) {
    if (field.match !== 'same') continue;
    if (field.label === 'Postcode' && addressMatch === 'same') continue; // said once, as the address
    if (field.label === 'Home address') matches.push('Same home address');
    else if (field.label === 'Postcode') matches.push('Same postcode (a different house on the same street)');
    else if (field.label === 'Codes used at checkout') matches.push('The same discount code used on both accounts');
    else matches.push(`Same ${field.label.toLowerCase()}`);
  }
  if (sharedConnections.length > 0) {
    // Say in the headline when the connection is Apple's, not only further down: a reader who stops
    // at "Same internet connection" has been told something far stronger than the truth.
    const relay = sharedConnections.filter(c => c.applePrivateRelay).length;
    const ordinary = sharedConnections.length - relay;
    if (ordinary > 0) {
      matches.push(ordinary === 1 ? 'Same internet connection' : `${ordinary} internet connections in common`);
    }
    if (relay > 0) {
      matches.push(relay === 1
        ? 'Same Apple iPhone Private Relay address, which thousands of strangers share, so on its own it proves almost nothing'
        : `${relay} Apple iPhone Private Relay addresses in common, which thousands of strangers share, so on their own they prove almost nothing`);
    }
  }

  return {
    subject: { id: subjectId, name: nameOf(a), email: a.email },
    other: { id: otherId, name: nameOf(b), email: b.email },
    matches,
    activity: { subject: actA, other: actB },
    fields,
    sharedConnections,
    unsharedConnections: {
      subject: subjectIps.size - sharedConnections.length,
      other: otherIps.size - sharedConnections.length,
    },
    orders: { subject: subjectOrders.slice(0, 10), other: otherOrders.slice(0, 10) },
  };
}
