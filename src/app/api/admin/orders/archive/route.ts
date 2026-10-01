import { NextResponse } from 'next/server';
import { isDbConfigured, setOrdersArchived } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/admin/orders/archive  { orderNumbers: string[], archived: boolean }
//
// Moves orders into Archived orders, or brings them back (task 831a4461). It sets one timestamp
// and nothing else: no order is deleted, no status changes, no money is touched. Deleting orders is
// a separate thing that already exists, and this must never become it.
//
// Everything under /api/admin is already behind the admin session cookie in src/proxy.ts.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const orderNumbers = Array.isArray(body?.orderNumbers)
    ? body.orderNumbers.filter((n: unknown) => typeof n === 'string' && n.trim()).map((n: string) => n.trim())
    : null;

  if (!orderNumbers || orderNumbers.length === 0 || typeof body?.archived !== 'boolean') {
    return NextResponse.json({ error: 'Provide { orderNumbers, archived }.' }, { status: 400 });
  }
  // A cap, because this arrives from a browser and one runaway request should not be able to
  // rewrite the whole order book in a single call.
  if (orderNumbers.length > 200) {
    return NextResponse.json({ error: 'Too many orders at once. Do it in smaller batches.' }, { status: 400 });
  }

  let moved: number;
  try {
    moved = await setOrdersArchived(orderNumbers, body.archived);
  } catch (err) {
    console.error('[orders/archive] could not update', err);
    return NextResponse.json(
      { error: 'Could not move those orders. Nothing has changed. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, moved, archived: body.archived });
}
