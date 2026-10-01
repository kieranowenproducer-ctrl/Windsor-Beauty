import type { requireDb } from '../client';

import { ALL_CATEGORIES } from '@/data/products';

// Product visibility, stock by dosage, stock alerts, categories and site content.
//
// Moved out of schema.ts unchanged, in the order it already ran. Pure DDL:
// CREATE TABLE IF NOT EXISTS and idempotent ALTERs, safe to run again.
export async function ensureCatalogue(db: ReturnType<typeof requireDb>) {
  await db`
    CREATE TABLE IF NOT EXISTS product_visibility (
      slug TEXT PRIMARY KEY,
      hidden BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS product_stock (
      slug TEXT PRIMARY KEY,
      quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Per-dosage/variant stock — superseded product_stock above (one number
  // per slug, shared across every dosage) so each variant of a product can
  // be tracked and sold out independently. product_stock itself is left in
  // place untouched as a historical backup of the old whole-product numbers
  // rather than dropped; nothing in the live app reads from it anymore.
  await db`
    CREATE TABLE IF NOT EXISTS product_variant_stock (
      slug TEXT NOT NULL,
      dosage TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (slug, dosage)
    )
  `;
  // Retired = deliberately no longer stocked (task 3378ea2d): stays sold out
  // on the shop but leaves the low-stock warning and its emails. Also
  // ensured on first use by src/lib/db/lowStock.ts.
  await db`ALTER TABLE product_variant_stock ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ`;

  // Admin-added extra sidebar links — additive only. The built-in nav groups
  // in AdminSidebar.tsx stay hardcoded so the core admin pages can never be
  // accidentally hidden/deleted; these render in a separate "Custom" group
  // appended after them.
  await db`
    CREATE TABLE IF NOT EXISTS admin_nav_links (
      id SERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      href TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // "Notify me when back in stock" signups from the product page. One row
  // per (email, product) — notified_at is set once the alert email goes
  // out, so a customer who re-submits while still waiting just no-ops
  // instead of creating a duplicate.
  await db`
    CREATE TABLE IF NOT EXISTS stock_alerts (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      product_slug TEXT NOT NULL,
      notified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (email, product_slug)
    )
  `;

  // Low-stock alert bookkeeping (task efc5cb9a) — one row per (slug, dosage)
  // already emailed about since it last dropped below the threshold; deleted
  // on restock so the next drop alerts again. Also created on first use by
  // src/lib/db/lowStock.ts, so this run is just the tidy path.
  await db`
    CREATE TABLE IF NOT EXISTS low_stock_notifications (
      slug TEXT NOT NULL,
      dosage TEXT NOT NULL,
      quantity_at_alert INTEGER NOT NULL DEFAULT 0,
      notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (slug, dosage)
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS custom_products (
      slug TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Shop categories the admin can create, reorder, enable/disable, and delete
  // (once unused) — missing rows are treated as enabled, so this only needs
  // writing to when something is disabled, reordered, or newly created.
  await db`
    CREATE TABLE IF NOT EXISTS category_settings (
      category TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`ALTER TABLE category_settings ADD COLUMN IF NOT EXISTS sort_order INTEGER`;

  // Seed display order from the original static category list, then push any
  // still-unordered rows (e.g. created before this migration) to the end.
  for (let i = 0; i < ALL_CATEGORIES.length; i++) {
    await db`
      INSERT INTO category_settings (category, enabled, sort_order, updated_at)
      VALUES (${ALL_CATEGORIES[i]}, TRUE, ${i}, now())
      ON CONFLICT (category) DO UPDATE SET sort_order = COALESCE(category_settings.sort_order, ${i})
    `;
  }
  await db`
    UPDATE category_settings SET sort_order = sub.rn + 1000
    FROM (
      SELECT category, ROW_NUMBER() OVER (ORDER BY category) AS rn
      FROM category_settings WHERE sort_order IS NULL
    ) sub
    WHERE category_settings.category = sub.category
  `;

  // Admin-editable site copy — legal pages, announcement bar, etc. Pages fall
  // back to their hardcoded defaults until a row exists for their key.
  await db`
    CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY,
      title TEXT,
      body TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS image_url TEXT`;
  await db`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'text'`;

}
