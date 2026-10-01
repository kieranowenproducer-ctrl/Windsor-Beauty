import { NextResponse } from 'next/server';
import { isDbConfigured, listAutomationFailuresForOrder } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/admin/orders/[orderNumber]/failures
//
// Everything the site failed to do for this order: a confirmation email that would not send, a
// dispatch that did not go, a payment webhook that came back wrong. It was all being recorded
// already, but only on System Health, so the order itself looked fine to whoever opened it.
export async function GET(_request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) return NextResponse.json({ failures: [] });
  try {
    const failures = await listAutomationFailuresForOrder(params.orderNumber);
    return NextResponse.json({ failures });
  } catch {
    return NextResponse.json({ failures: [] });
  }
}
