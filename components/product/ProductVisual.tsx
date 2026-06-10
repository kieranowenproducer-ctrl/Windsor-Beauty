import { Droplet, Droplets, Sparkles, Sun, UserRound } from "lucide-react";
import type { Product } from "@/lib/products";

const CATEGORY_ICON: Record<Product["category"], typeof Droplet> = {
  Serums: Droplet,
  Moisturisers: Sparkles,
  Cleansers: Droplets,
  "Men's": UserRound,
  SPF: Sun,
};

export default function ProductVisual({
  product,
  className = "",
}: {
  product: Product;
  className?: string;
}) {
  const Icon = CATEGORY_ICON[product.category];

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br ${product.visual.from} ${product.visual.to} ${className}`}
    >
      {/* Bottle silhouette */}
      <div className="relative flex flex-col items-center">
        <div className="h-3 w-7 rounded-t-sm bg-white/60" />
        <div className="flex h-28 w-20 sm:h-36 sm:w-24 flex-col items-center justify-center rounded-2xl bg-white/70 shadow-sm backdrop-blur-sm">
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${product.visual.accent}`}>
            <Icon className="h-4 w-4 text-white" strokeWidth={1.75} />
          </span>
          <span className="mt-3 text-[9px] tracking-widest uppercase text-brand-charcoal/70">
            {product.size}
          </span>
        </div>
      </div>
    </div>
  );
}
