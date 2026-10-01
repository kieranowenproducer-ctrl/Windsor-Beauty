import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { pearlActor, recordPearlChange, withPearlSchema } from '@/lib/db/pearlAdmin';

export const dynamic = 'force-dynamic';

/**
 * Clear a decided proposal off the approval screen.
 *
 * Approved and rejected proposals used to stay on the screen for good, so the
 * one thing actually waiting for a person sat under a growing pile of finished
 * work. Clearing moves a proposal to 'archived', a status this table has always
 * allowed. Nothing is deleted: the decision, who made it and when are already
 * in the change history permanently, and that is what clearing says on screen.
 *
 * Only an already-decided proposal can be cleared. A proposal still waiting
 * must be approved or rejected first, so nothing can be made to disappear
 * without someone deciding it.
 */

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  let body: { id?: number; allDecided?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }

  const db = requireDb();
  try {
    const actor = await pearlActor();

    /* Clear everything already decided, in one statement so a proposal decided
       while this runs is either fully included or untouched. */
    if (body.allDecided === true) {
      const rows = await withPearlSchema(() => db`
        UPDATE pearl_proposals SET status = 'archived', updated_at = now()
        WHERE status IN ('approved', 'rejected')
        RETURNING id
      `) as Array<{ id: number }>;
      if (rows.length) {
        await recordPearlChange({
          changeType: 'proposals_cleared',
          entityType: 'proposal',
          summary: `Cleared ${rows.length} decided proposal${rows.length === 1 ? '' : 's'} off the approval screen. Every decision is still recorded here.`,
          actor,
          detail: { cleared: rows.length, ids: rows.map((row) => row.id).slice(0, 50) },
        });
      }
      return NextResponse.json({ ok: true, cleared: rows.length });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: 'Pass the proposal to clear, or allDecided to clear them all.' }, { status: 400 });
    }

    const rows = await withPearlSchema(() => db`
      UPDATE pearl_proposals SET status = 'archived', updated_at = now()
      WHERE id = ${id} AND status IN ('approved', 'rejected')
      RETURNING id, title
    `) as Array<{ id: number; title: string }>;

    if (!rows[0]) {
      const existing = await withPearlSchema(() => db`SELECT status FROM pearl_proposals WHERE id = ${id}`) as Array<{ status: string }>;
      if (!existing[0]) return NextResponse.json({ error: 'No proposal has that id.' }, { status: 404 });
      if (existing[0].status === 'proposed') {
        return NextResponse.json({ error: 'Decide this one first. Approve or reject it, and then it can be cleared away.' }, { status: 409 });
      }
      return NextResponse.json({ error: 'This proposal has already been cleared.' }, { status: 409 });
    }

    await recordPearlChange({
      changeType: 'proposal_cleared',
      entityType: 'proposal',
      entityId: rows[0].id,
      summary: `Cleared “${rows[0].title}” off the approval screen. The decision itself is still recorded here.`,
      actor,
      detail: { id: rows[0].id },
    });
    return NextResponse.json({ ok: true, cleared: 1 });
  } catch (error) {
    console.error('[admin/pearl/proposals/clear] POST failed:', error);
    return NextResponse.json({ error: 'Could not clear this proposal.' }, { status: 500 });
  }
}
