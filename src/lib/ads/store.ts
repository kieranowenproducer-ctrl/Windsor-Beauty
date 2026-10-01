import { isDbConfigured, requireDb } from '@/lib/db/client';
import { normaliseSlot, type CreativeLink } from './labels';

// The advertising memory: reads and writes for the tables in
// src/lib/db/schema-parts/ads.ts. The daily cron writes history in, and the
// Ad Results page, the watchdog and the adviser read it back. Money is minor
// units (pence) throughout, same as the Meta reader.

export interface SnapshotMetricRow {
  date: string; // YYYY-MM-DD
  level: 'account' | 'campaign' | 'ad';
  entityId: string;
  entityName?: string | null;
  status?: string | null;
  objective?: string | null;
  spendMinor: number;
  impressions: number;
  reach: number;
  clicks: number;
  videoViews: number;
  purchases: number;
  purchaseValueMinor: number;
}

export interface SnapshotSliceRow {
  date: string;
  dimension: 'placement' | 'agegender' | 'country';
  label: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
}

// Same self-healing habit as the visit log: the first write after this ships
// runs before the tables exist, so one failure creates the ads tables and
// retries. Deliberately ensureAds alone, not the whole ensureSchema - this
// module should only ever create its own furniture.
async function withEnsure<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    try {
      const { ensureAds } = await import('@/lib/db/schema-parts/ads');
      await ensureAds(requireDb());
      return await work();
    } catch {
      throw err;
    }
  }
}

export async function upsertDailyMetrics(rows: SnapshotMetricRow[]): Promise<number> {
  if (!isDbConfigured() || rows.length === 0) return 0;
  const db = requireDb();
  await withEnsure(async () => {
    for (const r of rows) {
      await db`
        INSERT INTO ad_daily_metrics
          (metric_date, level, entity_id, entity_name, status, objective,
           spend_minor, impressions, reach, clicks, video_views, purchases, purchase_value_minor, captured_at)
        VALUES (${r.date}, ${r.level}, ${r.entityId}, ${r.entityName ?? null}, ${r.status ?? null}, ${r.objective ?? null},
                ${r.spendMinor}, ${r.impressions}, ${r.reach}, ${r.clicks}, ${r.videoViews}, ${r.purchases}, ${r.purchaseValueMinor}, NOW())
        ON CONFLICT (metric_date, level, entity_id) DO UPDATE SET
          entity_name = EXCLUDED.entity_name,
          status = EXCLUDED.status,
          objective = EXCLUDED.objective,
          spend_minor = EXCLUDED.spend_minor,
          impressions = EXCLUDED.impressions,
          reach = EXCLUDED.reach,
          clicks = EXCLUDED.clicks,
          video_views = EXCLUDED.video_views,
          purchases = EXCLUDED.purchases,
          purchase_value_minor = EXCLUDED.purchase_value_minor,
          captured_at = NOW()
      `;
    }
  });
  return rows.length;
}

export async function upsertDailySlices(rows: SnapshotSliceRow[]): Promise<number> {
  if (!isDbConfigured() || rows.length === 0) return 0;
  const db = requireDb();
  await withEnsure(async () => {
    for (const r of rows) {
      await db`
        INSERT INTO ad_daily_slices (metric_date, dimension, label, spend_minor, impressions, clicks)
        VALUES (${r.date}, ${r.dimension}, ${r.label}, ${r.spendMinor}, ${r.impressions}, ${r.clicks})
        ON CONFLICT (metric_date, dimension, label) DO UPDATE SET
          spend_minor = EXCLUDED.spend_minor,
          impressions = EXCLUDED.impressions,
          clicks = EXCLUDED.clicks
      `;
    }
  });
  return rows.length;
}

export interface HistoryRow {
  metric_date: string;
  entity_id: string;
  entity_name: string | null;
  status: string | null;
  objective: string | null;
  spend_minor: number;
  impressions: number;
  reach: number;
  clicks: number;
  video_views: number;
  purchases: number;
  purchase_value_minor: number;
}

