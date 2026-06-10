"use client";

import Link from "next/link";
import { Minus, Plus, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { calculateShipping, FREE_SHIPPING_THRESHOLD } from "@/lib/orders";
import { formatPrice, getProductBySlug } from "@/lib/products";
import ProductIllustration from "@/components/product/ProductIllustration";

export default function CartPage() {
  const { items, updateQuantity, removeItem, subtotal, hydrated } = useCart();

  const shipping = calculateShipping(subtotal);
  const total = subtotal + shipping;
  const remaining = FREE_SHIPPING_THRESHOLD - subtotal;

  if (!hydrated) {
    return <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-16" />;
  }

  if (items.length === 0) {
    return (
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-20 text-center">
        <h1 className="font-display text-4xl text-brand-charcoal mb-3">Your Basket is Empty</h1>
        <p className="text-sm text-brand-stone mb-8">Browse our skincare essentials and find something for your routine.</p>
        <Link
          href="/shop"
          className="inline-block bg-brand-charcoal text-brand-cream text-[10px] tracking-widest uppercase px-7 py-3.5 hover:bg-brand-champagne-dark transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
      <h1 className="font-display text-4xl sm:text-5xl text-brand-charcoal mb-10">Your Basket</h1>

      <div className="grid lg:grid-cols-3 gap-12">
        {/* Items */}
        <div className="lg:col-span-2 divide-y divide-brand-line border-y border-brand-line">
          {items.map((item) => {
            const product = getProductBySlug(item.slug);
            return (
              <div key={item.slug} className="py-6 flex gap-4 sm:gap-6">
                {product && <ProductIllustration product={product} className="h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-sm" />}
                <div className="flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/shop/${item.slug}`} className="font-display text-xl text-brand-charcoal hover:text-brand-champagne-dark transition-colors">
                        {item.name}
                      </Link>
                      <p className="text-[10px] tracking-widest uppercase text-brand-stone mt-1">{item.size}</p>
                    </div>
                    <button
                      onClick={() => removeItem(item.slug)}
                      aria-label={`Remove ${item.name}`}
                      className="text-brand-stone hover:text-brand-charcoal transition-colors"
                    >
                      <X className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </div>
                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <div className="flex items-center border border-brand-line">
                      <button
                        onClick={() => updateQuantity(item.slug, item.quantity - 1)}
                        className="p-2.5 text-brand-charcoal hover:text-brand-champagne-dark transition-colors"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                      <span className="w-9 text-center text-sm text-brand-charcoal">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.slug, item.quantity + 1)}
                        className="p-2.5 text-brand-charcoal hover:text-brand-champagne-dark transition-colors"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                    <span className="text-sm font-medium text-brand-charcoal">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="border border-brand-line p-6 sticky top-24">
            <h2 className="text-[10px] tracking-widest uppercase text-brand-charcoal mb-5">Order Summary</h2>

            {remaining > 0 ? (
              <div className="mb-5">
                <div className="h-1 w-full bg-brand-sand">
                  <div
                    className="h-1 bg-brand-champagne transition-all"
                    style={{ width: `${Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-brand-stone">
                  Add {formatPrice(remaining)} more for free standard UK delivery.
                </p>
              </div>
            ) : (
              <div className="mb-5">
                <div className="h-1 w-full bg-brand-champagne" />
                <p className="mt-2 text-xs text-brand-champagne-dark">You qualify for free standard UK delivery.</p>
              </div>
            )}

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between text-brand-stone">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-brand-stone">
                <span>Shipping</span>
                <span>{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-brand-stone">Standard delivery shown. Express delivery available at checkout.</p>

            <div className="mt-4 pt-4 border-t border-brand-line flex items-center justify-between">
              <span className="text-sm font-medium text-brand-charcoal">Total</span>
              <span className="text-lg font-medium text-brand-charcoal">{formatPrice(total)}</span>
            </div>

            <Link
              href="/checkout"
              className="mt-6 block text-center bg-brand-charcoal text-brand-cream text-[10px] tracking-widest uppercase px-7 py-3.5 hover:bg-brand-champagne-dark transition-colors"
            >
              Checkout
            </Link>
            <Link
              href="/shop"
              className="mt-3 block text-center text-[10px] tracking-widest uppercase text-brand-stone hover:text-brand-charcoal transition-colors"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
