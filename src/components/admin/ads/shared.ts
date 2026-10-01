// Small formatting helpers shared by the Ad Results page and its cards. Pure
// functions only, safe in the browser. Money is minor units (pence) throughout,
// the same convention as src/lib/ads/meta.ts.

export const GOLD = '#b8952a'; // gold-500, same as the revenue chart

export function moneyFromMinor(minor: number, currency: string): string {
  const amount = (minor / 100).toFixed(2);
  return currency === 'GBP' || currency === '' ? `£${amount}` : `${currency} ${amount}`;
}

export function count(n: number): string {
  return n.toLocaleString('en-GB');
}

export function metaAccountLabel(accountId: string, accountIds: string[] = []): string {
  const position = accountIds.indexOf(accountId);
  const number = position >= 0 ? position + 1 : null;
  return `${number ? `Account ${number}` : 'Meta account'} (${accountId.slice(-5)})`;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' });
}

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
}

// The ad account's day is London's day, not the browser's or the server's.
export function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}

export function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
