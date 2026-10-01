import type { requireDb } from '../client';

// Customers, their sessions, and orders with all their added columns.
//
// Moved out of schema.ts unchanged, in the order it already ran. Pure DDL:
// CREATE TABLE IF NOT EXISTS and idempotent ALTERs, safe to run again.
export async function ensureCustomersAndOrders(db: ReturnType<typeof requireDb>) {
  await db`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT,
      marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Free-text "where did you hear about Windsor Beauty?" field, shown in admin
  // and on the customer's own profile. Mandatory at registration since 2026 —
  // membership signup and the 10% discount are now the same single process.
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS referred_by TEXT`;
  // Optional social identity, collected only when a member says Instagram or
  // Facebook brought them here. Kept separate from referral reporting so every
  // channel still counts together.
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS social_profile TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS instagram_profile TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS facebook_profile TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS instagram_marketing_consent BOOLEAN NOT NULL DEFAULT FALSE`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS facebook_marketing_consent BOOLEAN NOT NULL DEFAULT FALSE`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_marketing_consent BOOLEAN NOT NULL DEFAULT FALSE`;

  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line1 TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line2 TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_city TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_postcode TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_country TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS membership_status TEXT NOT NULL DEFAULT 'member'`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS discount_code TEXT`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS discount_code_issued_at TIMESTAMPTZ`;

  // Lock-page (pre-launch) signup now creates a real customers row immediately
  // — "receive the 10% discount" and "become a member" are the same event,
  // regardless of which entry point is used — but a lock-page lead has no
  // password and (deliberately) no name yet, collected later when they
  // activate via /account/create-password or complete full /account/register.
  // password_hash/first_name/last_name must therefore be nullable; verifyPassword()
  // in src/lib/auth.ts must never be called on a null hash (see the login route).
  await db`ALTER TABLE customers ALTER COLUMN password_hash DROP NOT NULL`;
  await db`ALTER TABLE customers ALTER COLUMN first_name DROP NOT NULL`;
  await db`ALTER TABLE customers ALTER COLUMN last_name DROP NOT NULL`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'`;

  // Email verification — required before a customer is eligible for the 10%
  // signup discount code (closes the "sign up with fake emails to farm
  // codes" abuse path). New signups (both /account/register and the Coming
  // Soon /api/launch/subscribe) start unverified; the discount code is only
  // issued once the emailed verification link is clicked (see
  // /api/account/verify-email). Pre-existing accounts predate this feature
  // entirely and already proved their email by receiving real welcome mail —
  // backfilling them as verified avoids retroactively locking out real
  // members who have no way to "verify" an account created before this
  // column existed.
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE`;
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`;
  // Set once by /api/cron/verification-reminders when the single automatic
  // follow-up verification email goes out — the "exactly one reminder, ever"
  // guarantee is this column being checked before sending.
  await db`ALTER TABLE customers ADD COLUMN IF NOT EXISTS verification_reminder_sent_at TIMESTAMPTZ`;
  // One-time backfill, deliberately bounded to a fixed cutoff timestamp
  // (the moment this feature shipped) rather than an open-ended condition
  // like "account_status = 'active'" — both signup routes set account_status
  // to 'active' immediately at creation, before verification happens, so an
  // unbounded condition would silently re-verify every new unverified
  // signup again on the next ensureSchema() run (e.g. next deploy, or
  // clicking "Run Database Setup" again), defeating the whole feature. Safe
  // to leave this exact line in place permanently — once a row's
  // created_at is before the cutoff it can never become eligible again, and
  // every row created after the cutoff was never eligible in the first place.
  await db`UPDATE customers SET email_verified = TRUE, email_verified_at = created_at WHERE created_at < '2026-06-30 16:27:51+00' AND email_verified = FALSE`;

  // A match is a request for a person to check the welcome offer, not a ban.
  // The member can still sign in and order while this row is open.
  await db`
    CREATE TABLE IF NOT EXISTS opening_offer_reviews (
      customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'clear' CHECK (status IN ('clear', 'review', 'approved')),
      reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
      matched_customer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS opening_offer_reviews_status_idx ON opening_offer_reviews(status, checked_at DESC)`;
  // Review evidence remains visible, but legacy 'review' rows no longer imply
  // that a customer's discount is paused.
  await db`UPDATE opening_offer_reviews SET status = 'clear' WHERE status = 'review'`;

  // Advisory account/discount review. These records can inform a human decision,
  // but are deliberately disconnected from registration, checkout and code use.
  await db`
    CREATE TABLE IF NOT EXISTS security_review_cases (
      id BIGSERIAL PRIMARY KEY,
      dedupe_key TEXT UNIQUE NOT NULL,
      case_type TEXT NOT NULL DEFAULT 'possible_duplicate_account',
      subject_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      source_event TEXT NOT NULL,
      order_number TEXT,
      discount_code TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'legitimate_shared_network', 'confirmed_duplicate', 'dismissed')),
      evidence_band TEXT NOT NULL CHECK (evidence_band IN ('information', 'review', 'priority')),
      summary TEXT NOT NULL,
      matched_customer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      resolved_at TIMESTAMPTZ,
      reviewed_by TEXT,
      decision_note TEXT
    )
  `;
  await db`ALTER TABLE security_review_cases ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
  await db`ALTER TABLE security_review_cases ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 1`;
  await db`CREATE INDEX IF NOT EXISTS security_review_cases_status_idx ON security_review_cases(status, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS security_review_cases_customer_idx ON security_review_cases(subject_customer_id, created_at DESC)`;
  await db`
    CREATE TABLE IF NOT EXISTS security_review_decisions (
      id BIGSERIAL PRIMARY KEY,
      case_id BIGINT NOT NULL REFERENCES security_review_cases(id) ON DELETE CASCADE,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      actor TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS security_review_decisions_case_idx ON security_review_decisions(case_id, created_at DESC)`;
  await db`
    CREATE TABLE IF NOT EXISTS security_association_exemptions (
      id BIGSERIAL PRIMARY KEY,
      customer_id_low INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      customer_id_high INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      association_kind TEXT NOT NULL DEFAULT 'legitimate_shared_network',
      note TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ,
      CHECK (customer_id_low < customer_id_high)
    )
  `;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS security_association_active_idx ON security_association_exemptions(customer_id_low, customer_id_high, association_kind) WHERE revoked_at IS NULL`;

  await db`
    CREATE TABLE IF NOT EXISTS customer_sessions (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      email TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      items JSONB NOT NULL,
      subtotal NUMERIC(10,2) NOT NULL,
      discount_code TEXT,
      discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      shipping_label TEXT NOT NULL,
      shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
      total NUMERIC(10,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      shipping_address TEXT NOT NULL,
      tracking_number TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Additive columns for Royal Mail Click & Drop integration — structured
  // address fields (the original `shipping_address` is a flattened display
  // string) plus the identifiers needed to fetch a shipping label and avoid
  // sending duplicate "your order has shipped" emails. Safe to re-run.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_line1 TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_line2 TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_city TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_postcode TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_country TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone TEXT`;
  // Who the parcel is actually for, when that is not the person paying — a gift, or an order sent
  // straight to a friend. Royal Mail prints this instead of customer_name when it is set. Before
  // it existed the only way to get a different name onto a parcel was to type it into the first
  // line of the delivery address, which is what somebody had to do (task 77b818aa) and which then
  // came back as that customer's billing address on their next invoice. NULL on every existing
  // order, and NULL means "address it to the customer", exactly as before.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_recipient TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_order_id TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_weight_grams INTEGER`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_email_sent_at TIMESTAMPTZ`;

  // Payment integration columns — safe to add to existing databases.
  // payment_method: 'fena' (primary) | 'paypal' | 'manual' | 'cash' | 'bank_transfer'
  // fena_payment_id: Fena transaction reference returned by their create-payment API
  // paypal_order_id: PayPal order ID for manual/backup flow
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'fena'`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fena_payment_id TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_order_id TEXT`;
  // The moment money was actually confirmed. `created_at` is deliberately the
  // checkout-attempt time, so it cannot also be used as the sale time without
  // making abandoned Fena/PayPal attempts look like orders. Existing completed
  // orders predate this column; their creation time is the closest honest
  // historical fallback. Every new payment path stamps the real confirmation
  // time atomically with the paid status.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ`;
  await db`
    UPDATE orders
    SET payment_confirmed_at = created_at
    WHERE payment_confirmed_at IS NULL
      AND status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered', 'refunded')
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_orders_payment_confirmed_at ON orders (payment_confirmed_at DESC) WHERE payment_confirmed_at IS NOT NULL`;
  // Safe, unguessable customer recovery link plus the original Fena URL. The
  // URL is reused rather than generating several simultaneously-payable links.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_access_token TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fena_payment_url TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reminder_sent_at TIMESTAMPTZ`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_stock_decremented_at TIMESTAMPTZ`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_stock_items JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_restored_at TIMESTAMPTZ`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_access_token ON orders (payment_access_token) WHERE payment_access_token IS NOT NULL`;

  // Admin-controlled fulfilment + automation overrides for hand-made
  // invoices/orders (in-person cash sales, collection, etc.) — defaults
  // reproduce today's behaviour exactly, so no existing or checkout-created
  // order changes behaviour. fulfilment_type: 'royal_mail' | 'collection' |
  // 'hand_delivered' | 'no_delivery' | 'other_manual'.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment_type TEXT NOT NULL DEFAULT 'royal_mail'`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS automation_flags JSONB NOT NULL DEFAULT '{"sendPaymentLink":true,"sendConfirmation":true,"triggerRoyalMail":true,"sendDispatchEmail":true}'`;

  // PayPal-only 3% processing fee, already folded into `total` but stored
  // separately so admin/email views can show it as its own line item.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_fee NUMERIC(10,2) NOT NULL DEFAULT 0`;

  // Shipping workflow columns — populated as the order moves through dispatch.
  // exported_at: set when this order is included in a Royal Mail Click & Drop CSV export
  // dispatched_at: set when tracking number is confirmed and parcel is handed to carrier
  // admin_notes: freeform internal notes (not visible to customer)
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_notes TEXT`;

  // Royal Mail Click & Drop label/dispatch columns. royal_mail_label_status is
  // independent of `status` so "label created" can be tracked without forcing
  // a status transition — the admin still chooses when to mark an order
  // dispatched. tracking_url lets the admin/email link straight to Royal
  // Mail's tracking page. parcel_package_format + packaging_weight_grams
  // record what was actually sent to the Royal Mail API for this order.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_label_status TEXT NOT NULL DEFAULT 'none'`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_label_error TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_package_format TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS packaging_weight_grams INTEGER`;

  // Royal Mail diagnostics, added for the dispatch audit: real timestamps for
  // the connection-status panel ("last successful label created" / "last API
  // error"), and the full raw API response (success or failure) so a future
  // problem can be debugged from what Royal Mail actually said, not just our
  // own summarized message.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_label_created_at TIMESTAMPTZ`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_label_error_at TIMESTAMPTZ`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS royal_mail_last_response TEXT`;

  // Automatic promotion rules (BOGO/bundle/spend-threshold) discount applied
  // at order time, recorded alongside the existing manual discount_amount.
  // applied_rules is a point-in-time snapshot, not a live FK, so it stays
  // correct even if the rule that produced it is later edited or deleted.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS rule_discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS applied_rules JSONB NOT NULL DEFAULT '[]'`;

  // How this order came to be attached to the account it is attached to (task e0858a61).
  //
  // An order carrying a customer_id does NOT prove the person was signed in. Checkout links an
  // order to an account either from a live session OR by matching the typed email to an existing
  // customer, and until now those two were indistinguishable once the order was saved. That is
  // the exact question that could not be answered about order WB-63U39T.
  //
  //   signed_in    — a valid session existed at checkout; the account is proven
  //   email_match  — no session; the typed email matched an existing account, so it was linked
  //   guest        — no session and no matching account
  //   admin_created— made from the invoice system by the shop, not by a customer at checkout
  //   not_recorded — placed before this column existed. NOT a guess: it means we do not know
  //
  // Defaults to 'not_recorded' so every pre-existing order says honestly that it was not
  // captured, rather than being backfilled with an invented answer.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS account_link TEXT NOT NULL DEFAULT 'not_recorded'`;

  /* WHAT THE CUSTOMER CONFIRMED BEFORE THEY PAID (Samuel, 10 September 2026).
   *
   * Checkout asks two things before the Pay button unlocks: that they are over 18 and that what
   * they are buying is not for human consumption, and that they have read the Terms and will
   * adhere to them. Ticking a box that leaves no trace proves nothing. The point of asking is to
   * be able to answer "did this customer confirm it?" about a specific order, months later.
   *
   * THE SENTENCES ARE STORED, NOT JUST THE TICKS. A boolean called `researchUse` records that
   * somebody ticked something. It does not record WHAT. Wording changes, and when it does, every
   * older order would silently start reading as though that customer had agreed to today's
   * sentence rather than the one actually on their screen. So each order keeps the exact words it
   * was shown, and an order from last year still says what it always said.
   *
   * NULL means the order predates this, or was created by the invoice system rather than by a
   * customer at checkout. It means "not captured", never "declined" and never "assumed yes".
   */
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_confirmations JSONB`;

  // Index for Fena webhook lookups — allows finding an order by the payment ID
  // returned from Fena without a full table scan.
  await db`CREATE INDEX IF NOT EXISTS idx_orders_fena_payment_id ON orders (fena_payment_id) WHERE fena_payment_id IS NOT NULL`;

}
