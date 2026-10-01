import { mergeInvoiceCustomers, type InvoiceCustomerMatch, type InvoiceCustomerRow } from './invoiceCustomerMerge';
import type { Product } from '@/data/products';
import type { AppliedRuleSummary } from './promotionRules';
import { buildTrackingUrl } from './royalMail';
import { sql, isDbConfigured, requireDb } from './db/client';
import { CUSTOMER_EVENT_CATEGORIES } from './automationFailureKinds';
// The Orders row shapes live in ./db/orders.ts now. Imported for use below as
// well as re-exported further down, because `export type { X } from` publishes
// a name without bringing it into this file's own scope.
import {
  ensureOrderArchiving,
  ensureOrderActivityClearing,
  ensureRoyalMailParcelState,
  ensureOrderPaymentConfirmationTracking,
  type OrderItemRecord,
  type OrderRow,
} from './db/orders';
// The customer CRM profile below still calls into the audit log, so it is
// imported as well as re-exported. Nothing outside this file is affected.

// Shared DB client + schema setup were extracted into ./db/ on 2026-07-05 to
// shrink this file. Re-exported here so every existing '@/lib/db' import keeps
// working unchanged.
export { sql, isDbConfigured };
export { ensureSchema } from './db/schema';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE IS, AND HOW TO FIND YOUR WAY AROUND IT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Most of the shop's database functions live here. It is about 2,600 lines and
 * 205 other files import from it, so it is worth a minute of orientation before
 * you edit. A further 28 files in ./db/ hold the parts that have been unpicked
 * out of here so far, and every one of them is re-exported below, which is why
 * no call site has ever had to change.
 *
 * TO FIND A SECTION: search for its name with the box-drawing dashes, e.g.
 * "─── Orders". The sections are listed below in the order they appear.
 *
 *   Verification codes .......... codes printed on products, and their imports
 *   Batches ..................... product batches those codes belong to
 *   Spam protection ............. rate limits on verification, login, signup
 *   Discount signups ............ the 10% membership code, and launch subscribers
 *   Discount codes .............. staff-created promo codes
 *   Customers ................... accounts, profiles, deletion, admin lists
 *   Customer sessions ........... who is logged in
 *   Password reset tokens ....... forgotten-password links
 *   Email verification tokens ... confirm-your-address links and reminders
 *   Orders ...................... THE BIG ONE. Creating, listing, statuses,
 *                                 store stats, addresses, tracking, Royal Mail.
 *                                 Its row shapes and deleteOrder now live in
 *                                 ./db/orders.ts, which is where the rest of
 *                                 this section should go, a piece at a time.
 *   Product visibility .......... the show/hide toggle
 *   Admin sidebar custom links .. staff-added menu entries
 *   Product stock ............... whole-product stock (the older path)
 *   Product variant stock ....... per-strength stock (THE LIVE PATH — use this)
 *   Stock alerts ................ "tell me when it is back"
 *   Custom products ............. staff edits layered over the code catalogue
 *   Payment integration ......... Fena and PayPal ids, marking orders paid
 *   Shipping workflow ........... dispatch, CSV export, tracking
 *   Invoices .................... moved to ./db/invoices.ts on 2026-08-16
 *   Category settings ........... categories, renaming, ordering
 *   Site content ................ staff-editable policy wording
 *   Promotions .................. the homepage banner
 *   Promotion rules ............. automatic bundle and spend-threshold offers
 *   Shipping settings ........... global delivery prices and free threshold
 *   QR Campaign Tracking ........ scan tracking and its reports
 *   Verification audit log ...... who verified what, and when
 *   Customer last login ......... one small write
 *   Customer full profile ....... the CRM view of one customer
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THREE THINGS TO KNOW BEFORE YOU CHANGE ANYTHING HERE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 1. NEW WORK USUALLY BELONGS IN ./db/, NOT HERE.
 *    ./db/ holds smaller files, one per subject (reviews, blog, bans,
 *    marketing, enquiries...). That is where this file is gradually being
 *    unpicked. Nobody is rewriting it in one go — that would be a large,
 *    risky change to a live shop for no customer benefit. Take a piece with
 *    you when you are already working nearby.
 *
 *    ONE RULE WHEN YOU DO: a file in ./db/ must never import from this one.
 *    Dependencies point inwards only (./db/x.ts may use ./db/client.ts or
 *    another ./db/ file), because a cycle between this file and one of its own
 *    parts is a genuinely nasty thing to debug. When the piece you are moving
 *    needs something that is still in here, move that too, the way deleteOrder
 *    went to ./db/orders.ts so ./db/invoices.ts could cascade to it.
 *    `npm run check:data-integrity` fails if that rule is broken.
 *
 * 2. EVERY QUERY USES TAGGED TEMPLATES, AND THAT IS A SAFETY FEATURE.
 *    Writing sql`... WHERE id = ${id}` sends the value separately from the
 *    query, so a customer cannot smuggle commands into it. Never build a
 *    query by joining strings together, however convenient it looks.
 *
 * 3. IF THERE IS NO DATABASE, READS RETURN EMPTY RATHER THAN FAILING.
 *    isDbConfigured() and requireDb() implement that. It is why the site
 *    builds and runs locally with no database connected. Keep new functions
 *    behaving the same way.
 */


// ─── Verification codes ──────────────────────────────────────────────────────
// Moved to ./db/verificationCodes.ts on 2026-08-11. Re-exported here so every existing
// '@/lib/db' import keeps working unchanged.


// ─── Batches ─────────────────────────────────────────────────────────────────
// Moved to ./db/batches.ts on 2026-08-11. Re-exported here so every existing
// '@/lib/db' import keeps working unchanged.
export { listBatches, addBatch, setBatchActive, updateBatch } from './db/batches';
export type { BatchRow } from './db/batches';


// ─── Spam protection ─────────────────────────────────────────────────────────
// Moved to ./db/spamProtection.ts on 2026-08-11. Re-exported here so every existing
// '@/lib/db' import keeps working unchanged.
export { isAdminLoginRateLimited, isSignupRateLimited, logSignupAttempt, logAdminLoginAttempt } from './db/spamProtection';


// ─── Discount signups ────────────────────────────────────────────────────────

export interface DiscountSignupRow {
  id: number;
  email: string;
  code: string;
  marketing_consent: boolean;
  status: 'active' | 'used';
  issued_at: string;
  used_at: string | null;
}

export async function findDiscountSignupByEmail(email: string): Promise<DiscountSignupRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM discount_signups WHERE lower(email) = lower(${email}) LIMIT 1
  `;
  return (rows[0] as DiscountSignupRow) ?? null;
}

export async function createDiscountSignup(params: {
  email: string;
  code: string;
  marketingConsent: boolean;
}): Promise<DiscountSignupRow | null> {
  const db = requireDb();
  const rows = await db`
    INSERT INTO discount_signups (email, code, marketing_consent)
    VALUES (${params.email}, ${params.code}, ${params.marketingConsent})
    ON CONFLICT (email) DO NOTHING
    RETURNING *
  `;
  return (rows[0] as DiscountSignupRow) ?? null;
}

export interface LaunchSubscriberRow {
  id: number;
  email: string;
  discount_code: string | null;
  created_at: string;
}

export async function findLaunchSubscriberByEmail(email: string): Promise<LaunchSubscriberRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM launch_subscribers WHERE lower(email) = lower(${email}) LIMIT 1
  `;
  return (rows[0] as LaunchSubscriberRow) ?? null;
}

export async function createLaunchSubscriber(email: string): Promise<LaunchSubscriberRow | null> {
  const db = requireDb();
  const rows = await db`
    INSERT INTO launch_subscribers (email)
    VALUES (${email})
    ON CONFLICT (email) DO NOTHING
    RETURNING *
  `;
  return (rows[0] as LaunchSubscriberRow) ?? null;
}

export async function listLaunchSubscribers(): Promise<LaunchSubscriberRow[]> {
  const db = requireDb();
  const rows = await db`SELECT * FROM launch_subscribers ORDER BY created_at DESC`;
  return rows as LaunchSubscriberRow[];
}

export async function deleteLaunchSubscriber(id: number): Promise<boolean> {
  const db = requireDb();
  const result = await db`DELETE FROM launch_subscribers WHERE id = ${id}` as unknown as { count: number };
  return result.count > 0;
}

export async function setLaunchSubscriberDiscountCode(email: string, code: string): Promise<void> {
  const db = requireDb();
  await db`UPDATE launch_subscribers SET discount_code = ${code} WHERE lower(email) = lower(${email})`;
}

export interface LaunchSubscriberWithStatus extends LaunchSubscriberRow {
  discount_signup_status: 'active' | 'used' | null;
  has_account: boolean;
  // id of the joined customers row, so the dashboard can link a subscriber
  // straight to their editable record. Null when they have no account yet.
  customer_id: number | null;
  email_verified: boolean;
}

// Left join by code (not a FK — discount_signups.email is the real link,
// but joining on code mirrors the exact pattern already used elsewhere for
// customers.discount_code, and correctly returns NULL status for a
// historical subscriber row that hasn't been lazily issued a code yet).
// has_account / email_verified drive the admin dashboard status chips: a
// subscriber with a stored code can still be unverified (code ready, welcome
// email not yet earned), and a legacy subscriber may have no customers row
// at all (fixed by the migrate button).
export async function listLaunchSubscribersWithStatus(): Promise<LaunchSubscriberWithStatus[]> {
  const db = requireDb();
  const rows = await db`
    SELECT ls.*, ds.status AS discount_signup_status,
           (c.id IS NOT NULL) AS has_account,
           c.id AS customer_id,
           COALESCE(c.email_verified, FALSE) AS email_verified
    FROM launch_subscribers ls
    LEFT JOIN discount_signups ds ON ls.discount_code IS NOT NULL AND upper(ds.code) = upper(ls.discount_code)
    LEFT JOIN customers c ON lower(c.email) = lower(ls.email)
    ORDER BY ls.created_at DESC
  `;
  return rows as LaunchSubscriberWithStatus[];
}

// One-off migration for subscribers who signed up on /coming-soon before the
// lock page started creating a real customers row directly (see
// /api/launch/subscribe). Admin-triggered, not automatic on deploy, so the
// created/skipped counts can be reviewed against real production data first.
// Phone/referredBy are left null — not knowable retroactively — and
// marketingConsent defaults false since no consent was ever recorded for
// these historical signups.
export async function migrateLaunchSubscribersToCustomers(): Promise<{ created: number; skipped: number; errors: number }> {
  const subscribers = await listLaunchSubscribers();
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const sub of subscribers) {
    try {
      const existing = await findCustomerByEmail(sub.email);
      if (existing) {
        skipped += 1;
        continue;
      }
      const customer = await createCustomer({
        email: sub.email,
        passwordHash: null,
        firstName: null,
        lastName: null,
        phone: null,
        marketingConsent: false,
        accountStatus: 'pending_password',
      });
      if (!customer) {
        errors += 1;
        continue;
      }
      if (sub.discount_code) {
        await setCustomerDiscountCode(customer.id, sub.discount_code);
      }
      created += 1;
    } catch {
      errors += 1;
    }
  }

  return { created, skipped, errors };
}

export async function findActiveDiscountCode(code: string): Promise<DiscountSignupRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM discount_signups WHERE upper(code) = upper(${code}) AND status = 'active' LIMIT 1
  `;
  return (rows[0] as DiscountSignupRow) ?? null;
}

export async function redeemDiscountCode(code: string): Promise<boolean> {
  const db = requireDb();
  const rows = await db`
    UPDATE discount_signups
    SET status = 'used', used_at = now()
    WHERE upper(code) = upper(${code}) AND status = 'active'
    RETURNING id
  `;
  return rows.length > 0;
}

// Admin override for a signup code's status, used from the customers page.
// Unlike redeemDiscountCode this is not guarded on the current status, because
// its whole purpose is to correct one: burning a code for someone who already
// had their discount another way, or undoing that if it was a mis-click.
// Returns the updated row, or null when no code matches.
export async function setDiscountSignupStatus(
  code: string,
  status: 'active' | 'used'
): Promise<DiscountSignupRow | null> {
  const db = requireDb();
  // used_at is stamped when burning and cleared when reactivating, so the row
  // never claims a redemption date for a code that is available again.
  const rows = status === 'used'
    ? await db`
        UPDATE discount_signups
        SET status = 'used', used_at = now()
        WHERE upper(code) = upper(${code})
        RETURNING *
      `
    : await db`
        UPDATE discount_signups
        SET status = 'active', used_at = NULL
        WHERE upper(code) = upper(${code})
        RETURNING *
      `;
  return (rows[0] as DiscountSignupRow) ?? null;
}

// Status-agnostic — used at order-placement time to authoritatively recompute
// the discount amount for an already-redeemed (status = 'used') signup code,
// since by that point findActiveDiscountCode would no longer find it.
/**
 * The unused welcome code belonging to this email address, if there is one.
 *
 * Added 18 September 2026. A member's own code lived in a welcome email and on their account page,
 * and nowhere near the basket, so somebody could sign up and check out at full price eight minutes
 * later with a perfectly good code in their inbox. The basket now asks this and offers it to them.
 */
export async function findUnusedWelcomeCodeForEmail(email: string): Promise<string | null> {
  const db = requireDb();
  const rows = await db`
    SELECT code FROM discount_signups
    WHERE lower(email) = lower(${email}) AND status = 'active'
    ORDER BY issued_at DESC LIMIT 1
  `;
  return (rows[0] as { code: string } | undefined)?.code ?? null;
}

export async function findDiscountSignupByCode(code: string): Promise<DiscountSignupRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM discount_signups WHERE upper(code) = upper(${code}) LIMIT 1
  `;
  return (rows[0] as DiscountSignupRow) ?? null;
}

// ─── Discount codes (admin-managed promo codes) ─────────────────────────────

export interface DiscountCodeRow {
  id: number;
  code: string;
  percentage: number | null;
  discount_type: string;
  fixed_amount: string | null;
  scope_type: string;
  scope_categories: unknown;
  scope_product_slugs: unknown;
  active: boolean;
  expires_at: string | null;
  usage_limit: number | null;
  times_redeemed: number;
  min_order_value: string | null;
  created_at: string;
}

export async function listDiscountCodes(): Promise<DiscountCodeRow[]> {
  const db = requireDb();
  const rows = await db`SELECT * FROM discount_codes ORDER BY created_at DESC`;
  return rows as DiscountCodeRow[];
}

export async function createDiscountCode(params: {
  code: string;
  discountType: string;
  percentage: number | null;
  fixedAmount: number | null;
  scopeType: string;
  scopeCategories: string[];
  scopeProductSlugs: string[];
  expiresAt: Date | null;
  usageLimit: number | null;
  minOrderValue: number | null;
}): Promise<DiscountCodeRow | null> {
  const db = requireDb();
  const rows = await db`
    INSERT INTO discount_codes (
      code, percentage, discount_type, fixed_amount, scope_type, scope_categories, scope_product_slugs,
      expires_at, usage_limit, min_order_value
    )
    VALUES (
      ${params.code}, ${params.percentage}, ${params.discountType}, ${params.fixedAmount}, ${params.scopeType},
      ${JSON.stringify(params.scopeCategories)}, ${JSON.stringify(params.scopeProductSlugs)},
      ${params.expiresAt}, ${params.usageLimit}, ${params.minOrderValue}
    )
    ON CONFLICT (code) DO NOTHING
    RETURNING *
  `;
  return (rows[0] as DiscountCodeRow) ?? null;
}

