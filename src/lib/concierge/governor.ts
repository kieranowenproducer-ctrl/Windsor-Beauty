// What is left of the governor on the website side, after Stage 5 of the
// assistant merge (2026-08-03).
//
// The control plane itself — kill switch, fair-use allowances, spending
// ceilings, the answer cache, the metering — now runs inside the hosted
// concierge service, which is the one codebase behind every surface. It uses
// the same tables in the same aisupport database and the same environment
// knob names, so the ceilings Kieran set (£5 a day, £50 a month) carry over
// unchanged.
//
// This file keeps only what the WEBSITE still genuinely owns:
//
//   LIMITS           shown on the admin usage screen, and the message-length
//                    pre-check on the account route (a polite 413 beats a
//                    round trip to the service)
//   conciergeEnabled the admin screen's "is it switched on" light
//   actor names      who a turn is metered as — the website computes these
//                    because only it knows the session and the caller's IP

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** Every limit in one object so the admin dashboard can show what is in force.
 *  Same env names as the hosted service, on purpose: one set of knobs. */
export const LIMITS = {
  // --- per message ---
  get maxMessageChars() { return num('CONCIERGE_MAX_MESSAGE_CHARS', 1500); },
  get maxHistoryTurns() { return num('CONCIERGE_MAX_HISTORY_TURNS', 8); },
  get maxRetrievedChunks() { return num('CONCIERGE_MAX_CHUNKS', 6); },
  get maxOutputTokens() { return num('CONCIERGE_MAX_OUTPUT_TOKENS', 700); },
  get maxToolRounds() { return num('CONCIERGE_MAX_TOOL_ROUNDS', 4); },
  get requestTimeoutMs() { return num('CONCIERGE_TIMEOUT_MS', 25_000); },

  // --- per account ---
  get burstPerTenMin() { return num('CONCIERGE_BURST_10MIN', 12); },
  get perHour() { return num('CONCIERGE_PER_HOUR', 30); },
  get perDay() { return num('CONCIERGE_PER_DAY', 40); },
  get perMonth() { return num('CONCIERGE_PER_MONTH', 250); },

  // --- platform ---
  /* Kieran set the figures in pounds on 2026-08-02: £5 a day and £50 a month.
   * At the 0.80 exchange rate the cost ledger uses, that is $6.25 and $62.50.
   * The dollar figure is stored because the throttle compares against what
   * Anthropic actually bills, which is dollars. */
  get dailyUsdCap() { return num('CONCIERGE_DAILY_USD_CAP', 6.25); },
  get monthlyUsdCap() { return num('CONCIERGE_MONTHLY_USD_CAP', 62.5); },

  // --- cache ---
  get cacheTtlHours() { return num('CONCIERGE_CACHE_TTL_HOURS', 24); },
};

export function conciergeEnabled(): boolean {
  return (process.env.CONCIERGE_ENABLED ?? 'on').toLowerCase() !== 'off';
}

// ---------------------------------------------------------------------------
// Actor identity
// ---------------------------------------------------------------------------

/**
 * Who is being metered. A signed-in customer is metered by their customer id,
 * which is the only identity the account concierge accepts. Raw IPs are never
 * stored: the anonymous widget path hashes them, because an IP is personal
 * data and we only ever need to compare it with itself.
 */
export function customerActor(customerId: number): string {
  return `customer:${customerId}`;
}

/**
 * Windsor Glow's own staff, when they are signed in to the admin panel and not
 * to a customer account. One bucket for all of them on purpose: there is no
 * per-person id to meter here, and staff use has to sit inside the same
 * allowances as everyone else rather than outside them. Two admins testing hard
 * on the same day therefore share the daily allowance, which is the safe
 * direction and, with a team this size, not a limit anyone will meet.
 */
export function staffActor(): string {
  return 'staff:admin';
}

export async function ipActor(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`wg-concierge:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `ip:${hex.slice(0, 24)}`;
}
