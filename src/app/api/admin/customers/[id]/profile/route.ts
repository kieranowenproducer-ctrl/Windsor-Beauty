import { NextResponse } from 'next/server';
import { getCustomerProfileData, isDbConfigured } from '@/lib/db';
import { getCustomerProductHistory } from '@/lib/productSales';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid customer id.' }, { status: 400 });
  }

  const profile = await getCustomerProfileData(id);
  if (!profile) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }

  // What this customer actually buys, most-bought first (task aa684446). Kept out of
  // getCustomerProfileData so the counting rules live in one file with the Dashboard report; a
  // failure here loses the summary panel, never the customer's page.
  const productHistory = await getCustomerProductHistory(id, profile.customer.email).catch(() => []);

  return NextResponse.json({ profile: { ...profile, productHistory } });
}
