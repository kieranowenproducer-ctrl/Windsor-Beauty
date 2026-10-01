import { createHash, randomBytes } from 'crypto';
import { requireDb } from '@/lib/db/client';
import { affiliateProductPaidPence, commissionPence, wholePoundsAvailable } from '@/lib/affiliateMoney';

export type AffiliatePayoutMethod = 'cash' | 'store_credit';
export type AffiliatePayoutAction = 'approve' | 'refuse' | 'cancel' | 'mark_paid';

export function affiliatesEnabled(): boolean {
  // Off unless deliberately switched on. Windsor Beauty has not launched an
  // affiliate scheme; the code is kept so one can be turned on later.
  return process.env.WB_AFFILIATE_CUSTOMER_ACCESS_ENABLED === 'true';
}

export function normaliseAffiliateCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);
}

const INVITE_TOKEN = /^[a-f0-9]{64}$/;
const INVITE_DAYS = 7;
const REQUEST_KEY = /^[a-f0-9]{32}$/;

function inviteHash(token: string): string | null {
  const clean = token.trim().toLowerCase();
  return INVITE_TOKEN.test(clean) ? createHash('sha256').update(clean).digest('hex') : null;
}

/** How many invitations an affiliate can create themselves in one day, whether emailed or link-only. */
export const AFFILIATE_DAILY_INVITATIONS = 20;

export async function createAffiliateInvitation(
  affiliateCustomerId: number,
  recipientEmail: string,
  source: 'affiliate' | 'staff' | 'recipient' = 'affiliate',
  options: { sendEmail?: boolean } = {},
) {
  const db = requireDb();
  const email = recipientEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter the email address of the person you are inviting.');
  const token = randomBytes(32).toString('hex');
  const hash = inviteHash(token)!;
  const emailRequested = source === 'recipient' || options.sendEmail === true;
  const rows = await db`
    INSERT INTO affiliate_invitations (affiliate_customer_id, recipient_email, created_source, token_hash, delivery_status, email_requested_at, expires_at)
    SELECT ap.customer_id, ${email}, ${source}, ${hash},
           ${emailRequested ? 'pending' : 'not_requested'},
           ${emailRequested ? new Date().toISOString() : null},
           now() + (${INVITE_DAYS} * interval '1 day')
    FROM affiliate_profiles ap
    WHERE ap.customer_id = ${affiliateCustomerId} AND ap.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM customers c WHERE lower(c.email) = ${email})
      AND (SELECT COUNT(*) FROM affiliate_invitations i
           WHERE i.affiliate_customer_id = ap.customer_id AND i.redeemed_at IS NULL AND i.expires_at > now()) < 50
      AND (${source} <> 'affiliate' OR
        (SELECT COUNT(*) FROM affiliate_invitations i
         WHERE i.affiliate_customer_id = ap.customer_id AND i.created_source = 'affiliate'
           AND i.created_at > now() - interval '1 day') < ${AFFILIATE_DAILY_INVITATIONS})
      AND (${source} <> 'recipient' OR (
        (SELECT COUNT(*) FROM affiliate_invitations i
         WHERE i.affiliate_customer_id = ap.customer_id AND i.created_source = 'recipient'
           AND i.created_at > now() - interval '1 day') < 20
        AND NOT EXISTS (SELECT 1 FROM affiliate_invitations i
         WHERE i.affiliate_customer_id = ap.customer_id AND i.recipient_email = ${email}
           AND i.created_source = 'recipient' AND i.created_at > now() - interval '7 days')
      ))
    RETURNING id, recipient_email, expires_at
  `;
  if (!rows[0]) {
    throw new Error(source === 'affiliate'
      ? `This invitation could not be made. The person may already have a Windsor Beauty account, or you may have reached today’s limit of ${AFFILIATE_DAILY_INVITATIONS} invitations.`
      : 'This invitation could not be created. Check that the account is active, the email is new, and there are fewer than 50 open invitations.');
  }
  const id = Number(rows[0].id);
  // One person, one working link: a new invitation retires any older unused one for the same address.
  await db`
    UPDATE affiliate_invitations SET expires_at = now()
    WHERE affiliate_customer_id = ${affiliateCustomerId} AND recipient_email = ${email}
      AND id <> ${id} AND redeemed_at IS NULL AND expires_at > now()
  `;
  return { id, token, recipientEmail: email, expiresAt: String(rows[0].expires_at) };
}

