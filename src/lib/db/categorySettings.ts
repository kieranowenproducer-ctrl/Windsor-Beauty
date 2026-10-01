import { requireDb } from './client';
// Extracted verbatim from db.ts on 2026-08-11 (Phase 2 of "thin it out").
// Everything here is re-exported from '@/lib/db', so no call site changed.

// ─── Category settings ──────────────────────────────────────────────────────

// Categories with no row are treated as enabled, so the map only needs to be
// consulted for explicit `false` values.
export async function getCategorySettings(): Promise<Record<string, boolean>> {
  const db = requireDb();
  const rows = await db`SELECT category, enabled FROM category_settings`;
  const map: Record<string, boolean> = {};
  for (const row of rows as { category: string; enabled: boolean }[]) {
    map[row.category] = row.enabled;
  }
  return map;
}

export async function setCategoryEnabled(category: string, enabled: boolean): Promise<void> {
  const db = requireDb();
  await db`
    INSERT INTO category_settings (category, enabled, updated_at)
    VALUES (${category}, ${enabled}, now())
    ON CONFLICT (category) DO UPDATE SET enabled = ${enabled}, updated_at = now()
  `;
}

export interface CategoryRow {
  category: string;
  enabled: boolean;
  sort_order: number;
}

// All catalogue categories in display order, including ones the admin has
// created beyond the original seed list.
export async function listCategories(): Promise<CategoryRow[]> {
  const db = requireDb();
  const rows = await db`SELECT category, enabled, sort_order FROM category_settings ORDER BY sort_order ASC, category ASC`;
  return rows as CategoryRow[];
}

// Adds a brand new category at the end of the display order. Returns false if
// a category with this name (case-insensitive) already exists.
export async function createCategory(name: string): Promise<boolean> {
  const db = requireDb();
  const existing = await db`SELECT category FROM category_settings WHERE lower(category) = lower(${name})`;
  if (existing.length > 0) return false;
  const maxRow = await db`SELECT COALESCE(MAX(sort_order), -1) AS max FROM category_settings`;
  const nextOrder = Number(maxRow[0].max) + 1;
  await db`INSERT INTO category_settings (category, enabled, sort_order, updated_at) VALUES (${name}, TRUE, ${nextOrder}, now())`;
  return true;
}

// Renames a category's row in place (sort_order, enabled state, and product
// assignments via category_settings's primary key all carry over naturally
// since this is an UPDATE, not a delete+recreate). Returns false if the old
// name doesn't exist or the new name (case-insensitive) is already taken by
// a different category. Caller is responsible for propagating the rename
// into every product's `categories` array — this only touches the settings row.
export async function renameCategory(oldName: string, newName: string): Promise<boolean> {
  const db = requireDb();
  const clash = await db`
    SELECT category FROM category_settings WHERE lower(category) = lower(${newName}) AND category != ${oldName}
  `;
  if (clash.length > 0) return false;
  const rows = await db`
    UPDATE category_settings SET category = ${newName}, updated_at = now() WHERE category = ${oldName} RETURNING category
  `;
  return rows.length > 0;
}

// Category names are also stored independently inside discount_codes.scope_categories
// and promotions.discount_scope_categories — without these, a rename would
// leave any category-scoped discount/promotion silently matching nothing,
// since they compare against the literal old string. Both fetch-filter-rewrite
// in JS rather than raw JSONB array surgery in SQL, since these tables are
// small and this only ever runs on the rare admin rename action.
export async function renameCategoryInDiscountCodes(oldName: string, newName: string): Promise<void> {
  const db = requireDb();
  const rows = await db`SELECT id, scope_categories FROM discount_codes WHERE scope_type = 'category'`;
  for (const row of rows as { id: number; scope_categories: unknown }[]) {
    const categories = Array.isArray(row.scope_categories) ? row.scope_categories as string[] : [];
    if (!categories.includes(oldName)) continue;
    const updated = categories.map((c) => (c === oldName ? newName : c)).filter((c, i, arr) => arr.indexOf(c) === i);
    await db`UPDATE discount_codes SET scope_categories = ${JSON.stringify(updated)} WHERE id = ${row.id}`;
  }
}

export async function renameCategoryInPromotions(oldName: string, newName: string): Promise<void> {
  const db = requireDb();
  const rows = await db`SELECT id, discount_scope_categories FROM promotions WHERE discount_scope_type = 'category'`;
  for (const row of rows as { id: number; discount_scope_categories: unknown }[]) {
    const categories = Array.isArray(row.discount_scope_categories) ? row.discount_scope_categories as string[] : [];
    if (!categories.includes(oldName)) continue;
    const updated = categories.map((c) => (c === oldName ? newName : c)).filter((c, i, arr) => arr.indexOf(c) === i);
    await db`UPDATE promotions SET discount_scope_categories = ${JSON.stringify(updated)} WHERE id = ${row.id}`;
  }
}

// Deletes a category row outright. Caller is responsible for confirming no
// products reference it first.
export async function deleteCategory(category: string): Promise<boolean> {
  const db = requireDb();
  const rows = await db`DELETE FROM category_settings WHERE category = ${category} RETURNING category`;
  return rows.length > 0;
}

// Persists a full reorder — `order` is every category name in its new display order.
export async function reorderCategories(order: string[]): Promise<void> {
  const db = requireDb();
  for (let i = 0; i < order.length; i++) {
    await db`UPDATE category_settings SET sort_order = ${i}, updated_at = now() WHERE category = ${order[i]}`;
  }
}
