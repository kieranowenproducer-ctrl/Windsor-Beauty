import { loadProductAccess, filterProductRecords, mayAccessProduct, productJson } from '@/lib/productAccess';
import { NextResponse } from 'next/server';
import { getProductStockMap, getProductVariantStockMap, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public endpoint — storefront pages call this to know live stock levels so
// they can show "Out of Stock" and stop customers adding depleted items to
// their basket. `stock` is the per-product aggregate (a slug with no entry
// is untracked and treated as unlimited); `variantStock` is the per-dosage
// breakdown the product detail page uses so one dosage selling out doesn't
// affect the others.
export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return productJson({ stock: {}, variantStock: {} });
  }
  try {
    const [stock, variantStock] = await Promise.all([getProductStockMap(), getProductVariantStockMap()]);
    const access = await loadProductAccess(request);
    return productJson({ stock: filterProductRecords(stock, access), variantStock: filterProductRecords(variantStock, access) });
  } catch {
    return productJson({ stock: {}, variantStock: {} });
  }
}
