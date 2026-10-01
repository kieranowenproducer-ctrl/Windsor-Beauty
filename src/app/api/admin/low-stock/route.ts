import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { listLowStockVariants, LOW_STOCK_THRESHOLD } from '@/lib/lowStock';

export const dynamic = 'force-dynamic';

// The dashboard's "Stock is running low" panel (task efc5cb9a). Always the
// live quantities from product_variant_stock — never the email bookkeeping —
// so a product can never hide from the dashboard because it was already
// emailed about.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ items: [], threshold: LOW_STOCK_THRESHOLD });
  }
  try {
    const items = await listLowStockVariants();
    return NextResponse.json({ items, threshold: LOW_STOCK_THRESHOLD });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load low-stock list.' },
      { status: 500 }
    );
  }
}
