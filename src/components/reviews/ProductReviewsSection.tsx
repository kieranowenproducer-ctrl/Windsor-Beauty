'use client';

import { useEffect, useState } from 'react';
import Stars from './Stars';
import ReviewCard, { type ReviewCardData } from './ReviewCard';
import ReviewForm from './ReviewForm';
import ReviewsDisclaimer from './ReviewsDisclaimer';

const PAGE_SIZE = 5;

// Trustpilot-style review block for an individual product page: average
// rating + count, a short list of approved reviews mapped to this product
// (with "show more" paging), and a form for logged-in customers to leave a
// review for this specific product.
export default function ProductReviewsSection({
  productSlug,
  productName,
  onStats,
}: {
  productSlug: string;
  /** Used in the "see what buyers say" line so it names the product, not "this item". */
  productName?: string;
  /** Reports the loaded rating up to the product page, so the summary beside the
   *  product name comes from this one fetch rather than a second call for the
   *  same numbers. */
  onStats?: (stats: { count: number; average: number }) => void;
}) {
  const [reviews, setReviews] = useState<ReviewCardData[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  function load() {
    fetch(`/api/reviews/product/${productSlug}`)
      .then(res => res.json())
      .then(data => setReviews(data.reviews ?? []))
      .catch(() => setReviews([]));
  }

  useEffect(() => {
    load();
    setVisibleCount(PAGE_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when the product changes. load is redefined on every render, so listing it would refetch the reviews continuously.
  }, [productSlug]);

  const count = reviews?.length ?? 0;
  const average = count > 0 ? reviews!.reduce((sum, r) => sum + r.rating, 0) / count : 0;

  useEffect(() => {
    if (reviews === null) return;
    onStats?.({ count, average });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report the totals up to the parent when the reviews themselves change. onStats comes from the parent and is usually an inline function, so listing it would fire this on every render.
  }, [reviews, count, average]);

  // Someone arriving from a rating on the shop grid asked for the reviews, so
  // put them on the reviews. The browser's own #reviews jump fires before this
  // list has loaded, and the page then grows underneath them and carries the
  // section off-screen — so scroll again once the reviews are actually here.
  useEffect(() => {
    if (reviews === null) return;
    if (typeof window === 'undefined' || window.location.hash !== '#reviews') return;
    // Twice on purpose. The product images and the "frequently bought with"
    // carousel above finish loading after the first scroll and push this
    // section down the page, so a single jump leaves the reviews half off
    // screen. The second pass corrects for that once the page has settled.
    const ids = [150, 900].map(delay =>
      window.setTimeout(() => {
        document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, delay)
    );
    return () => ids.forEach(window.clearTimeout);
  }, [reviews]);

  return (
    // The offset clears the sticky header stack AND the floating Back button
    // pinned just below it, so "Customer Reviews" is not half-hidden behind
    // them when the page jumps here.
    <div
      id="reviews"
      className="border-t border-gold-100 pt-12"
      style={{ scrollMarginTop: 'calc(var(--site-header-stack-height, 150px) + 70px)' }}
    >
      <h2 className="font-serif text-2xl text-stone-800 tracking-wide mb-6">
        Customer Reviews
      </h2>

      {reviews === null && (
        <p className="text-xs text-stone-500">Loading reviews…</p>
      )}

      {reviews !== null && count > 0 && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl font-semibold text-stone-800">{average.toFixed(1)}</span>
            <Stars rating={average} size={22} />
            <span className="text-xs text-stone-500">
              Based on {count} review{count === 1 ? '' : 's'}
            </span>
          </div>

          {/* The reason customers are asked which product they are reviewing:
              their words sell that product to the next person reading it. */}
          <p className="text-sm text-stone-500 leading-relaxed mb-8">
            {count} customer{count === 1 ? ' has' : 's have'} reviewed{' '}
            <span className="text-stone-700 font-medium">{productName ?? 'this product'}</span>.
            See what they say about it before you buy.
          </p>
        </>
      )}

      {reviews !== null && count === 0 && (
        <p className="text-sm text-stone-500 mb-8">
          No reviews yet for this product. Be the first to share your experience.
        </p>
      )}

      {reviews !== null && count > 0 && (
        <div className="space-y-6 mb-8">
          {reviews.slice(0, visibleCount).map(review => (
            <ReviewCard key={review.id} review={review} onChanged={load} />
          ))}
        </div>
      )}

      {reviews !== null && visibleCount < count && (
        <div className="mb-10">
          <button
            type="button"
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="border border-gold-300 text-gold-700 text-[9px] tracking-[0.2em] uppercase px-5 py-2.5 hover:border-gold-500 hover:bg-gold-50 transition-colors"
          >
            Show More Reviews
          </button>
        </div>
      )}

      <div className="border border-gold-100 p-6 sm:p-8">
        <h3 className="text-sm font-semibold text-stone-800 mb-4">Leave a Review for This Product</h3>
        <ReviewForm productSlug={productSlug} onSubmitted={load} />
      </div>

      {/* Reviews are read in full here too, and this is the page somebody is on
          when deciding to buy, so the disclaimer belongs here (task 62253915). */}
      <div className="mt-8">
        <ReviewsDisclaimer />
      </div>
    </div>
  );
}
