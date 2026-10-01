import { isDbConfigured, requireDb } from './client';

// Drafted PEARL emails, saved on the PEARL dashboard (task 9add1201).
//
// Kieran: "PEARL dashboard emails should have draft emails saved, which either
// I draft or I've asked you to draft, and there should be a Save button on
// there and a Send button on there where you can actually put the customer's
// email on there."
//
// Deliberately NOT hung off a customer record. Yvonne emailed sales@ directly
// and has no account, and he asked to type the address in by hand, so a draft
// that required a customer to exist would refuse the very case it was built for.
//
// A sent draft is kept and stamped, never deleted, so there is a record of what
// went to whom.

export interface PearlEmailDraft {
  id: number;
  customer_name: string;
  customer_email: string;
  pearl_title: string;
  pearl_answer: string;
  subject: string | null;
  /** This draft's own wrapper letter. NULL means use the standard one. */
  letter_override: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

// Created on first use, the same way trial_products does, so no migration step
// is owed on a database that has never seen this table.
let ensured = false;
async function ensureTable(): Promise<void> {
  if (ensured) return;
  const db = requireDb();
  await db`CREATE TABLE IF NOT EXISTS pearl_email_drafts (
    id serial PRIMARY KEY,
    customer_name text NOT NULL DEFAULT '',
    customer_email text NOT NULL DEFAULT '',
    pearl_title text NOT NULL DEFAULT '',
    pearl_answer text NOT NULL DEFAULT '',
    subject text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz
  )`;
  // Added after the table existed (task 9add1201, Kieran: "allow an override on
  // every draft"), so it is added separately rather than only in CREATE.
  await db`ALTER TABLE pearl_email_drafts ADD COLUMN IF NOT EXISTS letter_override text`;
  ensured = true;
}

export async function listPearlEmailDrafts(): Promise<PearlEmailDraft[]> {
  if (!isDbConfigured()) return [];
  await ensureTable();
  const db = requireDb();
  // Unsent first, because those are the ones waiting to be done.
  const rows = await db`
    SELECT * FROM pearl_email_drafts
    ORDER BY (sent_at IS NOT NULL), updated_at DESC
    LIMIT 200
  `;
  return rows as PearlEmailDraft[];
}

export async function findPearlEmailDraft(id: number): Promise<PearlEmailDraft | null> {
  if (!isDbConfigured()) return null;
  await ensureTable();
  const db = requireDb();
  const rows = await db`SELECT * FROM pearl_email_drafts WHERE id = ${id} LIMIT 1`;
  return (rows[0] as PearlEmailDraft) ?? null;
}

export async function savePearlEmailDraft(params: {
  id?: number | null;
  customerName: string;
  customerEmail: string;
  pearlTitle: string;
  pearlAnswer: string;
  subject?: string | null;
  /** null or empty = fall back to the standard letter. */
  letterOverride?: string | null;
}): Promise<PearlEmailDraft | null> {
  await ensureTable();
  const db = requireDb();

  if (params.id) {
    const rows = await db`
      UPDATE pearl_email_drafts SET
        customer_name = ${params.customerName},
        customer_email = ${params.customerEmail},
        pearl_title = ${params.pearlTitle},
        pearl_answer = ${params.pearlAnswer},
        subject = ${params.subject ?? null},
        letter_override = ${params.letterOverride?.trim() ? params.letterOverride : null},
        updated_at = now()
      WHERE id = ${params.id}
      RETURNING *
    `;
    return (rows[0] as PearlEmailDraft) ?? null;
  }

  const rows = await db`
    INSERT INTO pearl_email_drafts (customer_name, customer_email, pearl_title, pearl_answer, subject, letter_override)
    VALUES (${params.customerName}, ${params.customerEmail}, ${params.pearlTitle}, ${params.pearlAnswer}, ${params.subject ?? null}, ${params.letterOverride?.trim() ? params.letterOverride : null})
    RETURNING *
  `;
  return (rows[0] as PearlEmailDraft) ?? null;
}

export async function markPearlEmailDraftSent(id: number): Promise<PearlEmailDraft | null> {
  await ensureTable();
  const db = requireDb();
  const rows = await db`
    UPDATE pearl_email_drafts SET sent_at = now(), updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as PearlEmailDraft) ?? null;
}

export async function deletePearlEmailDraft(id: number): Promise<boolean> {
  await ensureTable();
  const db = requireDb();
  const rows = await db`DELETE FROM pearl_email_drafts WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
