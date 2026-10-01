import { NextResponse } from 'next/server';
import { findCustomerById, isDbConfigured } from '@/lib/db';
import {
  checkOpeningOfferCustomer,
  findLatestRegistrationIp,
  setOpeningOfferReviewDecision,
} from '@/lib/db/openingOfferProtection';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not connected.' }, { status: 503 });
  const { id: rawId } = await props.params;
  const customerId = Number(rawId);
  if (!Number.isInteger(customerId)) return NextResponse.json({ error: 'Invalid customer.' }, { status: 400 });
  const customer = await findCustomerById(customerId);
  if (!customer) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const action = body?.action;
  try {
    if (action === 'hold') {
      return NextResponse.json({ error: 'Welcome offers can no longer be paused. Use Security Review to record evidence.' }, { status: 400 });
    }
    if (action === 'approve') {
      const review = await setOpeningOfferReviewDecision(customerId, 'approved');
      return NextResponse.json({ review });
    }
    const ipAddress = await findLatestRegistrationIp(customerId).catch(() => null);
    const result = await checkOpeningOfferCustomer({ customerId, ipAddress, preserveApproval: true });
    return NextResponse.json({ review: result.row });
  } catch {
    return NextResponse.json({ error: 'The welcome-offer check could not run. Please try again.' }, { status: 500 });
  }
}
