'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { isStaffView, isMemberView } from '@/lib/staffView';
import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { PRODUCTS, Product, ProductVariant, mergeProducts, activeVariants, effectiveAvailability, dosageSoldOut, allDosagesSoldOut, certificateForDosage, DEFAULT_STORAGE_INSTRUCTIONS_HTML } from '@/data/products';
import { useCart } from '@/contexts/CartContext';
import { jumpScrollTo } from '@/components/viewportOwner';
import BackButton from '@/components/BackButton';
import ProductReviewsSection from '@/components/reviews/ProductReviewsSection';
import Stars from '@/components/reviews/Stars';
import RichTextContent from '@/components/RichTextContent';
import CertificateModal from '@/components/CertificateModal';
import { certificateFieldIssues } from '@/lib/certificateAudit';
import StorageInstructionsModal from '@/components/StorageInstructionsModal';
import UpsellCarousel from '@/components/UpsellCarousel';
import BackInStockForm from '@/components/BackInStockForm';
import { DEFAULT_SITE_SALE, effectiveSalePercent, salePrice, type SiteSaleConfig } from '@/lib/siteSale';
import { markdownLiteToHtml } from '@/lib/markdownLite';
import { INTERNAL_SLUG, PRETTY_SLUG } from '@/lib/slugAliases';
import ProductImage from './ProductImage';
import AdminProductManager from './AdminProductManager';
import ProductPrice from './ProductPrice';
import AddToCartControls from './AddToCartControls';
import ProductInfoLinks from './ProductInfoLinks';
import ProductDocuments from './ProductDocuments';

/**
 * Everything this page used to wait for a browser fetch to learn, handed in by the server page
 * that renders it. See src/lib/shopServerData.ts for why, and for what happens when a read fails.
 *
 * Every field is optional and every fallback below is the value this file used before the server
 * supplied anything, so the component still works standing on its own.
 */
export interface ProductPageInitialData {
  overrides?: Record<string, Product>;
  hidden?: string[];
  variantStock?: Record<string, Record<string, number>>;
  storageDefaults?: { enabled: boolean; content: string; format: 'html' | 'markdown' };
  saleConfig?: SiteSaleConfig;
  isStaff?: boolean;
  isMember?: boolean;
}

