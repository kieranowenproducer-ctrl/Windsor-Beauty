// Single source of truth for "is the site open yet?".
//
// This is imported by BOTH src/proxy.ts (which enforces the wall, on the
// edge runtime) and /api/launch/countdown (which drives the visible timer and
// tells the coming-soon page when to move visitors through). They must never
// disagree: a wall that is open while the timer still ticks strands everyone
// sitting on the countdown page, and a timer that hits zero while the wall is
// shut bounces them into a redirect loop.
//
// Keep this file free of Node-only APIs and database access — middleware runs
// on the edge runtime and can do neither.

// GO-LIVE: 11:00am Wednesday 29 July 2026, UK time. Britain is on BST (UTC+1)
// on that date, so 11:00 local is 10:00Z. Stored as an absolute UTC instant on
// purpose: it is never re-derived from a local timezone at runtime, so there is
// no path by which the server mistakes 11:00 BST for 11:00 UTC and opens an
// hour late.
export const DEFAULT_LAUNCH_AT = '2026-07-29T10:00:00.000Z';

/**
 * The instant the site opens, in epoch ms.
 *
 * LAUNCH_AT (an environment variable) overrides the default when set, which is
 * how the launch moment is moved without a code change.
 */
export function launchAtMs(): number {
  const raw = process.env.LAUNCH_AT?.trim();
  if (raw) {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.parse(DEFAULT_LAUNCH_AT);
}

export function launchAtIso(): string {
  return new Date(launchAtMs()).toISOString();
}

/**
 * Is the pre-launch wall still up?
 *
 * Before this was time-aware the wall came down ONLY by deleting
 * LAUNCH_ACCESS_CODE from the environment and redeploying — the countdown and
 * the wall were not connected to each other at all, so the timer could reach
 * zero and the site would stay shut until a human noticed. The gate is now the
 * clock, which passes on its own with no deploy, no database write and nobody
 * present.
 *
 * Two manual overrides, both set as Vercel environment variables (never
 * exposed to the browser):
 *   LAUNCH_FORCE_OPEN=1  open the site immediately, whatever the clock says
 *   LAUNCH_FORCE_LOCK=1  keep or put the wall back up, whatever the clock says
 * FORCE_OPEN deliberately wins, so an emergency "just open it" can never be
 * defeated by a stale lock flag someone else left behind.
 */
export function isWallUp(now: number = Date.now()): boolean {
  if (process.env.LAUNCH_FORCE_OPEN === '1') return false;
  if (process.env.LAUNCH_FORCE_LOCK === '1') return true;
  // No access code configured means the wall was never armed: site is public.
  if (!process.env.LAUNCH_ACCESS_CODE) return false;
  return now < launchAtMs();
}

/** Inverse of {@link isWallUp} — the value the countdown endpoint publishes. */
export function isSiteOpen(now: number = Date.now()): boolean {
  return !isWallUp(now);
}
