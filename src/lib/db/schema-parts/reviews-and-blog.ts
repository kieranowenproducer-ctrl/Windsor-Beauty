import type { requireDb } from '../client';

// Reviews and their indexes.
//
// Moved out of schema.ts unchanged, in the order it already ran. Pure DDL:
// CREATE TABLE IF NOT EXISTS and idempotent ALTERs, safe to run again.
export async function ensureReviews(db: ReturnType<typeof requireDb>) {
  // Customer-submitted product/site reviews, moderated from /admin/reviews
  // before appearing on the public /reviews page. `product_slug` is stored
  // for future per-product display but is not surfaced anywhere yet.
  await db`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      title TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      product_slug TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Additive — a single official admin reply per review, shown publicly
  // underneath the customer's review on /reviews.
  await db`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS admin_reply TEXT`;
  await db`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS admin_reply_created_at TIMESTAMPTZ`;
  await db`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS admin_reply_updated_at TIMESTAMPTZ`;

  // Additive — optional customer-uploaded photo attached to a review.
  await db`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS image_url TEXT`;

  // Maps an approved review onto one or more product pages. A review
  // submitted directly from a product page gets one row here automatically
  // (so it shows on that product immediately); admin can add/remove rows for
  // any review without touching the underlying `reviews` row, so a review
  // always stays on the main /reviews page regardless of its mappings.
  await db`
    CREATE TABLE IF NOT EXISTS review_product_links (
      id SERIAL PRIMARY KEY,
      review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      product_slug TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (review_id, product_slug)
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_review_product_links_product ON review_product_links (product_slug)`;
  await db`CREATE INDEX IF NOT EXISTS idx_review_product_links_review ON review_product_links (review_id)`;

  await db`CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews (status)`;

  await db`CREATE INDEX IF NOT EXISTS idx_marketing_contacts_token ON marketing_contacts (unsubscribe_token)`;

  await db`CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_ip ON admin_login_attempts (ip_address, attempted_at)`;
  await db`CREATE INDEX IF NOT EXISTS idx_signup_attempts_ip ON signup_attempts (ip_address, attempted_at)`;
  await db`CREATE INDEX IF NOT EXISTS idx_form_attempts_lookup ON form_attempts (form, ip_address, attempted_at)`;
  await db`CREATE INDEX IF NOT EXISTS idx_discount_signups_code ON discount_signups (code)`;
  await db`CREATE INDEX IF NOT EXISTS idx_stock_alerts_slug_pending ON stock_alerts (product_slug) WHERE notified_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email)`;
  await db`CREATE INDEX IF NOT EXISTS idx_customer_sessions_token ON customer_sessions (token)`;
  await db`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens (token)`;
  await db`CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens (token)`;
  await db`CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders (customer_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders (order_number)`;

}
