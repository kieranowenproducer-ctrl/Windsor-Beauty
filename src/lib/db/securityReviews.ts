import { requireDb } from './client';
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

function caseSummary(evidence: SecurityEvidence[]): { band: SecurityEvidenceBand; summary: string } {
  const identity = new Set(evidence.flatMap(item => item.identityKinds));
  if (identity.size >= 2) {
    return { band: 'priority', summary: `Multiple matching identity details (${Array.from(identity).join(', ')}) need a person to review them.` };
  }
  if (identity.size === 1) {
    return { band: 'review', summary: `A matching ${Array.from(identity)[0]} needs a person to review it.` };
  }
  return { band: 'information', summary: 'Shared IP only — no matching identity information.' };
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

    const { band, summary } = caseSummary(evidence);
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
  return await db`
    SELECT c.*, customer.email AS subject_email,
      trim(concat_ws(' ', customer.first_name, customer.last_name)) AS subject_name
    FROM security_review_cases c
    LEFT JOIN customers customer ON customer.id = c.subject_customer_id
    ORDER BY CASE WHEN c.status = 'pending' THEN 0 ELSE 1 END, c.created_at DESC
    LIMIT ${limit}
  ` as unknown as SecurityReviewCase[];
}

export async function decideSecurityReviewCase(params: {
  caseId: number;
  status: SecurityReviewStatus;
  note: string;
  actor?: string;
}): Promise<SecurityReviewCase | null> {
  await ensureSecurityReviewTables();
  const db = requireDb();
  const current = (await db`SELECT * FROM security_review_cases WHERE id = ${params.caseId} LIMIT 1`)[0] as SecurityReviewCase | undefined;
  if (!current) return null;
  const actor = params.actor?.trim() || 'Windsor Beauty admin';
  const resolvedAt = params.status === 'pending' ? null : new Date().toISOString();
  const rows = await db`
    UPDATE security_review_cases SET status = ${params.status}, decision_note = ${params.note},
      reviewed_by = ${actor}, resolved_at = ${resolvedAt}, updated_at = now()
    WHERE id = ${params.caseId} RETURNING *
  ` as unknown as SecurityReviewCase[];
  await db`
    INSERT INTO security_review_decisions (case_id, previous_status, new_status, actor, note)
    VALUES (${params.caseId}, ${current.status}, ${params.status}, ${actor}, ${params.note})
  `;
  if (params.status === 'legitimate_shared_network' && current.subject_customer_id) {
    for (const matchedId of current.matched_customer_ids ?? []) {
      const low = Math.min(current.subject_customer_id, matchedId);
      const high = Math.max(current.subject_customer_id, matchedId);
      if (low === high) continue;
      await db`
        INSERT INTO security_association_exemptions
          (customer_id_low, customer_id_high, association_kind, note, created_by)
        VALUES (${low}, ${high}, 'legitimate_shared_network', ${params.note}, ${actor})
        ON CONFLICT DO NOTHING
      `;
    }
  }
  return rows[0] ?? null;
}

export async function countPendingSecurityReviews(): Promise<number> {
  await ensureSecurityReviewTables();
  const rows = await requireDb()`SELECT count(*)::int AS count FROM security_review_cases WHERE status = 'pending'`;
  return Number(rows[0]?.count ?? 0);
}
