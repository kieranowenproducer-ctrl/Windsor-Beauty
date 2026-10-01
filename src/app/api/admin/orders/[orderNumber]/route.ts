import { NextResponse } from 'next/server';
import {
  deleteOrder,
  findInvoiceByOrderNumber,
  findOrderByNumber,
  isDbConfigured,
  markShippingEmailSent,
  PAYMENT_CONFIRMED_STATUSES,
  updateOrderNotes,
  updateOrderStatus,
  updateOrderTracking,
  cancelInvoice,
  type OrderRow,
} from '@/lib/db';
import { sendShippingConfirmationEmail } from '@/lib/shippingEmail';
import { dispatchOrderToRoyalMail } from '@/lib/royalMailDispatch';
import { referralsEnabled, releaseReferralVoucherForUnpaidOrder, syncMemberReferrals } from '@/lib/memberReferrals';
import { markGlowCardVoucherUsedForPaidOrder, releaseGlowCardVoucherForUnpaidOrder, reverseGlowCardOrderPoints } from '@/lib/glowCardLoyalty';

// MUST stay in step with ORDER_STATUSES in src/app/admin/orders/orderTypes.ts,
// which is what the admin dropdown offers. It did not, and that was the whole
// of task d0d5effb: 'payment_failed' and 'payment_cancelled' were on the
// dropdown and missing from here, so choosing either fell through the check
// below, saved nothing, and still answered 200. The screen said Cancelled, the
// order stayed Awaiting Payment, and it came back as Awaiting Payment on the
// next look. Nought of the shop's 70 orders had ever reached either status.
const VALID_STATUSES: OrderRow['status'][] = [
  'pending', 'awaiting_payment', 'paid', 'awaiting_dispatch', 'processing',
  'exported', 'dispatched', 'delivered', 'payment_failed', 'payment_cancelled',
  'refunded', 'cancelled',
];

// Derives a human-readable carrier name from the shipping label stored on the
// order so the customer's dispatch email says "Royal Mail Tracked 24" rather
// than a bare service code. Every UK parcel ships as Tracked 24 (Kieran,
// 2026-07-17), whatever the customer chose; only international differs.
function carrierLabel(shippingLabel: string): string {
  if (shippingLabel.toLowerCase().includes('international')) return 'Royal Mail International Tracked';
  return 'Royal Mail Tracked 24';
}

