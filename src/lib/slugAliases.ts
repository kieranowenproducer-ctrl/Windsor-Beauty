// Customer-facing "pretty" URL slugs.
//
// Some products keep an internal slug we don't want shown in the address bar
// (e.g. an old product name). The internal slug stays the source of truth for
// the catalogue, stock, visibility and order references — we only swap what the
// customer SEES in the URL. Add a pair here to rename a product's public URL
// without touching any data.
export const PRETTY_SLUG: Record<string, string> = {
  'super-human-blend': 'up389',
  // The live 10mg product still uses the older internal "dsip-5mg" key.
  // Keep that key for stock and orders, but show the correct strength publicly.
  'dsip-5mg': 'dsip-10mg',
};
// reverse lookup: pretty URL slug -> internal slug
export const INTERNAL_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(PRETTY_SLUG).map(([internal, pretty]) => [pretty, internal]),
);
/** The URL to link to for a product, given its internal slug. */
export const shopUrl = (slug: string): string => `/shop/${PRETTY_SLUG[slug] ?? slug}`;
