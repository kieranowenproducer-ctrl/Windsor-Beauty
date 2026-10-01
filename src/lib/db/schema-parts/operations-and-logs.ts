import type { requireDb } from '../client';

// Launch subscribers, automation failures, cron runs, costs, and every activity log.
//
// Moved out of schema.ts unchanged, in the order it already ran. Pure DDL:
// CREATE TABLE IF NOT EXISTS and idempotent ALTERs, safe to run again.
export async function ensureOperationsAndLogs(db: ReturnType<typeof requireDb>) {
  // Email signups captured on the temporary pre-launch /coming-soon page —
  // a dedicated list (not marketing_contacts) since it's notified exactly
  // once, by the repeatable "Send Launch Email" button on the admin
  // dashboard, the moment the real site goes live.
  await db`
    CREATE TABLE IF NOT EXISTS launch_subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // A lock-page signup now also registers a first-order 10% discount code —
  // the code itself lives in discount_signups (the single source of truth
  // for status/redemption, same table the post-launch popup/registration
  // flow already uses); this column is just a denormalized cache so the
  // admin list and the launch-email sender don't need a join to display or
  // send a code, and so historical pre-this-change rows (NULL) are easy to
  // find and lazily backfill at send time.
  await db`ALTER TABLE launch_subscribers ADD COLUMN IF NOT EXISTS discount_code TEXT`;

  // Set by the Fena webhook when the signed JWT's netAmount doesn't match
  // this order's total at confirmation time — advisory only (never blocks
  // marking the order paid), surfaced in the sales@ payment-confirmed email
  // so a mismatch like the 2026-06-29 incident (invoice edited after first
  // send, Fena link still charged the old total) gets caught immediately
  // instead of relying on a customer or admin noticing it later.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_amount_mismatch TEXT`;

  // Durable record of automation failures that were previously only a
  // console.error inside a `.catch(() => {})` — invisible unless someone
  // happened to be reading Vercel's live log stream at that exact moment.
  // Surfaced on the admin System Health page so a missed dispatch/email/sync
  // is discoverable in minutes, not by a customer complaint days later.
  await db`
    CREATE TABLE IF NOT EXISTS automation_failures (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      order_number TEXT,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_automation_failures_created_at ON automation_failures (created_at DESC)`;

  // "I have dealt with this". Null means the failure is still open, and the red
  // banner counts exactly those. Also added lazily on first read from
  // src/lib/db.ts, because the deploy reaches the live site before anyone
  // presses Run DB Setup; both are idempotent, so whichever gets there first
  // wins and the other does nothing.
  await db`ALTER TABLE automation_failures ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`;
  await db`CREATE INDEX IF NOT EXISTS idx_automation_failures_open ON automation_failures (resolved_at) WHERE resolved_at IS NULL`;
  // These categories were review signals filed in the red system-failure log.
  // Security Review supersedes them; keep the rows as history but close them.
  await db`
    UPDATE automation_failures SET resolved_at = now()
    WHERE resolved_at IS NULL
      AND category IN ('duplicate_account_suspected', 'opening_offer_review', 'welcome_offer_blocked')
  `;

  // Outbound transactional-email history. The base table is shared with the
  // customer conversation record; these columns add provider delivery state.
  await db`
    CREATE TABLE IF NOT EXISTS customer_emails (
      id SERIAL PRIMARY KEY, direction TEXT NOT NULL, customer_id INTEGER,
      email TEXT NOT NULL, our_address TEXT, subject TEXT NOT NULL DEFAULT '',
      body_text TEXT NOT NULL DEFAULT '', provider_id TEXT, order_ref TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`ALTER TABLE customer_emails ADD COLUMN IF NOT EXISTS email_type TEXT`;
  await db`ALTER TABLE customer_emails ADD COLUMN IF NOT EXISTS delivery_status TEXT`;
  await db`ALTER TABLE customer_emails ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMPTZ`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS customer_emails_provider_id_unique ON customer_emails (provider_id) WHERE provider_id IS NOT NULL`;

  // One row per scheduled job, stamped every time it runs. Nothing watched whether the daily jobs
  // were still happening: if the verification-reminder cron quietly stopped, the site would look
  // completely normal and the only clue would be a slow trickle of customers who never got chased.
  // A job that has not checked in is now visible on System Health.
  await db`
    CREATE TABLE IF NOT EXISTS cron_runs (
      job TEXT PRIMARY KEY,
      last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_result TEXT,
      last_error TEXT
    )
  `;

  // last_login_at — populated by the customer login route on every successful
  // sign-in, surfaced in the CRM profile view.
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`;

  // Cost basis for the Profitability section (task 66a6a137). One row per
  // product+dosage variant: the unit cost you pay a supplier per vial, plus the
  // supplier name. Sale prices live in the catalogue; margin = sale - unit_cost.
  // Additive and safe to re-run. (Supplier bulk-purchase / shipping-allocation
  // tracking is a planned Phase 2 that will WRITE these rows automatically.)
  await db`
    CREATE TABLE IF NOT EXISTS product_costs (
      product_slug TEXT NOT NULL,
      dosage TEXT NOT NULL DEFAULT '',
      unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
      supplier TEXT,
      note TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (product_slug, dosage)
    )
  `;
  // The true cost "to achieve the bottle" is more than the raw vial: unit_cost above
  // is the RAW vial cost; `components` holds up to a few named extra costs the owner
  // defines (box, label, anything) and `shipping_per_unit` is this vial's allocated
  // share of a bulk order's shipping. Total unit cost = unit_cost + sum(components) +
  // shipping_per_unit. All additive/idempotent (task 66a6a137 revision).
  await db`ALTER TABLE product_costs ADD COLUMN IF NOT EXISTS components JSONB NOT NULL DEFAULT '[]'`;
  await db`ALTER TABLE product_costs ADD COLUMN IF NOT EXISTS shipping_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0`;

  // Bulk purchases from a supplier. One row per order (e.g. Vendor 1, 5 products ×
  // 10 vials = 50 vials, £55 shipping). `lines` = [{slug,dosage,qty,blockCost}].
  // On save the shipping is allocated across the vials in the order and folded into
  // each product's raw cost + shipping_per_unit (see db/productCosts.ts). The
  // `update_inventory` flag records the owner's choice about stock (inventory writes
  // are a separate concern, deliberately not automatic yet).
  await db`
    CREATE TABLE IF NOT EXISTS supplier_purchases (
      id SERIAL PRIMARY KEY,
      supplier TEXT NOT NULL DEFAULT '',
      purchase_date DATE,
      shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
      update_inventory BOOLEAN NOT NULL DEFAULT FALSE,
      lines JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Member sign-in audit trail — one append-only row per successful sign-in, read
  // by /admin/member-logins. `customers.last_login_at` holds only the most recent
  // sign-in and is overwritten each time, so it can never answer "when did they
  // sign in before that". Name and email are denormalised on purpose: the row must
  // still read correctly after a customer record is deleted, which is the whole
  // point of an audit log. Mirrors verification_audit_log, ip_address and
  // user_agent included for the same reason it stores them.
  await db`
    CREATE TABLE IF NOT EXISTS member_login_log (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT,
      customer_email TEXT,
      method TEXT NOT NULL DEFAULT 'login',
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS member_login_log_created_at_idx ON member_login_log (created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS member_login_log_customer_idx ON member_login_log (customer_id)`;

  // Where people are coming from — one row per notable thing somebody does, with
  // the address behind it and roughly where that address is. Read by
  // /admin/ip-addresses. Kept for TWO YEARS (Kieran's decision, 5 Aug 2026) and
  // then deleted by /api/cron/data-retention.
  //
  // EVENTS, NOT PAGE VIEWS. Recording every page view of a live shop would put
  // millions of rows into a database already running close to its limit, and
  // would say very little the events below do not already say.
  //
  // The location costs nothing and is looked up nowhere: Vercel puts the country,
  // region, city and coordinates of the visitor on the request itself. No third
  // party ever sees a customer's address.
  //
  // Name and email sit beside the customer link for the same reason
  // member_login_log copies them: the row must still read correctly after an
  // account is deleted, which is the whole point of an audit trail.
  await db`
    CREATE TABLE IF NOT EXISTS ip_activity_log (
      id SERIAL PRIMARY KEY,
      ip_address TEXT,
      event TEXT NOT NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT,
      customer_email TEXT,
      country TEXT,
      country_region TEXT,
      city TEXT,
      latitude TEXT,
      longitude TEXT,
      timezone TEXT,
      postal_code TEXT,
      network TEXT,
      user_agent TEXT,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  /* Added after the table was first written, so they go on the additive way. The
     postcode narrows "roughly where" from a city to a district, and the network
     number says which internet provider the address belongs to, which is how a
     run of sign-ups from a data centre rather than real homes becomes visible. */
  await db`ALTER TABLE ip_activity_log ADD COLUMN IF NOT EXISTS postal_code TEXT`;
  await db`ALTER TABLE ip_activity_log ADD COLUMN IF NOT EXISTS network TEXT`;
  await db`CREATE INDEX IF NOT EXISTS ip_activity_log_created_at_idx ON ip_activity_log (created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS ip_activity_log_ip_idx ON ip_activity_log (ip_address)`;
  await db`CREATE INDEX IF NOT EXISTS ip_activity_log_customer_idx ON ip_activity_log (customer_id)`;
  await db`CREATE INDEX IF NOT EXISTS ip_activity_log_country_idx ON ip_activity_log (country)`;

  // Visits (task dfe5e9ae): one row per page somebody opens, with the address,
  // roughly where it is, and where they came from. See src/lib/db/siteVisits.ts.
  // Kept for the same two years as the address log (cron/data-retention).
  await db`
    CREATE TABLE IF NOT EXISTS site_visits (
      id SERIAL PRIMARY KEY,
      ip_address TEXT,
      path TEXT NOT NULL,
      landing BOOLEAN NOT NULL DEFAULT FALSE,
      source TEXT NOT NULL,
      source_detail TEXT,
      referrer TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      country TEXT,
      country_region TEXT,
      city TEXT,
      postal_code TEXT,
      network TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS site_visits_created_at_idx ON site_visits (created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS site_visits_ip_idx ON site_visits (ip_address)`;
  await db`CREATE INDEX IF NOT EXISTS site_visits_landing_source_idx ON site_visits (landing, source)`;
  // Added 4 Sept 2026 (ADSLAB item 7): the ad id Meta puts in the link
  // (utm_content={{ad.id}}), so two ads inside one campaign can be told apart
  // in the after-the-click funnel. Additive; earlier rows simply have null.
  await db`ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS utm_content TEXT`;
  // Added 5 Sept 2026 (ADSLAB item 15): was this person signed in to an account
  // when they opened the page? Deliberately nullable, because rows written
  // before this shipped genuinely do not know, and a default of FALSE would
  // claim every one of them was a stranger. No customer id is kept here: the
  // ads reports only need "already a member, or not". The customer link added
  // below is for the separate, admin-only visitor journey.
  await db`ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS signed_in BOOLEAN`;
  // A visit id separates one browsing session from its individual page opens.
  // The member id is filled only after the existing signed session has been
  // checked on the server, so the browser cannot claim to be somebody else.
  await db`ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS visit_id TEXT`;
  await db`ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL`;
  // A browser keeps unsent events and retries them. This id makes a retry safe:
  // the same page view can arrive twice, but it is stored only once.
  await db`ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS event_id TEXT`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS site_visits_event_id_unique ON site_visits (event_id)`;
  await db`CREATE INDEX IF NOT EXISTS site_visits_visit_idx ON site_visits (visit_id, created_at)`;
  await db`CREATE INDEX IF NOT EXISTS site_visits_customer_idx ON site_visits (customer_id, created_at DESC)`;

  // Important actions that do not open another page. Page opens stay in
  // site_visits; this smaller table records commercial intent such as adding a
  // product to the basket without turning every minor interface click into data.
  await db`
    CREATE TABLE IF NOT EXISTS site_interactions (
      id SERIAL PRIMARY KEY,
      ip_address TEXT,
      visit_id TEXT,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      product_slug TEXT,
      quantity INTEGER,
      event_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS site_interactions_created_idx ON site_interactions (created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS site_interactions_product_idx ON site_interactions (product_slug, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS site_interactions_visit_idx ON site_interactions (visit_id, created_at)`;
  await db`ALTER TABLE site_interactions ADD COLUMN IF NOT EXISTS event_id TEXT`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS site_interactions_event_id_unique ON site_interactions (event_id)`;

  // Banned accounts (task 9cd55f28).
  //
  // A ban is a column on the customer, not a row that has to be looked up, because sign-in and
  // checkout both have to ask "is this one banned?" on every attempt and neither can afford to get
  // it wrong when a lookup fails.
  //
  // It is its own column rather than a third value of account_status: that column means 'active' or
  // 'pending_password' and is read by registration, sign-in and batch verification, none of which
  // should have to learn a new word to keep working.
  //
  // Nothing is ever deleted by a ban. The account, its orders and its history stay exactly where
  // they are, which is what makes a ban made in error free to undo.
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS banned_reason TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS banned_by TEXT`;
  await db`CREATE INDEX IF NOT EXISTS customers_banned_at_idx ON customers (banned_at) WHERE banned_at IS NOT NULL`;

  // Every ban and every lift, permanently. "Why can this customer not get in?" has to be answerable
  // months later, including after the account itself has been deleted, which is why the name and
  // email are copied in rather than only referenced.
  await db`
    CREATE TABLE IF NOT EXISTS customer_bans (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT,
      customer_email TEXT,
      action TEXT NOT NULL,
      reason TEXT,
      admin_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS customer_bans_customer_idx ON customer_bans (customer_id)`;
  await db`CREATE INDEX IF NOT EXISTS customer_bans_created_idx ON customer_bans (created_at DESC)`;

  // Customer email history (task b2084076) — dashboard messages sent to a
  // customer and email replies captured from them, shown on the customer's
  // admin page. Also created on first use by src/lib/db/customerEmails.ts;
  // this run is the tidy path.
  await db`
    CREATE TABLE IF NOT EXISTS customer_emails (
      id SERIAL PRIMARY KEY,
      direction TEXT NOT NULL,
      customer_id INTEGER,
      email TEXT NOT NULL,
      our_address TEXT,
      subject TEXT NOT NULL DEFAULT '',
      body_text TEXT NOT NULL DEFAULT '',
      provider_id TEXT,
      order_ref TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS customer_emails_email_idx ON customer_emails (lower(email))`;
}
