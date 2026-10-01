import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { dispatchOrderToRoyalMail } from '@/lib/royalMailDispatch';

// Creates a Royal Mail Click & Drop shipment for a paid order and stores the
// resulting tracking number/label status. Does NOT change the order's
// `status` and does NOT send any customer email beyond the tracking email —
// the admin separately marks the order "Dispatched" (see /dispatch route)
// for the rest of the fulfilment flow, satisfying the "no premature tracking
// emails" requirement.
//
// This is a thin wrapper — the actual logic (and the de-duplication that
// makes it safe to call repeatedly) lives in dispatchOrderToRoyalMail, shared
// with the automatic triggers (payment confirmation, background cron sync).
export async function POST(_request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const result = await dispatchOrderToRoyalMail(params.orderNumber);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, pending: result.pending ?? false, royalMailOrderId: result.royalMailOrderId },
      { status: result.status }
    );
  }

  return NextResponse.json({
    success: true,
    trackingNumber: result.trackingNumber,
    trackingUrl: result.trackingUrl,
    royalMailOrderId: result.royalMailOrderId,
    labelStatus: 'created',
    weightGrams: result.weightGrams,
    packageFormat: result.packageFormat,
  });
}