export async function setDiscountCodeActive(id: number, active: boolean): Promise<boolean> {
  const db = requireDb();
  const rows = await db`UPDATE discount_codes SET active = ${active} WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function updateDiscountCode(id: number, params: {
  code: string;
  discountType: string;
  percentage: number | null;
  fixedAmount: number | null;
  scopeType: string;
  scopeCategories: string[];
  scopeProductSlugs: string[];
  expiresAt: Date | null;
  usageLimit: number | null;
  minOrderValue: number | null;
  active: boolean;
}): Promise<DiscountCodeRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE discount_codes
    SET code = ${params.code}, percentage = ${params.percentage},
        discount_type = ${params.discountType}, fixed_amount = ${params.fixedAmount},
        scope_type = ${params.scopeType}, scope_categories = ${JSON.stringify(params.scopeCategories)},
        scope_product_slugs = ${JSON.stringify(params.scopeProductSlugs)},
        expires_at = ${params.expiresAt}, usage_limit = ${params.usageLimit},
        min_order_value = ${params.minOrderValue}, active = ${params.active}
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as DiscountCodeRow) ?? null;
}

export async function deleteDiscountCode(id: number): Promise<boolean> {
  const db = requireDb();
  const rows = await db`DELETE FROM discount_codes WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

// Status-agnostic lookup — used both by validation (to give a specific reason
// when a code can't be applied) and by order placement (to authoritatively
// recompute the discount amount for an already-redeemed code).
export async function findDiscountCodeByCode(code: string): Promise<DiscountCodeRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM discount_codes WHERE upper(code) = upper(${code}) LIMIT 1
  `;
  return (rows[0] as DiscountCodeRow) ?? null;
}

// Atomically increments the redemption counter only if the code is still
// usable right now — mirrors the guarded UPDATE pattern in
// decrementProductStock, so a usage-limited code can never be over-redeemed
// even under concurrent requests.
export async function redeemDiscountCodeAtomic(code: string): Promise<DiscountCodeRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE discount_codes
    SET times_redeemed = times_redeemed + 1
    WHERE upper(code) = upper(${code})
      AND active = true
      AND (expires_at IS NULL OR expires_at > now())
      AND (usage_limit IS NULL OR times_redeemed < usage_limit)
    RETURNING *
  `;
  return (rows[0] as DiscountCodeRow) ?? null;
}

// ─── Customers ───────────────────────────────────────────────────────────────

export interface CustomerRow {
  id: number;
  email: string;
  // Nullable for a lock-page lead created via /api/launch/subscribe — see
  // account_status below. Never pass a null password_hash to verifyPassword().
  password_hash: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  marketing_consent: boolean;
  referred_by: string | null;
  social_profile: string | null;
  instagram_profile: string | null;
  facebook_profile: string | null;
  instagram_marketing_consent: boolean;
  facebook_marketing_consent: boolean;
  phone_marketing_consent: boolean;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_postcode: string | null;
  address_country: string | null;
  membership_status: string;
  discount_code: string | null;
  discount_code_issued_at: string | null;
  // Permanent first-touch QR campaign attribution — set once at registration.
  qr_campaign_id: number | null;
  qr_campaign_slug: string | null;
  qr_campaign_name: string | null;
  qr_campaign_type: string | null;
  qr_partner_name: string | null;
  created_at: string;
  // 'active' — normal member, can log in. 'pending_password' — a lock-page
  // lead with a real customer/discount-code row but no password yet; first
  // login attempt must redirect to /account/create-password instead of
  // checking a password that doesn't exist.
  account_status: string;
  // Gates eligibility for the 10% signup discount code — see the
  // ensureSchema backfill comment near email_verification_tokens for why
  // pre-existing rows are TRUE by default and only new signups start FALSE.
  email_verified: boolean;
  email_verified_at: string | null;
  // Set by the one-time automatic reminder cron — see
  // listCustomersNeedingVerificationReminder().
  verification_reminder_sent_at: string | null;
  // Set when an admin shuts this account (task 9cd55f28). Not null means the account cannot sign
  // in and cannot place an order, even as a guest on the same email. Nothing is deleted by a ban
  // and it can be lifted, so this is the whole of the enforcement: see src/lib/db/bans.ts.
  banned_at: string | null;
  banned_reason: string | null;
  banned_by: string | null;
}

export async function createCustomer(params: {
  email: string;
  // Both null for a lock-page lead (see account_status) — a fully registered
  // member always passes real values for both.
  passwordHash: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  marketingConsent: boolean;
  referredBy?: string | null;
  socialProfile?: string | null;
  instagramProfile?: string | null;
  facebookProfile?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressCity?: string | null;
  addressPostcode?: string | null;
  addressCountry?: string | null;
  qrCampaignId?: number | null;
  qrCampaignSlug?: string | null;
  qrCampaignName?: string | null;
  qrCampaignType?: string | null;
  qrPartnerName?: string | null;
  accountStatus?: 'active' | 'pending_password';
}): Promise<CustomerRow | null> {
  const db = requireDb();
  const insert = () => db`
    INSERT INTO customers (
      email, password_hash, first_name, last_name, phone, marketing_consent, referred_by, social_profile,
      instagram_profile, facebook_profile, instagram_marketing_consent, facebook_marketing_consent, phone_marketing_consent,
      address_line1, address_line2, address_city, address_postcode, address_country,
      qr_campaign_id, qr_campaign_slug, qr_campaign_name, qr_campaign_type, qr_partner_name,
      account_status
    )
    VALUES (
      ${params.email}, ${params.passwordHash}, ${params.firstName}, ${params.lastName},
      ${params.phone}, ${params.marketingConsent}, ${params.referredBy ?? null}, ${params.socialProfile ?? null},
      ${params.instagramProfile ?? null}, ${params.facebookProfile ?? null},
      ${params.marketingConsent && Boolean(params.instagramProfile)},
      ${params.marketingConsent && Boolean(params.facebookProfile)},
      ${params.marketingConsent && Boolean(params.phone)},
      ${params.addressLine1 ?? null}, ${params.addressLine2 ?? null}, ${params.addressCity ?? null},
      ${params.addressPostcode ?? null}, ${params.addressCountry ?? null},
      ${params.qrCampaignId ?? null}, ${params.qrCampaignSlug ?? null},
      ${params.qrCampaignName ?? null}, ${params.qrCampaignType ?? null}, ${params.qrPartnerName ?? null},
      ${params.accountStatus ?? 'active'}
    )
    ON CONFLICT (email) DO NOTHING
    RETURNING *
  `;
  let rows;
  try {
    rows = await insert();
  } catch (error) {
    if (!isUndefinedColumnError(error)) throw error;
    const { ensureSchema } = await import('./db/schema');
    await ensureSchema();
    rows = await insert();
  }
  return (rows[0] as CustomerRow) ?? null;
}

// Activates a lock-page lead (account_status='pending_password') into a full
// member — used by both /account/create-password (minimal: name + password)
// and /account/register completing a pre-existing lead (full registration,
// including address). The WHERE guard means this is a no-op (returns null)
// if the row has already been activated or doesn't exist, so it can never
// silently overwrite a genuinely active member's data.
export async function completePendingCustomer(
  customerId: number,
  params: {
    passwordHash: string;
    // Optional — the Coming Soon page does not collect a name, so a lead
    // can be activated with a password alone and keep its existing (null)
    // name. /account/create-password and /account/register always pass
    // real values here, which simply overwrite the null via COALESCE.
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    marketingConsent?: boolean;
    referredBy?: string | null;
    socialProfile?: string | null;
    instagramProfile?: string | null;
    facebookProfile?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    addressCity?: string | null;
    addressPostcode?: string | null;
    addressCountry?: string | null;
  }
): Promise<CustomerRow | null> {
  const db = requireDb();
  const activate = () => db`
    UPDATE customers SET
      password_hash = ${params.passwordHash},
      first_name = COALESCE(${params.firstName ?? null}, first_name),
      last_name = COALESCE(${params.lastName ?? null}, last_name),
      phone = COALESCE(${params.phone ?? null}, phone),
      marketing_consent = COALESCE(${params.marketingConsent ?? null}, marketing_consent),
      referred_by = COALESCE(${params.referredBy ?? null}, referred_by),
      social_profile = COALESCE(${params.socialProfile ?? null}, social_profile),
      instagram_profile = ${params.instagramProfile ?? null},
      facebook_profile = ${params.facebookProfile ?? null},
      instagram_marketing_consent = ${Boolean(params.marketingConsent && params.instagramProfile)},
      facebook_marketing_consent = ${Boolean(params.marketingConsent && params.facebookProfile)},
      phone_marketing_consent = ${Boolean(params.marketingConsent && params.phone)},
      address_line1 = COALESCE(${params.addressLine1 ?? null}, address_line1),
      address_line2 = COALESCE(${params.addressLine2 ?? null}, address_line2),
      address_city = COALESCE(${params.addressCity ?? null}, address_city),
      address_postcode = COALESCE(${params.addressPostcode ?? null}, address_postcode),
      address_country = COALESCE(${params.addressCountry ?? null}, address_country),
      account_status = 'active'
    WHERE id = ${customerId} AND account_status = 'pending_password'
    RETURNING *
  `;
  let rows;
  try {
    rows = await activate();
  } catch (error) {
    if (!isUndefinedColumnError(error)) throw error;
    const { ensureSchema } = await import('./db/schema');
    await ensureSchema();
    rows = await activate();
  }
  return (rows[0] as CustomerRow) ?? null;
}

export async function setCustomerDiscountCode(customerId: number, code: string): Promise<void> {
  const db = requireDb();
  await db`UPDATE customers SET discount_code = ${code}, discount_code_issued_at = now() WHERE id = ${customerId}`;
}

export async function findCustomerByEmail(email: string): Promise<CustomerRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM customers WHERE lower(email) = lower(${email}) LIMIT 1
  `;
  return (rows[0] as CustomerRow) ?? null;
}

export async function findCustomerById(id: number): Promise<CustomerRow | null> {
  const db = requireDb();
  const rows = await db`SELECT * FROM customers WHERE id = ${id} LIMIT 1`;
  return (rows[0] as CustomerRow) ?? null;
}

export async function updateCustomerProfile(
  id: number,
  params: {
    phone: string | null;
    marketingConsent: boolean;
    instagramProfile: string | null;
    facebookProfile: string | null;
    instagramMarketingConsent: boolean;
    facebookMarketingConsent: boolean;
    phoneMarketingConsent: boolean;
  }
): Promise<CustomerRow | null> {
  const db = requireDb();
  const save = () => db`
    UPDATE customers
    SET phone = ${params.phone}, marketing_consent = ${params.marketingConsent},
        instagram_profile = ${params.instagramProfile}, facebook_profile = ${params.facebookProfile},
        instagram_marketing_consent = ${params.instagramMarketingConsent && Boolean(params.instagramProfile)},
        facebook_marketing_consent = ${params.facebookMarketingConsent && Boolean(params.facebookProfile)},
        phone_marketing_consent = ${params.phoneMarketingConsent && Boolean(params.phone)}
    WHERE id = ${id}
    RETURNING *
  `;
  let rows;
  try {
    rows = await save();
  } catch (error) {
    if (!isUndefinedColumnError(error)) throw error;
    const { ensureSchema } = await import('./db/schema');
    await ensureSchema();
    rows = await save();
  }
  return (rows[0] as CustomerRow) ?? null;
}

// Admin-only rename (e.g. fixing a typo, or naming a pending-password lead
// that signed up before names were collected). Customer-facing profile
// edits go through updateCustomerProfile above instead.
export async function updateCustomerName(
  id: number,
  params: { firstName: string; lastName: string }
): Promise<CustomerRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE customers
    SET first_name = ${params.firstName}, last_name = ${params.lastName}
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as CustomerRow) ?? null;
}

// Permanently removes a customer account. customer_sessions and
// password_reset_tokens cascade-delete with the row; orders, marketing_contacts,
// and reviews keep their own copy of the relevant details (email, customer_name,
// etc.) and just have customer_id set to NULL — past order history is never lost.
// Admin edit of everything on a customer record a human can legitimately
// correct: a mistyped email, a new phone, a misspelled "how they heard about us"
// (which is what groups them under a referral partner), and a changed address.
// Deliberately NOT here: discount_code, the qr_campaign_* first-touch attribution
// (documented as permanent), created_at, account/membership status and the
// password — none of those are typos to fix.
export async function updateCustomerDetails(
  id: number,
  params: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    referredBy: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    addressCity: string | null;
    addressPostcode: string | null;
    addressCountry: string | null;
    marketingConsent: boolean;
  }
): Promise<CustomerRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE customers
    SET first_name = ${params.firstName},
        last_name = ${params.lastName},
        email = ${params.email},
        phone = ${params.phone},
        referred_by = ${params.referredBy},
        address_line1 = ${params.addressLine1},
        address_line2 = ${params.addressLine2},
        address_city = ${params.addressCity},
        address_postcode = ${params.addressPostcode},
        address_country = ${params.addressCountry},
        marketing_consent = ${params.marketingConsent}
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as CustomerRow) ?? null;
}

// Case-insensitive duplicate check, excluding the customer being edited, so an
// email change cannot collide with another account's login.
export async function emailTakenByAnotherCustomer(id: number, email: string): Promise<boolean> {
  const db = requireDb();
  const rows = await db`
    SELECT 1 FROM customers WHERE lower(email) = lower(${email}) AND id <> ${id} LIMIT 1
  `;
  return rows.length > 0;
}

export async function deleteCustomer(id: number): Promise<boolean> {
  const db = requireDb();

  // Burn their 10% code on the way out (found while testing task efa43ea1).
  // discount_signups has no customer_id, so nothing linked the code to the
  // person: deleting an account left a live, spendable WGLOW10 code behind,
  // which matters most in the case you would use this for, shutting down
  // somebody who has been abusing the shop. The signup row itself is kept, so
  // no record of who signed up and when is lost. It just stops working.
  const rows = await db`DELETE FROM customers WHERE id = ${id} RETURNING id, discount_code`;
  const code = rows[0]?.discount_code as string | null | undefined;
  if (code) {
    await db`UPDATE discount_signups SET status = 'used' WHERE code = ${code} AND status = 'active'`.catch(() => {});
  }
  return rows.length > 0;
}

export async function listCustomers(limit = 200): Promise<CustomerRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM customers ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows as CustomerRow[];
}

export interface CustomerWithStats extends CustomerRow {
  order_count: number;
  total_spent: string;
  last_order_at: string | null;
  // Status of the row in discount_signups matching this customer's issued
  // discount_code ('active' = issued but not yet used at checkout, 'used' =
  // redeemed on a placed order, null = no code issued). Joined by code since
  // discount_signups has no customer_id column of its own.
  discount_signup_status: 'active' | 'used' | null;
}

export async function listCustomersWithStats(limit = 200): Promise<CustomerWithStats[]> {
  await ensureOrderPaymentConfirmationTracking();
  const db = requireDb();
  const rows = await db`
    SELECT c.*,
      COUNT(o.id) FILTER (WHERE o.payment_confirmed_at IS NOT NULL)::int AS order_count,
      COALESCE(SUM(o.total) FILTER (
        WHERE o.payment_confirmed_at IS NOT NULL AND o.status NOT IN ('cancelled', 'refunded')
      ), 0) AS total_spent,
      MAX(o.payment_confirmed_at) AS last_order_at,
      ds.status AS discount_signup_status
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
      OR (o.customer_id IS NULL AND lower(o.email) = lower(c.email))
    LEFT JOIN discount_signups ds ON c.discount_code IS NOT NULL AND upper(ds.code) = upper(c.discount_code)
    GROUP BY c.id, ds.status
    ORDER BY c.created_at DESC
    LIMIT ${limit}
  `;
  return rows as CustomerWithStats[];
}

// A single person the admin can drop onto a bespoke invoice, gathered from any
// of the three places a real customer's details already live: their member
// account, a past order, or a past invoice. Deduplicated by email so John Barry
// shows once even if he is a member who has also ordered and been invoiced.
//
// The type and the merging rule live in src/lib/invoiceCustomerMerge.ts, which needs no database
// and so can be tested on its own — it is the rule that decides whether an address counts as a
// BILLING address, and it is the rule that went wrong in task 77b818aa.
export type { InvoiceCustomerMatch } from './invoiceCustomerMerge';

export async function searchInvoiceCustomers(query: string, limit = 8): Promise<InvoiceCustomerMatch[]> {
  const db = requireDb();
  const q = `%${query.trim()}%`;
  const rows = await db`
    WITH members AS (
      SELECT 'member' AS source,
        trim(concat_ws(' ', first_name, last_name)) AS name,
        email, phone, NULL::text AS company,
        address_line1 AS line1, address_line2 AS line2, address_city AS city,
        address_postcode AS postcode, address_country AS country,
        created_at AS last_activity
      FROM customers
      WHERE trim(concat_ws(' ', first_name, last_name)) ILIKE ${q}
         OR email ILIKE ${q} OR phone ILIKE ${q} OR address_postcode ILIKE ${q}
    ),
    order_customers AS (
      SELECT DISTINCT ON (lower(email)) 'order' AS source,
        customer_name AS name, email, phone, NULL::text AS company,
        shipping_line1 AS line1, shipping_line2 AS line2, shipping_city AS city,
        shipping_postcode AS postcode, shipping_country AS country,
        created_at AS last_activity
      FROM orders
      WHERE customer_name ILIKE ${q} OR email ILIKE ${q}
         OR phone ILIKE ${q} OR shipping_postcode ILIKE ${q}
      ORDER BY lower(email), created_at DESC
    ),
    invoice_customers AS (
      SELECT DISTINCT ON (lower(email)) 'invoice' AS source,
        customer_name AS name, email, phone, company_name AS company,
        billing_line1 AS line1, billing_line2 AS line2, billing_city AS city,
        billing_postcode AS postcode, billing_country AS country,
        created_at AS last_activity
      FROM invoices
      WHERE customer_name ILIKE ${q} OR email ILIKE ${q} OR phone ILIKE ${q}
         OR company_name ILIKE ${q} OR billing_postcode ILIKE ${q}
      ORDER BY lower(email), created_at DESC
    )
    SELECT * FROM members
    UNION ALL SELECT * FROM order_customers
    UNION ALL SELECT * FROM invoice_customers
    ORDER BY last_activity DESC NULLS LAST
    LIMIT ${limit * 3}
  `;

  return mergeInvoiceCustomers(rows as unknown as InvoiceCustomerRow[], limit);
}

// ─── Customer sessions ───────────────────────────────────────────────────────

export async function createCustomerSession(params: {
  customerId: number;
  token: string;
  expiresAt: Date;
}): Promise<void> {
  const db = requireDb();
  await db`
    INSERT INTO customer_sessions (customer_id, token, expires_at)
    VALUES (${params.customerId}, ${params.token}, ${params.expiresAt.toISOString()})
  `;
}

export async function findCustomerByValidSessionToken(token: string): Promise<CustomerRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT c.* FROM customer_sessions s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.token = ${token} AND s.expires_at > now()
    LIMIT 1
  `;
  return (rows[0] as CustomerRow) ?? null;
}

