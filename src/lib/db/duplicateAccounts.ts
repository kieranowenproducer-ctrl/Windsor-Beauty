import { requireDb } from './client';

// Spotting somebody opening a second account to get the 10% welcome discount twice (task c76f31fb).
//
// Kieran, 16 September 2026: "Run a automatic rule to check ip address /residential address when a
// new customer signs to ensure that there is no one trying to open more accounts to take advantage
// of getting extra the 10% opening offer."
//
// HOW THE 10% ACTUALLY WORKS, because the rule only makes sense against it: one code per email
// address, ever (discount_signups.email is unique), issued only once that email has been confirmed.
// So a second helping of 10% needs a second email address. What it does NOT usually need is a
// second house or a second broadband line, and that is what this looks at.
//
// IT WARNS. IT NEVER BLOCKS, and it must never start to. Kieran parked IP blocking on 5 August 2026
// and the reasoning still stands: addresses are shared by households, offices and whole mobile
// masts, so the cost of being wrong lands on an innocent customer who simply leaves. Two people at
// one address with two accounts is a couple far more often than it is a fraud. Everything here
// produces something for a person to look at and decide.
//
// NO NEW TABLE. Every fact needed is already recorded: the address sits on the customer row and is
// required at sign-up, and the connection is already written to ip_activity_log with event
// 'register'. So this is a question asked of data the shop already holds, not a new pile of it.

/**
 * A postcode with the spacing and capitals taken out, so "SW1A 1AA", "sw1a1aa" and " SW1A  1AA "
 * are one place. Without this the whole check is defeated by a space bar.
 */
