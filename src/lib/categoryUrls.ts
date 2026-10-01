/**
 * The public address of a shop category, and the one place that decides it.
 *
 * Built 11 August 2026, in the shape of slugAliases.ts next door and for the same reason: an
 * address a customer can paste, an email can carry and Google can index is a promise, and a
 * promise made in two files is a promise broken the first time somebody edits one of them.
 *
 * WHY /shop/category/<slug> AND NOT /shop/<slug>. /shop/[slug] is the product page. A product
 * slug and a category slug could one day be the same word, and the route that most needs to be
 * boring would then have to guess which of the two a request meant. One extra path segment costs
 * nothing and removes the guess entirely.
 *
 * WHY AN OVERRIDE MAP THAT IS CURRENTLY EMPTY. The rule below turns all thirteen of today's
 * category names into clean addresses with nothing left over, so nothing needs overriding yet.
 * The map exists because the rule must never be allowed to change an address that is already
 * published. When a future category name makes an ugly or colliding slug, pin it here rather than
 * touching the rule, and when a category is renamed for the shop, pin its OLD slug here so the
 * address a customer already has keeps working.
 */

/** Addresses pinned by hand: category name to slug. Once a slug is in here it never changes. */
export const CATEGORY_SLUG_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({});

/**
 * The address rule. Lowercase, "&" spelled out, and every run of anything else collapsed to one
 * hyphen, so "Sleep & Relaxation" is sleep-and-relaxation and
 * "Beauty / Healing / Repair / Recovery" is beauty-healing-repair-recovery.
 */
export function categorySlug(name: string): string {
  const pinned = CATEGORY_SLUG_OVERRIDES[name];
  if (pinned) return pinned;
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The slug read back into the category name it came from.
 *
 * Takes the list of names to search rather than a built-in one, because the admin panel can
 * create, rename and delete categories at runtime: the set that exists is whatever the database
 * says today, and a resolver holding its own copy would answer for categories that are gone and
 * 404 on ones that are new.
 */
export function categoryFromSlug(slug: string, names: readonly string[]): string | null {
  const wanted = slug.toLowerCase();
  return names.find((name) => categorySlug(name) === wanted) ?? null;
}

/** The URL to link to for a category. */
export const categoryUrl = (name: string): string => `/shop/category/${categorySlug(name)}`;