export async function deleteCustomerSession(token: string): Promise<void> {
  const db = requireDb();
  await db`DELETE FROM customer_sessions WHERE token = ${token}`;
}

export async function deleteCustomerSessionsByCustomerId(customerId: number): Promise<void> {
  const db = requireDb();
  await db`DELETE FROM customer_sessions WHERE customer_id = ${customerId}`;
}

export async function updateCustomerPassword(customerId: number, passwordHash: string): Promise<void> {
  const db = requireDb();
  await db`UPDATE customers SET password_hash = ${passwordHash} WHERE id = ${customerId}`;
}

// ─── Password reset tokens ───────────────────────────────────────────────────

export interface PasswordResetTokenRow {
  id: number;
  customer_id: number;
  token: string;
  expires_at: string;
  used_at: string | null;
}

export async function createPasswordResetToken(params: {
  customerId: number;
  token: string;
  expiresAt: Date;
}): Promise<void> {
  const db = requireDb();
  await db`
    INSERT INTO password_reset_tokens (customer_id, token, expires_at)
    VALUES (${params.customerId}, ${params.token}, ${params.expiresAt.toISOString()})
  `;
}

export async function findValidPasswordResetToken(token: string): Promise<PasswordResetTokenRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM password_reset_tokens
    WHERE token = ${token} AND expires_at > now() AND used_at IS NULL
    LIMIT 1
  `;
  return (rows[0] as PasswordResetTokenRow) ?? null;
}

export async function markPasswordResetTokenUsed(token: string): Promise<void> {
  const db = requireDb();
  await db`UPDATE password_reset_tokens SET used_at = now() WHERE token = ${token}`;
}

// ─── Email verification tokens ───────────────────────────────────────────────
// Same shape and lookup semantics as password reset tokens above.

export interface EmailVerificationTokenRow {
  id: number;
  customer_id: number;
  token: string;
  expires_at: string;
  used_at: string | null;
}

export async function createEmailVerificationToken(params: {
  customerId: number;
  token: string;
  expiresAt: Date;
}): Promise<void> {
  const db = requireDb();
  await db`
    INSERT INTO email_verification_tokens (customer_id, token, expires_at)
    VALUES (${params.customerId}, ${params.token}, ${params.expiresAt.toISOString()})
  `;
}

export async function findValidEmailVerificationToken(token: string): Promise<EmailVerificationTokenRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM email_verification_tokens
    WHERE token = ${token} AND expires_at > now() AND used_at IS NULL
    LIMIT 1
  `;
  return (rows[0] as EmailVerificationTokenRow) ?? null;
}

export async function markEmailVerificationTokenUsed(token: string): Promise<void> {
  const db = requireDb();
  await db`UPDATE email_verification_tokens SET used_at = now() WHERE token = ${token}`;
}

// No used/expiry filter — exists so /api/account/verify-email can tell a
// RE-CLICKED link (used token, customer already verified => friendly
// success) apart from a genuinely invalid one. Email scanners (Outlook
// SafeLinks, Gmail prefetch) and double-clicks hit this path constantly.
export async function findEmailVerificationTokenAny(token: string): Promise<EmailVerificationTokenRow | null> {
  const db = requireDb();
  const rows = await db`SELECT * FROM email_verification_tokens WHERE token = ${token} LIMIT 1`;
  return (rows[0] as EmailVerificationTokenRow) ?? null;
}

// Idempotent — safe to call on an already-verified customer (just re-sets
// the same TRUE value). Returns the updated row so the caller has the
// customer's email/name on hand without a second lookup.
export async function markCustomerEmailVerified(customerId: number): Promise<CustomerRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE customers
    SET email_verified = TRUE, email_verified_at = COALESCE(email_verified_at, now())
    WHERE id = ${customerId}
    RETURNING *
  `;
  return (rows[0] as CustomerRow) ?? null;
}

// The undo for a verification set by hand from the admin panel (task efa43ea1).
// email_verified_at is cleared too, so "Confirmed 7 Sep" never sits under
// "Not verified yet". Their discount code is deliberately left alone: taking a
// code back off somebody who may already have it in an email is a worse
// mistake than leaving one issued.
export async function clearCustomerEmailVerified(customerId: number): Promise<CustomerRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE customers
    SET email_verified = FALSE, email_verified_at = NULL
    WHERE id = ${customerId}
    RETURNING *
  `;
  return (rows[0] as CustomerRow) ?? null;
}

// Candidates for the single automatic verification reminder (see
// /api/cron/verification-reminders): still unverified, past the initial
// verification window, never reminded before, and not so old that a
// first-deploy backlog of ancient rows gets mass-emailed. Only 'active'
// accounts — pending_password lock-page leads never received a first
// verification email, so a "reminder" would be their first contact.
export async function listCustomersNeedingVerificationReminder(params: {
  minAgeHours: number;
  maxAgeDays: number;
  limit: number;
}): Promise<CustomerRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM customers
    WHERE email_verified = FALSE
      AND account_status = 'active'
      AND verification_reminder_sent_at IS NULL
      AND created_at < now() - make_interval(hours => ${params.minAgeHours})
      AND created_at > now() - make_interval(days => ${params.maxAgeDays})
    ORDER BY created_at ASC
    LIMIT ${params.limit}
  `;
  return rows as CustomerRow[];
}

export async function markVerificationReminderSent(customerId: number): Promise<void> {
  const db = requireDb();
  await db`UPDATE customers SET verification_reminder_sent_at = now() WHERE id = ${customerId}`;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

// The two order row shapes and deleteOrder moved to ./db/orders.ts on
// 2026-08-16, because ./db/invoices.ts needs them and no file in ./db/ may
// import back out of this one. Re-exported so every existing import works.
export { deleteOrder } from './db/orders';
export type { OrderAccountLink, OrderItemRecord, OrderRow } from './db/orders';


// Statuses that mean "payment has been confirmed" — Fena's webhook moves an
// order to 'paid'; PayPal/manual orders reach 'awaiting_dispatch' via the
// admin's "Mark as Paid" action. Royal Mail label creation and customer
// tracking emails are gated on the order being in one of these states.
export const PAYMENT_CONFIRMED_STATUSES: OrderRow['status'][] = [
  'paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered',
];

export async function createOrder(params: {
  orderNumber: string;
  customerId: number | null;
  email: string;
  customerName: string;
  items: OrderItemRecord[];
  subtotal: number;
  discountCode: string | null;
  discountAmount: number;
  shippingLabel: string;
  shippingCost: number;
  total: number;
  shippingAddress: string;
  shippingLine1?: string | null;
  shippingLine2?: string | null;
  shippingCity?: string | null;
  shippingPostcode?: string | null;
  shippingCountry?: string | null;
  /** Who the parcel is addressed to, when that is not the person paying. Royal Mail prints this instead of customerName. */
  shippingRecipient?: string | null;
  phone?: string | null;
  paymentMethod?: 'fena' | 'paypal' | 'manual' | 'cash' | 'bank_transfer';
  paypalFee?: number;
  paymentAccessToken?: string | null;
  reservationExpiresAt?: string | null;
  parcelWeightGrams?: number | null;
  parcelPackageFormat?: string | null;
  packagingWeightGrams?: number | null;
  ruleDiscountAmount?: number;
  appliedRules?: AppliedRuleSummary[];
  qrCampaignId?: number | null;
  qrCampaignSlug?: string | null;
  qrCampaignName?: string | null;
  qrCampaignType?: string | null;
  qrPartnerName?: string | null;
  fulfilmentType?: OrderRow['fulfilment_type'];
  automationFlags?: OrderRow['automation_flags'];
  /* How the order reached its account: proven session, email match, guest, or made by the shop
     from an invoice. Left unset only by a caller that genuinely cannot tell, which is why the
     fallback is 'not_recorded' rather than a cheerful guess. See OrderRow.account_link. */
  accountLink?: OrderRow['account_link'];
  /* What the customer confirmed before paying, with the exact sentences they were shown. Left
     unset by the invoice system, which creates orders on somebody's behalf and where nobody
     ticked anything: that stores NULL, meaning not captured, rather than a boolean nobody
     earned. */
  checkoutConfirmations?: OrderRow['checkout_confirmations'];
}): Promise<OrderRow | null> {
  const db = requireDb();
  const paymentMethod = params.paymentMethod ?? 'fena';
  const fulfilmentType = params.fulfilmentType ?? 'royal_mail';
  const accountLink = params.accountLink ?? 'not_recorded';
  const automationFlags = params.automationFlags ?? {
    sendPaymentLink: true, sendConfirmation: true, triggerRoyalMail: true, sendDispatchEmail: true,
  };
  const insert = () => db`
    INSERT INTO orders (
      order_number, customer_id, email, customer_name, items, subtotal,
      discount_code, discount_amount, shipping_label, shipping_cost, total,
      shipping_address, shipping_line1, shipping_line2, shipping_city,
      shipping_postcode, shipping_country, shipping_recipient, phone, payment_method, paypal_fee,
      payment_access_token, reservation_expires_at,
      parcel_weight_grams, parcel_package_format, packaging_weight_grams,
      rule_discount_amount, applied_rules,
      qr_campaign_id, qr_campaign_slug, qr_campaign_name, qr_campaign_type, qr_partner_name,
      fulfilment_type, automation_flags, account_link, checkout_confirmations
    )
    VALUES (
      ${params.orderNumber}, ${params.customerId}, ${params.email}, ${params.customerName},
      ${JSON.stringify(params.items)}, ${params.subtotal}, ${params.discountCode},
      ${params.discountAmount}, ${params.shippingLabel}, ${params.shippingCost}, ${params.total},
      ${params.shippingAddress}, ${params.shippingLine1 ?? null}, ${params.shippingLine2 ?? null},
      ${params.shippingCity ?? null}, ${params.shippingPostcode ?? null},
      ${params.shippingCountry ?? null}, ${params.shippingRecipient ?? null}, ${params.phone ?? null}, ${paymentMethod},
      ${params.paypalFee ?? 0}, ${params.paymentAccessToken ?? null}, ${params.reservationExpiresAt ?? null},
      ${params.parcelWeightGrams ?? null},
      ${params.parcelPackageFormat ?? null}, ${params.packagingWeightGrams ?? null},
      ${params.ruleDiscountAmount ?? 0}, ${JSON.stringify(params.appliedRules ?? [])},
      ${params.qrCampaignId ?? null}, ${params.qrCampaignSlug ?? null},
      ${params.qrCampaignName ?? null}, ${params.qrCampaignType ?? null},
      ${params.qrPartnerName ?? null},
      ${fulfilmentType}, ${JSON.stringify(automationFlags)}, ${accountLink},
      ${params.checkoutConfirmations ? JSON.stringify(params.checkoutConfirmations) : null}
    )
    RETURNING *
  `;

  /* An order is the one thing on this site that must never fail for a reason of our own making.
     There is no migration step in this app: a new column exists only once some admin page happens
     to call ensureSchema(). Deploy a column addition and, until an admin opens a page, every
     checkout would insert against a column the live database does not have yet and the shop would
     quietly stop taking orders.

     So: create the schema and try exactly once more, and ONLY when the failure was a missing
     column (Postgres 42703 "undefined_column"). A blind retry is not safe here, because a retry
     after a network failure could take the money twice over. Same habit as the sign-in and
     address logs, and as commit cb4f457. */
  let rows;
  try {
    rows = await insert();
  } catch (err) {
    if (!isUndefinedColumnError(err)) throw err;
    const { ensureSchema } = await import('./db/schema');
    await ensureSchema();
    rows = await insert();
  }
  return (rows[0] as OrderRow) ?? null;
}

/** True only for Postgres's "that column does not exist" — nothing else is retried. @see createOrder */
function isUndefinedColumnError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (e && typeof e === 'object' && e.code === '42703') return true;
  const message = e && typeof e.message === 'string' ? e.message : String(err ?? '');
  return /column .* does not exist/i.test(message);
}

export async function listOrdersByCustomerId(customerId: number, limit = 100): Promise<OrderRow[]> {
  await ensureOrderPaymentConfirmationTracking();
  const db = requireDb();
  const rows = await db`
    SELECT * FROM orders WHERE customer_id = ${customerId} ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows as OrderRow[];
}