export async function readHistory(level: 'account' | 'campaign' | 'ad', days: number): Promise<HistoryRow[]> {
  if (!isDbConfigured()) return [];
  const db = requireDb();
  try {
    const rows = await db`
      SELECT metric_date::text, entity_id, entity_name, status, objective,
             spend_minor::bigint, impressions::bigint, reach::bigint, clicks::bigint,
             video_views::bigint, purchases::int, purchase_value_minor::bigint
      FROM ad_daily_metrics
      WHERE level = ${level} AND metric_date >= CURRENT_DATE - ${days}::int
      ORDER BY metric_date ASC
    `;
    return (rows as HistoryRow[]).map((r) => ({
      ...r,
      spend_minor: Number(r.spend_minor), impressions: Number(r.impressions),
      reach: Number(r.reach), clicks: Number(r.clicks), video_views: Number(r.video_views),
      purchases: Number(r.purchases), purchase_value_minor: Number(r.purchase_value_minor),
    }));
  } catch {
    return [];
  }
}

export interface SliceHistoryRow {
  dimension: string;
  label: string;
  spend_minor: number;
  impressions: number;
  clicks: number;
}

export async function readSliceHistory(days: number): Promise<SliceHistoryRow[]> {
  if (!isDbConfigured()) return [];
  const db = requireDb();
  try {
    const rows = await db`
      SELECT dimension, label,
             SUM(spend_minor)::bigint AS spend_minor,
             SUM(impressions)::bigint AS impressions,
             SUM(clicks)::bigint AS clicks
      FROM ad_daily_slices
      WHERE metric_date >= CURRENT_DATE - ${days}::int
      GROUP BY dimension, label
    `;
    return (rows as SliceHistoryRow[]).map((r) => ({
      ...r,
      spend_minor: Number(r.spend_minor), impressions: Number(r.impressions), clicks: Number(r.clicks),
    }));
  } catch {
    return [];
  }
}

/* ── Watchdog memory ─────────────────────────────────────────────────────── */

export async function recentAlertKeys(withinDays: number): Promise<Set<string>> {
  if (!isDbConfigured()) return new Set();
  const db = requireDb();
  try {
    const rows = await db`
      SELECT DISTINCT alert_key FROM ad_alert_log
      WHERE created_at >= NOW() - (${withinDays} || ' days')::interval
    `;
    return new Set((rows as { alert_key: string }[]).map((r) => r.alert_key));
  } catch {
    return new Set();
  }
}

export async function recordAlerts(alerts: { key: string; message: string }[]): Promise<void> {
  if (!isDbConfigured() || alerts.length === 0) return;
  const db = requireDb();
  await withEnsure(async () => {
    for (const a of alerts) {
      await db`INSERT INTO ad_alert_log (alert_key, message) VALUES (${a.key}, ${a.message})`;
    }
  });
}

/* ── Which film ran in which ad ──────────────────────────────────────────── */

// One row per ad a person has said something about: which film it used, what
// it is testing, and whether it is "A" or "B" in the current experiment. See
// src/lib/ads/labels.ts for how those become the name shown on screen.
export async function getCreativeLinks(): Promise<Record<string, CreativeLink>> {
  if (!isDbConfigured()) return {};
  const db = requireDb();
  try {
    // withEnsure so a table created before the two newer columns existed is
    // upgraded on the first read rather than silently answering with nothing.
    const rows = await withEnsure(() => db`
      SELECT ad_id, ad_name, creative_label, experiment_note, slot, hidden_at FROM ad_creative_links
    `);
    const out: Record<string, CreativeLink> = {};
    for (const r of rows as { ad_id: string; ad_name: string | null; creative_label: string; experiment_note: string | null; slot: string | null; hidden_at: string | null }[]) {
      out[r.ad_id] = { adName: r.ad_name, label: r.creative_label ?? '', note: r.experiment_note, slot: normaliseSlot(r.slot), hidden: Boolean(r.hidden_at) };
    }
    return out;
  } catch {
    return {};
  }
}

