'use client';

import Image from 'next/image';
import { shopUrl } from '@/lib/slugAliases';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCart } from '@/contexts/CartContext';
import CarouselArrowButton from '@/components/CarouselArrowButton';
import VariantPickerModal from '@/components/VariantPickerModal';

interface Recommendation {
  slug: string;
  productId: string;
  name: string;
  variant: string;
  price: number;
  image?: string;
  message: string | null;
  variants: { dosage: string; price: number }[];
}

// Mirrors CartDrawer's own CartThumbnail fallback — same slug-image path and
// WG monogram placeholder when a product has no photo yet.
function UpsellThumbnail({ slug, name, image }: { slug: string; name: string; image?: string }) {
  // Compared against the failed src, not a plain boolean — see ProductCard.tsx for why.
  const [erroredImageSrc, setErroredImageSrc] = useState<string | null>(null);
  const imageSrc = image || `/images/products/${slug}.jpg`;
  const imageError = erroredImageSrc === imageSrc;

  return (
    <div className="relative w-full aspect-square bg-gradient-to-br from-stone-50 to-gold-50 border border-gold-100 overflow-hidden">
      {!imageError ? (
        <Image
          src={imageSrc}
          alt={name}
          fill
          className="object-cover object-center"
          sizes="160px"
          onError={() => setErroredImageSrc(imageSrc)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-[8px] tracking-widest text-gold-700 text-center leading-tight">WG</span>
        </div>
      )}
    </div>
  );
}

interface UpsellCarouselProps {
  /**
   * An extra product slug to trigger recommendations for, alongside whatever
   * is actually in the basket — used on a product page to show this
   * product's upsells, which may not be in the basket yet. Also tells the
   * server which product's manually-set heading to use (see `primary` on
   * /api/upsells) — without it (the basket drawer/cart page, where several
   * different trigger products may be present with no single obvious
   * anchor), the default heading is used instead. Recommendations still
   * exclude anything already truly in the basket, and (since this slug is
   * added to the same exclusion set used for "already in basket") the
   * viewed product itself can never recommend itself back via another
   * item's rule.
   */
  extraTriggerSlug?: string;
  /**
   * The product most recently added to the basket — used by the basket
   * popup ONLY to pick which product's basket-context heading to show.
   * Unlike `extraTriggerSlug`, this does NOT add to the trigger set (the
   * item is already in `items`, since it's already in the basket).
   */
  primarySlug?: string;
  /** Smaller cards/type for the narrow basket-drawer popup. Defaults to the larger, full-width-page sizing used on /cart and product pages. */
  compact?: boolean;
}

// Data-driven recommendation row, powered by the admin-managed upsell system
// (CSV import and/or the manual per-product editor, see /admin/upsells) via
// the shared computeUpsellRecommendations engine behind /api/upsells — used
// in three places: the basket popup, the full /cart page, and product pages.
// The heading is resolved server-side (admin-editable per product) and comes
// back in the same fetch, so this component just displays whatever the API
// says. Renders nothing whenever there's nothing to show: empty basket/no
// extraTriggerSlug, system disabled, no matching rules, or any fetch error.
// This is deliberate — a bad/missing upsell response must never show an
// error or break the page it's embedded in, only quietly omit the section,
// per the "safe fallback" requirement the feature was built around.
const SCROLL_EDGE_PX = 8;

export default function UpsellCarousel({ extraTriggerSlug, primarySlug, compact = false }: UpsellCarouselProps) {
  const { items, addItem } = useCart();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [heading, setHeading] = useState('');
  const [addedSlug, setAddedSlug] = useState<string | null>(null);
  const [pickerSlug, setPickerSlug] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Only the SET of distinct trigger slugs should cause a refetch — changing
  // quantity on an existing basket item shouldn't re-query.
  const basketKey = useMemo(() => {
    const slugs = new Set(items.map(i => i.slug));
    if (extraTriggerSlug) slugs.add(extraTriggerSlug);
    return Array.from(slugs).sort().join(',');
  }, [items, extraTriggerSlug]);

  useEffect(() => {
    if (!basketKey) {
      setRecommendations([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ basket: basketKey });
    if (extraTriggerSlug) {
      params.set('primary', extraTriggerSlug);
      params.set('context', 'product');
    } else if (primarySlug) {
      params.set('primary', primarySlug);
      params.set('context', 'basket');
    }
    fetch(`/api/upsells?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setRecommendations(Array.isArray(data?.recommendations) ? data.recommendations : []);
        setHeading(typeof data?.heading === 'string' ? data.heading : '');
      })
      .catch(() => {
        if (!cancelled) setRecommendations([]);
      });
    return () => { cancelled = true; };
  }, [basketKey, extraTriggerSlug, primarySlug]);

  // Scroll-edge tracking for the arrow buttons — used in both layouts: the
  // compact basket sidebar (arrows underneath, see below) and the full-width
  // /cart and product-page rows (arrows beside the heading), since either
  // can now overflow once there are more recommendations than fit on screen.
  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > SCROLL_EDGE_PX);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - SCROLL_EDGE_PX);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [updateArrows, recommendations.length]);

  if (recommendations.length === 0) return null;

  function scrollByPage(direction: 1 | -1) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: 'smooth' });
  }

  function addRecommendation(rec: Recommendation, dosage: string, price: number) {
    addItem({
      productId: rec.productId,
      name: rec.name,
      slug: rec.slug,
      variant: dosage,
      price,
      quantity: 1,
      image: rec.image,
    });
    setAddedSlug(rec.slug);
    setTimeout(() => setAddedSlug(prev => (prev === rec.slug ? null : prev)), 1500);
    // No manual refetch needed — `items` changing re-derives `basketKey`,
    // which re-runs the effect above and naturally drops this product from
    // the next response (it's now in the basket).
  }

  function handleAdd(rec: Recommendation) {
    // Guard rapid double-taps: once a card has just been added (the 1.5s
    // "Added" window), ignore repeat activations so tapping twice can't add
    // two. The card also drops out of the list once it's in the basket.
    if (addedSlug === rec.slug) return;
    // Never silently assume the cheapest/first-listed option — ask when
    // there's more than one to choose from.
    if (rec.variants.length > 1) {
      setPickerSlug(rec.slug);
      return;
    }
    addRecommendation(rec, rec.variant, rec.price);
  }

  const cardWidth = compact ? 'w-28' : 'w-36 sm:w-40';
  const cardPad = compact ? 'p-2' : 'p-3';

  return (
    <div className={compact ? 'mt-2 mb-3' : 'mb-12'}>
      <div className={compact ? '' : 'flex items-center justify-between gap-3 flex-wrap mb-6'}>
        <p className={compact
          ? 'text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-3'
          : 'font-serif text-2xl text-stone-800 tracking-wide'
        }>
          {heading}
        </p>
        {/* Beside the heading, matching ProductCarousel/HomeReviewsCarousel —
            only the full-width layout uses this; the compact basket sidebar
            keeps its own underneath-the-row arrows below. */}
        {!compact && recommendations.length > 1 && (
          <div className="flex items-center gap-2 shrink-0">
            <CarouselArrowButton direction="left" label="Previous recommendations" onClick={() => scrollByPage(-1)} disabled={!canScrollLeft} />
            <CarouselArrowButton direction="right" label="Next recommendations" onClick={() => scrollByPage(1)} disabled={!canScrollRight} />
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory pb-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
      >
        {recommendations.map(rec => (
          // Two distinct surfaces (task 3e612c60): tapping the PRODUCT (image,
          // name, price — anywhere except the gold bar) opens its product page;
          // only the "+ Add" button adds to basket (with the dosage picker for
          // multi-variant items). Built with the stretched-link pattern — an
          // absolutely-positioned link fills the card and the Add button sits
          // above it (z-10) — so there is no invalid nested-interactive markup
          // and both surfaces are separately keyboard-focusable.
          <div
            key={rec.slug}
            className={`relative group snap-start shrink-0 ${cardWidth} border border-gold-100 bg-white ${cardPad} flex flex-col transition-shadow hover:shadow-md hover:border-gold-300 focus-within:ring-2 focus-within:ring-gold-500 focus-within:ring-offset-1`}
          >
            <Link
              href={shopUrl(rec.slug)}
              aria-label={`View ${rec.name}`}
              title={`View ${rec.name}`}
              className="absolute inset-0 z-[5] focus:outline-none"
            />
            <div className={compact ? 'mb-1.5' : 'mb-2'}>
              <UpsellThumbnail slug={rec.slug} name={rec.name} image={rec.image} />
            </div>
            <p className={`font-semibold text-stone-700 leading-snug mb-0.5 ${compact ? 'text-[9px] line-clamp-1' : 'text-xs line-clamp-2'}`}>{rec.name}</p>
            <p className={`text-gold-700 font-semibold mb-1.5 ${compact ? 'text-[10px]' : 'text-sm'}`}>&pound;{rec.price.toFixed(2)}</p>
            {/* The italic custom-message line is dropped in compact mode —
                the basket drawer is too tight on vertical space to spend it
                on optional copy; the full-width /cart and product-page
                layouts keep it. */}
            {!compact && rec.message && (
              <p className="text-stone-500 italic leading-snug mb-1.5 line-clamp-2 text-[10px]">&ldquo;{rec.message}&rdquo;</p>
            )}
            <button
              type="button"
              aria-label={`Add ${rec.name} to basket`}
              title={`Add ${rec.name} to basket`}
              onClick={e => { e.preventDefault(); e.stopPropagation(); handleAdd(rec); }}
              className={`relative z-10 mt-auto w-full text-center bg-gold-700 text-white tracking-[0.1em] uppercase transition-colors hover:bg-gold-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-1 ${compact ? 'text-[8px] py-1.5' : 'text-[9px] py-2'}`}
            >
              {addedSlug === rec.slug ? 'Added' : '+ Add'}
            </button>
          </div>
        ))}
      </div>

      {/* Underneath the row, not flanking it — the basket sidebar is too
          narrow for side arrows. Only shown in compact mode, and only once
          there's more than one card to page through. */}
      {compact && recommendations.length > 1 && (
        <div className="flex justify-center items-center gap-3 mt-3">
          <CarouselArrowButton direction="left" label="Previous upsell products" onClick={() => scrollByPage(-1)} disabled={!canScrollLeft} size="sm" />
          <CarouselArrowButton direction="right" label="Next upsell products" onClick={() => scrollByPage(1)} disabled={!canScrollRight} size="sm" />
        </div>
      )}

      {pickerSlug && (() => {
        const rec = recommendations.find(r => r.slug === pickerSlug);
        if (!rec) return null;
        return (
          <VariantPickerModal
            productName={rec.name}
            variants={rec.variants}
            onSelect={v => {
              addRecommendation(rec, v.dosage, v.price);
              setPickerSlug(null);
            }}
            onClose={() => setPickerSlug(null)}
          />
        );
      })()}
    </div>
  );
}