// Invoice-spawned orders carry their invoice's "Message to customer" and notes
// into the admin Orders view (task e6e75b32) — a live LEFT JOIN rather than a
// copied column, so every historical invoice order shows its notes too and the
// text can never drift from the invoice. Plain checkout orders get NULLs.
export interface OrderWithInvoiceNotes extends OrderRow {
  invoice_message: string | null;
  invoice_internal_notes: string | null;
  invoice_customer_notes: string | null;
  invoice_subject: string | null;
}

export async function listAllOrders(limit = 300): Promise<OrderWithInvoiceNotes[]> {
  await ensureOrderPaymentConfirmationTracking();
  // So what Royal Mail last said is on the rows the Orders screen reads. Swallowed on failure:
  // a missing column simply means no Royal Mail record is shown, which is yesterday's behaviour,
  // and is far better than an Orders screen that will not load (task d912f632).
  await ensureRoyalMailParcelState().catch(() => {});
  // So delivered_at and archived_at are on the rows the Orders screen reads. Swallowed on failure:
  // a missing column means every order simply reads as not archived, which is yesterday's
  // behaviour, and is far better than an Orders screen that will not load (task 831a4461).
  await ensureOrderArchiving().catch(() => {});
  const db = requireDb();
  const rows = await db`
    SELECT o.*,
           i.message        AS invoice_message,
           i.internal_notes AS invoice_internal_notes,
           i.customer_notes AS invoice_customer_notes,
           i.subject        AS invoice_subject
    FROM orders o
    LEFT JOIN invoices i ON i.id = o.invoice_id
    ORDER BY o.created_at DESC LIMIT ${limit}
  `;
  return rows as OrderWithInvoiceNotes[];
}

/**
 * The same orders, minus any whose LINE has been cleared off the dashboard
 * (task 535c24f9).
 *
 * Only the dashboard's Latest Activity feed uses this. `listAllOrders` above is
 * deliberately untouched, because the Orders screen must keep showing every
 * order: clearing one here hides a line on a glance list, never an order, and
 * an order that vanished from Orders would be a different and much worse thing.
 *
 * Falls back to the full list when the column is not there yet, so a deploy
 * that lands before the database setup runs behaves exactly as it did
 * yesterday.
 */
/**
 * Write down what Royal Mail said about each parcel (task d912f632).
 *
 * One statement per order, matched on the order number, which is the reference the shop already
 * sends Royal Mail when the shipment is created. Orders Royal Mail has never heard of are simply
 * not in the list and are left exactly as they were, rather than being stamped as "not printed",
 * which would be us inventing an answer on Royal Mail's behalf.
 *
 * Returns how many orders it actually changed.
 */
export async function recordRoyalMailParcelStates(
  states: { orderReference: string; trackingNumber: string | null; printedOn: string | null; shippedOn: string | null }[],
): Promise<number> {
  if (states.length === 0) return 0;
  await ensureRoyalMailParcelState();
  const db = requireDb();
  const refs = states.map((s) => s.orderReference);
  const printed = states.map((s) => s.printedOn);
  const shipped = states.map((s) => s.shippedOn);
  const rows = await db`
    UPDATE orders o
    SET royal_mail_printed_on = v.printed_on::timestamptz,
        royal_mail_shipped_on = v.shipped_on::timestamptz,
        royal_mail_checked_at = now()
    FROM (
      SELECT * FROM unnest(${refs}::text[], ${printed}::text[], ${shipped}::text[])
        AS t(order_number, printed_on, shipped_on)
    ) AS v
    WHERE o.order_number = v.order_number
    RETURNING o.order_number
  `;
  return rows.length;
}

export async function listOrdersForActivity(limit = 300): Promise<OrderWithInvoiceNotes[]> {
  await ensureOrderPaymentConfirmationTracking();
  try {
    await ensureOrderActivityClearing();
  } catch {
    return listAllOrders(limit);
  }
  const db = requireDb();
  const rows = await db`
    SELECT o.*,
           i.message        AS invoice_message,
           i.internal_notes AS invoice_internal_notes,
           i.customer_notes AS invoice_customer_notes,
           i.subject        AS invoice_subject
    FROM orders o
    LEFT JOIN invoices i ON i.id = o.invoice_id
    WHERE o.activity_cleared_at IS NULL
    ORDER BY o.created_at DESC LIMIT ${limit}
  `;
  return rows as OrderWithInvoiceNotes[];
}

/**
 * Only these. A live order somebody still has to pack and post must never be
 * clearable off the dashboard, because that is exactly how a parcel gets
 * forgotten. Cancelled and Payment failed are finished: there is nothing left
 * to do on them, and they are the two that show in red.
 */
export const CLEARABLE_ORDER_STATUSES = ['cancelled', 'payment_failed'] as const;

/**
 * Take an order's line off the dashboard feed, or put it back (task 535c24f9).
 *
 * Sets a timestamp and nothing else. The order, its money, its customer and its
 * history are not touched, and it stays on the Orders screen throughout.
 * Returns false when there is no such order, or when its status is one that is
 * not allowed to be cleared.
 */
export async function setOrderActivityCleared(orderNumber: string, cleared: boolean): Promise<boolean> {
  await ensureOrderActivityClearing();
  const db = requireDb();
  const statuses = [...CLEARABLE_ORDER_STATUSES];
  const rows = cleared
    ? await db`
        UPDATE orders SET activity_cleared_at = now()
        WHERE order_number = ${orderNumber} AND status = ANY(${statuses})
        RETURNING order_number
      `
    // Putting one back is allowed whatever the status now says, so an order that
    // changed status after it was cleared can never become permanently hidden.
    : await db`
        UPDATE orders SET activity_cleared_at = NULL
        WHERE order_number = ${orderNumber}
        RETURNING order_number
      `;
  return rows.length > 0;
}

export interface StoreStats {
  totalOrders: number;
  pendingOrders: number;
  awaitingPayment: number;
  awaitingDispatch: number;
  inTransit: number;
  revenue: number;
  thisMonthRevenue: number;
  customerCount: number;
  /** Accounts created in the rolling last 24 hours, and last 7 days (task c61b59f4). */
  newCustomers24h: number;
  newCustomers7d: number;
}

export async function getStoreStats(): Promise<StoreStats> {
  await ensureOrderPaymentConfirmationTracking();
  const db = requireDb();
  const [orderRow] = await db`
    SELECT
      COUNT(*) FILTER (WHERE payment_confirmed_at IS NOT NULL)::int AS total_orders,
      COUNT(*) FILTER (WHERE status IN ('pending', 'awaiting_payment', 'paid', 'awaiting_dispatch', 'processing', 'exported'))::int AS pending_orders,
      COUNT(*) FILTER (WHERE status IN ('pending', 'awaiting_payment'))::int AS awaiting_payment,
      COUNT(*) FILTER (WHERE status IN ('paid', 'awaiting_dispatch', 'processing', 'exported'))::int AS awaiting_dispatch,
      COUNT(*) FILTER (WHERE status = 'dispatched')::int AS in_transit,
      COALESCE(SUM(total) FILTER (WHERE status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered')), 0) AS revenue,
      COALESCE(SUM(total) FILTER (
        WHERE status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered')
          AND payment_confirmed_at >= date_trunc('month', now())
      ), 0) AS this_month_revenue
    FROM orders
  `;
  /* New sign-ups in the last day, and the last week beside it (task c61b59f4, Kieran:
     "whenever we have new clients have a separate box to say how many new clients have come
     in in the last 24 hours").
     The 7-day figure is not scope creep, it is what stops the box being useless. Measured on
     the live store the day this was built: 87 customers, 26 in the last 7 days, 0 in the last
     24 hours. A box that reads nought on its own looks broken rather than quiet, so the week
     goes underneath it as the box's note, which is what every other box there already has.
     A rolling 24 hours, not "since midnight": he asked for the last 24 hours. */
  const [customerRow] = await db`
    SELECT
      COUNT(*)::int AS customer_count,
      COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS new_customers_24h,
      COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int  AS new_customers_7d
    FROM customers
  `;
  return {
    totalOrders:      Number(orderRow?.total_orders ?? 0),
    pendingOrders:    Number(orderRow?.pending_orders ?? 0),
    awaitingPayment:  Number(orderRow?.awaiting_payment ?? 0),
    awaitingDispatch: Number(orderRow?.awaiting_dispatch ?? 0),
    inTransit:        Number(orderRow?.in_transit ?? 0),
    revenue:          Number(orderRow?.revenue ?? 0),
    thisMonthRevenue: Number(orderRow?.this_month_revenue ?? 0),
    customerCount:    Number(customerRow?.customer_count ?? 0),
    newCustomers24h:  Number(customerRow?.new_customers_24h ?? 0),
    newCustomers7d:   Number(customerRow?.new_customers_7d ?? 0),
  };
}

export async function getStatsForDateRange(from: Date, to: Date): Promise<{
  totalOrders: number;
  awaitingPayment: number;
  awaitingDispatch: number;
  inTransit: number;
  revenue: number;
}> {
  await ensureOrderPaymentConfirmationTracking();
  const db = requireDb();
  const [row] = await db`
    SELECT
      COUNT(*) FILTER (
        WHERE payment_confirmed_at >= ${from.toISOString()} AND payment_confirmed_at < ${to.toISOString()}
      )::int AS total_orders,
      COUNT(*) FILTER (
        WHERE status IN ('pending', 'awaiting_payment')
          AND created_at >= ${from.toISOString()} AND created_at < ${to.toISOString()}
      )::int AS awaiting_payment,
      COUNT(*) FILTER (
        WHERE status IN ('paid', 'awaiting_dispatch', 'processing', 'exported')
          AND payment_confirmed_at >= ${from.toISOString()} AND payment_confirmed_at < ${to.toISOString()}
      )::int AS awaiting_dispatch,
      COUNT(*) FILTER (
        WHERE status = 'dispatched'
          AND payment_confirmed_at >= ${from.toISOString()} AND payment_confirmed_at < ${to.toISOString()}
      )::int AS in_transit,
      COALESCE(SUM(total) FILTER (
        WHERE status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered')
          AND payment_confirmed_at >= ${from.toISOString()} AND payment_confirmed_at < ${to.toISOString()}
      ), 0) AS revenue
    FROM orders
  `;
  return {
    totalOrders:      Number(row?.total_orders ?? 0),
    awaitingPayment:  Number(row?.awaiting_payment ?? 0),
    awaitingDispatch: Number(row?.awaiting_dispatch ?? 0),
    inTransit:        Number(row?.in_transit ?? 0),
    revenue:          Number(row?.revenue ?? 0),
  };
}

export async function findOrderByNumber(orderNumber: string): Promise<OrderRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM orders WHERE order_number = ${orderNumber} LIMIT 1
  `;
  return (rows[0] as OrderRow) ?? null;
}

export async function updateOrderStatus(
  orderNumber: string,
  status: OrderRow['status']
): Promise<OrderRow | null> {
  await ensureOrderPaymentConfirmationTracking();
  // The one place a status becomes 'delivered', which makes it the one place the delivery date can
  // honestly be recorded (task 831a4461). Without this the archive's 7-day clock would have nothing
  // true to count from, for ever.
  await ensureOrderArchiving().catch(() => {});
  const db = requireDb();
  const rows = await db`
    UPDATE orders
    SET status = ${status},
        payment_confirmed_at = CASE
          WHEN ${status} IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered', 'refunded')
            THEN COALESCE(payment_confirmed_at, now())
          ELSE payment_confirmed_at
        END,
        -- Stamped the first time it is marked delivered and kept thereafter, so correcting a
        -- status back and forth never restarts the archive clock. Cleared if it is moved off
        -- delivered altogether, because then it was not delivered.
        delivered_at = CASE
          WHEN ${status} = 'delivered' THEN COALESCE(delivered_at, now())
          ELSE NULL
        END
    WHERE order_number = ${orderNumber}
    RETURNING *
  `;
  const updated = (rows[0] as OrderRow) ?? null;
  if (updated) {
    const { syncAffiliateOrderStatus } = await import('./affiliates');
    await syncAffiliateOrderStatus(orderNumber, status).catch(() => {});
  }
  return updated;
}

/**
 * Move orders into Archived orders, or bring them back (task 831a4461).
 *
 * Sets or clears one timestamp. It never deletes an order, never changes its status, and never
 * touches the money: the archive is a folder, not a bin, and the Orders screen can still show
 * everything in it. Returns how many rows it actually changed, so the screen reports what happened
 * rather than what it hoped.
 */
export async function setOrdersArchived(orderNumbers: string[], archived: boolean): Promise<number> {
  if (orderNumbers.length === 0) return 0;
  await ensureOrderArchiving();
  const db = requireDb();
  const rows = archived
    ? await db`UPDATE orders SET archived_at = now() WHERE order_number = ANY(${orderNumbers}) RETURNING order_number`
    : await db`UPDATE orders SET archived_at = NULL WHERE order_number = ANY(${orderNumbers}) RETURNING order_number`;
  return rows.length;
}

// Update the delivery address on an order. Writes both the structured columns
// (used by the Royal Mail integration) and the legacy `shipping_address` string
// (used by older orders + some views), so the two never drift. Used by the AI
// Support Inbox when an admin approves a customer's pre-dispatch address change.
export interface OrderAddressUpdate {
  line1: string; line2?: string | null; city: string; postcode: string; country?: string | null;
}
export async function updateOrderShippingAddress(
  orderNumber: string,
  a: OrderAddressUpdate
): Promise<OrderRow | null> {
  const db = requireDb();
  const country = a.country ?? 'United Kingdom';
  const oneLine = [a.line1, a.line2, a.city, a.postcode, country].filter(Boolean).join(', ');
  const rows = await db`
    UPDATE orders SET
      shipping_line1 = ${a.line1},
      shipping_line2 = ${a.line2 ?? null},
      shipping_city = ${a.city},
      shipping_postcode = ${a.postcode},
      shipping_country = ${country},
      shipping_address = ${oneLine}
    WHERE order_number = ${orderNumber} RETURNING *`;
  return (rows[0] as OrderRow) ?? null;
}

export async function updateOrderTracking(
  orderNumber: string,
  trackingNumber: string
): Promise<OrderRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE orders SET tracking_number = ${trackingNumber} WHERE order_number = ${orderNumber} RETURNING *
  `;
  return (rows[0] as OrderRow) ?? null;
}

