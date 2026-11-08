export interface InvoiceTrailEvent {
  key: string;
  at: string | null;
  title: string;
  detail?: string;
  tone: 'good' | 'bad' | 'neutral';
}
export interface TrailInvoice {
  invoice_number: string; created_at: string; sent_at: string | null;
  viewed_at: string | null; paid_at: string | null; cancelled_at: string | null;
  total: string | number; payment_method_used: string | null;
}
export interface TrailOrder {
  status: string; payment_confirmed_at: string | null; dispatched_at: string | null;
  delivered_at: string | null; tracking_number: string | null;
}
export interface TrailEmail {
  id: number; subject: string; email_type: string | null; created_at: string;
  delivery_status: string | null; delivery_updated_at: string | null;
}

function timestamp(value: unknown): string | null {
  if (!(typeof value === 'string' || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function buildInvoiceTrail(invoice: TrailInvoice, order: TrailOrder | null, emails: TrailEmail[]): InvoiceTrailEvent[] {
  const events: InvoiceTrailEvent[] = [{ key: 'created', at: timestamp(invoice.created_at), title: 'Invoice created', tone: 'neutral' }];
  const titles: Record<string, string> = { invoice: 'Invoice email sent', invoice_reminder: 'Invoice reminder sent', order_confirmation: 'Order confirmation sent', dispatch: 'Tracking email sent', payment_link: 'Payment link sent', payment_reminder: 'Payment reminder sent' };
  for (const email of emails) {
    const invoiceEmail = email.subject === `Invoice ${invoice.invoice_number} from Windsor Beauty`;
    const title = invoiceEmail ? 'Invoice email sent' : titles[email.email_type ?? ''] ?? 'Related email sent';
    const failed = ['failed', 'bounced', 'suppressed', 'complained'].includes(email.delivery_status ?? '');
    const accepted = ['delivered', 'opened', 'clicked'].includes(email.delivery_status ?? '');
    const detail = failed ? 'The email service reported a delivery problem.'
      : accepted ? 'Their email provider accepted it. Inbox placement and reading are not confirmed.'
      : email.delivery_status === 'delivery_delayed' ? 'Delivery is delayed.' : 'No delivery confirmation recorded.';
    events.push({ key: `email-${email.id}`, at: timestamp(email.created_at), title, detail, tone: failed ? 'bad' : accepted ? 'good' : 'neutral' });
  }
  if (invoice.sent_at && !events.some(e => e.title === 'Invoice email sent')) events.push({ key: 'sent', at: timestamp(invoice.sent_at), title: 'Invoice sent', detail: 'No matching saved email record is available.', tone: 'neutral' });
  if (invoice.viewed_at) events.push({ key: 'viewed', at: timestamp(invoice.viewed_at), title: 'Payment page opened', tone: 'neutral' });
  const paidAt = timestamp(invoice.paid_at) ?? timestamp(order?.payment_confirmed_at);
  if (paidAt) events.push({ key: 'paid', at: paidAt, title: 'Payment recorded', detail: 'The saved payment record is shown here; this report does not confirm or change payments.', tone: 'good' });
  if (order && (order.dispatched_at || ['dispatched', 'delivered'].includes(order.status))) events.push({ key: 'dispatched', at: timestamp(order.dispatched_at), title: 'Marked dispatched', detail: order.tracking_number ? `Tracking number ${order.tracking_number}.` : undefined, tone: 'good' });
  if (order && (order.delivered_at || order.status === 'delivered')) events.push({ key: 'delivered', at: timestamp(order.delivered_at), title: 'Marked delivered', detail: 'This is the saved shop status, not a new carrier check.', tone: 'good' });
  if (order?.status === 'refunded') events.push({ key: 'refunded', at: null, title: 'Marked refunded', tone: 'bad' });
  if (invoice.cancelled_at) events.push({ key: 'cancelled', at: timestamp(invoice.cancelled_at), title: 'Invoice cancelled', tone: 'bad' });
  const ordered = events.filter(e => e.at).sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime());
  events.forEach((event, i) => {
    if (event.at) return;
    const next = events.slice(i + 1).find(e => e.at && !e.key.startsWith('email-'));
    const index = next ? ordered.indexOf(next) : -1;
    ordered.splice(index < 0 ? ordered.length : index, 0, event);
  });
  return ordered;
}
