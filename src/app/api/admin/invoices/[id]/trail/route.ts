import { NextResponse } from 'next/server';
import { hasAdminReadAccess } from '@/lib/adminReadAccess';
import { isDbConfigured } from '@/lib/db/client';
import { readInvoiceTrail } from '@/lib/db/invoiceTrail';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!hasAdminReadAccess(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const { id: raw } = await props.params;
  const id = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) return NextResponse.json({ error: 'Invalid invoice number.' }, { status: 400, headers });
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database is unavailable.' }, { status: 503, headers });
  try {
    const trail = await readInvoiceTrail(id);
    return trail ? NextResponse.json(trail, { headers }) : NextResponse.json({ error: 'Invoice not found.' }, { status: 404, headers });
  } catch {
    return NextResponse.json({ error: 'The invoice history could not be loaded.' }, { status: 503, headers });
  }
}
