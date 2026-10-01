import { requireDb } from './client';
// Extracted verbatim from db.ts on 2026-08-11 (Phase 2 of "thin it out").
// Everything here is re-exported from '@/lib/db', so no call site changed.

// ─── Batches ─────────────────────────────────────────────────────────────────
// The admin-defined pool of batch identifying codes. Allocations of a code to a
// specific product live in the invoice line_items / order items JSONB, not here.

export interface BatchRow {
  id: number;
  code: string;
  product_name: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
}

export async function listBatches(includeInactive = false): Promise<BatchRow[]> {
  const db = requireDb();
  const rows = includeInactive
    ? await db`SELECT * FROM batches ORDER BY active DESC, created_at DESC`
    : await db`SELECT * FROM batches WHERE active = TRUE ORDER BY created_at DESC`;
  return rows as BatchRow[];
}

// Adds a batch code. Idempotent on the code: re-adding an existing code
// re-activates it and updates the product/note rather than erroring, so the
// admin can freely re-enter a code without hitting the UNIQUE constraint.
export async function addBatch(code: string, productName?: string | null, note?: string | null): Promise<BatchRow | null> {
  const clean = code.trim();
  if (!clean) return null;
  const db = requireDb();
  const rows = await db`
    INSERT INTO batches (code, product_name, note, active)
    VALUES (${clean}, ${productName?.trim() || null}, ${note?.trim() || null}, TRUE)
    ON CONFLICT (code) DO UPDATE
      SET product_name = EXCLUDED.product_name,
          note = EXCLUDED.note,
          active = TRUE
    RETURNING *
  `;
  return (rows[0] as BatchRow) ?? null;
}

export async function setBatchActive(id: number, active: boolean): Promise<void> {
  const db = requireDb();
  await db`UPDATE batches SET active = ${active} WHERE id = ${id}`;
}

// Edit an existing batch's code / product / note (admin "Edit" action). Changing
// the code can collide with the UNIQUE(code) constraint — the caller surfaces that
// as a friendly "code already exists" message.
export async function updateBatch(id: number, code: string, productName?: string | null, note?: string | null): Promise<BatchRow | null> {
  const clean = code.trim();
  if (!clean) return null;
  const db = requireDb();
  const rows = await db`
    UPDATE batches
    SET code = ${clean},
        product_name = ${productName?.trim() || null},
        note = ${note?.trim() || null}
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as BatchRow) ?? null;
}

// Distinct batch references already entered against verification codes — offered
// in the admin UI as quick suggestions so the batch pool stays in step with the
// verification system Kieran already maintains.
export async function listVerificationBatchRefs(): Promise<string[]> {
  const db = requireDb();
  const rows = await db`
    SELECT DISTINCT batch_ref FROM verification_codes
    WHERE batch_ref IS NOT NULL AND batch_ref <> '' ORDER BY batch_ref
  `;
  return (rows as { batch_ref: string }[]).map((r) => r.batch_ref);
}
