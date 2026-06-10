import Link from "next/link";
import type { Metadata } from "next";
import ProductCard from "@/components/product/ProductCard";
import { CATEGORIES, getProductsByCategory, type Category } from "@/lib/products";

export const metadata: Metadata = {
  title: "Shop Skincare",
  description:
    "Browse Windsor Beauty's full range of serums, moisturisers, cleansers, SPF and men's skincare essentials.",
};

const FILTERS: ("All" | Category)[] = ["All", ...CATEGORIES];

export default function ShopPage({ searchParams }: { searchParams: { category?: string } }) {
  const activeCategory = (searchParams.category as Category | undefined) ?? "All";
  const products = getProductsByCategory(activeCategory);

  return (
    <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
      <div className="mb-10 text-center max-w-xl mx-auto">
        <p className="text-[10px] tracking-ultra-wide uppercase text-brand-champagne-dark mb-2">
          Windsor Beauty
        </p>
        <h1 className="font-display text-4xl sm:text-5xl text-brand-charcoal">Shop Skincare</h1>
        <p className="mt-3 text-sm text-brand-stone leading-relaxed">
          Considered essentials for your daily routine, suitable for most skin types.
        </p>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-12">
        {FILTERS.map((cat) => {
          const isActive = activeCategory === cat;
          const href = cat === "All" ? "/shop" : `/shop?category=${encodeURIComponent(cat)}`;
          return (
            <Link
              key={cat}
              href={href}
              className={`text-[10px] tracking-widest uppercase px-4 py-2.5 border transition-colors ${
                isActive
                  ? "bg-brand-charcoal text-brand-cream border-brand-charcoal"
                  : "border-brand-line text-brand-stone hover:border-brand-champagne hover:text-brand-charcoal"
              }`}
            >
              {cat}
            </Link>
          );
        })}
      </div>

      {/* Product grid */}
      {products.length > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-12">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border border-dashed border-brand-line">
          <p className="text-sm text-brand-stone">No products found in this category yet.</p>
        </div>
      )}
    </div>
  );
}
