import { NextResponse } from 'next/server';
import { countPendingReviews, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

// One number, read on every admin page load by the sidebar badge and by the
// dashboard banner. Deliberately its own endpoint rather than a field on
// /api/admin/stats: that one totals every order and merges the whole catalogue,
// which is far too much work to repeat on every page just to draw a badge.
export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ pending: 0 });
  try {
    return NextResponse.json({ pending: await countPendingReviews() });
  } catch {
    // A badge is not worth an error state. Nothing shown is the same as nothing waiting.
    return NextResponse.json({ pending: 0 });
  }
}
