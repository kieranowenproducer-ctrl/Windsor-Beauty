// Agent-only catalogue endpoint (v3 Stage 5/6): lets the local task-agent
// place an APPROVED product image into the correct product record, or create a
// hidden draft for a genuinely-new product — the operational step a human used
// to do by hand after approving an image.
//
// Auth: the same AGENT_TASK_SECRET bearer pattern as agent-attach. All writes
// go through the exact same lib functions the human admin editor uses
// (upsertCustomProduct / setProductHidden), so nothing here invents a second
// write path. Safety: created products are ALWAYS hidden placeholders — they
// cannot appear on the storefront until a human fills the missing fields and
// unhides them (class-E publish boundary).
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { PRODUCTS, mergeProducts, effectiveAvailability, type Product } from '@/data/products';
import { isDbConfigured, listCustomProducts, upsertCustomProduct, setProductHidden, getHiddenProductSlugs, getProductVariantStockMap } from '@/lib/db';
import { standardDeliverySentence } from '@/lib/shippingWindows';

export const dynamic = 'force-dynamic';

function authed(request: Request): boolean {
  const secret = process.env.AGENT_TASK_SECRET;
  if (!secret) return false;
  return (request.headers.get('authorization') || '') === `Bearer ${secret}`;
}

const EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Copy a transient image into the PERMANENT product Blob store so a product
// photo never depends on an ephemeral source. The bug this fixes: the approved
// image arrived as a task-attachment URL (…/tasks/agent/…), which the task
// system later cleans up — so the product image silently 404'd on the
// storefront while still looking fine in the admin. Product images already on
// our own /products/ path pass through untouched. Throws if the source cannot
// be fetched, so a broken image can never be recorded as the product photo.
async function persistProductImage(imageUrl: string): Promise<string> {
  let pathname = '';
  try { pathname = new URL(imageUrl).pathname; } catch { pathname = ''; }
  if (pathname.includes('/products/')) return imageUrl; // already permanent
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`source image not reachable (${res.status}) — refusing to record a broken product image`);
  const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  const ext = EXT_BY_TYPE[type] || 'jpg';
  const bytes = Buffer.from(await res.arrayBuffer());
  const blob = await put(`products/${crypto.randomUUID()}.${ext}`, bytes, { access: 'public', contentType: type });
  return blob.url;
}

async function catalogue(): Promise<Product[]> {
  const overrides = isDbConfigured() ? await listCustomProducts().catch(() => ({} as Record<string, Product>)) : {};
  return mergeProducts(PRODUCTS, overrides);
}

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [items, hidden, stock] = await Promise.all([
    catalogue(),
    isDbConfigured() ? getHiddenProductSlugs().catch(() => []) : [],
    // Per-dosage stock, so the concierge can quote real availability. A
    // failure here degrades to "no stock map", never to a failed catalogue.
    isDbConfigured()
      ? getProductVariantStockMap().catch(() => ({}) as Record<string, Record<string, number>>)
      : ({} as Record<string, Record<string, number>>),
  ]);
  const hiddenSet = new Set(hidden);
  return NextResponse.json({
    ok: true,
    products: items.map((p) => {
      const per = stock[p.slug] || {};
      return {
        slug: p.slug,
        name: p.name,
        dosages: p.variants.map((v) => v.dosage),
        // Stage 5: real price + availability per enabled dosage, exactly what
        // the storefront itself would show — the concierge's price/stock tool
        // answers from this rather than from a copy of the product data.
        variants: p.variants
          .filter((v) => v.enabled !== false)
          .map((v) => ({
            dosage: v.dosage,
            price: v.price,
            availability: effectiveAvailability(p, per[v.dosage]),
          })),
        image: p.image ?? null,
        variantImages: Object.fromEntries(p.variants.filter((v) => v.image).map((v) => [v.dosage, v.image])),
        hidden: hiddenSet.has(p.slug),
        isPlaceholder: Boolean(p.isPlaceholder),
      };
    }),
    // The storefront's own delivery promise, in its own words, so the
    // assistant can quote a figure that can never drift from the shipping page.
    delivery: { sentence: standardDeliverySentence() },
  });
}

