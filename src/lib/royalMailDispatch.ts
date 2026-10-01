// Single shared implementation of "create/retry a Royal Mail Click & Drop
// shipment for an order" — used by three different triggers:
//   1. The manual "Create Label"/"Retry Label" button (api/admin/orders/[orderNumber]/ship)
//   2. Automatically, the moment an order's payment is confirmed (Fena webhook,
//      Fena confirm route, admin "Mark as Paid")
//   3. The background cron sync (api/cron/royal-mail-sync), which retries any
//      order that isn't fully dispatched yet — this is what picks up the
//      tracking number once postage has been manually applied/paid for in
//      Click & Drop, with no admin click required.
//
// createShipmentOrder() (src/lib/royalMail.ts) already de-duplicates by
// order reference, so calling this function again for an order that's
// already sitting in Click & Drop (created but no tracking number yet) is
// always safe — it will never create a second Royal Mail order, it just
// checks whether a tracking number now exists.
import {
  findOrderByNumber,
  getShippingSettings,
  logAutomationFailure,
  markShippingEmailSent,
  PAYMENT_CONFIRMED_STATUSES,
  recordRoyalMailLabel,
  recordRoyalMailLabelError,
  recordRoyalMailPendingPostage,
  type OrderRow,
} from '@/lib/db';
import { createShipmentOrder, isRoyalMailConfigured, RoyalMailApiError, RoyalMailPendingPostageError, SERVICE_CODES } from '@/lib/royalMail';
import { buildShipmentContents, calculateParcel, getProductsBySlug, resolveShipmentService } from '@/lib/shipping';
import { sendShippingConfirmationEmail } from '@/lib/shippingEmail';
import type { PackageFormat } from '@/data/products';

export interface RoyalMailDispatchResult {
  ok: boolean;
  /** True when nothing needed to happen — label already created, or order not yet eligible to try. Not an error. */
  skipped?: boolean;
  /** True when Royal Mail accepted/created the order but is withholding the tracking number until postage is paid manually in Click & Drop — a normal, expected state, not a failure. */
  pending?: boolean;
  /** HTTP-style status for callers that need to translate this into a response (e.g. the manual ship route). */
  status: number;
  error?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  royalMailOrderId?: string;
  weightGrams?: number;
  packageFormat?: string;
}

// Builds a Royal Mail-friendly recipient address from an order row —
// preferring the structured fields captured at checkout, and falling back
// to splitting the older flattened `shipping_address` string for orders
// placed before this integration existed.
function recipientFromOrder(order: OrderRow) {
  // The parcel goes to whoever the order says it goes to. That is usually the person who paid,
  // but an order can be sent to somebody else — a gift, or ordering for a friend — and then
  // shipping_recipient is their name (task 77b818aa). Before this field existed the only way to
  // do that was to type the name into the first line of the address, which is a Royal Mail
  // address line and came back later as that customer’s billing address.
  const fullName = order.shipping_recipient?.trim() || order.customer_name;
  if (order.shipping_line1 && order.shipping_city && order.shipping_postcode) {
    return {
      fullName,
      line1: order.shipping_line1,
      line2: order.shipping_line2,
      city: order.shipping_city,
      postcode: order.shipping_postcode,
      countryCode: (order.shipping_country || 'GB').toUpperCase(),
      phone: order.phone,
      email: order.email,
    };
  }

  const parts = order.shipping_address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const countryCode = parts.length >= 4 && /^[A-Z]{2}$/i.test(parts[parts.length - 1]) ? parts.pop()! : 'GB';
  const postcode = parts.pop() || '';
  const city = parts.pop() || '';
  const [line1, line2] = parts;
  if (!line1 || !city || !postcode) return null;

  return {
    fullName,
    line1,
    line2: line2 || null,
    city,
    postcode,
    countryCode: countryCode.toUpperCase(),
    phone: order.phone,
    email: order.email,
  };
}

