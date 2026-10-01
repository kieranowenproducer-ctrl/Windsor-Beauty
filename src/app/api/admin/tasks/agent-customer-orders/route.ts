// Agent-only customer-orders endpoint (Stage 5 of the assistant merge).
//
// The hosted concierge service calls this to answer a SIGNED-IN customer about
// their own orders. The caller is trusted (it holds AGENT_TASK_SECRET and only
// ever passes a customer id it took from a session cookie the website
// verified), but ownership is still enforced HERE, on the rows this endpoint
// actually fetched — the same identity rule the account concierge always had:
// an order number is only ever used to select from the orders this customer
// already owns.
//
// Data minimisation happens here too, where the data lives: the model never
// receives a delivery address, only a town and a masked postcode, and nothing
// about payment beyond the order total.
import { NextResponse } from 'next/server';
import { findOrderByNumber, listOrdersByCustomerId, type OrderRow } from '@/lib/db';
import { buildTrackingUrl } from '@/lib/royalMail';
import { redactForModel } from '@/lib/concierge/redact';

export const dynamic = 'force-dynamic';

function authed(request: Request): boolean {
  const secret = process.env.AGENT_TASK_SECRET;
  return Boolean(secret) && (request.headers.get('authorization') || '') === `Bearer ${secret}`;
}

// Customer-safe fields only. Status stays raw: the service owns the
// customer-facing wording, this endpoint owns the data.
function toSafe(o: OrderRow) {
  return {
    orderNumber: o.order_number,
    placedAt: o.created_at,
    status: o.status,
    items: Array.isArray(o.items)
      ? o.items.map((i) => ({ name: i.name ?? 'item', quantity: i.quantity ?? 1, variant: i.variant ?? null }))
      : [],
    total: o.total,
    deliveringTo: redactForModel(
      o.shipping_line1
        ? { line1: o.shipping_line1, city: o.shipping_city ?? '', postcode: o.shipping_postcode ?? '' }
        : o.shipping_address,
    ),
    tracking: o.tracking_number
      ? { number: o.tracking_number, url: o.tracking_url || buildTrackingUrl(o.tracking_number) }
      : null,
  };
}

export async function POST(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await request.json().catch(() => ({}) as Record<string, unknown>);
  const customerId = Number(b.customerId);
  if (!Number.isFinite(customerId) || customerId <= 0) {
    return NextResponse.json({ ok: false, error: 'customerId required' }, { status: 400 });
  }

  // Single-order mode: prove the named order belongs to this customer.
  if (b.orderNumber) {
    const on = String(b.orderNumber).trim().toUpperCase();
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!/^[A-Z0-9-]{4,20}$/.test(on)) return NextResponse.json({ ok: false, reason: 'no_match' });
    const order = await findOrderByNumber(on).catch(() => null);
    // Ownership on the row actually fetched: the customer_id link is
    // authoritative; the email match is the fallback for legacy guest orders
    // placed before an account existed. Identical response whether the order
    // is missing or belongs to somebody else — no probing.
    const ownsById = order?.customer_id != null && order.customer_id === customerId;
    const ownsByEmail = Boolean(order && email
      && String(order.email ?? '').trim().toLowerCase() === email);
    if (!order || (!ownsById && !ownsByEmail)) {
      return NextResponse.json({ ok: false, reason: 'no_match' });
    }
    return NextResponse.json({ ok: true, order: toSafe(order) });
  }

  // List mode: this customer's recent orders.
  const limit = Math.min(Math.max(Number(b.limit) || 10, 1), 25);
  const orders = await listOrdersByCustomerId(customerId, limit).catch(() => null);
  if (orders === null) return NextResponse.json({ ok: false, error: 'lookup failed' }, { status: 502 });
  return NextResponse.json({ ok: true, orders: orders.map(toSafe) });
}
