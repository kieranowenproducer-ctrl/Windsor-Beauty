import { requireDb } from './client';
import { buildInvoiceTrail, type TrailInvoice, type TrailOrder, type TrailEmail } from '../invoiceTrail';

// Read existing records only. No schema setup, provider queries, or email sends.
export async function readInvoiceTrail(id: number) {
  const db = requireDb();
  const invoices = await db`
    SELECT invoice_number, email, order_number, created_at, sent_at, viewed_at,
      paid_at, cancelled_at, total, payment_method_used
    FROM invoices WHERE id = ${id} LIMIT 1
  `;
  const invoice = invoices[0] as (TrailInvoice & { email: string; order_number: string | null }) | undefined;
  if (!invoice) return null;
  const orders = invoice.order_number ? await db`
    SELECT status, payment_confirmed_at, to_jsonb(o)->>'dispatched_at' AS dispatched_at,
      to_jsonb(o)->>'delivered_at' AS delivered_at, tracking_number
    FROM orders o WHERE order_number = ${invoice.order_number} LIMIT 1
  ` : [];
  // Exact order reference or the exact Beauty invoice subject plus its recipient.
  // A partial invoice-number match must never pull in another invoice's messages.
  let emails: TrailEmail[] = [];
  let emailHistoryAvailable = true;
  try {
    emails = await db`
      SELECT id, subject, email_type, created_at, delivery_status, delivery_updated_at
      FROM customer_emails WHERE direction = 'sent'
        AND ((${invoice.order_number}::text IS NOT NULL AND order_ref = ${invoice.order_number})
          OR (subject = ${`Invoice ${invoice.invoice_number} from Windsor Beauty`}
            AND lower(email) = lower(${invoice.email})))
      ORDER BY created_at DESC, id DESC LIMIT 100
    ` as TrailEmail[];
  } catch {
    // Old archives may not have delivery metadata. State the gap; never write DDL on a read.
    emailHistoryAvailable = false;
  }
  return { events: buildInvoiceTrail(invoice, (orders[0] as TrailOrder | undefined) ?? null, emails), emailHistoryAvailable };
}
