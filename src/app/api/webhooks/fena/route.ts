/**
 * POST /api/webhooks/fena
 *
 * Receives payment status updates from Fena Pay by Bank.
 *
 * Enter this URL in your Fena dashboard:
 *   Webhook / Payment Notification URL:  https://www.windsorbeauty.co.uk/api/webhooks/fena
 *   (append ?key=<FENA_WEBHOOK_SECRET> once that env var is set — see below)
 *
 * Ground truth captured from production on 2026-06-29 (order WB-FZMGBJ) via
 * Vercel logs — Fena sends a plain JSON POST (Content-Type: application/json),
 * NOT a JWT. The previously-documented JWT/token format never applied to this
 * product. Two deliveries are sent per payment (status "sent" then "paid");
 * we only act on "paid". Real shape:
 *   {
 *     "eventScope": "single-payments", "eventName": "status-update",
 *     "status": "paid", "amount": "0.50", "reference": "WB-FZMGBJ",
 *     "externalReference": "WB-FZMGBJ-7ed4e", "customerEmail": "...",
 *     "isSandbox": false, "completedAt": "...", ...
 *   }
 * `reference` matches our order_number exactly (no suffix) — Fena's own
 * suffixed value lives in `externalReference`, which we don't need.
 *
 * SECURITY: this payload carries no signature we can verify (Fena's docs
 * don't define one for this event). FENA_WEBHOOK_SECRET is set in
 * production (2026-06-29) — the webhook URL in the Fena dashboard must
 * include ?key=<that value> or every request is rejected with 401. In
 * production this is fail-closed (missing env var = reject everything,
 * not "skip the check") so an accidentally-unset secret can never silently
 * reopen this endpoint to unauthenticated "mark this order paid" requests.
 * Outside production (no NODE_ENV=production, e.g. local dev) the check
 * stays conditional so the file still works without the env var set.
 */

import { NextResponse } from 'next/server';
import {
  findOrderByNumber,
  findCustomerById,
  isDbConfigured,
  logAutomationFailure,
  markOrderPaidByAdmin,
  setOrderPaymentAmountMismatch,
  setOrderStatusFromPayment,
  updateOrderNotes,
} from '@/lib/db';
import { paidAfterCancelNotice } from '@/lib/invoicePayability';
import { sendAutomationAlertEmail } from '@/lib/automationAlertEmail';
import { sendOrderConfirmationEmail } from '@/lib/orderConfirmationEmail';
import { sendAdminOrderNotificationEmail } from '@/lib/adminOrderNotificationEmail';
import { dispatchOrderToRoyalMail } from '@/lib/royalMailDispatch';
import { onInvoiceOrderPaid } from '@/lib/invoiceFulfillment';
import { awardGlowCardOrderPoint, markGlowCardVoucherUsedForPaidOrder } from '@/lib/glowCardLoyalty';
import { sendGlowCardMilestoneEmail } from '@/lib/glowCardMilestoneEmail';

export const dynamic = 'force-dynamic';

/**
 * What to keep from a payment update we already understand.
 *
 * The whole payload used to be stored and then printed straight onto the admin
 * System Health page, which meant our own bank sort code and account number
 * were rendered in full every time a customer's payment was declined. None of
 * it helps anyone reading that page. The fields kept here are the ones that
 * answer "who, how much, when, and which attempt".
 *
 * The unrecognised-status branch still keeps everything on purpose: capturing
 * the full payload is exactly how the original JWT-vs-JSON bug was solved.
 */
