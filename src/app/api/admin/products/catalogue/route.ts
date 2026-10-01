import { NextResponse } from 'next/server';
import { isDbConfigured, listCustomProducts, listCustomProductsUpdatedAt, upsertCustomProduct } from '@/lib/db';
import { mergeProducts, parseProductInput, PRODUCTS, type Product } from '@/data/products';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ overrides: {}, updatedAt: {} });
  }
  try {
    const [overrides, updatedAt] = await Promise.all([listCustomProducts(), listCustomProductsUpdatedAt()]);
    return NextResponse.json({ overrides, updatedAt });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load catalogue.' },
      { status: 500 }
    );
  }
}

// Body: { product: Omit<Product, 'id'> } — creates a brand new listing.
// The id is generated server-side (next free number after the highest in the
// merged catalogue) so admin-created products keep sorting correctly anywhere
// the storefront compares ids numerically (e.g. the "Newest" sort on /shop).
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const draft = body?.product;
  if (!draft || typeof draft !== 'object') {
    return NextResponse.json({ error: 'Provide { product }.' }, { status: 400 });
  }

  let overrides: Record<string, Product>;
  try {
    overrides = await listCustomProducts();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load catalogue.' },
      { status: 500 }
    );
  }

  const merged = mergeProducts(PRODUCTS, overrides);
  const slug = typeof (draft as { slug?: unknown }).slug === 'string'
    ? (draft as { slug: string }).slug.trim().toLowerCase()
    : '';
  if (slug && merged.some((p) => p.slug === slug)) {
    return NextResponse.json(
      { error: `A product with the slug "${slug}" already exists — choose a different one.` },
      { status: 409 }
    );
  }

  const nextId = String(Math.max(0, ...merged.map((p) => Number(p.id) || 0)) + 1);
  const product = parseProductInput({ ...draft, id: nextId });
  if (!product) {
    return NextResponse.json(
      { error: 'Check the product details — some fields are missing or invalid.' },
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
