import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { createFenaPaymentLink } from '@/lib/fena';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payment/fena/create
 *
 * Thin wrapper around createFenaPaymentLink() (src/lib/fena.ts) — the actual
 * Fena Toolkit API call lives there, shared with the invoice "Send Invoice"
 * flow, which needs the exact same payment-link generation for an
 * invoice-created order.
 *
 * Body: { orderNumber: string }
 */
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber : null;

  if (!orderNumber) {
    return NextResponse.json({ error: 'Order number is required' }, { status: 400 });
  }

  const result = await createFenaPaymentLink(orderNumber);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ paymentUrl: result.paymentUrl, fenaPaymentId: result.fenaPaymentId });
}
