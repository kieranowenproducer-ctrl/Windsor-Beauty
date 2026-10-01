import {
  addAdminNote,
  findCustomerById,
  findOrderByNumber,
  logAutomationFailure,
  markOrderPaidByAdmin,
  type OrderRow,
} from '@/lib/db';
import { sendOrderConfirmationEmail } from '@/lib/orderConfirmationEmail';
import { sendAdminOrderNotificationEmail } from '@/lib/adminOrderNotificationEmail';
import { dispatchOrderToRoyalMail } from '@/lib/royalMailDispatch';
import { onInvoiceOrderPaid } from '@/lib/invoiceFulfillment';
import { awardGlowCardOrderPoint, markGlowCardVoucherUsedForPaidOrder } from '@/lib/glowCardLoyalty';
import { sendGlowCardMilestoneEmail } from '@/lib/glowCardMilestoneEmail';

// Shared by /api/admin/orders/[orderNumber]/mark-paid (the website's general
// PayPal/manual-payment fallback) and /api/admin/invoices/[id]/mark-paypal-paid
// (the invoice system's PayPal fallback, which has no real API/webhook either)
// — extracted so both routes trigger the exact same downstream sequence
// (status transition, Royal Mail dispatch, invoice hook, confirmation emails)
// without copy-pasting it.
export type MarkOrderPaidManuallyResult =
  | { ok: true; order: OrderRow; emailSent: boolean }
  | { ok: false; error: string; status: number };

export async function markOrderPaidManually(
  orderNumber: string,
  note: string | null,
  // Defaults to 'paypal' for backward compatibility with the original
  // PayPal-only fallback — onInvoiceOrderPaid no-ops for any order without
  // invoice_id set, so this default is harmless for every ordinary order.
  // New callers (the cash/bank-transfer invoice flow) pass the real method.
  paidVia: 'fena' | 'paypal' | 'cash' | 'bank_transfer' | 'manual' = 'paypal'
): Promise<MarkOrderPaidManuallyResult> {
  const existing = await findOrderByNumber(orderNumber);
  if (!existing) {
    return { ok: false, error: 'Order not found', status: 404 };
  }

  const safeToPay = ['pending', 'awaiting_payment'].includes(existing.status);
  if (!safeToPay) {
    return { ok: false, error: `Cannot mark order as paid from status '${existing.status}'`, status: 409 };
  }

  const updated = await markOrderPaidByAdmin(orderNumber);
  if (!updated) {
    return { ok: false, error: 'Could not update order', status: 500 };
  }

  const noteText = note?.trim() ? `Marked paid by admin: ${note.trim()}` : 'Marked paid manually by admin';
  await addAdminNote(orderNumber, noteText).catch(err =>
    logAutomationFailure('admin_note', 'Could not record "marked paid" admin note', { orderNumber, detail: err })
  );

  await dispatchOrderToRoyalMail(orderNumber).catch(err =>
    logAutomationFailure('royal_mail_dispatch', 'Unexpected throw from dispatchOrderToRoyalMail', { orderNumber, detail: err })
  );

  // No-ops instantly for an ordinary checkout order (no invoice_id) — only
  // does anything for an invoice-linked order: corrects payment_method,
  // decrements stock once, applies the PayPal fee, and marks the invoice
  // paid. Returns the freshest order row when it did anything — `updated`
  // above was fetched before this ran, so it's stale for an invoice order
  // that just had a PayPal fee added to its total.
  const invoiceOrder = await onInvoiceOrderPaid(orderNumber, paidVia).catch(err => {
    logAutomationFailure('invoice_fulfillment', 'onInvoiceOrderPaid threw', { orderNumber, detail: err });
    return null;
  });
  const order = invoiceOrder ?? updated;
  await markGlowCardVoucherUsedForPaidOrder(order.order_number).catch(() => false);
  const glowCard = await awardGlowCardOrderPoint(order).catch(() => null);

  const shippingAddress = [
    order.shipping_line1,
    order.shipping_line2,
    order.shipping_city,
    order.shipping_postcode,
    order.shipping_country,
  ].filter(Boolean).join('\n') || order.shipping_address;

  // Admin-created cash/manual orders can opt out of the customer-facing
  // confirmation email (automation_flags.sendConfirmation) — every ordinary
  // order defaults to true, so this never changes existing behaviour.
  const emailSent = order.automation_flags?.sendConfirmation === false
    ? false
    : await sendOrderConfirmationEmail({
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
        glowCard: glowCard?.enabled ? {
          earnedPoint: glowCard.earnedPoint,
          reason: glowCard.reason === 'disabled' ? 'not_eligible' : glowCard.reason,
          points: glowCard.card?.points ?? null,
          cycle: glowCard.card?.cycle ?? null,
          nextMilestone: glowCard.card?.nextMilestone ?? null,
          nextRewardAmount: glowCard.card?.nextRewardAmount ?? null,
          pointsAway: glowCard.card?.pointsAway ?? 0,
        } : null,
      }).catch((err) => {
        console.error('[markOrderPaidManually] Confirmation email failed:', err);
        return false;
      });
  if (order.automation_flags?.sendConfirmation !== false && !emailSent) {
    await logAutomationFailure('customer_email', 'Order confirmation email was not sent', {
      orderNumber: order.order_number,
      detail: 'The paid order and Beauty Card point are safe. Use Resend order emails from the order screen after checking the email service.',
    });
  }

  for (const unlocked of glowCard?.newlyUnlockedMilestones ?? []) {
    // The paid order identifies the buyer. A referral can also unlock a reward
    // for the referrer, so look that member up before celebrating it.
    const recipient = unlocked.customerId === order.customer_id
      ? { email: order.email, name: order.customer_name }
      : await findCustomerById(unlocked.customerId).then(customer => customer ? {
          email: customer.email,
          name: [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email,
        } : null);
    if (!recipient) continue;
    const milestoneSent = await sendGlowCardMilestoneEmail({
      to: recipient.email, customerName: recipient.name,
      milestone: unlocked.milestone, amount: unlocked.milestone === 5 ? 10 : unlocked.milestone === 10 ? 20 : 30,
    }).catch(() => false);
    if (!milestoneSent) {
      await logAutomationFailure('customer_email', `Beauty Card £${unlocked.milestone === 5 ? 10 : unlocked.milestone === 10 ? 20 : 30} reward email was not sent`, {
        orderNumber: order.order_number,
        detail: 'The reward remains safely available in the member account. Check the email service and resend the order email if needed.',
      });
    }
  }

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
    paymentStatus:  'paid_manually',
    createdAt:      order.created_at,
  }).catch((err) => {
    console.error('[markOrderPaidManually] Admin notification email failed:', err);
    return logAutomationFailure('admin_email', 'Admin sales@ notification email failed to send', { orderNumber: order.order_number, detail: err });
  });

  return { ok: true, order, emailSent };
}
