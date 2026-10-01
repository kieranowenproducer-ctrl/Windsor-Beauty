import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { categoryFromSlug, categoryUrl } from '@/lib/categoryUrls';
import { categoriesWithProducts, loadShopServerData, visibleProducts } from '@/lib/shopServerData';
import { SITE_URL } from '../../../robots';
import ShopClient from '../../ShopClient';

/**
 * One shelf of the shop, at an address of its own.
 *
 * WHAT WAS WRONG. The shop had exactly one page for 47 products. A category existed only as a
 * value in a dropdown inside a client component, so "fat loss" and "sleep" were things this shop
 * sold and had no way of saying so: nothing to link to, nothing to put in a sitemap, and nothing
 * for a search result to be about. Fixing the product pages on 10 August made each product
 * findable by its own name and left the shop with no page between the front door and a single
 * compound.
 *
 * WHY THIS IS A SERVER COMPONENT RENDERING THE CLIENT ONE. Same split as the product page next
 * door, and for the same reason: only a server component can own a title, a description and a
 * canonical. The grid, the search, the sort and the dropdown are the code that is already live in
 * ShopClient, handed the category to open on. There is no new design here and no second grid to
 * keep in step with the first.
 *
 * WHY force-dynamic. Stock, prices and the sale come from the database and change during the day,
 * and the decision this page makes first, whether the category has anything in it at all, has to
 * be made against today's catalogue rather than the one that existed at build time.
 */
export const dynamic = 'force-dynamic';

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Everything this page is allowed to say about a category, which is deliberately very little.
 *
 * THE COMPLIANCE LINE, AND IT IS THE WHOLE REASON THIS FUNCTION IS THIS SHORT. These category
 * names are already public on the site, and nothing here invents one. But a page TITLED "Fat Loss
 * Research Compounds", written to be found by somebody searching for fat loss, is a more
 * assertive use of that name than a filter in a dropdown ever was. So this says three things and
 * stops: the name exactly as the shop already labels it, how many products are in it, and the
 * same research-use qualifier every product description carries.
 *
 * It must NEVER grow a sentence explaining what the category is for, what the compounds in it do,
 * or who might want them. That is the same line held for the product descriptions on 10 August.
 * check-seo.mjs enforces it with a length ceiling, so a sentence added here fails the check.
 */
function describe(name: string, count: number): string {
  return `${count} research compound${count === 1 ? '' : 's'} in ${name} from Windsor Beauty. `
    + 'Supplied for laboratory research use only, not for human consumption, with a certificate '
    + 'of analysis.';
}

/** The live categories, and the one this request is about. Null when there is nothing to show. */
async function resolve(slug: string) {
  const data = await loadShopServerData();
  const products = visibleProducts(data);
  const categories = categoriesWithProducts(products, data.categories);
  const name = categoryFromSlug(slug, categories.map((c) => c.name));
  if (!name) return null;
  return { data, name, count: categories.find((c) => c.name === name)?.count ?? 0 };
}

export async function generateMetadata(props: CategoryPageProps): Promise<Metadata> {
  const params = await props.params;
  const found = await resolve(params.slug);
  if (!found) return { title: 'Category Not Found | Windsor Beauty' };

  const title = `${found.name} Research Compounds | Windsor Beauty`;
  const description = describe(found.name, found.count);
  const canonical = `${SITE_URL}${categoryUrl(found.name)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: 'website', url: canonical },
  };
}

export default async function CategoryPage(props: CategoryPageProps) {
  const params = await props.params;
  const found = await resolve(params.slug);

  /* A category with nothing live in it is a 404, not an empty shelf. An empty page that answers
   * 200 is worse than no page: it gets indexed, it gets shown, and somebody arrives at a shop
   * that appears to have run out. The same is true of a category the admin has switched off,
   * which is the shop saying it should not be browsable. */
  if (!found) notFound();

  const { data, name } = found;

  return (
    <ShopClient
      lockedCategory={name}
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
  );
}