export interface CreativeLinkInput {
  label?: string | null;
  note?: string | null;
  slot?: string | null;
}

// Every save carries all three values, so the row is always the whole truth.
// When all three are empty the row goes, which is what "clear it" means.
export async function setCreativeLink(adId: string, adName: string | null, input: CreativeLinkInput): Promise<void> {
  if (!isDbConfigured()) return;
  const db = requireDb();
  const label = (input.label ?? '').trim().slice(0, 200);
  const note = (input.note ?? '').trim().slice(0, 200);
  const slot = normaliseSlot(input.slot);
  await withEnsure(async () => {
    // One ad per letter: giving this ad "C" takes "C" off whichever ad had it.
    if (slot) {
      await db`UPDATE ad_creative_links SET slot = NULL, updated_at = NOW() WHERE slot = ${slot} AND ad_id <> ${adId}`;
    }
    const existing = await db`SELECT hidden_at FROM ad_creative_links WHERE ad_id = ${adId} LIMIT 1`;
    const hidden = Boolean((existing as { hidden_at: string | null }[])[0]?.hidden_at);
    if (!label && !note && !slot && !hidden) {
      await db`DELETE FROM ad_creative_links WHERE ad_id = ${adId}`;
    } else {
      await db`
        INSERT INTO ad_creative_links (ad_id, ad_name, creative_label, experiment_note, slot, updated_at)
        VALUES (${adId}, ${adName}, ${label}, ${note || null}, ${slot}, NOW())
        ON CONFLICT (ad_id) DO UPDATE SET
          ad_name = EXCLUDED.ad_name, creative_label = EXCLUDED.creative_label,
          experiment_note = EXCLUDED.experiment_note, slot = EXCLUDED.slot, updated_at = NOW()
      `;
    }
  });
}

/** Hide or restore one ad in this panel without changing anything in Meta. */
export async function setAdHidden(adId: string, adName: string | null, hidden: boolean): Promise<void> {
  if (!isDbConfigured()) return;
  const db = requireDb();
  await withEnsure(async () => {
    await db`
      INSERT INTO ad_creative_links (ad_id, ad_name, creative_label, hidden_at, updated_at)
      VALUES (${adId}, ${adName}, '', ${hidden ? new Date().toISOString() : null}, NOW())
      ON CONFLICT (ad_id) DO UPDATE SET
        ad_name = COALESCE(EXCLUDED.ad_name, ad_creative_links.ad_name),
        hidden_at = EXCLUDED.hidden_at,
        updated_at = NOW()
    `;
    await db`
      DELETE FROM ad_creative_links
      WHERE ad_id = ${adId} AND hidden_at IS NULL
        AND creative_label = '' AND experiment_note IS NULL AND slot IS NULL
    `;
  });
}

/* ── Advice memory ───────────────────────────────────────────────────────── */

export interface AdviceRecord {
  advice: string;
  model: string | null;
  created_at: string;
}

export async function saveAdvice(params: { signals: unknown; advice: string; model: string; costMinor: number }): Promise<void> {
  if (!isDbConfigured()) return;
  const db = requireDb();
  await withEnsure(async () => {
    await db`
      INSERT INTO ad_advice (signals, advice, model, cost_minor)
      VALUES (${JSON.stringify(params.signals)}::jsonb, ${params.advice}, ${params.model}, ${params.costMinor})
    `;
  });
}

export async function latestAdvice(): Promise<AdviceRecord | null> {
  if (!isDbConfigured()) return null;
  const db = requireDb();
  try {
    const rows = await db`
      SELECT advice, model, created_at::text FROM ad_advice ORDER BY created_at DESC LIMIT 1
    `;
    return (rows as AdviceRecord[])[0] ?? null;
  } catch {
    return null;
  }
}

