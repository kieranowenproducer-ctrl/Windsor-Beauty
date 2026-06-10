"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useCart } from "@/lib/cart";
import type { Product } from "@/lib/products";

export default function ProductActions({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    addItem({ slug: product.slug, name: product.name, price: product.price, size: product.size }, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="flex flex-col sm:flex-row items-stretch gap-3">
      <div className="flex items-center border border-brand-line">
        <button
          type="button"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          className="p-3 text-brand-charcoal hover:text-brand-champagne-dark transition-colors"
          aria-label="Decrease quantity"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <span className="w-10 text-center text-sm text-brand-charcoal">{quantity}</span>
        <button
          type="button"
          onClick={() => setQuantity((q) => q + 1)}
          className="p-3 text-brand-charcoal hover:text-brand-champagne-dark transition-colors"
          aria-label="Increase quantity"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
      <button
        onClick={handleAdd}
        className="flex-1 bg-brand-charcoal text-brand-cream text-[10px] tracking-widest uppercase px-7 py-3.5 hover:bg-brand-champagne-dark transition-colors"
      >
        {added ? "Added to Basket" : "Add to Basket"}
      </button>
    </div>
  );
}
