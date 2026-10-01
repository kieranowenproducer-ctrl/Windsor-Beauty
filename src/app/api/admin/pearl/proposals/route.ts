import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { pearlActor, recordPearlChange, withPearlSchema } from '@/lib/db/pearlAdmin';

export const dynamic = 'force-dynamic';

/**
 * Pearl improvement proposals (Pearl plan Stage D step 8).
 *
 * A proposal is a suggested change written down with its before and after.
 * It does NOTHING until someone approves it on the Proposals screen; the
 * approval is what executes it (see ./decide). This is the one shape every
 * improve button uses, so nothing in Pearl can change as a side effect of
 * merely suggesting something.
 */

const KINDS = new Set(['terminology_rule', 'answer_correction', 'ai_extraction', 'ai_summary', 'source_setting', 'citation_correction', 'source_refresh', 'source_extract', 'passage_boost', 'topic_link']);

export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const db = requireDb();
  try {
    /* Cleared proposals ('archived') are left out: they have been decided AND
       tidied away on purpose, and the change history keeps every decision. */
    const proposals = await withPearlSchema(() => db`
      SELECT * FROM pearl_proposals
      WHERE status <> 'archived'
      ORDER BY (status = 'proposed') DESC, created_at DESC
      LIMIT 100
    `);
    return NextResponse.json({ proposals });
  } catch (error) {
    console.error('[admin/pearl/proposals] GET failed:', error);
    return NextResponse.json({ error: 'Could not load the proposals.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  let body: {
    kind?: string;
    title?: string;
    summary?: string;
    before?: unknown;
    after?: unknown;
    payload?: unknown;
    sourceQuestionId?: number | null;
    dedupeKey?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const kind = String(body.kind || '');
  const title = String(body.title || '').trim().slice(0, 300);
  const dedupeKey = String(body.dedupeKey || '').trim().slice(0, 300);
  if (!KINDS.has(kind)) return NextResponse.json({ error: 'Unknown proposal kind.' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'Give the proposal a title.' }, { status: 400 });

  const db = requireDb();
  try {
    const actor = await pearlActor();
    if (dedupeKey) {
      const repeated = await withPearlSchema(() => db`
        UPDATE pearl_proposals
        SET payload = jsonb_set(
              payload,
              '{confirmationCount}',
              to_jsonb(COALESCE((payload->>'confirmationCount')::int, 1) + 1)
            ),
            updated_at = now()
        WHERE id = (
          SELECT id FROM pearl_proposals
          WHERE status = 'proposed' AND payload->>'dedupeKey' = ${dedupeKey}
          ORDER BY created_at DESC LIMIT 1
        )
        RETURNING *
      `);
      if (repeated[0]) return NextResponse.json({ proposal: repeated[0], repeated: true });
    }
    const rows = await withPearlSchema(() => db`
      INSERT INTO pearl_proposals (kind, title, summary, before_view, after_view, payload, created_by, source_question_id)
      VALUES (${kind}, ${title}, ${String(body.summary || '').slice(0, 2000) || null},
              ${JSON.stringify(body.before ?? {})}::jsonb, ${JSON.stringify(body.after ?? {})}::jsonb,
              ${JSON.stringify(body.payload ?? {})}::jsonb, ${actor},
              ${Number.isInteger(body.sourceQuestionId) ? body.sourceQuestionId : null})
      RETURNING *
    `);
    const proposal = (rows as Array<{ id: number }>)[0];
    await recordPearlChange({
      changeType: 'proposal_created',
      entityType: 'proposal',
      entityId: proposal.id,
      summary: `Proposed: ${title}. Nothing changes until it is approved.`,
      actor,
      detail: { kind },
    });
    return NextResponse.json({ proposal });
  } catch (error) {
    console.error('[admin/pearl/proposals] POST failed:', error);
    return NextResponse.json({ error: 'Could not save the proposal.' }, { status: 500 });
  }
}
