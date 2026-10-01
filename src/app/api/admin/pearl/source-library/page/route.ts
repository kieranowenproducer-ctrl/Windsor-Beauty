import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { withPearlSchema } from '@/lib/db/pearlAdmin';

export const dynamic = 'force-dynamic';

/**
 * One stored page in full (Pearl plan Stage C step 6): the page record, its
 * latest stored text and sections, and the history of distinct versions.
 * Read-only.
 */
export async function GET(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Pass a page id.' }, { status: 400 });

  const db = requireDb();
  try {
    const [pageRows, latestRows, versionRows, passageRows] = await withPearlSchema(() => Promise.all([
      db`SELECT * FROM pearl_source_pages WHERE id = ${id}`,
      db`
        SELECT version, title, heading, sections, full_text, publisher, date_published, date_modified, fetched_at
        FROM pearl_source_page_versions WHERE page_id = ${id}
        ORDER BY version DESC LIMIT 1
      `,
      db`
        SELECT version, content_hash, fetched_at, created_at
        FROM pearl_source_page_versions WHERE page_id = ${id}
        ORDER BY version DESC LIMIT 25
      `,
      db`SELECT count(*)::int AS passages FROM pearl_source_passages WHERE page_id = ${id}`,
    ]));
    const page = (pageRows as unknown[])[0];
    if (!page) return NextResponse.json({ error: 'No stored page has that id.' }, { status: 404 });
    return NextResponse.json({
      page,
      latest: (latestRows as unknown[])[0] || null,
      versions: versionRows,
      passages: (passageRows as Array<{ passages: number }>)[0]?.passages ?? 0,
    });
  } catch (error) {
    console.error('[admin/pearl/source-library/page] GET failed:', error);
    return NextResponse.json({ error: 'Could not load this stored page.' }, { status: 500 });
  }
}
