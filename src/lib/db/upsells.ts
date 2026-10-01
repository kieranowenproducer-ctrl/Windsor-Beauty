import { randomBytes } from 'crypto';
import { requireDb } from './client';
import type { QrCampaignStats } from '@/lib/db';
// Extracted verbatim from db.ts on 2026-07-05 (see db/client.ts).

// ─── Upsell rules ────────────────────────────────────────────────────────────

export interface UpsellRuleRow {
  id: number;
  trigger_handle: string;
  upsell_handle: string;
  priority: number;
  custom_message: string | null;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  import_batch_id: string;
  created_at: string;
}

export interface UpsellRuleInput {
  triggerHandle: string;
  upsellHandle: string;
  priority: number;
  customMessage: string | null;
  active: boolean;
  /** 'YYYY-MM-DD', or null for "no start/end limit". */
  startDate: string | null;
  endDate: string | null;
}

const UPSELL_IMPORT_BATCH_SIZE = 500;

export async function listUpsellRules(): Promise<UpsellRuleRow[]> {
  const db = requireDb();
  const rows = await db`SELECT * FROM upsell_rules ORDER BY trigger_handle ASC, priority ASC`;
  return rows as UpsellRuleRow[];
}

// Fast, indexed lookup used by the public basket endpoint — only ever reads
// already-structured rows, never touches CSV text (parsing happens once, at
// import time, in src/lib/upsellCsv.ts).
export async function getUpsellRulesForTriggers(handles: string[]): Promise<UpsellRuleRow[]> {
  if (handles.length === 0) return [];
  const db = requireDb();
  const rows = await db`
    SELECT * FROM upsell_rules
    WHERE trigger_handle = ANY(${handles}) AND active = TRUE
    ORDER BY priority ASC
  `;
  return rows as UpsellRuleRow[];
}

async function upsertUpsellRulesBatch(rules: UpsellRuleInput[], batchId: string): Promise<number> {
  const db = requireDb();
  let count = 0;
  for (let i = 0; i < rules.length; i += UPSELL_IMPORT_BATCH_SIZE) {
    const batch = rules.slice(i, i + UPSELL_IMPORT_BATCH_SIZE);
    const rows = await db`
      INSERT INTO upsell_rules (trigger_handle, upsell_handle, priority, custom_message, active, start_date, end_date, import_batch_id)
      SELECT * FROM unnest(
        ${batch.map(r => r.triggerHandle)}::text[],
        ${batch.map(r => r.upsellHandle)}::text[],
        ${batch.map(r => r.priority)}::int[],
        ${batch.map(r => r.customMessage)}::text[],
        ${batch.map(r => r.active)}::boolean[],
        ${batch.map(r => r.startDate)}::date[],
        ${batch.map(r => r.endDate)}::date[],
        ${batch.map(() => batchId)}::text[]
      )
      ON CONFLICT (trigger_handle, upsell_handle) DO UPDATE SET
        priority = EXCLUDED.priority,
        custom_message = EXCLUDED.custom_message,
        active = EXCLUDED.active,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        import_batch_id = EXCLUDED.import_batch_id
      RETURNING id
    `;
    count += rows.length;
  }
  return count;
}

// "Replace" import: inserts the new rule set under a fresh batch id, then —
// only once that insert has fully succeeded — deletes every row left over
// from a different (older) batch. A failure partway through the insert
// leaves the table exactly as it was; it never gets wiped before the
// replacement data is safely in, so a bad/interrupted import can never leave
// the storefront with zero working upsell rules.
export async function replaceUpsellRules(rules: UpsellRuleInput[]): Promise<number> {
  const db = requireDb();
  const batchId = randomBytes(8).toString('hex');
  const count = await upsertUpsellRulesBatch(rules, batchId);
  await db`DELETE FROM upsell_rules WHERE import_batch_id != ${batchId}`;
  return count;
}

// "Append" import: merges into the existing rule set — a re-imported
// (trigger, upsell) pair updates that rule in place, anything new is added,
// and rules not mentioned in this file are left completely untouched.
export async function appendUpsellRules(rules: UpsellRuleInput[]): Promise<number> {
  const batchId = randomBytes(8).toString('hex');
  return upsertUpsellRulesBatch(rules, batchId);
}

