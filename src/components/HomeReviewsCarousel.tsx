'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Stars from '@/components/reviews/Stars';
import ReviewsDisclaimer from '@/components/reviews/ReviewsDisclaimer';
import CarouselArrowButton from '@/components/CarouselArrowButton';
import { truncateDisplayName } from '@/lib/displayName';

export interface HomeReviewCardData {
  id: number;
  customer_name: string;
  rating: number;
  title: string | null;
  body: string;
  image_url?: string | null;
  created_at: string;
}

interface Props {
  reviews: HomeReviewCardData[];
  /** Mean rating across every approved review, not just the ones shown here. */
  averageRating?: number;
  /** How many approved reviews that mean is drawn from. */
  reviewCount?: number;
}

const AUTO_PLAY_MS = 5000;
const SWIPE_THRESHOLD_PX = 40;

// The word printed under the score. Derived from the score rather than fixed,
// so the homepage can never advertise "Excellent" over a middling average.
function ratingLabel(average: number): string {
  if (average >= 4.5) return 'Excellent';
  if (average >= 3.5) return 'Great';
  if (average >= 2.5) return 'Average';
  if (average >= 1.5) return 'Poor';
  return 'Bad';
}

// The trusted-rating badge that sits above the section heading: the same score,
// stars, label and count as the summary card on /reviews, sized down to a band
// so it introduces the carousel instead of pushing it off the screen.
function RatingSummary({ average, count }: { average: number; count: number }) {
  if (count < 1 || average <= 0) return null;

  return (
    <div className="max-w-md mx-auto mb-12">
      <div
        className="text-center px-8 py-7 sm:px-10 sm:py-8"
        style={{
          background: 'linear-gradient(160deg, #fefcf6 0%, #fffdf8 60%, #FBF7F1 100%)',
          border: '1px solid #C7A769',
          boxShadow: '0 4px 32px 0 rgba(173,142,84,0.08), 0 1px 4px 0 rgba(173,142,84,0.10)',
        }}
      >
        <div
          className="font-serif leading-none text-gold-700 mb-3"
          style={{ fontSize: 'clamp(46px, 9vw, 60px)', letterSpacing: '-0.02em' }}
        >
          {average.toFixed(1)}
        </div>
        <div className="flex justify-center mb-2.5">
          <Stars rating={average} size={22} />
        </div>
        <p className="font-serif text-lg sm:text-xl text-stone-700 tracking-wide mb-2">
          {ratingLabel(average)}
        </p>
        <p className="text-[10px] tracking-[0.2em] uppercase text-stone-500">
          Based on {count} verified customer {count === 1 ? 'review' : 'reviews'}
        </p>
      </div>
    </div>
  );
}

