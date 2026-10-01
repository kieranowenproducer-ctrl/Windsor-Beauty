import { NextResponse } from 'next/server';
import { findOrderByPaymentAccessToken, isDbConfigured } from '@/lib/db';
import { buildPaypalLink } from '@/lib/paypalInstructionsEmail';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ token: string }> }) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Payment service unavailable.' }, { status: 503 });
  const { token } = await props.params;
  if (!/^[a-f0-9]{48}$/.test(token)) return NextResponse.json({ error: 'Payment link not found.' }, { status: 404 });
  const order = await findOrderByPaymentAccessToken(token);
  if (!order) return NextResponse.json({ error: 'Payment link not found.' }, { status: 404 });

  const paid = ['paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered'].includes(order.status);
  const expired = Boolean(order.reservation_expires_at && new Date(order.reservation_expires_at).getTime() <= Date.now());
  const payable = !paid && !expired && ['pending', 'awaiting_payment'].includes(order.status);
  const paymentUrl = !payable ? null
    : order.payment_method === 'paypal' ? buildPaypalLink(order.order_number, Number(order.total))
    : order.payment_method === 'fena' ? order.fena_payment_url
    : null;

  return NextResponse.json({
    orderNumber: order.order_number,
    total: Number(order.total),
    paymentMethod: order.payment_method,
    paid,
    expired,
    payable,
    paymentUrl,
    expiresAt: order.reservation_expires_at,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