export function normalisePostcode(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

/**
 * A street line reduced to the bit that identifies the building: lower case, punctuation dropped,
 * runs of spaces squashed. "Flat 2, 14 High St." and "flat 2 14 high st" become the same string.
 *
 * Deliberately NOT clever. It does not expand "St" to "Street" or understand flat numbering,
 * because a wrong guess here invents a match between two different homes, and this feeds a warning
 * about a real customer. Missing a match costs a look that nobody takes; inventing one costs a
 * customer being accused of something they did not do.
 */
export function normaliseAddressLine(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[.,'’\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Enough of an address to say "this is the same front door", or '' when there is not enough. */
export function addressKey(line1: string | null | undefined, postcode: string | null | undefined): string {
  const post = normalisePostcode(postcode);
  const line = normaliseAddressLine(line1);
  // A postcode alone is a street, not a house, so both halves are required. An empty key never
  // matches anything, which is the safe direction: no address, no accusation.
  if (!post || !line) return '';
  return `${post}|${line}`;
}

/**
 * Three or more accounts on one internet connection is where the existing /admin/ip-addresses page
 * already says "worth a look", and the two screens must not disagree with each other. It is set
 * above two on purpose: a couple sharing a router is two, and that is normal.
 */
export const SHARED_CONNECTION_THRESHOLD = 3;

export interface MatchedAccount {
  id: number;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface DuplicateFinding {
  customerId: number;
  email: string;
  name: string | null;
  createdAt: string;
  /** Other accounts at the same front door. */
  sameAddress: MatchedAccount[];
  /** Other accounts seen signing up from the same connection. */
  sameConnection: MatchedAccount[];
  /** The connection they registered from, for the admin screen. Never shown to a customer. */
  ipAddress: string | null;
  /**
   * Where this account stands on Kieran's welcome-offer check (task ce609555): 'review' means their
   * 10% is currently paused, 'clear' means it was looked at and nothing matched, null means nobody
   * has run that check on them. 'approved' never reaches here, because an approved account is left
   * out of the list entirely.
   */
  offerStatus: 'clear' | 'review' | 'approved' | null;
  /** One plain sentence saying what was found. */
  summary: string;
}

interface CustomerRow {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  address_line1: string | null;
  address_postcode: string | null;
  created_at: string;
}

function displayName(row: { first_name: string | null; last_name: string | null }): string | null {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}

function toMatch(row: CustomerRow): MatchedAccount {
  return { id: row.id, email: row.email, name: displayName(row), createdAt: row.created_at };
}

/**
 * Only accounts that were ALREADY THERE count as a match.
 *
 * The thing being looked for is somebody who already has an account opening another one, so the
 * question is always "did this account turn up at an address we already knew?". Comparing both
 * ways instead reported a married couple twice, once as each other's duplicate, which doubled the
 * count and named the innocent original alongside the newcomer. Ties are broken on the id so that
 * two accounts created in the same second still produce one row rather than two.
 */
export function arrivedBefore(
  candidate: { id: number; created_at: string },
  subject: { id: number; created_at: string },
): boolean {
  const candidateAt = new Date(candidate.created_at).getTime();
  const subjectAt = new Date(subject.created_at).getTime();
  if (candidateAt !== subjectAt) return candidateAt < subjectAt;
  return candidate.id < subject.id;
}

/**
 * Has this account already been allowed as authentic?
 *
 * Kieran, 18 September 2026: "so it doesn't appear again on the dashboards for the customer
 * chosen". Only 'approved' silences an account. 'review' means the opposite, that their 10% is
 * being held pending a look, and null means nobody has decided yet, so both still show.
 *
 * Note what this does NOT do: it says nothing about anybody else. That is the whole of the
 * third-account rule. An approval belongs to one customer, so a third person at the same address is
 * a different customer with no approval and is raised, exactly as Kieran asked.
 */
export function isAllowedAsAuthentic(status: 'clear' | 'review' | 'approved' | null): boolean {
  return status === 'approved';
}

/**
 * What the welcome-offer check has decided about one account, or null if nobody has run it.
 *
 * Read from Kieran's opening_offer_reviews table rather than a second one of our own: two records
 * of "this household is fine" would drift, and then allowing somebody on one screen would leave
 * them still shouting on another. Missing table or a failed read answers null, which errs towards
 * showing the finding rather than hiding it.
 */
async function offerStatusFor(customerId: number): Promise<'clear' | 'review' | 'approved' | null> {
  try {
    const db = requireDb();
    const rows = await db`
      SELECT status FROM opening_offer_reviews WHERE customer_id = ${customerId} LIMIT 1
    `;
    const status = rows[0]?.status;
    return status === 'clear' || status === 'review' || status === 'approved' ? status : null;
  } catch {
    return null;
  }
}

/** How many accounts, written the way somebody would say it. */
function countPhrase(n: number, singular: string, plural: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural}`;
}

/**
 * The sentence that ends up in the red warning and the email. Written to be read on a phone by
 * somebody who is not going to open the admin panel to work out what it means, and worded as
 * something to check rather than something proved.
 */
export function summariseFinding(
  name: string | null,
  email: string,
  sameAddress: MatchedAccount[],
  sameConnection: MatchedAccount[]
): string {
  const who = name ? `${name} (${email})` : email;
  const parts: string[] = [];
  if (sameAddress.length > 0) {
    parts.push(`the same address as ${countPhrase(sameAddress.length, 'another account', 'other accounts')} (${sameAddress.map(a => a.email).join(', ')})`);
  }
  if (sameConnection.length > 0) {
    parts.push(`the same internet connection as ${countPhrase(sameConnection.length, 'another account', 'other accounts')} (${sameConnection.map(a => a.email).join(', ')})`);
  }
  return `New account ${who} has ${parts.join(', and ')}. Worth checking before they use a second 10% welcome discount.`;
}

/**
 * Look at ONE customer against everybody else. Returns null when there is nothing to report, which
 * is the answer almost every time: this must stay quiet unless there is genuinely something.
 *
 * Never throws. It is called from the sign-up route, and signing up must not fail because a
 * background check had a bad day.
 */
export async function findDuplicateSignals(customerId: number): Promise<DuplicateFinding | null> {
  try {
    const db = requireDb();

    const subjectRows = await db`
      SELECT id, email, first_name, last_name, address_line1, address_postcode, created_at
      FROM customers WHERE id = ${customerId} LIMIT 1
    `;
    const subject = subjectRows[0] as CustomerRow | undefined;
    if (!subject) return null;

    // SAME FRONT DOOR. Compared in SQL with the same squashing the helpers above do, so a stray
    // space or a capital letter cannot hide a match. Banned accounts are included on purpose: an
    // account opened at the address of one already banned is the most interesting case there is.
    // The database narrows by postcode only; the decision about whether it is the same front door
    // is made ONCE, in addressKey() below, on both sides. An earlier version of this tried to
    // reproduce the tidying in SQL as well, and the two spellings of the same rule immediately
    // disagreed about a leading space. One rule, one place.
    const key = addressKey(subject.address_line1, subject.address_postcode);
    let sameAddress: MatchedAccount[] = [];
    if (key) {
      const rows = await db`
        SELECT id, email, first_name, last_name, address_line1, address_postcode, created_at
        FROM customers
        WHERE id <> ${subject.id}
          AND upper(regexp_replace(coalesce(address_postcode, ''), '\\s', '', 'g'))
              = ${normalisePostcode(subject.address_postcode)}
        ORDER BY created_at DESC
        LIMIT 200
      `;
      sameAddress = (rows as CustomerRow[])
        .filter((row) => addressKey(row.address_line1, row.address_postcode) === key)
        .filter((row) => arrivedBefore(row, subject))
        .slice(0, 25)
        .map(toMatch);
    }

    // SAME CONNECTION. ip_activity_log already records every sign-up with event 'register', so
    // nothing new is collected to answer this. Only other accounts count, and only real addresses:
    // getClientIp writes the literal 'unknown' when a request arrives with no address headers at
    // all, and every one of those would otherwise look like the same person.
    let sameConnection: MatchedAccount[] = [];
    let ipAddress: string | null = null;
    const ipRows = await db`
      SELECT ip_address FROM ip_activity_log
      WHERE customer_id = ${subject.id} AND event = 'register'
        AND ip_address IS NOT NULL AND ip_address <> 'unknown'
      ORDER BY created_at DESC LIMIT 1
    `;
    ipAddress = (ipRows[0]?.ip_address as string | undefined) ?? null;
    if (ipAddress) {
      const rows = await db`
        SELECT c.id, c.email, c.first_name, c.last_name, c.address_line1, c.address_postcode, c.created_at
        FROM customers c
        WHERE c.id <> ${subject.id}
          AND EXISTS (
            SELECT 1 FROM ip_activity_log l
            WHERE l.customer_id = c.id AND l.ip_address = ${ipAddress}
          )
        ORDER BY c.created_at DESC
        LIMIT 25
      `;
      sameConnection = (rows as CustomerRow[])
        .filter((row) => arrivedBefore(row, subject))
        .map(toMatch);
    }

    // A shared connection on its own only counts once enough accounts are on it, per the threshold
    // above. A shared ADDRESS counts straight away, because that is the pattern this was asked
    // about: same house, new email, second welcome code.
    const connectionCounts = sameConnection.length + 1 >= SHARED_CONNECTION_THRESHOLD;
    const reportConnection = connectionCounts ? sameConnection : [];
    if (sameAddress.length === 0 && reportConnection.length === 0) return null;

    // ALREADY ALLOWED MEANS ALREADY ALLOWED (task ce609555). Kieran, 18 September 2026: "so it
    // doesn't appear again on the dashboards for the customer chosen". The decision is kept in
    // opening_offer_reviews, which is his own welcome-offer check from 16 September, so the list,
    // the dashboard and the individual customer panel all read one record rather than each keeping
    // their own idea of who has been cleared.
    //
    // A THIRD ACCOUNT STILL SHOWS, and needs no counting to do it: an approval belongs to one
    // customer, and a third person at the same address is a different customer with no approval of
    // their own. Allowing a couple therefore never quietly allows the next arrival.
    const offerStatus = await offerStatusFor(subject.id);
    if (isAllowedAsAuthentic(offerStatus)) return null;

    return {
      customerId: subject.id,
      email: subject.email,
      name: displayName(subject),
      createdAt: subject.created_at,
      sameAddress,
      sameConnection: reportConnection,
      ipAddress,
      offerStatus,
      summary: summariseFinding(displayName(subject), subject.email, sameAddress, reportConnection),
    };
  } catch {
    // Deliberately silent. The caller is a customer signing up, and they must never see a failure
    // in an internal check.
    return null;
  }
}

/**
 * The same question asked about everybody, for the two Check buttons.
 *
 * TWO QUERIES, NOT FOUR HUNDRED. The first version of this called findDuplicateSignals() once per
 * customer, which is two or three round trips each: for two hundred customers that is the better
 * part of five hundred, and it was still running when the page gave up waiting. The whole shop is
 * pulled once and the grouping is done here instead. It also means the scan and the automatic
 * sign-up check share the same rules below rather than reimplementing them.
 */
export async function listDuplicateSignals(limit = 500): Promise<DuplicateFinding[]> {
  const db = requireDb();

  const customers = (await db`
    SELECT id, email, first_name, last_name, address_line1, address_postcode, created_at
    FROM customers
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as CustomerRow[];

  // Every connection each of those accounts has been seen on. 'unknown' is what getClientIp writes
  // when a request arrives with no address headers at all, and every one of those would otherwise
  // look like one enormous shared household.
  const ipRows = (await db`
    SELECT DISTINCT customer_id, ip_address
    FROM ip_activity_log
    WHERE customer_id IS NOT NULL
      AND ip_address IS NOT NULL
      AND ip_address <> 'unknown'
  `) as { customer_id: number; ip_address: string }[];

  // Every welcome-offer decision in one go (task ce609555). Approved accounts are left out of the
  // list altogether, which is what "allow as authentic" has to mean; the rest carry their status so
  // each row can say whether that person's 10% is currently paused. One query, so adding this did
  // not undo the work that got this scan down from five hundred queries to two.
  //
  // A missing table answers as no decisions at all, which errs towards showing findings rather than
  // hiding them. Hiding a real one is the worse mistake.
  const decisions = new Map<number, 'clear' | 'review' | 'approved'>();
  try {
    const rows = (await db`
      SELECT customer_id, status FROM opening_offer_reviews
    `) as { customer_id: number; status: string }[];
    for (const row of rows) {
      if (row.status === 'clear' || row.status === 'review' || row.status === 'approved') {
        decisions.set(row.customer_id, row.status);
      }
    }
  } catch {
    // No decisions recorded yet, or the table is not there. Show everything.
  }

  // Decisions in the new Security Review queue suppress only the exact known
  // pair on this legacy scan. A third account has a different pair and still appears.
  const exemptPairs = new Set<string>();
  try {
    const rows = await db`
      SELECT customer_id_low, customer_id_high FROM security_association_exemptions
      WHERE revoked_at IS NULL
    `;
    for (const row of rows) {
      exemptPairs.add(`${Number(row.customer_id_low)}:${Number(row.customer_id_high)}`);
    }
  } catch {
    // The dedicated review tables may not have been set up yet.
  }
  const pairIsExempt = (a: number, b: number) => exemptPairs.has(`${Math.min(a, b)}:${Math.max(a, b)}`);

  const byId = new Map<number, CustomerRow>(customers.map((c) => [c.id, c]));
  const ipsFor = new Map<number, string[]>();
  const accountsOnIp = new Map<string, number[]>();
  for (const row of ipRows) {
    if (!byId.has(row.customer_id)) continue;
    const list = ipsFor.get(row.customer_id) ?? [];
    list.push(row.ip_address);
    ipsFor.set(row.customer_id, list);
    const onIp = accountsOnIp.get(row.ip_address) ?? [];
    onIp.push(row.customer_id);
    accountsOnIp.set(row.ip_address, onIp);
  }

  const byDoor = new Map<string, CustomerRow[]>();
  for (const customer of customers) {
    const key = addressKey(customer.address_line1, customer.address_postcode);
    if (!key) continue;
    const list = byDoor.get(key) ?? [];
    list.push(customer);
    byDoor.set(key, list);
  }

  const findings: DuplicateFinding[] = [];
  for (const customer of customers) {
    const key = addressKey(customer.address_line1, customer.address_postcode);
    const sameAddress = (key ? byDoor.get(key) ?? [] : [])
      .filter((other) => other.id !== customer.id && arrivedBefore(other, customer) && !pairIsExempt(other.id, customer.id))
      .slice(0, 25)
      .map(toMatch);

    const seenIds = new Set<number>();
    const sameConnectionRows: CustomerRow[] = [];
    let total = 1;
    for (const ip of ipsFor.get(customer.id) ?? []) {
      for (const otherId of accountsOnIp.get(ip) ?? []) {
        if (otherId === customer.id || seenIds.has(otherId)) continue;
        if (pairIsExempt(otherId, customer.id)) continue;
        seenIds.add(otherId);
        total += 1;
        const other = byId.get(otherId);
        if (other && arrivedBefore(other, customer)) sameConnectionRows.push(other);
      }
    }
    // The threshold counts EVERYBODY on the connection, not only the earlier ones, so it means the
    // same thing here as it does on /admin/ip-addresses.
    const sameConnection = total >= SHARED_CONNECTION_THRESHOLD
      ? sameConnectionRows.slice(0, 25).map(toMatch)
      : [];

    if (sameAddress.length === 0 && sameConnection.length === 0) continue;

    // Allowed once, gone for good. A third account at the same address is a DIFFERENT customer with
    // no approval of its own, so it still appears: allowing a couple never silently allows whoever
    // turns up next.
    const offerStatus = decisions.get(customer.id) ?? null;
    if (isAllowedAsAuthentic(offerStatus)) continue;

    findings.push({
      customerId: customer.id,
      email: customer.email,
      name: displayName(customer),
      createdAt: customer.created_at,
      sameAddress,
      sameConnection,
      ipAddress: (ipsFor.get(customer.id) ?? [])[0] ?? null,
      offerStatus,
      summary: summariseFinding(displayName(customer), customer.email, sameAddress, sameConnection),
    });
  }

  // Newest first: an account opened this week matters more than one from March.
  return findings;
}

/**
 * How many of those are RECENT.
 *
 * This is the number the dashboard warning uses, and the reason it is not simply the total: the
 * shop's own back catalogue contains households, colleagues and test accounts that will match each
 * other for ever. A red banner that can never be cleared is one people learn to look past, and then
 * the day it means something they look past that too. Kieran asked for this to fire "when a new
 * sign is done by a new customers", so the banner follows new sign-ups and quietens by itself,
 * while the Check button still lists everything.
 */
export const RECENT_SIGNUP_DAYS = 30;

export function countRecent(findings: DuplicateFinding[], now = Date.now()): number {
  const cutoff = now - RECENT_SIGNUP_DAYS * 24 * 60 * 60 * 1000;
  return findings.filter((f) => {
    const at = new Date(f.createdAt).getTime();
    // An unreadable date counts as recent rather than being silently dropped: missing a real one
    // is worse than one extra look.
    return !Number.isFinite(at) || at >= cutoff;
  }).length;
}
