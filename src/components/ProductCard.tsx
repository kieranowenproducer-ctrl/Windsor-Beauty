'use client';

import { useState } from 'react';
import { shopUrl } from '@/lib/slugAliases';
import Link from 'next/link';
import Image from 'next/image';
import { Product, ProductVariant, activeVariants, cardImage, effectiveAvailability, dosageSoldOut, allDosagesSoldOut } from '@/data/products';
import { useCart } from '@/contexts/CartContext';
import Stars from '@/components/reviews/Stars';
import { effectiveSalePercent, salePrice, type SiteSaleConfig } from '@/lib/siteSale';
import VariantPickerModal from '@/components/VariantPickerModal';

interface Props {
  product: Product;
  /**
   * Live stock for this product, summed across its sizes. Undefined =
   * untracked/unlimited. Kept as the fallback for callers that have no
   * per-size breakdown; `variantStock` is the better answer where it exists.
   */
  stock?: number;
  /** Average rating + review count for this product. Omitted/zero count = no rating shown. */
  reviewStats?: { average: number; count: number };
  /** Active automatic sale config, if any — see Discount Codes > Automatic Sale Discounts. */
  saleConfig?: SiteSaleConfig;
  /** True for signed-in admins (wb_ui_session=staff). Shows the inline stock editor. */
  isStaff?: boolean;
  /**
   * Per-size stock for this product (size -> quantity; a size with no
   * entry is untracked, so unlimited). Drives the sold-out wording, the admin
   * editor, and the size list in the quick-add picker.
   */
  variantStock?: Record<string, number>;
}