function paymentDetailForLog(payload: Record<string, unknown>): Record<string, unknown> {
  const keep = ['reference', 'status', 'amount', 'currency', 'customerName', 'customerEmail', 'paymentMethod', 'createdAt', 'transaction', 'id', 'isSandbox'];
  const kept: Record<string, unknown> = {};
  for (const key of keep) {
    if (payload[key] !== undefined) kept[key] = payload[key];
  }
  return kept;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.FENA_WEBHOOK_SECRET;
  if (!webhookSecret && process.env.NODE_ENV === 'production') {
    console.error('[webhooks/fena] FENA_WEBHOOK_SECRET not configured - rejecting in production');
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (webhookSecret && new URL(request.url).searchParams.get('key') !== webhookSecret) {
    console.warn('[webhooks/fena] Rejected - missing or incorrect ?key= on webhook URL');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // ── 1. Parse the JSON body ───────────────────────────────────────────────────
  let payload: Record<string, unknown> | null = null;
  let text = '';
  try {
    text = await request.text();
    payload = JSON.parse(text);
  } catch {
    console.warn(`[webhooks/fena] Could not parse body as JSON: ${text.slice(0, 1000)}`);
    await logAutomationFailure('fena_webhook', 'Could not parse webhook body as JSON', { detail: text.slice(0, 1000) });
    return new NextResponse('OK', { status: 200 });
  }

  if (!payload) {
    return new NextResponse('OK', { status: 200 });
  }

  // Fena sends one event per status change. Only "paid" completes an order.
  //
  // Production ground truth (all isSandbox:false): "sent", "paid", "pending"
  // and "rejected" have now all been observed live. "pending" and "rejected"
  // were previously both filed as UNHANDLED-status failures, which put two
  // ordinary payment outcomes into the System Health failure list as if the
  // integration had broken.
  //
  // What this deliberately does NOT do: move the order into 'payment_failed'.
  // That status sits in the terminal-state guard used by both the paid path
  // below and setOrderStatusFromPayment, so recording a rejection that way
  // would cause a customer who simply retries the same payment link — the
  // reference is unchanged — to pay successfully while the webhook ignored it.
  // Money in, order never marked paid. Leaving the order at awaiting_payment
  // keeps the retry path working; the outcome is recorded in the log instead.
  const status = (payload.status as string | undefined)?.toLowerCase();
  const orderRef = (payload.reference as string | undefined) ?? null;

  // Still moving through the banking rails. Normal, and not worth recording.
  const IN_FLIGHT = new Set(['sent', 'pending', 'processing', 'submitted']);
  // Ended without the money arriving. Worth recording, but see the note above:
  // the order is left payable so the customer can try again.
  const DID_NOT_COMPLETE = new Set(['rejected', 'failed', 'declined', 'expired', 'cancelled', 'canceled']);

  if (status !== 'paid') {
    if (status && DID_NOT_COMPLETE.has(status)) {
      // Written for whoever reads System Health, who is not technical. The old
      // wording said the order "is still awaiting payment and the customer can
      // retry", which sent the reader looking for something they could not
      // find: no order in this shop sits at "awaiting payment", and an
      // abandoned one is often deleted before anyone looks.
      //
      // This is also filed as a customer event rather than a fault, so it is
      // recorded and shown but never lights the red banner. See
      // src/lib/automationFailureKinds.ts.
      const who = typeof payload.customerName === 'string' && payload.customerName.trim()
        ? payload.customerName.trim()
        : 'A customer';
      const amount = typeof payload.amount === 'string' || typeof payload.amount === 'number'
        ? `£${payload.amount}`
        : 'their order';
      await logAutomationFailure(
        'fena_payment_not_completed',
        `${who} tried to pay ${amount} and their bank did not complete it. Nothing is broken and there is nothing to fix: they can pay again with the same link.`,
        { orderNumber: orderRef, detail: paymentDetailForLog(payload) }
      );
    } else if (status && !IN_FLIGHT.has(status)) {
      // A status we have genuinely never seen. Captured in full, because that
      // is exactly how the original JWT-vs-JSON payload bug was solved.
      await logAutomationFailure(
        'fena_webhook_unhandled_status',
        `Received unhandled Fena status "${status}" - order left unchanged`,
        { orderNumber: orderRef, detail: payload }
      );
    }
    return new NextResponse('OK', { status: 200 });
  }

  // ── 2. Order reference (read above, alongside the status) ────────────────────
  if (!orderRef) {
    console.warn('[webhooks/fena] No reference in payload:', JSON.stringify(payload));
    await logAutomationFailure('fena_webhook', 'No reference in paid webhook payload', { detail: payload });
    return new NextResponse('OK', { status: 200 });
  }

  // ── 3. Find and update the order ─────────────────────────────────────────────
  if (!isDbConfigured()) {
    console.error('[webhooks/fena] Database not configured');
    return new NextResponse('Database unavailable', { status: 500 });
  }

  const order = await findOrderByNumber(orderRef);
  if (!order) {
    console.warn(`[webhooks/fena] Order not found: ${orderRef}`);
    return new NextResponse('OK', { status: 200 });
  }

  // Idempotency guard
  const alreadyTerminal = [
    'paid', 'awaiting_dispatch', 'exported', 'dispatched', 'delivered',
    'payment_failed', 'payment_cancelled', 'cancelled',
  ].includes(order.status);

  if (alreadyTerminal) {
    // Money for an order that no longer stands (task 477f3453). On 27-29 Aug
    // 2026 an order was cancelled from the Orders page while its invoice's pay
    // page still offered the link; the customer paid £240; and this branch
    // swallowed the "paid" message: no log, no email, nothing on the order.
    // The bank had the money and the dashboard had no idea. It is now written
    // down in the three places somebody will look. The order is deliberately
    // NOT reopened: reinstating it or refunding is a decision for a person.
    if (order.status === 'cancelled' || order.status === 'refunded') {
      const reported = payload.amount === undefined || payload.amount === null ? NaN : Number(payload.amount);
      const notice = paidAfterCancelNotice(order, Number.isFinite(reported) ? reported : null);
      await logAutomationFailure(notice.category, notice.message, {
        orderNumber: order.order_number,
        detail: paymentDetailForLog(payload),
      });
      const existingNotes = order.admin_notes?.trim();
      await updateOrderNotes(order.order_number, existingNotes ? `${notice.note}

${existingNotes}` : notice.note)
        .catch(err => logAutomationFailure('admin_note', 'Could not add the paid-after-cancel note to the order', { orderNumber: order.order_number, detail: err }));
      await sendAutomationAlertEmail({
        category: notice.category,
        message: notice.message,
        subject: `${order.customer_name.trim()} (${order.email}), order ${order.order_number}`,
        whatToDo: 'Open the order. Either reinstate it (set it back to Awaiting Payment, then Mark as Paid) or refund the customer.',
      }).catch(() => false);
    }
    return new NextResponse('Already processed', { status: 200 });
  }

  // Fena only calls the webhook for successful payments.
  // Atomic update — returns null if the redirect confirm route already won the
  // race and marked the order paid. If null, skip everything including the email.
  const updated = await setOrderStatusFromPayment(order.order_number, 'paid');
  if (!updated) {
    return new NextResponse('Already processed', { status: 200 });
  }

  // Compute the amount-mismatch check BEFORE deciding whether to proceed
  // with automated fulfilment. A meaningful UNDERpayment (Fena reports less
  // than this order's current total) must never auto-complete Royal Mail
  // dispatch, stock decrement, or invoice-paid marking — that's exactly the
  // failure mode behind the 2026-06-29 incident (a stale pre-edit Fena link
  // still payable for less than the now-current total). An overpayment is
  // not a fulfilment risk and is left to proceed normally.
  const reportedAmountRaw = payload.amount ?? null;
  const reportedAmount = reportedAmountRaw !== null && reportedAmountRaw !== undefined ? Number(reportedAmountRaw) : null;
  const expectedTotal = Number(order.total);
  let amountMismatchNote: string | null = null;
  let isUnderpayment = false;
  if (reportedAmount !== null && Number.isFinite(reportedAmount)) {
    if (Math.abs(reportedAmount - expectedTotal) > 0.01) {
      amountMismatchNote = `Fena reported £${reportedAmount.toFixed(2)} paid, but this order's total is £${expectedTotal.toFixed(2)}.`;
      isUnderpayment = reportedAmount < expectedTotal - 0.01;
      console.error(`[webhooks/fena] AMOUNT MISMATCH on ${order.order_number}: ${amountMismatchNote}`);
      await setOrderPaymentAmountMismatch(order.order_number, amountMismatchNote).catch(err =>
        logAutomationFailure('fena_webhook', 'Could not persist amount-mismatch note', { orderNumber: order.order_number, detail: err })
      );
    }
  }

  const shippingAddress = [
    order.shipping_line1,
    order.shipping_line2,
    order.shipping_city,
    order.shipping_postcode,
    order.shipping_country,
  ].filter(Boolean).join('\n');

  if (isUnderpayment) {
    // Money was received (order stays at 'paid', not reverted) but every
    // automated next step is withheld until an admin reviews the shortfall:
    // no Royal Mail label, no stock decrement, no invoice-paid marking, no
    // "your order is on its way" customer email implying normal processing.
    // The AMOUNT MISMATCH admin email still fires so this is caught
    // immediately rather than discovered later on a bank statement.
    const underpaymentAdminSent = await sendAdminOrderNotificationEmail({
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
      amountMismatchNote,
    }).catch(err => {
      console.error('[webhooks/fena] Admin notification email threw (underpayment):', err);
      return false as const;
    });
    if (!underpaymentAdminSent) {
      await logAutomationFailure('admin_email', 'Admin sales@ notification email failed to send (underpayment alert)', {
        orderNumber: order.order_number,
        detail: 'sendAdminOrderNotificationEmail returned false - check RESEND_API_KEY and windsorbeauty.co.uk domain verification in Resend',
      });
    }
    return new NextResponse('OK', { status: 200 });
  }

  const paidOrder = await markOrderPaidByAdmin(order.order_number);

  // Automatically create the Royal Mail shipment now that payment is
  // confirmed — removes the need to click "Create Label" in the admin
  // dispatch page. Never throws; failures (including "needs postage applied
  // manually in Click & Drop") are recorded against the order and picked up
  // later by the background cron sync, same as a manual retry would. This
  // outer catch only fires on a genuine unexpected throw (the function's own
  // documented failure modes already return rather than throw) — still
  // logged rather than silently dropped.
  await dispatchOrderToRoyalMail(order.order_number).catch(err =>
    logAutomationFailure('royal_mail_dispatch', 'Unexpected throw from dispatchOrderToRoyalMail', { orderNumber: order.order_number, detail: err })
  );

  // No-ops instantly for an ordinary checkout order (no invoice_id) — only
  // does anything for an invoice-linked order: corrects payment_method,
  // decrements stock once, and marks the invoice paid.
  await onInvoiceOrderPaid(order.order_number, 'fena').catch(err =>
    logAutomationFailure('invoice_fulfillment', 'onInvoiceOrderPaid threw', { orderNumber: order.order_number, detail: err })
  );

  const glowCard = paidOrder ? await awardGlowCardOrderPoint(paidOrder).catch(() => null) : null;
  if (paidOrder) await markGlowCardVoucherUsedForPaidOrder(paidOrder.order_number).catch(() => false);

  // Send confirmation email — idempotent because the confirm route already
  // handles the case where the success page fired first. Here we send only if
  // the order has no confirmation yet (webhook may arrive before the page).
  //
  // NOTE: sendOrderConfirmationEmail never throws — it catches internally and
  // returns false. Check the boolean explicitly so a silent false (missing key,
  // unverified domain) gets recorded in automation_failures and shows up in
  // the System Health admin page.
  const confirmationSent = await sendOrderConfirmationEmail({
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
  }).catch(err => {
    console.error('[webhooks/fena] Confirmation email threw:', err);
    return false as const;
  });
  if (!confirmationSent) {
    await logAutomationFailure('customer_email', 'Order confirmation email failed to send', {
      orderNumber: order.order_number,
      detail: 'sendOrderConfirmationEmail returned false - check RESEND_API_KEY and windsorbeauty.co.uk domain verification in Resend',
    });
  }

  for (const unlocked of glowCard?.newlyUnlockedMilestones ?? []) {
    const recipient = unlocked.customerId === order.customer_id
      ? { email: order.email, name: order.customer_name }
      : await findCustomerById(unlocked.customerId).then(customer => customer ? {
          email: customer.email,
          name: [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email,
        } : null);
    if (!recipient) continue;
    const milestoneSent = await sendGlowCardMilestoneEmail({
      to: recipient.email,
      customerName: recipient.name,
      milestone: unlocked.milestone,
      amount: unlocked.milestone === 5 ? 10 : unlocked.milestone === 10 ? 20 : 30,
    }).catch(() => false);
    if (!milestoneSent) {
      await logAutomationFailure('customer_email', `Beauty Card £${unlocked.milestone === 5 ? 10 : unlocked.milestone === 10 ? 20 : 30} reward email was not sent`, {
        orderNumber: order.order_number,
        detail: 'The reward remains safely available in the member account. Check the email service and resend the order email if needed.',
      });
    }
  }

  const adminNotifSent = await sendAdminOrderNotificationEmail({
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
    amountMismatchNote,
  }).catch(err => {
    console.error('[webhooks/fena] Admin notification email threw:', err);
    return false as const;
  });
  if (!adminNotifSent) {
    await logAutomationFailure('admin_email', 'Admin sales@ notification email failed to send', {
      orderNumber: order.order_number,
      detail: 'sendAdminOrderNotificationEmail returned false - check RESEND_API_KEY and windsorbeauty.co.uk domain verification in Resend',
    });
  }

  return new NextResponse('OK', { status: 200 });
}
