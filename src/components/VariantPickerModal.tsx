'use client';

import { useEffect } from 'react';
import { useViewportOwner } from './viewportOwner';

export interface PickableVariant {
  dosage: string;
  price: number;
}

interface Props {
  productName: string;
  variants: PickableVariant[];
  /**
   * Dosages with none left. Shown, labelled and refused rather than hidden, so
   * a customer can see the strength exists and is simply out, and cannot put it
   * in the basket for checkout to turn down later. Omitted = nothing is sold out.
   */
  soldOutDosages?: string[];
  onSelect: (variant: PickableVariant) => void;
  onClose: () => void;
}

// Shared by every "quick add" surface (shop/homepage product cards, the
// frequently-bought-with carousel) that needs to ask which dosage/size the
// customer wants before adding to the basket, instead of silently adding
// the cheapest/first-listed variant. Tapping an option both selects and adds
// it in one action — there's no separate confirm step, since that's the
// whole point of a "quick add" shortcut.
export default function VariantPickerModal({ productName, variants, soldOutDosages = [], onSelect, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  // Owns the screen and locks the page behind it through the shared counter.
  // This one matters most after the basket: it opens from a "quick add" button
  // partway down the shop, so the page is always scrolled when it appears.
  // Restoring the position here meant an animated scroll, because globals.css
  // sets `html { scroll-behavior: smooth }`. See viewportOwner.ts.
  useViewportOwner(true, 'variant-picker', { lockScroll: true });

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white border border-gold-200 shadow-2xl w-full max-w-sm px-6 pt-7 pb-6 sm:px-7">
        <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700 mb-2">Choose an Option</p>
        <h2 className="font-serif text-2xl text-stone-800 tracking-wide leading-snug mb-5">
          {productName}
        </h2>

        <div className="space-y-2 mb-1">
          {variants.map(v => {
            const soldOut = soldOutDosages.includes(v.dosage);
            return (
              <button
                key={v.dosage}
                type="button"
                disabled={soldOut}
                onClick={() => onSelect(v)}
                className={`w-full flex items-center justify-between px-4 py-3 border text-sm tracking-wide transition-colors ${
                  soldOut
                    ? 'border-stone-100 text-stone-500 cursor-not-allowed'
                    : 'border-stone-200 text-stone-600 hover:border-gold-400 hover:bg-gold-50/50 hover:text-gold-800'
                }`}
              >
                <span className="flex items-baseline gap-2">
                  {v.dosage}
                  {soldOut && (
                    <span className="text-[8px] tracking-[0.18em] uppercase text-stone-500">Out of Stock</span>
                  )}
                </span>
                <span className={`font-semibold ${soldOut ? 'text-stone-500' : 'text-gold-700'}`}>
                  &pound;{v.price.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full text-center text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-stone-600 transition-colors mt-4 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
