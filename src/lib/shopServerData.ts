import { cache } from 'react';
import { cookies } from 'next/headers';
import {
  ALL_CATEGORIES, DEFAULT_STORAGE_INSTRUCTIONS_HTML, PRODUCTS, mergeProducts, type Product,
} from '@/data/products';
import { DEFAULT_SITE_SALE, siteSaleConfigFromPromotion, type SiteSaleConfig } from '@/lib/siteSale';
import { categorySlug } from '@/lib/categoryUrls';
import { PRETTY_SLUG, shopUrl } from '@/lib/slugAliases';
import {
  getActivePercentagePromotion, getHiddenProductSlugs, getProductSoldCounts, getProductStockMap,
  getProductVariantStockMap, getReviewStatsForProducts, getSiteContent, isDbConfigured,
  listCategories, listCustomProducts,
} from '@/lib/db';

/**
 * Everything the shop pages used to fetch from the browser, read on the server instead.
 *
 * WHY THIS FILE EXISTS, AND IT IS NOT ABOUT SPEED. Both shop pages rendered nothing at all until
 * `/api/products/catalogue` came back, because an admin-created product does not exist in the
 * static catalogue and would otherwise flash as "not found" or, worse, render stale dosages and
 * prices before snapping to the real ones. That gate was the right call for a browser. It was
 * also the reason a search engine saw a spinner: an effect does not run on the server, so the
 * HTML that went out was the loading state, on all 61 product pages and on /shop.
 *
 * Seeding the same values from the server lets the gate open on the first render instead of the
 * second, which puts the real page in the HTML without changing a line of what that page draws.
 *
 * WHY ALL OF IT AND NOT JUST THE CATALOGUE. Opening the gate early with the rest still missing
 * would be worse than leaving it shut: the page would paint a full price and then a sale price, a
 * blank stock state and then "Out of Stock", and for a few hundred milliseconds a customer could
 * put a sold-out dosage in their basket. So everything the first render reads is seeded, and the
 * client keeps every one of its fetches, which now confirm what is already on screen rather than
 * supplying it.
 *
 * WHAT HAPPENS WHEN THE DATABASE IS AWAY. Every field falls back to exactly what the browser
 * fetch falls back to today, because each public route already answers with a safe default rather
 * than an error. `catalogue` falls back to the static PRODUCTS, which is what the page rendered
 * before any of this existed. Nothing here can make the shop fail to render.
 */
export interface ShopServerData {
  /**
   * The admin's edits and admin-created products, exactly as `/api/products/catalogue` returns
   * them. Handed to the client pages raw rather than merged, so that the merge happens in one
   * place, in their own code, and the server and the browser cannot disagree about the result.
   */
  overrides: Record<string, Product>;
  /** The same thing merged over the static catalogue, for the server's own reading. */
  catalogue: Product[];
  /** Admin-hidden slugs. Treated exactly as "does not exist", direct links included. */
  hidden: string[];
  stock: Record<string, number>;
  variantStock: Record<string, Record<string, number>>;
  saleConfig: SiteSaleConfig;
  storageDefaults: { enabled: boolean; content: string; format: 'html' | 'markdown' };
  soldCounts: Record<string, number>;
  reviewStats: Record<string, { average: number; count: number }>;
  categories: string[];
  /** Admin-only chrome: stock and price editors. Mirrors isStaffView() in lib/staffView.ts. */
  isStaff: boolean;
  /** Member pricing. Mirrors isMemberView() in lib/staffView.ts. */
  isMember: boolean;
}

const FALLBACK: Omit<ShopServerData, 'isStaff' | 'isMember'> = {
  overrides: {},
  catalogue: PRODUCTS,
  hidden: [],
  stock: {},
  variantStock: {},
  saleConfig: DEFAULT_SITE_SALE,
  storageDefaults: { enabled: true, content: DEFAULT_STORAGE_INSTRUCTIONS_HTML, format: 'html' },
  soldCounts: {},
  reviewStats: {},
  categories: [...ALL_CATEGORIES],
};

/** Each read guarded on its own, so one slow or missing table cannot blank the whole shop. */
const safely = <T>(read: () => Promise<T>, fallback: T): Promise<T> => read().catch(() => fallback);

