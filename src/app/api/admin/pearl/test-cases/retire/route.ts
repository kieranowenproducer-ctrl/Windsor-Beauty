import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { pearlActor, recordPearlChange, withPearlSchema } from '@/lib/db/pearlAdmin';

export const dynamic = 'force-dynamic';

/**
 * Retire a saved test.
 *
 * Saved tests only ever accumulated: every correction approved on the Proposals
 * screen writes one, and nothing could ever take one off the list again, so the
 * screen grew until the tests that mattered were hard to find.
 *
 * Retiring sets 'retired', a status this table has always allowed. Nothing is
 * deleted and the question is kept: the runner already selects only 'active'
 * tests, so a retired one simply stops being run and leaves the list. The
 * change history keeps what was retired and by whom.
 */

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  let body: { id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'Pass the saved test to retire.' }, { status: 400 });

  const db = requireDb();
  try {
    const actor = await pearlActor();
    const rows = await withPearlSchema(() => db`
      UPDATE pearl_test_cases SET status = 'retired', updated_at = now()
      WHERE id = ${id} AND status <> 'retired'
      RETURNING id, question
    `) as Array<{ id: number; question: string }>;

    if (!rows[0]) {
      const existing = await withPearlSchema(() => db`SELECT status FROM pearl_test_cases WHERE id = ${id}`) as Array<{ status: string }>;
      if (!existing[0]) return NextResponse.json({ error: 'No saved test has that id.' }, { status: 404 });
      return NextResponse.json({ error: 'This test has already been retired.' }, { status: 409 });
    }

    await recordPearlChange({
      changeType: 'test_case_retired',
      entityType: 'test_case',
      entityId: rows[0].id,
      summary: `Retired the saved test “${rows[0].question.slice(0, 120)}”. It stops running and leaves the list; the question is kept here.`,
      actor,
      detail: { id: rows[0].id },
    });
    return NextResponse.json({ ok: true, retired: rows[0].id });
  } catch (error) {
    console.error('[admin/pearl/test-cases/retire] POST failed:', error);
    return NextResponse.json({ error: 'Could not retire this saved test.' }, { status: 500 });
  }
}
