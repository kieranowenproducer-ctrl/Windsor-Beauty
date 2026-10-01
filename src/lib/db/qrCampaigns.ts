import { requireDb } from './client';
import { isBotUserAgent } from '@/lib/analytics/botDetection';
// Extracted verbatim from db.ts on 2026-08-11 (Phase 2 of "thin it out").
// Everything here is re-exported from '@/lib/db', so no call site changed.

// ─── QR Campaign Tracking ─────────────────────────────────────────────────────

export interface QrCampaignRow {
  id: number;
  name: string;
  slug: string;
  status: 'active' | 'paused' | 'archived';
  partner_name: string | null;
  campaign_type: string | null;
  destination_url: string;
  discount_code: string | null;
  notes: string | null;
  start_date: string | null;
  end_date: string | null;
  bespoke_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface QrCampaignStats {
  campaign_id: number;
  /** People only. Link previews and robots are excluded (task 522d09f1). */
  total_scans: number;
  /** How many were left out of the figure above, so it can always be checked. */
  bot_scans: number;
  unique_visitors: number;
  total_signups: number;
  total_orders: number;
  total_revenue: number;
  conversion_rate: number;
  avg_order_value: number;
  revenue_per_scan: number;
  revenue_per_signup: number;
  avg_customer_ltv: number;
  repeat_purchase_rate: number;
}

export interface QrCampaignMember {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  order_count: number;
  lifetime_spend: number;
  last_order_at: string | null;
}

export interface QrCampaignGuestBuyer {
  email: string;
  customer_name: string;
  order_count: number;
  total_spend: number;
  first_order_at: string;
  last_order_at: string;
}

export async function listQrCampaignMembers(campaignId: number): Promise<QrCampaignMember[]> {
  const db = requireDb();
  const PAID = ['paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered'];
  const rows = await db`
    SELECT
      c.id, c.first_name, c.last_name, c.email, c.phone, c.created_at,
      COUNT(o.id) FILTER (WHERE o.status = ANY(${PAID}::text[]))::int AS order_count,
      COALESCE(SUM(o.total) FILTER (WHERE o.status = ANY(${PAID}::text[])), 0)::float AS lifetime_spend,
      MAX(o.created_at) FILTER (WHERE o.status = ANY(${PAID}::text[])) AS last_order_at
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
      OR (o.customer_id IS NULL AND lower(o.email) = lower(c.email))
    WHERE c.qr_campaign_id = ${campaignId}
    GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone, c.created_at
    ORDER BY lifetime_spend DESC
  `;
  return rows as QrCampaignMember[];
}

export async function listQrCampaignGuestBuyers(campaignId: number): Promise<QrCampaignGuestBuyer[]> {
  const db = requireDb();
  const rows = await db`
    SELECT
      lower(email) AS email,
      MAX(customer_name) AS customer_name,
      COUNT(*)::int AS order_count,
      COALESCE(SUM(total), 0)::float AS total_spend,
      MIN(created_at)::text AS first_order_at,
      MAX(created_at)::text AS last_order_at
    FROM orders
    WHERE qr_campaign_id = ${campaignId}
      AND customer_id IS NULL
      AND status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered')
    GROUP BY lower(email)
    ORDER BY total_spend DESC
  `;
  return rows as QrCampaignGuestBuyer[];
}

export async function listQrCampaigns(): Promise<QrCampaignRow[]> {
  const db = requireDb();
  const rows = await db`SELECT * FROM qr_campaigns ORDER BY created_at DESC`;
  return rows as QrCampaignRow[];
}

export async function getQrCampaignById(id: number): Promise<QrCampaignRow | null> {
  const db = requireDb();
  const rows = await db`SELECT * FROM qr_campaigns WHERE id = ${id} LIMIT 1`;
  return (rows[0] as QrCampaignRow) ?? null;
}

export async function getQrCampaignBySlug(slug: string): Promise<QrCampaignRow | null> {
  const db = requireDb();
  const rows = await db`SELECT * FROM qr_campaigns WHERE slug = ${slug} LIMIT 1`;
  return (rows[0] as QrCampaignRow) ?? null;
}

export async function createQrCampaign(params: {
  name: string;
  slug: string;
  status?: 'active' | 'paused' | 'archived';
  partnerName?: string | null;
  campaignType?: string | null;
  destinationUrl: string;
  discountCode?: string | null;
  notes?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  bespokeTitle?: string | null;
}): Promise<QrCampaignRow | null> {
  const db = requireDb();
  const rows = await db`
    INSERT INTO qr_campaigns (name, slug, status, partner_name, campaign_type, destination_url, discount_code, notes, start_date, end_date, bespoke_title)
    VALUES (
      ${params.name}, ${params.slug}, ${params.status ?? 'active'},
      ${params.partnerName ?? null}, ${params.campaignType ?? null},
      ${params.destinationUrl}, ${params.discountCode ?? null},
      ${params.notes ?? null}, ${params.startDate ?? null}, ${params.endDate ?? null},
      ${params.bespokeTitle ?? null}
    )
    RETURNING *
  `;
  return (rows[0] as QrCampaignRow) ?? null;
}

export async function updateQrCampaign(id: number, params: {
  name: string;
  status: 'active' | 'paused' | 'archived';
  partnerName: string | null;
  campaignType: string | null;
  destinationUrl: string;
  discountCode: string | null;
  notes: string | null;
  startDate: string | null;
  endDate: string | null;
  bespokeTitle: string | null;
}): Promise<QrCampaignRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE qr_campaigns SET
      name = ${params.name},
      status = ${params.status},
      partner_name = ${params.partnerName},
      campaign_type = ${params.campaignType},
      destination_url = ${params.destinationUrl},
      discount_code = ${params.discountCode},
      notes = ${params.notes},
      start_date = ${params.startDate},
      end_date = ${params.endDate},
      bespoke_title = ${params.bespokeTitle},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as QrCampaignRow) ?? null;
}

