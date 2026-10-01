import { NextResponse } from 'next/server';
import {
  getLegacyProductStockMap,
  getProductStockMap,
  getProductVariantStockMap,
  listCustomProducts,
  seedProductVariantStock,
  setProductVariantStock,
  isDbConfigured,
} from '@/lib/db';
import { PRODUCTS, mergeProducts } from '@/data/products';
import { notifyBackInStock } from '@/lib/backInStockEmail';
import { afterStockMovement } from '@/lib/retireProducts';
import { reviveRetiredOnRestock } from '@/lib/retireProducts';

// New variants start with a generous default so nothing in the catalogue
// suddenly looks "out of stock" the moment stock tracking is switched on —
// staff then dial each one in to the real number from the admin panel. Only
// used for dosages that have never been tracked before; an existing
// whole-product number (from the pre-variant-stock product_stock table) is
// copied forward instead, see below.
const DEFAULT_STOCK = 100;

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  try {
    // Seed every current variant that has no row yet. A product migrating
    // from whole-product tracking gets the OLD aggregate number copied into
    // EVERY one of its dosages (not split between them — there's no way to
    // know how much of that number belonged to which dosage, so copying
    // forward is the only safe default; staff then correct each one for
    // real). A genuinely new, never-tracked product/dosage gets DEFAULT_STOCK.
    const overrides = await listCustomProducts().catch(() => ({}));
    const catalogue = mergeProducts(PRODUCTS, overrides);
    const legacyStock = await getLegacyProductStockMap().catch(() => ({} as Record<string, number>));
    const seedEntries = catalogue.flatMap((product) =>
      product.variants.map((v) => ({
        slug: product.slug,
        dosage: v.dosage,
        quantity: legacyStock[product.slug] ?? DEFAULT_STOCK,
      }))
    );
    await seedProductVariantStock(seedEntries);

    const variantStock = await getProductVariantStockMap();
    // Aggregate view, recomputed fresh now that seeding above may have just
    // added rows — kept for callers that only need a per-product total.
    const stock = await getProductStockMap();
    return NextResponse.json({ stock, variantStock });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load stock levels.' },
      { status: 500 }
    );
  }
}

// Body: { slug: string, dosage: string, quantity: number }
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.slug !== 'string' ||
    typeof body.dosage !== 'string' ||
    !body.dosage ||
    typeof body.quantity !== 'number' ||
    !Number.isFinite(body.quantity)
  ) {
    return NextResponse.json({ error: 'Provide { slug, dosage, quantity }.' }, { status: 400 });
  }
  const quantity = Math.max(0, Math.round(body.quantity));
  try {
    const previousVariantStock = await getProductVariantStockMap();
    const previousQuantity = previousVariantStock[body.slug]?.[body.dosage];
    await setProductVariantStock(body.slug, body.dosage, quantity);

    // Restocking a retired variant means it is stocked again (task 3378ea2d)
    // — full revival (dosage re-enabled, product back on the shop), or the
    // new stock would sit behind a hidden product forever.
    if (quantity > 0) {
      await reviveRetiredOnRestock(body.slug, body.dosage).catch(() => {});
    }

    // Back-in-stock alerts: only a genuine 0 → positive restock should fire
    // them. A dosage with no previous row was never tracked as out of stock
    // in the first place, so there's nothing to notify. The alert itself is
    // still per-product (not per-dosage) — a customer who signed up wants to
    // know the product is back, regardless of which dosage they were viewing.
    if (previousQuantity === 0 && quantity > 0) {
      await notifyBackInStock(body.slug).catch(() => {});
    }

    // Low-stock alert both ways: typing a low number emails sales@ (and is
    // how the alert is tested from the panel), restocking to the threshold
    // or above re-arms the alert for that variant's next drop.
    await afterStockMovement();

    return NextResponse.json({ ok: true, slug: body.slug, dosage: body.dosage, quantity });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update stock.' },
      { status: 500 }
    );
  }
}
