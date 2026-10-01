import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { pearlActor, recordPearlChange, withPearlSchema } from '@/lib/db/pearlAdmin';
import { looksLikeJunkPassage, JUNK_HEADINGS } from '@/lib/pearl/passage-guards.mjs';
import { cleanContentHash, pageReadOutcome } from '@/lib/pearl/library-versioning.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Load a batch of stored source pages into the Pearl source library
 * (Pearl plan Stage C step 5).
 *
 * The build script reads the approved source sites and keeps every page in
 * full. This route writes those pages into the database, so nothing that was
 * read is ever thrown away again:
 *
 *  - a page seen for the first time gets a row and a version 1 with its full
 *    text and sections;
 *  - a page read again with identical content just updates "last read";
 *  - a page whose content changed gets a NEW version row — the old text is
 *    never overwritten — and its search passages are rebuilt;
 *  - a page that could not be fetched is recorded as unreachable, keeping
 *    whatever stored text it already had.
 *
 * Reached only through the admin session (the proxy guards /api/admin/*).
 * Send { pages: [...] } per batch, then one final { finish: true,
 * evidenceUrls: [...], failures: [...] } call to mark which stored pages the
 * generated evidence actually cites and write the change-history entry.
 */

type LibrarySection = { heading?: string; level?: number; text?: string };

type LibraryPage = {
  url: string;
  sourceId: string;
  kind: 'page' | 'sitemap' | 'asset';
  httpStatus?: number;
  fetchedAt?: string;
  title?: string;
  heading?: string;
  publisher?: string;
  datePublished?: string;
  dateModified?: string;
  contentHash: string;
  bodyBytes?: number;
  sections?: LibrarySection[];
  fullText?: string;
};

type LibraryFailure = { url: string; error?: string; httpStatus?: number; fetchedAt?: string };

/** Split section text into search passages, cutting at sentence ends. */
function chunkText(text: string, target = 1_000): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > target) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence;
    while (current.length > target * 1.6) {
      chunks.push(current.slice(0, target).trim());
      current = current.slice(target);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function passagesForPage(page: LibraryPage): { position: number; heading: string | null; passage_text: string }[] {
  if (page.kind !== 'page') return [];
  const out: { position: number; heading: string | null; passage_text: string }[] = [];
  let position = 0;
  for (const section of page.sections || []) {
    const text = (section.text || '').trim();
    if (!text || (text.length < 40 && !section.heading)) continue;
    if (section.heading && JUNK_HEADINGS.test(section.heading.trim())) continue;
    for (const chunk of chunkText(text)) {
      if (looksLikeJunkPassage(chunk)) continue;
      out.push({ position: position++, heading: section.heading || null, passage_text: chunk });
      if (out.length >= 300) return out;
    }
  }
  return out;
}

async function upsertPage(db: ReturnType<typeof requireDb>, page: LibraryPage, rebuildPassages: boolean) {
  const rows = await db`
    SELECT id, latest_version, content_hash, clean_hash FROM pearl_source_pages
    WHERE lower(url) = lower(${page.url}) AND archived_at IS NULL
  ` as { id: number; latest_version: number; content_hash: string | null; clean_hash: string | null }[];
  const fetchedAt = page.fetchedAt || new Date().toISOString();
  const cleanedHash = cleanContentHash(page.fullText);
  const outcome = pageReadOutcome(rows[0], page, cleanedHash);

  /* Raw markup changed (rotating promos and the like) but the cleaned text -
     the knowledge - is identical. Refresh the hashes and "last read" without
     minting a version of unchanged knowledge. */
  if (outcome === 'promo-only') {
    await db`
      UPDATE pearl_source_pages SET
        status = 'ok', error_message = NULL, http_status = ${page.httpStatus ?? null},
        content_hash = ${page.contentHash}, clean_hash = ${cleanedHash},
        body_bytes = ${page.bodyBytes ?? null},
        last_read_at = ${fetchedAt}, updated_at = now()
      WHERE id = ${rows[0].id}
    `;
    return 'unchanged';
  }

  if (outcome === 'unchanged') {
    await db`
      UPDATE pearl_source_pages SET
        status = 'ok', error_message = NULL, http_status = ${page.httpStatus ?? null},
        clean_hash = ${cleanedHash},
        last_read_at = ${fetchedAt}, updated_at = now()
      WHERE id = ${rows[0].id}
    `;
    if (rebuildPassages) {
      /* Same page content, better extraction: refresh the derived data (the
         latest version's sections and text, and the search passages) without
         inventing a new version — the read is the same read. */
      await db`
        UPDATE pearl_source_page_versions SET
          sections = ${JSON.stringify(page.sections || [])}::jsonb, full_text = ${page.fullText || ''}
        WHERE page_id = ${rows[0].id} AND version = ${rows[0].latest_version}
      `;
      const rebuilt = passagesForPage(page);
      await db`DELETE FROM pearl_source_passages WHERE page_id = ${rows[0].id}`;
      if (rebuilt.length) {
        await db`
          INSERT INTO pearl_source_passages (page_id, version, position, heading, passage_text)
          SELECT ${rows[0].id}, ${rows[0].latest_version}, x.position, x.heading, x.passage_text
          FROM jsonb_to_recordset(${JSON.stringify(rebuilt)}::jsonb)
            AS x(position int, heading text, passage_text text)
        `;
      }
      return 'refreshed';
    }
    return 'unchanged';
  }

  let pageId: number;
  let version: number;
  if (!rows.length) {
    version = 1;
    const inserted = await db`
      INSERT INTO pearl_source_pages
        (source_id, url, kind, title, heading, publisher, date_published, date_modified,
         http_status, status, used_in_evidence, latest_version, content_hash, clean_hash, body_bytes,
         first_read_at, last_read_at, last_changed_at)
      VALUES
        (${page.sourceId || 'unknown'}, ${page.url}, ${page.kind}, ${page.title || null}, ${page.heading || null},
         ${page.publisher || null}, ${page.datePublished || null}, ${page.dateModified || null},
         ${page.httpStatus ?? null}, 'ok', FALSE, 1, ${page.contentHash}, ${cleanedHash}, ${page.bodyBytes ?? null},
         ${fetchedAt}, ${fetchedAt}, ${fetchedAt})
      RETURNING id
    ` as { id: number }[];
    pageId = inserted[0].id;
  } else {
    pageId = rows[0].id;
    version = rows[0].latest_version + 1;
    await db`
      UPDATE pearl_source_pages SET
        title = ${page.title || null}, heading = ${page.heading || null},
        publisher = ${page.publisher || null}, date_published = ${page.datePublished || null},
        date_modified = ${page.dateModified || null}, http_status = ${page.httpStatus ?? null},
        status = 'ok', error_message = NULL, latest_version = ${version},
        content_hash = ${page.contentHash}, clean_hash = ${cleanedHash}, body_bytes = ${page.bodyBytes ?? null},
        last_read_at = ${fetchedAt}, last_changed_at = ${fetchedAt}, updated_at = now()
      WHERE id = ${pageId}
    `;
  }

  await db`
    INSERT INTO pearl_source_page_versions
      (page_id, version, content_hash, title, heading, sections, full_text,
       publisher, date_published, date_modified, fetched_at)
    VALUES
      (${pageId}, ${version}, ${page.contentHash}, ${page.title || null}, ${page.heading || null},
       ${JSON.stringify(page.sections || [])}::jsonb, ${page.fullText || ''},
       ${page.publisher || null}, ${page.datePublished || null}, ${page.dateModified || null}, ${fetchedAt})
    ON CONFLICT (page_id, version) DO NOTHING
  `;

  const passages = passagesForPage(page);
  await db`DELETE FROM pearl_source_passages WHERE page_id = ${pageId}`;
  if (passages.length) {
    await db`
      INSERT INTO pearl_source_passages (page_id, version, position, heading, passage_text)
      SELECT ${pageId}, ${version}, x.position, x.heading, x.passage_text
      FROM jsonb_to_recordset(${JSON.stringify(passages)}::jsonb)
        AS x(position int, heading text, passage_text text)
    `;
  }
  return rows.length ? 'new-version' : 'new-page';
}

async function recordFailure(db: ReturnType<typeof requireDb>, failure: LibraryFailure) {
  const fetchedAt = failure.fetchedAt || new Date().toISOString();
  const rows = await db`
    UPDATE pearl_source_pages SET
      status = 'unreachable', error_message = ${failure.error || 'Could not be fetched.'},
      http_status = ${failure.httpStatus ?? null}, last_read_at = ${fetchedAt}, updated_at = now()
    WHERE lower(url) = lower(${failure.url}) AND archived_at IS NULL
    RETURNING id
  ` as { id: number }[];
  if (!rows.length) {
    await db`
      INSERT INTO pearl_source_pages
        (source_id, url, kind, status, error_message, http_status, first_read_at, last_read_at)
      VALUES ('unknown', ${failure.url}, 'page', 'unreachable', ${failure.error || 'Could not be fetched.'},
              ${failure.httpStatus ?? null}, ${fetchedAt}, ${fetchedAt})
    `;
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  let body: {
    pages?: LibraryPage[];
    failures?: LibraryFailure[];
    evidenceUrls?: string[];
    finish?: boolean;
    /** Refresh sections and search passages even for unchanged pages —
     *  used after the extraction or the junk filter improves. */
    rebuildPassages?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }

  const db = requireDb();
  try {
    const counts = { 'new-page': 0, 'new-version': 0, unchanged: 0, refreshed: 0, failures: 0 };
    await withPearlSchema(async () => {
      for (const page of body.pages || []) {
        if (!page?.url || !page?.contentHash) continue;
        const outcome = await upsertPage(db, page, body.rebuildPassages === true);
        counts[outcome] += 1;
      }
      for (const failure of body.failures || []) {
        if (!failure?.url) continue;
        await recordFailure(db, failure);
        counts.failures += 1;
      }
      if (body.finish) {
        const evidenceUrls = (body.evidenceUrls || []).filter((url) => typeof url === 'string');
        if (evidenceUrls.length) {
          await db`
            UPDATE pearl_source_pages
            SET used_in_evidence = (regexp_replace(url, '[?#].*$', '') = ANY(${evidenceUrls})), updated_at = now()
            WHERE archived_at IS NULL
          `;
        }
        const totals = await db`
          SELECT count(*)::int AS pages,
                 count(*) FILTER (WHERE used_in_evidence)::int AS used,
                 count(*) FILTER (WHERE status = 'unreachable')::int AS unreachable
          FROM pearl_source_pages WHERE archived_at IS NULL
        ` as { pages: number; used: number; unreachable: number }[];
        await recordPearlChange({
          changeType: 'source_library_load',
          entityType: 'source_page',
          summary: `Loaded the source library: ${totals[0].pages} stored pages, ${totals[0].used} cited by the evidence, ${totals[0].unreachable} unreachable.`,
          detail: { totals: totals[0] },
          actor: await pearlActor(),
        });
      }
    });
    return NextResponse.json({ ok: true, counts });
  } catch (error) {
    console.error('[admin/pearl/source-library/load] POST failed:', error);
    return NextResponse.json({ error: 'Could not load this batch into the source library.' }, { status: 500 });
  }
}
