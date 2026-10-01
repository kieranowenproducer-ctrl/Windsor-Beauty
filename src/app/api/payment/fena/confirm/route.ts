import { NextResponse } from 'next/server';
import { findOrderByNumber, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payment/fena/confirm
 *
 * Called by the success page immediately when Fena redirects back with
 * status=paid in the URL.
 *
 * SECURITY: this route is READ-ONLY — it never marks an order paid or
 * triggers stock decrement, Royal Mail dispatch, or emails itself. It only
 * reports the order's *current* status, which only the authenticated Fena
 * webhook (src/app/api/webhooks/fena/route.ts, verified against
 * FENA_WEBHOOK_SECRET) is allowed to change.
 *
 * Previously this route trusted the client-supplied orderNumber/status and
 * marked the order paid directly — since order numbers are not secret
 * (every customer sees their own, format WG-XXXXXX), anyone who knew or
 * guessed an order number could POST here and get an order marked paid,
 * dispatched, and emailed with no money ever moving. Fixed 2026-06-30 by
 * making this purely a status lookup; the frontend already has a safe
 * polling fallback (fena/status/[orderId]) for "not yet confirmed", so this
 * route now just returns `pending: true` and the page falls into that same
 * already-safe poll loop instead of trusting the URL.
 *
 * Body: { orderNumber: string }
 */
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim() : null;

  if (!orderNumber) {
    return NextResponse.json({ error: 'orderNumber is required' }, { status: 400 });
  }

  const order = await findOrderByNumber(orderNumber);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const paid = ['paid', 'awaiting_dispatch', 'exported', 'dispatched', 'delivered'].includes(order.status);
  if (paid) {
    return NextResponse.json({ success: true, alreadyConfirmed: true, subtotal: Number(order.subtotal) });
  }

  const failed = order.status === 'payment_failed';
  const cancelled = order.status === 'payment_cancelled';

  // Webhook hasn't landed yet (or never will, for a failed/cancelled
  // payment) — tell the frontend so it can fall back to its existing
  // status-polling loop rather than treating this as confirmed.
  return NextResponse.json({ success: true, pending: !failed && !cancelled, failed, cancelled });
}
