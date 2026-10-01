import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { getProductSalesReport, type GroupKind } from '@/lib/productSales';

export const dynamic = 'force-dynamic';

// The Dashboard's "Most Popular Products" panel (task aa684446). Admin-only by the gate in
// src/proxy.ts, which protects every /api/admin path — there is no second check here on
// purpose, so there is one place that decides who is an admin.
//
// groups is a pipe-separated list of the ticked groups. Pipe rather than comma because the group
// is whatever the customer typed into "how did you hear about us", and people type commas.
export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({
      dbConfigured: false,
      products: [],
      groups: [],
      totals: { units: 0, orders: 0, customers: 0, revenue: 0 },
      truncated: false,
    });
  }

  const url = new URL(request.url);
  const kind: GroupKind = url.searchParams.get('groupBy') === 'campaign' ? 'campaign' : 'referral';
  const groups = (url.searchParams.get('groups') ?? '').split('|').map((g) => g.trim()).filter(Boolean);
  const from = url.searchParams.get('from') || undefined;
  const to = url.searchParams.get('to') || undefined;

  try {
    const report = await getProductSalesReport({ kind, groups, from, to });
    return NextResponse.json({ dbConfigured: true, ...report });
  } catch {
    return NextResponse.json({ error: 'Could not work out the product figures.' }, { status: 500 });
  }
}
