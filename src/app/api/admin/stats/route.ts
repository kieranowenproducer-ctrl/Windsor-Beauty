import { NextResponse } from 'next/server';
import { isDbConfigured, listCustomProducts } from '@/lib/db';
import { readAdminDashboardStats } from '@/lib/db/adminDashboardStats';
import { hasAdminReadAccess } from '@/lib/adminReadAccess';
import { mergeProducts, PRODUCTS, type Product } from '@/data/products';

export const dynamic = 'force-dynamic';

async function catalogueCount(): Promise<number> {
  if (!isDbConfigured()) return PRODUCTS.length;
  const overrides = await listCustomProducts().catch(() => ({} as Record<string, Product>));
  return mergeProducts(PRODUCTS, overrides).length;
}

export async function GET(request: Request) {
  if (!hasAdminReadAccess(request)) return NextResponse.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'private, no-store'}});
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

  try {
    const [stats, products] = await Promise.all([readAdminDashboardStats(), catalogueCount()]);
    return NextResponse.json({ dbConfigured: true, ...stats, products },{headers:{'Cache-Control':'private, no-store'}});
  } catch {
    return NextResponse.json({error:'Could not load dashboard figures.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
  }
}
