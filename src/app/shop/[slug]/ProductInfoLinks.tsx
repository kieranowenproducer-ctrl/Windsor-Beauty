'use client';

import Link from 'next/link';
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

          {/* Needle/sharps disclaimer — pre-dosed pens include a needle, so this must sit
              alongside the buy controls rather than being buried in the T&Cs */}
          {product.categories.includes('Pens') && (
            <div className="border border-gold-200 bg-gold-50/40 px-5 py-4 mb-6">
              <p className="text-xs text-stone-500 leading-relaxed">
                <span className="font-semibold text-stone-600">Needle usage disclaimer: </span>
                this pen is supplied with a needle for the lawful handling and reconstitution of
                research compounds only. It is not intended for human or animal use. See our{' '}
                <Link href="/terms" className="text-gold-700 hover:text-gold-800 underline">
                  Terms and Conditions
                </Link>{' '}
                for full details.
              </p>
            </div>
          )}

          {/* REMOVED 23 September 2026 (task 98b6dcc6). This said "Working out your dose for this
              compound? Our calculator finds the exact volume to draw", on the page selling the
              compound, addressing the reader about THEIR dose. On a shop whose every page also says
              "not for human consumption", it was the single clearest contradiction of that notice,
              and it is exactly the kind of thing Lilly pointed at in August 2026. The calculator
              still exists for signed-in members; it is simply no longer offered here. */}

          {/* Product specs */}
          <div className="border-t border-gold-100 pt-5 space-y-3">
            {productSpecs(product).map(({ label, value }) => (
              <div key={label} className="flex gap-4 text-xs">
                <span className="text-stone-500 w-16 shrink-0 tracking-[0.1em] uppercase text-[9px]">{label}</span>
                <span className="text-stone-600 leading-relaxed">{value}</span>
              </div>
            ))}
          </div>
    </>
  );
}
