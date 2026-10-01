import { NextResponse } from 'next/server';
import { createInvoice, isDbConfigured, listInvoices, INVOICE_SORTS } from '@/lib/db';
import type { InvoiceSort } from '@/lib/db';
import { generateInvoiceNumber, parseInvoiceInput } from '@/lib/invoices';
import { listTrialProducts } from '@/lib/db/trialProducts';
import { findTrialNameInInvoiceText, trialTextLeakMessage } from '@/lib/invoiceTrialTextGuard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? undefined;
  const q = searchParams.get('q') ?? undefined;
  // Sort and date range (task: put invoices in name order, or show one stretch of dates). An
  // unrecognised sort falls back to newest-first rather than erroring, so a stale bookmark or a
  // hand-typed address still returns the list.
  const sortParam = searchParams.get('sort');
  const sort = sortParam && (INVOICE_SORTS as string[]).includes(sortParam) ? (sortParam as InvoiceSort) : undefined;
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;

  try {
    const invoices = await listInvoices({ status, q, sort, from, to });
    return NextResponse.json({ invoices });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load invoices.' },
      { status: 500 }
    );
  }
}

// Creates a draft. The builder UI posts an empty/minimal payload right away
// (so it has an id to redirect to and edit), then PATCHes as the admin fills
// in the form — same two-step "create empty, then edit" pattern already used
// elsewhere in admin tooling.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const trialProducts = await listTrialProducts();
  const trialLeak = body && typeof body === 'object' ? findTrialNameInInvoiceText(body, trialProducts) : null;
  if (trialLeak) {
    return NextResponse.json({ error: trialTextLeakMessage(trialLeak) }, { status: 400 });
  }
  const fields = parseInvoiceInput({
    customerName: 'New customer',
    email: 'customer@example.com',
    lineItems: [],
    ...(body && typeof body === 'object' ? body : {}),
  }, trialProducts);

  if (!fields) {
    return NextResponse.json(
      { error: 'Invalid invoice data - check the customer name/email are filled in, and every line item has a name with a valid quantity, price, and discount.' },
      { status: 400 }
    );
  }

  try {
    const created = await createInvoice({ invoiceNumber: generateInvoiceNumber(), ...fields });
    return NextResponse.json({ invoice: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create invoice.' },
      { status: 500 }
    );
  }
}
