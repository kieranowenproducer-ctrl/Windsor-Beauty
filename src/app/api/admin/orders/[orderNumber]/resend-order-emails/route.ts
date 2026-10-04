import { NextResponse } from 'next/server';
import { findOrderByNumber, isDbConfigured } from '@/lib/db';
import { sendOrderConfirmationEmail } from '@/lib/orderConfirmationEmail';
import { sendAdminOrderNotificationEmail } from '@/lib/adminOrderNotificationEmail';
import { reportAutomationFailure } from '@/lib/automationFailure';
import { getGlowCardSummary, glowCardLoyaltyEnabled } from '@/lib/glowCardLoyalty';

export const dynamic = 'force-dynamic';

// POST /api/admin/orders/[orderNumber]/resend-order-emails
// Manually re-sends the customer confirmation email and admin notification
// for a paid order. Used when the automated send failed silently (e.g.
// Resend API key issue, domain not yet verified). Does not affect order status.
export async function POST(_request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const order = await findOrderByNumber(params.orderNumber);
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  const PAYMENT_CONFIRMED_STATUSES = [
    'paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered',
  ];
  if (!PAYMENT_CONFIRMED_STATUSES.includes(order.status)) {
    return NextResponse.json({ error: 'Order is not in a paid/confirmed state.' }, { status: 400 });
  }

  const shippingAddress = [
    order.shipping_line1,
    order.shipping_line2,
    order.shipping_city,
    order.shipping_postcode,
    order.shipping_country,
  ].filter(Boolean).join('\n');

  // A resend must give the member the same useful, live Beauty Card position as
  // the original confirmation. It never awards a second point.
  const glowCardSummary = glowCardLoyaltyEnabled() && order.customer_id
    ? await getGlowCardSummary(order.customer_id).catch(() => null)
    : null;

  const [customerSent, adminSent] = await Promise.all([
    sendOrderConfirmationEmail({
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
      shippingAddress,
      glowCard: glowCardLoyaltyEnabled() ? {
        earnedPoint: false,
        reason: 'already_processed',
        points: glowCardSummary?.points ?? null,
        cycle: glowCardSummary?.cycle ?? null,
        nextMilestone: glowCardSummary?.nextMilestone ?? null,
        nextRewardAmount: glowCardSummary?.nextRewardAmount ?? null,
        pointsAway: glowCardSummary?.pointsAway ?? 0,
      } : null,
    }).catch(() => false),

    sendAdminOrderNotificationEmail({
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
      paymentStatus:  'confirmed',
      createdAt:      order.created_at,
      amountMismatchNote: null,
    }).catch(() => false),
  ]);

  /* Recorded against the order, so the next person to open it can see that a resend was tried and
   * did not work. No admin alert: somebody is standing at the screen watching the result. */
  if (!customerSent) {
    await reportAutomationFailure('customer_email', `The order confirmation for ${order.order_number} would not resend to ${order.email}.`, {
      orderNumber: order.order_number,
      subject: order.email,
    });
  }
  if (!adminSent) {
    await reportAutomationFailure('admin_email', `The internal notification for ${order.order_number} would not resend.`, {
      orderNumber: order.order_number,
    });
  }

  if (!customerSent && !adminSent) {
    return NextResponse.json({
      error: 'Both emails failed to send. check RESEND_API_KEY_BEAUTY_IS is set in Vercel and that windsorbeauty.is is a verified sending domain in Resend.',
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    customerEmail: customerSent,
    adminEmail: adminSent,
    message: customerSent && adminSent
      ? 'Both emails sent successfully.'
      : customerSent
        ? 'Customer email sent. Admin notification failed - check Resend.'
        : 'Admin notification sent. Customer email failed - check Resend.',
  });
}
