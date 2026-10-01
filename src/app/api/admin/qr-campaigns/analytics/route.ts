import { NextResponse } from 'next/server';
import { getQrScansTimeSeries, getQrOrdersTimeSeries, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ scansTimeSeries: [], ordersTimeSeries: [] });
  }
  try {
    const [scansTimeSeries, ordersTimeSeries] = await Promise.all([
      getQrScansTimeSeries(30),
      getQrOrdersTimeSeries(30),
    ]);
    return NextResponse.json({ scansTimeSeries, ordersTimeSeries });
  } catch {
    return NextResponse.json({ scansTimeSeries: [], ordersTimeSeries: [] });
  }
}
