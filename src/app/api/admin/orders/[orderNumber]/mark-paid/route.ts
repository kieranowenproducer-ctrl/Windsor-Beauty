import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { markOrderPaidManually } from '@/lib/markOrderPaidManually';

const VALID_PAID_VIA = new Set(['fena', 'paypal', 'cash', 'bank_transfer', 'manual']);

/**
 * POST /api/admin/orders/[orderNumber]/mark-paid
 *
 * Manually marks an order as paid — used for PayPal and manual payment methods
 * where there is no automatic webhook to confirm payment, and as a fallback
 * for a Fena order whose webhook never confirmed it (see the 2026-06-29
 * incident: Fena's webhook reached us with a payload shape the parser didn't
 * recognise, so the order was never auto-confirmed). Sends the customer the
 * same order-confirmation email Fena orders receive automatically, so both
 * payment methods end with the customer awaiting one final email (tracking
 * number, once dispatched).
 *
 * Body (optional): { note: string, paidVia: 'fena'|'paypal'|'cash'|'bank_transfer'|'manual' }
 * paidVia defaults to 'paypal' for backward compatibility with the original
 * PayPal-only "Mark as Paid" button, which never sends it.
 *
 * Transitions: pending | awaiting_payment → awaiting_dispatch
 *
 * Also doubles as the invoice system's "Mark PayPal Invoice as Paid" target
 * for an invoice-linked order — see src/lib/markOrderPaidManually.ts.
 */
export async function POST(request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const note = typeof body?.note === 'string' ? body.note : null;
  const paidVia = typeof body?.paidVia === 'string' && VALID_PAID_VIA.has(body.paidVia)
    ? body.paidVia as 'fena' | 'paypal' | 'cash' | 'bank_transfer' | 'manual'
    : 'paypal';

  const result = await markOrderPaidManually(params.orderNumber, note, paidVia);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true, order: result.order, emailSent: result.emailSent });
}
