import { NextResponse } from 'next/server';
import { isDbConfigured, listApprovedReviewsPublic } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ reviews: [] });
  }

  try {
    const reviews = await listApprovedReviewsPublic();
    return NextResponse.json({ reviews });
  } catch (err) {
    console.error('[reviews] Loading public reviews failed:', err);
    return NextResponse.json(
      { error: 'Reviews could not be loaded right now.' },
      { status: 500 }
    );
  }
}
