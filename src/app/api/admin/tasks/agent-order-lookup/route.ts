// Agent-only order lookup for the AI support agent (bearer-gated, same pattern
// as agent-catalogue). SAFETY: returns order status/tracking ONLY when the
// supplied order number AND email match the same record — the identity-
// verification rule. Never returns payment details, addresses, or other PII
// beyond what a customer needs to hear about their own delivery.
import { NextResponse } from 'next/server';
import { findOrderByNumber } from '@/lib/db';

export const dynamic = 'force-dynamic';

function authed(request: Request): boolean {
  const secret = process.env.AGENT_TASK_SECRET;
  return Boolean(secret) && (request.headers.get('authorization') || '') === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const orderNumber = String(b.orderNumber ?? '').trim().toUpperCase();
  const email = String(b.email ?? '').trim().toLowerCase();
  if (!orderNumber || !email) {
    return NextResponse.json({ ok: false, reason: 'need_both', message: 'An order number AND the email used on the order are both required to look it up.' });
  }
  const order = await findOrderByNumber(orderNumber).catch(() => null);
  // Identical response whether the order is missing or the email does not match,
  // so this endpoint can't be used to probe which orders/emails exist.
  if (!order || String(order.email || '').trim().toLowerCase() !== email) {
    return NextResponse.json({ ok: false, reason: 'no_match', message: 'No order matches that number and email together. Please double-check both.' });
  }
  // Safe, customer-appropriate fields only.
  const items = Array.isArray(order.items) ? order.items.map((i: { name?: string; quantity?: number }) => `${i.quantity ?? 1}x ${i.name ?? 'item'}`) : [];
  return NextResponse.json({
    ok: true,
    order: {
      orderNumber: order.order_number,
      status: order.status,
      dispatchedAt: order.dispatched_at ?? null,
      trackingNumber: order.tracking_number ?? null,
      trackingUrl: order.tracking_url ?? null,
      items,
      placedAt: order.created_at ?? null,
    },
  });
}
