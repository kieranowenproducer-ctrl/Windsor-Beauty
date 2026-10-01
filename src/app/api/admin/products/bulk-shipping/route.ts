import { NextResponse } from 'next/server';
import { isDbConfigured, listCustomProducts, upsertCustomProduct } from '@/lib/db';
import { detectProductFormat, mergeProducts, parseProductInput, parseShippingInput, PRODUCTS, type Category, type ProductShipping } from '@/data/products';

export const dynamic = 'force-dynamic';

// Flattened (slug, dosage) row for the Bulk Shipping Weights admin tool.
interface BulkShippingRow {
  slug: string;
  productName: string;
  dosage: string;
  categories: Category[];
  format: 'pen' | 'vial';
  shipping?: ProductShipping;
  productShipping?: ProductShipping;
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
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
  const rows: BulkShippingRow[] = products.flatMap((p) => {
    const format = detectProductFormat(p);
    return p.variants.map((v) => ({
      slug: p.slug,
      productName: p.name,
      dosage: v.dosage,
      categories: p.categories,
      format,
      shipping: v.shipping,
      productShipping: p.shipping,
    }));
  });

  return NextResponse.json({ rows });
}

// Body: { updates: [{ slug, dosage, shipping: Partial<ProductShipping-ish> }] }
// Each update is merged into the matching variant's existing shipping block
// (only the supplied keys are overwritten) — never a full replacement, so
// other variant-specific shipping/customs data set elsewhere is preserved.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const updates = Array.isArray(body?.updates) ? body.updates : null;
  if (!updates || updates.length === 0) {
    return NextResponse.json({ error: 'Provide { updates: [...] }.' }, { status: 400 });
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

  // Group updates by product slug so each product is only re-saved once.
  const bySlug = new Map<string, { dosage: string; shipping: unknown }[]>();
  for (const update of updates) {
    if (!update || typeof update !== 'object') continue;
    const slug = typeof update.slug === 'string' ? update.slug : '';
    const dosage = typeof update.dosage === 'string' ? update.dosage : '';
    if (!slug || !dosage) continue;
    const list = bySlug.get(slug) ?? [];
    list.push({ dosage, shipping: update.shipping });
    bySlug.set(slug, list);
  }

  const updatedSlugs: string[] = [];
  const errors: string[] = [];

  for (const [slug, variantUpdates] of Array.from(bySlug.entries())) {
    const product = products.find((p) => p.slug === slug);
    if (!product) {
      errors.push(`Product "${slug}" not found.`);
      continue;
    }

    let invalid = false;
    const variants = product.variants.map((v) => {
      const update = variantUpdates.find((u) => u.dosage === v.dosage);
      if (!update) return v;
      const parsed = parseShippingInput(update.shipping);
      if (parsed === null) {
        invalid = true;
        return v;
      }
      const merged = { ...v.shipping, ...parsed };
      return { ...v, shipping: Object.keys(merged).length > 0 ? merged : undefined };
    });

    if (invalid) {
      errors.push(`Invalid shipping data for "${product.name}".`);
      continue;
    }

    const draft = parseProductInput({ ...product, variants });
    if (!draft) {
      errors.push(`Could not save shipping data for "${product.name}".`);
      continue;
    }

    try {
      await upsertCustomProduct(draft);
      updatedSlugs.push(slug);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `Failed to save "${product.name}".`);
    }
  }

  return NextResponse.json({ success: errors.length === 0, updated: updatedSlugs, errors });
}
