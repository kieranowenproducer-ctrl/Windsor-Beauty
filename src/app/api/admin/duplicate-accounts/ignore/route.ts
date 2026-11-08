import { hasAdminReadAccess } from '@/lib/adminReadAccess';
import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { ignoreAccountPair, stopIgnoringAccountPair } from '@/lib/db/securityReviews';

// Behind the Ignore button on each pair in the second-accounts list, and its "Stop ignoring" undo
// (Samuel, 10 October 2026). Behind the admin session cookie in src/proxy.ts like the rest of
// /api/admin. It blocks nobody and emails nobody: it only stops one pair being raised again.

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasAdminReadAccess(request)) return NextResponse.json({error:'Administrator sign-in required.'},{status:401});
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({error:'Refresh this page before saving.'},{status:403});
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'The database is not connected, so nothing could be saved.' }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const a = body?.customerId;
  const b = body?.otherCustomerId;
  const undo = body?.undo === true;
  try {
    const saved = undo ? await stopIgnoringAccountPair(a, b) : await ignoreAccountPair(a, b);
    if (!saved) return NextResponse.json({ error: 'Those two accounts could not be found.' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'It could not be saved just now. Please try again.' }, { status: 500 });
  }
}