// Records a Royal Mail Click & Drop label/shipment against an order — called
// once the label + tracking number have been generated via the API. Does NOT
// change `status`: label creation and "mark as dispatched" are deliberately
// separate admin actions (see item 4 of the Royal Mail integration spec), so
// the customer tracking email only goes out when the admin marks dispatched.
export async function recordRoyalMailLabel(
  orderNumber: string,
  params: {
    royalMailOrderId: string;
    trackingNumber: string;
    trackingUrl: string | null;
    parcelWeightGrams?: number;
    parcelPackageFormat?: string;
    rawResponse?: unknown;
  }
): Promise<OrderRow | null> {
  const db = requireDb();
  const rawResponseJson = params.rawResponse !== undefined ? JSON.stringify(params.rawResponse) : null;
  const rows = await db`
    UPDATE orders
    SET royal_mail_order_id = ${params.royalMailOrderId},
        tracking_number = ${params.trackingNumber},
        tracking_url = ${params.trackingUrl},
        royal_mail_label_status = 'created',
        royal_mail_label_error = NULL,
        royal_mail_label_created_at = now(),
        royal_mail_last_response = COALESCE(${rawResponseJson}, royal_mail_last_response),
        parcel_weight_grams = COALESCE(${params.parcelWeightGrams ?? null}, parcel_weight_grams),
        parcel_package_format = COALESCE(${params.parcelPackageFormat ?? null}, parcel_package_format)
    WHERE order_number = ${orderNumber}
    RETURNING *
  `;
  return (rows[0] as OrderRow) ?? null;
}

// Records a failed (or "pending postage" — order created but no tracking
// yet) Royal Mail label-creation attempt so the admin can see why it failed
// and retry. `royalMailOrderId`, when provided, MUST be persisted even
// though this is an error outcome — see RoyalMailPendingPostageError in
// src/lib/royalMail.ts: without it, the next retry has no way to know an
// order already exists in Click & Drop and will create a duplicate. Never
// includes raw API credentials — `rawResponse` is Royal Mail's own JSON
// response body, kept for internal debugging only.
export async function recordRoyalMailLabelError(
  orderNumber: string,
  errorMessage: string,
  options?: { royalMailOrderId?: string | null; rawResponse?: unknown }
): Promise<void> {
  const db = requireDb();
  const rawResponseJson = options?.rawResponse !== undefined ? JSON.stringify(options.rawResponse) : null;
  await db`
    UPDATE orders
    SET royal_mail_label_status = 'error',
        royal_mail_label_error = ${errorMessage},
        royal_mail_label_error_at = now(),
        royal_mail_order_id = COALESCE(${options?.royalMailOrderId ?? null}, royal_mail_order_id),
        royal_mail_last_response = COALESCE(${rawResponseJson}, royal_mail_last_response)
    WHERE order_number = ${orderNumber}
  `;
}

// Records the "Royal Mail accepted/created the order but is withholding the
// tracking number until postage is paid manually in Click & Drop" outcome
// (RoyalMailPendingPostageError) — a normal, expected state, not a failure.
// Deliberately does NOT touch royal_mail_label_error_at, so this routine
// state never pollutes getRoyalMailDispatchStats()'s "Last API Error" panel,
// which is meant to surface genuine rejections only. Still persists
// royalMailOrderId (required so the next recheck/retry finds the existing
// Click & Drop order instead of creating a duplicate) and the raw response
// for debugging.
export async function recordRoyalMailPendingPostage(
  orderNumber: string,
  message: string,
  options?: { royalMailOrderId?: string | null; rawResponse?: unknown }
): Promise<void> {
  const db = requireDb();
  const rawResponseJson = options?.rawResponse !== undefined ? JSON.stringify(options.rawResponse) : null;
  await db`
    UPDATE orders
    SET royal_mail_label_status = 'pending_postage',
        royal_mail_label_error = ${message},
        royal_mail_order_id = COALESCE(${options?.royalMailOrderId ?? null}, royal_mail_order_id),
        royal_mail_last_response = COALESCE(${rawResponseJson}, royal_mail_last_response)
    WHERE order_number = ${orderNumber}
  `;
}

// Records a tracking number pasted manually by the admin (e.g. copied from
// Click & Drop after paying for postage there) directly against the Royal
// Mail Dispatch workflow — sets royal_mail_label_status to 'created' so the
// order renders into the same UI branch as an API-created label, with a
// working tracking_url. Deliberately separate from updateOrderTracking(),
// which is used by the older Manual CSV/Fallback Dispatch System and must
// keep never touching these Royal-Mail-specific columns.
export async function recordManualRoyalMailTracking(
  orderNumber: string,
  trackingNumber: string
): Promise<OrderRow | null> {
  const db = requireDb();
  const trackingUrl = buildTrackingUrl(trackingNumber);
  const rows = await db`
    UPDATE orders
    SET tracking_number = ${trackingNumber},
        tracking_url = ${trackingUrl},
        royal_mail_label_status = 'created',
        royal_mail_label_error = NULL
    WHERE order_number = ${orderNumber}
    RETURNING *
  `;
  return (rows[0] as OrderRow) ?? null;
}

// Sitewide Royal Mail health summary for the admin connection-status panel —
// when the last label succeeded, and the most recent error (with which
// order it happened on), across every order ever attempted, not just the
// ones currently visible in the dispatch-ready list.
export interface RoyalMailDispatchStats {
  lastLabelCreatedAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastErrorOrderNumber: string | null;
}

export async function getRoyalMailDispatchStats(): Promise<RoyalMailDispatchStats> {
  const db = requireDb();
  const [successRows, errorRows] = await Promise.all([
    db`SELECT MAX(royal_mail_label_created_at) AS last_created_at FROM orders`,
    db`
      SELECT order_number, royal_mail_label_error, royal_mail_label_error_at
      FROM orders
      WHERE royal_mail_label_error_at IS NOT NULL
      ORDER BY royal_mail_label_error_at DESC
      LIMIT 1
    `,
  ]);
  return {
    lastLabelCreatedAt: successRows[0]?.last_created_at ?? null,
    lastErrorAt: errorRows[0]?.royal_mail_label_error_at ?? null,
    lastErrorMessage: errorRows[0]?.royal_mail_label_error ?? null,
    lastErrorOrderNumber: errorRows[0]?.order_number ?? null,
  };
}

export async function markShippingEmailSent(orderNumber: string): Promise<void> {
  const db = requireDb();
  await db`UPDATE orders SET shipping_email_sent_at = now() WHERE order_number = ${orderNumber}`;
}

// Orders the background Royal Mail sync (api/cron/royal-mail-sync) should
// retry: payment is confirmed but a label hasn't been created yet — 'none'
// (the automatic attempt at payment time never ran or failed before reaching
// Royal Mail), 'pending_postage' (sitting in Click & Drop waiting for
// postage to be paid manually there — see RoyalMailPendingPostageError), or
// 'error' (a genuine rejection worth retrying after the admin fixes it).
// Oldest first, capped, so one cron run can't run unbounded against a large
// backlog.
export async function listOrdersPendingRoyalMailSync(limit = 25): Promise<OrderRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM orders
    WHERE status = ANY(${PAYMENT_CONFIRMED_STATUSES}::text[])
      AND royal_mail_label_status != 'created'
      AND fulfilment_type = 'royal_mail'
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
  return rows as OrderRow[];
}

// ─── Product visibility (admin enable/disable toggle) ───────────────────────
// Product data lives in the static src/data/products.ts catalogue; this table
// only stores per-slug overrides so the admin can hide a product from the
// live site without a redeploy (e.g. while it's out of stock).

export async function getHiddenProductSlugs(): Promise<string[]> {
  const db = requireDb();
  const rows = await db`SELECT slug FROM product_visibility WHERE hidden = TRUE`;
  return (rows as { slug: string }[]).map((r) => r.slug);
}

export async function setProductHidden(slug: string, hidden: boolean): Promise<void> {
  const db = requireDb();
  await db`
    INSERT INTO product_visibility (slug, hidden, updated_at)
    VALUES (${slug}, ${hidden}, now())
    ON CONFLICT (slug) DO UPDATE SET hidden = ${hidden}, updated_at = now()
  `;
}

// Called when a product is permanently deleted (not just reverted to its
// static default) so it doesn't leave a dangling visibility row behind for
// a slug that no longer exists anywhere in the catalogue.
export async function clearProductVisibility(slug: string): Promise<void> {
  const db = requireDb();
  await db`DELETE FROM product_visibility WHERE slug = ${slug}`;
}

// ─── Admin sidebar custom links ──────────────────────────────────────────────
// Moved to ./db/adminNavLinks.ts on 2026-08-11. Re-exported here so every existing
// '@/lib/db' import keeps working unchanged.
export { listAdminNavLinks, createAdminNavLink, updateAdminNavLink, deleteAdminNavLink, setAdminNavLinkOrder } from './db/adminNavLinks';
export type { AdminNavLinkRow } from './db/adminNavLinks';

// ─── Product stock (admin-managed inventory) ────────────────────────────────
// Slugs with no row here are treated as unlimited/untracked, so existing
// products keep working exactly as before until an admin sets a real number.
//
// getProductStockMap() is now computed as the SUM of every dosage's quantity
// in product_variant_stock (below) rather than read from the legacy
// product_stock table — so every existing caller that only ever wanted a
// per-product aggregate (homepage/promotion "in stock" badges, upsell
// availability filtering, CSV export, sort-by-stock) keeps working unchanged,
// while now reflecting live per-variant numbers instead of a frozen
// whole-product figure. The functions below this comment block
// (setProductStock, seedProductStock, decrementProductStock,
// findInsufficientStock, clearProductStock, getProductStockUpdatedAtMap) are
// no longer called anywhere in the app — they're kept, and product_stock is
// kept unmodified, purely as a historical backup of the pre-migration
// whole-product numbers. See product_variant_stock further below for the
// live read/write path.

// Reads the OLD whole-product table directly (not the new per-variant one)
// — used exactly once per slug, by the admin stock route's migration-seeding
// step, to copy each product's pre-migration number forward into every one
// of its dosages. Nothing else should call this; use getProductStockMap()
// (the live aggregate) or getProductVariantStockMap() instead.
export async function getLegacyProductStockMap(): Promise<Record<string, number>> {
  const db = requireDb();
  const rows = await db`SELECT slug, quantity FROM product_stock`;
  const map: Record<string, number> = {};
  for (const row of rows as { slug: string; quantity: number }[]) {
    map[row.slug] = row.quantity;
  }
  return map;
}

export async function getProductStockMap(): Promise<Record<string, number>> {
  const db = requireDb();
  const rows = await db`
    SELECT slug, SUM(quantity)::int AS quantity FROM product_variant_stock GROUP BY slug
  `;
  const map: Record<string, number> = {};
  for (const row of rows as { slug: string; quantity: number }[]) {
    map[row.slug] = row.quantity;
  }
  return map;
}

// Used by the admin "Check All Stock" report to show when each tracked
// quantity was last set — untracked slugs simply have no entry here.
export async function getProductStockUpdatedAtMap(): Promise<Record<string, string>> {
  const db = requireDb();
  const rows = await db`SELECT slug, updated_at FROM product_stock`;
  const map: Record<string, string> = {};
  for (const row of rows as { slug: string; updated_at: Date }[]) {
    map[row.slug] = new Date(row.updated_at).toISOString();
  }
  return map;
}

// Idempotent — only fills in slugs that don't have a row yet, so it's safe
// to call on every admin page load without overwriting numbers staff set.
// Legacy — superseded by seedProductVariantStock. No longer called.
export async function seedProductStock(entries: { slug: string; quantity: number }[]): Promise<void> {
  if (!entries.length) return;
  const db = requireDb();
  await db`
    INSERT INTO product_stock (slug, quantity)
    SELECT * FROM unnest(
      ${entries.map((e) => e.slug)}::text[],
      ${entries.map((e) => e.quantity)}::int[]
    )
    ON CONFLICT (slug) DO NOTHING
  `;
}

// Legacy — superseded by setProductVariantStock. No longer called.
export async function setProductStock(slug: string, quantity: number): Promise<void> {
  const db = requireDb();
  await db`
    INSERT INTO product_stock (slug, quantity, updated_at)
    VALUES (${slug}, ${quantity}, now())
    ON CONFLICT (slug) DO UPDATE SET quantity = ${quantity}, updated_at = now()
  `;
}

// Called when a product is permanently deleted (not just reverted to its
// static default) so it doesn't leave a dangling stock row behind for a
// slug that no longer exists anywhere in the catalogue.
export async function clearProductStock(slug: string): Promise<void> {
  const db = requireDb();
  await db`DELETE FROM product_stock WHERE slug = ${slug}`;
}

// Returns the slugs of any tracked items that don't have enough stock to
// fulfil the requested quantities — empty means the order can proceed.
// Untracked slugs (no row in product_stock) are always treated as available.
// Legacy — superseded by findInsufficientVariantStock. No longer called.
export async function findInsufficientStock(
  items: { slug: string; quantity: number }[]
): Promise<string[]> {
  const stockBySlug = await getProductStockMap();
  return items
    .filter((item) => {
      const available = stockBySlug[item.slug];
      return available !== undefined && available < item.quantity;
    })
    .map((item) => item.slug);
}

// ─── Product variant/dosage stock (the live read/write path) ──────────────
// One row per (slug, dosage) — e.g. Retatrutide 5mg/10mg/30mg each carry
// their own quantity, so selling out one dosage never affects the others.
// A (slug, dosage) pair with no row is untracked and treated as unlimited,
// the same "untracked = unlimited" rule product_stock always used, so a
// brand new variant nobody has set a number for yet stays purchasable.

export async function getProductVariantStockMap(): Promise<Record<string, Record<string, number>>> {
  const db = requireDb();
  const rows = await db`SELECT slug, dosage, quantity FROM product_variant_stock`;
  const map: Record<string, Record<string, number>> = {};
  for (const row of rows as { slug: string; dosage: string; quantity: number }[]) {
    (map[row.slug] ??= {})[row.dosage] = row.quantity;
  }
  return map;
}

// Keyed "slug::dosage" — used by the admin stock report's "last updated" column.
export async function getProductVariantStockUpdatedAtMap(): Promise<Record<string, string>> {
  const db = requireDb();
  const rows = await db`SELECT slug, dosage, updated_at FROM product_variant_stock`;
  const map: Record<string, string> = {};
  for (const row of rows as { slug: string; dosage: string; updated_at: Date }[]) {
    map[`${row.slug}::${row.dosage}`] = new Date(row.updated_at).toISOString();
  }
  return map;
}

// Idempotent — only fills in (slug, dosage) pairs that don't have a row yet,
// so it's safe to call on every admin page load without overwriting numbers
// staff already set. This is also the one-time migration path: callers seed
// each variant's starting quantity from the old whole-product number (or a
// sensible default for genuinely new products), copying it forward rather
// than guessing how to split it — staff then dial each dosage in for real.
export async function seedProductVariantStock(entries: { slug: string; dosage: string; quantity: number }[]): Promise<void> {
  if (!entries.length) return;
  const db = requireDb();
  await db`
    INSERT INTO product_variant_stock (slug, dosage, quantity)
    SELECT * FROM unnest(
      ${entries.map((e) => e.slug)}::text[],
      ${entries.map((e) => e.dosage)}::text[],
      ${entries.map((e) => e.quantity)}::int[]
    )
    ON CONFLICT (slug, dosage) DO NOTHING
  `;
}

