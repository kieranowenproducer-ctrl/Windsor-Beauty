import { requireDb } from './client';

// ─── Low-stock alert bookkeeping (task efc5cb9a) ────────────────────────────
// One row per (slug, dosage) that has been emailed about since it last
// dropped below the threshold. The row is what stops the alert re-sending on
// every subsequent sale of an already-low variant; it is deleted the moment
// the variant is restocked to the threshold or above, so the NEXT drop
// alerts again. The dashboard panel never reads this table — it always shows
// the live quantities — so a failed email can never hide a low product.

export interface LowStockNotificationRow {
  slug: string;
  dosage: string;
  quantity_at_alert: number;
  notified_at: string;
}

// The table is created on first use rather than only via Run Database Setup,
// mirroring how the IP activity log protects itself: the alert path runs
// inside checkout, and "the table does not exist yet" must never surface
// there. The DDL also lives in schema-parts/catalogue.ts for setup runs.
let tableEnsured = false;
async function ensureTable(db: ReturnType<typeof requireDb>): Promise<void> {
  if (tableEnsured) return;
  await db`
    CREATE TABLE IF NOT EXISTS low_stock_notifications (
      slug TEXT NOT NULL,
      dosage TEXT NOT NULL,
      quantity_at_alert INTEGER NOT NULL DEFAULT 0,
      notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (slug, dosage)
    )
  `;
  tableEnsured = true;
}

// ─── Retired variants (task 3378ea2d) ───────────────────────────────────────
// A retired (slug, dosage) is one Kieran has decided not to stock any more:
// it keeps its row and its zero quantity (so the shop still shows it sold
// out and nobody can buy it), but it stops counting as "low stock" — no
// dashboard warning, no email. Saving any positive quantity un-retires it,
// so a retired variant can never sit invisibly starved of stock.

let retiredColumnEnsured = false;
async function ensureRetiredColumn(db: ReturnType<typeof requireDb>): Promise<void> {
  if (retiredColumnEnsured) return;
  await db`ALTER TABLE product_variant_stock ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ`;
  retiredColumnEnsured = true;
}

/** "slug::dosage" for every retired variant. */
export async function listRetiredVariantKeys(): Promise<Set<string>> {
  const db = requireDb();
  await ensureRetiredColumn(db);
  const rows = await db`SELECT slug, dosage FROM product_variant_stock WHERE retired_at IS NOT NULL`;
  return new Set((rows as { slug: string; dosage: string }[]).map((r) => `${r.slug}::${r.dosage}`));
}

export async function setVariantRetired(slug: string, dosage: string, retired: boolean): Promise<void> {
  const db = requireDb();
  await ensureRetiredColumn(db);
  // Upsert so retiring a variant that somehow has no row yet still sticks —
  // the row lands with quantity 0, which is what a retired variant should be.
  await db`
    INSERT INTO product_variant_stock (slug, dosage, quantity, updated_at, retired_at)
    VALUES (${slug}, ${dosage}, 0, now(), ${retired ? new Date().toISOString() : null})
    ON CONFLICT (slug, dosage) DO UPDATE SET retired_at = ${retired ? new Date().toISOString() : null}, updated_at = now()
  `;
}

export async function listActiveLowStockNotifications(): Promise<LowStockNotificationRow[]> {
  const db = requireDb();
  await ensureTable(db);
  const rows = await db`SELECT slug, dosage, quantity_at_alert, notified_at FROM low_stock_notifications`;
  return rows as LowStockNotificationRow[];
}

export async function recordLowStockNotifications(entries: { slug: string; dosage: string; quantity: number }[]): Promise<void> {
  if (!entries.length) return;
  const db = requireDb();
  await ensureTable(db);
  // ON CONFLICT DO NOTHING — two orders racing on the same newly-low variant
  // must not error; the first row in wins and the episode counts as alerted.
  await db`
    INSERT INTO low_stock_notifications (slug, dosage, quantity_at_alert)
    SELECT * FROM unnest(
      ${entries.map((e) => e.slug)}::text[],
      ${entries.map((e) => e.dosage)}::text[],
      ${entries.map((e) => e.quantity)}::int[]
    )
    ON CONFLICT (slug, dosage) DO NOTHING
  `;
}

export async function clearLowStockNotifications(pairs: { slug: string; dosage: string }[]): Promise<void> {
  if (!pairs.length) return;
  const db = requireDb();
  await ensureTable(db);
  await db`
    DELETE FROM low_stock_notifications
    WHERE (slug, dosage) IN (
      SELECT * FROM unnest(
        ${pairs.map((p) => p.slug)}::text[],
        ${pairs.map((p) => p.dosage)}::text[]
      )
    )
  `;
}
