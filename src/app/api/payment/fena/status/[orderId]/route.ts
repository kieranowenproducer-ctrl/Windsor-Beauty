import { NextResponse } from 'next/server';
import { findOrderByNumber, isDbConfigured } from '@/lib/db';

/**
 * GET /api/payment/fena/status/[orderId]
 *
 * Lightweight polling endpoint for the checkout success/pending page to check
 * whether a Fena payment has been confirmed by webhook yet.
 *
 * The checkout page can poll this every few seconds after redirecting back from
 * Fena to determine whether to show "Payment confirmed" or "Still processing".
 *
 * Response: { status: OrderRow['status'], paid: boolean }
 */
export async function GET(_request: Request, props: { params: Promise<{ orderId: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const orderNumber = params.orderId;
  if (!orderNumber) {
    return NextResponse.json({ error: 'Order number required' }, { status: 400 });
  }

  const order = await findOrderByNumber(orderNumber);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const paid = ['paid', 'awaiting_dispatch', 'exported', 'dispatched', 'delivered'].includes(order.status);
  const failed = ['payment_failed', 'payment_cancelled', 'cancelled'].includes(order.status);

  return NextResponse.json({
    orderNumber: order.order_number,
    status: order.status,
    paid,
    failed,
    paymentMethod: order.payment_method,
    subtotal: Number(order.subtotal),
  });
}
