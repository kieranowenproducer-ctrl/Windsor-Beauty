import { loadProductAccess, filterProductRecords, mayAccessProduct, productJson } from '@/lib/productAccess';
import { NextResponse } from 'next/server';
import { getHiddenProductSlugs, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public endpoint — the storefront pages call this to know which product
// slugs the admin has temporarily hidden, so they can filter them out.
export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return productJson({ hidden: [] });
  }
  try {
    const access = await loadProductAccess(request);
    const hidden = Array.from(access.rules.keys()).filter(slug => !mayAccessProduct(slug, access));
    return productJson({ hidden });
  } catch {
    return productJson({ hidden: [] });
  }
}
