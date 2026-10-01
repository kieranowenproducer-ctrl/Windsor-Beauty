import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { withPearlSchema } from '@/lib/db/pearlAdmin';
import { RESEARCH_SOURCES } from '@/lib/concierge/research/evidence.generated.mjs';

export const dynamic = 'force-dynamic';

/**
 * Passage search over the stored source library (Pearl plan Stage D step 7).
 *
 * Searches the full stored text of every approved source page — the text the
 * old pipeline used to throw away — and returns the best-matching passages,
 * each with the page it came from, so every line shown is cited.
 *
 * Admin-only (the proxy guards /api/admin/*). The member-facing layer sits
 * behind the PEARL_PASSAGES_LIVE switch and does not exist yet; this bench
 * view is deliberately first so passages are judged before members see them.
 * Read-only.
 */
export async function GET(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const query = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 300);
  if (!query) return NextResponse.json({ passages: [] });

  const db = requireDb();
  try {
    /* An approved passage boost (improve button d8c) floats a passage to the
       top — but only when it genuinely matches the question; a boost can
       never make an unrelated passage appear. */
    const rows = await withPearlSchema(() => db`
      SELECT p.id, p.heading, p.passage_text,
             ts_rank(p.search_tsv, websearch_to_tsquery('english', ${query})) AS rank,
             (b.id IS NOT NULL) AS boosted,
             g.id AS page_id, g.url, g.title, g.source_id, g.date_modified, g.last_read_at
      FROM pearl_source_passages p
      JOIN pearl_source_pages g ON g.id = p.page_id
      LEFT JOIN pearl_passage_boosts b
        ON b.page_id = g.id AND b.passage_hash = md5(p.passage_text) AND b.enabled = TRUE
      WHERE g.archived_at IS NULL
        AND g.status = 'ok'
        AND g.kind = 'page'
        AND p.version = g.latest_version
        AND p.search_tsv @@ websearch_to_tsquery('english', ${query})
      ORDER BY (b.id IS NOT NULL) DESC, rank DESC
      LIMIT 8
    `);
    const names = new Map(
      (RESEARCH_SOURCES as Array<{ id: string; name: string }>).map((entry) => [entry.id, entry.name]),
    );
    return NextResponse.json({
      passages: (rows as Array<{ source_id: string }>).map((row) => ({
        ...row,
        sourceName: names.get(row.source_id) || row.source_id,
      })),
    });
  } catch (error) {
    console.error('[admin/pearl/passages] GET failed:', error);
    return NextResponse.json({ error: 'Could not search the stored sources.' }, { status: 500 });
  }
}