/** The sign-up link an invitation token opens. Local runs link to the local app. */
export function affiliateInvitationLink(request: Request, token: string): string {
  const requestUrl = new URL(request.url);
  const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(requestUrl.hostname);
  const link = new URL('/account/register', local ? requestUrl.origin : 'https://www.windsorbeauty.co.uk');
  link.searchParams.set('affiliateInvite', token);
  return link.toString();
}

/** The ready-made message an affiliate sends from their own phone when they share a link themselves. */
export function affiliateShareMessage(affiliateName: string, recipientEmail: string, link: string): string {
  const name = affiliateName.trim();
  return `${name ? `Hi, it's ${name}.` : 'Hi.'} Here is your private invitation to Windsor Beauty. Join with this email address: ${recipientEmail}. You get 10% off your first order. The link works once and lasts 7 days: ${link}`;
}

export type AffiliateInvitationState = 'joined' | 'replaced' | 'expired' | 'email_failed' | 'delivered' | 'sent' | 'sending' | 'link_only';

/** One plain answer for "what happened to this invitation", newest facts first. */
export function affiliateInvitationState(row: {
  redeemed_at?: unknown; replaced?: unknown; expires_at?: unknown;
  delivery_status?: unknown; provider_status?: unknown;
}, now = Date.now()): AffiliateInvitationState {
  if (row.redeemed_at) return 'joined';
  if (row.replaced === true) return 'replaced';
  if (row.expires_at && Date.parse(String(row.expires_at)) <= now) return 'expired';
  const provider = String(row.provider_status ?? '');
  if (row.delivery_status === 'failed' || ['bounced', 'failed', 'complained', 'suppressed'].includes(provider)) return 'email_failed';
  if (['delivered', 'opened', 'clicked'].includes(provider)) return 'delivered';
  if (row.delivery_status === 'sent') return 'sent';
  if (row.delivery_status === 'pending') return 'sending';
  return 'link_only';
}

