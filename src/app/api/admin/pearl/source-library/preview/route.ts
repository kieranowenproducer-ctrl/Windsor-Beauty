import { NextResponse } from 'next/server';
import { validatePearlSourceUrl } from '@/lib/concierge/research/source-safety.mjs';
import { fetchPearlSourcePreview, PearlSourcePreviewError } from '@/lib/concierge/research/source-preview-fetch.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Preview what Pearl would read from one page (Pearl plan Stage D step 9).
 *
 * Lets a non-developer paste a page address and see, before anything is
 * imported: the page title, its section structure, how much text there is,
 * and which structured fields the general reader could recognise. Nothing is
 * stored and no evidence changes — this is a window, not a door. The address
 * is checked by the same safety rule as source submission (public https
 * only; private and internal addresses are refused).
 */

function decode(value: string): string {
  return value
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      const named: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
      if (entity[0] === '#') {
        const hex = entity[1]?.toLowerCase() === 'x';
        const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return named[entity.toLowerCase()] ?? match;
    });
}

function clean(value: string, maximum: number): string {
  return decode(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum);
}

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const checked = validatePearlSourceUrl(String(body.url || ''));
  if (!checked.ok) return NextResponse.json({ error: checked.error || 'Enter a valid public https link.' }, { status: 400 });

  try {
    const fetched = await fetchPearlSourcePreview(String(checked.url), { signal: AbortSignal.timeout(20_000) });
    const { markup } = fetched;

    const structuredTypes: string[] = [];
    const candidates: Record<string, string> = {};
    for (const match of Array.from(markup.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))) {
      try {
        const parsed = JSON.parse(decode(match[1].trim()));
        for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
          const flat = item?.['@graph'] ? item['@graph'] : [item];
          for (const node of flat) {
            const type = String(node?.['@type'] || '');
            if (type && !structuredTypes.includes(type)) structuredTypes.push(type);
            for (const key of ['name', 'headline', 'description', 'datePublished', 'dateModified', 'alternateName', 'drugClass']) {
              if (typeof node?.[key] === 'string' && node[key].trim() && !candidates[key]) candidates[key] = clean(node[key], 300);
            }
          }
        }
      } catch { /* a broken metadata block is not an error for a preview */ }
    }

    const headings = Array.from(markup.matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi));
    const sections = headings.slice(0, 8).map((match, index) => {
      const start = match.index + match[0].length;
      const end = index + 1 < headings.length ? headings[index + 1].index : Math.min(markup.length, start + 30_000);
      return { heading: clean(match[2], 200), preview: clean(markup.slice(start, end), 320) };
    });

    return NextResponse.json({
      ok: true,
      url: fetched.url,
      title: clean(markup.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '', 240),
      heading: clean(markup.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '', 240),
      textLength: clean(markup, 400_000).length,
      sectionCount: headings.length,
      sections,
      structuredTypes,
      candidates,
    });
  } catch (error) {
    console.error('[admin/pearl/source-library/preview] POST failed:', error);
    if (error instanceof PearlSourcePreviewError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'The page could not be fetched. Check the address and try again.' }, { status: 502 });
  }
}