export async function POST(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDbConfigured()) return NextResponse.json({ error: 'Store DB not configured' }, { status: 503 });
  const b = await request.json().catch(() => ({}));

  if (b.action === 'set_image') {
    const slug = String(b.slug ?? '');
    const rawImageUrl = String(b.imageUrl ?? '');
    const dosage = b.dosage ? String(b.dosage) : null;
    if (!slug || !/^https:\/\//.test(rawImageUrl)) return NextResponse.json({ error: 'slug and https imageUrl required' }, { status: 400 });
    const items = await catalogue();
    const product = items.find((p) => p.slug === slug);
    if (!product) return NextResponse.json({ error: `No product ${slug}` }, { status: 404 });

    // Persist into the permanent product store BEFORE recording it — a
    // transient task-attachment URL would otherwise 404 once cleaned up.
    let imageUrl: string;
    try {
      imageUrl = await persistProductImage(rawImageUrl);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'could not persist image to the product store' }, { status: 502 });
    }

    const before = { image: product.image ?? null, variantImages: product.variants.map((v) => ({ dosage: v.dosage, image: v.image ?? null })) };
    if (dosage) {
      const variant = product.variants.find((v) => v.dosage.toLowerCase().replace(/\s+/g, '') === dosage.toLowerCase().replace(/\s+/g, ''));
      if (!variant) return NextResponse.json({ error: `Product ${slug} has no ${dosage} variant (has: ${product.variants.map((v) => v.dosage).join(', ')})` }, { status: 404 });
      variant.image = imageUrl;
      // The card/grid image comes from product.image — keep it in sync when the
      // matched variant is the first (default) one, or when no card image exists.
      if (!product.image || product.variants[0] === variant) product.image = imageUrl;
    } else {
      product.image = imageUrl;
      if (product.variants.length === 1) product.variants[0].image = imageUrl;
    }
    await upsertCustomProduct(product);
    const after = { image: product.image ?? null, variantImages: product.variants.map((v) => ({ dosage: v.dosage, image: v.image ?? null })) };
    return NextResponse.json({ ok: true, slug, before, after });
  }

  if (b.action === 'create_draft') {
    const name = String(b.name ?? '').trim();
    const dosage = String(b.dosage ?? '').trim();
    let imageUrl = b.imageUrl && /^https:\/\//.test(String(b.imageUrl)) ? String(b.imageUrl) : undefined;
    if (imageUrl) {
      // Same permanence guarantee as set_image — never draft a product around a
      // task-attachment URL that will later be cleaned up.
      try { imageUrl = await persistProductImage(imageUrl); }
      catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'could not persist image to the product store' }, { status: 502 }); }
    }
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const slug = `${name} ${dosage}`.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const items = await catalogue();
    if (items.some((p) => p.slug === slug)) return NextResponse.json({ error: `Product ${slug} already exists — refusing to duplicate` }, { status: 409 });

    const draft: Product = {
      id: slug,
      name,
      slug,
      categories: [],
      purity: '99%',
      variants: [{ dosage: dosage || 'Standard', price: 0 }],
      isPlaceholder: true,
      ...(imageUrl ? { image: imageUrl } : {}),
    };
    await upsertCustomProduct(draft);
    await setProductHidden(slug, true); // NEVER publicly visible until a human completes + unhides it
    return NextResponse.json({
      ok: true, slug, hidden: true,
      missing: ['price', 'categories', 'shortDescription', 'stock — set in the Products panel, then unhide to publish'],
    });
  }

  if (b.action === 'delete_draft') {
    // Cleanup path (used by tests): only ever deletes a HIDDEN PLACEHOLDER —
    // a real product can never be removed through this endpoint.
    const slug = String(b.slug ?? '');
    const overrides = await listCustomProducts().catch(() => ({} as Record<string, Product>));
    const prod = overrides[slug];
    const hidden = new Set(await getHiddenProductSlugs().catch(() => []));
    if (!prod || !prod.isPlaceholder || !hidden.has(slug)) {
      return NextResponse.json({ error: 'Refusing: only hidden placeholder drafts can be deleted here' }, { status: 403 });
    }
    const { deleteCustomProduct, setProductHidden: unhide } = await import('@/lib/db');
    await deleteCustomProduct(slug);
    await unhide(slug, false); // remove the visibility row's effect for the now-gone slug
    return NextResponse.json({ ok: true, deleted: slug });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
