import { NextResponse } from 'next/server';
import {
  findOrderByNumber,
  isDbConfigured,
  updateOrderPaypalId,
  updateOrderStatus,
} from '@/lib/db';
import { buildPaypalLink, sendPaypalInstructionsEmail } from '@/lib/paypalInstructionsEmail';
import { sendAdminOrderNotificationEmail } from '@/lib/adminOrderNotificationEmail';
import { reportAutomationFailure } from '@/lib/automationFailure';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payment/paypal/instructions
 *
 * Called by the checkout when the customer selects "Pay by PayPal".
 * Marks the order awaiting_payment, stores a PayPal reference, returns the
 * pre-filled PayPal link for the immediate on-site handoff, and emails the
 * same link as a backup.
 *
 * Environment variables:
 *   PAYPAL_RECEIVING_EMAIL  — business PayPal email or PayPal.me handle
 *   PAYPAL_ME_URL           — optional PayPal.me URL (takes priority over email link)
 */
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim() : null;
  const paymentToken = typeof body?.paymentToken === 'string' ? body.paymentToken.trim() : null;

  if (!orderNumber) {
    return NextResponse.json({ error: 'Order number is required' }, { status: 400 });
  }

  const order = await findOrderByNumber(orderNumber);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (!paymentToken || !order.payment_access_token || paymentToken !== order.payment_access_token) {
    return NextResponse.json({ error: 'This payment request is no longer valid.' }, { status: 403 });
  }

  if (!['pending', 'awaiting_payment'].includes(order.status)) {
    return NextResponse.json({ error: 'Order is already processing' }, { status: 409 });
  }

  // Reference customers put in their PayPal payment note to match their order
  const paypalReference = order.order_number;

  await updateOrderPaypalId(order.order_number, paypalReference);
  await updateOrderStatus(order.order_number, 'awaiting_payment');

  // Send instructions email — awaited so it completes before the serverless
  // function exits, but a failure here doesn't fail the request.
  const emailSent = await sendPaypalInstructionsEmail({
    to:             order.email,
    customerName:   order.customer_name,
    orderNumber:    order.order_number,
    items:          order.items,
    subtotal:       Number(order.subtotal),
    discountCode:   order.discount_code,
    discountAmount: Number(order.discount_amount),
    ruleDiscountAmount: Number(order.rule_discount_amount),
    shippingLabel:  order.shipping_label,
    shippingCost:   Number(order.shipping_cost),
    paypalFee:      Number(order.paypal_fee),
    total:          Number(order.total),
  }).catch(err => {
    console.error('[paypal/instructions] Email send failed:', err);
    return false;
  });

  // Tell staff a PayPal order has been placed the moment it happens — until
  // now this was silent, and the only way to learn it existed was noticing
  // it later in /admin/orders. PayPal has no payment webhook in this
  // codebase, so this is explicitly an "awaiting verification" notice, not a
  // payment confirmation — staff still need to check PayPal and click Mark
  // as Paid themselves; nothing here marks the order paid.
  const shippingAddress = [
    order.shipping_line1,
    order.shipping_line2,
    order.shipping_city,
    order.shipping_postcode,
    order.shipping_country,
  ].filter(Boolean).join('\n');

  await sendAdminOrderNotificationEmail({
    orderNumber:    order.order_number,
    customerName:   order.customer_name,
    email:          order.email,
    phone:          order.phone,
    items:          order.items,
    subtotal:       Number(order.subtotal),
    discountCode:   order.discount_code,
    discountAmount: Number(order.discount_amount),
    ruleDiscountAmount: Number(order.rule_discount_amount),
    shippingLabel:  order.shipping_label,
    shippingCost:   Number(order.shipping_cost),
    paypalFee:      Number(order.paypal_fee),
    total:          Number(order.total),
    shippingAddress,
    paymentMethod:  order.payment_method,
    paymentStatus:  'awaiting_verification',
    createdAt:      order.created_at,
  }).catch(err => console.error('[paypal/instructions] Admin notification email failed:', err));

  const resumeUrl = `/resume-payment/${order.payment_access_token}`;
  const paymentUrl = buildPaypalLink(order.order_number, Number(order.total));

  if (!paymentUrl) {
    await reportAutomationFailure('payment_provider', `The PayPal payment page for ${order.order_number} could not be created.`, {
      orderNumber: order.order_number,
      subject: order.email,
      whatToDo: 'Check PAYPAL_ME_URL or PAYPAL_RECEIVING_EMAIL before asking the customer to retry.',
      alertAdmin: true,
    });
    return NextResponse.json({
      success: false, emailSent, orderNumber: order.order_number, resumeUrl,
      error: 'Your order is reserved, but the PayPal page could not be opened. Please contact sales@windsorglow.com.',
    }, { status: 503 });
  }

  if (!emailSent) {
    await reportAutomationFailure('customer_email', `The PayPal payment email for ${order.order_number} was not sent.`, {
      orderNumber: order.order_number,
      subject: order.email,
      whatToDo: 'Open the order and resend its payment link after checking the customer address.',
      alertAdmin: true,
    });
    return NextResponse.json({
      success: true, emailSent: false, orderNumber: order.order_number, paymentUrl, resumeUrl,
      notice: 'The backup email could not be sent, but your PayPal payment page is ready.',
    });
  }
  return NextResponse.json({ success: true, orderNumber: order.order_number, emailSent: true, paymentUrl, resumeUrl });
}
