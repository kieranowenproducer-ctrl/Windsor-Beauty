import { NextResponse } from 'next/server';
import { isDbConfigured, listCustomProducts } from '@/lib/db';
import { loadProductAccess, filterProductRecords, PRODUCT_PRIVATE_HEADERS } from '@/lib/productAccess';

export const dynamic = 'force-dynamic';

// Public endpoint — the storefront pages call this to pick up admin-created
// products and edited copies of static-catalogue listings, then merge them
// over the static PRODUCTS array with mergeProducts().
export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ overrides: {} }, { headers: PRODUCT_PRIVATE_HEADERS });
  }
  try {
    const [overrides, access] = await Promise.all([listCustomProducts(), loadProductAccess(request)]);
    return NextResponse.json({ overrides: filterProductRecords(overrides, access) }, { headers: PRODUCT_PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ overrides: {} }, { status: 503, headers: PRODUCT_PRIVATE_HEADERS });
  }
}
