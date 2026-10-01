import { NextResponse } from 'next/server';
import { duplicateInvoice, isDbConfigured } from '@/lib/db';
import { generateInvoiceNumber } from '@/lib/invoices';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid invoice id.' }, { status: 400 });
  }

  try {
    const duplicate = await duplicateInvoice(id, generateInvoiceNumber());
    if (!duplicate) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    return NextResponse.json({ invoice: duplicate }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to duplicate invoice.' },
      { status: 500 }
    );
  }
}
