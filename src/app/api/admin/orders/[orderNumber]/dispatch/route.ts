import { NextResponse } from 'next/server';
import {
  findOrderByNumber,
  isDbConfigured,
  markOrderDispatched,
  markShippingEmailSent,
  addAdminNote,
} from '@/lib/db';
import { sendShippingConfirmationEmail } from '@/lib/shippingEmail';
import { referralsEnabled, syncMemberReferrals } from '@/lib/memberReferrals';

/**
 * POST /api/admin/orders/[orderNumber]/dispatch
 *
 * Marks an order as dispatched, records the tracking number, and optionally
 * sends the customer a shipping confirmation email.
 *
 * Body: {
 *   trackingNumber: string        — required, carrier tracking number
 *   weightGrams?: number          — optional, parcel weight for records
 *   sendEmail?: boolean           — default true — send customer notification
 *   note?: string                 — optional admin note to append
 * }
 *
 * Transitions: paid | awaiting_dispatch | exported → dispatched
 */
export async function POST(request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const order = await findOrderByNumber(params.orderNumber);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  // Falls back to the order's existing tracking number — e.g. one already
  // saved by the Royal Mail label-creation route — so the admin can mark an
  // order dispatched and send tracking without re-entering it.
  const trackingNumber = (typeof body?.trackingNumber === 'string' ? body.trackingNumber.trim() : '') || order.tracking_number || '';
  const weightGrams    = typeof body?.weightGrams === 'number' ? body.weightGrams : null;
  const sendEmail      = body?.sendEmail !== false; // default: true
  const noteText       = typeof body?.note === 'string' ? body.note.trim() : null;

  if (!trackingNumber) {
    return NextResponse.json({ error: 'Tracking number is required' }, { status: 400 });
  }

  const dispatchableStatuses = ['paid', 'awaiting_dispatch', 'exported', 'processing'];
  if (!dispatchableStatuses.includes(order.status)) {
    return NextResponse.json(
      { error: `Cannot dispatch order with status '${order.status}'` },
      { status: 409 }
    );
  }

  const updated = await markOrderDispatched(params.orderNumber, trackingNumber, weightGrams);
  if (!updated) {
    return NextResponse.json({ error: 'Could not update order' }, { status: 500 });
  }
  if (referralsEnabled() && updated.customer_id) {
    await syncMemberReferrals(Number(updated.customer_id)).catch(() => {});
  }

  // Send shipping confirmation email unless suppressed or already sent. Record a
  // specific outcome so the internal note is never misleading: "email not sent"
  // used to be logged both when the customer was ALREADY notified earlier (fine)
  // and when a send genuinely failed (not fine), which read alarmingly the same.
  let emailSent = false;
  let emailOutcome: string;
  if (!sendEmail) {
    emailOutcome = 'email skipped (not requested this time)';
  } else if (order.shipping_email_sent_at) {
    emailOutcome = 'customer already notified earlier (no duplicate sent)';
  } else {
    try {
      // BELIEVE THE ANSWER. sendShippingConfirmationEmail RETURNS false when the
      // send fails; it does not throw, so the catch below never fires for a
      // refused or errored send. This route used to ignore the return value,
      // stamp shipping_email_sent_at anyway and log "customer notified" — so a
      // customer who was never told appeared, permanently, to have been told,
      // and "Resend Dispatch Email" then refused because it could see they had
      // "already been notified". A customer reported exactly that on
      // 5 Sep 2026 (task 8a498491). The other four callers of this function all
      // check the boolean; this one was the odd one out.
      const sent = await sendShippingConfirmationEmail({
        to: order.email,
        customerName: order.customer_name,
        orderNumber: order.order_number,
        trackingNumber,
        carrierName: order.shipping_label.includes('International') ? 'Royal Mail International' : 'Royal Mail',
      });
      if (sent) {
        await markShippingEmailSent(order.order_number);
        emailSent = true;
        emailOutcome = 'customer notified';
      } else {
        // Deliberately NOT marked as sent, so it can be retried.
        emailOutcome = 'email FAILED to send — use "Resend Dispatch Email"';
      }
    } catch (err) {
      console.error(`[dispatch] Failed to send shipping email for ${params.orderNumber}:`, err);
      // Don't fail the dispatch if email fails — it can be retried.
      emailOutcome = 'email FAILED to send — use "Resend Dispatch Email"';
    }
  }

  if (noteText) {
    await addAdminNote(params.orderNumber, noteText).catch(() => {});
  }

  await addAdminNote(
    params.orderNumber,
    `Dispatched with tracking ${trackingNumber}${weightGrams ? ` (${weightGrams}g)` : ''} — ${emailOutcome}`
  ).catch(() => {});

  return NextResponse.json({ success: true, order: updated, emailSent });
}
