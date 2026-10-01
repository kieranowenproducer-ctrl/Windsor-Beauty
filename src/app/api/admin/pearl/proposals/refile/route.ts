import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { pearlActor, recordPearlChange, withPearlSchema } from '@/lib/db/pearlAdmin';

export const dynamic = 'force-dynamic';

/**
 * File a rejected proposal again (Pearl repairs Stage C, 18 Aug 2026).
 *
 * A rejection is final for that proposal — there is deliberately no
 * un-reject. But before this route existed a change of mind meant rebuilding
 * the suggestion by hand from the Test & Improve screen. This copies the
 * rejected proposal into a brand-new one (new id, waiting for approval,
 * same payload), so the record of the rejection stays untouched and the
 * fresh copy goes through the exact same approval gate as everything else.
 */

type ProposalRow = {
  id: number;
  kind: string;
  title: string;
  summary: string | null;
  status: string;
  before_view: unknown;
  after_view: unknown;
  payload: unknown;
  source_question_id: number | null;
};

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  let body: { id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Pass the id of the rejected proposal.' }, { status: 400 });

  const db = requireDb();
  try {
    const actor = await pearlActor();
    const rows = await withPearlSchema(() => db`SELECT * FROM pearl_proposals WHERE id = ${id}`) as ProposalRow[];
    const original = rows[0];
    if (!original) return NextResponse.json({ error: 'No proposal has that id.' }, { status: 404 });
    if (original.status !== 'rejected') return NextResponse.json({ error: 'Only a rejected proposal can be filed again.' }, { status: 409 });

    const inserted = await withPearlSchema(() => db`
      INSERT INTO pearl_proposals (kind, title, summary, before_view, after_view, payload, created_by, source_question_id)
      VALUES (${original.kind}, ${original.title}, ${original.summary},
              ${JSON.stringify(original.before_view ?? {})}::jsonb, ${JSON.stringify(original.after_view ?? {})}::jsonb,
              ${JSON.stringify(original.payload ?? {})}::jsonb, ${actor}, ${original.source_question_id})
      RETURNING *
    `) as ProposalRow[];
    const proposal = inserted[0];
    await recordPearlChange({
      changeType: 'proposal_created',
      entityType: 'proposal',
      entityId: proposal.id,
      summary: `Filed “${original.title}” again after its rejection (was proposal ${original.id}). Nothing changes until it is approved.`,
      actor,
      detail: { kind: original.kind, refiledFrom: original.id },
    });
    return NextResponse.json({ proposal });
  } catch (error) {
    console.error('[admin/pearl/proposals/refile] POST failed:', error);
    return NextResponse.json({ error: 'Could not file this proposal again.' }, { status: 500 });
  }
}
