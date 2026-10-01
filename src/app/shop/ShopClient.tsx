'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { isStaffView } from '@/lib/staffView';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { categoryUrl } from '@/lib/categoryUrls';
import ProductCard from '@/components/ProductCard';
import BackToHome from '@/components/BackToHome';
import { PRODUCTS, Product, ALL_CATEGORIES, Category, mergeProducts, searchableText } from '@/data/products';
import { DEFAULT_SITE_SALE, type SiteSaleConfig } from '@/lib/siteSale';

type SortOption = 'az' | 'za' | 'price-asc' | 'price-desc' | 'newest' | 'best-selling';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'az', label: 'Alphabetical: A to Z' },
  { value: 'za', label: 'Alphabetical: Z to A' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest' },
  { value: 'best-selling', label: 'Best Selling' },
];

function startingPrice(p: Product) {
  return Math.min(...p.variants.map(v => v.price));
}

function sortProducts(products: Product[], sort: SortOption, soldCounts: Record<string, number>) {
  const list = [...products];
  switch (sort) {
    case 'az':
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'za':
      return list.sort((a, b) => b.name.localeCompare(a.name));
    case 'price-asc':
      return list.sort((a, b) => startingPrice(a) - startingPrice(b));
    case 'price-desc':
      return list.sort((a, b) => startingPrice(b) - startingPrice(a));
    case 'newest':
      return list.sort((a, b) => Number(b.id) - Number(a.id));
    case 'best-selling':
      return list.sort((a, b) => (soldCounts[b.slug] ?? 0) - (soldCounts[a.slug] ?? 0) || a.name.localeCompare(b.name));
    default:
      return list;
  }
}

/**
 * Everything this page used to fetch from the browser, handed in by the server page that renders
 * it. See src/lib/shopServerData.ts for why. Every field is optional, and every fallback below is
 * the value this file used before the server supplied anything.
 */
export interface ShopInitialData {
  overrides?: Record<string, Product>;
  hidden?: string[];
  stock?: Record<string, number>;
  variantStock?: Record<string, Record<string, number>>;
  saleConfig?: SiteSaleConfig;
  soldCounts?: Record<string, number>;
  reviewStats?: Record<string, { average: number; count: number }>;
  categories?: string[];
  isStaff?: boolean;
}

/**
 * The category this page is about, when it is a category page.
 *
 * Added 11 August 2026 so /shop/category/<slug> can be the shop it already is with one category
 * already chosen, rather than a second grid written from scratch. When it is set the dropdown
 * opens on that category and the heading says it; when it is not, this is /shop and nothing about
 * the page changes.
 */
interface ShopClientProps {
  initial?: ShopInitialData;
  lockedCategory?: string;
}

