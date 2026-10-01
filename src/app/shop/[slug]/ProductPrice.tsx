'use client';

import Link from 'next/link';
import { memberPricingEnabled, nonMemberPrice } from '@/lib/memberPricing';
import type { Product, ProductVariant } from '@/data/products';

// Moved out of ProductPageClient.tsx unchanged. Every prop keeps the name it had
// as a local there, so the markup below is the same code that used to live in it.

interface Props {
  product: Product;
  variant: ProductVariant;
  priceTbc: boolean;
  salePercent: number;
  discountedPrice: number;
  isMember: boolean;
}

export default function ProductPrice({
  product, variant, priceTbc, salePercent, discountedPrice, isMember,
}: Props) {
  return (
    <>
          {/* Price. On the members-pricing TEST product, the current price is
              the MEMBER price: guests see it beside a +20% non-member price
              and a strong free-membership invitation; logged-in customers see
              the member price as theirs. Display only for this trial - the
              basket still charges the current price for everyone. */}
          {memberPricingEnabled(product.slug) && !priceTbc ? (
            isMember ? (
              // Samuel, 26 Sept 2026 (video): the member saving was a 9px tag and an 11px grey
              // line nobody read. The price a non-member would pay now sits struck through beside
              // the member price, and the saving is a gold tag in the Beauty Card's gradient.
              <div className="mb-5">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-3xl font-semibold text-gold-700">&pound;{discountedPrice.toFixed(2)}</span>
                  <span className="text-lg text-stone-500 line-through">
                    <span className="sr-only">Non-member price </span>&pound;{nonMemberPrice(discountedPrice).toFixed(2)}
                  </span>
                </div>
                <p className="mt-2.5 inline-flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border border-[#d8c483] bg-[linear-gradient(145deg,#fffaf0,#f2e5bf)] px-3.5 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-800">Member price</span>
                  <span className="font-serif text-xl leading-none text-gold-800 animate-glow motion-reduce:animate-none">
                    You save &pound;{(nonMemberPrice(discountedPrice) - discountedPrice).toFixed(2)}
                  </span>
                </p>
                <p className="mt-1.5 text-xs text-stone-600">
                  Because you are a Windsor Beauty member. Non-members pay &pound;{nonMemberPrice(discountedPrice).toFixed(2)}.
                </p>
              </div>
            ) : (
              <div className="mb-5">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[10px] tracking-[0.18em] uppercase text-stone-500">Non-member price</span>
                  <span className="text-xl font-medium text-stone-500">&pound;{nonMemberPrice(discountedPrice).toFixed(2)}</span>
                </div>
                <div className="mt-3 border border-gold-300 bg-gold-50/70 p-4">
                  <p className="text-[10px] tracking-[0.18em] uppercase text-gold-700 font-semibold">Member price</p>
                  <p className="mt-1 flex items-baseline gap-2.5 flex-wrap">
                    <span className="text-3xl font-semibold text-gold-700">&pound;{discountedPrice.toFixed(2)}</span>
                    <span className="text-[11px] font-medium text-stone-600">members save at least 20%</span>
                  </p>
                  <p className="mt-2 text-xs text-stone-600 leading-relaxed">
                    Membership is free. Join in under a minute and pay the member price on every order.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Link
                      href="/account/register"
                      className="flex-1 bg-gold-700 text-white text-center text-[10px] tracking-[0.22em] uppercase font-semibold py-3 hover:bg-gold-800 transition-colors"
                    >
                      Sign Up Free
                    </Link>
                    <Link
                      href="/account/login"
                      className="flex-1 border border-gold-400 text-gold-700 text-center text-[10px] tracking-[0.22em] uppercase font-semibold py-3 hover:bg-gold-100 transition-colors"
                    >
                      Log In
                    </Link>
                  </div>
                </div>
              </div>
            )
          ) : (
          <div className="flex items-baseline gap-3 mb-5">
            {priceTbc ? (
              <span className="text-2xl font-semibold text-gold-700">Price TBC</span>
            ) : salePercent > 0 ? (
              <>
                <span className="text-lg text-stone-500 line-through">&pound;{variant.price.toFixed(2)}</span>
                <span className="text-2xl font-semibold text-gold-700">&pound;{discountedPrice.toFixed(2)}</span>
              </>
            ) : (
              <span className="text-2xl font-semibold text-gold-700">&pound;{variant.price.toFixed(2)}</span>
            )}
          </div>
          )}
    </>
  );
}
