// Delivery-edit flow ported from accepted Glow e7762c9. Beauty keeps its own
// prices, products and services. No customer account, payment or email changes.
import { createHash, randomUUID } from 'crypto';
import { findOrderByNumber, PAYMENT_CONFIRMED_STATUSES, type OrderRow } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { claimRoyalMailDispatch, releaseRoyalMailDispatch, renewRoyalMailDispatch } from '@/lib/db/royalMailLease';
import { deleteOrdersForReference, isRoyalMailConfigured } from '@/lib/royalMail';
import { dispatchOrderToRoyalMail, recipientFromOrder, type RoyalMailDispatchResult } from '@/lib/royalMailDispatch';

export const DELIVERY_LOCKED_STATUSES = ['dispatched', 'delivered', 'refunded', 'cancelled'];
export interface DeliveryDetails { recipient: string; line1: string; line2: string; city: string; postcode: string; country: string }
const UK_NAMES = /^(u\.?k\.?|united kingdom|great britain|britain|england|scotland|wales|northern ireland)$/i;
const countryCode = (value: string | null | undefined) => !value?.trim() || UK_NAMES.test(value.trim()) ? 'GB' : value.trim().toUpperCase();
const oneLine = (value: DeliveryDetails) => [value.line1, value.line2, value.city, value.postcode, value.country].filter(Boolean).join(', ');

export function deliveryChangeBlocker(order: Pick<OrderRow, 'status' | 'shipping_email_sent_at' | 'royal_mail_shipped_on'>): string | null {
  if (DELIVERY_LOCKED_STATUSES.includes(order.status)) return `This order is ${order.status.replace(/_/g, ' ')}, so its delivery details cannot be changed.`;
  if (order.shipping_email_sent_at) return 'The customer has already been sent tracking. Check the parcel before making any changes.';
  if (order.royal_mail_shipped_on) return 'Royal Mail already records this parcel as posted.';
  return null;
}

export function currentDeliveryDetails(order: OrderRow): DeliveryDetails {
  const parsed = recipientFromOrder(order);
  return { recipient: order.shipping_recipient?.trim() || order.customer_name,
    line1: parsed?.line1 ?? order.shipping_line1 ?? '', line2: parsed?.line2 ?? order.shipping_line2 ?? '',
    city: parsed?.city ?? order.shipping_city ?? '', postcode: parsed?.postcode ?? order.shipping_postcode ?? '',
    country: countryCode(parsed?.countryCode ?? order.shipping_country) };
}

// Browser drafts bind to the actual order snapshot. The token is not authority;
// the handler still checks the current staff cookie and the write owns its lease.
export function deliveryDetailsVersion(order: OrderRow): string {
  return createHash('sha256').update(JSON.stringify([currentDeliveryDetails(order), order.status, order.fulfilment_type,
    order.shipping_label, order.shipping_cost, order.total, order.royal_mail_order_id, order.royal_mail_label_status,
    order.shipping_email_sent_at, order.royal_mail_shipped_on ?? null, order.royal_mail_printed_on ?? null])).digest('hex');
}

export function cleanDeliveryDetails(input: Record<string, unknown>): { ok: true; details: DeliveryDetails } | { ok: false; error: string } {
  const limits = { recipient: 100, line1: 100, line2: 100, city: 60, postcode: 12, country: 60 };
  const values: Record<string, string> = {};
  for (const [key, max] of Object.entries(limits)) {
    if (typeof input[key] !== 'string' || input[key].length > max || /[\u0000-\u001f\u007f]/.test(input[key])) return { ok: false, error: 'Check the delivery details. A field is missing or too long.' };
    values[key] = input[key].replace(/\s+/g, ' ').trim();
  }
  const country = countryCode(values.country); let postcode = values.postcode.toUpperCase();
  if (country === 'GB') { const compact = postcode.replace(/\s/g, ''); if (compact.length > 3) postcode = `${compact.slice(0, -3)} ${compact.slice(-3)}`; }
  const details = { ...values, postcode, country } as unknown as DeliveryDetails;
  if (!details.recipient || !details.line1 || !details.city || !details.postcode) return { ok: false, error: 'Enter the recipient, first address line, town or city and postcode.' };
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, error: 'Choose a country from the list.' };
  if (country === 'GB' && !/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/.test(postcode)) return { ok: false, error: 'Check the UK postcode and try again.' };
  return { ok: true, details };
}

export type DeliveryChangeResult = { ok: false; status: number; error: string } | {
  ok: true; order: OrderRow; deletedRoyalMailOrders: string[]; oldLabelWasPaid: boolean; royalMail: RoyalMailDispatchResult | null;
};