async function listInvitations(affiliateCustomerId: number | null, limit: number): Promise<Array<Record<string, unknown> & { state: AffiliateInvitationState }>> {
  const db = requireDb();
  // customer_emails holds what the email provider later reported (delivered, bounced). It is
  // created on first use, so a database that has never sent an email falls back to the plain list.
  const rows = await db`
    SELECT i.id, i.affiliate_customer_id, i.recipient_email, i.created_source, i.delivery_status,
           i.created_at, i.expires_at, i.redeemed_at, i.email_sent_at,
           EXISTS (SELECT 1 FROM affiliate_invitations n
                   WHERE n.affiliate_customer_id = i.affiliate_customer_id AND n.recipient_email = i.recipient_email
                     AND n.created_at > i.created_at) AS replaced,
           (SELECT ce.delivery_status FROM customer_emails ce
            WHERE i.email_provider_id IS NOT NULL AND ce.provider_id = i.email_provider_id
            ORDER BY ce.delivery_updated_at DESC NULLS LAST LIMIT 1) AS provider_status
    FROM affiliate_invitations i
    WHERE (${affiliateCustomerId}::INTEGER IS NULL OR i.affiliate_customer_id = ${affiliateCustomerId})
    ORDER BY i.created_at DESC LIMIT ${limit}
  `.catch(() => db`
    SELECT i.id, i.affiliate_customer_id, i.recipient_email, i.created_source, i.delivery_status,
           i.created_at, i.expires_at, i.redeemed_at, i.email_sent_at,
           EXISTS (SELECT 1 FROM affiliate_invitations n
                   WHERE n.affiliate_customer_id = i.affiliate_customer_id AND n.recipient_email = i.recipient_email
                     AND n.created_at > i.created_at) AS replaced,
           NULL AS provider_status
    FROM affiliate_invitations i
    WHERE (${affiliateCustomerId}::INTEGER IS NULL OR i.affiliate_customer_id = ${affiliateCustomerId})
    ORDER BY i.created_at DESC LIMIT ${limit}
  `);
  return (rows as Array<Record<string, unknown>>).map(row => ({ ...row, state: affiliateInvitationState(row) }));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain ?? ''}`;
}

export async function getOrCreateAffiliateRequestKey(affiliateCustomerId: number) {
  const db = requireDb();
  const proposed = randomBytes(16).toString('hex');
  const rows = await db`
    UPDATE affiliate_profiles SET request_key = COALESCE(request_key, ${proposed})
    WHERE customer_id = ${affiliateCustomerId} AND status = 'active'
    RETURNING request_key
  `;
  if (!rows[0]) throw new Error('The affiliate profile must be active before its request page can open.');
  return String(rows[0].request_key);
}

export async function findAffiliateRequestProfile(key: string) {
  if (!REQUEST_KEY.test(key)) return null;
  const db = requireDb();
  const rows = await db`
    SELECT customer_id, display_name FROM affiliate_profiles
    WHERE request_key = ${key} AND status = 'active' LIMIT 1
  `;
  return rows[0] ? displayName(rows[0] as Record<string, unknown>) : null;
}

export async function markInvitationDelivery(invitationId: number, sent: boolean, providerId: string | null) {
  const db = requireDb();
  await db`
    UPDATE affiliate_invitations
    SET delivery_status = ${sent ? 'sent' : 'failed'},
        email_sent_at = ${sent ? new Date().toISOString() : null},
        email_provider_id = ${providerId}
    WHERE id = ${invitationId} AND delivery_status = 'pending'
  `;
}

/** Called by the email provider's delivery report when an invitation bounces or is refused. */
export async function markInvitationEmailFailedByProvider(providerId: string): Promise<boolean> {
  const db = requireDb();
  const rows = await db`
    UPDATE affiliate_invitations SET delivery_status = 'failed'
    WHERE email_provider_id = ${providerId} AND delivery_status = 'sent'
    RETURNING id
  `;
  return rows.length > 0;
}

export async function findAffiliateInvitation(token: string, recipientEmail?: string) {
  const hash = inviteHash(token);
  if (!hash) return null;
  const db = requireDb();
  const rows = await db`
    SELECT i.id, i.affiliate_customer_id, i.recipient_email, i.expires_at, ap.display_name
    FROM affiliate_invitations i JOIN affiliate_profiles ap ON ap.customer_id = i.affiliate_customer_id
    WHERE i.token_hash = ${hash} AND i.redeemed_at IS NULL AND i.expires_at > now()
      AND ap.status = 'active'
      AND (${recipientEmail ? recipientEmail.trim().toLowerCase() : null}::TEXT IS NULL
           OR i.recipient_email = ${recipientEmail ? recipientEmail.trim().toLowerCase() : null})
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createAffiliateReferralFromInvitation(token: string, recipientEmail: string, referredCustomerId: number) {
  const hash = inviteHash(token);
  if (!hash) return null;
  const email = recipientEmail.trim().toLowerCase();
  const db = requireDb();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = personalCode();
    try {
      const rows = await db`
        WITH invitation AS (
          SELECT i.id, i.affiliate_customer_id
          FROM affiliate_invitations i JOIN affiliate_profiles ap ON ap.customer_id = i.affiliate_customer_id
          WHERE i.token_hash = ${hash} AND i.recipient_email = ${email}
            AND i.redeemed_at IS NULL AND i.expires_at > now() AND ap.status = 'active'
            AND i.affiliate_customer_id <> ${referredCustomerId}
          FOR UPDATE OF i
        ), new_referral AS (
          INSERT INTO affiliate_referrals (affiliate_customer_id, referred_customer_id)
          SELECT affiliate_customer_id, ${referredCustomerId} FROM invitation
          ON CONFLICT (referred_customer_id) DO NOTHING
          RETURNING *
        ), new_discount AS (
          INSERT INTO discount_codes (
            code, percentage, discount_type, fixed_amount, scope_type, scope_categories,
            scope_product_slugs, expires_at, usage_limit, min_order_value
          )
          SELECT ${code}, ROUND(ap.customer_discount_bps / 100.0)::INTEGER, 'percentage', NULL, 'all', '[]'::jsonb,
                 '[]'::jsonb, now() + make_interval(days => ap.code_duration_days), NULL,
                 ap.minimum_product_subtotal_pence / 100.0
          FROM affiliate_profiles ap JOIN new_referral r ON r.affiliate_customer_id = ap.customer_id
          RETURNING *
        ), new_code AS (
          INSERT INTO affiliate_customer_codes (
            referral_id, affiliate_customer_id, customer_id, discount_code_id, code, expires_at
          )
          SELECT r.id, r.affiliate_customer_id, r.referred_customer_id, d.id, d.code, d.expires_at
          FROM new_referral r CROSS JOIN new_discount d
          RETURNING *
        )
        UPDATE affiliate_invitations i
        SET redeemed_at = now(), referred_customer_id = ${referredCustomerId}
        FROM invitation, new_code
        WHERE i.id = invitation.id AND new_code.customer_id = ${referredCustomerId}
        RETURNING new_code.*
      `;
      return rows[0] ?? null;
    } catch (error) {
      const postgresCode = (error as { code?: string } | null)?.code;
      if (postgresCode !== '23505' || attempt === 3) throw error;
    }
  }
  return null;
}