export async function setProductVariantStock(slug: string, dosage: string, quantity: number): Promise<void> {
  const db = requireDb();
  await db`
    INSERT INTO product_variant_stock (slug, dosage, quantity, updated_at)
    VALUES (${slug}, ${dosage}, ${quantity}, now())
    ON CONFLICT (slug, dosage) DO UPDATE SET quantity = ${quantity}, updated_at = now()
  `;
}

// Called when a product is permanently deleted. Omitting `dosage` clears
// every variant row for the slug; passing it clears just that one dosage
// (e.g. a variant removed from an otherwise-still-live product).
export async function clearProductVariantStock(slug: string, dosage?: string): Promise<void> {
  const db = requireDb();
  if (dosage) {
    await db`DELETE FROM product_variant_stock WHERE slug = ${slug} AND dosage = ${dosage}`;
  } else {
    await db`DELETE FROM product_variant_stock WHERE slug = ${slug}`;
  }
}

// Returns the (slug, dosage) pairs that don't have enough stock to fulfil
// the requested quantities — empty means the order can proceed. Untracked
// pairs are always treated as available.
export async function findInsufficientVariantStock(
  items: { slug: string; dosage: string; quantity: number }[]
): Promise<{ slug: string; dosage: string }[]> {
  const stockMap = await getProductVariantStockMap();
  return items
    .filter((item) => {
      const available = stockMap[item.slug]?.[item.dosage];
      return available !== undefined && available < item.quantity;
    })
    .map((item) => ({ slug: item.slug, dosage: item.dosage }));
}

// Atomically decrements stock for each tracked (slug, dosage) — the WHERE
// guard means a row can never go below zero even if two orders race for the
// last units. Untracked pairs simply have no row to update, so they're
// skipped silently (same "untracked = unlimited" rule as everywhere else).
export async function decrementProductVariantStock(
  items: { slug: string; dosage: string; quantity: number }[],
): Promise<{ slug: string; dosage: string; quantity: number }[]> {
  const db = requireDb();
  const decremented: { slug: string; dosage: string; quantity: number }[] = [];
  for (const item of items) {
    const rows = await db`
      UPDATE product_variant_stock
      SET quantity = quantity - ${item.quantity}, updated_at = now()
      WHERE slug = ${item.slug} AND dosage = ${item.dosage} AND quantity >= ${item.quantity}
      RETURNING slug
    `;
    if (rows.length > 0) decremented.push(item);
  }
  return decremented;
}

// ─── Stock alerts ("notify me when back in stock") ─────────────────────────
// Moved to ./db/stockAlerts.ts on 2026-08-11. Re-exported here so every existing
// '@/lib/db' import keeps working unchanged.
export { createStockAlert, listPendingStockAlerts, markStockAlertsNotified } from './db/stockAlerts';
export type { StockAlertRow } from './db/stockAlerts';


// ─── Custom products (admin-created listings & edits to the static catalogue) ──
// The full catalogue lives in the static src/data/products.ts file. This table
// stores complete product records, keyed by slug, for two purposes:
//   1. Brand new products created from the admin "+ Add Product" form
//   2. Edited copies of static-catalogue products (the row holds the full
//      product with the admin's changes applied, not just a diff)
// At read time the storefront merges the static list with these rows —
// a matching slug overrides the static entry, and any other slug is appended.

export async function listCustomProducts(): Promise<Record<string, Product>> {
  const db = requireDb();
  const rows = await db`SELECT slug, data FROM custom_products`;
  const map: Record<string, Product> = {};
  for (const row of rows as { slug: string; data: Product }[]) {
    map[row.slug] = row.data;
  }
  return map;
}

// Slug -> ISO timestamp of last edit, for admin views (e.g. the Certificates
// review page) that want to show "last updated" without changing the shape
// listCustomProducts() returns everywhere else it's already used.
export async function listCustomProductsUpdatedAt(): Promise<Record<string, string>> {
  const db = requireDb();
  const rows = await db`SELECT slug, updated_at FROM custom_products`;
  const map: Record<string, string> = {};
  for (const row of rows as { slug: string; updated_at: Date }[]) {
    map[row.slug] = new Date(row.updated_at).toISOString();
  }
  return map;
}

// Saves a product override. Every admin path that writes a product, create
// (POST /api/admin/products/catalogue) and edit (PUT .../catalogue/[slug]),
// funnels through here. The product is saved exactly as given: the name sent to
// Royal Mail and the payment provider is the product's own name, or the
// "Shipping description" typed for it (see src/lib/genericNames.ts).
export async function upsertCustomProduct(product: Product): Promise<void> {
  const db = requireDb();
  const data = JSON.stringify(product);
  await db`
    INSERT INTO custom_products (slug, data, updated_at)
    VALUES (${product.slug}, ${data}, now())
    ON CONFLICT (slug) DO UPDATE SET data = ${data}, updated_at = now()
  `;
}

// Removes the override row for a slug. For a slug that only ever existed as
// a custom_products row (admin-created, not in the static PRODUCTS array),
// this fully removes the product from the catalogue. For a slug that also
// exists in the static array, this just reverts it to that built-in version
// — the caller is expected to make that distinction clear to the admin.
export async function deleteCustomProduct(slug: string): Promise<boolean> {
  const db = requireDb();
  const rows = await db`DELETE FROM custom_products WHERE slug = ${slug} RETURNING slug`;
  return rows.length > 0;
}

// Atomically decrements stock for each tracked item — the WHERE guard means
// a row can never go below zero even if two orders race for the last units.
// Untracked slugs simply have no row to update, so they're skipped silently.
// Legacy whole-product decrement — checkout now calls
// decrementProductVariantStock instead. Still called from
// src/lib/invoiceFulfillment.ts (invoice line items don't yet capture a
// structured dosage, only a free-text description) alongside a best-effort
// variant-level decrement, so this keeps the old aggregate table moving too.
export async function decrementProductStock(items: { slug: string; quantity: number }[]): Promise<void> {
  const db = requireDb();
  for (const item of items) {
    await db`
      UPDATE product_stock
      SET quantity = quantity - ${item.quantity}, updated_at = now()
      WHERE slug = ${item.slug} AND quantity >= ${item.quantity}
    `;
  }
}

// Marks an order as having come from the invoice system — see
// src/lib/invoiceFulfillment.ts. Doubles as the "Invoice Order" badge
// condition in the admin orders list.
export async function linkOrderToInvoice(orderNumber: string, invoiceId: number): Promise<void> {
  const db = requireDb();
  await db`UPDATE orders SET invoice_id = ${invoiceId} WHERE order_number = ${orderNumber}`;
}

// Corrects the placeholder payment_method an invoice-linked order is created
// with — an invoice offers both Fena and PayPal together, so which one was
// actually used is only known once payment confirms. markOrderPaidByAdmin
// deliberately only COALESCEs this column (never overwrites), so this
// explicit write is the one place it's actually corrected.
export async function setOrderPaymentMethod(orderNumber: string, paymentMethod: OrderRow['payment_method']): Promise<void> {
  const db = requireDb();
  await db`UPDATE orders SET payment_method = ${paymentMethod} WHERE order_number = ${orderNumber}`;
}

// Admin-only — lets the invoice editor (and, in principle, any order detail
// view) set how a specific order should be fulfilled and which of the four
// automations should run for it. Used for in-person/cash/collection sales
// that must not go through the normal Royal Mail/email pipeline. Never
// called from checkout or any payment-confirmation route, so ordinary orders
// never have this touched and keep their creation-time defaults.
export async function setOrderFulfilment(
  orderNumber: string,
  params: { fulfilmentType: OrderRow['fulfilment_type']; automationFlags: OrderRow['automation_flags'] }
): Promise<OrderRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE orders
    SET fulfilment_type = ${params.fulfilmentType}, automation_flags = ${JSON.stringify(params.automationFlags)}
    WHERE order_number = ${orderNumber}
    RETURNING *
  `;
  return (rows[0] as OrderRow) ?? null;
}

// Re-syncs an existing order's financial fields (items, totals, parcel
// weight/format) to match its source invoice after that invoice is edited —
// see syncOrderFinancialsFromInvoice() in src/lib/invoiceFulfillment.ts for
// the orchestration and the guard against touching an already-paid order.
// Without this, an order created from an invoice keeps the totals it was
// first created with forever, even after the invoice is later edited —
// which is exactly what let a Fena payment link charge a customer the old,
// pre-edit total on 2026-06-29 (invoice edited £487 → £647 after first
// send; the linked order's total, which Fena's payload is built from, was
// never updated, so the regenerated link still charged £487).
export async function updateOrderFinancials(
  orderNumber: string,
  params: {
    items: OrderItemRecord[];
    subtotal: number;
    discountCode: string | null;
    discountAmount: number;
    shippingLabel: string;
    shippingCost: number;
    total: number;
    parcelWeightGrams: number | null;
    parcelPackageFormat: string | null;
    packagingWeightGrams: number | null;
  }
): Promise<OrderRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE orders
    SET items = ${JSON.stringify(params.items)},
        subtotal = ${params.subtotal},
        discount_code = ${params.discountCode},
        discount_amount = ${params.discountAmount},
        shipping_label = ${params.shippingLabel},
        shipping_cost = ${params.shippingCost},
        total = ${params.total},
        parcel_weight_grams = ${params.parcelWeightGrams},
        parcel_package_format = ${params.parcelPackageFormat},
        packaging_weight_grams = ${params.packagingWeightGrams}
    WHERE order_number = ${orderNumber}
    RETURNING *
  `;
  return (rows[0] as OrderRow) ?? null;
}

// Syncs the customer's contact details (email, name, phone, delivery address)
// from an edited invoice onto its linked order. convertInvoiceToOrder snapshots
// these onto the order only ONCE, at first send — so without this, correcting a
// customer's email on an already-sent invoice never reaches the order the Fena
// payment link is built from, and a regenerated link keeps sending Fena the
// original (possibly invalid) email, which it rejects with 400
// "customerEmail: Incorrect email". This is the contact-detail counterpart of
// updateOrderFinancials (which only ever synced totals/items).
export async function updateOrderContactFromInvoice(
  orderNumber: string,
  params: {
    email: string;
    customerName: string;
    phone: string | null;
    shippingAddress: string;
    shippingLine1: string | null;
    shippingLine2: string | null;
    shippingCity: string | null;
    shippingPostcode: string | null;
    shippingCountry: string | null;
    shippingRecipient: string | null;
  }
): Promise<OrderRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE orders
    SET email = ${params.email},
        customer_name = ${params.customerName},
        phone = ${params.phone},
        shipping_address = ${params.shippingAddress},
        shipping_line1 = ${params.shippingLine1},
        shipping_line2 = ${params.shippingLine2},
        shipping_city = ${params.shippingCity},
        shipping_postcode = ${params.shippingPostcode},
        shipping_country = ${params.shippingCountry},
        shipping_recipient = ${params.shippingRecipient}
    WHERE order_number = ${orderNumber}
    RETURNING *
  `;
  return (rows[0] as OrderRow) ?? null;
}

// Advisory only — set by the Fena webhook when its signed payload's reported
// amount doesn't match order.total at confirmation time. Never blocks
// marking the order paid; just flags it for the sales@ notification email
// (see sendAdminOrderNotificationEmail) so a mismatch is caught immediately
// rather than relying on someone noticing a bank statement later.
export async function setOrderPaymentAmountMismatch(orderNumber: string, note: string): Promise<void> {
  const db = requireDb();
  await db`UPDATE orders SET payment_amount_mismatch = ${note} WHERE order_number = ${orderNumber}`;
}

export interface AutomationFailureRow {
  id: number;
  category: string;
  message: string;
  order_number: string | null;
  detail: string | null;
  created_at: string;
  /** When somebody ticked this off. Null means it is still open. */
  resolved_at?: string | null;
}

// "I have dealt with this", added lazily like the other late column additions
// (see ensureReuseColumns in src/lib/db/marketing.ts for the same pattern).
//
// Before this, the alarm was a rolling 24-hour count with no way to close
// anything: a problem nobody fixed disappeared by itself after a day, and a
// problem that HAD been fixed kept showing until a day had passed. Both are the
// wrong way round.
//
// Everything logged before the cutoff is stamped as already dealt with, so
// switching this on does not suddenly light up months of history that has long
// since been handled. The date is fixed rather than "now" so re-running is
// harmless: it can never sweep up a genuinely open failure later.
const AUTOMATION_HISTORY_CUTOFF = '2026-08-16T00:00:00Z';

let resolvedColumnCheck: Promise<boolean> | null = null;

/**
 * True once automation_failures has the resolved_at column.
 *
 * Deliberately tolerant. The deploy reaches the live site before anyone presses
 * "Run DB Setup", and a local session runs against a read-only database role, so
 * the ALTER can legitimately fail. When it does, this returns false and every
 * caller quietly falls back to the old behaviour rather than throwing a 500 at
 * whoever opened the admin panel.
 */
async function hasResolvedColumn(): Promise<boolean> {
  if (!resolvedColumnCheck) {
    resolvedColumnCheck = (async () => {
      const db = requireDb();
      try {
        await db`ALTER TABLE automation_failures ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`;
        await db`
          UPDATE automation_failures SET resolved_at = now()
          WHERE resolved_at IS NULL AND created_at < ${AUTOMATION_HISTORY_CUTOFF}
        `;
      } catch {
        // Read-only role, or the column is not ours to add. Fall through to the
        // check below, which decides what the callers can actually rely on.
      }
      try {
        const rows = await db`
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'automation_failures' AND column_name = 'resolved_at'
          LIMIT 1
        `;
        return rows.length > 0;
      } catch {
        return false;
      }
    })().then((present) => {
      // Only a positive answer is worth remembering. A negative one usually
      // means the migration has not run yet, and the next request may well be
      // on an instance where it has.
      if (!present) resolvedColumnCheck = null;
      return present;
    });
  }
  return resolvedColumnCheck;
}

// Durable record of an automation failure (dispatch, email-send, invoice
// sync, etc.) that used to be a console.error swallowed inside a
// `.catch(() => {})` — see the System Health admin page. Deliberately
// never throws itself: a logging failure must never take down the calling
// flow it's trying to record a failure for.
export async function logAutomationFailure(
  category: string,
  message: string,
  options?: { orderNumber?: string | null; detail?: unknown }
): Promise<void> {
  try {
    const db = requireDb();
    const detail = options?.detail === undefined
      ? null
      : typeof options.detail === 'string'
        ? options.detail
        : options.detail instanceof Error
          ? options.detail.stack ?? options.detail.message
          : JSON.stringify(options.detail);
    await db`
      INSERT INTO automation_failures (category, message, order_number, detail)
      VALUES (${category}, ${message}, ${options?.orderNumber ?? null}, ${detail})
    `;
  } catch (err) {
    console.error(`[logAutomationFailure] Could not record failure for category "${category}":`, err);
  }
}

export async function listRecentAutomationFailures(limit = 100): Promise<AutomationFailureRow[]> {
  const db = requireDb();
  await hasResolvedColumn();
  const rows = await db`SELECT * FROM automation_failures ORDER BY created_at DESC LIMIT ${limit}`;
  return rows as AutomationFailureRow[];
}

/**
 * The same list with anything already ticked off left out (task f95367d6).
 *
 * The dashboard feed used the full list, so eight faults that had been marked
 * dealt with at 10:09 one morning were still shouting in red on the first
 * screen the shop owner opens. Ticking one off did nothing to the dashboard,
 * which made the tick look broken and the dashboard look stuck.
 *
 * Nothing is lost by hiding them: System Health keeps every one of them under
 * "Already Dealt With", with a Reopen button. This is the difference between
 * what still needs somebody and what is history, and the two belong on
 * different screens.
 *
 * Falls back to the whole list when the resolved_at column is not there yet, so
 * a deploy that lands before the database setup runs behaves exactly as it did
 * yesterday rather than hiding things for a reason nobody can see.
 */
export async function listOpenAutomationFailures(limit = 100): Promise<AutomationFailureRow[]> {
  const db = requireDb();
  if (!(await hasResolvedColumn())) {
    return listRecentAutomationFailures(limit);
  }
  const rows = await db`
    SELECT * FROM automation_failures
    WHERE resolved_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as AutomationFailureRow[];
}

