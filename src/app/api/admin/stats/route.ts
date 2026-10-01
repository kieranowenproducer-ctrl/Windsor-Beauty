import { NextResponse } from 'next/server';
import { getStoreStats, isDbConfigured, listCustomProducts } from '@/lib/db';
import { mergeProducts, PRODUCTS, type Product } from '@/data/products';

export const dynamic = 'force-dynamic';

async function catalogueCount(): Promise<number> {
  if (!isDbConfigured()) return PRODUCTS.length;
  const overrides = await listCustomProducts().catch(() => ({} as Record<string, Product>));
  return mergeProducts(PRODUCTS, overrides).length;
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({
      dbConfigured: false,
      totalOrders: 0,
      pendingOrders: 0,
      revenue: 0,
      customerCount: 0,
      newCustomers24h: 0,
      newCustomers7d: 0,
      products: PRODUCTS.length,
    });
  }

  const [stats, products] = await Promise.all([getStoreStats(), catalogueCount()]);
  return NextResponse.json({ dbConfigured: true, ...stats, products });
}
