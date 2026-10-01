import { NextResponse } from 'next/server';
import { isDbConfigured, recordRoyalMailParcelStates } from '@/lib/db';
import { fetchRoyalMailParcelStates, isRoyalMailConfigured, RoyalMailApiError } from '@/lib/royalMail';

export const dynamic = 'force-dynamic';

// POST /api/admin/orders/royal-mail-refresh
//
// Asks Royal Mail what it knows about our parcels and writes it onto the orders (task d912f632).
//
// It reports two things and only two: whether Royal Mail has PRINTED the label, and whether Royal
// Mail has TAKEN the parcel. It does not report delivery, because Click & Drop does not have a
// delivery status to report. See the note at the bottom of src/lib/royalMail.ts for the evidence.
//
// ONE request to Royal Mail covers every order, because their orders list comes back together.
// Pressing the button twice in a row costs one call each time, not one per parcel.
//
// Everything under /api/admin is already behind the admin session cookie in src/proxy.ts.
export async function POST() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  if (!isRoyalMailConfigured()) {
    return NextResponse.json(
      { error: 'Royal Mail is not connected on this site, so there is nothing to ask.' },
      { status: 503 }
    );
  }

  let states;
  try {
    states = await fetchRoyalMailParcelStates();
  } catch (err) {
    const message = err instanceof RoyalMailApiError
      ? `Royal Mail said: ${err.message}`
      : 'Could not reach Royal Mail. Nothing has changed. Please try again.';
    console.error('[royal-mail-refresh] fetch failed', err);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let updated: number;
  try {
    updated = await recordRoyalMailParcelStates(states);
  } catch (err) {
    console.error('[royal-mail-refresh] could not save', err);
    return NextResponse.json(
      { error: 'Royal Mail answered, but the answer could not be saved. Please try again.' },
      { status: 500 }
    );
  }

  const withParcel = states.filter((s) => s.shippedOn).length;
  const printedOnly = states.filter((s) => s.printedOn && !s.shippedOn).length;
  return NextResponse.json({
    success: true,
    checked: states.length,
    updated,
    withParcel,
    printedOnly,
    checkedAt: new Date().toISOString(),
  });
}
