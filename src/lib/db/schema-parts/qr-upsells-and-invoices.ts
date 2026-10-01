import type { requireDb } from '../client';

// QR campaigns and scans, upsell rules and overrides, and invoices.
//
// Moved out of schema.ts unchanged, in the order it already ran. Pure DDL:
// CREATE TABLE IF NOT EXISTS and idempotent ALTERs, safe to run again.
export async function ensureQrUpsellsAndInvoices(db: ReturnType<typeof requireDb>) {
  // Backfill: orders placed as a guest (or before the matching account
  // existed) have customer_id = NULL. Once an account with the same email
  // exists, link the order to it so it counts toward that customer's order
  // history and lifetime spend. Safe to re-run — only touches NULL rows.
  await db`
    UPDATE orders o
    SET customer_id = c.id
    FROM customers c
    WHERE o.customer_id IS NULL AND lower(o.email) = lower(c.email)
  `;

  // ─── QR Campaign Tracking ────────────────────────────────────────────────────
  // Each physical QR code / tracking link maps to one campaign row. The slug is
  // immutable after creation so printed QR codes never break. Only the display
  // name and metadata are editable.
  await db`
    CREATE TABLE IF NOT EXISTS qr_campaigns (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      partner_name TEXT,
      campaign_type TEXT,
      destination_url TEXT NOT NULL,
      discount_code TEXT,
      notes TEXT,
      start_date DATE,
      end_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Free-text leaflet headline override — purely cosmetic (e.g. "Exclusive for
  // PAG Gym Members"), never used for tracking, URLs, or reporting.
  await db`ALTER TABLE qr_campaigns ADD COLUMN IF NOT EXISTS bespoke_title TEXT`;

  // One row per scan of a campaign tracking link. wg_vid is the 365-day UUID
  // cookie used to distinguish unique visitors from repeat scans.
  await db`
    CREATE TABLE IF NOT EXISTS qr_campaign_scans (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES qr_campaigns(id) ON DELETE CASCADE,
      scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ip_address TEXT,
      user_agent TEXT,
      wg_vid TEXT,
      is_new_visitor BOOLEAN NOT NULL DEFAULT false
    )
  `;

  // Additive (task 522d09f1) — was this visit a machine rather than a person?
  //
  // A link pasted into WhatsApp is fetched by WhatsApp itself to draw the preview card, and that
  // fetch was being counted as a visit: Ross's brand new link read "1 visit" before anybody had
  // opened it. Search engines, uptime monitors and our own test scripts do the same.
  //
  // The row is still WRITTEN, always. Only the counting changes. Deleting them would mean nobody
  // could ever check the figure, and a number that quietly got smaller with no way to verify it is
  // worse than the wrong number.
  await db`ALTER TABLE qr_campaign_scans ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false`;

  await db`CREATE INDEX IF NOT EXISTS idx_qr_campaign_scans_campaign ON qr_campaign_scans (campaign_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_qr_campaign_scans_vid ON qr_campaign_scans (wg_vid)`;
  // Every visit query filters on is_bot, so it belongs in the campaign index rather than beside it.
  await db`CREATE INDEX IF NOT EXISTS idx_qr_campaign_scans_campaign_human ON qr_campaign_scans (campaign_id) WHERE NOT is_bot`;
  await db`CREATE INDEX IF NOT EXISTS idx_qr_campaigns_slug ON qr_campaigns (slug)`;

  // Additive — campaign attribution stored on each order at checkout time.
  // Independent of discount codes (a scan need not use a code to be attributed).
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_campaign_id INTEGER REFERENCES qr_campaigns(id) ON DELETE SET NULL`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_campaign_slug TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_campaign_name TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_campaign_type TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_partner_name TEXT`;

  // Additive — permanent first-touch campaign attribution on the customer record,
  // set once at registration time (never overwritten by later orders).
  // Lets us track which gym/clinic/partner generated each customer account,
  // independent of which campaign attributed any individual order.
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS qr_campaign_id INTEGER REFERENCES qr_campaigns(id) ON DELETE SET NULL`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS qr_campaign_slug TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS qr_campaign_name TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS qr_campaign_type TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS qr_partner_name TEXT`;

  // Basket upsell relationships, populated by admin CSV import (see
  // src/lib/upsellCsv.ts and /admin/upsells). `import_batch_id` is internal
  // bookkeeping for safe "replace" imports: new rows are inserted with a
  // fresh batch id, and only once that insert fully succeeds are rows from
  // older batches deleted — so a failed/partial import can never leave the
  // table empty or half-written. `trigger_handle`/`upsell_handle` are
  // product slugs (matches Product.slug elsewhere in this codebase — the
  // CSV calls them "handles" since that's the more portable term and what
  // the brief asked for, but they're validated against the same slugs).
  await db`
    CREATE TABLE IF NOT EXISTS upsell_rules (
      id SERIAL PRIMARY KEY,
      trigger_handle TEXT NOT NULL,
      upsell_handle TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 1,
      custom_message TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      start_date DATE,
      end_date DATE,
      import_batch_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (trigger_handle, upsell_handle)
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_upsell_rules_trigger ON upsell_rules (trigger_handle)`;

  // Manual, per-product upsell curation — entirely separate from upsell_rules
  // (the CSV-imported table above), by design: this keeps CSV import logic
  // completely untouched (it never reads or writes this table), while the
  // recommendation engine treats a row's mere presence here as "this product
  // has been manually curated" and uses ONLY upsell_handles for that trigger,
  // ignoring any CSV rules for it — even an empty array is a meaningful,
  // deliberate "show nothing" override, not "no opinion yet". Admins revert
  // to CSV-driven behaviour by deleting the row entirely (see
  // deleteManualUpsellOverride), not by clearing the array.
  await db`
    CREATE TABLE IF NOT EXISTS upsell_manual_overrides (
      trigger_handle TEXT PRIMARY KEY,
      heading TEXT,
      upsell_handles JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Two separate, independently-editable headings per product: `heading` is
  // shown on the product page (resolved when that product is the one being
  // viewed), `basket_heading` is shown in the basket popup right after that
  // product is added (resolved against CartContext's lastAddedSlug, not the
  // whole basket — there's no single sensible "anchor" once several
  // different products are in the basket). Additive, safe to re-run.
  await db`ALTER TABLE upsell_manual_overrides ADD COLUMN IF NOT EXISTS basket_heading TEXT`;

  // ─── Invoices (manual wholesale/backup invoicing) ──────────────────────────
  // An invoice is its own document — separate from the live checkout — but the
  // moment it's sent it creates one real row in `orders` (see order_number
  // below) so it rides the existing Fena/PayPal/stock/Royal-Mail/email
  // pipeline unmodified from that point on. billing_*/shipping_* mirror the
  // shipping_* columns already on `orders` exactly, so the linked order's
  // address fields can be copied across with zero transformation.
  await db`
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      customer_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      company_name TEXT,
      billing_line1 TEXT,
      billing_line2 TEXT,
      billing_city TEXT,
      billing_postcode TEXT,
      billing_country TEXT,
      shipping_line1 TEXT,
      shipping_line2 TEXT,
      shipping_city TEXT,
      shipping_postcode TEXT,
      shipping_country TEXT,
      invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
      due_date DATE,
      subject TEXT,
      message TEXT,
      footer_text TEXT,
      internal_notes TEXT,
      customer_notes TEXT,
      line_items JSONB NOT NULL DEFAULT '[]',
      shipping_label TEXT,
      shipping_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      discount_code TEXT,
      discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
      total NUMERIC(10,2) NOT NULL DEFAULT 0,
      paypal_fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      order_number TEXT,
      payment_method_used TEXT,
      paypal_marked_paid_by TEXT,
      paypal_marked_paid_at TIMESTAMPTZ,
      public_token TEXT UNIQUE NOT NULL,
      sent_at TIMESTAMPTZ,
      viewed_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      edit_log JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status)`;
  await db`CREATE INDEX IF NOT EXISTS idx_invoices_order_number ON invoices (order_number)`;
  // Records the PayPal surcharge actually charged when an invoice is paid via
  // PayPal (see calculateInvoicePaypalFee/onInvoiceOrderPaid) — 0 for every
  // Fena-paid or unpaid invoice. Additive for already-deployed invoices tables.
  await db`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paypal_fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0`;

  // Admin-set fulfilment/payment intent for in-person/manual/custom sales —
  // distinct from payment_method_used (the historical record of what
  // actually happened once paid). intended_payment_method is nullable
  // (unset = "either Fena or PayPal, customer's choice", the original
  // behaviour); fulfilment_type/automation_flags default to reproduce
  // today's behaviour exactly for every invoice that doesn't touch them.
  // Who the parcel is for, when that is not the person being invoiced — "she is paying, it goes to
  // her friend" (task 77b818aa). Only ever the name on the parcel: the customer, the billing
  // address and who owes the money are untouched by it. NULL on every existing invoice, and NULL
  // means "address it to the customer", which is exactly what happened before.
  await db`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shipping_recipient TEXT`;
  await db`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS intended_payment_method TEXT`;
  await db`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fulfilment_type TEXT NOT NULL DEFAULT 'royal_mail'`;
  await db`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS automation_flags JSONB NOT NULL DEFAULT '{"sendPaymentLink":true,"sendConfirmation":true,"triggerRoyalMail":true,"sendDispatchEmail":true}'`;

  // Customer-facing /pay/<public_token> page (T&C acknowledgement audit,
  // 2026-07-07): the Fena link generated at send time is stored so the pay
  // page reuses the exact same payment request instead of minting a new one
  // per visit; terms_accepted_at/_ip record the customer ticking the
  // "I agree to the Terms & Conditions" box before the payment buttons
  // unlock — the durable evidence of acknowledgement.
  await db`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fena_payment_url TEXT`;
  await db`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ`;
  await db`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms_accepted_ip TEXT`;

  // Links an order back to the invoice that created it (doubles as the
  // "Invoice Order" source flag — an order with invoice_id set came from this
  // system, not the live checkout) and guards the one-time, payment-time
  // stock decrement that's deliberately deferred for invoices (see
  // onInvoiceOrderPaid in src/lib/invoiceFulfillment.ts) — ordinary checkout
  // orders decrement stock inline at creation already and never set this.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_stock_decremented_at TIMESTAMPTZ`;

}
