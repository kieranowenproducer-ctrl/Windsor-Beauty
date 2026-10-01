import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { listRetiredVariants, retireVariant, unretireVariant } from '@/lib/retireProducts';

export const dynamic = 'force-dynamic';

// Retired products (task 3378ea2d + revision). Retiring takes a
// product-and-size off the shop AND off the low-stock warning — a retired
// product must never sit on the shop saying "Sold out". Un-retiring puts it
// back the way the admin chooses: sellable with real stock, or visible as
// "Coming soon" while stock is awaited.

// GET — everything currently retired, for the Products page's Retired section.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ items: [] });
  }
  try {
    const items = await listRetiredVariants();
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load retired products.' },
      { status: 500 }
    );
  }
}

// POST — body: { slug, dosage, action: 'retire' | 'restore_with_stock' | 'coming_soon', quantity? }
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (
    !body ||
    typeof body.slug !== 'string' || !body.slug ||
    typeof body.dosage !== 'string' || !body.dosage ||
    (action !== 'retire' && action !== 'restore_with_stock' && action !== 'coming_soon')
  ) {
    return NextResponse.json(
      { error: "Provide { slug, dosage, action: 'retire' | 'restore_with_stock' | 'coming_soon' }." },
      { status: 400 }
    );
  }
  if (action === 'restore_with_stock' && (typeof body.quantity !== 'number' || !Number.isFinite(body.quantity) || body.quantity < 0)) {
    return NextResponse.json({ error: 'Provide the stock number to put it back with.' }, { status: 400 });
  }

  try {
    if (action === 'retire') {
      await retireVariant(body.slug, body.dosage);
    } else {
      await unretireVariant(body.slug, body.dosage, action, action === 'restore_with_stock' ? body.quantity : undefined);
    }
    return NextResponse.json({ ok: true, slug: body.slug, dosage: body.dosage, action });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update the product.' },
      { status: 500 }
    );
  }
}