export async function deleteQrCampaign(id: number): Promise<boolean> {
  const db = requireDb();
  const rows = await db`DELETE FROM qr_campaigns WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function resetQrCampaignScans(id: number): Promise<number> {
  const db = requireDb();
  const rows = await db`DELETE FROM qr_campaign_scans WHERE campaign_id = ${id} RETURNING id`;
  return rows.length;
}

export async function recordCampaignScan(params: {
  campaignId: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  wgVid?: string | null;
  isNewVisitor?: boolean;
}): Promise<void> {
  const db = requireDb();
  // Recorded either way, counted only if it was a person. See botDetection.ts for why.
  const isBot = isBotUserAgent(params.userAgent);
  await db`
    INSERT INTO qr_campaign_scans (campaign_id, ip_address, user_agent, wg_vid, is_new_visitor, is_bot)
    VALUES (${params.campaignId}, ${params.ipAddress ?? null}, ${params.userAgent ?? null}, ${params.wgVid ?? null}, ${params.isNewVisitor ?? false}, ${isBot})
  `;
}

export async function getQrCampaignStats(campaignId: number): Promise<QrCampaignStats> {
  const db = requireDb();
  const [scanRow] = await db`
    SELECT
      ${campaignId}::int AS campaign_id,
      COUNT(*) FILTER (WHERE NOT is_bot)::int AS total_scans,
      COUNT(*) FILTER (WHERE is_bot)::int AS bot_scans,
      COUNT(DISTINCT wg_vid) FILTER (WHERE wg_vid IS NOT NULL AND NOT is_bot)::int AS unique_visitors
    FROM qr_campaign_scans
    WHERE campaign_id = ${campaignId}
  `;
  const [orderRow] = await db`
    SELECT
      COUNT(*)::int AS total_orders,
      COALESCE(SUM(total)::numeric, 0) AS total_revenue
    FROM orders
    WHERE qr_campaign_id = ${campaignId}
      AND status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered')
  `;
  // Signup + LTV metrics: attributed customers and their full order history
  const [signupRow] = await db`
    SELECT
      COUNT(c.id)::int AS total_signups,
      COALESCE(AVG(customer_spend.lifetime_spend), 0)::float AS avg_customer_ltv,
      CASE WHEN COUNT(c.id) > 0
        THEN (COUNT(c.id) FILTER (WHERE customer_spend.order_count > 1)::float / COUNT(c.id) * 100)
        ELSE 0
      END AS repeat_purchase_rate
    FROM customers c
    LEFT JOIN (
      SELECT
        COALESCE(o.customer_id, c2.id) AS cid,
        COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered')), 0)::float AS lifetime_spend,
        COUNT(o.id) FILTER (WHERE o.status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered'))::int AS order_count
      FROM customers c2
      LEFT JOIN orders o ON o.customer_id = c2.id
        OR (o.customer_id IS NULL AND lower(o.email) = lower(c2.email))
      WHERE c2.qr_campaign_id = ${campaignId}
      GROUP BY COALESCE(o.customer_id, c2.id)
    ) customer_spend ON customer_spend.cid = c.id
    WHERE c.qr_campaign_id = ${campaignId}
  `;
  const totalScans = Number(scanRow.total_scans) || 0;
  const totalOrders = Number(orderRow.total_orders) || 0;
  const totalRevenue = Number(orderRow.total_revenue) || 0;
  const totalSignups = Number(signupRow?.total_signups) || 0;
  return {
    campaign_id: campaignId,
    total_scans: totalScans,
    bot_scans: Number(scanRow.bot_scans) || 0,
    unique_visitors: Number(scanRow.unique_visitors) || 0,
    total_signups: totalSignups,
    total_orders: totalOrders,
    total_revenue: totalRevenue,
    conversion_rate: totalScans > 0 ? (totalOrders / totalScans) * 100 : 0,
    avg_order_value: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    revenue_per_scan: totalScans > 0 ? totalRevenue / totalScans : 0,
    revenue_per_signup: totalSignups > 0 ? totalRevenue / totalSignups : 0,
    avg_customer_ltv: Number(signupRow?.avg_customer_ltv) || 0,
    repeat_purchase_rate: Number(signupRow?.repeat_purchase_rate) || 0,
  };
}

export interface QrScanTimePoint {
  date: string;
  count: number;
}

export interface QrOrderTimePoint {
  date: string;
  orders: number;
  revenue: number;
}

export async function getQrScansTimeSeries(days = 30): Promise<QrScanTimePoint[]> {
  const db = requireDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const rows = await db`
    SELECT
      DATE_TRUNC('day', scanned_at AT TIME ZONE 'UTC')::date::text AS date,
      COUNT(*)::int AS count
    FROM qr_campaign_scans
    WHERE scanned_at >= ${cutoff.toISOString()}::timestamptz
      AND NOT is_bot
    GROUP BY date
    ORDER BY date ASC
  `;
  return rows as QrScanTimePoint[];
}

export async function getQrOrdersTimeSeries(days = 30): Promise<QrOrderTimePoint[]> {
  const db = requireDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const rows = await db`
    SELECT
      DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date::text AS date,
      COUNT(*)::int AS orders,
      COALESCE(SUM(total)::numeric, 0)::float AS revenue
    FROM orders
    WHERE qr_campaign_id IS NOT NULL
      AND created_at >= ${cutoff.toISOString()}::timestamptz
      AND status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered')
    GROUP BY date
    ORDER BY date ASC
  `;
  return rows as QrOrderTimePoint[];
}
