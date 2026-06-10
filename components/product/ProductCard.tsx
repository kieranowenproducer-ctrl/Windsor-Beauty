"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatPrice, type Product } from "@/lib/products";
import ProductImage from "./ProductImage";

export default function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();

  return (
    <div className="group flex flex-col">
      <Link href={`/shop/${product.slug}`} className="block">
        <div className="relative">
          <ProductImage product={product} className="aspect-[4/5] w-full" />
          {product.badge && (
            <span className="absolute left-3 top-3 bg-brand-charcoal text-brand-cream text-[9px] tracking-widest uppercase px-2.5 py-1">
              {product.badge}
            </span>
          )}
        </div>
      </Link>
      <div className="mt-4 flex flex-col gap-1">
        <p className="text-[9px] tracking-widest uppercase text-brand-stone">{product.category}</p>
        <Link href={`/shop/${product.slug}`}>
          <h3 className="font-display text-xl text-brand-charcoal group-hover:text-brand-champagne-dark transition-colors">
            {product.name}
          </h3>
        </Link>
        <p className="text-sm text-brand-stone leading-relaxed line-clamp-2">{product.shortDescription}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-medium text-brand-charcoal">{formatPrice(product.price)}</span>
          <button
            onClick={() => addItem({ slug: product.slug, name: product.name, price: product.price, size: product.size })}
            className="text-[10px] tracking-widest uppercase border border-brand-charcoal text-brand-charcoal px-3 py-2 hover:bg-brand-charcoal hover:text-brand-cream transition-colors"
          >
            Add to Basket
          </button>
        </div>
      </div>
    </div>
  );
}
