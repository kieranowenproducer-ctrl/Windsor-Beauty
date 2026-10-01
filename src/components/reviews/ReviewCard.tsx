import Stars from './Stars';
import AdminReviewControls from './AdminReviewControls';
import { truncateDisplayName } from '@/lib/displayName';

export interface ReviewCardData {
  id: number;
  customer_name: string;
  rating: number;
  title: string | null;
  body: string;
  image_url?: string | null;
  admin_reply: string | null;
  created_at: string;
  product_slugs?: string[];
}

// Shared display card for a single approved review — used on the main
// /reviews page and on individual product pages.
export default function ReviewCard({
  review,
  highlighted = false,
  onChanged,
}: {
  review: ReviewCardData;
  /**
   * True when the customer arrived here by tapping this review in the homepage
   * carousel. Marks it for a few seconds so it is obvious which of a long list
   * they were sent to, then fades back to normal.
   */
  highlighted?: boolean;
  /**
   * Re-reads the review list. Passed by the pages that own the list so a change
   * made through the admin controls below shows immediately. Customers never
   * see those controls, so for them this is never called.
   */
  onChanged?: () => void;
}) {
  return (
    // The id is the landing point for /reviews#review-<id>. scroll-mt clears
    // the sticky header, so the review is never parked underneath it.
    <div
      id={`review-${review.id}`}
      className={`border p-6 sm:p-7 scroll-mt-48 transition-all duration-700 ${
        highlighted
          ? 'border-gold-400 bg-gold-50 shadow-[0_0_0_3px_rgba(212,175,90,0.28)]'
          : 'border-gold-100'
      }`}
    >
      <div className="flex items-center justify-between gap-4 mb-3">
        <Stars rating={review.rating} size={18} />
        <span className="text-[10px] text-stone-600 font-medium">
          {new Date(review.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>
      {review.title && (
        <h3 className="text-sm font-semibold text-stone-800 mb-1.5">{review.title}</h3>
      )}
      <p className="text-sm text-stone-500 leading-relaxed mb-3 whitespace-pre-wrap">{review.body}</p>

      {/* No review photo and no gold product label, by Samuel's call on
          27 Sep 2026. Both are still stored against the review (image_url,
          product_slugs), so the product filter on /reviews keeps working and
          either can be shown again without losing anything. */}
      <p className="text-[10px] tracking-[0.15em] uppercase text-stone-600 font-medium">
        {truncateDisplayName(review.customer_name)}
      </p>

      {review.admin_reply && (
        <div className="mt-4 ml-4 sm:ml-8 border-l-2 border-gold-200 bg-gold-50/40 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-5 h-5 rounded-full bg-gold-700 text-white font-serif text-[10px] flex items-center justify-center shrink-0">
              W
            </span>
            <span className="text-[9px] tracking-[0.18em] uppercase text-gold-700 font-semibold">
              Reply from Windsor Beauty
            </span>
          </div>
          <p className="text-xs text-stone-500 leading-relaxed whitespace-pre-wrap">{review.admin_reply}</p>
        </div>
      )}

      <AdminReviewControls review={review} onChanged={onChanged} />
    </div>
  );
}
