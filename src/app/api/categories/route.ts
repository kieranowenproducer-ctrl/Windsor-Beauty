import { NextResponse } from 'next/server';
import { isDbConfigured, listCategories } from '@/lib/db';
import { ALL_CATEGORIES } from '@/data/products';

export const dynamic = 'force-dynamic';

// Public endpoint — returns the catalogue categories that are currently
// enabled, in admin-defined order, so the storefront nav and shop filters
// can hide disabled ones and reflect admin-created categories.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ categories: ALL_CATEGORIES });
  }

  try {
    const rows = await listCategories();
    const categories = rows.length > 0
      ? rows.filter(row => row.enabled).map(row => row.category)
      : [...ALL_CATEGORIES];
    return NextResponse.json({ categories });
  } catch {
    // Fall back to showing every category rather than breaking the storefront
    // nav/shop filters if category_settings hasn't been created yet.
    return NextResponse.json({ categories: ALL_CATEGORIES });
  }
}
