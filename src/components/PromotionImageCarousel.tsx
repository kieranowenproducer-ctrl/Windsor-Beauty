'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import CarouselArrowButton from '@/components/CarouselArrowButton';

interface Props {
  images: string[];
  alt: string;
  /**
   * The live "Automatic Sale Discount" percentage — when set and > 0, a
   * "Special Offer X% Off" badge is overlaid on the centre image.
   */
  discountPercent?: number;
}

const SWIPE_THRESHOLD_PX = 40;
const AUTO_PLAY_MS = 4500;

function DiscountBadge({ percent }: { percent: number }) {
  return (
    <span className="absolute bottom-3 left-3 z-30 flex items-baseline gap-1.5 bg-gold-700 text-white px-2.5 py-1.5 leading-none">
      <span className="text-[9px] tracking-[0.1em] uppercase font-semibold">Special Offer</span>
      <span className="text-[11px] tracking-wide uppercase font-bold">{percent}% Off</span>
    </span>
  );
}

// Coverflow-style carousel for the Special Offers banner. Auto-advances
// every AUTO_PLAY_MS ms; pauses when the pointer hovers over the active
// card (desktop) or when the user touches/holds (mobile); resumes when
// interaction ends.
export default function PromotionImageCarousel({ images, alt, discountPercent }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const count = images.length;
  const canPrev = index > 0;
  const canNext = index < count - 1;

  const goPrev = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex(i => Math.min(count - 1, i + 1)), [count]);

  // Auto-play cycles through images (does not wrap — stops at last, then restarts).
  useEffect(() => {
    if (count <= 1) return;
    if (paused) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(() => {
      setIndex(i => (i + 1) % count);
    }, AUTO_PLAY_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, count]);

  if (count === 0) return null;

  if (count === 1) {
    return (
      <div className="relative w-full max-w-sm mx-auto aspect-square mb-6 rounded-2xl overflow-hidden border border-stone-100 bg-gradient-to-br from-stone-50 to-gold-50">
        {/* Inset and contained for the same reason as the multi-image case below. */}
        <div className="absolute inset-0 p-4">
          <div className="relative w-full h-full">
            <Image
              src={images[0]}
              alt={alt}
              fill
              className="object-contain object-center pointer-events-none"
              sizes="384px"
            />
          </div>
        </div>
        {Boolean(discountPercent && discountPercent > 0) && <DiscountBadge percent={discountPercent!} />}
      </div>
    );
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    setPaused(true);
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (delta > SWIPE_THRESHOLD_PX) goPrev();
    else if (delta < -SWIPE_THRESHOLD_PX) goNext();
    setPaused(false);
  }

  return (
    <div className="mb-6">
      <div
        className="relative w-full max-w-[220px] sm:max-w-[280px] md:max-w-[320px] aspect-square mx-auto touch-pan-y select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {images.map((src, i) => {
          const offset = i - index;
          if (Math.abs(offset) > 1) return null;
          const isCenter = offset === 0;

          return (
            <button
              key={src + i}
              type="button"
              disabled={isCenter}
              aria-label={isCenter ? `${alt}, image ${i + 1} of ${count}` : offset < 0 ? 'Show previous image' : 'Show next image'}
              onClick={() => setIndex(i)}
              onMouseEnter={() => isCenter && setPaused(true)}
              onMouseLeave={() => isCenter && setPaused(false)}
              style={{ transform: `translateX(${offset * 68}%) scale(${isCenter ? 1 : 0.74})` }}
              className={`absolute inset-0 rounded-2xl overflow-hidden border bg-gradient-to-br from-stone-50 to-gold-50 transition-transform duration-300 ease-out ${
                isCenter
                  ? 'z-20 border-gold-200 shadow-lg cursor-default'
                  : 'z-10 border-stone-100 opacity-55 hover:opacity-80 cursor-pointer'
              }`}
            >
              {/* Inset so the photo is framed rather than bled to the edge, and
                  contained so a promo image the admin uploaded at any shape is
                  shown whole. Same rule as customer review photos: we do not
                  control what gets uploaded, so we never crop it. */}
              <span className="absolute inset-0 block p-4">
                <span className="relative block w-full h-full">
                  <Image
                    src={src}
                    alt={`${alt}, image ${i + 1} of ${count}`}
                    fill
                    className="object-contain object-center pointer-events-none"
                    sizes="320px"
                  />
                </span>
              </span>
              {isCenter && Boolean(discountPercent && discountPercent > 0) && <DiscountBadge percent={discountPercent!} />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4 mt-5">
        <CarouselArrowButton direction="left" label="Previous image" onClick={goPrev} disabled={!canPrev} size="sm" hiddenBelow="sm" />

        <div className="flex items-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Go to image ${i + 1}`}
              className={`rounded-full transition-all duration-300 ${
                i === index ? 'w-3 h-1.5 bg-gold-700' : 'w-1.5 h-1.5 bg-stone-200 hover:bg-stone-300'
              }`}
            />
          ))}
        </div>

        <CarouselArrowButton direction="right" label="Next image" onClick={goNext} disabled={!canNext} size="sm" hiddenBelow="sm" />
      </div>
    </div>
  );
}
