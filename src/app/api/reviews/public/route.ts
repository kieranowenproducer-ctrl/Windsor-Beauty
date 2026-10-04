import { loadProductAccess, filterProductReviews, productJson } from '@/lib/productAccess';
import { NextResponse } from 'next/server';
import { isDbConfigured, listApprovedReviewsPublic } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return productJson({ reviews: [] });
  }

  try {
    const reviews = await filterProductReviews(await listApprovedReviewsPublic(), await loadProductAccess(request));
    return productJson({ reviews });
  } catch (err) {
    console.error('[reviews] Loading public reviews failed:', err);
    return productJson(
      { error: 'Reviews could not be loaded right now.' },
      { status: 500 }
    );
  }
}
