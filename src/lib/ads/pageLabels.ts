import { isDbConfigured, requireDb } from '@/lib/db/client';
import { ALL_CATEGORIES, PRODUCTS } from '@/data/products';
import { INTERNAL_SLUG } from '@/lib/slugAliases';
import { categorySlug } from '@/lib/categoryUrls';

// The real names behind the addresses in the after-the-click tables.
//
// describePage() in pageNames.ts turns "/account/verify-email" into words on
// its own, but it cannot know that /shop/hydra-veil-serum is the Hydra Veil Serum
// or that a blog address is an article called something. Those names live in the
// catalogue and the database, so the admin read looks them up here and hands the
// finished map to the page. Only the addresses actually on screen are looked up,
// which is a dozen or so, and a failed lookup simply leaves the tidy-the-address
// fallback in place rather than breaking the report.

const NAMES_BY_SLUG = new Map(PRODUCTS.map((p) => [p.slug, p.name]));
const CATEGORY_BY_SLUG = new Map(ALL_CATEGORIES.map((c) => [categorySlug(c), c]));

/** path -> the name a person would use for that page. Missing entries are fine. */
export async function resolvePageNames(paths: Iterable<string>): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  const wanted = Array.from(new Set(Array.from(paths)));

  const productPaths = wanted.filter((p) => p.startsWith('/shop/') && !p.startsWith('/shop/category/'));
  const categoryPaths = wanted.filter((p) => p.startsWith('/shop/category/'));

  for (const path of categoryPaths) {
    const name = CATEGORY_BY_SLUG.get(path.slice('/shop/category/'.length));
    if (name) names[path] = name;
  }

  // The catalogue first: it needs no database and covers every listed product.
  const stillMissing: string[] = [];
  for (const path of productPaths) {
    const urlSlug = path.slice('/shop/'.length);
    const slug = INTERNAL_SLUG[urlSlug] ?? urlSlug;
    const name = NAMES_BY_SLUG.get(slug);
    if (name) names[path] = name;
    else stillMissing.push(slug);
  }

  if (!isDbConfigured()) return names;
  const db = requireDb();

  // Products the admin created after the catalogue was written.
  if (stillMissing.length > 0) {
    try {
      const rows = await db`SELECT slug, data FROM custom_products WHERE slug = ANY(${stillMissing})`;
      for (const row of rows as { slug: string; data: { name?: string } }[]) {
        const name = row.data?.name;
        if (!name) continue;
        for (const path of productPaths) {
          const urlSlug = path.slice('/shop/'.length);
          if ((INTERNAL_SLUG[urlSlug] ?? urlSlug) === row.slug) names[path] = name;
        }
      }
    } catch {
      // A missing table or a database hiccup leaves the tidied address showing.
    }
  }

  return names;
}
