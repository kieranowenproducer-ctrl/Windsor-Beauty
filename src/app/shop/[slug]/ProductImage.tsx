'use client';

import Image from 'next/image';
import type { Product, ProductVariant } from '@/data/products';

// Moved out of ProductPageClient.tsx unchanged. Every prop keeps the name it had
// as a local there, so the markup below is the same code that used to live in it.

interface Props {
  product: Product;
  variant: ProductVariant;
  imageSrc: string;
  imageError: boolean;
  setErroredImageSrc: (value: string | null) => void;
  salePercent: number;
  priceTbc: boolean;
  comingSoon: boolean;
  everyDosageSoldOut: boolean;
}

export default function ProductImage({
  product, variant, imageSrc, imageError, setErroredImageSrc, salePercent, priceTbc, comingSoon, everyDosageSoldOut,
}: Props) {
  return (
    <>
        {/* Product image */}
        <div className="aspect-square bg-gradient-to-br from-stone-50 to-gold-50 border border-stone-100 relative overflow-hidden">
          {product.badge && (
            <span className="absolute top-4 left-4 z-10 text-[8px] tracking-[0.18em] uppercase bg-gold-700 text-white px-2 py-1 font-semibold">
              {product.badge}
            </span>
          )}
          {everyDosageSoldOut && (
            <span className="absolute top-4 right-4 z-10 text-[8px] tracking-[0.18em] uppercase bg-stone-700 text-white px-2 py-1 font-semibold">
              Out of Stock
            </span>
          )}
          {comingSoon && (
            <span className="absolute top-4 right-4 z-10 text-[8px] tracking-[0.18em] uppercase bg-gold-700 text-white px-2 py-1 font-semibold">
              Coming Soon
            </span>
          )}
          {(product.newIn || (salePercent > 0 && !priceTbc)) && (
            <div className="absolute bottom-4 left-4 z-10 flex flex-col items-start gap-1.5">
              {product.newIn && (
                <span className="text-[8px] tracking-[0.18em] uppercase bg-white/90 text-gold-700 border border-gold-300 px-2 py-1 font-semibold">
                  New In
                </span>
              )}
              {salePercent > 0 && !priceTbc && (
                <span className="flex items-baseline gap-1.5 bg-gold-700 text-white px-2.5 py-1.5 leading-none">
                  <span className="text-[9px] tracking-[0.1em] uppercase font-semibold">Special Offer</span>
                  <span className="text-[11px] tracking-wide uppercase font-bold">{salePercent}% Off</span>
                </span>
              )}
            </div>
          )}

          {/*
            object-cover fills the square fully (cropping rather than
            letterboxing) so rectangular product photos never show
            blank borders or background gaps — matches ProductCard.
            Save real photos to public/images/products/{slug}.jpg
          */}
          {!imageError ? (
            <Image
              key={imageSrc}
              src={imageSrc}
              alt={product.name}
              fill
              className="object-cover object-center"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
              onError={() => setErroredImageSrc(imageSrc)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4">
              <div className="relative">
                <div className="w-14 h-3 bg-gold-400 rounded-sm mx-auto mb-1" />
                <div className="w-12 h-28 border border-gold-200 bg-white/90 mx-auto flex flex-col items-center justify-center rounded-b-sm shadow-sm">
                  <span className="text-[8px] tracking-widest text-gold-700 text-center leading-tight font-semibold">
                    WINDSOR<br />GLOW
                  </span>
                  <div className="mt-1.5 w-8 h-px bg-gold-200" />
                  <span className="mt-1 text-[8px] text-gold-700 font-medium">{product.name}</span>
                  <span className="text-[7px] text-gold-700">{variant.dosage}</span>
                  {product.purity && (
                    <span className="text-[7px] text-stone-500 mt-1">{product.purity} Purity</span>
                  )}
                </div>
              </div>
              <span className="text-[9px] text-stone-500 tracking-[0.2em] uppercase">
                For Research Use Only
              </span>
            </div>
          )}
        </div>
    </>
  );
}
