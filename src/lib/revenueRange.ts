/**
 * The date range behind the Revenue screen (task 620fed22).
 *
 * Kept out of the page and free of React so it can be tested on its own, because the whole thing
 * turns on one detail that is easy to get wrong and impossible to see afterwards:
 *
 *   new Date('2026-09-01') is midnight UTC, NOT midnight here.
 *
 * Through British Summer Time that is 01:00 on the 1st in London. An order placed at 00:30 on the
 * 1st would sit before the range and quietly vanish from a month's takings, and the total would
 * still look perfectly reasonable. Every date in this file is therefore built from its parts in
 * local time, which is also how the screen's existing "This Month" button already works.
 *
 * The other half of the same trap is the far end: a range "to 15 September" has to include
 * everything that happened ON the 15th, not stop at the first second of it.
 */

export type RangePreset = 'all' | 'this_month' | 'last_month' | 'last_30' | 'this_year' | 'custom';

export type DateRange = {
  /** 'YYYY-MM-DD', or '' for open-ended. */
  from: string;
  to: string;
};

export const OPEN_RANGE: DateRange = { from: '', to: '' };

/** A 'YYYY-MM-DD' box value as a real date at local midnight. Returns null for anything else. */
export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value || '').trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  // Rejects 31 February and friends, which JS would otherwise roll into March.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** The last instant of that local day, so a range's end date is included in full. */
export function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** A date as the 'YYYY-MM-DD' a date input expects, in local time. */
export function toInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The from/to a quick-pick button stands for. 'custom' keeps whatever is already typed. */
export function rangeForPreset(preset: RangePreset, now: Date = new Date()): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'this_month':
      return { from: toInputValue(new Date(now.getFullYear(), now.getMonth(), 1)), to: toInputValue(today) };
    case 'last_month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      // Day 0 of this month is the last day of the previous one, which handles every month length.
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toInputValue(first), to: toInputValue(last) };
    }
    case 'last_30': {
      // 30 days INCLUDING today, so the count matches the label.
      const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      return { from: toInputValue(first), to: toInputValue(today) };
    }
    case 'this_year':
      return { from: toInputValue(new Date(now.getFullYear(), 0, 1)), to: toInputValue(today) };
    case 'all':
    default:
      return { ...OPEN_RANGE };
  }
}

/** Which quick-pick button, if any, the current range matches. Drives the highlighted button. */
export function presetForRange(range: DateRange, now: Date = new Date()): RangePreset {
  if (!range.from && !range.to) return 'all';
  for (const preset of ['this_month', 'last_month', 'last_30', 'this_year'] as const) {
    const candidate = rangeForPreset(preset, now);
    if (candidate.from === range.from && candidate.to === range.to) return preset;
  }
  return 'custom';
}

/** True when the range is the wrong way round. Worth saying out loud rather than showing nothing. */
export function isBackwards(range: DateRange): boolean {
  const from = parseLocalDate(range.from);
  const to = parseLocalDate(range.to);
  return Boolean(from && to && from.getTime() > to.getTime());
}

/** Is this order inside the range? An unparseable or empty end is treated as open, not as zero. */
export function withinRange(createdAt: string, range: DateRange): boolean {
  const when = new Date(createdAt);
  if (Number.isNaN(when.getTime())) return false;

  const from = parseLocalDate(range.from);
  if (from && when.getTime() < from.getTime()) return false;

  const to = parseLocalDate(range.to);
  if (to && when.getTime() > endOfLocalDay(to).getTime()) return false;

  return true;
}

const LONG_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

/** The range in words, so a figure on screen is never ambiguous about what it counts. */
export function describeRange(range: DateRange): string {
  const from = parseLocalDate(range.from);
  const to = parseLocalDate(range.to);

  if (!from && !to) return 'Everything, all time';
  if (from && to) {
    if (from.getTime() === to.getTime()) return from.toLocaleDateString('en-GB', LONG_DATE);
    if (from.getTime() > to.getTime()) {
      return `${from.toLocaleDateString('en-GB', LONG_DATE)} back to ${to.toLocaleDateString('en-GB', LONG_DATE)}`;
    }
    return `${from.toLocaleDateString('en-GB', LONG_DATE)} to ${to.toLocaleDateString('en-GB', LONG_DATE)}`;
  }
  if (from) return `${from.toLocaleDateString('en-GB', LONG_DATE)} onwards`;
  return `Everything up to ${to!.toLocaleDateString('en-GB', LONG_DATE)}`;
}

/** The range as URL parameters, so a view can be refreshed, bookmarked and sent to somebody. */
export function rangeToQuery(range: DateRange): string {
  const params = new URLSearchParams();
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * The range a URL is asking for.
 *
 * `?period=this_month` is still honoured, because that is what the screen used before this and
 * somebody may well have bookmarked it.
 */
export function rangeFromQuery(search: string, now: Date = new Date()): DateRange {
  const params = new URLSearchParams(search);
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  if (parseLocalDate(from) || parseLocalDate(to)) {
    return { from: parseLocalDate(from) ? from : '', to: parseLocalDate(to) ? to : '' };
  }
  if (params.get('period') === 'this_month') return rangeForPreset('this_month', now);
  return { ...OPEN_RANGE };
}
