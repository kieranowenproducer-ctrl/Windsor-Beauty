import { APPLE_PRIVATE_RELAY_DATA } from './data/applePrivateRelayData';

// Is this internet address one of Apple's iPhone Private Relay addresses?
//
// Private Relay is an iCloud setting that sends Safari through addresses Apple shares between
// thousands of unrelated people. Two accounts "on the same connection" through one of those have
// told us almost nothing, and every screen that says "same internet connection" must say so
// (Samuel, 30 September 2026).
//
// The answer comes only from Apple's own published list, squashed into ranges by
// scripts/refresh-apple-relay-list.mjs. Run that again every month or two.

interface RelayData {
  fetchedAt: string;
  ipv4: Array<[number, number]>;
  ipv6: Array<[string, string]>;
}

// Parsed once, on first use, so a module that merely imports this pays nothing.
let parsed: { fetchedAt: string; ipv4: Array<[number, number]>; ipv6: Array<readonly [bigint, bigint]> } | null = null;
function data() {
  if (!parsed) {
    const raw = JSON.parse(APPLE_PRIVATE_RELAY_DATA) as RelayData;
    parsed = {
      fetchedAt: raw.fetchedAt,
      ipv4: raw.ipv4,
      ipv6: raw.ipv6.map(([a, b]) => [BigInt(`0x${a}`), BigInt(`0x${b}`)] as const),
    };
  }
  return parsed;
}

/** The date the list was fetched from Apple, eg "2026-09-30". */
export function appleRelayListDate(): string {
  return data().fetchedAt;
}

function findIn<T extends number | bigint>(ranges: ReadonlyArray<readonly [T, T]>, value: T): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = ranges[mid];
    if (value < start) hi = mid - 1;
    else if (value > end) lo = mid + 1;
    else return true;
  }
  return false;
}

function ipv4Number(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!/^\d{1,3}$/.test(part) || octet > 255) return null;
    n = n * 256 + octet;
  }
  return n;
}

/** First 64 bits of an IPv6 address, which is all Apple's list is precise to. */
function ipv6Prefix(ip: string): bigint | null {
  if (!ip.includes(':')) return null;
  const clean = ip.replace(/^\[|\]$/g, '').split('%')[0];
  const [head, tail] = clean.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  if (clean.includes('::') ? h.length + t.length > 7 : h.length !== 8) return null;
  const groups = clean.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
  if (!groups.every(g => /^[0-9a-f]{0,4}$/i.test(g))) return null;
  return groups.slice(0, 4).reduce((acc, g) => (acc << BigInt(16)) + BigInt(parseInt(g || '0', 16)), BigInt(0));
}

export function isApplePrivateRelay(ip: string | null | undefined): boolean {
  const value = (ip ?? '').trim();
  if (!value) return false;
  // An IPv4 address written the IPv6 way (::ffff:1.2.3.4) is still an IPv4 address.
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  const v4 = ipv4Number(mapped ?? value);
  if (v4 !== null) return findIn(data().ipv4, v4);
  const v6 = ipv6Prefix(value);
  return v6 !== null && findIn(data().ipv6, v6);
}
