import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import ProductImage from "@/components/product/ProductImage";
import ProductActions from "@/components/product/ProductActions";
import ProductCard from "@/components/product/ProductCard";
import { PRODUCTS, formatPrice, getProductBySlug } from "@/lib/products";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const product = getProductBySlug(params.slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.shortDescription,
  };
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  const product = getProductBySlug(params.slug);
  if (!product) notFound();

  const related = PRODUCTS.filter((p) => p.category === product.category && p.slug !== product.slug).slice(0, 4);

  return (
    <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
      {/* Breadcrumb */}
      <div className="mb-8 text-[11px] tracking-widest uppercase text-brand-stone flex items-center gap-2">
        <Link href="/shop" className="hover:text-brand-champagne-dark transition-colors">
          Shop
        </Link>
        <span>/</span>
        <Link
          href={`/shop?category=${encodeURIComponent(product.category)}`}
          className="hover:text-brand-champagne-dark transition-colors"
        >
          {product.category}
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
        {/* Visual */}
        <ProductImage product={product} className="aspect-[4/5] w-full rounded-sm" sizes="(max-width: 1024px) 100vw, 50vw" priority />

        {/* Info */}
        <div>
          {product.badge && (
            <span className="inline-block bg-brand-charcoal text-brand-cream text-[9px] tracking-widest uppercase px-2.5 py-1 mb-4">
              {product.badge}
            </span>
          )}
          <p className="text-[10px] tracking-ultra-wide uppercase text-brand-champagne-dark mb-2">
            {product.category} &middot; {product.size}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl text-brand-charcoal">{product.name}</h1>
          <p className="mt-3 text-lg text-brand-charcoal">{formatPrice(product.price)}</p>
          <p className="mt-5 text-sm text-brand-stone leading-relaxed">{product.description}</p>

          <div className="mt-8">
            <ProductActions product={product} />
          </div>

          {/* Benefits */}
          <div className="mt-10 border-t border-brand-line pt-6">
            <p className="text-[10px] tracking-widest uppercase text-brand-charcoal mb-3">Key Benefits</p>
            <ul className="space-y-2">
              {product.benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2.5 text-sm text-brand-stone leading-relaxed">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-brand-champagne shrink-0" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          {/* How to use */}
          <div className="mt-8 border-t border-brand-line pt-6">
            <p className="text-[10px] tracking-widest uppercase text-brand-charcoal mb-3">How to Use</p>
            <ol className="space-y-2">
              {product.howToUse.map((step, i) => (
                <li key={step} className="flex items-start gap-2.5 text-sm text-brand-stone leading-relaxed">
                  <span className="text-brand-champagne-dark font-medium shrink-0">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Ingredients */}
          <div className="mt-8 border-t border-brand-line pt-6">
            <p className="text-[10px] tracking-widest uppercase text-brand-charcoal mb-3">Ingredients</p>
            <p className="text-sm text-brand-stone leading-relaxed">{product.ingredients}</p>
          </div>
        </div>
      </div>

      {/* Related products */}
      {related.length > 0 && (
        <div className="mt-20 pt-12 border-t border-brand-line">
          <h2 className="font-display text-3xl text-brand-charcoal mb-8">You May Also Like</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-10">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
