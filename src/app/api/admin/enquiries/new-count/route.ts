import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { countNewEnquiries } from '@/lib/db/enquiries';

export const dynamic = 'force-dynamic';

// Two numbers for the dashboard banner: how many website enquiries nobody has
// answered, and how long the oldest has been sitting there (task 0c1101e1).
//
// The age is the point, not decoration. Kieran asked why an enquiry that
// arrived at 02:05 was not flagged anywhere; the answer was that the dashboard
// had never mentioned enquiries at all, and the cost of that was already on the
// board: a real customer, referred by another customer, had been waiting since
// 29 July. A count alone would have shown "4 waiting" and looked survivable.
// "The oldest has been waiting 40 days" does not.
//
// Its own endpoint rather than a field on /api/admin/stats, for the same reason
// the pending-reviews count is: that route totals every order and merges the
// whole catalogue, which is far too much work to repeat just to draw a banner.
export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Enquiry count is unavailable.' }, { status: 503 });
  try {
    return NextResponse.json(await countNewEnquiries());
  } catch {
    return NextResponse.json({ error: 'Enquiry count is unavailable.' }, { status: 503 });
  }
}
