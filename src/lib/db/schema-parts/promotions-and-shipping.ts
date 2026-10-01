import type { requireDb } from '../client';

// Promotions, promotion rules, shipping settings and the two token tables.
//
// Moved out of schema.ts unchanged, in the order it already ran. Pure DDL:
// CREATE TABLE IF NOT EXISTS and idempotent ALTERs, safe to run again.
export async function ensurePromotionsAndShipping(db: ReturnType<typeof requireDb>) {
  // Homepage promotional banner, managed entirely from /admin/promotions.
  await db`
    CREATE TABLE IF NOT EXISTS promotions (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      button_text TEXT,
      button_link TEXT,
      start_date TIMESTAMPTZ,
      end_date TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Additive — lets a promotion surface a discount code (e.g. on /promotion)
  // without requiring it to also exist in the discount_codes table.
  await db`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS discount_code TEXT`;

  // Additive — optional banner image (Vercel Blob URL, same upload pattern as
  // products) and a type flag distinguishing a code-based promotion from a
  // purely informational one (e.g. "20% off Fat Loss this month" with no
  // code to redeem).
  await db`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS image_url TEXT`;
  await db`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS promotion_type TEXT NOT NULL DEFAULT 'informational'`;

  // Additive — ordered list of banner images for the Special Offers carousel.
  // `image_url` (above) is kept in sync as `image_urls[0]` so any older code
  // still reading the single column keeps working untouched.
  await db`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'`;

  // Additive — the automatic percentage-off sale, moved here from Discount
  // Codes -> Automatic Sale Discounts (it was never a customer-entered code,
  // so it didn't belong in that table). Only meaningful when
  // promotion_type = 'percentage'. Same scope model as discount_codes
  // (all / category / product) for consistency.
  await db`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS discount_percent INTEGER`;
  await db`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS discount_scope_type TEXT NOT NULL DEFAULT 'all'`;
  await db`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS discount_scope_categories JSONB NOT NULL DEFAULT '[]'`;
  await db`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS discount_scope_product_slugs JSONB NOT NULL DEFAULT '[]'`;

  // Remove any promotion that was auto-created by the old one-time migration block.
  // Those rows were never manually created by the admin and should not appear publicly.
  await db`
    DELETE FROM promotions
    WHERE description = 'Migrated automatically from the previous Automatic Sale Discount setting.'
  `;
  // Disable the legacy site-sale config so it can never trigger future issues.
  await db`
    UPDATE site_content
    SET body = '{"enabled":false,"percent":0,"scopeType":"all","scopeCategories":[],"scopeProductSlugs":[]}'
    WHERE key = 'site-sale'
  `;

  // Automatic promotion rules — BOGO, bundle pricing, spend-threshold rewards
  // applied to every cart/order automatically (no code required). Separate
  // from the `promotions` banner above and from `discount_codes`. config
  // shape depends on `type` — see src/lib/promotionRules.ts.
  await db`
    CREATE TABLE IF NOT EXISTS promotion_rules (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config JSONB NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      start_date TIMESTAMPTZ,
      end_date TIMESTAMPTZ,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Global Royal Mail shipping configuration — single row (id = 1). Per-product
  // weight/dimensions/format on Product.shipping override these where set;
  // these values are the fallback used when a product has no shipping data,
  // plus the packaging allowance/safety margin added to every parcel.
  await db`
    CREATE TABLE IF NOT EXISTS shipping_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      default_item_weight_grams INTEGER NOT NULL DEFAULT 50,
      packaging_weight_grams INTEGER NOT NULL DEFAULT 50,
      safety_margin_grams INTEGER NOT NULL DEFAULT 20,
      default_package_format TEXT NOT NULL DEFAULT 'smallParcel',
      default_service TEXT NOT NULL DEFAULT 'uk-standard',
      international_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      default_origin_country TEXT NOT NULL DEFAULT 'GB',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT shipping_settings_single_row CHECK (id = 1)
    )
  `;

  // Additive — server-authoritative checkout shipping rates (pence), used by
  // place-order to recompute shippingCost rather than trusting the client.
  await db`ALTER TABLE shipping_settings ADD COLUMN IF NOT EXISTS uk_standard_rate_pence INTEGER NOT NULL DEFAULT 1000`;
  await db`ALTER TABLE shipping_settings ADD COLUMN IF NOT EXISTS international_rate_pence INTEGER NOT NULL DEFAULT 4000`;
  await db`ALTER TABLE shipping_settings ADD COLUMN IF NOT EXISTS free_shipping_threshold_pence INTEGER NOT NULL DEFAULT 0`;

  // One-time correction: 'parcel' (the generic, unspecified-size value) used
  // to outrank every real size tier including largeParcel — see the
  // FORMAT_RANK comment in src/lib/shipping.ts. Any account still holding
  // that value from before the fix gets every order without a per-product
  // format override bucketed as Royal Mail's biggest "Large Parcel"
  // category, which excludes the standard Tracked 24/48 services and
  // forces manual format/service selection on every single order. Safe to
  // re-run — only touches rows still sitting on the old buggy default.
  await db`UPDATE shipping_settings SET default_package_format = 'smallParcel' WHERE default_package_format = 'parcel'`;

  await db`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    )
  `;

  // Same shape as password_reset_tokens above — one-click "verify your
  // email" links sent at signup. See the email_verified backfill comment
  // above for why pre-existing accounts never need one of these.
  await db`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    )
  `;

}
