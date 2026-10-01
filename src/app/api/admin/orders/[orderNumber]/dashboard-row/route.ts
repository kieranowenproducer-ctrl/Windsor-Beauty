import { NextResponse } from 'next/server';
import { isDbConfigured, setOrderActivityCleared } from '@/lib/db';

export const dynamic = 'force-dynamic';

// PATCH /api/admin/orders/:orderNumber/dashboard-row  { cleared: boolean }
//
// Takes a finished order's LINE off the dashboard's Latest Activity list, or
// puts it back (task 535c24f9). Kieran had a cancelled order sitting in red on
// the first screen he opens with no way to clear it, the way a red problem can
// now be cleared.
//
// It hides a line. It does not touch the order: the Orders screen, the money,
// the customer and the history are all exactly as they were, which is why there
// is no DELETE here and must never be one. Only Cancelled and Payment failed
// can be cleared, enforced in the SQL rather than trusted from the browser.
//
// Everything under /api/admin is already behind the admin session cookie in
// src/proxy.ts, the same as every other admin endpoint.
export async function PATCH(request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const orderNumber = decodeURIComponent(params.orderNumber ?? '').trim();
  if (!orderNumber) {
    return NextResponse.json({ error: 'No order number given.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.cleared !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // A database that refused the change and an order that cannot be cleared are
  // different things and must never share a message.
  let updated: boolean;
  try {
    updated = await setOrderActivityCleared(orderNumber, body.cleared);
  } catch (err) {
    console.error('[orders/dashboard-row] could not update', orderNumber, err);
    return NextResponse.json(
      { error: 'Could not change that. It is still on the list. Please try again.' },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      { error: 'Only a cancelled order, or one whose payment failed, can be taken off this list.' },
      { status: 409 }
    );
  }
  return NextResponse.json({ success: true, orderNumber, cleared: body.cleared });
}
