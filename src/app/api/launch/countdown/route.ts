import { NextResponse } from 'next/server';
import { getSiteContent, isDbConfigured } from '@/lib/db';
import { isSiteOpen, launchAtIso } from '@/lib/launchWindow';

export const dynamic = 'force-dynamic';

// Public read of the launch countdown target (task 4c8541df). The coming-soon
// page sits in front of authentication, so this endpoint must be public; it
// exposes nothing but a single datetime. The admin sets the value from the
// dashboard's Pre-Launch card (stored via /api/admin/content under the
// 'launch-countdown' key); a stored date overrides the default below.
//
// DEFAULT: go-live is 11:00am UK time, Wednesday 29 July 2026 (Kieran's
// revision on task 4c8541df). With no stored override the countdown targets
// this, so the timer is live from the moment this deploys. Once the moment
// passes the page hides the timer by itself, so the default is harmless
// after launch.
// The wall comes down on the server's clock (middleware), so the countdown has
// to be driven by the server's clock too. Handing the browser `serverNow` lets
// it correct for a device clock that is minutes or hours out: without this a
// visitor whose laptop is slow sees a timer still running after the site has
// opened, and one whose clock is fast sees it hit zero early.
//
// `open` is the server's own verdict on the wall, taken from the SAME function
// middleware uses. It is not "has the displayed timer expired": if an admin
// force-opens the site early, or the launch instant is moved, the coming-soon
// page follows the wall rather than its own arithmetic.
function payload(displayLaunchAtIso: string) {
  const now = Date.now();
  return NextResponse.json(
    {
      launchAt: displayLaunchAtIso,
      serverNow: new Date(now).toISOString(),
      open: isSiteOpen(now),
    },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } }
  );
}

// Which instant the TIMER shows. The wall's own instant (launchAtIso) always
// wins, so the visible countdown can never promise a different moment from the
// one that actually opens the site. The dashboard's stored 'launch-countdown'
// value is honoured only when no LAUNCH_AT override is in force, which is the
// normal case.
async function displayLaunchAt(): Promise<string> {
  if (process.env.LAUNCH_AT?.trim()) return launchAtIso();
  if (!isDbConfigured()) return launchAtIso();
  try {
    const row = await getSiteContent('launch-countdown');
    const raw = (row?.body ?? '').trim();
    if (!raw) return launchAtIso();
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return launchAtIso();
    return date.toISOString();
  } catch {
    return launchAtIso();
  }
}

export async function GET() {
  return payload(await displayLaunchAt());
}
