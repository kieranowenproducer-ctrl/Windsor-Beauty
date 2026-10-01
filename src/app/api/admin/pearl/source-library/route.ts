import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { withPearlSchema } from '@/lib/db/pearlAdmin';
import { RESEARCH_SOURCES } from '@/lib/concierge/research/evidence.generated.mjs';

export const dynamic = 'force-dynamic';

/**
 * Read-only view of the Pearl source library (Pearl plan Stage C step 6).
 *
 * Returns a per-source summary (how many pages are stored, how many the
 * evidence actually cites, how many could not be reached, when each was last
 * read) and a filtered page list. Nothing here writes anything.
 */
export async function GET(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const params = new URL(request.url).searchParams;
  const source = (params.get('source') || '').slice(0, 60);
  const status = (params.get('status') || '').slice(0, 20);
  const query = (params.get('q') || '').slice(0, 120);
  const offset = Math.max(0, Number(params.get('offset')) || 0);

  const db = requireDb();
  try {
    const [summary, pages, totals] = await withPearlSchema(() => Promise.all([
      db`
        SELECT source_id,
               count(*)::int AS pages,
               count(*) FILTER (WHERE used_in_evidence)::int AS used,
               count(*) FILTER (WHERE status = 'unreachable')::int AS unreachable,
               max(last_read_at) AS last_read_at,
               max(last_changed_at) AS last_changed_at
        FROM pearl_source_pages
        WHERE archived_at IS NULL
        GROUP BY source_id
        ORDER BY source_id
      `,
      db`
        SELECT id, url, source_id, kind, status, title, used_in_evidence, latest_version,
               http_status, body_bytes, last_read_at, last_changed_at
        FROM pearl_source_pages
        WHERE archived_at IS NULL
          AND (${source} = '' OR source_id = ${source})
          AND (${status} = '' OR status = ${status})
          AND (${query} = '' OR url ILIKE '%' || ${query} || '%' OR title ILIKE '%' || ${query} || '%')
        ORDER BY source_id, url
        LIMIT 60 OFFSET ${offset}
      `,
      db`
        SELECT count(*)::int AS total
        FROM pearl_source_pages
        WHERE archived_at IS NULL
          AND (${source} = '' OR source_id = ${source})
          AND (${status} = '' OR status = ${status})
          AND (${query} = '' OR url ILIKE '%' || ${query} || '%' OR title ILIKE '%' || ${query} || '%')
      `,
    ]));
    const names = new Map(
      (RESEARCH_SOURCES as Array<{ id: string; name: string }>).map((entry) => [entry.id, entry.name]),
    );
    return NextResponse.json({
      summary: (summary as Array<{ source_id: string }>).map((row) => ({
        ...row,
        name: names.get(row.source_id) || row.source_id,
      })),
      pages,
      total: (totals as Array<{ total: number }>)[0]?.total ?? 0,
      offset,
    });
  } catch (error) {
    console.error('[admin/pearl/source-library] GET failed:', error);
    return NextResponse.json({ error: 'Could not load the source library.' }, { status: 500 });
  }
}