function parseStorageDefaults(body: string | null | undefined): ShopServerData['storageDefaults'] {
  if (!body) return FALLBACK.storageDefaults;
  try {
    const parsed = JSON.parse(body);
    const hasSaved = typeof parsed?.content === 'string' && parsed.content;
    return {
      enabled: parsed?.enabled !== false,
      content: hasSaved ? parsed.content : DEFAULT_STORAGE_INSTRUCTIONS_HTML,
      /* Force 'html' on the built-in default: it is always real HTML whatever format a missing
       * saved value claimed. Same reasoning as the route this mirrors. */
      format: hasSaved && parsed?.format === 'markdown' ? 'markdown' : 'html',
    };
  } catch {
    return FALLBACK.storageDefaults;
  }
}

/**
 * The two cookie reads, done server-side.
 *
 * The middleware sets a NON-httpOnly `wg_ui_session` hint precisely so the storefront can read
 * it, and this reads the same one from the same request. It is a hint and nothing more: it opens
 * no door on its own, every admin write is still checked against the real httpOnly session, and
 * getting it wrong shows the wrong price, not the wrong data.
 *
 * Kept equal to isStaffView()/isMemberView() in lib/staffView.ts by hand, because that file reads
 * `document.cookie` and cannot run here.
 */
async function viewerFromCookies(): Promise<{ isStaff: boolean; isMember: boolean }> {
  const jar = await cookies();
  const session = jar.get('wg_ui_session')?.value;
  const previewRaw = jar.get('wg_view_as')?.value;
  const preview = previewRaw === 'member' || previewRaw === 'guest' ? previewRaw : 'admin';
  const hasStaffSession = session === 'staff';
  return {
    isStaff: hasStaffSession && preview === 'admin',
    isMember: hasStaffSession ? preview !== 'guest' : session === 'member' || session === 'staff',
  };
}

/**
 * Wrapped in React's `cache` because every page here calls it twice: once from `generateMetadata`
 * and once from the component. Without this each request would run the nine reads twice and, far
 * worse, could describe a product in its title using one snapshot and price it in its structured
 * data using another.
 */
export const loadShopServerData = cache(async (): Promise<ShopServerData> => {
  const viewer = await viewerFromCookies();
  if (!isDbConfigured()) return { ...FALLBACK, ...viewer };

  const [overrides, hidden, stock, variantStock, promo, storage, soldCounts, reviewStats, categoryRows] =
    await Promise.all([
      safely(listCustomProducts, {} as Record<string, Product>),
      safely(getHiddenProductSlugs, [] as string[]),
      safely(getProductStockMap, {} as Record<string, number>),
      safely(getProductVariantStockMap, {} as Record<string, Record<string, number>>),
      safely(getActivePercentagePromotion, null),
      safely(() => getSiteContent('storage-instructions-default'), null),
      safely(getProductSoldCounts, {} as Record<string, number>),
      safely(getReviewStatsForProducts, {} as Record<string, { average: number; count: number }>),
      safely(listCategories, [] as Awaited<ReturnType<typeof listCategories>>),
    ]);

  const enabled = categoryRows.filter((row) => row.enabled).map((row) => row.category);

  return {
    overrides,
    catalogue: mergeProducts(PRODUCTS, overrides),
    hidden,
    stock,
    variantStock,
    saleConfig: siteSaleConfigFromPromotion(promo),
    storageDefaults: parseStorageDefaults(storage?.body),
    soldCounts,
    reviewStats,
    categories: enabled.length > 0 ? enabled : [...ALL_CATEGORIES],
    ...viewer,
  };
});

/**
 * The one product a /shop/[slug] request is about, or null when there is nothing to show.
 *
 * Resolves a pretty URL back to its internal slug, and treats an admin-hidden product exactly as
 * a missing one, which is what the page did in the browser and what a direct link has to keep
 * doing. A hidden product that reached this far would otherwise be handed a title, a price and a
 * structured-data block, which is a louder way of publishing it than the shop grid ever was.
 */
export function productForSlug(data: ShopServerData, urlSlug: string): Product | null {
  const internal = Object.entries(PRETTY_SLUG).find(([, pretty]) => pretty === urlSlug)?.[0] ?? urlSlug;
  const product = data.catalogue.find((p) => p.slug === internal);
  if (!product || data.hidden.includes(product.slug)) return null;
  return product;
}