export async function adviceSpentTodayMinor(): Promise<number> {
  if (!isDbConfigured()) return 0;
  const db = requireDb();
  try {
    const rows = await db`
      SELECT COALESCE(SUM(cost_minor), 0)::int AS spent FROM ad_advice
      WHERE created_at >= CURRENT_DATE
    `;
    return Number((rows as { spent: number }[])[0]?.spent ?? 0);
  } catch {
    return 0;
  }
}

/* ── Our own till: what each campaign link actually brought ──────────────── */
//
// The site already records every visit with its link tags (site_visits) and
// every order against the address that placed it (ip_activity_log). Joining
// them answers "which campaign brought this order" from our own records, with
// no reliance on Meta's tracking. Last touch wins: an order is credited to the
// most recent tagged arrival from that address before the order. An address is
// a household, not a person, so this is a fair guide rather than a proof - the
// screen says so.

const REVENUE_STATUSES = ['paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered'];

export interface CampaignTillRow {
  utm_campaign: string;
  visits: number;
  people: number;
  orders: number;
  revenue_minor: number;
}

export async function campaignTill(days: number): Promise<CampaignTillRow[]> {
  if (!isDbConfigured()) return [];
  const db = requireDb();
  try {
    const rows = await db`
      WITH tagged_visits AS (
        SELECT utm_campaign, ip_address, created_at
        FROM site_visits
        WHERE utm_campaign IS NOT NULL AND ip_address IS NOT NULL
          AND created_at >= NOW() - (${days} || ' days')::interval
      ),
      visit_counts AS (
        SELECT utm_campaign,
               COUNT(*)::int AS visits,
               COUNT(DISTINCT ip_address)::int AS people
        FROM tagged_visits
        GROUP BY utm_campaign
      ),
      order_events AS (
        SELECT a.id, a.ip_address, a.created_at,
               substring(a.detail from 'Order ([A-Z0-9-]+)') AS order_number
        FROM ip_activity_log a
        WHERE a.event = 'order'
          AND a.created_at >= NOW() - (${days} || ' days')::interval
      ),
      credited AS (
        SELECT DISTINCT ON (e.id) e.id, e.order_number, v.utm_campaign
        FROM order_events e
        JOIN tagged_visits v
          ON v.ip_address = e.ip_address AND v.created_at <= e.created_at
        ORDER BY e.id, v.created_at DESC
      )
      SELECT vc.utm_campaign, vc.visits, vc.people,
             COALESCE(c.orders, 0)::int AS orders,
             COALESCE(c.revenue_minor, 0)::bigint AS revenue_minor
      FROM visit_counts vc
      LEFT JOIN (
        SELECT cr.utm_campaign,
               COUNT(DISTINCT cr.order_number)::int AS orders,
               ROUND(SUM(o.total) * 100)::bigint AS revenue_minor
        FROM credited cr
        JOIN orders o ON o.order_number = cr.order_number
        WHERE o.status = ANY(${REVENUE_STATUSES})
        GROUP BY cr.utm_campaign
      ) c ON c.utm_campaign = vc.utm_campaign
      ORDER BY COALESCE(c.revenue_minor, 0) DESC, vc.visits DESC
    `;
    return (rows as CampaignTillRow[]).map((r) => ({
      ...r,
      visits: Number(r.visits), people: Number(r.people),
      orders: Number(r.orders), revenue_minor: Number(r.revenue_minor),
    }));
  } catch {
    return [];
  }
}

/* ── The same till, in day or hour buckets, for the comparison chart ─────── */

export interface TillBucketRow {
  /** 'YYYY-MM-DD' or 'YYYY-MM-DD HH' in London time. */
  bucket: string;
  utm_campaign: string;
  orders: number;
}

