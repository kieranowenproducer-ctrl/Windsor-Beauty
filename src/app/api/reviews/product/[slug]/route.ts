import { loadProductAccess, filterProductRecords, mayAccessProduct, productJson } from '@/lib/productAccess';
import { NextResponse } from 'next/server';
import { isDbConfigured, listApprovedReviewsForProduct, getReviewStatsForProducts } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return productJson({ reviews: [] });
  }

  try {
    const access = await loadProductAccess(request);
    if (!mayAccessProduct(params.slug, access)) return productJson({ error: 'Product not found.' }, { status: 404 });
    const [reviews, stats] = await Promise.all([listApprovedReviewsForProduct(params.slug), getReviewStatsForProducts()]);
    return productJson({ reviews, summary: stats[params.slug] ?? { count: 0, average: 0 } });
  } catch (err) {
    console.error('[reviews] Loading product reviews failed:', err);
    return productJson(
      { error: 'Reviews could not be loaded right now.' },
      { status: 500 }
    );
  }
}
