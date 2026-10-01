// When a day starts and when a month starts, for a business that runs in London.
//
// WHY THIS FILE EXISTS. Every spend query in the engine asked Postgres for
// `date_trunc('month', now())`, which is midnight UTC. From late March to late October the
// United Kingdom is one hour ahead of that, so anything charged between 00:00 and 01:00 BST on
// the first of a month landed in the month that had just ended. The same hour on the first of
// January would be counted in the previous YEAR.
//
// It is a small error and it is the worst kind: it only appears in one hour out of every 744, it
// always resolves itself by the next query, and the number it produces is perfectly plausible. A
// monthly total that is occasionally wrong is a monthly total nobody can reconcile against a bill.
//
// The fix is not a cleverer SQL expression. It is to work the boundary out ONCE, in one place, as
// an absolute instant, and pass it to every query as an ordinary parameter. That keeps the
// timezone knowledge in a file that can be tested with no database at all, and it means a query
// cannot accidentally use a different rule from the screen printing its result.

/**
 * The business runs on London time, and every figure a person reads is a London figure.
 *
 * Stated once here rather than assumed. If Windsor Glow ever operates from somewhere else, this
 * is the line that changes, and the tests below it will say what else has to.
 */
export const BUSINESS_TIMEZONE = 'Europe/London';

/** The wall clock in London, taken apart. */
interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** What a clock on the wall in London reads at this instant. */
export function wallClock(at: Date): WallClock {
  const found: Record<string, string> = {};
  for (const part of PARTS.formatToParts(at)) {
    if (part.type !== 'literal') found[part.type] = part.value;
  }
  return {
    year: Number(found.year),
    // `hour12: false` renders midnight as 24 in some engines and 00 in others. Both mean the
    // start of the day, so it is normalised here rather than trusted.
    month: Number(found.month),
    day: Number(found.day),
    hour: Number(found.hour) % 24,
    minute: Number(found.minute),
    second: Number(found.second),
  };
}

/**
 * How far ahead of UTC London is at a given instant, in milliseconds.
 *
 * Worked out by reading the London wall clock and asking what instant that reading WOULD be if it
 * were a UTC reading. The gap between the two is the offset. It is done this way, rather than
 * from a table of transition dates, because the runtime already carries the full timezone
 * database and it stays correct when the rules change.
 */
function offsetAt(at: Date): number {
  const w = wallClock(at);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - at.getTime();
}

/**
 * The instant at which a given London wall clock reading occurs.
 *
 * Two passes, and the second one is not optional. The offset has to be guessed from an instant
 * before the instant is known, so the first pass can land on the wrong side of a clock change:
 * asking for 1 November at midnight from a summer guess would answer an hour out. Reading the
 * offset again at the answer and correcting once settles it.
 *
 * The one reading this cannot represent is the hour that does not exist on the spring-forward
 * day. That is not reachable from here: British clocks change at 01:00, so midnight always
 * happens, and midnight is the only reading this file ever asks for.
 */
function instantOf(year: number, month: number, day: number): Date {
  const wanted = Date.UTC(year, month - 1, day, 0, 0, 0);
  const firstGuess = wanted - offsetAt(new Date(wanted));
  const corrected = wanted - offsetAt(new Date(firstGuess));
  return new Date(corrected);
}

/** The London calendar date of an instant, as YYYY-MM-DD. The key every daily total is grouped by. */
export function londonDate(at: Date = new Date()): string {
  const w = wallClock(at);
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

/** The London calendar month of an instant, as YYYY-MM. */
export function londonMonth(at: Date = new Date()): string {
  const w = wallClock(at);
  return `${w.year}-${String(w.month).padStart(2, '0')}`;
}

/** The instant the London day containing `at` began. */
export function dayStart(at: Date = new Date()): Date {
  const w = wallClock(at);
  return instantOf(w.year, w.month, w.day);
}

/** The instant the London day containing `at` ends, which is the start of the next one. */
export function dayEnd(at: Date = new Date()): Date {
  const w = wallClock(at);
  return instantOf(w.year, w.month, w.day + 1);
}

/** The instant the London month containing `at` began. */
export function monthStart(at: Date = new Date()): Date {
  const w = wallClock(at);
  return instantOf(w.year, w.month, 1);
}

/** The instant the London month containing `at` ends, which is the start of the next one. */
export function monthEnd(at: Date = new Date()): Date {
  const w = wallClock(at);
  return instantOf(w.year, w.month + 1, 1);
}

/**
 * The start and end of a month named as YYYY-MM.
 *
 * What the history screen and the month filter both run on, so a month picked from a dropdown is
 * bounded by exactly the same rule as the month showing on the tile.
 */
export function monthRange(key: string): { from: Date; to: Date; label: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`"${key}" is not a month. Months look like 2026-08.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`There is no month ${month}.`);
  return {
    from: instantOf(year, month, 1),
    to: instantOf(year, month + 1, 1),
    label: monthLabel(instantOf(year, month, 1)),
  };
}

/** How many days the London month containing `at` has. Drives the month-end projection. */
export function daysInMonth(at: Date = new Date()): number {
  const w = wallClock(at);
  // Day zero of the next month is the last day of this one, which is how the calendar answers
  // the leap year question without anybody having to know the rule.
  return new Date(Date.UTC(w.year, w.month, 0)).getUTCDate();
}

/** Which day of the month it is in London, counting from 1. */
export function dayOfMonth(at: Date = new Date()): number {
  return wallClock(at).day;
}

/** Every London date in a month, oldest first, as YYYY-MM-DD. The calendar grid runs on this. */
export function datesInMonth(key: string): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`"${key}" is not a month. Months look like 2026-08.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const total = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out: string[] = [];
  for (let day = 1; day <= total; day += 1) {
    out.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return out;
}

/** "August 2026". */
export function monthLabel(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long', year: 'numeric', timeZone: BUSINESS_TIMEZONE,
  }).format(at);
}

/**
 * Which weekday a London date falls on, Monday first, counting from 0.
 *
 * The calendar grid needs to know how many blank cells go before the first of the month. Read off
 * the date itself rather than off a Date object's local weekday, which would be the SERVER's idea
 * of the week.
 */
export function weekdayIndex(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  // getUTCDay counts from Sunday. The United Kingdom starts its week on Monday.
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}