export async function getAffiliateCustomerCode(customerId: number) {
  const db = requireDb();
  const rows = await db`
    SELECT acc.code, acc.expires_at FROM affiliate_customer_codes acc
    JOIN affiliate_referrals ar ON ar.id = acc.referral_id
    JOIN affiliate_profiles ap ON ap.customer_id = acc.affiliate_customer_id
    WHERE acc.customer_id = ${customerId} AND acc.active = true AND acc.expires_at > now()
      AND ar.status = 'active' AND ap.status = 'active'
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function displayName(profile: Record<string, unknown>): Record<string, unknown> {
  // Every affiliate's chosen display name is shown exactly as it was saved,
  // including initials and all-capital names.
  return profile;
}

function personalCode(): string {
  return `RAF5-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export async function findAffiliateByReferralCode(code: string) {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM affiliate_profiles
    WHERE upper(referral_code) = upper(${normaliseAffiliateCode(code)}) AND status = 'active'
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createAffiliateReferral(affiliateCustomerId: number, referredCustomerId: number) {
  const db = requireDb();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = personalCode();
    try {
      const rows = await db`
      WITH profile AS (
        SELECT * FROM affiliate_profiles WHERE customer_id = ${affiliateCustomerId} AND status = 'active'
      ), new_referral AS (
        INSERT INTO affiliate_referrals (affiliate_customer_id, referred_customer_id)
        SELECT customer_id, ${referredCustomerId} FROM profile
        ON CONFLICT (referred_customer_id) DO NOTHING
        RETURNING *
      ), new_discount AS (
        INSERT INTO discount_codes (
          code, percentage, discount_type, fixed_amount, scope_type, scope_categories,
          scope_product_slugs, expires_at, usage_limit, min_order_value
        )
        SELECT ${code}, ROUND(customer_discount_bps / 100.0)::INTEGER, 'percentage', NULL, 'all', '[]'::jsonb,
               '[]'::jsonb, now() + make_interval(days => code_duration_days), NULL,
               minimum_product_subtotal_pence / 100.0
        FROM profile WHERE EXISTS (SELECT 1 FROM new_referral)
        RETURNING *
      )
      INSERT INTO affiliate_customer_codes (
        referral_id, affiliate_customer_id, customer_id, discount_code_id, code, expires_at
      )
      SELECT r.id, r.affiliate_customer_id, r.referred_customer_id, d.id, d.code, d.expires_at
      FROM new_referral r CROSS JOIN new_discount d
      RETURNING *
      `;
      if (rows[0]) return rows[0];
      return null;
    } catch (error) {
      const postgresCode = (error as { code?: string } | null)?.code;
      if (postgresCode !== '23505' || attempt === 3) throw error;
    }
  }
  return null;
}

export async function affiliateCodeOwnedBy(code: string, customerId: number): Promise<boolean> {
  const db = requireDb();
  const rows = await db`
    SELECT 1
    FROM affiliate_customer_codes acc
    JOIN customers c ON c.id = acc.customer_id
    JOIN affiliate_referrals ar ON ar.id = acc.referral_id
    JOIN affiliate_profiles ap ON ap.customer_id = acc.affiliate_customer_id
    WHERE upper(acc.code) = upper(${normaliseAffiliateCode(code)})
      AND acc.customer_id = ${customerId}
      AND c.email_verified = true
      AND acc.active = true AND acc.expires_at > now()
      AND ar.status = 'active' AND ap.status = 'active'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function affiliateCreditOwnedBy(code: string, customerId: number): Promise<boolean> {
  const db = requireDb();
  const rows = await db`
    SELECT 1 FROM affiliate_payout_requests
    WHERE affiliate_customer_id = ${customerId} AND method = 'store_credit'
      AND status = 'paid' AND upper(payment_reference) = upper(${normaliseAffiliateCode(code)})
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function recordAffiliateOrder(params: {
  orderId: number;
  customerId: number;
  code: string | null;
  subtotalAfterSale: number;
  discountAmount: number;
}) {
  const db = requireDb();
  const productPaidPence = affiliateProductPaidPence(params.subtotalAfterSale, params.discountAmount);
  const rows = await db`
    INSERT INTO affiliate_order_attributions (
      order_id, referral_id, affiliate_customer_id, customer_id, code,
      product_paid_pence, commission_pence
    )
    SELECT ${params.orderId}, ar.id, ar.affiliate_customer_id, ar.referred_customer_id, COALESCE(${params.code}, ''),
           ${productPaidPence},
           floor((${productPaidPence} * ap.commission_bps + 5000) / 10000.0)::INTEGER
    FROM affiliate_referrals ar
    JOIN affiliate_profiles ap ON ap.customer_id = ar.affiliate_customer_id
    WHERE ar.referred_customer_id = ${params.customerId}
      AND ar.status = 'active' AND ap.status = 'active'
      -- Only an order paid with this customer's own personal affiliate code earns.
      AND EXISTS (
        SELECT 1 FROM affiliate_customer_codes acc
        WHERE acc.referral_id = ar.id AND acc.customer_id = ${params.customerId}
          AND upper(acc.code) = upper(${params.code ?? ''})
      )
      AND ${productPaidPence} > 0
      AND floor((${productPaidPence} * ap.commission_bps + 5000) / 10000.0)::INTEGER > 0
    ON CONFLICT (order_id) DO NOTHING
    RETURNING *
  `;
  return rows[0] ?? null;
}

/** Idempotently earns on confirmed payment, or reverses on refund/cancellation. */
export async function syncAffiliateOrderStatus(orderNumber: string, status: string): Promise<void> {
  const db = requireDb();
  if (['paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered'].includes(status)) {
    await db`
      WITH changed AS (
        UPDATE affiliate_order_attributions a SET status = 'earned', earned_at = COALESCE(earned_at, now())
        FROM orders o WHERE a.order_id = o.id AND o.order_number = ${orderNumber} AND a.status = 'pending'
        RETURNING a.*
      )
      INSERT INTO affiliate_ledger (affiliate_customer_id, entry_type, amount_pence, order_attribution_id, dedupe_key, note)
      SELECT affiliate_customer_id, 'commission', commission_pence, id, 'commission:' || id, 'Commission earned'
      FROM changed ON CONFLICT (dedupe_key) DO NOTHING
    `;
  }
  if (['refunded', 'cancelled', 'payment_cancelled'].includes(status)) {
    await db`
      WITH changed AS (
        UPDATE affiliate_order_attributions a SET status = 'reversed', reversed_at = COALESCE(reversed_at, now())
        FROM orders o WHERE a.order_id = o.id AND o.order_number = ${orderNumber} AND a.status = 'earned'
        RETURNING a.*
      )
      INSERT INTO affiliate_ledger (affiliate_customer_id, entry_type, amount_pence, order_attribution_id, dedupe_key, note)
      SELECT affiliate_customer_id, 'refund_reversal', -commission_pence, id, 'reversal:' || id, 'Commission reversed after refund or cancellation'
      FROM changed ON CONFLICT (dedupe_key) DO NOTHING
    `;
  }
}

export async function getAffiliateDashboard(customerId: number) {
  const db = requireDb();
  const profiles = await db`
    SELECT ap.*, c.email,
      COALESCE((SELECT SUM(amount_pence) FROM affiliate_ledger WHERE affiliate_customer_id = ap.customer_id), 0)::INTEGER AS balance_pence,
      (SELECT COUNT(*) FROM affiliate_referrals WHERE affiliate_customer_id = ap.customer_id)::INTEGER AS referral_count,
      (SELECT COUNT(*) FROM affiliate_order_attributions WHERE affiliate_customer_id = ap.customer_id AND status = 'earned')::INTEGER AS paid_order_count,
      COALESCE((SELECT SUM(commission_pence) FROM affiliate_order_attributions WHERE affiliate_customer_id = ap.customer_id AND status = 'earned'), 0)::INTEGER AS lifetime_earned_pence
    FROM affiliate_profiles ap JOIN customers c ON c.id = ap.customer_id
    WHERE ap.customer_id = ${customerId} AND ap.status = 'active' LIMIT 1
  `;
  if (!profiles[0]) return null;
  const referrals = await db`
    SELECT ar.id, ar.status, ar.created_at, c.first_name, c.last_name, c.email,
           acc.code, acc.active AS code_active, acc.expires_at,
           (SELECT COUNT(*) FROM affiliate_order_attributions ao WHERE ao.referral_id = ar.id AND ao.status = 'earned')::INTEGER AS qualifying_orders,
           COALESCE((SELECT SUM(commission_pence) FROM affiliate_order_attributions ao WHERE ao.referral_id = ar.id AND ao.status = 'earned'), 0)::INTEGER AS earned_pence
    FROM affiliate_referrals ar JOIN customers c ON c.id = ar.referred_customer_id
    LEFT JOIN affiliate_customer_codes acc ON acc.referral_id = ar.id
    WHERE ar.affiliate_customer_id = ${customerId} ORDER BY ar.created_at DESC
  `;
  const payouts = await db`SELECT * FROM affiliate_payout_requests WHERE affiliate_customer_id = ${customerId} ORDER BY requested_at DESC`;
  const ledger = await db`SELECT * FROM affiliate_ledger WHERE affiliate_customer_id = ${customerId} ORDER BY created_at DESC LIMIT 100`;
  // The affiliate sees the addresses they typed themselves. Someone who asked on the request page typed
  // their own address to Windsor Beauty, not to the affiliate, so the affiliate sees only a masked version.
  const invitations = (await listInvitations(customerId, 30)).map(row => ({
    id: row.id, created_source: row.created_source, created_at: row.created_at, expires_at: row.expires_at, state: row.state,
    recipient_email: row.created_source === 'recipient' ? maskEmail(String(row.recipient_email)) : row.recipient_email,
  }));
  const profile = displayName(profiles[0] as Record<string, unknown>);
  return { profile: { ...profile, withdrawable_pence: wholePoundsAvailable(Number(profile.balance_pence)) }, referrals, payouts, ledger, invitations };
}

export async function getActiveAffiliateName(customerId: number): Promise<string | null> {
  const db = requireDb();
  const rows = await db`SELECT customer_id, display_name FROM affiliate_profiles WHERE customer_id = ${customerId} AND status = 'active' LIMIT 1`;
  return rows[0] ? String(displayName(rows[0] as Record<string, unknown>).display_name) : null;
}

export async function isAffiliateCustomer(customerId: number): Promise<boolean> {
  const db = requireDb();
  const rows = await db`SELECT 1 FROM affiliate_profiles WHERE customer_id = ${customerId} AND status = 'active' LIMIT 1`;
  return rows.length > 0;
}

export async function createPayoutRequest(customerId: number, amountPence: number, method: AffiliatePayoutMethod) {
  const dashboard = await getAffiliateDashboard(customerId);
  if (!dashboard) throw new Error('Affiliate account not found.');
  if (amountPence <= 0 || amountPence % 100 !== 0) throw new Error('Choose a whole pound amount.');
  if (amountPence > Number(dashboard.profile.withdrawable_pence)) throw new Error('That is more than the available whole-pound balance.');
  const db = requireDb();
  const rows = await db`
    INSERT INTO affiliate_payout_requests (affiliate_customer_id, amount_pence, method)
    VALUES (${customerId}, ${amountPence}, ${method}) RETURNING *
  `;
  return rows[0];
}

export async function createAffiliateProfile(params: { customerId: number; displayName: string; referralCode: string; durationDays: number }) {
  const db = requireDb();
  const rows = await db`
    INSERT INTO affiliate_profiles (customer_id, display_name, referral_code, code_duration_days)
    VALUES (${params.customerId}, ${params.displayName.trim()}, ${normaliseAffiliateCode(params.referralCode)}, ${params.durationDays})
    ON CONFLICT (customer_id) DO UPDATE SET display_name = EXCLUDED.display_name,
      referral_code = EXCLUDED.referral_code, code_duration_days = EXCLUDED.code_duration_days,
      updated_at = now()
    RETURNING *
  `;
  return rows[0];
}

export async function getAffiliateAdminOverview() {
  const db = requireDb();
  const profiles = await db`
    SELECT ap.*, c.first_name, c.last_name, c.email,
      COALESCE((SELECT SUM(amount_pence) FROM affiliate_ledger WHERE affiliate_customer_id = ap.customer_id), 0)::INTEGER AS balance_pence,
      (SELECT COUNT(*) FROM affiliate_referrals WHERE affiliate_customer_id = ap.customer_id)::INTEGER AS referral_count,
      (SELECT COUNT(*) FROM affiliate_order_attributions WHERE affiliate_customer_id = ap.customer_id AND status = 'earned')::INTEGER AS order_count
    FROM affiliate_profiles ap JOIN customers c ON c.id = ap.customer_id ORDER BY ap.created_at
  `;
  const payouts = await db`
    SELECT p.*, ap.display_name, c.email FROM affiliate_payout_requests p
    JOIN affiliate_profiles ap ON ap.customer_id = p.affiliate_customer_id
    JOIN customers c ON c.id = p.affiliate_customer_id
    ORDER BY CASE p.status WHEN 'requested' THEN 0 WHEN 'approved' THEN 1 WHEN 'payment_pending' THEN 2 ELSE 3 END, p.requested_at
  `;
  const referrals = await db`
    SELECT ar.id, ar.affiliate_customer_id, ar.status, ar.created_at,
      c.first_name, c.last_name, c.email, acc.code, acc.active AS code_active, acc.expires_at,
      (SELECT COUNT(*) FROM affiliate_order_attributions ao WHERE ao.referral_id = ar.id AND ao.status = 'earned')::INTEGER AS order_count,
      COALESCE((SELECT SUM(commission_pence) FROM affiliate_order_attributions ao WHERE ao.referral_id = ar.id AND ao.status = 'earned'), 0)::INTEGER AS earned_pence
    FROM affiliate_referrals ar JOIN customers c ON c.id = ar.referred_customer_id
    LEFT JOIN affiliate_customer_codes acc ON acc.referral_id = ar.id
    ORDER BY ar.created_at DESC
  `;
  const invitations = await listInvitations(null, 50);
  return {
    profiles: profiles.map(row => displayName(row as Record<string, unknown>)),
    payouts: payouts.map(row => displayName(row as Record<string, unknown>)),
    referrals,
    invitations,
  };
}

export async function setAffiliateDuration(customerId: number, durationDays: number) {
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) throw new Error('Choose a duration between 1 day and 10 years.');
  const db = requireDb();
  await db`UPDATE affiliate_profiles SET code_duration_days = ${durationDays}, updated_at = now() WHERE customer_id = ${customerId}`;
}

export async function setAffiliateStatus(customerId: number, status: 'active' | 'paused') {
  const db = requireDb();
  await db`UPDATE affiliate_profiles SET status = ${status}, updated_at = now() WHERE customer_id = ${customerId}`;
  await db`UPDATE affiliate_customer_codes SET active = ${status === 'active'} WHERE affiliate_customer_id = ${customerId} AND expires_at > now()`;
}

export async function handlePayoutRequest(id: number, action: AffiliatePayoutAction, note?: string, paymentReference?: string) {
  const db = requireDb();
  if (action === 'approve') {
    const creditCode = `RAF-CREDIT-${randomBytes(4).toString('hex').toUpperCase()}`;
    const rows = await db`
      WITH balance AS (
        SELECT p.*, COALESCE(SUM(l.amount_pence), 0)::INTEGER AS available
        FROM affiliate_payout_requests p LEFT JOIN affiliate_ledger l ON l.affiliate_customer_id = p.affiliate_customer_id
        WHERE p.id = ${id} AND p.status = 'requested' GROUP BY p.id
      ), changed AS (
        UPDATE affiliate_payout_requests p SET status = CASE WHEN p.method = 'cash' THEN 'payment_pending' ELSE 'paid' END,
          approved_at = now(), updated_at = now(), staff_note = ${note ?? null},
          payment_reference = CASE WHEN p.method = 'store_credit' THEN ${creditCode} ELSE p.payment_reference END,
          paid_at = CASE WHEN p.method = 'store_credit' THEN now() ELSE p.paid_at END
        FROM balance b WHERE p.id = b.id AND b.available >= b.amount_pence RETURNING p.*
      ), credit AS (
        INSERT INTO discount_codes (code, percentage, discount_type, fixed_amount, scope_type, scope_categories, scope_product_slugs, usage_limit, min_order_value)
        SELECT ${creditCode}, NULL, 'fixed', amount_pence / 100.0, 'all', '[]'::jsonb, '[]'::jsonb, 1, 0
        FROM changed WHERE method = 'store_credit'
        RETURNING code
      )
      INSERT INTO affiliate_ledger (affiliate_customer_id, entry_type, amount_pence, payout_request_id, dedupe_key, note)
      SELECT affiliate_customer_id, CASE WHEN method = 'cash' THEN 'cash_payout' ELSE 'store_credit' END,
             -amount_pence, id, 'payout:' || id, ${note ?? 'Approved by staff'} FROM changed
      ON CONFLICT (dedupe_key) DO NOTHING RETURNING *
    `;
    if (!rows[0]) throw new Error('This request could not be approved. Check its status and available balance.');
    return;
  }
  if (action === 'mark_paid') {
    if (!paymentReference?.trim()) throw new Error('Add the bank or Fena payment reference before marking this paid.');
    const rows = await db`UPDATE affiliate_payout_requests SET status = 'paid', paid_at = now(), updated_at = now(), payment_reference = ${paymentReference ?? null}, staff_note = COALESCE(${note ?? null}, staff_note) WHERE id = ${id} AND status = 'payment_pending' RETURNING id`;
    if (!rows[0]) throw new Error('Only a payment waiting to be sent can be marked paid.');
    return;
  }
  if (action === 'cancel') {
    const rows = await db`
      WITH changed AS (
        UPDATE affiliate_payout_requests SET status = 'cancelled', updated_at = now(), staff_note = ${note ?? null}
        WHERE id = ${id} AND status IN ('requested', 'approved', 'payment_pending') RETURNING *
      )
      INSERT INTO affiliate_ledger (affiliate_customer_id, entry_type, amount_pence, payout_request_id, dedupe_key, note)
      SELECT affiliate_customer_id, 'payout_release', amount_pence, id, 'payout-release:' || id, 'Cancelled payout returned to balance'
      FROM changed WHERE status = 'cancelled' AND EXISTS (SELECT 1 FROM affiliate_ledger WHERE payout_request_id = changed.id AND dedupe_key = 'payout:' || changed.id)
      ON CONFLICT (dedupe_key) DO NOTHING RETURNING id
    `;
    // A newly requested item has no ledger entry, so a successful cancellation can return no ledger row.
    const cancelled = await db`SELECT id FROM affiliate_payout_requests WHERE id = ${id} AND status = 'cancelled'`;
    if (!rows[0] && !cancelled[0]) throw new Error('This request can no longer be cancelled.');
    return;
  }
  const rows = await db`UPDATE affiliate_payout_requests SET status = 'refused', updated_at = now(), staff_note = ${note ?? null} WHERE id = ${id} AND status = 'requested' RETURNING id`;
  if (!rows[0]) throw new Error('Only a new request can be refused.');
}

export async function listAffiliateCodesNeedingReminder(limit = 25) {
  const db = requireDb();
  return db`
    SELECT acc.id, acc.code, acc.expires_at, c.email, c.first_name
    FROM affiliate_customer_codes acc JOIN customers c ON c.id = acc.customer_id
    WHERE acc.active = true AND acc.expiry_reminder_sent_at IS NULL
      AND acc.expires_at > now() AND acc.expires_at <= now() + interval '30 days'
    ORDER BY acc.expires_at LIMIT ${limit}
  `;
}

export async function markAffiliateCodeReminderSent(id: number) {
  const db = requireDb();
  await db`UPDATE affiliate_customer_codes SET expiry_reminder_sent_at = now() WHERE id = ${id} AND expiry_reminder_sent_at IS NULL`;
}

// Exported pure calculation used by acceptance tests and the SQL snapshot comparison.
export { commissionPence };
