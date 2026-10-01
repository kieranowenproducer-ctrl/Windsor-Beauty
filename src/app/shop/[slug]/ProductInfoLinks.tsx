'use client';

import { productSpecs, type Product } from '@/data/products';

// Moved out of ProductPageClient.tsx unchanged. Every prop keeps the name it had
// as a local there, so the markup below is the same code that used to live in it.

interface Props {
  product: Product;
}

export default function ProductInfoLinks({ product }: Props) {
  return (
    <>
          {/* Jumps to the reviews section further down this page — works even
              when there are zero reviews, since ProductReviewsSection always
              renders its #reviews anchor with a "no reviews yet" message. */}
          <button
            type="button"
            onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })}
            className="block w-full text-center bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase py-3.5 hover:bg-gold-800 transition-colors mb-6"
          >
            See Reviews &amp; Leave a Review
          </button>

          {/* Product details */}
          <div className="border-t border-gold-100 pt-5 space-y-3">
            {productSpecs(product).map(({ label, value }) => (
              <div key={label} className="flex gap-4 text-xs">
                <span className="text-stone-500 w-20 shrink-0 tracking-[0.1em] uppercase text-[9px]">{label}</span>
                <span className="text-stone-600 leading-relaxed">{value}</span>
              </div>
            ))}
          </div>
    </>
  );
}
