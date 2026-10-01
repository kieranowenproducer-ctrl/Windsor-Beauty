import { NextResponse } from 'next/server';
import { findOrderByNumber, isDbConfigured, recordManualRoyalMailTracking } from '@/lib/db';

// Fallback for when Royal Mail's API never exposes a tracking number even
// after postage has been paid manually in Click & Drop — lets the admin
// paste the tracking number copied from there directly into the Royal Mail
// Dispatch workflow. Sets royal_mail_label_status to 'created' so the order
// renders into the same UI branch as an API-created label. Deliberately does
// NOT change the order's `status` or send any email — "Mark Dispatched &
// Send Tracking" (the existing button for API-created labels) handles that
// exact next step identically once a tracking number exists, regardless of
// how it got there.
export async function POST(request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const order = await findOrderByNumber(params.orderNumber);
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const trackingNumber = typeof body?.trackingNumber === 'string' ? body.trackingNumber.trim() : '';
  if (!trackingNumber) {
    return NextResponse.json({ error: 'Tracking number is required.' }, { status: 400 });
  }

  const updated = await recordManualRoyalMailTracking(params.orderNumber, trackingNumber);
  if (!updated) {
    return NextResponse.json({ error: 'Could not save the tracking number.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    trackingNumber: updated.tracking_number,
    trackingUrl: updated.tracking_url,
    labelStatus: 'created',
  });
}
