import { NextResponse } from 'next/server';
import { isDbConfigured, listApprovedReviewsForProduct } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ reviews: [] });
  }

  try {
    const reviews = await listApprovedReviewsForProduct(params.slug);
    return NextResponse.json({ reviews });
  } catch (err) {
    console.error('[reviews] Loading product reviews failed:', err);
    return NextResponse.json(
      { error: 'Reviews could not be loaded right now.' },
      { status: 500 }
    );
  }
}
