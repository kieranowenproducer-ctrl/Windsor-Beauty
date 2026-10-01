import type { MetadataRoute } from 'next';
import { categoryUrl } from '@/lib/categoryUrls';
import { liveCategories, searchableProducts } from '@/lib/shopServerData';
import { shopUrl } from '@/lib/slugAliases';
import { SITE_URL } from './robots';

/**
 * /sitemap.xml
 *
 * WHY IT IS HERE AT ALL. `robots.ts` next door points at this address, and a robots file naming a
 * sitemap that returns the app's HTML would be the same fault it was written to fix, one layer
 * along. So the two arrive together or not at all.
 *
 * WHERE THE PRODUCT LIST COMES FROM, AND WHY IT CHANGED ON 10 AUGUST 2026. It used to be the
 * static `PRODUCTS` file, on the reasoning that a file cannot be slow or fail at request time.
 * True, and wrong in both directions: the admin has hidden 31 of those 61 products and created
 * others that exist only in the database, so this file advertised pages that are not there and
 * stayed silent about pages that are. It now asks `searchableProducts()`, which is the same
 * merge-and-filter the shop pages themselves do, and which falls back to the static file if the
 * database does not answer. The blog still reads `BLOG_SEED_POSTS` directly.
 *
 * WHAT IS DELIBERATELY NOT IN IT. Everything in the disallow list in `robots.ts`: the admin, the
 * API, signed-in pages, the cart and checkout, one-time payment and verification links. A sitemap
 * is a recommendation to crawl, so it must not contradict the file that asks a crawler not to.
 */

/** The pages a stranger should be able to find, in roughly the order they matter. */
const PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/shop', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/reviews', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/promotion', priority: 0.4, changeFrequency: 'monthly' },
  /* The legal and policy pages. Low priority and genuinely worth including: they are what a
   * careful buyer checks before a first order, and they are the pages that make a shop
   * look like a real business rather than a shopfront. */
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/shipping', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/returns', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/refund-policy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/payment-policy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/disclaimer', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/contact-policy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.3, changeFrequency: 'yearly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /* The catalogue as it actually stands today: admin edits merged in, admin-created products
   * included, and the 31 hidden ones left out. See searchableProducts() for why this now asks the
   * database rather than trusting the static file, and for what it does when the answer does not
   * come back. */
  const products = await searchableProducts();

  /* The category pages, added 11 August 2026. Only categories with at least one live product in
   * them, and read from the same liveCategories() the footer links from, so a sitemap that
   * advertises a category page and a site that links to none of it cannot happen. */
  const categories = await liveCategories();

  /* ONE DATE FOR THE WHOLE FILE, and it is the honest one to use. Neither the product data nor
   * the seed posts carry a last-changed date, and inventing one per page, or stamping "now" on
   * every page on every request, tells a crawler that everything changed every time it looked,
   * which is worse than saying nothing useful. This says the catalogue was last generated today,
   * which is true. When products gain a real updated_at, use it here. */
  const generated = new Date();

  return [
    ...PAGES.map((page) => ({
      url: `${SITE_URL}${page.path}`,
      lastModified: generated,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    /* shopUrl, NOT product.slug. Two products keep an internal slug that differs from their
     * public address, and this file used to advertise the internal one: /shop/dsip-5mg was in the
     * sitemap while every link on the site pointed at /shop/dsip-10mg, and the advertised address
     * answered with a permanent redirect. One product, two addresses, and the sitemap naming the
     * one nothing links to. Settled 10 August 2026: the pretty slug is the canonical address
     * everywhere, and shopUrl is the single place that knows which is which. */
    ...products.map((product) => ({
      url: `${SITE_URL}${shopUrl(product.slug)}`,
      lastModified: generated,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    /* Below /shop and above the individual products: a category page is a better landing page
     * than the shop index for anything more specific than "skincare", and a worse one than the
     * product page for anything named. */
    ...categories.map((category) => ({
      url: `${SITE_URL}${categoryUrl(category.name)}`,
      lastModified: generated,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    })),
  ];
}