// Same last-touch crediting as campaignTill(), but each order lands in the
// bucket of the moment it was placed. Tagged visits are read from 30 days
// before the window so an order early in the window can still be credited
// to the visit that brought it.
export async function campaignTillBuckets(since: string, granularity: 'hour' | 'day'): Promise<TillBucketRow[]> {
  if (!isDbConfigured()) return [];
  const db = requireDb();
  const fmt = granularity === 'hour' ? 'YYYY-MM-DD HH24' : 'YYYY-MM-DD';
  try {
    const rows = await db`
      WITH tagged_visits AS (
        SELECT utm_campaign, ip_address, created_at
        FROM site_visits
        WHERE utm_campaign IS NOT NULL AND ip_address IS NOT NULL
          AND created_at >= (${since}::date - interval '30 days')
      ),
      order_events AS (
        SELECT a.id, a.ip_address, a.created_at,
               substring(a.detail from 'Order ([A-Z0-9-]+)') AS order_number
        FROM ip_activity_log a
        WHERE a.event = 'order'
          AND a.created_at >= (${since}::date - interval '1 day')
      ),
      credited AS (
        SELECT DISTINCT ON (e.id) e.id, e.order_number, e.created_at, v.utm_campaign
        FROM order_events e
        JOIN tagged_visits v
          ON v.ip_address = e.ip_address AND v.created_at <= e.created_at
        ORDER BY e.id, v.created_at DESC
      )
      SELECT to_char(cr.created_at AT TIME ZONE 'Europe/London', ${fmt}) AS bucket,
             cr.utm_campaign,
             COUNT(DISTINCT cr.order_number)::int AS orders
      FROM credited cr
      JOIN orders o ON o.order_number = cr.order_number
      WHERE o.status = ANY(${REVENUE_STATUSES})
      GROUP BY 1, 2
    `;
    return (rows as TillBucketRow[]).map((r) => ({ ...r, orders: Number(r.orders) }));
  } catch {
    return [];
  }
}

/* ── Who counts as ad traffic ─────────────────────────────────── */

/**
 * Which visitors the after-the-click reports count (ADSLAB item 15).
 *
 * `new` leaves out anybody who was ALREADY a member when they arrived, which is
 * what Kieran asked for on 5 Sept 2026 and the honest version of it. Two things
 * make somebody "already a member":
 *
 *   1. they were signed in when the page loaded (the `signed_in` flag on the visit), and
 *   2. somebody at that address had signed in or registered before this visit
 *      (`ip_activity_log`), which is how the rule reaches back over visits
 *      recorded before the signed-in flag existed.
 *
 * What it deliberately does NOT do is drop people because they are members
 * TODAY. A stranger who clicks the ad, signs up and orders is the ad working,
 * and dropping that person would delete the only result worth paying for. The
 * judgement is made at the moment of the visit, never afterwards.
 *
 * `all` counts everybody, so the two numbers can always be compared.
 */
export type VisitorScope = 'new' | 'all';

// HOW THE SIGNED-IN FLAG IS READ, AND WHY IT LOOKS ODD.
//
//   COALESCE((to_jsonb(v) ->> 'signed_in')::boolean, false)
//
// rather than plain `v.signed_in`. The column is added to site_visits by the
// schema, but a report must never depend on having got there first: naming a
// column that does not exist yet fails the whole query, and this report would
// then answer "no arrivals recorded", which is a lie that reads like data loss.
// Turning the row into JSON asks for the value by name, so a database that has
// not been migrated yet answers null, every visit counts as a stranger, and the
// figures are simply the ones we had before the flag existed. It costs a row to
// JSON per visit on an admin page that reads a few hundred, which is nothing.
//
// The predicate is written inline in each query below, because the Neon driver
// parameterises values, not fragments of SQL. It is the same three lines every
// time and is always driven by the boolean parameter, so `all` is a single
// `true` rather than a second code path:
//
//   (NOT ${newOnly}::boolean OR (COALESCE((to_jsonb(v) ->> 'signed_in')::boolean, false) = false AND NOT EXISTS (...)))


/* ── What happened after the click, from our own records ─────────────────── */

