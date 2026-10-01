'use client';

import { useEffect, useState } from 'react';
import { useDialog } from './useDialog';
import { useViewportOwner } from './viewportOwner';
import { Product, ProductVariant, activeVariants } from '@/data/products';
import { ACETIC_ACID_SLUG } from '@/lib/upsells';

interface Props {
  product: Product;
  /** Live stock count from the admin panel. Undefined = untracked/unlimited. */
  stock?: number;
  onAdd: (variant: ProductVariant, quantity: number) => void;
  onSkip: () => void;
}

// Shown on the checkout page, immediately before the customer reaches payment,
// when Bacteriostatic Water isn't already in the basket. Either choice
// continues straight to the payment step.
export default function BacWaterUpsellModal({ product, stock, onAdd, onSkip }: Props) {
  const isAceticAcid = product.slug === ACETIC_ACID_SLUG;
  const variants = activeVariants(product).filter(v => v.price > 0);
  const [selected, setSelected] = useState<ProductVariant | undefined>(variants[0]);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [onSkip]);

  // Always open when it is rendered at all, so the hook is told so directly.
  // Owns the screen and locks the page behind it through the shared counter,
  // which restores the scroll position instantly. Doing it here meant an
  // animated scroll, because globals.css sets `html { scroll-behavior: smooth }`.
  useViewportOwner(true, 'bacwater-modal', { lockScroll: true });

  const dialog = useDialog({ open: true, labelledBy: 'bacwater-modal-title' });

  if (!selected) return null;

  const outOfStock = typeof stock === 'number' && stock <= 0;
  const maxQuantity = typeof stock === 'number' ? Math.max(1, stock) : 20;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onSkip} />

      <div {...dialog} className="relative bg-white border border-gold-200 shadow-2xl w-full max-w-sm px-6 pt-7 pb-6 sm:px-7 outline-none">
        <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700 mb-2">Before You Pay</p>
        <h2 id="bacwater-modal-title" className="font-serif text-2xl text-stone-800 tracking-wide leading-snug mb-2">
          Add {isAceticAcid ? 'Acetic Acid Water' : 'Bacteriostatic Water'}?
        </h2>
        <p className="text-xs text-stone-500 leading-relaxed mb-5">
          {isAceticAcid
            ? 'Something in your basket has to be mixed with acetic acid water rather than bacteriostatic water, or it can turn cloudy. If you don’t already have some, you can add a bottle to this order now.'
            : 'Many customers reconstituting peptides also order bacteriostatic water. If you don’t already have some, you can add a vial to this order now.'}
        </p>

        {/* Variant selector */}
        {variants.length > 1 && (
          <div className="flex gap-2 mb-4">
            {variants.map(v => (
              <button
                key={v.dosage}
                type="button"
                onClick={() => setSelected(v)}
                className={`flex-1 px-3 py-2.5 border text-xs tracking-wide transition-colors ${
                  selected.dosage === v.dosage
                    ? 'bg-gold-700 text-white border-gold-500'
                    : 'border-stone-200 text-stone-600 hover:border-gold-300 hover:text-gold-800'
                }`}
              >
                {v.dosage} &middot; &pound;{v.price.toFixed(2)}
              </button>
            ))}
          </div>
        )}

        {/* Product + quantity */}
        <div className="border border-gold-100 px-4 py-3.5 mb-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-stone-700">{product.name}</p>
              <p className="text-[10px] tracking-[0.15em] text-stone-500 uppercase mt-0.5">{selected.dosage}</p>
            </div>
            <span className="text-sm font-semibold text-gold-700 shrink-0">
              &pound;{selected.price.toFixed(2)} each
            </span>
          </div>

          {outOfStock ? (
            <p className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Currently out of stock</p>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[9px] tracking-[0.18em] uppercase text-stone-500">Quantity</span>
              <div className="flex items-center border border-stone-200">
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-8 h-8 text-stone-500 hover:text-gold-800 transition-colors flex items-center justify-center"
                >
                  &minus;
                </button>
                <span className="w-8 text-center text-sm text-stone-700 font-medium">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.min(maxQuantity, q + 1))}
                  className="w-8 h-8 text-stone-500 hover:text-gold-800 transition-colors flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        {!outOfStock && (
          <div className="flex items-center justify-between mb-5">
            <span className="text-[9px] tracking-[0.18em] uppercase text-stone-500">Subtotal</span>
            <span className="text-sm font-semibold text-gold-700">&pound;{(selected.price * quantity).toFixed(2)}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => onAdd(selected, quantity)}
          disabled={outOfStock}
          className="w-full bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase py-3.5 hover:bg-gold-800 transition-colors disabled:bg-stone-100 disabled:text-stone-300 disabled:cursor-not-allowed mb-3"
        >
          Add to Basket &amp; Continue
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="w-full text-center border border-stone-300 text-stone-600 text-[10px] tracking-[0.18em] uppercase py-3 hover:border-stone-400 hover:bg-stone-50 hover:text-stone-800 transition-colors"
        >
          Continue Without Bacteriostatic Water
        </button>
      </div>
    </div>
  );
}
