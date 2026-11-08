import { requireDb } from './client';
import { cameFrom } from '@/app/admin/customers/cameFrom';

// ─── Customer Stats (Samuel, 1 Nov 2026) ─────────────────────────────────────
// Month by month: how many people signed up, how many verified their email, where they came
// from, and whether they went on to order and how much. It is worked out fresh from the
// customer list on every request, so a new sign-up counts the moment the page is opened or
// refreshed. Nothing is stored, so there is no second copy that could drift from the real list.
//
// The rules are the Customers page's own, so the two screens never disagree:
//   - "ordered" means a PAID order (payment_confirmed_at set), matched by account or, for an
//     order placed without signing in, by the same email address;
//   - "spent" leaves out cancelled and refunded orders;
//   - "came from" is cameFrom(), the one rule every customer screen uses.
// Months are UK months, so a sign-up at 00:30 on 1 October UK time counts in October.
//
// This report is SELECT-only. Existing payment-confirmation fields must already be present.
// A deleted account is gone from the customer list, so it drops out of these numbers too.

export interface CustomerStatsPerson {
  id: number;
  name: string;
  email: string;
  /** UK month the account was made, as YYYY-MM. */
  month: string;
  createdAt: string;
  verified: boolean;
  source: string;
  sourceDetail: string | null;
  sourceKnown: boolean;
  paidOrders: number;
  spent: number;
}

export async function listCustomerStatsPeople(): Promise<CustomerStatsPerson[]> {
  const db = requireDb();
  const rows = (await db`
    SELECT c.id, c.first_name, c.last_name, c.email, c.email_verified, c.created_at,
      to_char(c.created_at AT TIME ZONE 'Europe/London', 'YYYY-MM') AS month,
      c.referred_by, c.qr_campaign_name, c.qr_campaign_type,
      COUNT(o.id) FILTER (WHERE o.payment_confirmed_at IS NOT NULL)::int AS paid_orders,
      COALESCE(SUM(o.total) FILTER (
        WHERE o.payment_confirmed_at IS NOT NULL AND o.status NOT IN ('cancelled', 'refunded')
      ), 0) AS spent
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
      OR (o.customer_id IS NULL AND lower(o.email) = lower(c.email))
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `) as Array<{
    id: number;
    first_name: string | null;
    last_name: string | null;
    email: string;
    email_verified: boolean;
    created_at: string | Date;
    month: string;
    referred_by: string | null;
    qr_campaign_name: string | null;
    qr_campaign_type: string | null;
    paid_orders: number;
    spent: string | number;
  }>;

  return rows.map((r) => {
    const from = cameFrom({
      referredBy: r.referred_by,
      qrCampaignName: r.qr_campaign_name,
      qrCampaignType: r.qr_campaign_type,
    });
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
    return {
      id: r.id,
      name: name || r.email,
      email: r.email,
      month: r.month,
      createdAt: new Date(r.created_at).toISOString(),
      verified: Boolean(r.email_verified),
      source: from.main,
      sourceDetail: from.detail,
      sourceKnown: from.known,
      paidOrders: r.paid_orders,
      spent: Math.round(Number(r.spent) * 100) / 100,
    };
  });
}
