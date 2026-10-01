import { NextResponse } from 'next/server';
import { findOrderByNumber, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Service unavailable.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email')?.trim().toLowerCase() ?? '';

  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  const order = await findOrderByNumber(params.orderNumber).catch(() => null);

  if (!order || order.email.toLowerCase() !== email) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  return NextResponse.json({
    order: {
      orderNumber: order.order_number,
      status: order.status,
      createdAt: order.created_at,
      customerName: order.customer_name,
      shippingAddress: order.shipping_address,
      shippingLabel: order.shipping_label,
      items: order.items,
      subtotal: order.subtotal,
      discountAmount: order.discount_amount,
      shippingCost: order.shipping_cost,
      total: order.total,
      trackingNumber: order.tracking_number,
      trackingUrl: order.tracking_url,
      dispatchedAt: null,
    },
  });
}
