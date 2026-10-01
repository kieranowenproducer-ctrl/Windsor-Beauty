// Bulk supplier purchases (task 66a6a137 revision).
// GET  -> all recorded purchases (newest first).
// POST -> record one { supplier, purchaseDate, shippingCost, updateInventory, lines:[{slug,dosage,qty,blockCost}] }.
//         Recording a purchase also folds its costs into each product's cost basis
//         (raw = blockCost/qty; shipping allocated evenly per unit across the order).
// Protected by the /api/admin middleware guard.
import { NextResponse } from 'next/server';
import { isDbConfigured, listSupplierPurchases, recordSupplierPurchase, deleteSupplierPurchase } from '@/lib/db';
import { notifyBackInStock } from '@/lib/backInStockEmail';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  try {
    return NextResponse.json({ purchases: await listSupplierPurchases() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load purchases.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!lines.some((l: { slug?: unknown; qty?: unknown }) => l?.slug && Number(l?.qty) > 0)) {
    return NextResponse.json({ error: 'Add at least one product line with a quantity.' }, { status: 400 });
  }
  try {
    const result = await recordSupplierPurchase({
      supplier: typeof body.supplier === 'string' ? body.supplier : '',
      purchaseDate: typeof body.purchaseDate === 'string' && body.purchaseDate ? body.purchaseDate : null,
      shippingCost: Number(body.shippingCost) || 0,
      adhocCost: Number(body.adhocCost) || 0,
      updateInventory: body.updateInventory === true,
      lines,
    });
    if (!result) {
      return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
    }
    // A purchase that took a product from 0 to in-stock is a restock — fire
    // the same back-in-stock alerts the stock editor fires (task c9aa1323).
    for (const slug of result.restockedProductSlugs) {
      await notifyBackInStock(slug).catch(() => {});
    }
    const addedToStock = body.updateInventory === true
      ? lines.reduce((s: number, l: { qty?: unknown }) => s + Math.max(0, Math.floor(Number(l?.qty) || 0)), 0)
      : 0;
    return NextResponse.json({ purchase: result.purchase, addedToStock });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to record purchase.' }, { status: 500 });
  }
}

// Remove a mis-entered bulk purchase. Note: this deletes the purchase record only;
// it does not revert the cost basis it set (edit the product's raw cost on the page
// if needed). ?id=<n>
export async function DELETE(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  try {
    await deleteSupplierPurchase(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to delete purchase.' }, { status: 500 });
  }
}
