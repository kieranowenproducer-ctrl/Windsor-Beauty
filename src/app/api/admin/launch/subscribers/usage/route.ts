import { NextResponse } from 'next/server';
import { isDbConfigured, listOrdersByDiscountCode } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/admin/launch/subscribers/usage?code=WGLOW10-XXXXXX
// Returns the orders that redeemed a given launch-signup discount code —
// keyed by the raw code string (launch_subscribers has no discount_codes.id
// to look up by, unlike the admin-created-codes usage route).
export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ usage: [] });
  }

  const code = new URL(request.url).searchParams.get('code')?.trim();
  if (!code) {
    return NextResponse.json({ error: 'A code is required.' }, { status: 400 });
  }

  const usage = await listOrdersByDiscountCode(code).catch(() => []);
  return NextResponse.json({ usage });
}
