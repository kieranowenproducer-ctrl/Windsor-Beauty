import { requireDb } from './client';
// Extracted verbatim from db.ts on 2026-08-11 (Phase 2 of "thin it out").
// Everything here is re-exported from '@/lib/db', so no call site changed.

// ─── Verification codes ──────────────────────────────────────────────────────

export interface VerificationCodeRow {
  id: number;
  code: string;
  product_name: string | null;
  batch_ref: string | null;
  purity: string | null;
  status: 'unused' | 'used';
  used_at: string | null;
  used_by_email: string | null;
  used_by_order_number: string | null;
  ip_address: string | null;
  user_agent: string | null;
  marketing_consent: boolean;
  created_at: string;
}

export async function findVerificationCode(code: string): Promise<VerificationCodeRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM verification_codes WHERE upper(code) = upper(${code}) LIMIT 1
  `;
  return (rows[0] as VerificationCodeRow) ?? null;
}

export async function searchVerificationCode(query: string): Promise<VerificationCodeRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM verification_codes
    WHERE upper(code) LIKE upper(${'%' + query + '%'})
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return rows as VerificationCodeRow[];
}

export async function markVerificationCodeUsed(params: {
  code: string;
  email: string | null;
  orderNumber: string | null;
  ip: string | null;
  userAgent: string | null;
  marketingConsent: boolean;
}): Promise<boolean> {
  const db = requireDb();
  // Atomic claim: only succeeds if the code is still unused — prevents race conditions
  const rows = await db`
    UPDATE verification_codes
    SET status = 'used',
        used_at = now(),
        used_by_email = ${params.email},
        used_by_order_number = ${params.orderNumber},
        ip_address = ${params.ip},
        user_agent = ${params.userAgent},
        marketing_consent = ${params.marketingConsent}
    WHERE upper(code) = upper(${params.code}) AND status = 'unused'
    RETURNING id
  `;
  return rows.length > 0;
}

const IMPORT_BATCH_SIZE = 500;

export async function importVerificationCodes(
  codes: { code: string; productName?: string; batchRef?: string; purity?: string }[]
): Promise<{ inserted: number; skipped: number }> {
  const db = requireDb();

  const cleaned = codes
    .map((entry) => ({
      code: entry.code.trim(),
      productName: entry.productName ?? null,
      batchRef: entry.batchRef ?? null,
      purity: entry.purity ?? null,
    }))
    .filter((entry) => entry.code.length > 0);

  let inserted = 0;

  // Bulk insert via unnest — one round trip per batch instead of one per code,
  // so imports of thousands of codes stay well within the serverless function timeout.
  for (let i = 0; i < cleaned.length; i += IMPORT_BATCH_SIZE) {
    const batch = cleaned.slice(i, i + IMPORT_BATCH_SIZE);
    const rows = await db`
      INSERT INTO verification_codes (code, product_name, batch_ref, purity)
      SELECT * FROM unnest(
        ${batch.map((b) => b.code)}::text[],
        ${batch.map((b) => b.productName)}::text[],
        ${batch.map((b) => b.batchRef)}::text[],
        ${batch.map((b) => b.purity)}::text[]
      )
      ON CONFLICT (code) DO NOTHING
      RETURNING id
    `;
    inserted += rows.length;
  }

  return { inserted, skipped: cleaned.length - inserted };
}

export async function listVerificationCodes(limit = 200): Promise<VerificationCodeRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM verification_codes ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows as VerificationCodeRow[];
}

export async function countVerificationCodes(): Promise<{ total: number; unused: number; used: number }> {
  const db = requireDb();
  const rows = await db`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'unused')::int AS unused,
      count(*) FILTER (WHERE status = 'used')::int AS used
    FROM verification_codes
  `;
  const row = rows[0] as { total: number; unused: number; used: number } | undefined;
  return { total: row?.total ?? 0, unused: row?.unused ?? 0, used: row?.used ?? 0 };
}
