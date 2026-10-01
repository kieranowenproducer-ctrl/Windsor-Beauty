import { NextResponse } from 'next/server';
import { findOrderByNumber, isDbConfigured, type OrderRow } from '@/lib/db';
import { createFenaPaymentLink } from '@/lib/fena';
import { sendPaymentLinkEmail } from '@/lib/paymentLinkEmail';
import { sendPaypalInstructionsEmail, buildPaypalLink } from '@/lib/paypalInstructionsEmail';

export const dynamic = 'force-dynamic';

// POST /api/admin/orders/[orderNumber]/resend-payment-link   { via: 'fena' | 'paypal' }
//
// Sends a customer their payment link again (task d0d5effb). Asked for after a
// real order: the customer went to make the bank transfer, lost the page, and
// could not get back to it. The checkout hands the Fena link straight to the
// browser and keeps no copy, so there was nothing to send her and no page to
// point her at. The order simply sat there unpaid.
//
// A NEW Fena link is made each time rather than storing one, which is how the
// checkout and the invoice send already work. A fresh link cannot have gone
// stale, and it is the same amount off the same order row either way.
//
// The link is returned as well as emailed, so whoever is replying to the
// customer by hand can paste it into their own reply.
//
// Protected by the admin session gate in src/proxy.ts, which covers every
// /api/admin route.

// Only an order still waiting for money. Sending a payment link for something
// already paid invites a second payment; sending one for a cancelled order
// re-opens something that was deliberately closed. This is the same instinct
// as task 477f3453, where an invoice left open after a cancel took £240.
const UNPAID_STATUSES: OrderRow['status'][] = [
  'pending', 'awaiting_payment', 'payment_failed', 'payment_cancelled',
];

export async function POST(request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const via = body?.via === 'paypal' ? 'paypal' : body?.via === 'fena' ? 'fena' : null;
  if (!via) {
    return NextResponse.json({ error: "Say which link to send: 'fena' or 'paypal'." }, { status: 400 });
  }

  const order = await findOrderByNumber(params.orderNumber);
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  if (!UNPAID_STATUSES.includes(order.status)) {
    return NextResponse.json(
      {
        error: `This order is ${order.status.replace(/_/g, ' ')}, so it is not waiting for payment. Set it back to Awaiting Payment first if the customer still needs to pay.`,
      },
      { status: 409 }
    );
  }

  if (order.reservation_expires_at && new Date(order.reservation_expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'This unpaid reservation has expired. Ask the customer to place a new order.' },
      { status: 409 },
    );
  }

  if (via === 'paypal') {
    const paymentUrl = buildPaypalLink(order.order_number, Number(order.total));
    const emailSent = await sendPaypalInstructionsEmail({
      to:                 order.email,
      customerName:       order.customer_name,
      orderNumber:        order.order_number,
      items:              order.items,
      subtotal:           Number(order.subtotal),
      discountCode:       order.discount_code,
      discountAmount:     Number(order.discount_amount),
      ruleDiscountAmount: Number(order.rule_discount_amount),
      shippingLabel:      order.shipping_label,
      shippingCost:       Number(order.shipping_cost),
      paypalFee:          Number(order.paypal_fee),
      total:              Number(order.total),
    }).catch(err => {
      console.error('[resend-payment-link] PayPal email failed:', err);
      return false;
    });

    if (!emailSent) {
      return NextResponse.json(
        { error: 'The PayPal instructions would not send. The link below still works, so you can paste it into a reply.', paymentUrl },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      via,
      paymentUrl,
      sentTo: order.email,
      message: `PayPal instructions sent to ${order.email}.`,
    });
  }

  const link = await createFenaPaymentLink(order.order_number);
  if (!link.ok) {
    // link.detail is Fena's own words and is for staff only, never a customer.
    return NextResponse.json(
      { error: link.error, detail: link.detail },
      { status: link.status || 502 }
    );
  }

  const emailSent = await sendPaymentLinkEmail({
    to:           order.email,
    customerName: order.customer_name,
    orderNumber:  order.order_number,
    total:        Number(order.total),
    paymentUrl:   link.paymentUrl,
  }).catch(err => {
    console.error('[resend-payment-link] payment link email failed:', err);
    return false;
  });

  if (!emailSent) {
    // The link is real and usable even though the email did not go, so hand it
    // back rather than losing it. Whoever pressed the button can paste it.
    return NextResponse.json(
      {
        error: 'The link was created but the email would not send. Copy the link below into a reply to the customer.',
        paymentUrl: link.paymentUrl,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    via,
    paymentUrl: link.paymentUrl,
    sentTo: order.email,
    message: `Payment link sent to ${order.email}.`,
  });
}
