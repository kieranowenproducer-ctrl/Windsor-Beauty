import { NextResponse } from 'next/server';
import { getActivePercentagePromotion, isDbConfigured } from '@/lib/db';
import { DEFAULT_SITE_SALE, siteSaleConfigFromPromotion, type SiteSaleConfig } from '@/lib/siteSale';
import { loadProductAccess, mayAccessProduct, PRODUCT_PRIVATE_HEADERS } from '@/lib/productAccess';

export const dynamic = 'force-dynamic';

export type SiteSaleResponse = SiteSaleConfig;

// Public endpoint — the storefront reads this to know whether the
// admin-controlled automatic sale is active, and which products/categories
// it covers. The sale now lives as a percentage-type row on the
// `promotions` table (moved out of Discount Codes -> Automatic Sale
// Discounts, since it's not a customer-entered code) — see
// getActivePercentagePromotion in src/lib/db.ts. Response shape is
// unchanged so every existing consumer needs no changes.
export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json<SiteSaleResponse>(DEFAULT_SITE_SALE, { headers: PRODUCT_PRIVATE_HEADERS });
  }
  try {
    const promo = await getActivePercentagePromotion();
    const access = await loadProductAccess(request);
    const sale = siteSaleConfigFromPromotion(promo);
    return NextResponse.json<SiteSaleResponse>({ ...sale, scopeProductSlugs: sale.scopeProductSlugs.filter(slug => mayAccessProduct(slug, access)) }, { headers: PRODUCT_PRIVATE_HEADERS });
  } catch {
    return NextResponse.json<SiteSaleResponse>(DEFAULT_SITE_SALE, { headers: PRODUCT_PRIVATE_HEADERS });
  }
}
