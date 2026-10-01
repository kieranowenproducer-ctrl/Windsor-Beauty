import { NextResponse } from 'next/server';
import {
  createCategory,
  deleteCategory,
  isDbConfigured,
  listCategories,
  listCustomProducts,
  renameCategory,
  renameCategoryInDiscountCodes,
  renameCategoryInPromotions,
  reorderCategories,
  setCategoryEnabled,
  upsertCustomProduct,
} from '@/lib/db';
import { ALL_CATEGORIES, mergeProducts, PRODUCTS } from '@/data/products';

export const dynamic = 'force-dynamic';

const MAX_CATEGORY_LENGTH = 60;

// Counts how many products in the live (static + admin-edited) catalogue
// currently use each category, so the UI can decide what's safe to delete.
async function categoryProductCounts(): Promise<Record<string, number>> {
  const overrides = await listCustomProducts();
  const merged = mergeProducts(PRODUCTS, overrides);
  const counts: Record<string, number> = {};
  for (const product of merged) {
    for (const category of product.categories) {
      counts[category] = (counts[category] ?? 0) + 1;
    }
  }
  return counts;
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({
      categories: ALL_CATEGORIES.map((category, index) => ({
        category, enabled: true, sortOrder: index, productCount: 0,
      })),
    });
  }

  try {
    const [rows, counts] = await Promise.all([listCategories(), categoryProductCounts()]);
    const source = rows.length > 0
      ? rows
      : ALL_CATEGORIES.map((category, index) => ({ category, enabled: true, sort_order: index }));

    return NextResponse.json({
      categories: source.map(row => ({
        category: row.category,
        enabled: row.enabled,
        sortOrder: row.sort_order,
        productCount: counts[row.category] ?? 0,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load categories.' },
      { status: 500 }
    );
  }
}

// Creates a new category, ready to assign to products straight away.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > MAX_CATEGORY_LENGTH) {
    return NextResponse.json({ error: `Enter a category name (up to ${MAX_CATEGORY_LENGTH} characters).` }, { status: 400 });
  }

  try {
    const created = await createCategory(name);
    if (!created) {
      return NextResponse.json({ error: 'A category with this name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, category: name });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create category.' },
      { status: 500 }
    );
  }
}

// Renames a category everywhere it's referenced: the category_settings row
// itself, plus every product's `categories` array — both static catalogue
// entries (which get a fresh custom_products override created for them, the
// same mechanism the product editor uses) and ones already overridden.
// Without this second part the settings row would show the new name while
// every product using it silently kept the old, now-orphaned string.
async function handleRename(oldName: string, rawNewName: string) {
  const newName = rawNewName.trim();
  if (!newName || newName.length > MAX_CATEGORY_LENGTH) {
    return NextResponse.json({ error: `Enter a category name (up to ${MAX_CATEGORY_LENGTH} characters).` }, { status: 400 });
  }
  if (newName === oldName) {
    return NextResponse.json({ success: true, category: newName });
  }

  const rows = await listCategories();
  if (!rows.some(row => row.category === oldName)) {
    return NextResponse.json({ error: 'Unknown category.' }, { status: 400 });
  }

  const renamed = await renameCategory(oldName, newName);
  if (!renamed) {
    return NextResponse.json({ error: 'A category with this name already exists.' }, { status: 409 });
  }

  const overrides = await listCustomProducts();
  const merged = mergeProducts(PRODUCTS, overrides);
  const affected = merged.filter(product => product.categories.includes(oldName));

  for (const product of affected) {
    const categories = product.categories
      .map(c => (c === oldName ? newName : c))
      .filter((c, i, arr) => arr.indexOf(c) === i); // dedupe in case newName was already present
    await upsertCustomProduct({ ...product, categories });
  }

  await Promise.all([
    renameCategoryInDiscountCodes(oldName, newName),
    renameCategoryInPromotions(oldName, newName),
  ]);

  return NextResponse.json({ success: true, category: newName, productsUpdated: affected.length });
}

// Enables/disables a category in the shop's navigation and filters, or
// renames it when `newName` is provided instead of `enabled`.
export async function PATCH(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const category = typeof body?.category === 'string' ? body.category : '';
  if (!category) {
    return NextResponse.json({ error: 'Category is required.' }, { status: 400 });
  }

  try {
    if (typeof body?.newName === 'string') {
      return await handleRename(category, body.newName);
    }

    const enabled = body?.enabled === true;
    const rows = await listCategories();
    if (!rows.some(row => row.category === category)) {
      return NextResponse.json({ error: 'Unknown category.' }, { status: 400 });
    }
    await setCategoryEnabled(category, enabled);
    return NextResponse.json({ success: true, category, enabled });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update category.' },
      { status: 500 }
    );
  }
}

// Persists a full reorder of every category's display position.
export async function PUT(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const order = body?.order;
  if (!Array.isArray(order) || order.length === 0 || order.some((c: unknown) => typeof c !== 'string')) {
    return NextResponse.json({ error: 'Invalid order.' }, { status: 400 });
  }

  try {
    await reorderCategories(order as string[]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reorder categories.' },
      { status: 500 }
    );
  }
}

// Removes a category — only allowed once no products in the live catalogue
// reference it, so deleting never leaves an unresolvable category on a product.
export async function DELETE(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const category = typeof body?.category === 'string' ? body.category : '';
  if (!category) {
    return NextResponse.json({ error: 'Category is required.' }, { status: 400 });
  }

  try {
    const counts = await categoryProductCounts();
    const count = counts[category] ?? 0;
    if (count > 0) {
      return NextResponse.json(
        { error: `${count} product${count !== 1 ? 's' : ''} still use this category. Remove it from those products first.` },
        { status: 409 }
      );
    }

    const deleted = await deleteCategory(category);
    if (!deleted) {
      return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete category.' },
      { status: 500 }
    );
  }
}
