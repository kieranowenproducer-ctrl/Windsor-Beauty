import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cronHeartbeat';
import { checkSignupsHaveNotStopped } from '@/lib/signupWatch';
import { runAllChecks, recordResults, recentlyAlertedKeys, sendSentinelEmail } from '@/lib/sentinel';
import { cleanupExpiredTaskMedia } from '@/lib/tasks/cleanup';
import { referralsEnabled, syncPendingMemberReferrals } from '@/lib/memberReferrals';

export const dynamic = 'force-dynamic';
// Five outbound checks with a 15s timeout each (run in parallel) plus DB writes.
export const maxDuration = 60;

// GET /api/cron/sentinel            — daily digest: always emails a full report
// GET /api/cron/sentinel?mode=check — quiet check: emails only when something fails,
//                                     muting repeat alerts for the same check for 6h
//                                     (for an optional more-frequent cron-job.org job).
//
// Scheduled by vercel.json. Protected by CRON_SECRET, same pattern as
// /api/cron/royal-mail-sync: Vercel sends `Authorization: Bearer ${CRON_SECRET}`
// on scheduled invocations once the env var is set.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const mode = new URL(request.url).searchParams.get('mode') === 'check' ? 'check' : 'digest';
  const results = await runAllChecks();
  const failures = results.filter((r) => !r.ok);

  let email: 'sent' | 'skipped' | 'failed' | 'not_needed' = 'not_needed';
  const alertedKeys = new Set<string>();

  if (mode === 'digest') {
    email = await sendSentinelEmail(results, 'digest');
    for (const f of failures) alertedKeys.add(f.key);
  } else if (failures.length > 0) {
    const muted = await recentlyAlertedKeys();
    const fresh = failures.filter((f) => !muted.has(f.key));
    if (fresh.length > 0) {
      email = await sendSentinelEmail(results, 'alert');
      for (const f of fresh) alertedKeys.add(f.key);
    }
  }

  await recordResults(results, alertedKeys).catch(() => undefined);

  // Task media retention rides on the daily digest run (Vercel Hobby cron
  // slots are precious). Deletes expired videos from completed tasks and
  // leaves a text record on each; never affects the health checks.
  let mediaCleanup = null;
  let referralSync: number | null = null;
  if (mode === 'digest') {
    mediaCleanup = await cleanupExpiredTaskMedia().catch(() => null);
    if (referralsEnabled()) {
      referralSync = await syncPendingMemberReferrals().catch(() => null);
    }
  }

  /* Sign-ups going quiet. Windsor Glow has been taking roughly one new account a day since it
   * opened, so a completely silent week is not a quiet spell, it is a symptom. Checked once a day
   * here rather than as its own job, and only ever raised when the drought is genuine. */
  if (mode === 'digest') {
    await checkSignupsHaveNotStopped();
  }

  await recordCronRun('sentinel', failures.length === 0 ? 'all checks healthy' : `${failures.length} check(s) failing`);

  return NextResponse.json({
    mode,
    healthy: failures.length === 0,
    checks: results,
    email,
    mediaCleanup,
    referralSync,
  });
}
