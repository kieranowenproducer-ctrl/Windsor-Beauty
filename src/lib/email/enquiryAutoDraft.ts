import type { OrderRow } from '@/lib/db/orders';

export interface PearlDraftAnswer {
  kind?: string;
  title?: string;
  summary?: string;
  bullets?: string[];
  sections?: Array<{ title: string; items: string[] }>;
  comparison?: Array<{
    name: string;
    purpose?: string;
    evidence?: string;
    halfLife?: string;
    status?: string;
  }>;
  needsLanguageReview?: boolean;
}

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

export function pearlAnswerEmailCopy(answer: PearlDraftAnswer, customerQuestion = ''): string {
  const blocks: string[] = [];
  const bullets = answer.bullets ?? [];

  if (answer.kind === 'dose') {
    const schedule = bullets.find(item => /schedule|frequency/i.test(item));
    if (/\bdaily\b/i.test(schedule || '') && /\bweekly\b/i.test(customerQuestion)) {
      blocks.push('PEARL’s approved sources list this on a daily schedule, rather than a weekly schedule.');
    } else if (answer.summary?.trim()) {
      blocks.push(answer.summary.trim());
    }
    const directDoseDetails = bullets
      .filter(item => /schedule|frequency|\b(?:dose|range)\b|\b\d+(?:\.\d+)?\s*(?:mcg|mg|IU)\b/i.test(item))
      .map(item => item
        .replace(/^Original source schedule text:/i, 'Source-listed schedule:')
        .replace(/;\s*route\b.*$/i, ''))
      .slice(0, 5);
    if (directDoseDetails.length) blocks.push(directDoseDetails.map(item => `- ${item}`).join('\n'));
  } else {
    if (answer.summary?.trim()) blocks.push(answer.summary.trim());
    if (bullets.length) blocks.push(bullets.slice(0, 8).map(item => `- ${item}`).join('\n'));
  }

  if (answer.comparison?.length) {
    blocks.push(answer.comparison.slice(0, 3).map(item => {
      const details = [item.purpose, item.evidence, item.halfLife, item.status].filter(Boolean).join('; ');
      return `- ${item.name}${details ? `: ${details}` : ''}`;
    }).join('\n'));
  }

  if (!blocks.length) {
    const firstSection = answer.sections?.find(section => section.items?.length);
    if (firstSection) blocks.push(firstSection.items.slice(0, 6).map(item => `- ${item}`).join('\n'));
  }
  return blocks.join('\n\n').trim();
}

export function canPreparePearlDraft(answer: PearlDraftAnswer): boolean {
  return Boolean(
    answer.title?.trim()
    && pearlAnswerEmailCopy(answer)
    && answer.kind !== 'clarify'
    && answer.kind !== 'emergency',
  );
}

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

/** Personal dosage questions still go to PEARL under its approved rules. */
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

export function looksLikePearlQuestion(subjectKey: string, subjectLabel: string, message: string): boolean {
  return subjectKey === 'product'
    || /product information|peptide|research/i.test(subjectLabel)
    || /\b(dose|dosage|daily|weekly|half[ -]?life|peptide|compound|research|side effects?|mechanism)\b/i.test(message);
}

/**
 * Remove shop branding, pack sizes and packaging words before a product name
 * is passed to PEARL. In particular, "Windsor Glow" must never be mistaken
 * for the separate product commonly called the Glow Stack.
 */
export function productNamesForPearl(items: Array<{ name?: string; variant?: string }>): string[] {
  return Array.from(new Set(items.flatMap(item => [item.name, item.variant])
    .map(value => {
      const cleaned = String(value || '')
        .replace(/\bwindsor glow\b/gi, ' ')
        .replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|iu)\b/gi, ' ')
        .replace(/\bsuper\b/gi, ' ')
        .replace(/\b(?:pen|vial|bottle|pack|capsules?|tablets?|spray)\b/gi, ' ')
        .replace(/[()[\]_/\\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const seen = new Set<string>();
      return cleaned.split(' ').filter(word => {
        const key = word.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).join(' ');
    })
    .filter(Boolean)));
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
