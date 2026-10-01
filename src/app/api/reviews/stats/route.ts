import { NextResponse } from 'next/server';
import { getReviewStatsForProducts, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public endpoint — storefront product cards call this to show a star rating
// and review count without loading full review text. A slug with no entry
// has no approved reviews yet.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ stats: {} });
  }
  try {
    const stats = await getReviewStatsForProducts();
    return NextResponse.json({ stats });
  } catch {
    return NextResponse.json({ stats: {} });
  }
}
