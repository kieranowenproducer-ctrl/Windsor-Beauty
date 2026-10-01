import { NextRequest, NextResponse } from 'next/server';
import { getStatsForDateRange, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to   = searchParams.get('to');

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate   = new Date(to);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  // The to date is inclusive. Paid-order figures use the confirmation time;
  // awaiting-payment figures use the attempt time.
  toDate.setDate(toDate.getDate() + 1);

  const stats = await getStatsForDateRange(fromDate, toDate);
  return NextResponse.json(stats);
}
