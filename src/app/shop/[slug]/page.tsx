import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { activeVariants, cardImage, dosageSoldOut, type Product } from '@/data/products';
import { shopUrl } from '@/lib/slugAliases';
import { loadShopServerData, productForSlug } from '@/lib/shopServerData';
import { SITE_URL } from '../../robots';
import ProductPageClient from './ProductPageClient';

/**
 * One product, as a search engine sees it.
 *
 * WHY THIS FILE IS A SERVER COMPONENT AND THE PAGE ITSELF IS NEXT DOOR. Until 10 August 2026 the
 * whole page began with `'use client'`, and a client component cannot export `generateMetadata`.
 * So Next fell back to the root layout for every one of the 61 products: /shop/aod-9604 and
 * /shop/bpc-157 were both titled "Windsor Glow | Premium Research Compounds" and both carried the
 * homepage's description. Nothing on either page said which product it was about. There was no
 * h1, no canonical, no price, no structured data. The shop was discoverable and illegible, which
 * is the worse half of the pair, because it looks fine from inside a browser.
 *
 * The interactive page is unchanged and now lives in ProductPageClient.tsx. This file adds the
 * three things only a server can say: the metadata, the structured data, and the fact that the
 * page's data is already loaded when it renders.
 *
 * WHY force-dynamic. The catalogue, the stock and the sale are database-backed and an admin
 * changes them during the day; a page cached at build time would advertise last week's price in
 * its structured data. Same call the blog already makes, for the same reason.
 */
export const dynamic = 'force-dynamic';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * The sentence a search result shows under the title.
 *
 * COMPLIANCE. Every word here is the shop's own existing copy: `shortDescription` is what the
 * product page already displays, and the tail repeats only what the compliance banner and the
 * spec block already say. NOTHING is generated about what a compound does. A meta description is
 * customer-facing text and the same boundary applies to it as to the page, so this composes
 * approved sentences and never writes a new claim. If a product ever arrives with no description
 * at all, the fallback names it and stops.
 */
function describe(product: Product): string {
  const own = (product.shortDescription ?? '').trim()
    || (product.fullDescription ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split('. ')[0];
  const purity = product.purity ? `${product.purity} purity. ` : '';
  const opening = own ? `${own.replace(/\.?$/, '.')} ` : `${product.name} from Windsor Glow. `;
  return `${opening}${purity}Supplied for laboratory research use only, not for human consumption, `
    + 'with a certificate of analysis.';
}

function imageUrl(product: Product): string {
  const image = cardImage(product) ?? product.image ?? `/images/products/${product.slug}.jpg`;
  return image.startsWith('http') ? image : `${SITE_URL}${image}`;
}

export async function generateMetadata(props: ProductPageProps): Promise<Metadata> {
  const params = await props.params;
  const data = await loadShopServerData();
  const product = productForSlug(data, params.slug);
  if (!product) return { title: 'Product Not Found | Windsor Glow' };

  const description = describe(product);
  /* The PRETTY slug is the canonical address, settled 10 August 2026. next.config.js already
   * redirects each internal slug to its pretty one permanently, and the sitemap now advertises
   * the same address, so one product has exactly one URL everywhere it is named. */
  const canonical = `${SITE_URL}${shopUrl(product.slug)}`;

  return {
    title: `${product.name} | Windsor Glow`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${product.name} | Windsor Glow`,
      description,
      type: 'website',
      url: canonical,
      images: [{ url: imageUrl(product) }],
    },
  };
}

/**
 * The Product block, which is what turns a page into a listing Google can show a price for.
 *
 * One Offer per dosage, cheapest first, each with its own availability, because stock is counted
 * per strength here: a product whose 5mg is gone and whose 10mg is on the shelf is not out of
 * stock, and saying so would be both wrong and a lost sale. Prices are the real catalogue prices
 * after admin edits, which is why this page reads the database rather than the static file.
 */
function productJsonLd(product: Product, data: Awaited<ReturnType<typeof loadShopServerData>>) {
  const canonical = `${SITE_URL}${shopUrl(product.slug)}`;
  const variantStock = data.variantStock[product.slug];
  const rating = data.reviewStats[product.slug];

  const offers = [...activeVariants(product)]
    .sort((a, b) => a.price - b.price)
    .map((variant) => ({
      '@type': 'Offer',
      name: `${product.name} ${variant.dosage}`,
      url: canonical,
      priceCurrency: 'GBP',
      price: variant.price.toFixed(2),
      availability: dosageSoldOut(product, variantStock, variant.dosage)
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'Windsor Glow' },
    }));

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: describe(product),
    image: [imageUrl(product)],
    sku: product.slug,
    brand: { '@type': 'Brand', name: product.brand || 'Windsor Glow' },
    ...(offers.length ? { offers } : {}),
    /* Only when there are really reviews, and only the ones the page itself already shows.
     * A rating in structured data that a visitor cannot see on the page is a manual penalty. */
    ...(rating?.count
      ? {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: rating.average.toFixed(1),
          reviewCount: rating.count,
        },
      }
      : {}),
  };
}

export default async function ProductPage(props: ProductPageProps) {
  const params = await props.params;
  const data = await loadShopServerData();
  const product = productForSlug(data, params.slug);

  /* A missing product, and an admin-hidden one, both 404 here rather than in the browser. The
   * page did this already; doing it on the server means a hidden product never has its name,
   * price and structured data served at all. */
  if (!product) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        // The content is our own object, serialised. The `<` escape closes the one hole that
        // matters: a product name containing "</script>" would otherwise end the block early.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd(product, data)).replace(/</g, '\\u003c'),
        }}
      />
      <ProductPageClient
        params={params}
        initial={{
          overrides: data.overrides,
          hidden: data.hidden,
          variantStock: data.variantStock,
          storageDefaults: data.storageDefaults,
          saleConfig: data.saleConfig,
          isStaff: data.isStaff,
          isMember: data.isMember,
        }}
      />
    </>
  );
}
