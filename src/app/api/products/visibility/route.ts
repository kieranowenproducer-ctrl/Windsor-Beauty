import { NextResponse } from 'next/server';
import { getHiddenProductSlugs, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public endpoint — the storefront pages call this to know which product
// slugs the admin has temporarily hidden, so they can filter them out.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ hidden: [] });
  }
  try {
    const hidden = await getHiddenProductSlugs();
    return NextResponse.json({ hidden });
  } catch {
    return NextResponse.json({ hidden: [] });
  }
}
