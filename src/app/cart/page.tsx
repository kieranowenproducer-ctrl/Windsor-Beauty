'use client';

import Link from 'next/link';
import { shopUrl } from '@/lib/slugAliases';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useCart } from '@/contexts/CartContext';
import AccountIncentiveBanner from '@/components/AccountIncentiveBanner';
import MemberSavingsNote from '@/components/MemberSavingsNote';
import PromotionsAppliedBlock from '@/components/PromotionsAppliedBlock';
import UpsellCarousel from '@/components/UpsellCarousel';
import { usePromotionPreview } from '@/hooks/usePromotionPreview';
import { useIsLoggedIn } from '@/hooks/useIsLoggedIn';
import MemberPriceOfferModal from '@/components/MemberPriceOfferModal';

// Mirrors ProductCard's image loading: same /images/products/{slug}.jpg path
// and the same WG placeholder fallback, just scaled down for the basket row.
function CartThumbnail({ slug, name, image }: { slug: string; name: string; image?: string }) {
  // Compared against the failed src, not a plain boolean — see ProductCard.tsx for why.
  const [erroredImageSrc, setErroredImageSrc] = useState<string | null>(null);
  const imageSrc = image || `/images/products/${slug}.jpg`;
  const imageError = erroredImageSrc === imageSrc;

  return (
    <div className="relative w-20 h-20 bg-gradient-to-br from-stone-50 to-gold-50 border border-gold-100 overflow-hidden shrink-0">
      {!imageError ? (
        <Image
          src={imageSrc}
          alt={name}
          fill
          className="object-cover object-center"
          sizes="80px"
          onError={() => setErroredImageSrc(imageSrc)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-[8px] tracking-widest text-gold-700 text-center leading-tight">
            WINDSOR<br />GLOW
          </span>
        </div>
      )}
    </div>
  );
}

export default function CartPage() {
  const { items, removeItem, updateQty, totalPrice, totalItems, clearCart, priceForItem, memberSaving } = useCart();
  const promoPreview = usePromotionPreview(items);
  const displayTotal = promoPreview ? promoPreview.subtotalAfterRules : totalPrice;
  const [memberOfferOpen, setMemberOfferOpen] = useState(false);
  const isLoggedIn = useIsLoggedIn();
  // Delivery used to read "Calculated at checkout" here. Samuel noticed the
  // cost of delivery is what puts people off, so the flat UK rate is shown up
  // front, from the same settings the checkout charges.
  const [deliveryRates, setDeliveryRates] = useState<{ rate: number; freeFrom: number | null } | null>(null);
  useEffect(() => {
    fetch('/api/shipping-rates')
      .then(r => r.json())
      .then(data => {
        if (typeof data.ukStandardRate === 'number') {
          setDeliveryRates({
            rate: data.ukStandardRate,
            freeFrom: typeof data.freeShippingThreshold === 'number' ? data.freeShippingThreshold : null,
          });
        }
      })
      .catch(() => {});
  }, []);
  const ukDelivery = deliveryRates === null ? null : {
    rate: deliveryRates.rate,
    free: deliveryRates.rate === 0 || (deliveryRates.freeFrom !== null && totalPrice >= deliveryRates.freeFrom),
  };

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-24 text-center">
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Basket</p>
        <h1 className="font-serif text-4xl text-stone-800 tracking-wide mb-6">Your basket is empty</h1>
        <p className="text-sm text-stone-500 mb-8">You haven't added any products yet.</p>
        <Link
          href="/shop"
          className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:bg-gold-800 transition-colors"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
      <MemberPriceOfferModal open={memberOfferOpen} items={items} nonMemberTotal={totalPrice} onClose={() => setMemberOfferOpen(false)} onContinue={() => { setMemberOfferOpen(false); window.location.assign('/checkout'); }} />
      <div className="mb-10">
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-1">Windsor Beauty</p>
        <h1 className="font-serif text-4xl text-stone-800 tracking-wide">
          Basket ({totalItems} item{totalItems !== 1 ? 's' : ''})
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

        {/* Items list */}
        <div className="lg:col-span-2">
          <div className="border-t border-gold-100">
            {items.map(item => (
              <div
                key={`${item.productId}-${item.variant}`}
                className="flex gap-5 py-6 border-b border-gold-50"
              >
                <CartThumbnail slug={item.slug} name={item.name} image={item.image} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link
                        href={shopUrl(item.slug)}
                        className="text-sm font-semibold text-stone-800 hover:text-gold-800 transition-colors"
                      >
                        {item.name}
                      </Link>
                      <p className="text-[9px] tracking-[0.15em] text-stone-500 uppercase mt-0.5">
                        {item.variant}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-gold-700 shrink-0">
                      &pound;{(priceForItem(item) * item.quantity).toFixed(2)}
                    </span>
                  </div>

                  <p className="text-[9px] text-stone-500 mt-1">
                    &pound;{priceForItem(item).toFixed(2)} each
                  </p>

                  <div className="flex items-center gap-4 mt-3">
                    {/* Qty */}
                    <div className="flex items-center border border-stone-200">
                      <button
                        onClick={() => updateQty(item.productId, item.variant, item.quantity - 1)}
                        className="w-8 h-8 text-stone-500 hover:text-gold-800 transition-colors flex items-center justify-center"
                      >
                        &minus;
                      </button>
                      <span className="w-8 text-center text-sm text-stone-700 font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(item.productId, item.variant, item.quantity + 1)}
                        className="w-8 h-8 text-stone-500 hover:text-gold-800 transition-colors flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(item.productId, item.variant)}
                      className="text-[9px] tracking-[0.15em] uppercase text-stone-500 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4">
            <Link
              href="/shop"
              className="text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-800 transition-colors"
            >
              &larr; Continue Shopping
            </Link>
            <button
              onClick={clearCart}
              className="text-[10px] tracking-[0.18em] uppercase font-semibold underline underline-offset-4 decoration-1 text-stone-700 hover:text-red-700 transition-colors"
            >
              Clear Basket
            </button>
          </div>
        </div>

        {/* Order summary */}
        <div>
          <div className="border border-gold-100 p-6 lg:sticky lg:top-24">
            <h2 className="text-xs tracking-[0.2em] uppercase text-stone-500 font-semibold mb-5">
              Order Summary
            </h2>

            <div className="space-y-3 mb-5">
              {items.map(item => (
                <div key={`${item.productId}-${item.variant}`} className="flex justify-between text-xs">
                  <span className="text-stone-500">
                    {item.name} ({item.variant}) x{item.quantity}
                  </span>
                  <span className="text-stone-700 font-medium">
                    &pound;{(priceForItem(item) * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <AccountIncentiveBanner subtotal={totalPrice} saving={memberSaving} className="mb-4" />
            <MemberSavingsNote className="mb-4" />

            <PromotionsAppliedBlock preview={promoPreview} />

            <div className="border-t border-gold-100 pt-4 mb-2">
              <div className="flex justify-between text-xs mb-2">
                <span className="text-stone-500 uppercase tracking-wider">Subtotal</span>
                <span className="font-medium text-stone-700">&pound;{totalPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-stone-500 uppercase tracking-wider">Shipping</span>
                <span className="text-stone-800 font-semibold text-right">
                  {ukDelivery === null
                    ? 'Calculated at checkout'
                    : ukDelivery.free
                      ? 'Free UK delivery'
                      : `£${ukDelivery.rate.toFixed(2)} UK, added at checkout`}
                </span>
              </div>
            </div>

            <div className="border-t border-gold-200 pt-4 mb-5">
              <div className="flex justify-between">
                <span className="text-xs uppercase tracking-wider text-stone-600 font-semibold">Total</span>
                <span className="text-lg font-semibold text-gold-700">
                  &pound;{displayTotal.toFixed(2)}
                </span>
              </div>
            </div>

            <Link
              href="/checkout"
              onClick={(event) => { if (isLoggedIn === false) { event.preventDefault(); setMemberOfferOpen(true); } }}
              className="block w-full bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase text-center py-3.5 hover:bg-gold-800 transition-colors mb-3"
            >
              Proceed to Checkout
            </Link>

            <p className="text-[9px] text-stone-500 text-center tracking-wider">
              For research use only. Not for human consumption.
            </p>
          </div>
        </div>
      </div>

      <UpsellCarousel />
    </div>
  );
}
