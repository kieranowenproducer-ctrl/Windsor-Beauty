'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BackToHome from '@/components/BackToHome';
import ReviewCard, { type ReviewCardData } from '@/components/reviews/ReviewCard';
import ReviewForm from '@/components/reviews/ReviewForm';
import Stars from '@/components/reviews/Stars';
import ReviewsDisclaimer from '@/components/reviews/ReviewsDisclaimer';
import ProductReviewFilter from '@/components/reviews/ProductReviewFilter';
import VideoTestimonials from '@/components/VideoTestimonials';
import { PRODUCTS, mergeProducts } from '@/data/products';

interface PublicReviewData extends ReviewCardData {
  product_slugs: string[];
}

type ReviewSort = 'newest' | 'oldest' | 'highest' | 'lowest';

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<PublicReviewData[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, import('@/data/products').Product>>({});
  const [sort, setSort] = useState<ReviewSort>('newest');
  const [productFilter, setProductFilter] = useState('all');
  const [ratingFilter, setRatingFilter] = useState('all');
  // Set when someone arrives from the homepage carousel on /reviews#review-<id>.
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const products = useMemo(() => mergeProducts(PRODUCTS, overrides), [overrides]);
  const productNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of products) map[p.slug] = p.name;
    return map;
  }, [products]);

  function load() {
    fetch('/api/reviews/public')
      .then(res => res.json())
      .then(data => setReviews(data.reviews ?? []))
      .catch(() => setReviews([]));
  }

  // Tapping a review in the homepage carousel sends you here with that review
  // named in the address. The list arrives from an API call after this page has
  // mounted, so the browser's own jump to the anchor happens while the page is
  // still empty and lands nowhere. Once the reviews are on screen, go to it.
  useEffect(() => {
    if (!reviews || reviews.length === 0) return;
    const match = /^#review-(\d+)$/.exec(window.location.hash);
    if (!match) return;
    const id = Number(match[1]);
    if (!reviews.some((r) => r.id === id)) return; // deleted, or no longer approved
    const target = document.getElementById(`review-${id}`);
    if (!target) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Stop short of the top rather than under it: the sticky header and the
    // floating "Back to home" pill both sit up there, and a plain jump to the
    // anchor parks the first line of the review behind them. Measured from the
    // pill itself so it stays right if that cluster ever moves.
    const pill = document.querySelector('.fixed.left-4.z-40');
    const clearance = Math.round(pill?.getBoundingClientRect().bottom ?? 110) + 20;
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - clearance);
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    setHighlightId(id);
    const timer = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(timer);
  }, [reviews]);

  useEffect(() => {
    load();
    fetch('/api/admin/products/catalogue')
      .then(res => res.json())
      .then(data => {
        if (data.overrides && typeof data.overrides === 'object') setOverrides(data.overrides);
      })
      .catch(() => {});
  }, []);

  const approvedCount = reviews?.length ?? 0;
  const averageRating = useMemo(() => {
    if (!reviews || reviews.length === 0) return 0;
    return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  }, [reviews]);

  const reviewedProducts = useMemo(() => {
    if (!reviews) return [];
    const slugs = new Set(reviews.flatMap(review => review.product_slugs ?? []));
    return Array.from(slugs)
      .map(slug => {
        const product = products.find(item => item.slug === slug);
        return {
          slug,
          name: productNames[slug] ?? slug,
          categories: product?.categories ?? [],
          keywords: product?.keywords ?? [],
          brand: product?.brand,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [reviews, productNames, products]);

  const visibleReviews = useMemo(() => {
    if (!reviews) return [];
    const filtered = reviews.filter(review => {
      const matchesProduct = productFilter === 'all' || review.product_slugs?.includes(productFilter);
      const matchesRating = ratingFilter === 'all' || review.rating === Number(ratingFilter);
      return matchesProduct && matchesRating;
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'highest' || sort === 'lowest') {
        const ratingDifference = sort === 'highest' ? b.rating - a.rating : a.rating - b.rating;
        if (ratingDifference !== 0) return ratingDifference;
      }
      const dateDifference = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sort === 'oldest' ? -dateDifference : dateDifference;
    });
  }, [reviews, productFilter, ratingFilter, sort]);

  const filtersAreActive = productFilter !== 'all' || ratingFilter !== 'all' || sort !== 'newest';

  return (
    <>
      <BackToHome />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-20">

        <VideoTestimonials className="mb-16" />

        <div className="text-center mb-12">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Feedback</p>
          <h1 className="font-serif text-4xl sm:text-5xl text-stone-800 tracking-wide mb-4">Reviews</h1>
          <p className="text-sm text-stone-500 leading-relaxed max-w-md mx-auto">
            What customers are saying about their experience with Windsor Beauty.
          </p>
        </div>

        {/* Review summary + leave-a-review — single premium card */}
        {reviews && reviews.length > 0 && (
          <div
            className="mb-10"
            style={{
              background: 'linear-gradient(160deg, #fefcf6 0%, #fffdf8 60%, #fdf8ec 100%)',
              border: '1px solid #D4AF5A',
              boxShadow: '0 4px 32px 0 rgba(184,144,42,0.08), 0 1px 4px 0 rgba(184,144,42,0.10)',
            }}
          >
            {/* Score / stars / label */}
            <div className="text-center py-10 px-8 sm:py-12 sm:px-14">
              <div
                className="font-serif leading-none text-gold-700 mb-4"
                style={{ fontSize: 'clamp(80px, 14vw, 108px)', letterSpacing: '-0.02em' }}
              >
                {averageRating.toFixed(1)}
              </div>
              <div className="flex justify-center mb-3">
                <Stars rating={averageRating} size={28} />
              </div>
              <p className="font-serif text-xl sm:text-2xl text-stone-700 tracking-wide mb-3">
                Excellent
              </p>
              <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500">
                Based on <strong className="font-bold text-stone-700">{approvedCount}</strong> verified customer {approvedCount === 1 ? 'review' : 'reviews'}
              </p>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: 'rgba(212,175,90,0.35)' }} />

            {/* Leave a review — inline, no separate box */}
            <div className="px-8 py-8 sm:px-14 sm:py-10">
              <h2 className="font-serif text-2xl sm:text-3xl text-stone-800 tracking-wide text-center mb-5">Leave a Review</h2>
              <ReviewForm onSubmitted={load} />
            </div>
          </div>
        )}

        {/* Reviews list */}
        {reviews === null && (
          <p className="text-center text-xs text-stone-500">Loading reviews…</p>
        )}

        {reviews && reviews.length === 0 && (
          <div
            className="mb-10"
            style={{
              background: 'linear-gradient(160deg, #fefcf6 0%, #fffdf8 60%, #fdf8ec 100%)',
              border: '1px solid #D4AF5A',
              boxShadow: '0 4px 32px 0 rgba(184,144,42,0.08), 0 1px 4px 0 rgba(184,144,42,0.10)',
            }}
          >
            <div className="text-center py-10 px-8 sm:py-12 sm:px-14">
              <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700 mb-3">No Reviews Yet</p>
              <h3 className="font-serif text-2xl text-stone-800 mb-3">Be the First to Share Your Experience</h3>
              <p className="text-sm text-stone-500 leading-relaxed max-w-md mx-auto mb-7">
                Once you have placed an order, log in to your account from this page to leave a review.
              </p>
              <Link
                href="/shop"
                className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-9 py-4 hover:bg-gold-800 transition-colors"
              >
                Shop Skincare
              </Link>
            </div>
            <div style={{ height: '1px', background: 'rgba(212,175,90,0.35)' }} />
            <div className="px-8 py-8 sm:px-14 sm:py-10">
              <h2 className="font-serif text-2xl sm:text-3xl text-stone-800 tracking-wide text-center mb-5">Leave a Review</h2>
              <ReviewForm onSubmitted={load} />
            </div>
          </div>
        )}

        {reviews && reviews.length > 0 && (
          <section
            aria-label="Filter and sort reviews"
            className="mb-6 border border-gold-100 bg-[#fefcf7] px-4 py-5 sm:px-6"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.18em] text-stone-600">
                  Sort reviews
                </span>
                <select
                  value={sort}
                  onChange={event => setSort(event.target.value as ReviewSort)}
                  className="min-h-11 w-full border border-gold-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors focus:border-gold-600 focus:ring-2 focus:ring-gold-200"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="highest">Highest rated first</option>
                  <option value="lowest">Lowest rated first</option>
                </select>
              </label>

              <ProductReviewFilter
                products={reviewedProducts}
                value={productFilter}
                onChange={setProductFilter}
              />

              <label className="block">
                <span className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.18em] text-stone-600">
                  Rating
                </span>
                <select
                  value={ratingFilter}
                  onChange={event => setRatingFilter(event.target.value)}
                  className="min-h-11 w-full border border-gold-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors focus:border-gold-600 focus:ring-2 focus:ring-gold-200"
                >
                  <option value="all">All ratings</option>
                  {[5, 4, 3, 2, 1].map(rating => (
                    <option key={rating} value={rating}>{rating} star{rating === 1 ? '' : 's'}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex min-h-6 items-center justify-between gap-4 border-t border-gold-100 pt-4">
              <p aria-live="polite" className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-600">
                Showing {visibleReviews.length} of {approvedCount} reviews
              </p>
              {filtersAreActive && (
                <button
                  type="button"
                  onClick={() => {
                    setSort('newest');
                    setProductFilter('all');
                    setRatingFilter('all');
                  }}
                  className="min-h-11 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-700 underline underline-offset-4 hover:text-gold-800"
                >
                  Reset filters
                </button>
              )}
            </div>
          </section>
        )}

        {reviews && reviews.length > 0 && (
          visibleReviews.length > 0 ? (
            <div className="space-y-6">
              {visibleReviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  highlighted={review.id === highlightId}
                  onChanged={load}
                />
              ))}
            </div>
          ) : (
            <div className="border border-gold-100 px-6 py-10 text-center">
              <h2 className="font-serif text-xl text-stone-800">No matching reviews</h2>
              <p className="mt-2 text-sm text-stone-500">Try choosing a different product or rating.</p>
              <button
                type="button"
                onClick={() => {
                  setSort('newest');
                  setProductFilter('all');
                  setRatingFilter('all');
                }}
                className="mt-5 min-h-11 bg-gold-700 px-6 text-[10px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-gold-800"
              >
                Show all reviews
              </button>
            </div>
          )
        )}

        {/* Under the reviews, where somebody has just finished reading them
            (task 62253915). Shown whether or not there are any reviews yet. */}
        <div className="mt-10">
          <ReviewsDisclaimer />
        </div>
      </div>
    </>
  );
}
