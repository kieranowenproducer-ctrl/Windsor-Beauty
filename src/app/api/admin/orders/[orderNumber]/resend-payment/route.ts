import { beautyOperationalAddress } from '@/lib/operationalAddress';
import { NextResponse } from 'next/server';
import { findOrderByNumber, isDbConfigured } from '@/lib/db';
import { sendPaymentResumeEmail } from '@/lib/paymentResumeEmail';
import { reportAutomationFailure } from '@/lib/automationFailure';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const { orderNumber } = await props.params;
  const order = await findOrderByNumber(orderNumber);
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (!['pending', 'awaiting_payment'].includes(order.status)) return NextResponse.json({ error: 'This order is not awaiting payment.' }, { status: 409 });
  if (!order.payment_access_token) return NextResponse.json({ error: 'This older order has no secure recovery link. Check the payment account before contacting the customer.' }, { status: 409 });
  if (order.reservation_expires_at && new Date(order.reservation_expires_at).getTime() <= Date.now()) return NextResponse.json({ error: 'This reservation has expired.' }, { status: 409 });

  const siteUrl = beautyOperationalAddress(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.windsorbeauty.is';
  const resumeUrl = `${siteUrl}/resume-payment/${order.payment_access_token}`;
  if (order.payment_method === 'paypal') return NextResponse.json({ error: 'PayPal is paid on the website. No payment link email is sent.' }, { status: 409 });
  const sent = await sendPaymentResumeEmail({ to: order.email, customerName: order.customer_name, orderNumber: order.order_number, total: Number(order.total), resumeUrl });
  if (!sent) {
    await reportAutomationFailure('customer_email', `The payment reminder for ${order.order_number} was not sent.`, { orderNumber: order.order_number });
    return NextResponse.json({ error: 'The payment email could not be sent.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: `Payment email sent to ${order.email}.` });
}
