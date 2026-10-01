import { NextResponse } from 'next/server';
import { isDbConfigured, listOrdersByCustomerEmail } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/admin/customers/[id]/orders?email=...
// Returns a customer's order history for display in the admin customer detail panel.
// Looks up by email (passed as query param) rather than customer ID so the
// panel doesn't need to store the internal numeric ID separately.
export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ orders: [] });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email query param required' }, { status: 400 });
  }

  const orders = await listOrdersByCustomerEmail(email).catch(() => []);
  return NextResponse.json({ orders });
}
