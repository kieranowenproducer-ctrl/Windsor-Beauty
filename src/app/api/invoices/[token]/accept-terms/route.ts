import { NextResponse } from 'next/server';
import { findInvoiceByPublicToken, isDbConfigured, recordInvoiceTermsAcceptance } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/invoices/[token]/accept-terms
//
// Records the customer ticking "I have read and agree to the Windsor Beauty
// Terms & Conditions" on the /pay/[token] page, BEFORE the payment buttons
// unlock. Token-gated like the invoice itself; idempotent (first acceptance
// wins — see recordInvoiceTermsAcceptance). The timestamp + IP are the
// durable evidence of acknowledgement attached to the invoice record.
export async function POST(request: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Temporarily unavailable.' }, { status: 503 });
  }

  const invoice = await findInvoiceByPublicToken(params.token);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || 'unknown';

  await recordInvoiceTermsAcceptance(invoice.id, ip);
  return NextResponse.json({ success: true });
}