export interface FunnelRow {
  utm_campaign: string;
  /** Tagged page views, and how many were the first page of a visit. */
  visits: number;
  landed: number;
  /** Different addresses that arrived on a tagged link. */
  people: number;
  /** Of those addresses, how many went on to open a product page, the basket, the checkout. */
  product_people: number;
  basket_people: number;
  checkout_people: number;
  orders: number;
  revenue_minor: number;
}

// The funnel behind campaignTill(): the same tagged arrivals and the same
// last-touch order crediting, plus what each arriving address did in the
// seven days after it first arrived. Counted in people (addresses), not page
// views, so each step can only be smaller than the one before it. An address
// is a household, not a person, so this is a fair guide rather than a proof.
export async function adFunnel(days: number, scope: VisitorScope = 'all'): Promise<FunnelRow[]> {
  if (!isDbConfigured()) return [];
  const db = requireDb();
  const newOnly = scope === 'new';
  try {
    const rows = await db`
      WITH tagged_visits AS (
        SELECT v.utm_campaign, v.ip_address, v.landing, v.created_at
        FROM site_visits v
        WHERE v.utm_campaign IS NOT NULL AND v.ip_address IS NOT NULL
          AND v.created_at >= NOW() - (${days} || ' days')::interval
          AND (NOT ${newOnly}::boolean OR (
            COALESCE((to_jsonb(v) ->> 'signed_in')::boolean, false) = false
            AND NOT EXISTS (
              SELECT 1 FROM ip_activity_log m
              WHERE m.ip_address = v.ip_address AND m.customer_id IS NOT NULL
                AND m.event IN ('sign_in', 'register') AND m.created_at < v.created_at
            )
          ))
      ),
      arrivals AS (
        SELECT utm_campaign, ip_address, MIN(created_at) AS first_seen
        FROM tagged_visits
        GROUP BY utm_campaign, ip_address
      ),
      counts AS (
        SELECT utm_campaign,
               COUNT(*)::int AS visits,
               COUNT(*) FILTER (WHERE landing)::int AS landed,
               COUNT(DISTINCT ip_address)::int AS people
        FROM tagged_visits
        GROUP BY utm_campaign
      ),
      afterwards AS (
        SELECT a.utm_campaign, a.ip_address, v.path
        FROM arrivals a
        JOIN site_visits v
          ON v.ip_address = a.ip_address
         AND v.created_at >= a.first_seen
         AND v.created_at <= a.first_seen + interval '7 days'
      ),
      steps AS (
        SELECT utm_campaign,
               COUNT(DISTINCT ip_address) FILTER (WHERE path LIKE '/shop/%')::int AS product_people,
               COUNT(DISTINCT ip_address) FILTER (WHERE path = '/cart')::int AS basket_people,
               COUNT(DISTINCT ip_address) FILTER (WHERE path LIKE '/checkout%' AND path <> '/checkout/success')::int AS checkout_people
        FROM afterwards
        GROUP BY utm_campaign
      ),
      order_events AS (
        SELECT a.id, a.ip_address, a.created_at,
               substring(a.detail from 'Order ([A-Z0-9-]+)') AS order_number
        FROM ip_activity_log a
        WHERE a.event = 'order'
          AND a.created_at >= NOW() - (${days} || ' days')::interval
      ),
      credited AS (
        SELECT DISTINCT ON (e.id) e.id, e.order_number, v.utm_campaign
        FROM order_events e
        JOIN tagged_visits v
          ON v.ip_address = e.ip_address AND v.created_at <= e.created_at
        ORDER BY e.id, v.created_at DESC
      ),
      sales AS (
        SELECT cr.utm_campaign,
               COUNT(DISTINCT cr.order_number)::int AS orders,
               ROUND(SUM(o.total) * 100)::bigint AS revenue_minor
        FROM credited cr
        JOIN orders o ON o.order_number = cr.order_number
        WHERE o.status = ANY(${REVENUE_STATUSES})
        GROUP BY cr.utm_campaign
      )
      SELECT c.utm_campaign, c.visits, c.landed, c.people,
             COALESCE(s.product_people, 0)::int AS product_people,
             COALESCE(s.basket_people, 0)::int AS basket_people,
             COALESCE(s.checkout_people, 0)::int AS checkout_people,
             COALESCE(sa.orders, 0)::int AS orders,
             COALESCE(sa.revenue_minor, 0)::bigint AS revenue_minor
      FROM counts c
      LEFT JOIN steps s ON s.utm_campaign = c.utm_campaign
      LEFT JOIN sales sa ON sa.utm_campaign = c.utm_campaign
      ORDER BY c.people DESC
    `;
    return (rows as FunnelRow[]).map((r) => ({
      ...r,
      visits: Number(r.visits), landed: Number(r.landed), people: Number(r.people),
      product_people: Number(r.product_people), basket_people: Number(r.basket_people),
      checkout_people: Number(r.checkout_people), orders: Number(r.orders), revenue_minor: Number(r.revenue_minor),
    }));
  } catch {
    return [];
  }
}

