import { NextResponse } from 'next/server';
import { findInvoiceById, isDbConfigured } from '@/lib/db';
import { markOrderPaidManually } from '@/lib/markOrderPaidManually';

export const dynamic = 'force-dynamic';

const METHOD_LABELS: Record<string, string> = {
  fena: 'Fena',
  paypal: 'PayPal',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  manual: 'Manual',
};
const VALID_METHODS = new Set(Object.keys(METHOD_LABELS));

// POST /api/admin/invoices/[id]/mark-paypal-paid
//
// Despite the route name (kept for compatibility — it's the long-standing
// PayPal fallback this started as), this now marks an invoice paid via any
// method: PayPal still requires a confirmation note (there is no real PayPal
// API/webhook anywhere in this codebase — confirmed by audit — so the admin
// must check PayPal directly and log what they saw); cash/bank
// transfer/manual sales the admin already knows are paid don't need one.
// Runs the exact same downstream sequence a Fena webhook triggers (status
// transition, stock decrement, Royal Mail dispatch — both subject to this
// order's own fulfilment_type/automation_flags — confirmation email) via the
// shared markOrderPaidManually() helper.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid invoice id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  const paymentMethod = typeof body?.paymentMethod === 'string' && VALID_METHODS.has(body.paymentMethod)
    ? body.paymentMethod as 'fena' | 'paypal' | 'cash' | 'bank_transfer' | 'manual'
    : 'paypal';

  if (paymentMethod === 'paypal' && !note) {
    return NextResponse.json(
      { error: 'A confirmation note is required (e.g. the PayPal transaction reference you checked).' },
      { status: 400 }
    );
  }

  const invoice = await findInvoiceById(id);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  if (!invoice.order_number) {
    return NextResponse.json({ error: 'This invoice has not been sent yet — no linked order exists.' }, { status: 409 });
  }
  if (invoice.status === 'paid') {
    return NextResponse.json({ error: 'This invoice is already marked paid.' }, { status: 409 });
  }

  const methodLabel = METHOD_LABELS[paymentMethod];
  const fullNote = note ? `${methodLabel} — ${note}` : `Marked paid manually (${methodLabel})`;
  const result = await markOrderPaidManually(invoice.order_number, fullNote, paymentMethod);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const final = await findInvoiceById(id);
  return NextResponse.json({ invoice: final, order: result.order, emailSent: result.emailSent });
}
