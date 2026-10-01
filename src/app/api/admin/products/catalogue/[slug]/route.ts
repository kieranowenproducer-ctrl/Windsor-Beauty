import { NextResponse } from 'next/server';
import { isDbConfigured, listCustomProducts, upsertCustomProduct, deleteCustomProduct, clearProductVisibility, clearProductStock, clearProductVariantStock } from '@/lib/db';
import { mergeProducts, parseProductInput, PRODUCTS } from '@/data/products';

export const dynamic = 'force-dynamic';

// Body: { product: Product } — the full product with the admin's edits applied.
// Saved as a complete override row keyed by the existing slug, so the
// storefront serves it as-is in place of the static entry. The id and slug
// are pinned to the original values — renaming either would orphan stock,
// visibility, cart and order references that are keyed by slug.
export async function PUT(request: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const draft = body?.product;
  if (!draft || typeof draft !== 'object') {
    return NextResponse.json({ error: 'Provide { product }.' }, { status: 400 });
  }

  let overrides;
  try {
    overrides = await listCustomProducts();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load catalogue.' },
      { status: 500 }
    );
  }

  const original = mergeProducts(PRODUCTS, overrides).find((p) => p.slug === params.slug);
  if (!original) {
    return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
  }

  const product = parseProductInput({ ...draft, id: original.id, slug: original.slug });
  if (!product) {
    return NextResponse.json(
      { error: 'Check the product details - some fields are missing or invalid.' },
      { status: 400 }
    );
  }

  try {
    await upsertCustomProduct(product);
    return NextResponse.json({ success: true, product });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save product.' },
      { status: 500 }
    );
  }
}

// Removes the custom_products override row for this slug. If the slug also
// exists in the static PRODUCTS array, the product reverts to that built-in
// version instead of disappearing — the admin UI warns about this distinction
// before confirming.
export async function DELETE(_request: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const isStaticProduct = PRODUCTS.some((p) => p.slug === params.slug);

  try {
    const removed = await deleteCustomProduct(params.slug);
    if (!removed && !isStaticProduct) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }
    // Only clear visibility/stock when the product is genuinely gone — a
    // reverted static product still exists in the catalogue and needs to
    // keep its current hidden/stock state.
    if (!isStaticProduct) {
      await Promise.all([clearProductVisibility(params.slug), clearProductStock(params.slug), clearProductVariantStock(params.slug)]);
    }
    return NextResponse.json({ success: true, reverted: isStaticProduct });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete product.' },
      { status: 500 }
    );
  }
}
