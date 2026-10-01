import { NextResponse } from 'next/server';
import { isDbConfigured, listDiscountCodes, listOrdersByDiscountCode } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/admin/discount-codes/[id]/usage
// Returns the orders that redeemed a specific discount code, identified by the
// code's numeric DB id. Looks up the code string first, then queries orders.
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ usage: [] });
  }

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // Resolve the code string from the id
  const codes = await listDiscountCodes().catch(() => []);
  const found = codes.find(c => c.id === id);
  if (!found) {
    return NextResponse.json({ error: 'Code not found' }, { status: 404 });
  }

  const usage = await listOrdersByDiscountCode(found.code).catch(() => []);
  return NextResponse.json({ usage });
}