export async function changeDeliveryDetails(orderNumber: string, input: Record<string, unknown>): Promise<DeliveryChangeResult> {
  if (!/^WB-[A-Z0-9-]+$/.test(orderNumber)) return { ok: false, status: 400, error: 'Use a Windsor Beauty order reference.' };
  const cleaned = cleanDeliveryDetails(input);
  if (!cleaned.ok) return { ok: false, status: 400, error: cleaned.error };
  if (typeof input.expectedVersion !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedVersion)) return { ok: false, status: 409, error: 'Reload the delivery details before saving.' };
  const token = randomUUID(); let claimed = false; let deleted: string[] = []; let result: DeliveryChangeResult;
  try {
    claimed = await claimRoyalMailDispatch(orderNumber, token);
    if (!claimed) return { ok: false, status: 409, error: 'This order is being updated or dispatched. Refresh and try again shortly.' };
    const order = await findOrderByNumber(orderNumber);
    if (!order) return { ok: false, status: 404, error: 'Order not found.' };
    if (!['royal_mail_printed_on', 'royal_mail_shipped_on', 'royal_mail_checked_at'].every(key => Object.prototype.hasOwnProperty.call(order, key))) {
      return { ok: false, status: 503, error: 'Parcel status is not ready on this database. Nothing has changed.' };
    }
    const blocked = deliveryChangeBlocker(order);
    if (blocked) return { ok: false, status: 409, error: blocked };
    if (input.expectedVersion !== deliveryDetailsVersion(order)) return { ok: false, status: 409, error: 'This order changed after the form opened. Reload it before saving.' };
    const before = currentDeliveryDetails(order), next = cleaned.details;
    if (JSON.stringify(before).toLowerCase() === JSON.stringify(next).toLowerCase()) return { ok: false, status: 400, error: 'Nothing has changed. Edit the name or address first.' };
    if (before.country !== next.country) return { ok: false, status: 409, error: 'Changing country needs a review of the delivery service and price. Nothing has changed.' };
    const byRoyalMail = order.fulfilment_type === 'royal_mail';
    if (byRoyalMail && isRoyalMailConfigured()) {
      try { deleted = (await deleteOrdersForReference(orderNumber, () => renewRoyalMailDispatch(orderNumber, token))).deleted; }
      catch (error) { return { ok: false, status: 502, error: `${error instanceof Error ? error.message : 'Royal Mail could not be checked.'} The saved delivery details were not changed.` }; }
    } else if (byRoyalMail && (order.royal_mail_order_id || order.royal_mail_label_status === 'created' || order.royal_mail_label_status === 'pending_postage')) {
      return { ok: false, status: 503, error: 'Royal Mail is not connected. Check and cancel the old label before changing these details.' };
    }
    const recipient = next.recipient.toLowerCase() === order.customer_name.trim().toLowerCase() ? null : next.recipient;
    const note = `Delivery changed: recipient "${before.recipient}" to "${next.recipient}"; address "${oneLine(before)}" to "${oneLine(next)}".${deleted.length ? ` Old Royal Mail order ${deleted.join(', ')} deleted. Do not use its old label.` : ''}`;
    const rows = await requireDb()`UPDATE orders SET
      shipping_recipient = ${recipient}, shipping_line1 = ${next.line1}, shipping_line2 = ${next.line2 || null},
      shipping_city = ${next.city}, shipping_postcode = ${next.postcode}, shipping_country = ${next.country}, shipping_address = ${oneLine(next)},
      royal_mail_order_id = NULL, royal_mail_label_status = 'none', royal_mail_label_error = NULL, royal_mail_label_created_at = NULL,
      royal_mail_printed_on = NULL, tracking_number = NULL, tracking_url = NULL,
      admin_notes = concat_ws(E'\n', NULLIF(admin_notes, ''), ${new Date().toISOString() + ': ' + note}::text)
      WHERE order_number = ${orderNumber} AND royal_mail_dispatch_lease_token = ${token} AND royal_mail_dispatch_lease_until > now()
        AND status = ${order.status} AND NOT (status = ANY(${DELIVERY_LOCKED_STATUSES}::text[]))
        AND shipping_email_sent_at IS NULL AND royal_mail_shipped_on IS NULL
        AND shipping_address IS NOT DISTINCT FROM ${order.shipping_address}
        AND shipping_recipient IS NOT DISTINCT FROM ${order.shipping_recipient}
        AND shipping_country IS NOT DISTINCT FROM ${order.shipping_country}
        AND royal_mail_order_id IS NOT DISTINCT FROM ${order.royal_mail_order_id}
        AND fulfilment_type = ${order.fulfilment_type}
      RETURNING *`;
    if (rows.length !== 1) return { ok: false, status: 409, error: `This order changed while saving. Reload it and check Click & Drop.${deleted.length ? ' The old Royal Mail order was already removed; do not use its label.' : ''}` };
    result = { ok: true, order: rows[0] as OrderRow, deletedRoyalMailOrders: deleted, oldLabelWasPaid: order.royal_mail_label_status === 'created', royalMail: null };
  } catch {
    return { ok: false, status: 503, error: `The change could not be confirmed. Reload the order before retrying.${deleted.length ? ' The old Royal Mail order was removed; check Click & Drop and do not use its label.' : ''}` };
  } finally { if (claimed) await releaseRoyalMailDispatch(orderNumber, token).catch(() => {}); }
  if (result.order.fulfilment_type === 'royal_mail' && isRoyalMailConfigured() && PAYMENT_CONFIRMED_STATUSES.includes(result.order.status)) {
    result.royalMail = await dispatchOrderToRoyalMail(orderNumber, { sendTrackingEmail: false });
    result.order = await findOrderByNumber(orderNumber).catch(() => null) ?? result.order;
  }
  return result;
}
