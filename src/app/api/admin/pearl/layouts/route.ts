import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { listPearlLayouts, pearlActor, recordPearlChange, savePearlLayout, withPearlSchema } from '@/lib/db/pearlAdmin';

export const dynamic = 'force-dynamic';

/**
 * Answer layouts (Kieran's feature, 18 Aug 2026).
 *
 * A layout is an arrangement of the blocks an answer already has. Saving one
 * changes nothing for members: a layout only applies through an assignment
 * that is switched ON (see ./assign), and any custom words the administrator
 * writes are saved as drafts here, with a proposal filed for each - the
 * words cannot reach a member until that proposal is approved.
 */
export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  try {
    return NextResponse.json(await listPearlLayouts());
  } catch (error) {
    console.error('[admin/pearl/layouts] GET failed:', error);
    return NextResponse.json({ error: 'Could not load the layouts.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  let body: { id?: number | null; name?: string; blocks?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const name = String(body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'Give the layout a name.' }, { status: 400 });

  try {
    const actor = await pearlActor();
    const { layout, pending } = await savePearlLayout(
      { id: Number.isInteger(body.id) ? Number(body.id) : null, name, blocks: body.blocks },
      actor,
    );

    /* One proposal per draft custom block, filed automatically so the words
       are always in the approval queue the moment they are saved. */
    const db = requireDb();
    for (const block of pending) {
      await withPearlSchema(() => db`
        INSERT INTO pearl_proposals (kind, title, summary, before_view, after_view, payload, created_by)
        VALUES ('layout_text',
                ${`Approve custom words in the “${layout.name}” layout`.slice(0, 300)},
                ${block.heading ? `Under the heading “${block.heading}”.` : null},
                ${JSON.stringify({ 'Today': 'The words are a draft; members cannot see them', 'The words': block.text })}::jsonb,
                ${JSON.stringify({ 'After approval': 'The words can appear in answers wherever this layout is switched on' })}::jsonb,
                ${JSON.stringify({ layoutText: { layoutId: layout.id, blockId: block.id, heading: block.heading, text: block.text } })}::jsonb,
                ${actor})
      `);
    }
    await recordPearlChange({
      changeType: 'layout_saved',
      entityType: 'layout',
      entityId: layout.id,
      summary: `Saved the answer layout “${layout.name}”${pending.length ? ` and filed ${pending.length} proposal${pending.length === 1 ? '' : 's'} for its custom words` : ''}.`,
      actor,
    });
    return NextResponse.json({ layout, proposalsFiled: pending.length });
  } catch (error) {
    console.error('[admin/pearl/layouts] POST failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save the layout.' }, { status: 500 });
  }
}