export default function ProductPage({ params, initial }: {
  params: { slug: string };
  initial?: ProductPageInitialData;
}) {
  // Hooks must be called before any conditional returns
  const { addItem, clearCart, openDrawer } = useCart();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [erroredImageSrc, setErroredImageSrc] = useState<string | null>(null);
  const [hiddenSlugs, setHiddenSlugs] = useState<Set<string> | null>(
    initial?.hidden ? new Set(initial.hidden) : null);
  const [variantStockMap, setVariantStockMap] = useState<Record<string, Record<string, number>>>(
    initial?.variantStock ?? {});
  // Admin-only stock readout. The middleware sets a non-httpOnly
  // `wb_ui_session=staff` cookie for signed-in admins (same signal Header uses),
  // so the numbers only ever show for staff, never for customers.
  const [isStaff, setIsStaff] = useState(initial?.isStaff ?? false);
  const [overrides, setOverrides] = useState<Record<string, Product>>(initial?.overrides ?? {});
  /* Already loaded when the server read them, so the gate below opens on the first render rather
   * than the second. That is the whole reason a crawler now gets this page instead of a spinner.
   * The browser still asks for its own copy a moment later and replaces this one, so an edit made
   * while the page is open lands exactly as it did before. */
  const [overridesLoaded, setOverridesLoaded] = useState(Boolean(initial?.overrides));
  // Star rating + count for the summary beside the product name. Filled in by
  // the reviews section further down the page once it has loaded them.
  const [reviewSummary, setReviewSummary] = useState<{ count: number; average: number } | null>(null);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [storageDefaults, setStorageDefaults] = useState<{ enabled: boolean; content: string; format: 'html' | 'markdown' }>(
    initial?.storageDefaults ?? { enabled: true, content: DEFAULT_STORAGE_INSTRUCTIONS_HTML, format: 'html' });
  const [saleConfig, setSaleConfig] = useState<SiteSaleConfig>(initial?.saleConfig ?? DEFAULT_SITE_SALE);

  // Members-only pricing test: logged-in customers carry the presentational
  // `wb_ui_session=member` hint cookie (set by middleware alongside the real
  // httpOnly session). Staff count as members so admins see the member view.
  const [isMember, setIsMember] = useState(initial?.isMember ?? false);

  // Inline stock editing from the admin readout below — lets an admin change a
  // size's stock without leaving the shop for the Products tab. Keyed by
  // size (the readout only ever shows the one product on this page). The
  // write goes to the same admin-gated endpoint the Products tab uses.
  const [editingDosage, setEditingDosage] = useState<string | null>(null);
  const [stockDraft, setStockDraft] = useState('');
  const [savingDosage, setSavingDosage] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);

  // Full variant management from the shop (task a5b6aa85): price edits, new
  // sizes, enable/disable and removal all save through the same admin
  // catalogue endpoint the dashboard Products tab uses — the dashboard is no
  // longer required for day-to-day size changes. Only admins ever see this
  // (staff cookie for the UI, admin session for the API).
  const [editingPriceDosage, setEditingPriceDosage] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [addingDosage, setAddingDosage] = useState(false);
  const [newDosage, setNewDosage] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('');
  const [variantSaving, setVariantSaving] = useState(false);
  const [variantError, setVariantError] = useState<string | null>(null);

  async function saveVariants(current: Product, nextVariants: ProductVariant[]): Promise<boolean> {
    setVariantSaving(true);
    setVariantError(null);
    try {
      const res = await fetch(`/api/admin/products/catalogue/${current.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: { ...current, variants: nextVariants } }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.product) {
        setVariantError(data?.error || 'Could not save the change');
        return false;
      }
      // Serve the saved product immediately, exactly as the storefront will.
      const saved = data.product as Product;
      setOverrides(prev => ({ ...prev, [current.slug]: saved }));
      // If the size being viewed was just hidden or removed, fall back to
      // the first available one rather than keep showing a stale selection.
      setSelectedVariant(prev =>
        prev && !saved.variants.some(v => v.dosage === prev.dosage && v.enabled !== false) ? null : prev
      );
      return true;
    } catch {
      setVariantError('Could not save the change');
      return false;
    } finally {
      setVariantSaving(false);
    }
  }

  async function savePrice(current: Product, dosage: string) {
    const price = Number(priceDraft);
    if (!Number.isFinite(price) || price < 0) { setVariantError('Enter a valid price'); return; }
    const next = current.variants.map(v => v.dosage === dosage ? { ...v, price: Math.round(price * 100) / 100 } : v);
    if (await saveVariants(current, next)) {
      setEditingPriceDosage(null);
      setPriceDraft('');
    }
  }

  async function addDosage(current: Product) {
    const dosage = newDosage.trim();
    const price = Number(newPrice);
    if (!dosage) { setVariantError('Enter a size label, e.g. 30ml'); return; }
    if (current.variants.some(v => v.dosage.toLowerCase() === dosage.toLowerCase())) {
      setVariantError('That size already exists on this product');
      return;
    }
    if (!Number.isFinite(price) || price < 0) { setVariantError('Enter a valid price'); return; }
    const next = [...current.variants, { dosage, price: Math.round(price * 100) / 100, enabled: true }];
    if (!(await saveVariants(current, next))) return;
    // Optional opening stock for the new size, tracked from day one.
    const stock = Math.round(Number(newStock));
    if (newStock.trim() !== '' && Number.isFinite(stock) && stock >= 0) {
      await fetch('/api/admin/products/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: current.slug, dosage, quantity: stock }),
      }).then(async res => {
        if (res.ok) {
          setVariantStockMap(prev => ({ ...prev, [current.slug]: { ...(prev[current.slug] ?? {}), [dosage]: stock } }));
        }
      }).catch(() => {});
    }
    setAddingDosage(false);
    setNewDosage(''); setNewPrice(''); setNewStock('');
  }

  async function toggleDosageEnabled(current: Product, dosage: string) {
    const target = current.variants.find(v => v.dosage === dosage);
    if (!target) return;
    const activeCount = current.variants.filter(v => v.enabled !== false).length;
    if (target.enabled !== false && activeCount <= 1) {
      setVariantError('At least one size must stay available to customers');
      return;
    }
    const next = current.variants.map(v => v.dosage === dosage ? { ...v, enabled: v.enabled === false } : v);
    await saveVariants(current, next);
  }

  async function removeDosage(current: Product, dosage: string) {
    if (current.variants.length <= 1) {
      setVariantError('A product needs at least one size. Edit it instead, or delete the product from the dashboard.');
      return;
    }
    const ok = window.confirm(
      `Remove the ${dosage} size from ${current.name}? Customers will no longer be able to buy it, and any certificate attached to this size goes with it.`
    );
    if (!ok) return;
    const next = current.variants.filter(v => v.dosage !== dosage);
    await saveVariants(current, next);
  }

  async function saveStock(slug: string, dosage: string) {
    const quantity = Math.max(0, Math.round(Number(stockDraft)));
    if (!Number.isFinite(quantity)) { setStockError('Enter a whole number'); return; }
    setSavingDosage(dosage);
    setStockError(null);
    try {
      const res = await fetch('/api/admin/products/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, dosage, quantity }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setStockError(data?.error || 'Could not save'); return; }
      // Reflect the new number immediately without a full refetch.
      setVariantStockMap((prev) => ({
        ...prev,
        [slug]: { ...(prev[slug] ?? {}), [dosage]: quantity },
      }));
      setEditingDosage(null);
      setStockDraft('');
    } catch {
      setStockError('Could not save');
    } finally {
      setSavingDosage(null);
    }
  }

  useEffect(() => {
    setIsStaff(isStaffView());
    setIsMember(isMemberView());
  }, []);

  useEffect(() => {
    fetch('/api/products/visibility')
      .then(res => res.json())
      .then(data => setHiddenSlugs(new Set<string>(Array.isArray(data.hidden) ? data.hidden : [])))
      .catch(() => setHiddenSlugs(new Set()));

    fetch('/api/products/stock')
      .then(res => res.json())
      .then(data => {
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

    fetch('/api/products/storage-defaults')
      .then(res => res.json())
      .then(data => {
        if (typeof data.enabled === 'boolean' && typeof data.content === 'string') {
          setStorageDefaults({ enabled: data.enabled, content: data.content, format: data.format === 'markdown' ? 'markdown' : 'html' });
        }
      })
      .catch(() => {});

    fetch('/api/products/site-sale')
      .then(res => res.json())
      .then((data: SiteSaleConfig) => setSaleConfig(data))
      .catch(() => {});
  }, []);

  // Reset scroll to the top whenever the product changes. Every product-to-product
  // move (shop grid, breadcrumbs, and the "Frequently bought with" panel at the
  // bottom of the page) navigates the same /shop/[slug] client route, and because
  // this page renders nothing until the catalogue loads, the browser otherwise
  // keeps the previous scroll position and lands the customer partway down — or at
  // the very bottom — of the new product instead of on the product itself. Firing
  // on the load flag too catches the first render, where content appears after the
  // initial scroll would have run.
  // jumpScrollTo, not window.scrollTo. globals.css sets
  // `html { scroll-behavior: smooth }`, so a plain scrollTo ANIMATES: clicking a
  // product in the "Frequently bought with" panel at the bottom of a page made
  // the next product visibly scroll itself up from the bottom instead of simply
  // starting at the top. Measured on the live shop: a scrollTo(0, 0) from 1497
  // was still at 1415 a tenth of a second later.
  //
  // ONCE PER PRODUCT, THOUGH, AND THAT GUARD IS THE POINT. `overridesLoaded` flips
  // when the catalogue finishes arriving, and on a slower browser that is several
  // seconds after the page is readable — by which time the customer is already
  // reading. Without the check below the effect fired again at that moment and
  // threw them back to the top of the product they were part-way down. Measured on
  // the live shop, 15 August 2026, same product, same 2.5 seconds: on an iPhone the
  // page sat at 1000 and then went to 0 on its own about three seconds in; on
  // Android it stayed at 1000 throughout. Safari only made it obvious — any slow
  // connection does the same to Chrome.
  const positionedFor = useRef<string | null>(null);
  useEffect(() => {
    // Nothing is drawn yet, so scrolling now would achieve nothing and would spend
    // the one move this product gets.
    if (!overridesLoaded) return;
    if (positionedFor.current === params.slug) return;
    positionedFor.current = params.slug;
    jumpScrollTo(0);
  }, [params.slug, overridesLoaded]);

  // If someone lands on a product's old internal slug, send them to its pretty
  // URL so the old name never sits in the address bar (next.config handles a
  // direct hit; this covers client-side navigation too).
  useEffect(() => {
    if (PRETTY_SLUG[params.slug]) router.replace(`/shop/${PRETTY_SLUG[params.slug]}`);
  }, [params.slug, router]);

  const catalogue = useMemo(() => mergeProducts(PRODUCTS, overrides), [overrides]);
  // A pretty URL slug (e.g. /shop/up389) resolves to its internal product.
  const realSlug = INTERNAL_SLUG[params.slug] ?? params.slug;
  const found = catalogue.find(p => p.slug === realSlug);

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

  // Wait for catalogue overrides to load before rendering anything: a slug
  // that exists only as an admin-created product won't be found yet, and an
  // existing product that's been edited would briefly render with the stale
  // static size/image data before the override replaces it (the "old value
  // flashes before correcting itself" bug). A short spinner beats showing
  // wrong data and self-correcting.
  if (!overridesLoaded) {
    return (
      <div className="flex items-center justify-center py-32">
        <svg className="w-6 h-6 text-gold-700 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
          <path d="M21 12a9 9 0 01-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  if (!found) notFound();
  const product = found;
  const variants = activeVariants(product);

  // Which size the page opens on.
  //
  // It used to be variants[0], the smallest size, whatever its stock. If the smallest size
  // was sold out and a larger one was not, the page opened on the sold-out one: a big OUT OF
  // STOCK banner across the product photo, no Add button, and a back-in-stock form. A
  // customer reads that as "this product is gone" and leaves, when another size was there
  // to buy all along.
  //
  // So the opening size is now the first one that is ACTUALLY AVAILABLE, still smallest
  // first among those. Three things this deliberately does NOT do:
  //   * it does not hide anything. A sold-out size stays in the selector with its own
  //     "Out of Stock" label, and choosing it still shows the banner and refuses the sale.
  //   * it does not override the customer. selectedVariant wins the moment they click.
  //   * it does not special-case a product. It reads stock, so it covers every product now
  //     and any product added later, which is what was asked for.
  //
  // Derived on each render rather than set once, because the stock map arrives from
  // /api/products/stock AFTER first paint: picking a default at mount would be picking it
  // before there is anything to pick it from.
  const slugStockNow = variantStockMap[product.slug];
  // "Is this size gone" is answered in one place, src/data/products.ts, and read from
  // there by the opening choice, the size chip, the photo stamp and the shop card, so
  // none of them can tell the customer something another one denies.
  const firstAvailable = variants.find((v) => !dosageSoldOut(product, slugStockNow, v.dosage));
  // Every size sold out: fall back to the smallest size and let the page show Out of
  // Stock exactly as it did before. Nothing about that path changes.
  const variant = selectedVariant ?? firstAvailable ?? variants[0];
  // The product certificate is resolved for the SELECTED size. Falls back to the
  // product-level certificate when this size has none, so single-certificate
  // products are unaffected.
  const activeCertificate = certificateForDosage(product, variant.dosage);
  // Stock is per size: selecting a different variant looks up that
  // variant's own number, so one size selling out never affects the others.
  const stock = variantStockMap[product.slug]?.[variant.dosage];
  // A product-level alert must be visible on arrival, even when another size
  // is selected first. Keep the size named so the urgency never misrepresents
  // the stock available for the other variants.
  const lowStockVariants = variants.filter((item) => slugStockNow?.[item.dosage] === 2);
  const availability = effectiveAvailability(product, stock);
  const outOfStock = availability === 'out_of_stock';
  // The stamp on the product photo speaks for the PRODUCT, so it is only allowed to appear
  // when there is genuinely nothing left to buy.
  //
  // It used to follow the SELECTED size. Landing on an in-stock size fixed what a
  // customer sees on arrival, but the moment they tapped a sold-out size the photo
  // stamped itself OUT OF STOCK, and that reads as "the product is gone" rather than "not
  // this size", with other sizes still there to buy. The size chip already carries
  // its own Out of Stock label and the button still refuses the sale, so the truth is told
  // where it belongs, next to the thing it is true about.
  //
  // Untracked stock counts as available, so this can only be true when every size is
  // genuinely at zero, or the whole product is marked out of stock in the admin. While the
  // stock map is still loading nothing is known to be zero, so the stamp cannot flash.
  const everyDosageSoldOut = allDosagesSoldOut(product, slugStockNow);
  const comingSoon = availability === 'coming_soon';
  const priceTbc = variant.price === 0;
  const unavailable = outOfStock || comingSoon;
  const imageSrc = variant.image || product.image || `/images/products/${product.slug}.jpg`;
  const imageError = erroredImageSrc === imageSrc;
  const salePercent = effectiveSalePercent(saleConfig, product);
  const discountedPrice = salePercent > 0 ? salePrice(variant.price, salePercent) : variant.price;

  // "Storage Instructions" popup content: a per-product custom override or
  // hidden flag takes precedence; otherwise falls back to the site-wide
  // default (which can itself be turned off globally in Product Defaults).
  // Each source carries its own format — convert lite-markdown to HTML here
  // before it reaches the modal, which always expects final HTML.
  const storageMode = product.storageInstructions?.mode ?? 'global';
  const storageRawContent = storageMode === 'custom' ? (product.storageInstructions?.content ?? '') : storageDefaults.content;
  const storageFormat = storageMode === 'custom' ? (product.storageInstructions?.format ?? 'html') : storageDefaults.format;
  const storageContent = storageFormat === 'markdown' ? markdownLiteToHtml(storageRawContent) : storageRawContent;
  const showStorageButton =
    storageMode !== 'hidden' &&
    Boolean(storageRawContent.trim()) &&
    (storageMode === 'custom' || storageDefaults.enabled);

  // Once we know which products the admin has hidden, treat a hidden product
  // the same as one that doesn't exist — keeps direct links from working.
  if (hiddenSlugs?.has(product.slug)) notFound();

  function handleAddToCart() {
    if (unavailable || priceTbc) return;
    addItem({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      variant: variant.dosage,
      price: variant.price,
      quantity: qty,
      image: variant.image || product.image,
    });
    setAdded(true);
    openDrawer();
    setTimeout(() => setAdded(false), 2000);
  }

  // Buy Now means exactly this product, quantity 1 — it replaces whatever
  // else is in the basket rather than adding to it, so checkout reflects
  // only the single item the customer just chose to buy immediately.
  function handleBuyNow() {
    if (unavailable || priceTbc) return;
    clearCart();
    addItem({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      variant: variant.dosage,
      price: variant.price,
      quantity: 1,
      image: variant.image || product.image,
    });
    router.push('/checkout');
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      {/* Breadcrumb (Back is now a floating control, see BackButton) */}
      <div className="flex items-center justify-end gap-4 mb-10 flex-wrap">
        <BackButton />
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[9px] tracking-[0.15em] uppercase text-stone-500">
          <Link href="/" className="hover:text-gold-800 transition-colors">Home</Link>
          <span>/</span>
          <Link href="/shop" className="hover:text-gold-800 transition-colors">Shop</Link>
          <span>/</span>
          <span className="text-stone-600">{product.name}</span>
        </nav>
      </div>

      {lowStockVariants.length > 0 && (
        <aside
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="relative mb-10 w-full overflow-hidden border-2 border-gold-400 bg-stone-900 text-white shadow-[0_14px_36px_rgba(28,25,23,0.28)]"
        >
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2 bg-gold-400" />
          <div className="grid gap-5 px-7 py-7 sm:px-9 sm:py-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-center lg:gap-9">
            <div>
              <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.28em] text-gold-300">
                <span aria-hidden="true" className="h-3 w-3 flex-none rounded-full bg-red-500 ring-4 ring-red-500/20" />
                <span>Low stock</span>
              </div>
              <p className="mt-3 font-serif text-3xl font-bold leading-[1.02] tracking-tight text-white sm:text-5xl">
                Stock running low, <span className="whitespace-nowrap text-gold-300">only 2 left</span>
              </p>
            </div>
            <div className="border-t border-stone-600 pt-5 lg:border-l lg:border-t-0 lg:py-2 lg:pl-8">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gold-300">
                {lowStockVariants.length === 1 ? `${lowStockVariants[0].dosage} size` : 'Selected sizes'}
              </p>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-stone-100">
                {lowStockVariants.length === 1
                  ? `Only 2 of the ${lowStockVariants[0].dosage} size remain.`
                  : `Only 2 remain in each of these sizes: ${lowStockVariants.map((item) => item.dosage).join(', ')}.`}
              </p>
            </div>
          </div>
        </aside>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
        <ProductImage
          product={product}
          variant={variant}
          imageSrc={imageSrc}
          imageError={imageError}
          setErroredImageSrc={setErroredImageSrc}
          salePercent={salePercent}
          priceTbc={priceTbc}
          comingSoon={comingSoon}
          everyDosageSoldOut={everyDosageSoldOut}
        />

        {/* Product details */}
        <div className="flex flex-col">
          {product.categories.length > 0 && (
            <div className="text-[12px] font-bold tracking-[0.25em] uppercase text-gold-700 mb-2">
              {product.categories.join(' · ')}
            </div>
          )}

          <h1 className="font-serif text-4xl text-stone-800 tracking-wide mb-3">
            {product.name}
          </h1>

          {/* The rating the shop grid already shows, finally shown here too — a
              product with five-star reviews used to look unreviewed until you
              scrolled to the very bottom of the page. Clicking it takes you
              there. Numbers come from the reviews section's own load. */}
          {reviewSummary && reviewSummary.count > 0 && (
            <button
              type="button"
              onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="group flex items-center gap-2 mb-4"
              aria-label={`Read ${reviewSummary.count} review${reviewSummary.count === 1 ? '' : 's'} of ${product.name}`}
            >
              <Stars rating={reviewSummary.average} size={15} />
              <span className="text-xs text-stone-600 font-medium underline decoration-stone-300 underline-offset-2 group-hover:text-gold-800 group-hover:decoration-gold-400 transition-colors">
                {reviewSummary.count} review{reviewSummary.count === 1 ? '' : 's'}
              </span>
            </button>
          )}

          {!product.fullDescription ? null : product.fullDescriptionFormat === 'html' ? (
            <RichTextContent html={product.fullDescription} className="text-sm text-stone-500 leading-relaxed mb-6" />
          ) : product.fullDescriptionFormat === 'markdown' ? (
            <RichTextContent html={markdownLiteToHtml(product.fullDescription)} className="text-sm text-stone-500 leading-relaxed mb-6" />
          ) : (
            <p className="text-sm text-stone-500 leading-relaxed mb-6">
              {product.fullDescription}
            </p>
          )}

          {/* Variant selector */}
          <div className="mb-5">
            <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-2">
              Select Size
            </label>
            <div className="flex flex-wrap gap-2">
              {variants.map(v => {
                // Same rule as the opening size and the photo stamp — one definition of
                // "gone", so the chip can never say something the rest of the page denies.
                const vOutOfStock = dosageSoldOut(product, slugStockNow, v.dosage);
                return (
                  <button
                    key={v.dosage}
                    onClick={() => { setSelectedVariant(v); setQty(1); }}
                    className={`px-4 py-2 border text-xs tracking-wide transition-colors ${
                      variant.dosage === v.dosage
                        ? 'bg-gold-700 text-white border-gold-500'
                        : vOutOfStock
                        ? 'border-stone-200 text-stone-500 hover:border-gold-300 hover:text-gold-800'
                        : 'border-stone-200 text-stone-600 hover:border-gold-300 hover:text-gold-800'
                    }`}
                  >
                    {v.dosage}
                    {vOutOfStock && <span className="block text-[8px] tracking-wider uppercase leading-tight">Out of Stock</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <AdminProductManager
            isStaff={isStaff}
            product={product}
            variantStockMap={variantStockMap}
            editingDosage={editingDosage}
            setEditingDosage={setEditingDosage}
            stockDraft={stockDraft}
            setStockDraft={setStockDraft}
            savingDosage={savingDosage}
            stockError={stockError}
            setStockError={setStockError}
            saveStock={saveStock}
            editingPriceDosage={editingPriceDosage}
            setEditingPriceDosage={setEditingPriceDosage}
            priceDraft={priceDraft}
            setPriceDraft={setPriceDraft}
            savePrice={savePrice}
            addingDosage={addingDosage}
            setAddingDosage={setAddingDosage}
            newDosage={newDosage}
            setNewDosage={setNewDosage}
            newPrice={newPrice}
            setNewPrice={setNewPrice}
            newStock={newStock}
            setNewStock={setNewStock}
            addDosage={addDosage}
            removeDosage={removeDosage}
            toggleDosageEnabled={toggleDosageEnabled}
            variantSaving={variantSaving}
            variantError={variantError}
            setVariantError={setVariantError}
          />

          <ProductPrice
            product={product}
            variant={variant}
            priceTbc={priceTbc}
            salePercent={salePercent}
            discountedPrice={discountedPrice}
            isMember={isMember}
          />

          <AddToCartControls
            qty={qty}
            setQty={setQty}
            stock={stock}
            added={added}
            handleAddToCart={handleAddToCart}
            handleBuyNow={handleBuyNow}
            unavailable={unavailable}
            outOfStock={outOfStock}
            comingSoon={comingSoon}
            priceTbc={priceTbc}
          />

          {outOfStock && <BackInStockForm slug={product.slug} />}

          <ProductInfoLinks
            product={product}
          />

          <ProductDocuments
            activeCertificate={activeCertificate}
            showStorageButton={showStorageButton}
            setCertificateOpen={setCertificateOpen}
            setStorageOpen={setStorageOpen}
          />
        </div>
      </div>

      {activeCertificate?.enabled && (
        <CertificateModal
          open={certificateOpen}
          onClose={() => setCertificateOpen(false)}
          product={product}
          certificate={activeCertificate}
          adminEdit={isStaff ? { slug: product.slug, dosage: variant.dosage } : undefined}
          // Staff looking at the live product page see the same problems marked
          // on the certificate as they would in the admin. A customer passes
          // nothing here and sees the certificate exactly as before.
          review={isStaff ? {
            issues: certificateFieldIssues(product).filter(issue => issue.dosage === variant.dosage),
            shownDosage: product.variants.length > 1 ? variant.dosage : undefined,
            editHref: `/admin/products?edit=${encodeURIComponent(product.slug)}&section=certificate`,
          } : undefined}
        />
      )}
      {showStorageButton && (
        <StorageInstructionsModal open={storageOpen} onClose={() => setStorageOpen(false)} content={storageContent} />
      )}

      {/* Usage note */}
      <div className="border border-gold-200 bg-gold-50/30 p-5 mb-12 text-center">
        <p className="text-[10px] text-gold-700 leading-relaxed">
          For external use only. Patch test before first use. If irritation occurs, stop using the product.
        </p>
      </div>

      <UpsellCarousel extraTriggerSlug={product.slug} />

      {/* Reviews come before the blog (task ae1f6053). They were the last thing on the page,
          under the articles, so on a phone you scrolled past everything to reach what other
          customers said about the thing you are about to buy. The button higher up scrolls to
          the #reviews id, not to a position, so moving this does not affect it. */}
      <ProductReviewsSection
        productSlug={product.slug}
        productName={product.name}
        onStats={setReviewSummary}
      />

      {/* Further reading: related blog articles for this product
          (task 41068697). Terms = product name/keywords/category. */}
    </div>
  );
}
