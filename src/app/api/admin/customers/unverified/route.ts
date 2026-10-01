import { NextResponse } from 'next/server';
import { isDbConfigured, listUnverifiedCustomers } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/admin/customers/unverified
//
// Backs the resend-verification box at the top of the Customers page
// (task d2796f97) — the successor to the pre-launch Early Subscribers list.
// Same "who is stuck" query System Health uses: built from who has not
// clicked their link, not from whose send threw an error, because an email
// dropped silently into junk leaves no error behind.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ unverified: [] });
  }
  try {
    const unverified = await listUnverifiedCustomers(100);
    return NextResponse.json({ unverified });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load unverified customers.' },
      { status: 500 }
    );
  }
}
