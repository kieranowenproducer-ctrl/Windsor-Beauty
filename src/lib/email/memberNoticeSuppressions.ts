import { createHash } from 'crypto';
import { isSendableEmailAddress } from '@/lib/emailAddress';
import type { NoticeSuppressionSnapshot } from './memberChangeoverNotice';

export function validSuppressionCreatedAt(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})([T ])(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::\d{2})?)$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const zone = match[9];
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
      Number(match[5]) > 23 || Number(match[6]) > 59 || Number(match[7]) > 59 ||
      (match[4] === 'T' && zone !== 'Z' && !/^[+-]\d{2}:\d{2}$/.test(zone))) return false;
  if (zone !== 'Z') {
    const hours = Number(zone.slice(1,3)), minutes = zone.includes(':') ? Number(zone.slice(4)) : 0;
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return false;
  }
  const normalized = value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  return Number.isFinite(Date.parse(normalized));
}

// Official GET /suppressions, not a campaign/audience opt-in list. No writes or redirects.
// All pages are required. A scoped key without permission, partial data or exhausted bounds fails closed.
export async function readMemberNoticeSuppressions(
  key: string | undefined = process.env.RESEND_API_KEY_BEAUTY_IS,
  request: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<NoticeSuppressionSnapshot> {
  if (!key) throw new Error('Provider suppressions unavailable.');
  const deadline = now() + 20_000;
  const seenIds = new Set<string>(), seenCursors = new Set<string>(), emails = new Set<string>();
  const rows: string[][] = [];
  let after: string | null = null;
  for (let page = 0; page < 10; page++) {
    if (now() >= deadline) throw new Error('Provider suppressions unavailable.');
    const url = new URL('https://api.resend.com/suppressions');
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);
    const response = await request(url, {
      method: 'GET', headers: { Authorization: `Bearer ${key}` }, redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(Math.min(5_000, deadline - now())),
    });
    if (!response.ok || response.redirected || (response.url && new URL(response.url).origin !== 'https://api.resend.com')) {
      throw new Error('Provider suppressions unavailable.');
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') throw new Error('Provider suppressions unavailable.');
    const result = body as { object?: unknown; has_more?: unknown; data?: unknown };
    if (result.object !== 'list' || typeof result.has_more !== 'boolean' || !Array.isArray(result.data) ||
        result.data.length > 100 || (result.has_more && result.data.length === 0)) throw new Error('Provider suppressions unavailable.');
    let last: string | null = null;
    for (const item of result.data) {
      if (!item || typeof item !== 'object') throw new Error('Provider suppressions unavailable.');
      const row = item as { id?: unknown; email?: unknown; origin?: unknown; source_id?: unknown; created_at?: unknown };
      if (typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(row.id) || seenIds.has(row.id) ||
          !isSendableEmailAddress(row.email) || typeof row.email !== 'string' ||
          typeof row.origin !== 'string' || !['manual','bounce','complaint'].includes(row.origin) ||
          !(row.source_id === null || typeof row.source_id === 'string') ||
          !validSuppressionCreatedAt(row.created_at)) {
        throw new Error('Provider suppressions unavailable.');
      }
      seenIds.add(row.id); last = row.id;
      const email = row.email.trim().toLowerCase(); emails.add(email);
      rows.push([row.id, email, String(row.origin), row.source_id ?? '', row.created_at]);
    }
    if (!result.has_more) {
      if (now() >= deadline) throw new Error('Provider suppressions unavailable.');
      rows.sort((a,b) => a[0].localeCompare(b[0]));
      return { complete: true, checkedAt: now(), evidenceSha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), emails };
    }
    if (!last || seenCursors.has(last)) throw new Error('Provider suppressions unavailable.');
    seenCursors.add(last); after = last;
  }
  throw new Error('Provider suppressions unavailable.');
}
