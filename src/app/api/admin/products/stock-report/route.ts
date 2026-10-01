import { NextResponse } from 'next/server';
import {
  getHiddenProductSlugs,
  getProductSoldCounts,
  getProductVariantStockMap,
  getProductVariantStockUpdatedAtMap,
  isDbConfigured,
  listCustomProducts,
} from '@/lib/db';
import { PRODUCTS, mergeProducts } from '@/data/products';

export const dynamic = 'force-dynamic';

// One row per size/variant — not per product — so the report shows
// exactly what's trackable in the admin panel: Retatrutide 5mg/10mg/30mg
// each get their own row with their own stock number.
export interface StockReportRow {
  id: string;
  name: string;
  slug: string;
  dosage: string;
  category: string;
  price: number | null;
  stock: number | null;
  status: 'enabled' | 'disabled';
  updatedAt: string | null;
  /** Total units of this PRODUCT ever sold across paid+ orders (per slug, not per dosage). Lets the Profitability tab keep products with sales history even if now disabled. */
  sold: number;
}

// Always reads fresh from the database on every call — no caching layer to
// invalidate, so the report reflects whatever was true the instant it was
// requested, regardless of enable/disable toggles, stock edits, or newly
// added/removed products since the page was first loaded.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  try {
    const [hiddenSlugs, variantStockMap, variantUpdatedAtMap, overrides, soldCounts] = await Promise.all([
      getHiddenProductSlugs(),
      getProductVariantStockMap(),
      getProductVariantStockUpdatedAtMap(),
      listCustomProducts(),
      getProductSoldCounts(),
    ]);
    const hidden = new Set(hiddenSlugs);
    const products = mergeProducts(PRODUCTS, overrides);

    const rows: StockReportRow[] = products.flatMap((product) =>
      product.variants.map((v) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        dosage: v.dosage,
        category: product.categories.join(', '),
        price: v.price > 0 ? v.price : null,
        stock: variantStockMap[product.slug]?.[v.dosage] ?? null,
        status: hidden.has(product.slug) ? 'disabled' : 'enabled',
        updatedAt: variantUpdatedAtMap[`${product.slug}::${v.dosage}`] ?? null,
        sold: soldCounts[product.slug] ?? 0,
      }))
    );

    rows.sort((a, b) => a.name.localeCompare(b.name) || a.dosage.localeCompare(b.dosage));

    return NextResponse.json({ generatedAt: new Date().toISOString(), rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build stock report.' },
      { status: 500 }
    );
  }
}
