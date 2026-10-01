import { NextResponse } from 'next/server';
import { isDbConfigured, listCustomProducts } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public endpoint — the storefront pages call this to pick up admin-created
// products and edited copies of static-catalogue listings, then merge them
// over the static PRODUCTS array with mergeProducts().
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ overrides: {} });
  }
  try {
    const overrides = await listCustomProducts();
    return NextResponse.json({ overrides });
  } catch {
    return NextResponse.json({ overrides: {} });
  }
}