/* ── The real average order, for break-even arithmetic ───────────────────── */

export interface OrderStats {
  /** Orders with money behind them in the window. */
  count: number;
  /** Average order total in minor units, or null when there are too few to average. */
  averageMinor: number | null;
  days: number;
}

export const MIN_ORDERS_TO_AVERAGE = 5;

// Paid, dispatched and delivered orders only, the same statuses the till uses.
// Fewer than five and the average is not offered, because one big order would
// set the break-even line on its own.
export async function orderStats(days: number): Promise<OrderStats> {
  if (!isDbConfigured()) return { count: 0, averageMinor: null, days };
  const db = requireDb();
  try {
    const rows = await db`
      SELECT COUNT(*)::int AS count, ROUND(AVG(total) * 100)::bigint AS average_minor
      FROM orders
      WHERE status = ANY(${REVENUE_STATUSES})
        AND created_at >= NOW() - (${days} || ' days')::interval
    `;
    const r = (rows as { count: number; average_minor: number | null }[])[0];
    const count = Number(r?.count ?? 0);
    return { count, averageMinor: count >= MIN_ORDERS_TO_AVERAGE && r?.average_minor != null ? Number(r.average_minor) : null, days };
  } catch {
    return { count: 0, averageMinor: null, days };
  }
}

/* ── Where the ads sent people, and how those pages did ──────────────────── */

export interface TaggedLandingRow {
  utm_campaign: string;
  path: string;
  landings: number;
  people: number;
}

export interface PagePerformanceRow {
  path: string;
  /** Everyone who landed on this page in the window, from any source. */
  landings: number;
  people: number;
  /** Of those addresses, how many opened a product page within a week, and how many ordered. */
  product_people: number;
  order_people: number;
}

export interface LandingReport {
  tagged: TaggedLandingRow[];
  pages: PagePerformanceRow[];
  /** Which visitors these figures counted. */
  scope: VisitorScope;
  /** Every first-page arrival in the window, before any filtering. */
  totalLandings: number;
  /**
   * How many of those were people who already had an account when they arrived.
   * Shown on the page whichever way the switch is set, so a filtered number is
   * never a number with something quietly missing from it.
   */
  memberLandings: number;
}

