import { NextResponse } from 'next/server';
import { isDbConfigured, listOrdersPendingRoyalMailSync } from '@/lib/db';
import { dispatchOrderToRoyalMail } from '@/lib/royalMailDispatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/admin/dispatch/sync-now
//
// On-demand equivalent of /api/cron/royal-mail-sync, for the admin "Sync Now"
// button. Vercel's Hobby plan caps scheduled crons at once per day, so this
// gives the same retry capability (pick up a tracking number once postage
// has been paid manually in Click & Drop, or retry a transient API error)
// without waiting for the next 06:00 UTC run.
export async function POST() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const orders = await listOrdersPendingRoyalMailSync();

  let dispatched = 0;
  let stillPending = 0;
  for (const order of orders) {
    const result = await dispatchOrderToRoyalMail(order.order_number);
    if (result.ok && !result.skipped) dispatched++;
    else stillPending++;
  }

  return NextResponse.json({ checked: orders.length, dispatched, stillPending });
}
