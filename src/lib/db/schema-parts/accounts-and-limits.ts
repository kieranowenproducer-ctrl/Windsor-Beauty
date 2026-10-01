import type { requireDb } from '../client';

// Batches, every brute-force/rate-limit table, and discount codes.
//
// Moved out of schema.ts unchanged, in the order it already ran. Pure DDL:
// CREATE TABLE IF NOT EXISTS and idempotent ALTERs, safe to run again.
export async function ensureAccountsAndLimits(db: ReturnType<typeof requireDb>) {

  // Batch identifying codes the admin defines and then allocates to individual
  // products on an invoice (and, later, on a website order before dispatch) so
  // each customer can be told which verified batch their product came from.
  // Additive and idempotent — the allocations themselves live inside the
  // invoice line_items / order items JSONB, so no other table changes.
  await db`
    CREATE TABLE IF NOT EXISTS batches (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      product_name TEXT,
      note TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Brute-force protection for /api/admin/login, logged regardless of success/failure so a
  // burst of correct-password-but-still-too-fast attempts is also throttled.
  await db`
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      id SERIAL PRIMARY KEY,
      ip_address TEXT NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Same shape again, for /account/register and /api/launch/subscribe —
  // discourages a script from creating many accounts from one IP purely to
  // farm multiple 10% discount codes (the per-email checks already block
  // re-using one address, this blocks the "just use a new address each
  // time" workaround).
  await db`
    CREATE TABLE IF NOT EXISTS signup_attempts (
      id SERIAL PRIMARY KEY,
      ip_address TEXT NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // The same idea for the three public forms anyone can post to without
  // logging in: the contact form, review submission and the back-in-stock
  // signup. One row per submission; the limits live in db/formLimits.ts.
  // `form` names which one, so all three share this table without their
  // counts running into each other.
  await db`
    CREATE TABLE IF NOT EXISTS form_attempts (
      id SERIAL PRIMARY KEY,
      form TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS discount_signups (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      code TEXT UNIQUE NOT NULL,
      marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'active',
      issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      used_at TIMESTAMPTZ
    )
  `;
  await db`ALTER TABLE discount_signups ADD COLUMN IF NOT EXISTS reservation_token TEXT`;
  await db`ALTER TABLE discount_signups ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ`;

  // Admin-created promo codes — distinct from the auto-issued first-order
  // signup codes above (those are 1-per-email at a fixed 10%). These are
  // hand-made by staff with a configurable rate, optional expiry, optional
  // redemption cap, and optional minimum-order requirement.
  await db`
    CREATE TABLE IF NOT EXISTS discount_codes (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      percentage INTEGER NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ,
      usage_limit INTEGER,
      times_redeemed INTEGER NOT NULL DEFAULT 0,
      min_order_value NUMERIC(10,2),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Discount code scoping + fixed-amount discounts (additive). A code can
  // now discount the whole order (scope_type = 'all'), a set of categories,
  // or a set of specific products, and can be a percentage or a fixed £
  // amount off the eligible subtotal. `percentage` is nullable so
  // fixed-amount codes don't need one.
  await db`ALTER TABLE discount_codes ALTER COLUMN percentage DROP NOT NULL`;
  await db`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'percentage'`;
  await db`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS fixed_amount NUMERIC(10,2)`;
  await db`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'all'`;
  await db`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS scope_categories JSONB NOT NULL DEFAULT '[]'`;
  await db`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS scope_product_slugs JSONB NOT NULL DEFAULT '[]'`;

}
