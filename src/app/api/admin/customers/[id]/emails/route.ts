import { NextResponse } from 'next/server';
import { findCustomerById, isDbConfigured } from '@/lib/db';
import { listCustomerEmails } from '@/lib/db/customerEmails';

export const dynamic = 'force-dynamic';

// GET /api/admin/customers/[id]/emails — the email conversation with one
// customer (task b2084076): dashboard messages sent to them and replies
// captured from them, newest first, for the customer page's Email History.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ emails: [] });
  }

  const { id } = await context.params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: 'Invalid customer id.' }, { status: 400 });
  }

  const customer = await findCustomerById(customerId).catch(() => null);
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }

  const emails = await listCustomerEmails(customerId, customer.email).catch(() => []);
  return NextResponse.json({ emails });
}
