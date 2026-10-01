'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useCart } from '@/contexts/CartContext';
import { useDialog } from './useDialog';
import { useViewportOwner } from './viewportOwner';
import AccountIncentiveBanner from './AccountIncentiveBanner';
import UpsellCarousel from './UpsellCarousel';
import MemberPriceOfferModal from './MemberPriceOfferModal';
import MemberSavingsNote from './MemberSavingsNote';
import { useIsLoggedIn } from '@/hooks/useIsLoggedIn';

// Mirrors ProductCard's image loading: same /images/products/{slug}.jpg path
// and the same WG placeholder fallback, just scaled down for the basket row.
function CartThumbnail({ slug, name, image }: { slug: string; name: string; image?: string }) {
  // Compared against the failed src, not a plain boolean — see ProductCard.tsx for why.
  const [erroredImageSrc, setErroredImageSrc] = useState<string | null>(null);
  const imageSrc = image || `/images/products/${slug}.jpg`;
  const imageError = erroredImageSrc === imageSrc;

  return (
    <div className="relative w-16 h-16 bg-gradient-to-br from-stone-50 to-gold-50 border border-gold-100 overflow-hidden shrink-0">
      {!imageError ? (
        <Image
          src={imageSrc}
          alt={name}
          fill
          className="object-cover object-center"
          sizes="64px"
          onError={() => setErroredImageSrc(imageSrc)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-[7px] tracking-widest text-gold-700 text-center leading-tight">
            WG
          </span>
        </div>
      )}
    </div>
  );
}

// Slide-in basket drawer: shows the current cart contents (thumbnails,
// quantity controls, subtotal, free-shipping progress, checkout links) plus
// an upsell carousel and needle-usage disclaimer when relevant. It renders
// nothing until CartContext's drawerOpen flag is true — opened via
// openDrawer() (e.g. after adding an item) and dismissed via closeDrawer(),
// backdrop click, or the close button.
// penSlugs comes in as a prop rather than being derived here from PRODUCTS.
// This component lives in the site-wide layout, so importing the catalogue put
// all 59KB of product data into the shared client bundle of EVERY page — the
// homepage, Contact, the policy pages, all of it — purely to work out which
// slugs are pens for one disclaimer. Every byte in that bundle has to arrive
// and be parsed before the header becomes pressable, which is the fault this
// change is part of fixing. The layout is a server component and works the
// list out there instead; only the handful of slugs crosses to the browser.
export default function CartDrawer({ penSlugs = [] }: { penSlugs?: string[] }) {
  const { items, drawerOpen, closeDrawer, removeItem, updateQty, clearCart, totalPrice, totalItems, lastAddedSlug, priceForItem, memberSaving } = useCart();
  const penSlugSet = new Set(penSlugs);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number | null>(null);
  const [ukDeliveryRate, setUkDeliveryRate] = useState<number | null>(null);
  const [memberOfferOpen, setMemberOfferOpen] = useState(false);
  const isLoggedIn = useIsLoggedIn();

  useEffect(() => {
    fetch('/api/shipping-rates')
      .then(r => r.json())
      .then(data => {
        if (typeof data.freeShippingThreshold === 'number') {
          setFreeShippingThreshold(data.freeShippingThreshold);
        }
        if (typeof data.ukStandardRate === 'number') {
          setUkDeliveryRate(data.ukStandardRate);
        }
      })
      .catch(() => {});
  }, []);

  // The drawer owns the screen while it is open, and the page behind it is
  // locked (position:fixed prevents iOS momentum scroll on the document, which
  // is what made the background visibly shift while the drawer's own contents
  // scrolled).
  //
  // This used to capture and restore the scroll position itself. Two faults in
  // that, both measured on the live site on 14 August: closing the drawer from
  // 1000px down left the page still travelling through 424 a moment later,
  // because globals.css sets `html { scroll-behavior: smooth }` and so putting
  // the page back ANIMATED it, on phone and desktop alike. And any other
  // overlay open at the same time cleared the same four body properties on its
  // own way out. The shared counter in viewportOwner.ts restores instantly and
  // only once the last layer has gone.
  useViewportOwner(drawerOpen, 'cart-drawer', { lockScroll: true });

  // Escape closes it, Tab stays inside it, and focus goes back to whatever
  // opened it. Named off the "Basket" heading so a screen reader says what
  // has opened instead of announcing an unnamed dialog.
  const dialog = useDialog({ open: drawerOpen, onClose: closeDrawer, labelledBy: 'cart-drawer-title' });

  if (!drawerOpen) return null;

  const shippingFreeAt = freeShippingThreshold ?? null;
  const toFreeShipping = shippingFreeAt !== null ? Math.max(0, shippingFreeAt - totalPrice) : null;
  const freeShippingProgress = shippingFreeAt && shippingFreeAt > 0
    ? Math.min(100, Math.round((totalPrice / shippingFreeAt) * 100))
    : null;

  return (
    <>
      <MemberPriceOfferModal open={memberOfferOpen} items={items} nonMemberTotal={totalPrice} onClose={() => setMemberOfferOpen(false)} onContinue={() => { setMemberOfferOpen(false); closeDrawer(); window.location.assign('/checkout'); }} />
      {/* Backdrop — touch-action none so a gesture starting here never
          scrolls the page behind it, same as TermsAcceptanceModal's backdrop. */}
      <div
        className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
        style={{ touchAction: 'none' }}
        onClick={closeDrawer}
      />

      {/* Drawer panel */}
      <div {...dialog} className="fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-white shadow-2xl flex flex-col outline-none">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gold-100">
          <div>
            <h2 id="cart-drawer-title" className="text-xs tracking-[0.2em] uppercase font-semibold text-stone-700">
              Basket
            </h2>
            <p className="text-[9px] text-stone-500 mt-0.5">
              {totalItems} item{totalItems !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={closeDrawer}
            className="p-1.5 text-stone-500 hover:text-stone-700 transition-colors"
            aria-label="Close basket"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Items — overscroll-contain + touch-action stop a swipe gesture
            here from chaining into the backdrop/page behind the drawer,
            same as TermsAcceptanceModal's own scroll container. */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-6 py-4"
          style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
        >
          {items.some(item => penSlugSet.has(item.slug)) && (
            <div className="border border-gold-200 bg-gold-50/40 px-4 py-3 mb-4">
              <p className="text-[10px] text-stone-500 leading-relaxed">
                <span className="font-semibold text-stone-600">Needle usage disclaimer: </span>
                pens in your basket are supplied with a needle for lawful research handling and
                reconstitution only, not for human or animal use.
              </p>
            </div>
          )}
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
              <svg className="w-10 h-10 text-stone-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <p className="text-sm text-stone-500">Your basket is empty</p>
              <button
                onClick={closeDrawer}
                className="text-[9px] tracking-[0.2em] uppercase text-gold-700 hover:text-gold-800 transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map(item => (
                <li
                  key={`${item.productId}-${item.variant}`}
                  className="flex gap-4 py-4 border-b border-stone-50"
                >
                  <CartThumbnail slug={item.slug} name={item.name} image={item.image} />

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-stone-800 truncate">{item.name}</p>
                    <p className="text-[9px] text-stone-500 tracking-wider mb-2">{item.variant}</p>

                    {/* Qty controls */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center border border-stone-200">
                        <button
                          onClick={() => updateQty(item.productId, item.variant, item.quantity - 1)}
                          className="w-6 h-6 text-stone-500 hover:text-gold-800 transition-colors text-xs flex items-center justify-center"
                        >
                          &minus;
                        </button>
                        <span className="w-7 text-center text-xs text-stone-700 font-medium">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQty(item.productId, item.variant, item.quantity + 1)}
                          className="w-6 h-6 text-stone-500 hover:text-gold-800 transition-colors text-xs flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(item.productId, item.variant)}
                        className="text-[9px] tracking-wider text-stone-500 hover:text-red-400 transition-colors uppercase ml-1"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="text-sm font-semibold text-gold-700 shrink-0">
                    &pound;{(priceForItem(item) * item.quantity).toFixed(2)}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Upsell recommendations — after items, before the checkout
              footer below (which is a separate, always-visible element and
              is never affected by this section's content or absence). */}
          {items.length > 0 && <UpsellCarousel primarySlug={lastAddedSlug ?? undefined} compact />}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-gold-100 px-6 py-5 space-y-3">
            {freeShippingProgress !== null && (
              <div className="mb-1">
                {toFreeShipping === 0 ? (
                  <p className="text-[9px] tracking-[0.15em] uppercase text-green-600 font-semibold text-center mb-1.5">
                    Free UK shipping unlocked
                  </p>
                ) : (
                  <p className="text-[9px] tracking-[0.13em] uppercase text-stone-500 text-center mb-1.5">
                    Add <span className="text-stone-600 font-semibold">&pound;{toFreeShipping!.toFixed(2)}</span> for free UK shipping
                  </p>
                )}
                <div className="h-1 bg-stone-100 w-full">
                  <div
                    className="h-1 bg-gold-400 transition-all duration-300"
                    style={{ width: `${freeShippingProgress}%` }}
                  />
                </div>
              </div>
            )}
            <AccountIncentiveBanner subtotal={totalPrice} saving={memberSaving} className="mb-1" />
            <MemberSavingsNote compact className="mb-1" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs tracking-[0.15em] uppercase text-stone-500">Subtotal</span>
              <span className="text-base font-semibold text-gold-700">
                &pound;{totalPrice.toFixed(2)}
              </span>
            </div>
            {/* The delivery charge was a 9px grey line under the subtotal, easy to miss
                (Samuel's video, 26 Sept 2026). It is now a row of its own at the same
                size as the subtotal, so nobody meets the £10 for the first time at checkout. */}
            {ukDeliveryRate === null ? (
              <p className="text-xs text-stone-600 mb-3">Delivery is worked out at checkout.</p>
            ) : ukDeliveryRate === 0 || (freeShippingThreshold !== null && totalPrice >= freeShippingThreshold) ? (
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="tracking-[0.15em] uppercase text-stone-500">UK delivery</span>
                <span className="font-semibold text-stone-800">Free</span>
              </div>
            ) : (
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="tracking-[0.15em] uppercase text-stone-500">UK delivery</span>
                  <span className="font-semibold text-stone-800">&pound;{ukDeliveryRate.toFixed(2)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-stone-600">Added at checkout, on top of the subtotal.</p>
              </div>
            )}
            <Link
              href="/checkout"
              onClick={(event) => { if (isLoggedIn === false) { event.preventDefault(); setMemberOfferOpen(true); } else closeDrawer(); }}
              className="block w-full bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase text-center py-3.5 hover:bg-gold-800 transition-colors"
            >
              Proceed to Checkout
            </Link>
            <Link
              href="/cart"
              onClick={closeDrawer}
              className="block w-full text-center border border-stone-200 text-stone-500 text-[10px] tracking-[0.18em] uppercase py-3 hover:border-gold-300 hover:text-gold-800 transition-colors"
            >
              View Full Basket
            </Link>
            <button
              type="button"
              onClick={clearCart}
              className="block w-full text-center text-[11px] tracking-[0.18em] uppercase font-semibold underline underline-offset-4 decoration-1 py-2 text-stone-700 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            >
              Empty basket
            </button>
          </div>
        )}

        {/* Research notice */}
        <div className="px-6 pb-4">
          <p className="text-[8px] text-stone-500 text-center tracking-wider">
            For research use only. Not for human consumption.
          </p>
        </div>
      </div>
    </>
  );
}
