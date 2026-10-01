// Converts a timestamp to a YYYY-MM-DD string in UK local time (Europe/London,
// which automatically accounts for BST). Order timestamps are stored in UTC,
// but the dispatch calendar and CSV exports need to group orders by the day
// they appear on for a UK-based admin — a raw UTC slice puts orders placed
// just after midnight BST under the previous day.
export function londonDateString(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(date);
}
