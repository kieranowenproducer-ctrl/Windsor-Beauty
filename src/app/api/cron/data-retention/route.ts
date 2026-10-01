// Data retention for the two logs that hold personal information about members:
// where they came from, and what they asked PEARL.
//
// Kieran's decision, 5 August 2026: keep both for TWO YEARS, not forever. An IP
// address and a research question are both personal information about a real
// person, and the rule is to keep personal information only as long as it is
// genuinely needed. Two years is long enough to see a year-on-year trend and to
// investigate an old fraud; keeping it for life had no upside and real exposure.
//
// Scheduled by vercel.json. Like the concierge retention run this route DELETES,
// so it fails CLOSED: with no CRON_SECRET configured it refuses rather than
// running for anybody who finds the URL.
//
// Both windows are settable without a code change, so the number can be revised
// by whoever owns the decision rather than by whoever owns the repository:
//   IP_RETENTION_DAYS                730
//   RESEARCH_QUESTION_RETENTION_DAYS 730

import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cronHeartbeat';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

const TWO_YEARS = 730;

function windowDays(name: string): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : TWO_YEARS;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured. This route deletes data and will not run unauthenticated.' },
      { status: 503 },
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  }

  const ipDays = windowDays('IP_RETENTION_DAYS');
  const researchDays = windowDays('RESEARCH_QUESTION_RETENTION_DAYS');
  const sql = requireDb();

  try {
    const ipGone = await sql`
      DELETE FROM ip_activity_log
      WHERE created_at < now() - (${ipDays} || ' days')::interval
      RETURNING id
    `;

    /* The research question log is a separate piece of work and may not have
       shipped yet. Its absence is not a failure of this run. */
    let researchDeleted: number | null = null;
    try {
      const researchGone = await sql`
        DELETE FROM research_chat_log
        WHERE created_at < now() - (${researchDays} || ' days')::interval
        RETURNING id
      `;
      researchDeleted = researchGone.length;
    } catch {
      researchDeleted = null;
    }

    /* Visits (task dfe5e9ae) follow the same window as the address log. The
       table only exists once the first visit has been recorded. */
    let visitsDeleted: number | null = null;
    try {
      const visitsGone = await sql`
        DELETE FROM site_visits
        WHERE created_at < now() - (${ipDays} || ' days')::interval
        RETURNING id
      `;
      visitsDeleted = visitsGone.length;
    } catch {
      visitsDeleted = null;
    }

    let interactionsDeleted: number | null = null;
    try {
      const interactionsGone = await sql`
        DELETE FROM site_interactions
        WHERE created_at < now() - (${ipDays} || ' days')::interval
        RETURNING id
      `;
      interactionsDeleted = interactionsGone.length;
    } catch {
      interactionsDeleted = null;
    }

    const summary = `deleted ${ipGone.length} address record(s)`
      + (researchDeleted === null ? '' : `, ${researchDeleted} research question(s)`)
      + (visitsDeleted === null ? '' : `, ${visitsDeleted} visit(s)`)
      + (interactionsDeleted === null ? '' : `, ${interactionsDeleted} interaction(s)`);
    await recordCronRun('data-retention', summary);

    return NextResponse.json({
      ok: true,
      ipRetentionDays: ipDays,
      researchRetentionDays: researchDays,
      ipRecordsDeleted: ipGone.length,
      researchQuestionsDeleted: researchDeleted,
      visitsDeleted,
      interactionsDeleted,
    });
  } catch (err) {
    console.error('[cron/data-retention]', err instanceof Error ? err.message : err);
    await recordCronRun('data-retention', 'failed', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Retention run failed.' }, { status: 500 });
  }
}
