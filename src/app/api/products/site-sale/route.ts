import { NextResponse } from 'next/server';
import { getActivePercentagePromotion, isDbConfigured } from '@/lib/db';
import { DEFAULT_SITE_SALE, siteSaleConfigFromPromotion, type SiteSaleConfig } from '@/lib/siteSale';

export const dynamic = 'force-dynamic';

export type SiteSaleResponse = SiteSaleConfig;

// Public endpoint — the storefront reads this to know whether the
// admin-controlled automatic sale is active, and which products/categories
// it covers. The sale now lives as a percentage-type row on the
// `promotions` table (moved out of Discount Codes -> Automatic Sale
// Discounts, since it's not a customer-entered code) — see
// getActivePercentagePromotion in src/lib/db.ts. Response shape is
// unchanged so every existing consumer needs no changes.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json<SiteSaleResponse>(DEFAULT_SITE_SALE);
  }
  try {
    const promo = await getActivePercentagePromotion();
    return NextResponse.json<SiteSaleResponse>(siteSaleConfigFromPromotion(promo));
  } catch {
    return NextResponse.json<SiteSaleResponse>(DEFAULT_SITE_SALE);
  }
}
