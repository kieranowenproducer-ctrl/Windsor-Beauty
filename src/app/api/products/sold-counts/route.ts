import { NextResponse } from 'next/server';
import { getProductSoldCounts, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ soldCounts: {} });
  }
  const soldCounts = await getProductSoldCounts().catch(() => ({}));
  return NextResponse.json({ soldCounts });
}
