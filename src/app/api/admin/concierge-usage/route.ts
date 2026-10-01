// What the concierge is costing, and who is using it. Admin-cookie gated by
// middleware like every other /api/admin route.
//
// This exists because the platform logged intent, confidence and cost per turn
// and nobody ever read any of it. Numbers nobody looks at are not a control.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { LIMITS, conciergeEnabled } from '@/lib/concierge/governor';
import { TEST_ADDRESS_SQL_PATTERNS } from '@/lib/testAddress';

export const dynamic = 'force-dynamic';
const TENANT = 'windsor-glow';

export async function GET() {
  if (!process.env.AISUPPORT_DATABASE_URL) {
    return NextResponse.json({ error: 'AISUPPORT_DATABASE_URL is not set.' }, { status: 503 });
  }
  const sql = neon(process.env.AISUPPORT_DATABASE_URL);

  try {
    const [totals] = (await sql`
      SELECT
        COALESCE(sum(cost_usd) FILTER (WHERE day = CURRENT_DATE), 0)::float                        AS cost_today,
        COALESCE(sum(cost_usd) FILTER (WHERE day >= date_trunc('month', CURRENT_DATE)), 0)::float  AS cost_month,
        COALESCE(sum(messages) FILTER (WHERE day = CURRENT_DATE), 0)::int                          AS messages_today,
        COALESCE(sum(messages) FILTER (WHERE day >= date_trunc('month', CURRENT_DATE)), 0)::int    AS messages_month
      FROM concierge_spend WHERE tenant_id = ${TENANT}`) as {
      cost_today: number;
      cost_month: number;
      messages_today: number;
      messages_month: number;
    }[];

    const [mix] = (await sql`
      SELECT
        COALESCE(sum(messages), 0)::int      AS messages,
        COALESCE(sum(model_calls), 0)::int   AS model_calls,
        COALESCE(sum(cache_hits), 0)::int    AS cache_hits,
        COALESCE(sum(deterministic), 0)::int AS deterministic,
        COALESCE(sum(tokens_in), 0)::int     AS tokens_in,
        COALESCE(sum(tokens_out), 0)::int    AS tokens_out
      FROM concierge_usage
      WHERE tenant_id = ${TENANT} AND day >= CURRENT_DATE - 29`) as {
      messages: number;
      model_calls: number;
      cache_hits: number;
      deterministic: number;
      tokens_in: number;
      tokens_out: number;
    }[];

    const daily = (await sql`
      SELECT day::text, cost_usd::float, messages
      FROM concierge_spend
      WHERE tenant_id = ${TENANT} AND day >= CURRENT_DATE - 29
      ORDER BY day`) as { day: string; cost_usd: number; messages: number }[];

    // Heaviest accounts this month. Shown by account id, never by email: an
    // admin looking at a usage chart has no need for a customer's address book.
    const heavy = (await sql`
      SELECT actor, sum(messages)::int AS messages, sum(cost_usd)::float AS cost_usd
      FROM concierge_usage
      WHERE tenant_id = ${TENANT} AND day >= date_trunc('month', CURRENT_DATE)
      GROUP BY actor ORDER BY sum(cost_usd) DESC LIMIT 10`) as {
      actor: string;
      messages: number;
      cost_usd: number;
    }[];

    const routes = (await sql`
      SELECT COALESCE(route, 'unknown') AS route, count(*)::int AS n
      FROM messages
      WHERE tenant_id = ${TENANT} AND role = 'assistant' AND created_at > now() - interval '30 days'
      GROUP BY 1 ORDER BY 2 DESC`) as { route: string; n: number }[];

    /* Fixture rows are excluded from every figure on this screen. Historic test rows are still in
     * the table, and counting them is how the panel came to show a permanent red alarm about
     * eleven customers who did not exist. New ones are no longer written at all (see escalate in
     * src/lib/concierge/engine.ts); this filter covers what is already there. */
    const [cases] = (await sql`
      SELECT
        count(*) FILTER (WHERE status = 'open')::int                                AS open,
        count(*) FILTER (WHERE status = 'open' AND notified_at IS NULL)::int         AS open_unnotified,
        count(*) FILTER (WHERE notify_error IS NOT NULL)::int                        AS notify_failures,
        count(*) FILTER (WHERE urgency = 'high' AND status = 'open')::int            AS urgent_open
      FROM support_cases
      WHERE tenant_id = ${TENANT}
        AND contact_email IS NOT NULL
        AND NOT (lower(contact_email) LIKE ANY(${TEST_ADDRESS_SQL_PATTERNS}))`) as {
      open: number;
      open_unnotified: number;
      notify_failures: number;
      urgent_open: number;
    }[];

    const [convo] = (await sql`
      SELECT
        count(*) FILTER (WHERE channel = 'account')::int                                   AS account_conversations,
        count(*) FILTER (WHERE channel = 'account' AND created_at > now() - interval '30 days')::int AS account_last_30
      FROM conversations WHERE tenant_id = ${TENANT}`) as {
      account_conversations: number;
      account_last_30: number;
    }[];

    const [cache] = (await sql`
      SELECT count(*)::int AS entries, COALESCE(sum(hits), 0)::int AS hits
      FROM concierge_cache WHERE tenant_id = ${TENANT}`) as { entries: number; hits: number }[];

    return NextResponse.json({
      enabled: conciergeEnabled(),
      limits: {
        perDay: LIMITS.perDay,
        perMonth: LIMITS.perMonth,
        burstPerTenMin: LIMITS.burstPerTenMin,
        perHour: LIMITS.perHour,
        dailyUsdCap: LIMITS.dailyUsdCap,
        monthlyUsdCap: LIMITS.monthlyUsdCap,
        maxOutputTokens: LIMITS.maxOutputTokens,
        maxMessageChars: LIMITS.maxMessageChars,
      },
      spend: {
        today: totals.cost_today,
        month: totals.cost_month,
        messagesToday: totals.messages_today,
        messagesMonth: totals.messages_month,
        dailyHeadroom: Math.max(0, LIMITS.dailyUsdCap - totals.cost_today),
        monthlyHeadroom: Math.max(0, LIMITS.monthlyUsdCap - totals.cost_month),
      },
      mix,
      daily,
      heavy,
      routes,
      cases,
      conversations: convo,
      cache,
    });
  } catch (err) {
    console.error('[admin/concierge-usage]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not load usage.' }, { status: 500 });
  }
}
