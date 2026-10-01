import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { categoriesWithProducts, loadShopServerData, visibleProducts } from '@/lib/shopServerData';
import { categoryFromSlug, categorySlug, categoryUrl } from '@/lib/categoryUrls';
import { shopUrl } from '@/lib/slugAliases';
import { SITE_URL } from '../robots';
import ShopClient from './ShopClient';

/**
 * The shop index, as a search engine sees it.
 *
 * WHAT WAS WRONG. This page was a client component too, so it wore the homepage's title like
 * every product page did. Worse than the label: fetched as Googlebot on 10 August 2026 it
 * returned 31KB of HTML whose only links were stylesheets and icons. Not one link to a product.
 * The grid was drawn in the browser after two fetches, which a crawler is under no obligation to
 * wait for, so all 61 products were orphans no matter how correctly the sitemap named them.
 *
 * The filtering, sorting and searching are unchanged in ShopClient.tsx. This file owns the title
 * and description, and loads the catalogue on the server so the grid is in the HTML that goes out.
 *
 * WHY force-dynamic. Stock, prices and the sale come from the database and change during the day.
 * It also matters here for a second reason: the client reads `?category=` with useSearchParams,
 * and a statically rendered route makes Next skip server rendering everything under the nearest
 * Suspense boundary, which is the whole grid. Dynamic rendering is what lets those links exist.
 */
export const dynamic = 'force-dynamic';

const DESCRIPTION = 'Browse Windsor Glow research compounds: high-purity peptides, pre-dosed pens '
  + 'and reconstitution supplies, each supplied with a certificate of analysis. For laboratory '
  + 'research use only, not for human consumption.';

export const metadata: Metadata = {
  title: 'Research Compounds | Windsor Glow',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/shop` },
  openGraph: {
    title: 'Research Compounds | Windsor Glow',
    description: DESCRIPTION,
    type: 'website',
    url: `${SITE_URL}/shop`,
  },
};

/**
 * The shop declaring itself a list of products.
 *
 * Invisible: it changes nothing a visitor sees. What it does is let a listing page say it IS a
 * listing page, in the order it opens on, which is A to Z. Every product it names has its own
 * Product block with a real price on its own page, so nothing is claimed here that is not
 * already published there.
 */
function itemListJsonLd(products: ReturnType<typeof visibleProducts>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Research Compounds',
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: product.name,
      url: `${SITE_URL}${shopUrl(product.slug)}`,
    })),
  };
}

interface ShopPageProps {
  searchParams: Promise<{ category?: string; q?: string }>;
}

export default async function ShopPage(props: ShopPageProps) {
  const searchParams = await props.searchParams;
  const data = await loadShopServerData();
  const products = visibleProducts(data);

  /**
   * ?category= KEEPS WORKING, AND LANDS ON THE CATEGORY'S OWN PAGE.
   *
   * Until 11 August 2026 this was the only way to link to a shelf of the shop, so those links are
   * out there: in emails already sent, in messages, in anything anyone has bookmarked. They must
   * not break, and they must not become a second address for a page that now has a real one, or
   * the shop competes with itself for the same search result.
   *
   * Both the name and the slug are accepted, because a person hand-editing the address bar is as
   * likely to try one as the other. A category that does not resolve is ignored rather than
   * 404ed: it used to show the whole shop, and it still does.
   */
  const wanted = searchParams.category?.trim();
  if (wanted) {
    const names = categoriesWithProducts(products, data.categories).map((c) => c.name);
    const matched = names.find((name) => name === wanted) ?? categoryFromSlug(categorySlug(wanted), names);
    // A search typed alongside an old ?category= link goes with it, or the
    // redirect would quietly throw the search away (task 472ed443).
    const q = searchParams.q?.trim();
    if (matched) permanentRedirect(`${categoryUrl(matched)}${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  }

  return (
    <>
      <script
        type="application/ld+json"
        // Our own object, serialised. The `<` escape stops a product name containing
        // "</script>" from ending the block early. Same guard as the product page.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(itemListJsonLd(products)).replace(/</g, '\\u003c'),
        }}
      />
      <ShopClient
        initial={{
          overrides: data.overrides,
          hidden: data.hidden,
          stock: data.stock,
          variantStock: data.variantStock,
          saleConfig: data.saleConfig,
          soldCounts: data.soldCounts,
          reviewStats: data.reviewStats,
          categories: data.categories,
          isStaff: data.isStaff,
        }}
      />
    </>
  );
}