// Coverflow-style carousel for the homepage. The active card sits large
// and centred; adjacent cards are visible but smaller and faded to the
// sides — matching the PromotionImageCarousel style used on /promotion.
// Auto-advances every AUTO_PLAY_MS ms; pauses on hover (desktop) or
// touch/hold (mobile); resumes when interaction ends.
export default function HomeReviewsCarousel({ reviews, averageRating = 0, reviewCount = 0 }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // A swipe ends with your finger on a card, and a card is a link now, so the
  // browser would follow it and take you off the homepage when all you did was
  // flick to the next review. A swipe closes this window for a moment and the
  // click that follows it is ignored. A tap never opens it.
  const ignoreClicksUntil = useRef(0);

  const count = reviews.length;

  const goPrev = useCallback(() => setIndex(i => (i - 1 + count) % count), [count]);
  const goNext = useCallback(() => setIndex(i => (i + 1) % count), [count]);

  // Auto-play: advances only when not paused and there is more than one card.
  useEffect(() => {
    if (count <= 1) return;
    if (paused) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(goNext, AUTO_PLAY_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, count, goNext]);

  // Touch swipe support.
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    setPaused(true);
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) > SWIPE_THRESHOLD_PX) {
      ignoreClicksUntil.current = Date.now() + 400;
      if (delta > 0) goPrev();
      else goNext();
    }
    setPaused(false);
  }

  // Shared by every card: follow the link on a tap, ignore the one that a
  // swipe leaves behind.
  function handleCardClick(e: React.MouseEvent, i: number) {
    if (Date.now() < ignoreClicksUntil.current) {
      e.preventDefault();
      return;
    }
    setIndex(i);
  }

  if (count === 0) return null;

  // Single card: no controls.
  if (count === 1) {
    const r = reviews[0];
    return (
      <section id="customer-reviews" className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <RatingSummary average={averageRating} count={reviewCount} />
          <div className="text-center mb-10">
            <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Customer Reviews</p>
            <h2 className="font-serif text-3xl sm:text-4xl text-stone-800 tracking-wide">What Customers Are Saying</h2>
          </div>
          {/* Clickable for the same reason as the cards below: the body is cut
              short here, and the whole review is on the Reviews page. */}
          <Link
            href={`/reviews#review-${r.id}`}
            aria-label={`Read the full review from ${truncateDisplayName(r.customer_name)}`}
            className="block max-w-md mx-auto bg-white border border-gold-100 hover:border-gold-400 transition-colors"
          >
            <div className="p-6 sm:p-8">
              <Stars rating={r.rating} size={18} className="mb-2" />
              {r.title && <h3 className="text-sm font-semibold text-stone-800 mb-1.5">{r.title}</h3>}
              <p className="text-sm text-stone-500 leading-relaxed mb-3 line-clamp-5">{r.body}</p>
              <p className="text-[10px] tracking-[0.15em] uppercase text-stone-600 font-medium">{truncateDisplayName(r.customer_name)}</p>
              <p className="text-[10px] text-stone-500 font-medium mt-0.5">
                {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </Link>
          <div className="text-center mt-8">
            <Link href="/reviews" className="inline-block border border-gold-300 text-gold-700 text-[10px] tracking-[0.22em] uppercase px-9 py-4 hover:bg-gold-50 transition-colors">
              Read More Customer Reviews
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="customer-reviews" className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <RatingSummary average={averageRating} count={reviewCount} />
        <div className="text-center mb-10">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Customer Reviews</p>
          <h2 className="font-serif text-3xl sm:text-4xl text-stone-800 tracking-wide">What Customers Are Saying</h2>
        </div>

        {/* Coverflow stage */}
        <div
          className="relative w-full overflow-hidden touch-pan-y select-none"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Cards positioned absolutely so they can overlap and scale.
              The stage height is set at the same breakpoint the card changes
              at, not by viewport width, because the card grows at `sm` (roomier
              padding) and a vw-based height would clip it on a tablet. Cards
              are 320px below sm and 350px above, text only since review photos
              were taken off the site on 27 Sep 2026, so each step leaves a
              little headroom. */}
          <div className="relative flex items-center justify-center h-[345px] sm:h-[375px]">
            {reviews.map((review, i) => {
              const offset = i - index;
              // Wrap offset so the carousel feels circular for ±1 neighbours.
              const wrappedOffset = offset > count / 2 ? offset - count : offset < -count / 2 ? offset + count : offset;
              if (Math.abs(wrappedOffset) > 1) return null;

              const isCenter = wrappedOffset === 0;

              return (
                // Every card opens the review it is showing. The card only has
                // room for the first few lines, so a tap on one is a tap on that
                // review: it lands on the Reviews page at that exact review,
                // full text, product tags and any reply from us. Browsing the
                // carousel is what the arrows, the dots, the swipe and the
                // automatic rotation are for.
                <Link
                  key={review.id}
                  href={`/reviews#review-${review.id}`}
                  aria-label={`Read the full review from ${truncateDisplayName(review.customer_name)}`}
                  onClick={(e) => handleCardClick(e, i)}
                  style={{
                    transform: `translateX(${wrappedOffset * 66}%) scale(${isCenter ? 1 : 0.76})`,
                    // The side cards used to sit at 48% opacity so the middle one
                    // stood out. It worked, and it also faded their wording to
                    // 1.9:1 against white — the review text on either side of the
                    // middle was there, and unreadable. Nothing else on the page
                    // was anywhere near that bad.
                    //
                    // The hierarchy does not need the fade. The side cards are
                    // already three quarters the size, sitting behind, with a pale
                    // border and no shadow, while the middle one has the gold
                    // border and the lift. Only the transparency has gone.
                    transition: 'transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94)',
                    zIndex: isCenter ? 20 : 10,
                  }}
                  // Fixed height, not auto: a short review would otherwise be
                  // a small card beside a long one. Every card is the same
                  // rectangle, and the
                  // body flexes so the name and date always sit at the foot.
                  className={`absolute bg-white flex flex-col text-left overflow-hidden w-[min(78vw,360px)] sm:w-[340px] lg:w-[380px] h-[320px] sm:h-[350px] cursor-pointer ${
                    isCenter
                      ? 'border border-gold-200 shadow-md hover:border-gold-400'
                      : 'border border-stone-100 hover:border-gold-200'
                  }`}
                >
                  <div className="p-5 sm:p-7 flex flex-col flex-1 min-h-0">
                    <Stars rating={review.rating} size={16} className="mb-2 shrink-0" />
                    {/* Title and review body share one flexible region, and the
                        stars above and the attribution below cannot be shrunk.
                        That ordering is deliberate: a long title used to push
                        the customer's name and date clean out of the bottom of
                        the card (two of the eight live reviews were losing
                        their attribution on a phone). Now a long title simply
                        leaves less room for the body, and the region fades out
                        rather than stopping dead mid-sentence. The card links
                        to the full review either way.

                        The body used to carry `line-clamp-4 flex-1`, which did
                        nothing at all: a direct flex child is blockified, so
                        the `display: -webkit-box` that line-clamp relies on
                        became `flow-root` and the clamp was silently dropped.
                        The text was being guillotined by overflow alone, with
                        no ellipsis. The fade is pure CSS and costs nothing on a
                        short review, because the band it softens is empty. */}
                    <div
                      className="flex-1 min-h-0 overflow-hidden mb-3"
                      style={{
                        maskImage: 'linear-gradient(to bottom, black calc(100% - 30px), transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 30px), transparent 100%)',
                      }}
                    >
                      {review.title && (
                        <h3 className="text-sm font-semibold text-stone-800 mb-1.5 text-left">{review.title}</h3>
                      )}
                      <p className="text-sm text-stone-500 leading-relaxed text-left">{review.body}</p>
                    </div>
                    <p className="text-[10px] tracking-[0.15em] uppercase text-stone-600 font-medium text-left shrink-0">
                      {truncateDisplayName(review.customer_name)}
                    </p>
                    <p className="text-[10px] text-stone-500 font-medium mt-0.5 text-left shrink-0">
                      {new Date(review.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Controls: arrows + dots */}
        <div className="flex items-center justify-center gap-5 mt-6">
          <CarouselArrowButton
            direction="left"
            label="Previous review"
            onClick={goPrev}
            disabled={false}
          />

          <div className="flex items-center gap-1.5">
            {reviews.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to review ${i + 1}`}
                // The dot you can see stays 6px. The thing you press is 24px,
                // which is the minimum a finger can be expected to hit, and the
                // dots were 6x6 — three of them in a row, each smaller than the
                // gap between them. The padding is what you press; the span is
                // what you see.
                className="flex items-center justify-center h-6 w-6 -mx-1"
              >
                <span
                  className={`block rounded-full transition-all duration-300 ${
                    i === index ? 'w-4 h-1.5 bg-gold-700' : 'w-1.5 h-1.5 bg-stone-200 hover:bg-stone-300'
                  }`}
                />
              </button>
            ))}
          </div>

          <CarouselArrowButton
            direction="right"
            label="Next review"
            onClick={goNext}
            disabled={false}
          />
        </div>

        <div className="text-center mt-8">
          <Link
            href="/reviews"
            className="inline-block border border-gold-300 text-gold-700 text-[10px] tracking-[0.22em] uppercase px-9 py-4 hover:bg-gold-50 transition-colors"
          >
            Read More Customer Reviews
          </Link>
        </div>

        {/* Real review text is shown here too, so the disclaimer travels with it
            (task 62253915). Compact: this block already has its own framing. */}
        <div className="mt-8">
          <ReviewsDisclaimer compact />
        </div>
      </div>
    </section>
  );
}