/**
 * How many genuine faults are still open, whatever their age.
 *
 * This is the number behind the red banner and the sidebar badge. Two things
 * are deliberately left out of it: anything somebody has ticked off, and
 * anything that is a customer event rather than a fault (see
 * src/lib/automationFailureKinds.ts).
 *
 * Falls back to the old rolling 24-hour count when the resolved_at column is
 * not there yet, so a deploy that lands before the database setup runs shows
 * exactly what it showed yesterday instead of breaking.
 */
export async function countOpenAutomationFailures(): Promise<number> {
  const db = requireDb();
  const events = [...CUSTOMER_EVENT_CATEGORIES];
  if (!(await hasResolvedColumn())) {
    const legacy = await db`
      SELECT COUNT(*)::int AS count FROM automation_failures
      WHERE created_at > now() - INTERVAL '24 hours'
        AND NOT (category = ANY(${events}))
    `;
    return (legacy[0]?.count as number) ?? 0;
  }
  const rows = await db`
    SELECT COUNT(*)::int AS count FROM automation_failures
    WHERE resolved_at IS NULL
      AND NOT (category = ANY(${events}))
  `;
  return (rows[0]?.count as number) ?? 0;
}

/**
 * Whether entries can be ticked off yet.
 *
 * The admin page needs this to stay honest with itself between the deploy and
 * the database setup: without the column there is nothing to tick, so the page
 * hides the buttons and falls back to the same rolling 24-hour rule the count
 * is using, rather than showing a list of six next to a total of one.
 */
export async function canResolveAutomationFailures(): Promise<boolean> {
  return hasResolvedColumn();
}

/**
 * Ticks one entry off, or puts it back. Returns false when the entry is not
 * there, or when the column this needs does not exist yet.
 */
export async function setAutomationFailureResolved(id: number, resolved: boolean): Promise<boolean> {
  if (!(await hasResolvedColumn())) return false;
  const db = requireDb();
  const rows = resolved
    ? await db`UPDATE automation_failures SET resolved_at = now() WHERE id = ${id} RETURNING id`
    : await db`UPDATE automation_failures SET resolved_at = NULL WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

/**
 * Removes one entry for good (task f95367d6).
 *
 * Ticking an entry off keeps it, greyed out, under "dealt with". This is the
 * other thing: the dashboard feed repeats the same fault once per occurrence,
 * and an operator looking at eight copies of a fault that was fixed days ago
 * wants them gone, not filed. Returns false when the id is not there, so the
 * screen can tell "already removed" from "did not work".
 *
 * Deliberately one row at a time. There is no delete-everything here, because
 * the only way to lose a fault nobody has read yet is a bulk button.
 */
export async function deleteAutomationFailure(id: number): Promise<boolean> {
  const db = requireDb();
  const rows = await db`DELETE FROM automation_failures WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function countRecentAutomationFailures(sinceHours = 24): Promise<number> {
  const db = requireDb();
  const rows = await db`
    SELECT COUNT(*)::int AS count FROM automation_failures
    WHERE created_at > now() - (INTERVAL '1 hour' * ${sinceHours})
  `;
  return (rows[0]?.count as number) ?? 0;
}

// Same count, narrowed to one category. Used as the mute window for admin
// alert emails (see reportAutomationFailure): one broken integration failing
// fifty times in an hour is one thing to look at, not fifty emails.
export async function countRecentAutomationFailuresInCategory(
  category: string,
  sinceHours: number
): Promise<number> {
  const db = requireDb();
  const rows = await db`
    SELECT COUNT(*)::int AS count FROM automation_failures
    WHERE category = ${category}
      AND created_at > now() - (INTERVAL '1 hour' * ${sinceHours})
  `;
  return (rows[0]?.count as number) ?? 0;
}

/**
 * Everything that has gone wrong for one order.
 *
 * The failure log knew, for example, that an order's confirmation email never sent, but it only
 * said so on System Health. Whoever opened the order itself saw a perfectly normal-looking record.
 * Failures belong next to the thing they happened to.
 */
export async function listAutomationFailuresForOrder(orderNumber: string): Promise<AutomationFailureRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM automation_failures
    WHERE order_number = ${orderNumber}
    ORDER BY created_at DESC
    LIMIT 20`;
  return rows as AutomationFailureRow[];
}

export interface UnverifiedCustomerRow {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  account_status: string;
  created_at: string;
  last_sent_at: string | null;
  times_sent: number;
  last_failure_at: string | null;
  last_failure_message: string | null;
  // Where they came from, so the box at the top of the Customers page can say it
  // (task c61b59f4). These are the newest sign-ups on the screen, so they are the
  // ones whose source is worth the most and they were the only ones not showing it.
  referred_by: string | null;
  qr_campaign_name: string | null;
  qr_campaign_type: string | null;
}

/**
 * Every customer who has not clicked their verification link, with when their
 * link was last sent and whether the last send is known to have failed.
 *
 * Driven by "who is stuck", NOT by "whose send threw an error", and that
 * distinction is the whole point: an email that Resend accepted and the
 * customer's provider then dropped in a junk folder produces no error at all.
 * A list built from the failure log would have been empty for the very
 * customer this was built for (task 34cf57c9).
 *
 * The failure lookup matches on the address inside the recorded message. That
 * is a text match rather than a foreign key, which is fine here: the table is
 * small, the message is written by us in a fixed shape, and a missed match
 * costs a "last attempt failed" note, never a wrong resend.
 */
export async function listUnverifiedCustomers(limit = 100): Promise<UnverifiedCustomerRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT
      c.id, c.email, c.first_name, c.last_name, c.account_status, c.created_at,
      c.referred_by, c.qr_campaign_name, c.qr_campaign_type,
      t.last_sent_at, COALESCE(t.times_sent, 0) AS times_sent,
      f.last_failure_at, f.last_failure_message
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT MAX(created_at) AS last_sent_at, COUNT(*)::int AS times_sent
      FROM email_verification_tokens WHERE customer_id = c.id
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT created_at AS last_failure_at, message AS last_failure_message
      FROM automation_failures
      WHERE category = 'verification_email' AND message LIKE '%' || c.email || '%'
      ORDER BY created_at DESC
      LIMIT 1
    ) f ON true
    WHERE c.email_verified = false
    ORDER BY c.created_at DESC
    LIMIT ${limit}
  `;
  return rows as UnverifiedCustomerRow[];
}

// One-time guard so the deferred (pay-time, not creation-time) stock
// decrement for invoice orders can never double-fire across retries
// (webhook + redirect-confirm racing, or a re-sent webhook).
export async function markInvoiceOrderStockDecremented(orderNumber: string): Promise<void> {
  const db = requireDb();
  await db`UPDATE orders SET invoice_stock_decremented_at = now() WHERE order_number = ${orderNumber}`;
}

// Restores stock for an order whose payment failed or was cancelled.
// Intended for the Fena/PayPal webhook handlers when payment does not
// succeed (not currently wired up to either — kept correct and ready for
// that). Restores per (slug, dosage) using each order item's own variant
// label, so it undoes exactly what decrementProductVariantStock took.
export async function restoreOrderStock(orderNumber: string): Promise<void> {
  const order = await findOrderByNumber(orderNumber);
  if (!order) return;
  const db = requireDb();
  for (const item of order.items) {
    if (!item.slug) continue;
    await db`
      UPDATE product_variant_stock
      SET quantity = quantity + ${item.quantity}, updated_at = now()
      WHERE slug = ${item.slug} AND dosage = ${item.variant}
    `;
  }
}

// ─── Payment integration helpers ─────────────────────────────────────────────

// Records the Fena payment ID against an order — called immediately after the
// create-payment API call returns so the webhook can look up the order later.
export async function updateOrderFenaPaymentId(
  orderNumber: string,
  fenaPaymentId: string | null,
  paymentUrl?: string | null,
): Promise<OrderRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE orders
    SET fena_payment_id = COALESCE(${fenaPaymentId}, fena_payment_id),
        fena_payment_url = COALESCE(${paymentUrl ?? null}, fena_payment_url),
        status = 'awaiting_payment'
    WHERE order_number = ${orderNumber}
    RETURNING *
  `;
  return (rows[0] as OrderRow) ?? null;
}

export async function findOrderByPaymentAccessToken(token: string): Promise<OrderRow | null> {
  const db = requireDb();
  const rows = await db`SELECT * FROM orders WHERE payment_access_token = ${token} LIMIT 1`;
  return (rows[0] as OrderRow) ?? null;
}

export async function markCheckoutStockDecremented(
  orderNumber: string,
  items: { slug: string; dosage: string; quantity: number }[],
): Promise<void> {
  const db = requireDb();
  await db`
    UPDATE orders
    SET checkout_stock_decremented_at = now(), checkout_stock_items = ${JSON.stringify(items)}::jsonb
    WHERE order_number = ${orderNumber}
  `;
}

/**
 * Claims new unpaid reservations that are 12 hours from expiry. Claiming and
 * returning them in one statement means overlapping cron runs cannot send the
 * same reminder twice. A failed send releases only its own claim for retry.
 */
export async function claimDuePaymentReminders(): Promise<OrderRow[]> {
  const db = requireDb();
  const rows = await db`
    WITH due AS (
      SELECT order_number FROM orders
      WHERE status IN ('pending', 'awaiting_payment')
        AND payment_method IS DISTINCT FROM 'paypal'
        AND payment_access_token IS NOT NULL
        AND reservation_expires_at IS NOT NULL
        AND reservation_expires_at > now()
        AND reservation_expires_at <= now() + INTERVAL '12 hours'
        AND payment_reminder_sent_at IS NULL
      ORDER BY reservation_expires_at ASC
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    )
    UPDATE orders AS order_record
    SET payment_reminder_sent_at = now()
    FROM due
    WHERE order_record.order_number = due.order_number
    RETURNING order_record.*
  `;
  return rows as OrderRow[];
}

export async function releasePaymentReminderClaim(orderNumber: string): Promise<void> {
  const db = requireDb();
  await db`
    UPDATE orders SET payment_reminder_sent_at = NULL
    WHERE order_number = ${orderNumber}
      AND status IN ('pending', 'awaiting_payment')
  `;
}

/**
 * Expires only orders created after the reservation safeguards shipped. Stock
 * restoration and the one-time marker happen in one statement, so a repeated
 * cron run cannot add the stock twice. Older live orders have no expiry/marker
 * and are deliberately left for a person to reconcile.
 */
export async function expireUnpaidCheckoutReservations(): Promise<string[]> {
  const db = requireDb();
  const candidates = await db`
    SELECT order_number FROM orders
    WHERE status IN ('pending', 'awaiting_payment')
      AND reservation_expires_at IS NOT NULL
      AND reservation_expires_at <= now()
    ORDER BY reservation_expires_at ASC
    LIMIT 100
  ` as { order_number: string }[];
  const expired: string[] = [];
  for (const candidate of candidates) {
    const rows = await db`
      WITH claimed AS (
        UPDATE orders
        SET status = 'cancelled',
            stock_restored_at = CASE WHEN checkout_stock_decremented_at IS NOT NULL THEN now() ELSE stock_restored_at END,
            admin_notes = concat_ws(E'\n\n', NULLIF(admin_notes, ''), 'Unpaid reservation expired automatically after 48 hours; reserved stock was released.')
        WHERE order_number = ${candidate.order_number}
          AND status IN ('pending', 'awaiting_payment')
          AND reservation_expires_at <= now()
        RETURNING checkout_stock_items, checkout_stock_decremented_at
      ), quantities AS (
        SELECT item->>'slug' AS slug, item->>'variant' AS dosage,
               SUM((item->>'quantity')::int)::int AS quantity
        FROM claimed, jsonb_array_elements(checkout_stock_items) AS item
        WHERE checkout_stock_decremented_at IS NOT NULL
          AND NULLIF(item->>'slug', '') IS NOT NULL
        GROUP BY item->>'slug', item->>'variant'
      ), restored AS (
        UPDATE product_variant_stock stock
        SET quantity = stock.quantity + quantities.quantity, updated_at = now()
        FROM quantities
        WHERE stock.slug = quantities.slug AND stock.dosage = quantities.dosage
        RETURNING stock.slug
      )
      SELECT EXISTS(SELECT 1 FROM claimed) AS expired
    ` as { expired: boolean }[];
    if (rows[0]?.expired) expired.push(candidate.order_number);
  }
  return expired;
}

// Records a PayPal order ID against an order — called when customer selects
// PayPal backup payment so admin can cross-reference with PayPal dashboard.
export async function updateOrderPaypalId(
  orderNumber: string,
  paypalOrderId: string,
): Promise<OrderRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE orders
    SET paypal_order_id = ${paypalOrderId}, status = 'awaiting_payment'
    WHERE order_number = ${orderNumber}
    RETURNING *
  `;
  return (rows[0] as OrderRow) ?? null;
}

