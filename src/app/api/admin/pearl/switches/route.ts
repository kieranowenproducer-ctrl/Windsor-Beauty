import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { pearlActor, recordPearlChange, withPearlSchema } from '@/lib/db/pearlAdmin';

export const dynamic = 'force-dynamic';

/**
 * On/off switches for approved citation corrections and passage boosts
 * (Pearl repairs Stage C, 18 Aug 2026).
 *
 * Approving a proposal writes these rows, but until this route existed no
 * screen could switch one off again. The answer engine already reads only
 * switched-on rows (listApprovedPearlCitationRecords and the passage search
 * both filter on enabled), so flipping a switch changes the next answer with
 * no engine change at all. Nothing is deleted — a switched-off row keeps its
 * history and can be switched back on.
 */

export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const db = requireDb();
  try {
    const citations = await withPearlSchema(() => db`
      SELECT id, compound_slug, action, url, label, enabled, created_at
      FROM pearl_citation_overrides
      WHERE archived_at IS NULL
      ORDER BY id DESC
      LIMIT 100
    `);
    const boosts = await withPearlSchema(() => db`
      SELECT b.id, b.note, b.enabled, b.created_at, g.title AS page_title, g.url AS page_url
      FROM pearl_passage_boosts b
      JOIN pearl_source_pages g ON g.id = b.page_id
      ORDER BY b.id DESC
      LIMIT 100
    `);
    return NextResponse.json({ citations, boosts });
  } catch (error) {
    console.error('[admin/pearl/switches] GET failed:', error);
    return NextResponse.json({ error: 'Could not load the corrections and boosts.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  let body: { type?: string; id?: number; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const type = body.type === 'citation' ? 'citation' : body.type === 'boost' ? 'boost' : null;
  const id = Number(body.id);
  const enabled = body.enabled === true;
  if (!type || !Number.isInteger(id)) return NextResponse.json({ error: 'Pass a type (citation or boost), an id and enabled.' }, { status: 400 });

  const db = requireDb();
  try {
    const actor = await pearlActor();
    const rows = type === 'citation'
      ? await withPearlSchema(() => db`
          UPDATE pearl_citation_overrides SET enabled = ${enabled}
          WHERE id = ${id} AND archived_at IS NULL
          RETURNING id, compound_slug, action, url
        `) as Array<{ id: number; compound_slug: string; action: string; url: string }>
      : await withPearlSchema(() => db`
          UPDATE pearl_passage_boosts SET enabled = ${enabled}
          WHERE id = ${id}
          RETURNING id, note
        `) as Array<{ id: number; note: string | null }>;
    if (!rows[0]) return NextResponse.json({ error: 'Nothing has that id.' }, { status: 404 });

    const what = type === 'citation'
      ? `the citation correction for ${(rows[0] as { compound_slug: string }).compound_slug}`
      : 'the passage boost';
    await recordPearlChange({
      changeType: enabled ? 'correction_switched_on' : 'correction_switched_off',
      entityType: type,
      entityId: id,
      summary: `Switched ${what} ${enabled ? 'on' : 'off'}. The next answer reflects it.`,
      actor,
      detail: { type, enabled },
    });
    return NextResponse.json({ ok: true, enabled });
  } catch (error) {
    console.error('[admin/pearl/switches] POST failed:', error);
    return NextResponse.json({ error: 'Could not change the switch.' }, { status: 500 });
  }
}
