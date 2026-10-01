import { NextResponse } from 'next/server';
import { findOrderByNumber, isDbConfigured, markShippingEmailSent } from '@/lib/db';
import { sendShippingConfirmationEmail } from '@/lib/shippingEmail';

export const dynamic = 'force-dynamic';

function carrierLabel(shippingLabel: string): string {
  // Every UK parcel ships as Royal Mail Tracked 24 (Kieran, 2026-07-17),
  // whatever the customer chose. Only international differs.
  if (shippingLabel.toLowerCase().includes('international')) return 'Royal Mail International Tracked';
  return 'Royal Mail Tracked 24';
}

// POST /api/admin/orders/[orderNumber]/resend-dispatch
// Forces a resend of the dispatch confirmation email, ignoring the
// shipping_email_sent_at guard. Used when a customer didn't receive the email
// (spam filter, typo, etc.). Updates shipping_email_sent_at on success.
export async function POST(_request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const order = await findOrderByNumber(params.orderNumber);
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  if (!order.tracking_number) {
    return NextResponse.json({ error: 'No tracking number on this order — save a tracking number first.' }, { status: 400 });
  }

  const sent = await sendShippingConfirmationEmail({
    to:             order.email,
    customerName:   order.customer_name,
    orderNumber:    order.order_number,
    trackingNumber: order.tracking_number,
    carrierName:    carrierLabel(order.shipping_label),
  }).catch(() => false);

  if (!sent) {
    return NextResponse.json({ error: 'Email could not be sent — check RESEND_API_KEY.' }, { status: 500 });
  }

  await markShippingEmailSent(order.order_number).catch(() => {});
  return NextResponse.json({ success: true });
}