export default function ProductCard({ product, stock, reviewStats, saleConfig, isStaff, variantStock }: Props) {
  const { addItem, openDrawer } = useCart();
  const [erroredImageSrc, setErroredImageSrc] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Admin-only inline stock editing straight from the shop grid (task 6dc6c2ec),
  // so stock can be changed without opening each product. Local copy so a save
  // reflects immediately; writes go to the same admin-gated endpoint the product
  // page uses. Keyed by size (the `dosage` field).
  const [localStock, setLocalStock] = useState<Record<string, number>>({});
  const [editingDosage, setEditingDosage] = useState<string | null>(null);
  const [stockDraft, setStockDraft] = useState('');
  const [savingDosage, setSavingDosage] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const stockFor = (dosage: string): number | undefined =>
    dosage in localStock ? localStock[dosage] : variantStock?.[dosage];

  async function saveStock(dosage: string) {
    const quantity = Math.max(0, Math.round(Number(stockDraft)));
    if (!Number.isFinite(quantity)) { setStockError('Enter a whole number'); return; }
    setSavingDosage(dosage);
    setStockError(null);
    try {
      const res = await fetch('/api/admin/products/stock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: product.slug, dosage, quantity }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setStockError(data?.error || 'Could not save'); return; }
      setLocalStock((prev) => ({ ...prev, [dosage]: quantity }));
      setEditingDosage(null);
      setStockDraft('');
    } catch {
      setStockError('Could not save');
    } finally {
      setSavingDosage(null);
    }
  }
  const variants = activeVariants(product);
  const baseVariant = variants[0];
  const availability = effectiveAvailability(product, stock);
  const comingSoon = availability === 'coming_soon';
  // "Sold out" on a card speaks for the whole product: the stamp goes across the
  // photograph, so it may only appear when there is nothing left in any size.
  //
  // The `stock` prop is a SUM across sizes, which is the wrong instrument for that
  // question. A product can have one size counted and another untracked, so the day the
  // counted one hits zero the sum reads zero and the card would stamp a product whose
  // other size is still on the shelf. With the per-size numbers we ask the real question
  // instead, through the same
  // rule the product page uses. Without them (a caller that has no breakdown yet) the old
  // aggregate still applies, so nothing regresses.
  //
  // An admin editing a number inline on this card counts straight away, so the badge can
  // never contradict what they just typed.
  const liveVariantStock = variantStock ? { ...variantStock, ...localStock } : undefined;
  const outOfStock = liveVariantStock ? allDosagesSoldOut(product, liveVariantStock) : availability === 'out_of_stock';
  // Individual sizes that are gone. The quick-add picker greys these out rather than
  // letting a customer put a sold-out size in the basket for checkout to reject later.
  const soldOutDosages = variants.filter((v) => dosageSoldOut(product, liveVariantStock, v.dosage)).map((v) => v.dosage);
  const priceTbc = baseVariant.price === 0;
  const salePercent = saleConfig ? effectiveSalePercent(saleConfig, product) : 0;
  const discountedPrice = salePercent > 0 ? salePrice(baseVariant.price, salePercent) : baseVariant.price;
  // Compared against the failed src (not a plain boolean) so that once the
  // real photo arrives from the async catalogue-overrides fetch (admin
  // panel uploads aren't in the static PRODUCTS list this card first renders
  // with), a previous 404 on the old fallback path doesn't permanently lock
  // the placeholder in — see /shop/[slug]/page.tsx for the same pattern.
  const imageSrc = cardImage(product) || `/images/products/${product.slug}.jpg`;
  const imageError = erroredImageSrc === imageSrc;

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault();
    if (outOfStock || comingSoon || priceTbc) return;
    // Never silently assume the cheapest/first-listed option — ask when
    // there's more than one to choose from.
    if (variants.length > 1) {
      setPickerOpen(true);
      return;
    }
    addItem({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      variant: baseVariant.dosage,
      price: baseVariant.price,
      quantity: 1,
      image: product.image,
    });
    openDrawer();
  }

  function handleVariantPicked(variant: ProductVariant) {
    addItem({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      variant: variant.dosage,
      price: variant.price,
      quantity: 1,
      image: product.image,
    });
    setPickerOpen(false);
    openDrawer();
  }

  // sm:h-full ADDED 24 SEPTEMBER 2026. The card was only ever as tall as its own
  // contents, so a product with no star rating or a shorter description made a
  // shorter card than the ones beside it and the row finished on a ragged line.
  // Measured on the homepage at 1440px: the New In row varied by 132 pixels
  // across twelve cards and the featured row by 46. The card was already built
  // to cope with being stretched (it is a flex column and the description
  // already carries flex-1), so filling the height pushes the price and the
  // buttons down to a shared bottom line.
  //
  // FROM sm ONLY, AND THAT IS THE POINT. Below 640px both places this card is
  // used show one card at a time: the homepage carousels snap one card to the
  // screen and the shop grid is a single column. There is nothing to line up
  // with, and stretching every card to match the tallest one on the page left
  // a measured 165px band of empty white inside the short ones on a phone.
  // From sm up the carousels show two cards and the shop grid has two columns,
  // so the cards are being compared and lining them up is what looks right.
  return (
    <div className="group relative flex sm:h-full flex-col bg-white border border-stone-100 hover:border-gold-200 transition-all duration-200 rounded-2xl overflow-hidden">

      {/* Whole-card click target -> product page (stretched link). Non-interactive
          areas (image, description, price) route here; the Add button, View link
          and variant picker sit above it via relative z-10 and keep their own
          behaviour. One anchor per card (image/title are plain elements) keeps
          the HTML valid and accessible. */}
      <Link href={shopUrl(product.slug)} aria-label={product.name} className="absolute inset-0 z-[1]" />

      {/* Product image */}
      <div>
        <div className="relative aspect-square bg-gradient-to-br from-stone-50 to-gold-50 overflow-hidden">
          {product.badge && (
            <span className="absolute top-3 left-3 z-10 text-[8px] tracking-[0.18em] uppercase bg-gold-700 text-white px-2 py-1 font-semibold">
              {product.badge}
            </span>
          )}
          {outOfStock && (
            <span className="absolute top-3 right-3 z-10 text-[8px] tracking-[0.18em] uppercase bg-stone-700 text-white px-2 py-1 font-semibold">
              Out of Stock
            </span>
          )}
          {comingSoon && (
            <span className="absolute top-3 right-3 z-10 text-[8px] tracking-[0.18em] uppercase bg-gold-700 text-white px-2 py-1 font-semibold">
              Coming Soon
            </span>
          )}
          {(product.newIn || (salePercent > 0 && !priceTbc)) && (
            <div className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-1.5">
              {product.newIn && (
                <span className="text-[8px] tracking-[0.18em] uppercase bg-white/90 text-gold-700 border border-gold-300 px-2 py-1 font-semibold">
                  New In
                </span>
              )}
              {salePercent > 0 && !priceTbc && (
                <span className="flex items-baseline gap-1.5 bg-gold-700 text-white px-2.5 py-1.5 leading-none">
                  <span className="text-[9px] tracking-[0.1em] uppercase font-semibold">Special Offer</span>
                  <span className="text-[11px] tracking-wide uppercase font-bold">{salePercent}% Off</span>
                </span>
              )}
            </div>
          )}

          {/*
            Product image loading:
            Save images to public/images/products/{slug}.jpg
            e.g. public/images/products/retatrutide.jpg
            The image will load automatically once placed there.

            object-cover fills the square fully (cropping rather than
            letterboxing) so rectangular product photos never show
            blank borders or background gaps. If a future photo's
            subject sits off-centre, adjust object-position per slug.
          */}
          {!imageError ? (
            <Image
              src={imageSrc}
              alt={product.name}
              fill
              className="object-cover object-center transition-transform duration-300 group-hover:scale-[1.03]"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              onError={() => setErroredImageSrc(imageSrc)}
            />
          ) : (
            // Fallback placeholder when image file doesn't exist yet
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-6">
              <div className="relative">
                <div className="w-11 h-2 bg-gold-400 rounded-sm mx-auto mb-0.5" />
                <div className="w-9 h-20 border border-gold-200 bg-white/90 mx-auto flex flex-col items-center justify-center rounded-b-sm">
                  <span className="text-[7px] tracking-widest text-gold-700 text-center leading-tight font-semibold">
                    WINDSOR<br />BEAUTY
                  </span>
                  <div className="mt-1 w-6 h-px bg-gold-200" />
                  <span className="mt-0.5 text-[7px] text-gold-700 tracking-wider">
                    {baseVariant.dosage}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product info */}
      <div className="flex flex-col flex-1 p-5">
        {product.categories.length > 0 && (
          // Every category the product belongs to, not just the first — the
          // card and the product page now agree. Dot-separated in the same
          // small-caps style so three or four categories still read cleanly
          // on a mobile card (the row wraps rather than truncates).
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mb-1.5">
            {product.categories.map((cat, i) => (
              <span key={cat} className="text-[10px] font-bold tracking-[0.22em] uppercase text-gold-700">
                {cat}
                {i < product.categories.length - 1 && <span className="ml-1.5 text-gold-700">·</span>}
              </span>
            ))}
          </div>
        )}

        <h3 className="text-sm font-semibold text-stone-800 tracking-wide mb-1.5 group-hover:text-gold-800 transition-colors">
          {product.name}
        </h3>

        {/* The rating is a shortcut straight to this product's reviews, not just
            decoration — customers tried to click it and nothing happened. It has
            to sit above the card's stretched link (z-[1]) or the anchor swallows
            the click and you land at the top of the product page instead. */}
        {reviewStats && reviewStats.count > 0 && (
          <Link
            href={`${shopUrl(product.slug)}#reviews`}
            className="relative z-10 inline-flex items-center gap-1.5 mb-2 self-start group/rating"
            aria-label={`Read ${reviewStats.count} review${reviewStats.count === 1 ? '' : 's'} of ${product.name}`}
          >
            <Stars rating={reviewStats.average} size={13} />
            <span className="text-[10px] text-stone-600 font-medium underline decoration-stone-300 underline-offset-2 group-hover/rating:text-gold-700 group-hover/rating:decoration-gold-400 transition-colors">
              ({reviewStats.count})
            </span>
          </Link>
        )}

        {product.shortDescription && (
          <p className="text-xs text-stone-500 leading-relaxed flex-1 mb-4">
            {product.shortDescription}
          </p>
        )}

        {/* Sizes */}
        <div className="flex flex-wrap gap-1 mb-4">
          {variants.map(v => (
            <span key={v.dosage} className="text-[10px] font-medium tracking-wide border border-gold-300 text-gold-700 px-2 py-0.5">
              {v.dosage}
            </span>
          ))}
        </div>

        {/* Price + actions */}
        <div className="flex items-center justify-between gap-2">
          {/* The catalogue price is the MEMBER price, so it is labelled as one
              (Samuel, 25 Sept 2026): a guest who saw an unlabelled £65 here
              and then £85 on the product page could feel misled. */}
          <span className="flex flex-col">
            {!priceTbc && (
              <span className="text-[8px] tracking-[0.16em] uppercase text-stone-500 font-medium">Member price</span>
            )}
            <span className="text-sm font-semibold text-gold-700 flex items-baseline gap-1.5">
              {priceTbc ? 'Price TBC' : salePercent > 0 ? (
                <>
                  <span className="text-stone-500 line-through font-normal text-xs">&pound;{baseVariant.price.toFixed(2)}</span>
                  From &pound;{discountedPrice.toFixed(2)}
                </>
              ) : (
                <>From &pound;{baseVariant.price.toFixed(2)}</>
              )}
            </span>
          </span>
          <div className="relative z-10 flex items-center gap-1.5">
            <button
              onClick={handleAddToCart}
              disabled={outOfStock || comingSoon || priceTbc}
              className={`text-[8px] tracking-[0.14em] uppercase px-3 py-1.5 transition-colors ${
                outOfStock || comingSoon || priceTbc
                  ? 'bg-stone-100 text-stone-500 cursor-not-allowed'
                  : 'bg-gold-700 text-white hover:bg-gold-800'
              }`}
            >
              {outOfStock ? 'Sold Out' : comingSoon || priceTbc ? 'Coming Soon' : 'Add'}
            </button>
            <Link
              href={shopUrl(product.slug)}
              className="text-[8px] tracking-[0.14em] uppercase text-stone-500 border border-stone-200 hover:border-gold-300 hover:text-gold-800 px-3 py-1.5 transition-colors"
            >
              View
            </Link>
          </div>
        </div>

        {/* Admin-only inline stock editor — edit stock without opening the product (task 6dc6c2ec) */}
        {isStaff && (
          <div
            className="relative z-10 mt-3 rounded border border-gold-300 bg-gold-50/60 px-2.5 py-2"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <p className="mb-1 flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-gold-700">
              <span className="rounded bg-gold-700 px-1 py-0.5 text-white">Admin</span> Stock
            </p>
            <ul className="space-y-1 text-[11px]">
              {variants.map((v) => {
                const s = stockFor(v.dosage);
                const tracked = typeof s === 'number';
                const isEditing = editingDosage === v.dosage;
                const isSaving = savingDosage === v.dosage;
                return (
                  <li key={v.dosage} className="flex items-center justify-between gap-2 min-h-[1.6rem]">
                    <span className="text-stone-600">{v.dosage}</span>
                    {isEditing ? (
                      <span className="flex items-center gap-1">
                        <input
                          type="number" min={0} step={1} inputMode="numeric" autoFocus
                          value={stockDraft} disabled={isSaving}
                          onChange={(e) => setStockDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveStock(v.dosage);
                            if (e.key === 'Escape') { setEditingDosage(null); setStockError(null); }
                          }}
                          className="w-14 rounded border border-gold-400 bg-white px-1.5 py-0.5 text-right tabular-nums text-stone-800 focus:outline-none focus:ring-2 focus:ring-gold-500"
                          aria-label={`Stock for ${product.name} ${v.dosage}`}
                        />
                        <button type="button" onClick={() => saveStock(v.dosage)} disabled={isSaving}
                          className="rounded bg-gold-700 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white hover:bg-gold-700 disabled:opacity-50">
                          {isSaving ? '…' : 'Save'}
                        </button>
                        <button type="button" onClick={() => { setEditingDosage(null); setStockError(null); }} disabled={isSaving}
                          className="px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-stone-500 hover:text-stone-700 disabled:opacity-50">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        {tracked
                          ? <span className={`font-semibold tabular-nums ${s <= 0 ? 'text-gold-700' : 'text-stone-800'}`}>{s}{s <= 0 ? ' · out' : ''}</span>
                          : <span className="text-stone-500">Not tracked</span>}
                        <button type="button"
                          onClick={() => { setEditingDosage(v.dosage); setStockDraft(tracked ? String(s) : ''); setStockError(null); }}
                          className="rounded border border-gold-300 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gold-700 hover:bg-gold-100 focus:outline-none focus:ring-2 focus:ring-gold-500">
                          Edit
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {stockError && <p className="mt-1 text-[10px] font-medium text-gold-700">{stockError}</p>}
            <p className="mt-1 text-[9px] text-stone-500">Only visible to you as an admin.</p>
          </div>
        )}
      </div>

      {pickerOpen && (
        <VariantPickerModal
          productName={product.name}
          variants={variants}
          soldOutDosages={soldOutDosages}
          onSelect={handleVariantPicked}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