export async function deleteUpsellRule(id: number): Promise<boolean> {
  const db = requireDb();
  const rows = await db`DELETE FROM upsell_rules WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

// ─── Upsell manual overrides (admin-panel per-product editor) ──────────────
// See the schema comment in ensureSchema() above for why this is a separate
// table from upsell_rules rather than a column/flag on it.

export interface UpsellManualOverrideRow {
  trigger_handle: string;
  /** Heading shown on this product's own page upsell section. */
  heading: string | null;
  /** Heading shown in the basket popup right after this product is added. */
  basket_heading: string | null;
  /** Ordered list of upsell product slugs — array order is priority (first = highest). */
  upsell_handles: string[];
  updated_at: string;
}

interface UpsellManualOverrideDbRow {
  trigger_handle: string;
  heading: string | null;
  basket_heading: string | null;
  upsell_handles: unknown;
  updated_at: string;
}

function normalizeManualOverrideRow(row: UpsellManualOverrideDbRow): UpsellManualOverrideRow {
  const handles = Array.isArray(row.upsell_handles)
    ? row.upsell_handles.filter((h): h is string => typeof h === 'string')
    : [];
  return {
    trigger_handle: row.trigger_handle,
    heading: row.heading,
    basket_heading: row.basket_heading,
    upsell_handles: handles,
    updated_at: row.updated_at,
  };
}

export async function listManualUpsellOverrides(): Promise<UpsellManualOverrideRow[]> {
  const db = requireDb();
  const rows = await db`SELECT * FROM upsell_manual_overrides ORDER BY trigger_handle ASC`;
  return (rows as UpsellManualOverrideDbRow[]).map(normalizeManualOverrideRow);
}

export async function getManualUpsellOverride(triggerHandle: string): Promise<UpsellManualOverrideRow | null> {
  const db = requireDb();
  const rows = await db`SELECT * FROM upsell_manual_overrides WHERE trigger_handle = ${triggerHandle}`;
  return rows.length > 0 ? normalizeManualOverrideRow(rows[0] as UpsellManualOverrideDbRow) : null;
}

// Used by the public /api/upsells route alongside getUpsellRulesForTriggers —
// fetches only the overrides relevant to the current trigger set in one
// indexed (primary-key) lookup, same shape/intent as the CSV equivalent.
export async function getManualUpsellOverridesForTriggers(handles: string[]): Promise<UpsellManualOverrideRow[]> {
  if (handles.length === 0) return [];
  const db = requireDb();
  const rows = await db`SELECT * FROM upsell_manual_overrides WHERE trigger_handle = ANY(${handles})`;
  return (rows as UpsellManualOverrideDbRow[]).map(normalizeManualOverrideRow);
}

export async function upsertManualUpsellOverride(
  triggerHandle: string,
  heading: string | null,
  basketHeading: string | null,
  upsellHandles: string[]
): Promise<void> {
  const db = requireDb();
  const handlesJson = JSON.stringify(upsellHandles);
  await db`
    INSERT INTO upsell_manual_overrides (trigger_handle, heading, basket_heading, upsell_handles, updated_at)
    VALUES (${triggerHandle}, ${heading}, ${basketHeading}, ${handlesJson}, now())
    ON CONFLICT (trigger_handle) DO UPDATE SET
      heading = ${heading},
      basket_heading = ${basketHeading},
      upsell_handles = ${handlesJson},
      updated_at = now()
  `;
}

// "Clear override" — reverts a product to CSV-driven recommendations. This
// is intentionally a different action from saving an empty upsell_handles
// array (which means "manually curated to show nothing").
export async function deleteManualUpsellOverride(triggerHandle: string): Promise<boolean> {
  const db = requireDb();
  const rows = await db`DELETE FROM upsell_manual_overrides WHERE trigger_handle = ${triggerHandle} RETURNING trigger_handle`;
  return rows.length > 0;
}

export async function listQrCampaignStatsAll(): Promise<QrCampaignStats[]> {
  const db = requireDb();
  const [scanRows, orderRows, signupRows] = await Promise.all([
    db`
      SELECT
        campaign_id,
        COUNT(*) FILTER (WHERE NOT is_bot)::int AS total_scans,
        COUNT(*) FILTER (WHERE is_bot)::int AS bot_scans,
        COUNT(DISTINCT wb_vid) FILTER (WHERE wb_vid IS NOT NULL AND NOT is_bot)::int AS unique_visitors
      FROM qr_campaign_scans
      GROUP BY campaign_id
    `,
    db`
      SELECT
        qr_campaign_id AS campaign_id,
        COUNT(*)::int AS total_orders,
        COALESCE(SUM(total)::numeric, 0) AS total_revenue
      FROM orders
      WHERE qr_campaign_id IS NOT NULL
        AND status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered')
      GROUP BY qr_campaign_id
    `,
    db`
      SELECT qr_campaign_id AS campaign_id, COUNT(*)::int AS total_signups
      FROM customers
      WHERE qr_campaign_id IS NOT NULL
      GROUP BY qr_campaign_id
    `,
  ]);
  const orderMap = new Map<number, { total_orders: number; total_revenue: number }>();
  for (const r of orderRows as { campaign_id: number; total_orders: number; total_revenue: string }[]) {
    orderMap.set(Number(r.campaign_id), { total_orders: Number(r.total_orders), total_revenue: Number(r.total_revenue) });
  }
  const signupMap = new Map<number, number>();
  for (const r of signupRows as { campaign_id: number; total_signups: number }[]) {
    signupMap.set(Number(r.campaign_id), Number(r.total_signups));
  }
  return (scanRows as { campaign_id: number; total_scans: number; bot_scans: number; unique_visitors: number }[]).map(r => {
    const cid = Number(r.campaign_id);
    const scans = Number(r.total_scans) || 0;
    const orders = orderMap.get(cid) ?? { total_orders: 0, total_revenue: 0 };
    const signups = signupMap.get(cid) ?? 0;
    return {
      campaign_id: cid,
      total_scans: scans,
      bot_scans: Number(r.bot_scans) || 0,
      unique_visitors: Number(r.unique_visitors) || 0,
      total_signups: signups,
      total_orders: orders.total_orders,
      total_revenue: orders.total_revenue,
      conversion_rate: scans > 0 ? (orders.total_orders / scans) * 100 : 0,
      avg_order_value: orders.total_orders > 0 ? orders.total_revenue / orders.total_orders : 0,
      revenue_per_scan: scans > 0 ? orders.total_revenue / scans : 0,
      revenue_per_signup: signups > 0 ? orders.total_revenue / signups : 0,
      avg_customer_ltv: 0, // Computed only in the per-campaign detail query (requires heavy join)
      repeat_purchase_rate: 0,
    };
  });
}

