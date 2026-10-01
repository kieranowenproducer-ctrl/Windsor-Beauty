// Concierge data retention. Deletes conversation transcripts older than the
// retention window, and prunes the rate-limit and cache tables.
//
// Keeping every customer conversation forever is a liability with no upside:
// the operational value of a transcript is measured in days, and the privacy
// exposure lasts as long as the row does.
//
// NOT deleted:
//   support_cases    — a record of a request the business has to act on, and
//                      may be obliged to keep. The transcript link is severed
//                      instead, so the case survives without the conversation.
//   concierge_usage  — counts and costs only, no message content, and the
//   concierge_spend    spending ceilings depend on them.
//
// Scheduled by vercel.json. Unlike the read-only sentinel cron this route
// DELETES, so it fails CLOSED: with no CRON_SECRET configured it refuses
// rather than running for anybody who finds the URL.

import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cronHeartbeat';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';
const TENANT = 'windsor-glow';

function retentionDays(): number {
  const v = Number(process.env.CONCIERGE_RETENTION_DAYS);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 90;
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
  if (!process.env.AISUPPORT_DATABASE_URL) {
    return NextResponse.json({ error: 'AISUPPORT_DATABASE_URL is not set.' }, { status: 503 });
  }

  const days = retentionDays();
  const sql = neon(process.env.AISUPPORT_DATABASE_URL);

  try {
    const stale = (await sql`
      SELECT id FROM conversations
      WHERE tenant_id = ${TENANT}
        AND COALESCE(last_at, created_at) < now() - (${days} || ' days')::interval`) as { id: string }[];

    let messagesDeleted = 0;
    if (stale.length) {
      const ids = stale.map((r) => r.id);
      const del = (await sql`
        WITH gone AS (DELETE FROM messages WHERE conversation_id = ANY(${ids}::uuid[]) RETURNING 1)
        SELECT count(*)::int AS n FROM gone`) as { n: number }[];
      messagesDeleted = del[0]?.n ?? 0;
      await sql`UPDATE support_cases SET conversation_id = NULL WHERE conversation_id = ANY(${ids}::uuid[])`;
      await sql`DELETE FROM conversations WHERE id = ANY(${ids}::uuid[])`;
    }

    // Housekeeping on the two tables that grow with traffic rather than with
    // customers. Neither holds message content.
    await sql`DELETE FROM concierge_hits WHERE created_at < now() - interval '2 hours'`;
    const cacheTtl = Number(process.env.CONCIERGE_CACHE_TTL_HOURS) || 24;
    await sql`DELETE FROM concierge_cache
              WHERE tenant_id = ${TENANT} AND created_at < now() - ((${cacheTtl * 7}) || ' hours')::interval`;

    await recordCronRun('concierge-retention', `deleted ${stale.length} conversation(s)`);
    return NextResponse.json({
      ok: true,
      retentionDays: days,
      conversationsDeleted: stale.length,
      messagesDeleted,
    });
  } catch (err) {
    console.error('[cron/concierge-retention]', err instanceof Error ? err.message : err);
    await recordCronRun('concierge-retention', 'failed', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Retention run failed.' }, { status: 500 });
  }
}
