'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ProductCard from '@/components/ProductCard';
import CarouselArrowButton from '@/components/CarouselArrowButton';
import type { Product } from '@/data/products';
import type { SiteSaleConfig } from '@/lib/siteSale';

interface Props {
  eyebrow: string;
  title: string;
  products: Product[];
  stockMap: Record<string, number>;
  /**
   * Per-size stock, slug -> size -> quantity. Without it a card can only
   * see a product's summed total, which cannot tell "one size gone" from
   * "all of them gone" — the difference the OUT OF STOCK stamp turns on.
   */
  variantStockMap?: Record<string, Record<string, number>>;
  reviewStats?: Record<string, { average: number; count: number }>;
  saleConfig?: SiteSaleConfig;
  /** Extra content rendered below the carousel track, e.g. a "Browse Catalogue" CTA. */
  children?: React.ReactNode;
  /**
   * Opt-in automatic paging on a timer — off by default, so every existing
   * usage (Featured, New In) is unaffected. Used by the Special Offers
   * carousel so the linked-product row keeps moving without the customer
   * having to use the arrows.
   */
  autoScroll?: boolean;
  /** Time between automatic advances, in ms. Defaults to 6000 (5-7s — slow enough to still click comfortably). */
  autoScrollIntervalMs?: number;
}

const SCROLL_EDGE_PX = 8;
const DEFAULT_AUTO_SCROLL_INTERVAL_MS = 6000;
// How long a manual interaction (hover, touch, arrow click) pauses the
// auto-advance before it resumes — long enough that paging through a couple
// of cards by hand doesn't immediately get fought by the timer.
const INTERACTION_PAUSE_MS = 4000;

// Shared horizontally-scrollable product showcase. On desktop (lg+), the
// native scrollbar is hidden in favour of circular arrow buttons next to the
// heading that page through the row via scrollBy — mobile/tablet keep the
// original touch-scroll/snap behaviour and visible scrollbar untouched.
export default function ProductCarousel({
  eyebrow, title, products, stockMap, variantStockMap, reviewStats, saleConfig, children,
  autoScroll = false, autoScrollIntervalMs = DEFAULT_AUTO_SCROLL_INTERVAL_MS,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [paused, setPaused] = useState(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [updateArrows, products.length]);

  function scrollByPage(direction: 1 | -1) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: 'smooth' });
  }

  // Pauses auto-advance immediately, and schedules it to resume after a
  // grace period — shared by hover-leave, touch-end, and manual arrow use,
  // so any kind of interaction gets the same "leave it alone for a bit"
  // treatment rather than fighting the customer mid-browse.
  const pauseThenResume = useCallback(() => {
    setPaused(true);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setPaused(false), INTERACTION_PAUSE_MS);
  }, []);

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!autoScroll || products.length <= 1 || paused) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - SCROLL_EDGE_PX;
      if (atEnd) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: el.clientWidth * 0.9, behavior: 'smooth' });
      }
    }, autoScrollIntervalMs);

    return () => clearInterval(timer);
  }, [autoScroll, autoScrollIntervalMs, products.length, paused]);

  if (products.length === 0) return null;

  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="relative text-center mb-12">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">{eyebrow}</p>
          <h2 className="font-serif text-3xl sm:text-4xl text-stone-800 tracking-wide">{title}</h2>

          {products.length > 1 && (
            <>
              {/* Desktop arrows — absolute-positioned beside the heading */}
              <div className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 items-center gap-2">
                <CarouselArrowButton direction="left" label="Previous products" onClick={() => { scrollByPage(-1); if (autoScroll) pauseThenResume(); }} disabled={!canScrollLeft} />
                <CarouselArrowButton direction="right" label="Next products" onClick={() => { scrollByPage(1); if (autoScroll) pauseThenResume(); }} disabled={!canScrollRight} />
              </div>
            </>
          )}
        </div>

        {/* Mobile / tablet arrows — shown below heading, hidden on desktop */}
        {products.length > 1 && (
          <div className="flex lg:hidden justify-end items-center gap-2 -mt-8 mb-6">
            <CarouselArrowButton direction="left" label="Previous products" onClick={() => { scrollByPage(-1); if (autoScroll) pauseThenResume(); }} disabled={!canScrollLeft} size="sm" />
            <CarouselArrowButton direction="right" label="Next products" onClick={() => { scrollByPage(1); if (autoScroll) pauseThenResume(); }} disabled={!canScrollRight} size="sm" />
          </div>
        )}

        <div
          ref={scrollRef}
          className="flex gap-5 lg:gap-8 overflow-x-auto snap-x snap-mandatory pb-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          onMouseEnter={autoScroll ? () => setPaused(true) : undefined}
          onMouseLeave={autoScroll ? () => setPaused(false) : undefined}
          onTouchStart={autoScroll ? () => setPaused(true) : undefined}
          onTouchEnd={autoScroll ? pauseThenResume : undefined}
        >
          {products.map(product => (
            <div key={product.id} className="snap-start shrink-0 w-[78%] sm:w-[340px] lg:w-[358px]">
              <ProductCard product={product} stock={stockMap[product.slug]} variantStock={variantStockMap?.[product.slug]} reviewStats={reviewStats?.[product.slug]} saleConfig={saleConfig} />
            </div>
          ))}
        </div>

        {children}
      </div>
    </section>
  );
}