// Creates (or, for an order already sitting in Click & Drop without a
// tracking number, re-checks) a Royal Mail shipment for a paid order, and
// stores the result. Never throws — every failure mode is captured and
// recorded against the order so the dispatch admin page always shows the
// real reason, regardless of which trigger called this.
export async function dispatchOrderToRoyalMail(orderNumber: string): Promise<RoyalMailDispatchResult> {
  if (!isRoyalMailConfigured()) {
    return { ok: false, skipped: true, status: 503, error: 'Royal Mail is not connected yet.' };
  }

  const order = await findOrderByNumber(orderNumber);
  if (!order) {
    return { ok: false, status: 404, error: 'Order not found.' };
  }

  if (!PAYMENT_CONFIRMED_STATUSES.includes(order.status)) {
    return {
      ok: false, skipped: true, status: 409,
      error: `This order's payment has not been confirmed yet (status: ${order.status}).`,
    };
  }

  // Already fully dispatched — nothing to do. Not an error.
  if (order.royal_mail_label_status === 'created') {
    return { ok: true, skipped: true, status: 409, error: 'A label has already been generated for this order.' };
  }

  // Admin-set fulfilment override (in-person/cash/collection sales created
  // via the invoice editor) — this is the single shared dispatch function
  // every trigger calls (Fena webhook/confirm, Mark as Paid, the manual
  // Create Label button, the cron retry), so checking it here protects all
  // of them at once, including a future caller that doesn't yet exist.
  // Every checkout-created order defaults to 'royal_mail' + triggerRoyalMail
  // true, so this never changes behaviour for an ordinary order.
  if (order.fulfilment_type !== 'royal_mail' || order.automation_flags?.triggerRoyalMail === false) {
    return {
      ok: true, skipped: true, status: 409,
      error: `Royal Mail dispatch is disabled for this order (fulfilment type: ${order.fulfilment_type}).`,
    };
  }

  const recipient = recipientFromOrder(order);
  if (!recipient) {
    const message = 'Could not read a valid postal address from this order. Check the delivery address before generating a label.';
    await recordRoyalMailLabelError(order.order_number, message);
    return { ok: false, status: 422, error: message };
  }

  const [productsBySlug, settings] = await Promise.all([getProductsBySlug(), getShippingSettings()]);
  const parcel = calculateParcel(order.items, productsBySlug, settings);

  const isInternational = recipient.countryCode !== 'GB';
  if (isInternational && (!settings.international_enabled || !parcel.internationalEligible)) {
    const reason = !settings.international_enabled
      ? 'International shipping is not enabled in shipping settings yet.'
      : 'One or more items in this order are not eligible for international shipping.';
    const message = `Cannot create a Royal Mail label for this international order. ${reason} Use the manual CSV / fallback dispatch system for this order instead.`;
    // Recorded as an error (not just returned) so the background sync stops
    // re-attempting this order every cycle once it knows why it can't proceed.
    await recordRoyalMailLabelError(order.order_number, message);
    return { ok: false, status: 422, error: message };
  }

  const weightGrams = order.parcel_weight_grams ?? parcel.totalWeightGrams;
  const packageFormat = (order.parcel_package_format as PackageFormat | null) ?? parcel.packageFormat;
  const serviceTier = resolveShipmentService(order.items, order.shipping_label, productsBySlug, isInternational);
  const service = SERVICE_CODES[serviceTier];

  let shipment;
  try {
    shipment = await createShipmentOrder({
      orderReference: order.order_number,
      orderDate: new Date(order.created_at).toISOString(),
      recipient,
      weightInGrams: weightGrams,
      packageFormat,
      serviceCode: service.code,
      subtotal: Number(order.subtotal),
      shippingCostCharged: Number(order.shipping_cost),
      total: Number(order.total),
      // orderReference is passed so the real -> generic name substitutions are
      // written to our internal audit log (src/lib/genericNames.ts).
      items: buildShipmentContents(order.items, productsBySlug, settings, order.order_number),
      international: isInternational,
    });
  } catch (err) {
    const message = err instanceof RoyalMailApiError || err instanceof Error
      ? err.message
      : 'Royal Mail could not create the shipment.';
    const rawResponse = err instanceof RoyalMailApiError ? err.rawResponse : undefined;

    if (err instanceof RoyalMailPendingPostageError) {
      // Royal Mail accepted/created the order — this is a normal "waiting
      // for the admin to pay for postage in Click & Drop" state, not a
      // failure, so it gets its own status rather than being recorded as
      // 'error' (which would also wrongly surface in the sitewide
      // "Last API Error" panel — recordRoyalMailPendingPostage deliberately
      // never touches royal_mail_label_error_at).
      await recordRoyalMailPendingPostage(order.order_number, message, { royalMailOrderId: err.orderIdentifier, rawResponse });
      return { ok: false, pending: true, status: 202, error: message, royalMailOrderId: err.orderIdentifier };
    }

    await recordRoyalMailLabelError(order.order_number, message, { rawResponse });
    return { ok: false, status: 502, error: message };
  }

  await recordRoyalMailLabel(order.order_number, {
    royalMailOrderId: shipment.orderIdentifier,
    trackingNumber: shipment.trackingNumber,
    trackingUrl: shipment.trackingUrl,
    parcelWeightGrams: weightGrams,
    parcelPackageFormat: packageFormat,
  });

  if (shipment.trackingNumber && !order.shipping_email_sent_at && order.automation_flags?.sendDispatchEmail !== false) {
    try {
      const carrierName = order.shipping_label.includes('International')
        ? 'Royal Mail International'
        : 'Royal Mail';
      const sent = await sendShippingConfirmationEmail({
        to: order.email,
        customerName: order.customer_name,
        orderNumber: order.order_number,
        trackingNumber: shipment.trackingNumber,
        carrierName,
      });
      if (sent) {
        await markShippingEmailSent(order.order_number).catch(err =>
          logAutomationFailure('customer_email', 'Dispatch email sent but could not record shipping_email_sent_at', { orderNumber: order.order_number, detail: err })
        );
      } else {
        // sendShippingConfirmationEmail returns false (rather than throwing)
        // on a Resend error or missing API key — previously invisible.
        await logAutomationFailure('customer_email', 'Dispatch/tracking email returned false (not sent)', { orderNumber: order.order_number });
      }
    } catch (err) {
      // Email failure must not block the dispatch result, but it must be visible.
      await logAutomationFailure('customer_email', 'Dispatch/tracking email threw unexpectedly', { orderNumber: order.order_number, detail: err });
    }
  }

  return {
    ok: true,
    status: 200,
    trackingNumber: shipment.trackingNumber,
    trackingUrl: shipment.trackingUrl,
    royalMailOrderId: shipment.orderIdentifier,
    weightGrams,
    packageFormat,
  };
}
