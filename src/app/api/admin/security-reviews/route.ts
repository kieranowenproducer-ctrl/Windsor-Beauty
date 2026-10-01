import { NextResponse } from 'next/server';
import { countPendingSecurityReviews, listSecurityReviewCases } from '@/lib/db/securityReviews';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [cases, pendingCount] = await Promise.all([
      listSecurityReviewCases(),
      countPendingSecurityReviews(),
    ]);
    return NextResponse.json({ cases, pendingCount });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load security reviews.' }, { status: 500 });
  }
}
