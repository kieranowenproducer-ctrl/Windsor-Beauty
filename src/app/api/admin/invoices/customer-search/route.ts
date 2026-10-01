import { NextRequest, NextResponse } from 'next/server';
import { isDbConfigured, searchInvoiceCustomers } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Admin-only (gated by middleware on /api/admin). Looks up an existing customer
// across members, past orders and past invoices so the invoice editor can
// prefill their details. Read-only — never writes anything.
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ candidates: [] });
  if (!isDbConfigured()) return NextResponse.json({ candidates: [], dbConfigured: false });
  try {
    const candidates = await searchInvoiceCustomers(q, 8);
    return NextResponse.json({ candidates });
  } catch {
    return NextResponse.json({ candidates: [], error: 'Search failed.' }, { status: 500 });
  }
}
