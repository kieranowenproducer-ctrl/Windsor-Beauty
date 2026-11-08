import { requireDb } from './client';
import { activityFor, connectionsBetween, sharedConnectionsAmong, type AccountActivity } from './accountActivity';
import type { SharedConnectionNote } from './duplicateAccounts';
import { isApplePrivateRelay } from '@/lib/applePrivateRelay';
import { sendAutomationAlertEmail } from '@/lib/automationAlertEmail';

export type SecurityReviewStatus = 'pending' | 'legitimate_shared_network' | 'confirmed_duplicate' | 'dismissed';
export type SecurityEvidenceBand = 'information' | 'review' | 'priority';
export type SecuritySourceEvent = 'registration' | 'profile_update' | 'order' | 'historical_alert';
export type SecurityCaseType = 'account_similarity' | 'discount_abuse' | 'referral_similarity';

export interface SecurityEvidence {
  matchedCustomerId: number;
  kinds: Array<'email' | 'phone' | 'name' | 'address' | 'ip'>;
  identityKinds: Array<'email' | 'phone' | 'name' | 'address'>;
  ipOnly: boolean;
  observedAt: string | null;
}

export interface SecurityReviewCase {
  id: number;
  case_type: string;
  subject_customer_id: number | null;
  source_event: SecuritySourceEvent;
  order_number: string | null;
  discount_code: string | null;
  status: SecurityReviewStatus;
  evidence_band: SecurityEvidenceBand;
  summary: string;
  matched_customer_ids: number[];
  evidence: SecurityEvidence[];
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  occurrence_count: number;
  resolved_at: string | null;
  reviewed_by: string | null;
  decision_note: string | null;
  subject_email?: string | null;
  subject_name?: string | null;
  /** Name and email for each matched customer number, so the screen never shows a bare number. */
  matched_accounts?: Array<{ id: number; name: string | null; email: string }>;
  /** Last login and last activity for the subject and every matched account, keyed by id. */
  activity?: Record<number, AccountActivity>;
  /** Per matched account: the connections it shares with the subject, Apple flag and last times. */
  shared_connections?: Record<number, SharedConnectionNote[]>;
}

interface CustomerIdentityRow {
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
}

