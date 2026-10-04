import { loadProductAccess, filterProductRecords, mayAccessProduct, productJson } from '@/lib/productAccess';
import { NextResponse } from 'next/server';
import { getProductSoldCounts, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return productJson({ soldCounts: {} });
  }
  try {
  const soldCounts = await getProductSoldCounts().catch(() => ({}));
  const access = await loadProductAccess(request);
    return productJson({ soldCounts: filterProductRecords(soldCounts, access) });
  } catch { return productJson({ soldCounts: {} }, { status: 503 }); }
}
