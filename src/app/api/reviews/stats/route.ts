import { loadProductAccess, filterProductRecords, mayAccessProduct, productJson } from '@/lib/productAccess';
import { NextResponse } from 'next/server';
import { getReviewStatsForProducts, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public endpoint — storefront product cards call this to show a star rating
// and review count without loading full review text. A slug with no entry
// has no approved reviews yet.
export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return productJson({ stats: {} });
  }
  try {
    const stats = await getReviewStatsForProducts();
    const access = await loadProductAccess(request);
    return productJson({ stats: filterProductRecords(stats, access) });
  } catch {
    return productJson({ stats: {} });
  }
}
