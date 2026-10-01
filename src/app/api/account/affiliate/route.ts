import { NextResponse } from 'next/server';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { affiliatesEnabled, createPayoutRequest, getAffiliateDashboard, type AffiliatePayoutMethod } from '@/lib/affiliates';
import { poundsToWholePence } from '@/lib/affiliateMoney';
import { sendAffiliatePayoutRequestEmail } from '@/lib/affiliateEmail';

export const dynamic = 'force-dynamic';

function previewData() {
  return {
    profile: { display_name: 'Raf', referral_code: 'RAF', status: 'active', balance_pence: 1954, withdrawable_pence: 1900, lifetime_earned_pence: 4879, referral_count: 12, paid_order_count: 8 },
    referrals: [
      { id: 1, first_name: 'Alex', last_name: 'M', email: 'a•••@example.com', status: 'active', code: 'RAF5-A12B3C4D', code_active: true, expires_at: '2027-03-22T12:00:00.000Z', qualifying_orders: 3, earned_pence: 823, created_at: '2026-09-18T12:00:00.000Z' },
      { id: 2, first_name: 'Jordan', last_name: 'P', email: 'j•••@example.com', status: 'active', code: 'RAF5-E56F7A8B', code_active: true, expires_at: '2027-03-22T12:00:00.000Z', qualifying_orders: 1, earned_pence: 188, created_at: '2026-09-20T12:00:00.000Z' },
    ],
    payouts: [{ id: 1, amount_pence: 1500, method: 'cash', status: 'paid', requested_at: '2026-09-15T12:00:00.000Z' }],
    ledger: [],
    invitations: [
      { id: 3, recipient_email: 'sam@example.com', created_source: 'affiliate', created_at: '2026-09-26T10:00:00.000Z', expires_at: '2026-10-03T10:00:00.000Z', state: 'delivered' },
      { id: 2, recipient_email: 'jo@example.com', created_source: 'affiliate', created_at: '2026-09-25T15:00:00.000Z', expires_at: '2026-10-02T15:00:00.000Z', state: 'email_failed' },
      { id: 1, recipient_email: 'a•••@example.com', created_source: 'recipient', created_at: '2026-09-18T12:00:00.000Z', expires_at: '2026-09-25T12:00:00.000Z', state: 'joined' },
    ],
  };
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'production' && new URL(request.url).searchParams.get('preview') === '1') {
    return NextResponse.json(previewData());
  }
  if (!affiliatesEnabled()) return NextResponse.json({ error: 'Affiliate access is not open yet.' }, { status: 404 });
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const dashboard = await getAffiliateDashboard(customer.id).catch(() => null);
  if (!dashboard) return NextResponse.json({ error: 'This account is not an affiliate account.' }, { status: 404 });
  return NextResponse.json(dashboard);
}

export async function POST(request: Request) {
  if (!affiliatesEnabled()) return NextResponse.json({ error: 'Affiliate access is not open yet.' }, { status: 404 });
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const amountPence = poundsToWholePence(body?.amountPounds);
  const method: AffiliatePayoutMethod | null = body?.method === 'cash' || body?.method === 'store_credit' ? body.method : null;
  if (!amountPence || !method) return NextResponse.json({ error: 'Choose a whole-pound amount and a valid reward type.' }, { status: 400 });
  try {
    const payout = await createPayoutRequest(customer.id, amountPence, method);
    await sendAffiliatePayoutRequestEmail({ affiliateName: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || customer.email, email: customer.email, amountPence, method }).catch(() => null);
    return NextResponse.json({ success: true, payout });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The request could not be created.' }, { status: 400 });
  }
}