// The page each tagged arrival landed on (per campaign tag), and how each
// landing page performs for everyone, not just ad traffic, so an ad pointed at
// a weak page shows as such. Counted by address, as everywhere else here.
export async function landingReport(days: number, scope: VisitorScope = 'all'): Promise<LandingReport> {
  const empty: LandingReport = { tagged: [], pages: [], scope, totalLandings: 0, memberLandings: 0 };
  if (!isDbConfigured()) return empty;
  const db = requireDb();
  const newOnly = scope === 'new';
  try {
    const tagged = await db`
      SELECT v.utm_campaign, v.path, COUNT(*)::int AS landings, COUNT(DISTINCT v.ip_address)::int AS people
      FROM site_visits v
      WHERE v.landing AND v.utm_campaign IS NOT NULL AND v.ip_address IS NOT NULL
        AND v.created_at >= NOW() - (${days} || ' days')::interval
        AND (NOT ${newOnly}::boolean OR (
          COALESCE((to_jsonb(v) ->> 'signed_in')::boolean, false) = false
          AND NOT EXISTS (
            SELECT 1 FROM ip_activity_log m
            WHERE m.ip_address = v.ip_address AND m.customer_id IS NOT NULL
              AND m.event IN ('sign_in', 'register') AND m.created_at < v.created_at
          )
        ))
      GROUP BY v.utm_campaign, v.path
      ORDER BY landings DESC
    `;
    const pages = await db`
      WITH landings AS (
        SELECT v.path, v.ip_address, v.created_at
        FROM site_visits v
        WHERE v.landing AND v.ip_address IS NOT NULL
          AND v.created_at >= NOW() - (${days} || ' days')::interval
          AND (NOT ${newOnly}::boolean OR (
            COALESCE((to_jsonb(v) ->> 'signed_in')::boolean, false) = false
            AND NOT EXISTS (
              SELECT 1 FROM ip_activity_log m
              WHERE m.ip_address = v.ip_address AND m.customer_id IS NOT NULL
                AND m.event IN ('sign_in', 'register') AND m.created_at < v.created_at
            )
          ))
      )
      SELECT l.path,
             COUNT(*)::int AS landings,
             COUNT(DISTINCT l.ip_address)::int AS people,
             COUNT(DISTINCT l.ip_address) FILTER (WHERE EXISTS (
               SELECT 1 FROM site_visits v
               WHERE v.ip_address = l.ip_address AND v.path LIKE '/shop/%'
                 AND v.created_at >= l.created_at AND v.created_at <= l.created_at + interval '7 days'
             ))::int AS product_people,
             COUNT(DISTINCT l.ip_address) FILTER (WHERE EXISTS (
               SELECT 1 FROM ip_activity_log a
               JOIN orders o ON o.order_number = substring(a.detail from 'Order ([A-Z0-9-]+)')
               WHERE a.event = 'order' AND a.ip_address = l.ip_address
                 AND a.created_at >= l.created_at AND a.created_at <= l.created_at + interval '7 days'
                 AND o.status = ANY(${REVENUE_STATUSES})
             ))::int AS order_people
      FROM landings l
      GROUP BY l.path
      ORDER BY landings DESC
      LIMIT 12
    `;
    // Counted whichever way the switch is set, so the page can always say how
    // many arrivals were existing members rather than hiding the difference.
    const split = await db`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE
               COALESCE((to_jsonb(v) ->> 'signed_in')::boolean, false) = true
               OR EXISTS (
                 SELECT 1 FROM ip_activity_log m
                 WHERE m.ip_address = v.ip_address AND m.customer_id IS NOT NULL
                   AND m.event IN ('sign_in', 'register') AND m.created_at < v.created_at
               )
             )::int AS members
      FROM site_visits v
      WHERE v.landing AND v.ip_address IS NOT NULL
        AND v.created_at >= NOW() - (${days} || ' days')::interval
    `;
    const counts = (split as { total: number; members: number }[])[0];
    return {
      scope,
      totalLandings: Number(counts?.total ?? 0),
      memberLandings: Number(counts?.members ?? 0),
      tagged: (tagged as TaggedLandingRow[]).map((r) => ({
        utm_campaign: r.utm_campaign, path: r.path, landings: Number(r.landings), people: Number(r.people),
      })),
      pages: (pages as PagePerformanceRow[]).map((r) => ({
        path: r.path, landings: Number(r.landings), people: Number(r.people),
        product_people: Number(r.product_people), order_people: Number(r.order_people),
      })),
    };
  } catch {
    return empty;
  }
}
