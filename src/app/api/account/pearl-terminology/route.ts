import { NextResponse } from 'next/server';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { conciergeAvailableTo, isSignedInAdmin, CONCIERGE_NOT_AVAILABLE } from '@/lib/concierge/availability';
import { ensureSchema, isDbConfigured } from '@/lib/db';
import { listApprovedPearlTerminology } from '@/lib/db/pearlTerminology';
import { listApprovedPearlCitationRecords, listApprovedPearlLayoutRecords } from '@/lib/db/pearlAdmin';

/* Approved wording, approved citation corrections and switched-on answer
   layouts travel in the ONE records array the research desk already fetches
   and forwards to the answer engine, so any of them reaches members on the
   next page load without a deploy and without touching the desk component. */
async function runtimeRecords() {
  const [terminology, citations, layouts] = await Promise.all([
    listApprovedPearlTerminology(),
    listApprovedPearlCitationRecords(),
    listApprovedPearlLayoutRecords(),
  ]);
  return [...terminology, ...citations, ...layouts];
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  const admin = isSignedInAdmin(request);
  if (!customer && !admin) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!conciergeAvailableTo(customer?.email ?? null, { isAdmin: admin })) {
    return NextResponse.json({ error: CONCIERGE_NOT_AVAILABLE }, { status: 403 });
  }
  if (!isDbConfigured()) return NextResponse.json({ records: [] });
  try {
    return NextResponse.json({ records: await runtimeRecords() });
  } catch {
    try {
      await ensureSchema();
      return NextResponse.json({ records: await runtimeRecords() });
    } catch (error) {
      console.error('[account/pearl-terminology] GET failed:', error);
      return NextResponse.json({ records: [] });
    }
  }
}