// Finds an order using the Fena payment ID — the primary lookup used by the
// Fena webhook handler, which only receives the payment ID, not the order number.
export async function findOrderByFenaPaymentId(fenaPaymentId: string): Promise<OrderRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM orders WHERE fena_payment_id = ${fenaPaymentId} LIMIT 1
  `;
  return (rows[0] as OrderRow) ?? null;
}

// Updates an order's status following a payment event — called by webhook handlers.
// Conditional WHERE guard makes this atomic: only the first caller wins the
// race between the redirect confirm and the Fena webhook. If the order is
// already in a terminal state the update returns null so the caller must not
// send a confirmation email a second time.
export async function setOrderStatusFromPayment(
  orderNumber: string,
  newStatus: 'paid' | 'payment_failed' | 'payment_cancelled',
): Promise<OrderRow | null> {
  await ensureOrderPaymentConfirmationTracking();
  const db = requireDb();
  const rows = await db`
    UPDATE orders
    SET status = ${newStatus},
        payment_confirmed_at = CASE
          WHEN ${newStatus} = 'paid' THEN COALESCE(payment_confirmed_at, now())
          ELSE payment_confirmed_at
        END
    WHERE order_number = ${orderNumber}
      AND status NOT IN (
        'paid', 'awaiting_dispatch', 'exported', 'dispatched', 'delivered',
        'payment_failed', 'payment_cancelled', 'cancelled', 'refunded'
      )
    RETURNING *
  `;
  const updated = (rows[0] as OrderRow) ?? null;
  if (updated) {
    const { syncAffiliateOrderStatus } = await import('./affiliates');
    await syncAffiliateOrderStatus(orderNumber, newStatus).catch(() => {});
  }
  return updated;
}

// Marks an order as paid by an admin (used for PayPal/manual payment confirmation),
// and (via the Fena webhook) for the final 'paid' -> 'awaiting_dispatch' step
// right after setOrderStatusFromPayment. Also transitions the status to
// 'awaiting_dispatch' so it appears in the dispatch queue immediately.
//
// Atomic WHERE guard (same pattern as setOrderStatusFromPayment) — without
// this, two rapid admin clicks on "Mark as Paid" (or a retried request) could
// both pass markOrderPaidManually's prior status read before either UPDATE
// lands, both succeed here, and both go on to double-dispatch a Royal Mail
// label, double-decrement stock, and double-send confirmation emails. The
// guard allows the transition from any pre-paid status, including 'paid'
// itself (the webhook's own call lands here right after already setting
// status='paid'), but rejects it once the order has moved past this step —
// callers (markOrderPaidManually.ts) already treat a null return as "could
// not update", so a second concurrent call safely no-ops instead of
// re-running the whole fulfilment sequence.
export async function markOrderPaidByAdmin(orderNumber: string): Promise<OrderRow | null> {
  await ensureOrderPaymentConfirmationTracking();
  const db = requireDb();
  const rows = await db`
    UPDATE orders
    SET status = 'awaiting_dispatch',
        payment_method = COALESCE(payment_method, 'manual'),
        payment_confirmed_at = COALESCE(payment_confirmed_at, now())
    WHERE order_number = ${orderNumber}
      AND status IN ('pending', 'awaiting_payment', 'paid')
    RETURNING *
  `;
  const updated = (rows[0] as OrderRow) ?? null;
  if (updated) {
    const { syncAffiliateOrderStatus } = await import('./affiliates');
    await syncAffiliateOrderStatus(orderNumber, 'awaiting_dispatch').catch(() => {});
  }
  return updated;
}

// ─── Shipping workflow helpers ────────────────────────────────────────────────

// Returns all orders that are ready for dispatch preparation — status is
// 'paid' or 'awaiting_dispatch' (the post-payment statuses before export).
export async function listOrdersReadyForDispatch(): Promise<OrderRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM orders
    WHERE status IN ('paid', 'awaiting_dispatch')
    ORDER BY created_at ASC
  `;
  return rows as OrderRow[];
}

// Returns all orders that haven't been exported to Royal Mail yet — used to
// build the CSV export. Includes 'paid', 'awaiting_dispatch', but NOT already
// 'exported' or 'dispatched'. Excludes non-Royal-Mail fulfilment (hand
// delivered/collection/no-delivery/other-manual) — those orders must never
// enter the Royal Mail CSV fallback path and risk a real label/postage spend
// for a delivery method that was never going to use Royal Mail.
export async function listOrdersForCSVExport(): Promise<OrderRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM orders
    WHERE status IN ('paid', 'awaiting_dispatch') AND exported_at IS NULL
      AND fulfilment_type = 'royal_mail'
    ORDER BY created_at ASC
  `;
  return rows as OrderRow[];
}

// Marks a batch of orders as exported — called after generating the Royal Mail
// CSV so each order isn't duplicated in future exports.
export async function markOrdersExported(orderNumbers: string[]): Promise<void> {
  if (!orderNumbers.length) return;
  const db = requireDb();
  await db`
    UPDATE orders
    SET status = 'exported', exported_at = now()
    WHERE order_number = ANY(${orderNumbers}::text[])
      AND status IN ('paid', 'awaiting_dispatch')
  `;
}

// Marks an order as dispatched and records the tracking number.
// Also sets dispatched_at so we know exactly when it was handed to the carrier.
export async function markOrderDispatched(
  orderNumber: string,
  trackingNumber: string,
  parcelWeightGrams?: number | null,
): Promise<OrderRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE orders
    SET status = 'dispatched',
        tracking_number = ${trackingNumber},
        dispatched_at = now(),
        parcel_weight_grams = COALESCE(${parcelWeightGrams ?? null}, parcel_weight_grams)
    WHERE order_number = ${orderNumber}
    RETURNING *
  `;
  return (rows[0] as OrderRow) ?? null;
}

// Returns orders that have been exported to Royal Mail CSV but not yet given a
// tracking number — the "Step 2" queue in the Dispatch Centre.
export async function listExportedOrdersAwaitingTracking(): Promise<OrderRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM orders
    WHERE status = 'exported'
      AND (tracking_number IS NULL OR tracking_number = '')
    ORDER BY exported_at ASC NULLS LAST
  `;
  return rows as OrderRow[];
}

// Appends a line to an order's internal admin notes (visible only in the admin
// panel — never shown to customers).
export async function addAdminNote(orderNumber: string, note: string): Promise<void> {
  const db = requireDb();
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  await db`
    UPDATE orders
    SET admin_notes = CASE
      WHEN admin_notes IS NULL OR admin_notes = '' THEN ${timestamp + ': ' + note}
      ELSE admin_notes || E'\n' || ${timestamp + ': ' + note}
    END
    WHERE order_number = ${orderNumber}
  `;
}

// Overwrites the free-text internal notes for an order — used by the admin
// panel notes textarea (full replace, not append).
export async function updateOrderNotes(orderNumber: string, notes: string): Promise<void> {
  const db = requireDb();
  await db`UPDATE orders SET admin_notes = ${notes || null} WHERE order_number = ${orderNumber}`;
}

// Returns a summary of which orders used a given discount code — used by the
// admin Discount Codes page to show a usage log per code.
export interface OrderDiscountUsage {
  order_number: string;
  customer_name: string;
  email: string;
  total: string;
  created_at: string;
}

export async function listOrdersByDiscountCode(code: string): Promise<OrderDiscountUsage[]> {
  const db = requireDb();
  const rows = await db`
    SELECT order_number, customer_name, email, total, created_at
    FROM orders
    WHERE upper(discount_code) = upper(${code})
      AND status NOT IN ('payment_failed', 'payment_cancelled', 'cancelled')
    ORDER BY created_at DESC
  `;
  return rows as OrderDiscountUsage[];
}

// Returns the total units sold per product slug — used by the admin Products
// page to show a "Sold" column. Only counts confirmed/paid orders.
export async function getProductSoldCounts(): Promise<Record<string, number>> {
  const db = requireDb();
  const rows = await db`
    SELECT
      item->>'slug' AS slug,
      SUM((item->>'quantity')::int)::int AS total_sold
    FROM orders,
      jsonb_array_elements(items) AS item
    WHERE status IN ('paid', 'awaiting_dispatch', 'exported', 'dispatched', 'delivered')
      AND item->>'slug' IS NOT NULL
    GROUP BY item->>'slug'
  `;
  const map: Record<string, number> = {};
  for (const row of rows as { slug: string; total_sold: number }[]) {
    map[row.slug] = row.total_sold;
  }
  return map;
}

// Returns orders associated with a given customer email (used for the admin
// customer detail panel so staff can see a customer's full order history
// without leaving the Customers page).
export interface CustomerOrderSummary {
  order_number: string;
  total: string;
  status: string;
  created_at: string;
  payment_confirmed_at: string | null;
}

export async function listOrdersByCustomerEmail(email: string): Promise<CustomerOrderSummary[]> {
  await ensureOrderPaymentConfirmationTracking();
  const db = requireDb();
  const rows = await db`
    SELECT order_number, total, status, created_at, payment_confirmed_at
    FROM orders
    WHERE lower(email) = lower(${email})
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return rows as CustomerOrderSummary[];
}

// ─── Invoices (manual wholesale/backup invoicing) ───────────────────────────
// Moved to ./db/invoices.ts on 2026-08-16. Re-exported here so every existing
// '@/lib/db' import keeps working unchanged.
export { createInvoice, findInvoiceById, findInvoiceByPublicToken, setInvoiceFenaPaymentUrl, recordInvoiceTermsAcceptance, findInvoiceByOrderNumber, listInvoices, INVOICE_SORTS, updateInvoice, appendInvoiceEditLog, duplicateInvoice, deleteInvoice, markInvoiceSent, markInvoiceViewed, cancelInvoice, markInvoicePaid, applyInvoicePaypalFee } from './db/invoices';
export type { InvoiceLineItem, InvoiceEditLogEntry, InvoiceRow, InvoiceWriteParams, InvoiceSort, InvoiceListFilters } from './db/invoices';

// ─── Category settings ──────────────────────────────────────────────────────
// Moved to ./db/categorySettings.ts on 2026-08-11. Re-exported here so every existing
// '@/lib/db' import keeps working unchanged.
export { getCategorySettings, setCategoryEnabled, listCategories, createCategory, renameCategory, renameCategoryInDiscountCodes, renameCategoryInPromotions, deleteCategory, reorderCategories } from './db/categorySettings';
export type { CategoryRow } from './db/categorySettings';


// ─── Site content (admin-editable copy) ─────────────────────────────────────
// Moved to ./db/siteContent.ts on 2026-08-11. Re-exported here so every existing
// '@/lib/db' import keeps working unchanged.
export { getSiteContent, getAllSiteContent, upsertSiteContent, deleteSiteContent } from './db/siteContent';
export type { SiteContentRow } from './db/siteContent';


// ─── Promotions (homepage banner) ───────────────────────────────────────────
// Moved to ./db/promotions.ts on 2026-08-11. Re-exported here so every existing
// '@/lib/db' import keeps working unchanged.
export { listPromotions, getActivePromotion, getActivePercentagePromotion, deactivateOtherPercentagePromotions, createPromotion, updatePromotion, deletePromotion, listPromotionRules, listActivePromotionRules, getPromotionRule, createPromotionRule, updatePromotionRule, deletePromotionRule } from './db/promotions';
export type { PromotionType, PromotionRow, PromotionRuleRow } from './db/promotions';


// ─── Shipping settings (global Royal Mail defaults) ────────────────────────
// Moved to ./db/shippingSettings.ts on 2026-08-11. Re-exported here so every existing
// '@/lib/db' import keeps working unchanged.
export { getShippingSettings, updateShippingSettings } from './db/shippingSettings';
export type { ShippingSettingsRow } from './db/shippingSettings';


export async function countOrdersByEmail(email: string): Promise<number> {
  await ensureOrderPaymentConfirmationTracking();
  const db = requireDb();
  const rows = await db`
    SELECT COUNT(*)::int AS cnt FROM orders
    WHERE email = ${email.toLowerCase()}
      AND payment_confirmed_at IS NOT NULL
  `;
  return rows[0]?.cnt ?? 0;
}


// Peripheral feature modules extracted 2026-07-05 — re-exported so existing
// '@/lib/db' imports keep resolving.
export * from './db/marketing';
export * from './db/reviews';
export * from './db/upsells';
export * from './db/productCosts';

// ─── QR Campaign Tracking ─────────────────────────────────────────────────────
// Moved to ./db/qrCampaigns.ts on 2026-08-11. Re-exported here so every existing
// '@/lib/db' import keeps working unchanged.
export { listQrCampaignMembers, listQrCampaignGuestBuyers, listQrCampaigns, getQrCampaignById, getQrCampaignBySlug, createQrCampaign, updateQrCampaign, deleteQrCampaign, resetQrCampaignScans, recordCampaignScan, getQrCampaignStats, getQrScansTimeSeries, getQrOrdersTimeSeries } from './db/qrCampaigns';
export type { QrCampaignRow, QrCampaignStats, QrCampaignMember, QrCampaignGuestBuyer, QrScanTimePoint, QrOrderTimePoint } from './db/qrCampaigns';

// ─── Customer last login ──────────────────────────────────────────────────────

export async function touchCustomerLastLogin(customerId: number): Promise<void> {
  const db = requireDb();
  await db`UPDATE customers SET last_login_at = now() WHERE id = ${customerId}`;
}

// ─── Customer full profile (CRM) ─────────────────────────────────────────────

export interface CustomerOrderSummary {
  order_number: string;
  status: string;
  total: string;
  items: unknown;
  discount_code: string | null;
  created_at: string;
  payment_confirmed_at: string | null;
}

export async function countPaidOrdersByCustomerId(customerId: number): Promise<number> {
  await ensureOrderPaymentConfirmationTracking();
  const db = requireDb();
  const rows = await db`
    SELECT COUNT(*)::int AS count
    FROM orders
    WHERE customer_id = ${customerId} AND payment_confirmed_at IS NOT NULL
  `;
  return Number(rows[0]?.count ?? 0);
}

export interface CustomerProfileData {
  customer: CustomerRow & { last_login_at: string | null };
  orders: CustomerOrderSummary[];
  totalSpent: number;
  orderCount: number;
  discountCodesUsed: string[];
  /**
   * When a verification link was last generated for this customer, and how
   * many have been. A link is minted immediately before every send attempt,
   * so this is the honest answer to "have they been sent their code, and
   * when?" without adding a column that would sit empty until someone
   * remembered to run the DB setup.
   */
  verificationEmail: { lastSentAt: string | null; timesSent: number };
  /**
   * State of this customer's own signup code in discount_signups: 'active'
   * means issued and still spendable, 'used' means already redeemed, null
   * means there is no signup row for it. Added for the customer's own page
   * (task efa43ea1), which showed the code but could not say, or change,
   * whether it had been spent.
   */
  discountCodeStatus: 'active' | 'used' | null;
}

export async function getCustomerProfileData(customerId: number): Promise<CustomerProfileData | null> {
  await ensureOrderPaymentConfirmationTracking();
  const db = requireDb();

  const customerRows = await db`
    SELECT *, last_login_at FROM customers WHERE id = ${customerId} LIMIT 1
  `;
  if (!customerRows[0]) return null;
  const customer = customerRows[0] as CustomerRow & { last_login_at: string | null };

  const orderRows = await db`
    SELECT order_number, status, total, items, discount_code, discount_amount, created_at, payment_confirmed_at
    FROM orders
    WHERE customer_id = ${customerId}
       OR (customer_id IS NULL AND lower(email) = lower(${customer.email}))
    ORDER BY created_at DESC
  `;
  const orders = orderRows as CustomerOrderSummary[];

  const totalSpent = orders
    .filter(o => !['cancelled', 'refunded', 'pending', 'awaiting_payment', 'payment_failed', 'payment_cancelled'].includes(o.status))
    .reduce((sum, o) => sum + Number(o.total), 0);

  const orderCount = orders.filter(o => o.payment_confirmed_at !== null).length;

  const discountCodesUsed = orders
    .map(o => o.discount_code)
    .filter((c): c is string => !!c)
    .filter((c, i, arr) => arr.indexOf(c) === i);

  const verifyTokenRows = await db`
    SELECT COUNT(*)::int AS times_sent, MAX(created_at) AS last_sent_at
    FROM email_verification_tokens
    WHERE customer_id = ${customerId}
  `;
  const verificationEmail = {
    lastSentAt: (verifyTokenRows[0]?.last_sent_at as string | null) ?? null,
    timesSent: (verifyTokenRows[0]?.times_sent as number) ?? 0,
  };

  // Joined by code, because discount_signups has no customer_id column — the
  // same join the customer list makes in listCustomersWithStats.
  let discountCodeStatus: 'active' | 'used' | null = null;
  if (customer.discount_code) {
    const signupRows = await db`
      SELECT status FROM discount_signups WHERE code = ${customer.discount_code} LIMIT 1
    `;
    const status = signupRows[0]?.status as string | undefined;
    discountCodeStatus = status === 'used' || status === 'active' ? status : null;
  }

  return {
    customer,
    orders,
    totalSpent,
    orderCount,
    discountCodesUsed,
    verificationEmail,
    discountCodeStatus,
  };
}
