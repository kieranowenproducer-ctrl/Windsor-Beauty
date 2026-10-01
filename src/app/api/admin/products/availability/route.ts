import { NextResponse } from 'next/server';
import { isDbConfigured, listCustomProducts, upsertCustomProduct } from '@/lib/db';
import { AVAILABILITY_STATUSES, mergeProducts, parseProductInput, PRODUCTS, type AvailabilityStatus } from '@/data/products';

export const dynamic = 'force-dynamic';

// Body: { slug: string, availability: AvailabilityStatus }
// Quick-toggle for the admin products table, mirroring the visibility toggle.
// Writes into the same custom_products.data JSONB the full product edit form
// uses, so availability still has a single source of truth.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const availability = typeof body?.availability === 'string' ? body.availability : '';
  if (!slug || !(AVAILABILITY_STATUSES as readonly string[]).includes(availability)) {
    return NextResponse.json({ error: 'Provide { slug, availability }.' }, { status: 400 });
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

  const products = mergeProducts(PRODUCTS, overrides);
  const product = products.find((p) => p.slug === slug);
  if (!product) {
    return NextResponse.json({ error: `Product "${slug}" not found.` }, { status: 404 });
  }

  const updated = {
    ...product,
    availability: availability === 'available' ? undefined : (availability as AvailabilityStatus),
  };
  const draft = parseProductInput(updated);
  if (!draft) {
    return NextResponse.json({ error: 'Could not save availability.' }, { status: 500 });
  }

  try {
    await upsertCustomProduct(draft);
    return NextResponse.json({ ok: true, slug, availability });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update availability.' },
      { status: 500 }
    );
  }
}