export async function ensureSecurityReviewTables(): Promise<void> {
  const db = requireDb();
  await db`
    CREATE TABLE IF NOT EXISTS security_review_cases (
      id BIGSERIAL PRIMARY KEY,
      dedupe_key TEXT UNIQUE NOT NULL,
      case_type TEXT NOT NULL DEFAULT 'possible_duplicate_account',
      subject_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      source_event TEXT NOT NULL,
      order_number TEXT,
      discount_code TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'legitimate_shared_network', 'confirmed_duplicate', 'dismissed')),
      evidence_band TEXT NOT NULL
        CHECK (evidence_band IN ('information', 'review', 'priority')),
      summary TEXT NOT NULL,
      matched_customer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      resolved_at TIMESTAMPTZ,
      reviewed_by TEXT,
      decision_note TEXT
    )
  `;
  await db`ALTER TABLE security_review_cases ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
  await db`ALTER TABLE security_review_cases ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 1`;
  await db`CREATE INDEX IF NOT EXISTS security_review_cases_status_idx ON security_review_cases(status, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS security_review_cases_customer_idx ON security_review_cases(subject_customer_id, created_at DESC)`;
  await db`
    CREATE TABLE IF NOT EXISTS security_review_decisions (
      id BIGSERIAL PRIMARY KEY,
      case_id BIGINT NOT NULL REFERENCES security_review_cases(id) ON DELETE CASCADE,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      actor TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS security_review_decisions_case_idx ON security_review_decisions(case_id, created_at DESC)`;
  await db`
    CREATE TABLE IF NOT EXISTS security_association_exemptions (
      id BIGSERIAL PRIMARY KEY,
      customer_id_low INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      customer_id_high INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      association_kind TEXT NOT NULL DEFAULT 'legitimate_shared_network',
      note TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ,
      CHECK (customer_id_low < customer_id_high)
    )
  `;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS security_association_active_idx ON security_association_exemptions(customer_id_low, customer_id_high, association_kind) WHERE revoked_at IS NULL`;
}

function plain(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function normaliseSecurityName(first: string | null | undefined, last: string | null | undefined): string {
  return plain(`${first ?? ''} ${last ?? ''}`);
}

export function normaliseSecurityEmail(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').trim().toLowerCase();
}

export function normaliseSecurityPhone(value: string | null | undefined): string {
  let digits = (value ?? '').replace(/\D/g, '');
  if (digits.startsWith('0044')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('440') && digits.length >= 12) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('44') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

export function normaliseSecurityAddress(row: Pick<CustomerIdentityRow, 'address_line1' | 'address_line2' | 'address_city' | 'address_postcode' | 'address_country'>): string {
  const line1 = plain(row.address_line1);
  const postcode = plain(row.address_postcode).replace(/\s/g, '');
  if (!line1 || !postcode) return '';
  return [line1, plain(row.address_line2), plain(row.address_city), postcode, plain(row.address_country || 'GB')].join('|');
}

function displayName(row: CustomerIdentityRow): string {
  return `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || row.email;
}

function caseSummary(evidence: SecurityEvidence[], applePrivateRelay = false): { band: SecurityEvidenceBand; summary: string } {
  const identity = new Set(evidence.flatMap(item => item.identityKinds));
  if (identity.size >= 2) {
    return { band: 'priority', summary: `Multiple matching identity details (${Array.from(identity).join(', ')}) need a person to review them.` };
  }
  if (identity.size === 1) {
    return { band: 'review', summary: `A matching ${Array.from(identity)[0]} needs a person to review it.` };
  }
  return {
    band: 'information',
    summary: applePrivateRelay
      ? 'Same Apple iPhone Private Relay address only, which thousands of strangers share. No name, email, phone or address matches.'
      : 'Same internet connection only. No name, email, phone or address matches.',
  };
}

async function activeExemptionsFor(customerId: number): Promise<Set<number>> {
  const db = requireDb();
  const rows = await db`
    SELECT customer_id_low, customer_id_high FROM security_association_exemptions
    WHERE revoked_at IS NULL AND (customer_id_low = ${customerId} OR customer_id_high = ${customerId})
  `;
  return new Set(rows.map(row => Number(row.customer_id_low) === customerId ? Number(row.customer_id_high) : Number(row.customer_id_low)));
}

export async function createSecurityReviewCase(params: {
  customerId: number;
  sourceEvent: SecuritySourceEvent;
  ipAddress?: string | null;
  orderNumber?: string | null;
  discountCode?: string | null;
  caseType?: SecurityCaseType;
  notify?: boolean;
}): Promise<{ row: SecurityReviewCase | null; newlyCreated: boolean }> {
  try {
    await ensureSecurityReviewTables();
    const db = requireDb();
    const customers = await db`
      SELECT id, email, first_name, last_name, phone, address_line1, address_line2,
             address_city, address_postcode, address_country, created_at
      FROM customers ORDER BY id
    ` as unknown as CustomerIdentityRow[];
    const subject = customers.find(row => Number(row.id) === params.customerId);
    if (!subject) return { row: null, newlyCreated: false };

    const subjectName = normaliseSecurityName(subject.first_name, subject.last_name);
    const subjectEmail = normaliseSecurityEmail(subject.email);
    const subjectPhone = normaliseSecurityPhone(subject.phone);
    const subjectAddress = normaliseSecurityAddress(subject);
    const ip = params.ipAddress?.trim() && params.ipAddress !== 'unknown' ? params.ipAddress.trim() : '';
    const exemptions = await activeExemptionsFor(params.customerId);

    const ipMatches = new Map<number, string>();
    if (ip) {
      const rows = await db`
        SELECT customer_id, max(created_at)::text AS observed_at
        FROM ip_activity_log
        WHERE customer_id IS NOT NULL AND customer_id <> ${params.customerId} AND ip_address = ${ip}
        GROUP BY customer_id
      `;
      for (const row of rows) ipMatches.set(Number(row.customer_id), String(row.observed_at));
    }

    const evidence: SecurityEvidence[] = [];
    for (const other of customers) {
      if (Number(other.id) === params.customerId) continue;
      const identityKinds: SecurityEvidence['identityKinds'] = [];
      if (subjectEmail && subjectEmail === normaliseSecurityEmail(other.email)) identityKinds.push('email');
      if (subjectPhone && subjectPhone === normaliseSecurityPhone(other.phone)) identityKinds.push('phone');
      if (subjectName && subjectName === normaliseSecurityName(other.first_name, other.last_name)) identityKinds.push('name');
      if (subjectAddress && subjectAddress === normaliseSecurityAddress(other)) identityKinds.push('address');
      // A legitimate shared-network decision suppresses that pair's IP signal,
      // never a later phone, email, name or address match.
      const hasIp = !exemptions.has(Number(other.id)) && ipMatches.has(Number(other.id));
      if (!identityKinds.length && !hasIp) continue;
      const kinds: SecurityEvidence['kinds'] = [...identityKinds];
      if (hasIp) kinds.push('ip');
      evidence.push({
        matchedCustomerId: Number(other.id), kinds, identityKinds, ipOnly: hasIp && identityKinds.length === 0,
        observedAt: hasIp ? ipMatches.get(Number(other.id)) ?? null : other.created_at,
      });
    }
    if (!evidence.length) return { row: null, newlyCreated: false };

    const { band, summary } = caseSummary(evidence, isApplePrivateRelay(ip));
    const matchedIds = evidence.map(item => item.matchedCustomerId).sort((a, b) => a - b);
    const evidenceSignature = evidence.map(item => `${item.matchedCustomerId}:${item.kinds.slice().sort().join('+')}`).sort().join(',');
    const caseType = params.caseType ?? (params.discountCode ? 'discount_abuse' : 'account_similarity');
    const dedupeKey = `${caseType}:${params.customerId}:${evidenceSignature}`;
    const rows = await db`
      INSERT INTO security_review_cases
        (dedupe_key, case_type, subject_customer_id, source_event, order_number, discount_code,
         evidence_band, summary, matched_customer_ids, evidence)
      VALUES (${dedupeKey}, ${caseType}, ${params.customerId}, ${params.sourceEvent}, ${params.orderNumber ?? null},
        ${params.discountCode ?? null}, ${band}, ${summary}, ${JSON.stringify(matchedIds)}::jsonb,
        ${JSON.stringify(evidence)}::jsonb)
      ON CONFLICT (dedupe_key) DO UPDATE SET
        source_event = EXCLUDED.source_event,
        order_number = COALESCE(EXCLUDED.order_number, security_review_cases.order_number),
        discount_code = COALESCE(EXCLUDED.discount_code, security_review_cases.discount_code),
        evidence_band = EXCLUDED.evidence_band,
        summary = EXCLUDED.summary,
        matched_customer_ids = EXCLUDED.matched_customer_ids,
        evidence = EXCLUDED.evidence,
        updated_at = now(), last_seen_at = now(),
        occurrence_count = security_review_cases.occurrence_count + 1
      RETURNING *
    ` as unknown as SecurityReviewCase[];
    const row = rows[0];
    const newlyCreated = Number(row?.occurrence_count ?? 0) === 1;

    if (params.notify !== false && newlyCreated && row && band !== 'information') {
      await sendAutomationAlertEmail({
        category: 'security_account_review',
        message: summary,
        subject: subject.email,
        detail: [
          `Security review case ${row.id}`,
          `Customer ${subject.id}: ${displayName(subject)} (${subject.email})`,
          params.orderNumber ? `Order ${params.orderNumber}` : null,
          params.discountCode ? `Discount code ${params.discountCode}` : null,
          `Matched customer records: ${matchedIds.join(', ')}`,
          'This is evidence for a person to review. Nobody was blocked or refused.',
        ].filter(Boolean).join('\n'),
        whatToDo: 'Open Security Review in the admin panel and record a decision. Do not treat an IP address as proof of identity.',
      }).catch(() => {});
    }
    return { row: row ?? null, newlyCreated };
  } catch {
    // Detection and notification are advisory. They must never break the customer action.
    return { row: null, newlyCreated: false };
  }
}

export async function listSecurityReviewCases(limit = 250): Promise<SecurityReviewCase[]> {
  await ensureSecurityReviewTables();
  const db = requireDb();
  const cases = await db`
    SELECT c.*, customer.email AS subject_email,
      trim(concat_ws(' ', customer.first_name, customer.last_name)) AS subject_name
    FROM security_review_cases c
    LEFT JOIN customers customer ON customer.id = c.subject_customer_id
    ORDER BY CASE WHEN c.status = 'pending' THEN 0 ELSE 1 END, c.created_at DESC
    LIMIT ${limit}
  ` as unknown as SecurityReviewCase[];
  return await describeSecurityReviewCases(cases);
}

/**
 * Adds what the screen needs to explain each case: names for matched customer numbers, when every
 * account last logged in, and the shared connections with the Apple flag. Read only, so it can be
 * run on its own (it is what the screenshots of this page were checked with).
 */
export async function describeSecurityReviewCases(cases: SecurityReviewCase[]): Promise<SecurityReviewCase[]> {
  const db = requireDb();
  // Names for every matched customer number in one query, so each case can say "Naomi Wye" rather
  // than "Customer 92". A number that no longer resolves is an account deleted since, and the
  // screen says so rather than inventing a name.
  const ids = Array.from(new Set(cases.flatMap(row => (row.matched_customer_ids ?? []).map(Number))));
  if (ids.length > 0) {
    const people = await db`
      SELECT id, email, trim(concat_ws(' ', first_name, last_name)) AS name
      FROM customers WHERE id = ANY(${ids})
    ` as unknown as Array<{ id: number; email: string; name: string }>;
    const byId = new Map(people.map(p => [Number(p.id), { id: Number(p.id), email: p.email, name: p.name || null }]));
    for (const row of cases) {
      row.matched_accounts = (row.matched_customer_ids ?? [])
        .map(id => byId.get(Number(id)))
        .filter((p): p is { id: number; email: string; name: string | null } => Boolean(p));
    }
  }

  // When each account last logged in, and for every internet-connection match, which connection it
  // was, whether it is one of Apple's iPhone Private Relay addresses, and when each of the two was
  // last on it (Samuel, 30 September 2026). Two queries for the whole list. If they fail the cases
  // still show, just without the times.
  try {
    const everyone = cases.flatMap(row => [Number(row.subject_customer_id), ...(row.matched_customer_ids ?? []).map(Number)])
      .filter(id => Number.isInteger(id) && id > 0);
    const [activity, shared] = await Promise.all([activityFor(everyone), sharedConnectionsAmong(everyone)]);
    for (const row of cases) {
      const subjectId = Number(row.subject_customer_id);
      const record: Record<number, AccountActivity> = {};
      for (const id of [subjectId, ...(row.matched_customer_ids ?? []).map(Number)]) {
        const found = activity.get(id);
        if (found) record[id] = found;
      }
      row.activity = record;
      if (!subjectId) continue;
      const connections: Record<number, SharedConnectionNote[]> = {};
      for (const item of row.evidence ?? []) {
        if (!item.kinds.includes('ip')) continue;
        connections[item.matchedCustomerId] = connectionsBetween(shared, subjectId, item.matchedCustomerId).map(c => ({
          ip: c.ip,
          applePrivateRelay: c.applePrivateRelay,
          subjectLastSeen: c.visits[subjectId]?.lastSeen ?? null,
          otherLastSeen: c.visits[item.matchedCustomerId]?.lastSeen ?? null,
        }));
      }
      row.shared_connections = connections;
    }
  } catch {
    // Times and connection detail left off; the cases themselves still show.
  }
  return cases;
}

/** A review and its exemption side effects are one transaction. Serialising decisions
 * prevents two simultaneous reversals from leaving a stale shared-network exemption. */
export async function decideSecurityReviewCase(params: {
  caseId: number; status: SecurityReviewStatus; note: string; actor?: string;
  expectedStatus?: SecurityReviewStatus; expectedUpdatedAt?: string;
}): Promise<SecurityReviewCase | null> {
  await ensureSecurityReviewTables();
  const db = requireDb();
  const actor = params.actor?.trim() || 'Windsor Beauty admin';
  const result = await db.transaction([
    db`SET LOCAL lock_timeout = '5s'`,
    db`LOCK TABLE security_review_cases IN SHARE ROW EXCLUSIVE MODE`,
    db`WITH previous AS MATERIALIZED (
      SELECT * FROM security_review_cases WHERE id=${params.caseId}
        AND (${params.expectedStatus ?? null}::text IS NULL OR status=${params.expectedStatus ?? null})
        AND (${params.expectedUpdatedAt ?? null}::timestamptz IS NULL OR date_trunc('milliseconds',updated_at)=${params.expectedUpdatedAt ?? null}::timestamptz)
      FOR UPDATE
    ), changed AS (
      UPDATE security_review_cases c SET status=${params.status}, decision_note=${params.note}, reviewed_by=${actor},
        resolved_at=CASE WHEN ${params.status}='pending' THEN NULL ELSE now() END, updated_at=greatest(date_trunc('milliseconds',clock_timestamp()),date_trunc('milliseconds',c.updated_at)+interval '1 millisecond')
      FROM previous p WHERE c.id=p.id RETURNING c.*
    ), recorded AS (
      INSERT INTO security_review_decisions(case_id,previous_status,new_status,actor,note)
      SELECT c.id,p.status,c.status,${actor},${params.note} FROM changed c JOIN previous p USING(id)
    ), pairs AS (
      SELECT DISTINCT least(p.subject_customer_id,matched.value::int) lo,greatest(p.subject_customer_id,matched.value::int) hi
      FROM previous p JOIN changed c USING(id),jsonb_array_elements_text(p.matched_customer_ids) matched
      WHERE p.subject_customer_id IS NOT NULL AND matched.value::int<>p.subject_customer_id
        AND EXISTS(SELECT 1 FROM customers WHERE id=matched.value::int)
    ), added AS (
      INSERT INTO security_association_exemptions(customer_id_low,customer_id_high,association_kind,note,created_by)
      SELECT lo,hi,'legitimate_shared_network',${params.note},${actor} FROM pairs
      WHERE ${params.status}='legitimate_shared_network' ON CONFLICT DO NOTHING
    ), revoked AS (
      UPDATE security_association_exemptions e SET revoked_at=now() FROM pairs pair
      WHERE e.customer_id_low=pair.lo AND e.customer_id_high=pair.hi
        AND e.association_kind='legitimate_shared_network' AND e.revoked_at IS NULL
        AND ${params.status}<>'legitimate_shared_network'
        AND EXISTS(SELECT 1 FROM previous WHERE status='legitimate_shared_network')
        AND NOT EXISTS (
          SELECT 1 FROM security_review_cases other,jsonb_array_elements_text(other.matched_customer_ids) match
          WHERE other.id<>${params.caseId} AND other.status='legitimate_shared_network'
            AND least(other.subject_customer_id,match.value::int)=pair.lo
            AND greatest(other.subject_customer_id,match.value::int)=pair.hi
        )
    ) SELECT * FROM changed`,
  ]);
  return result[2][0] as SecurityReviewCase | undefined ?? null;
}

export async function countPendingSecurityReviews(): Promise<number> {
  await ensureSecurityReviewTables();
  const rows = await requireDb()`SELECT count(*)::int AS count FROM security_review_cases WHERE status = 'pending'`;
  return Number(rows[0]?.count ?? 0);
}

// IGNORE (Samuel, 10 October 2026): "there should be an ignore button for this, especially when
// you have issues of people using Apple's system". Pressing Ignore on one pair in the second-
// accounts list records that pair as not worth raising again. It is a separate kind of exemption
// from "legitimate / shared network", so undoing a Security Review case never quietly un-ignores
// a pair, and stopping ignoring a pair never touches a Security Review decision.
//
// What it covers is exactly one pair. Ignoring Carolyne against Yvonne says nothing about Carolyne
// against anybody else, so a genuine second account turning up later is still raised.
export const IGNORED_PAIR_KIND = 'ignored_second_account';

export interface IgnoredPair {
  firstId: number;
  firstLabel: string;
  secondId: number;
  secondLabel: string;
  ignoredAt: string;
  ignoredBy: string;
}

function pairIds(a: number, b: number): [number, number] | null {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a <= 0 || b <= 0 || a > 2147483647 || b > 2147483647 || a === b) return null;
  return [Math.min(a, b), Math.max(a, b)];
}

/** Stop raising these two accounts against each other. Pressing it twice changes nothing. */
export async function ignoreAccountPair(a: number, b: number, actor?: string): Promise<boolean> {
  const ids = pairIds(a, b);
  if (!ids) return false;
  await ensureSecurityReviewTables();
  const rows=await requireDb()`WITH pair AS (
    SELECT ${ids[0]}::int lo,${ids[1]}::int hi
    WHERE EXISTS(SELECT 1 FROM customers WHERE id=${ids[0]}) AND EXISTS(SELECT 1 FROM customers WHERE id=${ids[1]})
  ), saved AS (
    INSERT INTO security_association_exemptions(customer_id_low,customer_id_high,association_kind,note,created_by)
    SELECT lo,hi,${IGNORED_PAIR_KIND},'Ignored from the second-accounts list',${actor?.trim() || 'Windsor Beauty admin'} FROM pair
    ON CONFLICT DO NOTHING
  ) SELECT lo FROM pair`;
  return rows.length===1;
}

/** Undo an Ignore. Revoked, never deleted, so the history is kept. */
export async function stopIgnoringAccountPair(a: number, b: number): Promise<boolean> {
  const ids = pairIds(a, b);
  if (!ids) return false;
  await ensureSecurityReviewTables();
  await requireDb()`
    UPDATE security_association_exemptions SET revoked_at = now()
    WHERE customer_id_low = ${ids[0]} AND customer_id_high = ${ids[1]}
      AND association_kind = ${IGNORED_PAIR_KIND} AND revoked_at IS NULL
  `;
  return true;
}

/** Every pair currently ignored, newest first, with names so the list can be read without ids. */
export async function listIgnoredAccountPairs(): Promise<IgnoredPair[]> {
  // No table set-up here: this runs on every check, and a missing table is caught by the caller.
  const rows = await requireDb()`
    SELECT e.customer_id_low, e.customer_id_high, e.created_at::text AS created_at, e.created_by,
           lo.email AS low_email, lo.first_name AS low_first, lo.last_name AS low_last,
           hi.email AS high_email, hi.first_name AS high_first, hi.last_name AS high_last
    FROM security_association_exemptions e
    JOIN customers lo ON lo.id = e.customer_id_low
    JOIN customers hi ON hi.id = e.customer_id_high
    WHERE e.association_kind = ${IGNORED_PAIR_KIND} AND e.revoked_at IS NULL
    ORDER BY e.created_at DESC
  `;
  const label = (first: unknown, last: unknown, email: unknown) =>
    [first, last].map(v => String(v ?? '').trim()).filter(Boolean).join(' ') || String(email ?? '');
  return rows.map(row => ({
    firstId: Number(row.customer_id_low),
    firstLabel: label(row.low_first, row.low_last, row.low_email),
    secondId: Number(row.customer_id_high),
    secondLabel: label(row.high_first, row.high_last, row.high_email),
    ignoredAt: String(row.created_at),
    ignoredBy: String(row.created_by ?? ''),
  }));
}
