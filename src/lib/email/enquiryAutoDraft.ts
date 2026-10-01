import type { OrderRow } from '@/lib/db/orders';

export interface OrderDraftSnapshot {
  status: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
}

const ORDER_STATUS: Record<string, { label: string; note: string }> = {
  pending: { label: 'Order received', note: 'We have received your order.' },
  awaiting_payment: { label: 'Awaiting payment', note: 'Your payment is still being processed.' },
  payment_failed: { label: 'Payment not completed', note: 'The payment was not completed.' },
  payment_cancelled: { label: 'Payment cancelled', note: 'The payment was cancelled.' },
  paid: { label: 'Payment confirmed', note: 'Your payment is confirmed and your order is being prepared.' },
  awaiting_dispatch: { label: 'Preparing for dispatch', note: 'Your order is being packaged and prepared for dispatch.' },
  processing: { label: 'Preparing for dispatch', note: 'Your order is being prepared for dispatch.' },
  exported: { label: 'Ready for Royal Mail', note: 'Your order has been prepared for collection by Royal Mail.' },
  dispatched: { label: 'Dispatched', note: 'Your order has been dispatched with Royal Mail.' },
  delivered: { label: 'Delivered', note: 'Our records show that your order has been delivered.' },
  refunded: { label: 'Refunded', note: 'Our records show that this order has been refunded.' },
  cancelled: { label: 'Cancelled', note: 'Our records show that this order has been cancelled.' },
};

export function orderStatusEmailCopy(order: OrderRow): string {
  const status = ORDER_STATUS[order.status] ?? {
    label: 'Being checked',
    note: 'We are checking the current position of your order.',
  };
  const tracking = order.tracking_number
    ? `\n\nRoyal Mail tracking number: ${order.tracking_number}${order.tracking_url ? `\nTrack it here: ${order.tracking_url}` : ''}`
    : '\n\nA tracking number will be provided when it becomes available.';

  return `Thank you for getting in touch about order ${order.order_number}.

I have checked the order record. Its current status is: ${status.label}.

${status.note}${tracking}

Please reply if there is anything else you would like us to check.

Warm regards,
Team WG`;
}

export function enquiryNeedsHumanAction(message: string): boolean {
  return /\b(refund|cancel|change (?:my |the )?address|wrong address|damaged|missing|not arrived|complaint|chargeback|return|duplicate order|extra order|second order|wrong (?:item|quantity))\b/i.test(message)
    || /\b(?:remove|delete|clear|amend|change)\b.{0,45}\b(?:order|payment|item|quantity)\b/i.test(message)
    || /\b(?:order|payment|item|quantity)\b.{0,45}\b(?:remove|delete|clear|amend|change)\b/i.test(message)
    || /\bonly need (?:the |one |1\b)/i.test(message);
}

export function enquiryNeedsPersonalAdvice(message: string): boolean {
  if (/\b(dose|dosage|daily|weekly)\b/i.test(message)) return false;
  return /\b(?:should i|should we|right for me|suitable for me|what(?:'s| is) your advice|whats your advise|advise me|worth (?:swapping|switching)|swap(?:ping)? (?:onto|to)|switch(?:ing)? (?:onto|to)|manage my (?:weight|condition)|recommend for me)\b/i.test(message);
}

export function looksLikeOrderStatusQuestion(subjectKey: string, message: string, orderNumber: string | null): boolean {
  if (enquiryNeedsHumanAction(message)) return false;
  return Boolean(
    orderNumber
    || subjectKey === 'order'
    || /\b(track|tracking|where(?:'s| is) my order|order status|dispatch|delivery status)\b/i.test(message),
  );
}

export function orderDraftSnapshot(order: Pick<OrderRow, 'status' | 'tracking_number' | 'tracking_url'>): OrderDraftSnapshot {
  return {
    status: order.status,
    trackingNumber: order.tracking_number,
    trackingUrl: order.tracking_url,
  };
}

export function orderDraftIsStale(
  snapshot: OrderDraftSnapshot,
  order: Pick<OrderRow, 'status' | 'tracking_number' | 'tracking_url'>,
): boolean {
  return snapshot.status !== order.status
    || snapshot.trackingNumber !== order.tracking_number
    || snapshot.trackingUrl !== order.tracking_url;
}
