import { requireDb } from './client';
// Extracted verbatim from db.ts on 2026-08-11 (Phase 2 of "thin it out").
// Everything here is re-exported from '@/lib/db', so no call site changed.

// ─── Stock alerts ("notify me when back in stock") ─────────────────────────

export interface StockAlertRow {
  id: number;
  email: string;
  product_slug: string;
  notified_at: string | null;
  created_at: string;
}

// ON CONFLICT DO NOTHING — a customer re-submitting the form while still
// waiting on the same product is a silent no-op, not an error.
export async function createStockAlert(email: string, productSlug: string): Promise<void> {
  const db = requireDb();
  await db`
    INSERT INTO stock_alerts (email, product_slug)
    VALUES (${email}, ${productSlug})
    ON CONFLICT (email, product_slug) DO NOTHING
  `;
}

export async function listPendingStockAlerts(productSlug: string): Promise<StockAlertRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM stock_alerts WHERE product_slug = ${productSlug} AND notified_at IS NULL
  `;
  return rows as StockAlertRow[];
}

export async function markStockAlertsNotified(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = requireDb();
  await db`UPDATE stock_alerts SET notified_at = now() WHERE id = ANY(${ids}::int[])`;
}