/** The products a stranger should see on /shop, in the order the page opens on (A to Z). */
export function visibleProducts(data: ShopServerData): Product[] {
  return data.catalogue
    .filter((p) => !data.hidden.includes(p.slug))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The products a sitemap may name, read without touching cookies.
 *
 * SEPARATE FROM loadShopServerData FOR ONE REASON: that function reads the request's cookies to
 * decide staff and member pricing, and a sitemap has no visitor. It is also the only reader that
 * cares what the answer is when the database is unreachable.
 *
 * WHY THE SITEMAP HAS TO ASK AT ALL. It was built from the static file alone, which is 61
 * products. The admin has hidden 31 of them and created others that exist only in the database,
 * so the file it trusted was wrong in both directions: it advertised pages that are gone and
 * stayed silent about pages that are live. That did no visible harm while every shop URL answered
 * 200 with the homepage's title; now that a hidden product properly answers 404, a sitemap naming
 * it is a crawl error reported back in Search Console.
 *
 * WHEN THE READ FAILS it falls back to the whole static catalogue, which is what this file did
 * before. Listing a page that turns out to be hidden is a smaller fault than dropping fifty real
 * products from search because one query timed out.
 */
export async function searchableProducts(): Promise<Product[]> {
  if (!isDbConfigured()) return PRODUCTS;
  const [overrides, hidden] = await Promise.all([
    safely(listCustomProducts, null),
    safely(getHiddenProductSlugs, null),
  ]);
  if (!overrides || !hidden) return PRODUCTS;
  return mergeProducts(PRODUCTS, overrides).filter((p) => !hidden.includes(p.slug));
}

/** The public address of a product, absolute, for canonicals and structured data. */
export const absoluteShopUrl = (siteUrl: string, slug: string): string => `${siteUrl}${shopUrl(slug)}`;

/* ── Categories that are worth an address ──────────────────────────────────────────────────── */

export interface LiveCategory {
  /** Exactly as the shop already labels it. Never reworded. */
  name: string;
  slug: string;
  /** Live products in it. Never zero: an empty category does not get a page. */
  count: number;
}

/**
 * Which categories have something in them, given a set of products already filtered to the ones
 * a stranger can see.
 *
 * PURE, AND THAT IS THE POINT. Three callers need this answer and they must never disagree: the
 * footer decides what to link, the sitemap decides what to advertise, and the category page
 * decides whether to exist at all. A category the footer links and the page 404s is a broken link
 * on every page of the site; a category the sitemap names and nothing links to is a crawl error.
 * One function, three callers, no second opinion.
 *
 * ORDER is the admin's own category order, taken from `enabled`, so the footer column reads the
 * same way the dropdown does. A category that is switched off in the admin panel gets no page,
 * because the admin switching it off is the shop saying it should not be browsable.
 */
export function categoriesWithProducts(products: Product[], enabled: readonly string[]): LiveCategory[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    for (const category of product.categories) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return enabled
    .map((name) => ({ name, slug: categorySlug(name), count: counts.get(name) ?? 0 }))
    .filter((c) => c.count > 0);
}

/**
 * The same answer for readers that have no visitor: the footer and the sitemap.
 *
 * Kept apart from loadShopServerData for the reason searchableProducts is: that function reads
 * the request's cookies for staff and member pricing, and neither of these two callers has a
 * request to read. `cache` dedupes it within one render, because the footer is on every page.
 *
 * WHEN THE DATABASE IS AWAY it falls back to the static seed list, which is the same fallback the
 * shop's own dropdown uses. Listing a category that turns out to be empty is a smaller fault than
 * a footer column vanishing from every page of the site because one query timed out.
 */
export const liveCategories = cache(async (): Promise<LiveCategory[]> => {
  if (!isDbConfigured()) return categoriesWithProducts(PRODUCTS, ALL_CATEGORIES);
  const [products, rows] = await Promise.all([
    searchableProducts(),
    safely(listCategories, [] as Awaited<ReturnType<typeof listCategories>>),
  ]);
  const enabled = rows.filter((row) => row.enabled).map((row) => row.category);
  return categoriesWithProducts(products, enabled.length > 0 ? enabled : [...ALL_CATEGORIES]);
});
