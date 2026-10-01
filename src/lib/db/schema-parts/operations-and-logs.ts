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

  // Full audit trail for every verification attempt — successful and failed.
  // Replaces the implicit "what got written to verification_codes" approach with
  // an explicit log so every event is inspectable, filterable, and linked to
  // the order and customer it was for.
  await db`
    CREATE TABLE IF NOT EXISTS verification_audit_log (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL,
      product_name TEXT,
      order_number TEXT,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT,
      customer_email TEXT,
      status TEXT NOT NULL,
      failure_reason TEXT,
      is_repeat_attempt BOOLEAN NOT NULL DEFAULT FALSE,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_verification_audit_log_created_at ON verification_audit_log (created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS idx_verification_audit_log_code ON verification_audit_log (code)`;
  await db`CREATE INDEX IF NOT EXISTS idx_verification_audit_log_customer_id ON verification_audit_log (customer_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_verification_audit_log_order_number ON verification_audit_log (order_number)`;

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

  // PEARL questions. The legacy research_chat_log name is retained so the live
  // deployment does not need a risky data migration. One append-only row per question a member asks the
  // research desk, with the answer they were given, read by
  // /admin/research-questions. Admin only; nothing here is ever shown to a
  // customer, including the customer who asked.
  //
  // Name and email are denormalised for the same reason member_login_log does it:
  // the record must still read correctly after a customer record is deleted.
  // `is_staff` marks a turn taken by somebody signed in to the admin panel rather
  // than by a member, so internal testing does not read as member demand.
  //
  // answer_json keeps the whole structured answer as it was shown on the day.
  // The answering engine's wording can change; what a member actually saw cannot
  // be reconstructed later from the question alone.
  await db`
    CREATE TABLE IF NOT EXISTS research_chat_log (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT,
      customer_email TEXT,
      is_staff BOOLEAN NOT NULL DEFAULT FALSE,
      question TEXT NOT NULL,
      answer_kind TEXT,
      answer_title TEXT,
      answer_summary TEXT,
      answer_json JSONB,
      compounds TEXT[],
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS research_chat_log_created_at_idx ON research_chat_log (created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS research_chat_log_customer_idx ON research_chat_log (customer_id)`;
  // Review fields turn the question log into a practical improvement queue.
  // They are additive so the exact historical question and answer remain
  // untouched. Task IDs are text because the task system has its own database.
  await db`ALTER TABLE research_chat_log ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'unreviewed'`;
  await db`ALTER TABLE research_chat_log ADD COLUMN IF NOT EXISTS review_note TEXT`;
  await db`ALTER TABLE research_chat_log ADD COLUMN IF NOT EXISTS reviewed_by TEXT`;
  await db`ALTER TABLE research_chat_log ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`;
  await db`ALTER TABLE research_chat_log ADD COLUMN IF NOT EXISTS linked_task_id TEXT`;
  // engine_version/config_version were added on 2026-08-17 but nothing ever
  // wrote them, so every row carried two empty columns that read as data.
  // Removed as part of the Pearl plan Stage B; both DROPs are no-ops once run.
  await db`ALTER TABLE research_chat_log DROP COLUMN IF EXISTS engine_version`;
  await db`ALTER TABLE research_chat_log DROP COLUMN IF EXISTS config_version`;
  await db`CREATE INDEX IF NOT EXISTS research_chat_log_review_idx ON research_chat_log (review_status, created_at DESC)`;

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

  // Administrator-maintained PEARL terminology additions. The built-in,
  // source-reviewed terminology file remains the baseline; this table is a
  // small approved overlay for new aliases, spelling variants and blend names.
  // Draft and rejected rows are never sent to members and can never influence
  // retrieval. One row represents one term so a mistaken mapping can be
  // disabled without changing any research or customer data.
  await db`
    CREATE TABLE IF NOT EXISTS pearl_terminology_overrides (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('alias', 'abbreviation', 'misspelling', 'category', 'ambiguous', 'blend')),
      term TEXT NOT NULL,
      canonical_slug TEXT,
      display_name TEXT,
      aliases TEXT[] NOT NULL DEFAULT '{}',
      misspellings TEXT[] NOT NULL DEFAULT '{}',
      related_slugs TEXT[] NOT NULL DEFAULT '{}',
      categories TEXT[] NOT NULL DEFAULT '{}',
      component_slugs TEXT[] NOT NULL DEFAULT '{}',
      ambiguous_with TEXT[] NOT NULL DEFAULT '{}',
      source_urls JSONB NOT NULL DEFAULT '[]',
      confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
      review_status TEXT NOT NULL DEFAULT 'review' CHECK (review_status IN ('review', 'approved', 'rejected')),
      auto_resolve BOOLEAN NOT NULL DEFAULT FALSE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      last_verified DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  /* Kieran, 19 Aug 2026: built-in terminology records must be editable.
     They live in source control and cannot be written to at run time, so an
     edit is stored as an ordinary override row that names the built-in it
     replaces. The built-in stays untouched, so deleting the override puts
     the original back exactly. */
  await db`ALTER TABLE pearl_terminology_overrides ADD COLUMN IF NOT EXISTS supersedes_builtin TEXT`;
  await db`ALTER TABLE pearl_terminology_overrides ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}'`;
  await db`ALTER TABLE pearl_terminology_overrides ADD COLUMN IF NOT EXISTS misspellings TEXT[] NOT NULL DEFAULT '{}'`;
  await db`ALTER TABLE pearl_terminology_overrides ADD COLUMN IF NOT EXISTS related_slugs TEXT[] NOT NULL DEFAULT '{}'`;
  await db`ALTER TABLE pearl_terminology_overrides ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}'`;
  await db`ALTER TABLE pearl_terminology_overrides ADD COLUMN IF NOT EXISTS created_by TEXT`;
  await db`ALTER TABLE pearl_terminology_overrides ADD COLUMN IF NOT EXISTS updated_by TEXT`;
  await db`ALTER TABLE pearl_terminology_overrides ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
  await db`ALTER TABLE pearl_terminology_overrides ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`;
  await db`CREATE INDEX IF NOT EXISTS pearl_terminology_status_idx ON pearl_terminology_overrides (review_status, enabled)`;
  await db`CREATE INDEX IF NOT EXISTS pearl_terminology_term_idx ON pearl_terminology_overrides (lower(term))`;
  // A live database created before the category-or-group kind existed still
  // carries the old kind list in its check constraint, so refresh it here.
  // Dropping and re-adding is the only idempotent way to widen a check in
  // Postgres. Both admin screens offer this kind, so without the refresh an
  // approval of a category rule fails against an older live database.
  await db`ALTER TABLE pearl_terminology_overrides DROP CONSTRAINT IF EXISTS pearl_terminology_overrides_kind_check`;
  await db`ALTER TABLE pearl_terminology_overrides ADD CONSTRAINT pearl_terminology_overrides_kind_check CHECK (kind IN ('alias', 'abbreviation', 'misspelling', 'category', 'ambiguous', 'blend'))`;

  // Sources supplied for PEARL. There is no approval gate: Samuel's word is
  // final on what goes in (CLAUDE.md, "Samuel decides what goes into PEARL"),
  // so a submitted source is ACCEPTED on arrival and the only remaining work is
  // reading it into the library. That is what the linked task is for.
  //
  // 'waiting' is kept in the list only so rows written before 19 Aug 2026 stay
  // legal. Nothing creates one any more.
  await db`
    CREATE TABLE IF NOT EXISTS pearl_sources (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN (
        'accepted', 'waiting', 'processing', 'needs_review', 'ready', 'added',
        'update_available', 'failed', 'rejected', 'disabled'
      )),
      task_id TEXT,
      submitted_by TEXT,
      error_message TEXT,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS pearl_sources_status_idx ON pearl_sources (status, created_at DESC)`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS pearl_sources_live_url_idx ON pearl_sources (lower(url)) WHERE archived_at IS NULL`;
  // The table predates the removal of the approval gate, so an existing
  // deployment still carries the old CHECK and the old default. Both are
  // replaced here rather than in a one-off script, so any environment that runs
  // ensureSchema ends up in the same state.
  await db`ALTER TABLE pearl_sources DROP CONSTRAINT IF EXISTS pearl_sources_status_check`;
  await db`ALTER TABLE pearl_sources ADD CONSTRAINT pearl_sources_status_check CHECK (status IN ('accepted', 'waiting', 'processing', 'needs_review', 'ready', 'added', 'update_available', 'failed', 'rejected', 'disabled'))`;
  await db`ALTER TABLE pearl_sources ALTER COLUMN status SET DEFAULT 'accepted'`;
  // Rows filed under the old gate were never going to move: nothing in the app
  // ever changed a source's status, so every one of them still says it is
  // waiting for a review that is not coming. They are accepted like the rest.
  await db`UPDATE pearl_sources SET status = 'accepted', updated_at = now() WHERE status = 'waiting'`;

  // Permanent, human-readable record of every PEARL improvement action. This
  // is append-only. Reversing a change creates a new entry rather than erasing
  // the earlier one.
  await db`
    CREATE TABLE IF NOT EXISTS pearl_change_history (
      id BIGSERIAL PRIMARY KEY,
      change_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      summary TEXT NOT NULL,
      detail JSONB NOT NULL DEFAULT '{}',
      actor TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS pearl_change_history_created_idx ON pearl_change_history (created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS pearl_change_history_entity_idx ON pearl_change_history (entity_type, entity_id)`;

  // Approved questions become regression checks. They are intentionally small
  // records: the answer engine remains in source control and the expected
  // outcome describes what must stay true after an edit.
  await db`
    CREATE TABLE IF NOT EXISTS pearl_test_cases (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      expected_outcome TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'retired')),
      source_question_id INTEGER REFERENCES research_chat_log(id) ON DELETE SET NULL,
      last_result TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS pearl_test_cases_status_idx ON pearl_test_cases (status, updated_at DESC)`;

  // pearl_topic_links was created on 2026-08-17 for a topic-overlay idea that
  // was never wired to any code, so the table only ever held nothing and read
  // as a feature that did not exist. Dropped as part of the Pearl plan Stage B.
  // When topic links are really built (Stage D), they arrive with their code.
  await db`DROP TABLE IF EXISTS pearl_topic_links`;

  // The PEARL source library (Pearl plan Stage C step 5). Before this existed,
  // reading a source website threw the original pages away and kept only short
  // extracts, so nobody could ever check what a claim was based on. One row
  // here is one page PEARL has read. Pages are never deleted: a page that
  // disappears from a site is archived, and a page whose content changes gets
  // a new row in the versions table underneath.
  await db`
    CREATE TABLE IF NOT EXISTS pearl_source_pages (
      id SERIAL PRIMARY KEY,
      source_id TEXT NOT NULL,
      url TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'page' CHECK (kind IN ('page', 'sitemap', 'asset')),
      title TEXT,
      heading TEXT,
      publisher TEXT,
      date_published TEXT,
      date_modified TEXT,
      http_status INTEGER,
      status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'unreachable')),
      error_message TEXT,
      used_in_evidence BOOLEAN NOT NULL DEFAULT FALSE,
      latest_version INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT,
      body_bytes INTEGER,
      first_read_at TIMESTAMPTZ,
      last_read_at TIMESTAMPTZ,
      last_changed_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS pearl_source_pages_live_url_idx ON pearl_source_pages (lower(url)) WHERE archived_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS pearl_source_pages_source_idx ON pearl_source_pages (source_id, status)`;
  // Hash of the page's CLEANED text (18 Aug 2026): pages with rotating promo
  // chrome hash differently on every visit in raw form, so full reloads were
  // appending versions of unchanged knowledge. A raw change whose cleaned
  // text is identical now just refreshes the hashes. See
  // src/lib/pearl/library-versioning.mjs for the decision rules.
  await db`ALTER TABLE pearl_source_pages ADD COLUMN IF NOT EXISTS clean_hash TEXT`;

  // The full stored text of each read of a page, one row per distinct
  // content version. This is the "nothing thrown away" part: full cleaned
  // text plus the page's own section structure, kept as it was on the day it
  // was read. Append-only by design.
  await db`
    CREATE TABLE IF NOT EXISTS pearl_source_page_versions (
      id BIGSERIAL PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES pearl_source_pages(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      title TEXT,
      heading TEXT,
      sections JSONB NOT NULL DEFAULT '[]',
      full_text TEXT NOT NULL DEFAULT '',
      publisher TEXT,
      date_published TEXT,
      date_modified TEXT,
      fetched_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (page_id, version)
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS pearl_source_page_versions_page_idx ON pearl_source_page_versions (page_id, version DESC)`;

  // Search index over the stored text (built for Stage D step 7): each page's
  // latest version, cut into readable passages at sentence boundaries. This
  // table is derived data — rebuilt from the versions table whenever a page
  // changes — so replacing a page's passages is not a deletion of knowledge.
  await db`
    CREATE TABLE IF NOT EXISTS pearl_source_passages (
      id BIGSERIAL PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES pearl_source_pages(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      position INTEGER NOT NULL,
      heading TEXT,
      passage_text TEXT NOT NULL,
      search_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading, '') || ' ' || passage_text)) STORED
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS pearl_source_passages_tsv_idx ON pearl_source_passages USING GIN (search_tsv)`;
  await db`CREATE INDEX IF NOT EXISTS pearl_source_passages_page_idx ON pearl_source_passages (page_id)`;

  // Pearl improvement proposals (Pearl plan Stage D step 8). Every improve
  // button in the dashboard creates a PROPOSAL — a before/after record that
  // does nothing until a person approves it. Approving a proposal executes
  // its payload (for example: create a terminology rule AND its saved test
  // together); rejecting it leaves Pearl untouched. Nothing is deleted —
  // decided proposals stay as the record of what was considered.
  await db`
    CREATE TABLE IF NOT EXISTS pearl_proposals (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('terminology_rule', 'answer_correction', 'ai_extraction', 'ai_summary', 'source_setting', 'citation_correction', 'source_refresh', 'source_extract', 'passage_boost', 'topic_link', 'layout_text')),
      title TEXT NOT NULL,
      summary TEXT,
      before_view JSONB NOT NULL DEFAULT '{}',
      after_view JSONB NOT NULL DEFAULT '{}',
      payload JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'archived')),
      created_by TEXT,
      decided_by TEXT,
      decided_at TIMESTAMPTZ,
      decision_note TEXT,
      source_question_id INTEGER REFERENCES research_chat_log(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS pearl_proposals_status_idx ON pearl_proposals (status, created_at DESC)`;
  // A live database created before citation corrections existed still carries
  // the old kind list in its check constraint, so refresh it here. Dropping
  // and re-adding is the only idempotent way to widen a check in Postgres.
  await db`ALTER TABLE pearl_proposals DROP CONSTRAINT IF EXISTS pearl_proposals_kind_check`;
  await db`ALTER TABLE pearl_proposals ADD CONSTRAINT pearl_proposals_kind_check CHECK (kind IN ('terminology_rule', 'answer_correction', 'ai_extraction', 'ai_summary', 'source_setting', 'citation_correction', 'source_refresh', 'source_extract', 'passage_boost', 'topic_link', 'layout_text'))`;

  // Approved citation corrections (dashboard audit fix 3, 18 Aug 2026).
  // Citations are baked into the generated evidence file at build time, so
  // before this table existed a wrong or missing source link could only be
  // fixed by a developer rebuild. One row here is one approved correction:
  // remove a link from a compound's answers, or add an approved one. Rows are
  // written ONLY by approving a citation_correction proposal, and the member
  // desk picks them up with the same page-load fetch as approved wording.
  await db`
    CREATE TABLE IF NOT EXISTS pearl_citation_overrides (
      id SERIAL PRIMARY KEY,
      compound_slug TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('remove', 'add')),
      url TEXT NOT NULL,
      label TEXT,
      detail TEXT,
      reason TEXT,
      proposal_id INTEGER REFERENCES pearl_proposals(id) ON DELETE SET NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      archived_at TIMESTAMPTZ
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS pearl_citation_overrides_slug_idx ON pearl_citation_overrides (compound_slug) WHERE archived_at IS NULL`;

  // All-or-nothing approval (Pearl repairs Stage D, 18 Aug 2026). A row
  // created by approving a proposal is stamped with that proposal's id under
  // a uniqueness rule, so a retried approval finds its earlier work instead
  // of duplicating it. Kept below the tables it references: pearl_proposals
  // and pearl_citation_overrides are only created above this point.
  await db`ALTER TABLE pearl_test_cases ADD COLUMN IF NOT EXISTS proposal_id INTEGER REFERENCES pearl_proposals(id) ON DELETE SET NULL`;
  await db`ALTER TABLE pearl_terminology_overrides ADD COLUMN IF NOT EXISTS proposal_id INTEGER REFERENCES pearl_proposals(id) ON DELETE SET NULL`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS pearl_test_cases_proposal_idx ON pearl_test_cases (proposal_id) WHERE proposal_id IS NOT NULL`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS pearl_terminology_proposal_idx ON pearl_terminology_overrides (proposal_id) WHERE proposal_id IS NOT NULL`;
  // Citations stored proposal ids before the uniqueness rule existed, and a
  // pre-fix retry could have written the same stamp twice. A duplicate would
  // make the index refuse to build and stop this whole schema pass, so keep
  // the stamp on the earliest row only (later duplicates keep their data,
  // just not the stamp). Idempotent: once unique, this touches nothing.
  await db`
    UPDATE pearl_citation_overrides SET proposal_id = NULL
    WHERE proposal_id IS NOT NULL AND id NOT IN (
      SELECT MIN(id) FROM pearl_citation_overrides WHERE proposal_id IS NOT NULL GROUP BY proposal_id
    )
  `;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS pearl_citation_overrides_proposal_idx ON pearl_citation_overrides (proposal_id) WHERE proposal_id IS NOT NULL`;

  // Passage search boosts (improve button d8c, 18 Aug 2026). A boosted
  // passage is shown first whenever it matches a question. Keyed by the
  // passage's own text hash rather than its row id, because passages are
  // derived data and their ids change when a page is re-read; if the text
  // itself changes, the boost honestly lapses with it. Rows are written ONLY
  // by approving a passage_boost proposal.
  await db`
    CREATE TABLE IF NOT EXISTS pearl_passage_boosts (
      id SERIAL PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES pearl_source_pages(id) ON DELETE CASCADE,
      passage_hash TEXT NOT NULL,
      note TEXT,
      proposal_id INTEGER REFERENCES pearl_proposals(id) ON DELETE SET NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (page_id, passage_hash)
    )
  `;

  // Answer layouts (Kieran's idea, scoped 18 Aug 2026). A layout is an
  // arrangement of the blocks an answer already has - reorder, hide, plus
  // custom text blocks the administrator writes. The one-line summary is
  // pinned by construction (the apply layer never touches it), custom words
  // stay invisible to members until their layout_text proposal is approved,
  // and a layout only reaches members through an assignment row that is
  // switched ON (default OFF). Switching it off is the instant revert.
  await db`
    CREATE TABLE IF NOT EXISTS pearl_answer_layouts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      blocks JSONB NOT NULL DEFAULT '[]',
      created_by TEXT,
      updated_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      archived_at TIMESTAMPTZ
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS pearl_layout_assignments (
      id SERIAL PRIMARY KEY,
      layout_id INTEGER NOT NULL REFERENCES pearl_answer_layouts(id) ON DELETE CASCADE,
      target_kind TEXT NOT NULL CHECK (target_kind IN ('compound', 'category')),
      target_value TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (layout_id, target_kind, target_value)
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS pearl_layout_assignments_live_idx ON pearl_layout_assignments (enabled) WHERE enabled = TRUE`;

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