export async function DELETE(_request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  // An order that came from an invoice cannot be deleted on its own.
  //
  // Deleting an INVOICE deliberately cascades to its order (see deleteInvoice
  // in src/lib/db.ts). The other direction never did anything, so deleting the
  // order left the invoice pointing at an order number that no longer existed.
  // The audit on 2026-08-15 found five of those in the live database.
  //
  // Refusing rather than tidying up afterwards is the deliberate choice: an
  // invoice is a financial record, and quietly unpicking or deleting one
  // because somebody pressed Delete on an order is a worse outcome than being
  // told to go and do it from the invoice instead. The message says exactly
  // that, because "could not delete" with no reason is what sends someone
  // pressing the button again.
  const linkedInvoice = await findInvoiceByOrderNumber(params.orderNumber).catch(() => null);
  if (linkedInvoice) {
    return NextResponse.json(
      {
        error: `This order came from invoice ${linkedInvoice.invoice_number}, so it cannot be deleted on its own. Delete that invoice instead and the order goes with it.`,
        invoiceNumber: linkedInvoice.invoice_number,
        invoiceId: linkedInvoice.id,
      },
      { status: 409 }
    );
  }

  const deleted = await deleteOrder(params.orderNumber);
  if (!deleted) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const orderNumber = params.orderNumber;

  let updated: OrderRow | null = null;
  let emailSent = false;

  // Say no out loud. A status this route does not recognise used to slip past
  // the check below and come back as a success, which is how a cancelled order
  // reappeared as awaiting payment with nothing on screen to explain it
  // (task d0d5effb). If the two lists ever drift apart again, the person
  // pressing the button finds out immediately.
  if (typeof body?.status === 'string' && !VALID_STATUSES.includes(body.status as OrderRow['status'])) {
    return NextResponse.json(
      { error: `"${body.status}" is not a status this order can be set to, so nothing was saved.` },
      { status: 400 }
    );
  }

  if (typeof body?.status === 'string' && VALID_STATUSES.includes(body.status as OrderRow['status'])) {
    updated = await updateOrderStatus(orderNumber, body.status as OrderRow['status']);

    // Cancelling or refunding an order closes its invoice too (task 477f3453).
    // Until now only the order changed: the invoice stayed open, its pay page
    // kept offering the payment link, and a customer paid £240 for an order
    // that had already been cancelled. A paid invoice is left alone, because a
    // refund is a financial record of its own.
    if (updated && (updated.status === 'cancelled' || updated.status === 'refunded')) {
      const invoice = await findInvoiceByOrderNumber(orderNumber).catch(() => null);
      if (invoice && invoice.status !== 'paid' && invoice.status !== 'cancelled') {
        await cancelInvoice(invoice.id).catch(() => null);
      }
      // The order may already have earned a member point (and, for a first
      // referred order, both referral bonus points). Reverse those awards
      // here, with idempotent ledger records, rather than leaving a refund
      // looking like a qualifying purchase.
      await reverseGlowCardOrderPoints(updated).catch(() => {});
    }

    // Admins can move an order straight to a payment-confirmed status from
    // here too (not just "Mark as Paid"/the Fena routes) — e.g. setting it
    // directly via a status dropdown. Trigger the same automatic Royal Mail
    // dispatch in that case so this path doesn't silently skip it.
    // dispatchOrderToRoyalMail no-ops safely if a label already exists.
    if (updated && PAYMENT_CONFIRMED_STATUSES.includes(updated.status)) {
      await dispatchOrderToRoyalMail(orderNumber).catch(() => {});
      await markGlowCardVoucherUsedForPaidOrder(updated.order_number).catch(() => false);
    }
  }

  if (typeof body?.trackingNumber === 'string') {
    const trackingNumber = body.trackingNumber.trim();
    updated = await updateOrderTracking(orderNumber, trackingNumber);

    // Manual fallback path: admin pastes in a tracking number obtained
    // outside the Royal Mail API integration (e.g. uploaded the fallback CSV
    // to Click & Drop directly). Only send the tracking email if payment has
    // been confirmed — never for a still-pending PayPal order — and only
    // once per order.
    if (updated && trackingNumber && !updated.shipping_email_sent_at && PAYMENT_CONFIRMED_STATUSES.includes(updated.status)) {
      // Auto-dispatch the order and send the customer their tracking email.
      const preDispatch = ['paid', 'awaiting_dispatch', 'exported', 'processing'].includes(updated.status);
      if (preDispatch) {
        await updateOrderStatus(orderNumber, 'dispatched');
        updated = { ...updated, status: 'dispatched' };
      }

      emailSent = await sendShippingConfirmationEmail({
        to:             updated.email,
        customerName:   updated.customer_name,
        orderNumber:    updated.order_number,
        trackingNumber,
        carrierName:    carrierLabel(updated.shipping_label),
      }).catch(() => false);

      if (emailSent) {
        await markShippingEmailSent(orderNumber).catch(() => {});
      }
    }
  }

  if (typeof body?.notes === 'string') {
    await updateOrderNotes(orderNumber, body.notes);
    if (!updated) updated = await findOrderByNumber(orderNumber);
  }

  if (!updated) {
    return NextResponse.json({ error: 'Order not found or no valid changes supplied.' }, { status: 404 });
  }

  if (referralsEnabled() && updated.customer_id && ['dispatched', 'delivered', 'refunded', 'cancelled'].includes(updated.status)) {
    await syncMemberReferrals(Number(updated.customer_id)).catch(() => {});
  }
  if (referralsEnabled() && ['payment_cancelled', 'cancelled'].includes(updated.status)) {
    await releaseReferralVoucherForUnpaidOrder(updated.order_number).catch(() => false);
  }
  if (['payment_failed', 'payment_cancelled', 'cancelled'].includes(updated.status)) {
    await releaseGlowCardVoucherForUnpaidOrder(updated.order_number).catch(() => false);
  }

  return NextResponse.json({
    success: true,
    emailSent,
    order: {
      orderNumber: updated.order_number,
      status: updated.status,
      trackingNumber: updated.tracking_number,
    },
  });
}