function ShopPageContent({ initial, lockedCategory }: ShopClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeCategory, setActiveCategory] = useState<'All' | Category>(() => {
    if (lockedCategory) return lockedCategory;
    /* /shop redirects a ?category= link to the category's own page before this ever renders.
     * Kept as a fallback for a link that arrives naming a category the redirect could not
     * resolve, which filters the grid exactly as it always did. */
    const param = searchParams.get('category');
    return param ? (param as Category) : 'All';
  });
  const [sort, setSort] = useState<SortOption>('az');
  /* THE SEARCH LIVES IN THE ADDRESS NOW (task 472ed443).
   *
   * Kieran: "I choose RETA, it displays it, I then change it to pens, and then it resets...
   * Why should I have to keep changing the inputted word of what I'm searching for?"
   *
   * Changing category is a real navigation, on purpose, so every shelf has its own address
   * (see selectCategory below). That meant the typed word, which lived only in this
   * component's memory, was thrown away on the way to the new page. Keeping it in ?q=
   * carries it across, and has the side effect that a search can now be linked, shared and
   * reloaded, which it never could before. */
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '');
  const [hiddenSlugs, setHiddenSlugs] = useState<Set<string>>(new Set(initial?.hidden ?? []));
  const [stockMap, setStockMap] = useState<Record<string, number>>(initial?.stock ?? {});
  // Per-dosage stock + staff flag, for the admin-only inline stock editor on each
  // card (task 6dc6c2ec) — same data + endpoint the product page uses.
  const [variantStockMap, setVariantStockMap] = useState<Record<string, Record<string, number>>>(
    initial?.variantStock ?? {});
  const [isStaff, setIsStaff] = useState(initial?.isStaff ?? false);
  const [reviewStats, setReviewStats] = useState<Record<string, { average: number; count: number }>>(
    initial?.reviewStats ?? {});
  const [overrides, setOverrides] = useState<Record<string, Product>>(initial?.overrides ?? {});
  /* Already loaded when the server read them, so the grid below is in the served HTML rather than
   * a spinner. The browser still fetches its own copy and replaces this one. */
  const [overridesLoaded, setOverridesLoaded] = useState(Boolean(initial?.overrides));
  const [soldCounts, setSoldCounts] = useState<Record<string, number>>(initial?.soldCounts ?? {});
  const [enabledCategories, setEnabledCategories] = useState<string[]>(
    initial?.categories ?? [...ALL_CATEGORIES]);
  const [saleConfig, setSaleConfig] = useState<SiteSaleConfig>(initial?.saleConfig ?? DEFAULT_SITE_SALE);

  useEffect(() => {
    setIsStaff(isStaffView());
  }, []);

  useEffect(() => {
    fetch('/api/categories')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.categories)) setEnabledCategories(data.categories);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/products/visibility')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.hidden)) setHiddenSlugs(new Set<string>(data.hidden));
      })
      .catch(() => {});

    fetch('/api/products/stock')
      .then(res => res.json())
      .then(data => {
        if (data.stock && typeof data.stock === 'object') setStockMap(data.stock);
        if (data.variantStock && typeof data.variantStock === 'object') setVariantStockMap(data.variantStock);
      })
      .catch(() => {});

    fetch('/api/products/catalogue')
      .then(res => res.json())
      .then(data => {
        if (data.overrides && typeof data.overrides === 'object') setOverrides(data.overrides);
      })
      .catch(() => {})
      .finally(() => setOverridesLoaded(true));

    fetch('/api/products/sold-counts')
      .then(res => res.json())
      .then(data => {
        if (data.soldCounts && typeof data.soldCounts === 'object') setSoldCounts(data.soldCounts);
      })
      .catch(() => {});

    fetch('/api/reviews/stats')
      .then(res => res.json())
      .then(data => {
        if (data.stats && typeof data.stats === 'object') setReviewStats(data.stats);
      })
      .catch(() => {});

    fetch('/api/products/site-sale')
      .then(res => res.json())
      .then((data: SiteSaleConfig) => setSaleConfig(data))
      .catch(() => {});
  }, []);

  const catalogue = useMemo(() => mergeProducts(PRODUCTS, overrides), [overrides]);

  const visibleProducts = useMemo(
    () => catalogue.filter(p => !hiddenSlugs.has(p.slug)),
    [catalogue, hiddenSlugs]
  );

  const byCategory = useMemo(() => {
    if (activeCategory === 'All') return visibleProducts;
    return visibleProducts.filter(p => p.categories.includes(activeCategory));
  }, [visibleProducts, activeCategory]);

  const searched = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return byCategory;
    return byCategory.filter(p => searchableText(p).includes(query));
  }, [byCategory, searchQuery]);

  const filtered = useMemo(() => sortProducts(searched, sort, soldCounts), [searched, sort, soldCounts]);

  /**
   * Choosing a category changes the address instead of only the grid.
   *
   * It looks the same to whoever is using it: the grid filters immediately from the state below,
   * exactly as it did before, and the navigation lands on a page showing what is already on
   * screen. What it buys is that every shelf in this shop now has an address that can be linked,
   * shared and found, which a dropdown value inside a browser never could.
   */
  /* Keeps ?q= in step with the box. `replace`, not `push`, so Back still goes back to wherever
   * they came from rather than stepping through every letter they typed. */
  function updateSearch(value: string) {
    setSearchQuery(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) params.set('q', value);
    else params.delete('q');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function selectCategory(cat: 'All' | Category) {
    setActiveCategory(cat);
    // The search goes with them to the new shelf, which is the whole point of
    // task 472ed443. Without this the new page starts with an empty box.
    const base = cat === 'All' ? '/shop' : categoryUrl(cat);
    const query = searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : '';
    router.push(`${base}${query}`);
  }

  return (
    <>
      <BackToHome />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16">

      {/* Page header */}
      <div className="mb-12 text-center">
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">
          Windsor Glow
        </p>
        {/* The category's own name on its own page, and the shop's name on the shop. The name is
            the one the site already shows in the dropdown, never a reworded version of it. */}
        <h1 className="font-serif text-4xl sm:text-5xl text-stone-800 tracking-wide mb-4">
          {lockedCategory ?? 'Research Compounds'}
        </h1>
        <p className="text-sm text-stone-500 max-w-lg mx-auto leading-relaxed">
          High-purity peptides, pens and reconstitution supplies for advanced laboratory and in vitro research.
          All peptide products supplied with certificate of analysis.
        </p>
      </div>

      {/* Compliance banner */}
      <div className="border border-gold-200 bg-gold-50 py-3 px-4 mb-10 text-center">
        <p className="text-[9px] tracking-[0.18em] uppercase text-gold-700">
          Research Use Only &bull; Not for Human Consumption &bull; 99% Purity &bull; Lab Tested &bull; CoA Available
        </p>
      </div>

      {/* Search + sort + result count + category filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 pb-6 border-b border-stone-100">
        <span className="text-sm font-semibold text-stone-600 tracking-wide order-1 sm:order-none">
          {filtered.length} product{filtered.length !== 1 ? 's' : ''}
        </span>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-3 sm:gap-4 order-2 sm:order-none">
          <div className="col-span-2 sm:order-first relative sm:w-56">
            <input
              type="text"
              value={searchQuery}
              onChange={e => updateSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full border border-stone-300 bg-white shadow-sm text-[11px] tracking-[0.05em] text-stone-600 placeholder:text-stone-500 pl-3.5 pr-9 py-2.5 outline-none hover:border-gold-400 focus:border-gold-500 transition-colors"
            />
            <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="11" cy="11" r="7" strokeWidth={2} />
              <path strokeLinecap="round" strokeWidth={2} d="M20 20l-3-3" />
            </svg>
          </div>
          <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2.5">
            <span className="text-[9px] tracking-[0.18em] uppercase text-stone-500">Category</span>
            <div className="relative">
              <select
                value={activeCategory}
                onChange={e => selectCategory(e.target.value as 'All' | Category)}
                className="w-full appearance-none border border-stone-200 bg-white text-[10px] tracking-[0.1em] uppercase text-stone-600 pl-3 pr-7 py-2.5 sm:py-2 outline-none cursor-pointer hover:border-gold-300 focus:border-gold-400 transition-colors"
              >
                <option value="All">All</option>
                {enabledCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </label>
          <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2.5">
            <span className="text-[9px] tracking-[0.18em] uppercase text-stone-500">Sort By</span>
            <div className="relative">
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortOption)}
                className="w-full appearance-none border border-stone-200 bg-white text-[10px] tracking-[0.1em] uppercase text-stone-600 pl-3 pr-7 py-2.5 sm:py-2 outline-none cursor-pointer hover:border-gold-300 focus:border-gold-400 transition-colors"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </label>
        </div>
      </div>

      {/* Product grid — waits for catalogue overrides to load so edited/new
          products don't briefly render with stale static dosage/image data
          before snapping to the real value. */}
      {!overridesLoaded ? (
        <div className="flex items-center justify-center py-24">
          <svg className="w-6 h-6 text-gold-700 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
            <path d="M21 12a9 9 0 01-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map(product => (
            <ProductCard key={product.id} product={product} stock={stockMap[product.slug]} reviewStats={reviewStats[product.slug]} saleConfig={saleConfig} isStaff={isStaff} variantStock={variantStockMap[product.slug]} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border border-dashed border-stone-200">
          <p className="text-sm text-stone-500">No products match this combination of filters yet.</p>
        </div>
      )}

      {/* Bottom disclaimer */}
      <div className="mt-16 border-t border-gold-100 pt-10 text-center">
        <p className="text-xs text-stone-500 max-w-xl mx-auto leading-relaxed">
          All products listed are for research use only and must be handled by qualified personnel in appropriate laboratory conditions. Windsor Glow makes no therapeutic or medical claims.
        </p>
      </div>
      </div>
    </>
  );
}

export default function ShopClient({ initial, lockedCategory }: ShopClientProps) {
  return (
    <Suspense fallback={null}>
      <ShopPageContent initial={initial} lockedCategory={lockedCategory} />
    </Suspense>
  );
}
