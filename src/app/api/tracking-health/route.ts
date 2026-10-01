import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { getTrackingHealth } from '@/lib/db/siteVisits';

export const dynamic = 'force-dynamic';

// Public but contains no customer data. The live-site sentinel calls this to
// prove that tracking is saving real journeys, not merely that the shop opens.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ healthy: false }, { status: 503 });
  }
  try {
    const health = await getTrackingHealth();
    return NextResponse.json(
      { healthy: health.healthy, latestVisitAt: health.latestVisitAt },
      { status: health.healthy ? 200 : 503 },
    );
  } catch {
    return NextResponse.json({ healthy: false }, { status: 503 });
  }
}
