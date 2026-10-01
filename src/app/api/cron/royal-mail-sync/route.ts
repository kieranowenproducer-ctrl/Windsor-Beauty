import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cronHeartbeat';
import { isDbConfigured, listOrdersPendingRoyalMailSync } from '@/lib/db';
import { dispatchOrderToRoyalMail } from '@/lib/royalMailDispatch';

export const dynamic = 'force-dynamic';
// Royal Mail's API + the DB lookups above can take a few seconds per order
// across a backlog — give this route more headroom than the default.
export const maxDuration = 60;

// GET /api/cron/royal-mail-sync
//
// Scheduled by vercel.json to run periodically (see its `crons` entry).
// Retries every order whose payment is confirmed but doesn't have a Royal
// Mail label yet — this is what picks up a tracking number automatically
// once postage has been applied/paid for manually in Click & Drop, with no
// admin click required. Safe to call as often as you like or trigger
// manually: dispatchOrderToRoyalMail never creates a duplicate Royal Mail
// order (see its own de-duplication via order reference lookup), and orders
// that are already fully dispatched are skipped immediately.
//
// Protected by CRON_SECRET — Vercel automatically sends
// `Authorization: Bearer ${CRON_SECRET}` on scheduled invocations once that
// env var is set. Missing configuration refuses the request.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'The tracking job is not configured.' }, { status: 503 });
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!isDbConfigured()) {
    await recordCronRun('royal-mail-sync', 'nothing to check');
    return NextResponse.json({ checked: 0, dispatched: 0, stillPending: 0 });
  }

  const orders = await listOrdersPendingRoyalMailSync();

  let dispatched = 0;
  let stillPending = 0;
  const results: { orderNumber: string; ok: boolean; skipped?: boolean; error?: string }[] = [];

  // Sequential, not parallel — avoids bursting Royal Mail's API with a
  // backlog of simultaneous requests on a single cron tick.
  for (const order of orders) {
    const result = await dispatchOrderToRoyalMail(order.order_number);
    if (result.ok && !result.skipped) dispatched++;
    else stillPending++;
    results.push({ orderNumber: order.order_number, ok: result.ok, skipped: result.skipped, error: result.error });
  }

  await recordCronRun('royal-mail-sync', `checked ${orders.length}, dispatched ${dispatched}`);
  return NextResponse.json({ checked: orders.length, dispatched, stillPending, results });
}
