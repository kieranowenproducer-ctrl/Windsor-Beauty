import Link from "next/link";
import { Heart, Leaf, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import ProductCard from "@/components/product/ProductCard";
import ProductVisual from "@/components/product/ProductVisual";
import Newsletter from "@/components/home/Newsletter";
import { PRODUCTS } from "@/lib/products";

const FEATURED_SLUGS = ["hydra-veil-serum", "glow-drops-vitamin-c-serum", "daily-veil-moisturiser", "daily-shield-spf30"];

const BENEFITS = [
  {
    icon: Leaf,
    title: "Considered Formulas",
    description: "A small range of simple, effective formulas built around skin-loving ingredients.",
  },
  {
    icon: ShieldCheck,
    title: "Suitable for Most Skin Types",
    description: "Fragrance-free where it matters, with patch testing recommended before first use.",
  },
  {
    icon: Heart,
    title: "Cruelty-Free",
    description: "None of our products or ingredients are tested on animals.",
  },
  {
    icon: Truck,
    title: "Despatched From the UK",
    description: "Every order is packed and despatched from our team in the UK.",
  },
];

const ROUTINE_STEPS = [
  {
    step: "01",
    title: "Cleanse",
    description: "Start with Pure Cream Cleanser to gently remove makeup and daily build-up.",
  },
  {
    step: "02",
    title: "Treat",
    description: "Apply a serum suited to your skin, such as Hydra Veil or Glow Drops.",
  },
  {
    step: "03",
    title: "Moisturise",
    description: "Lock everything in with Daily Veil Moisturiser for comfortable, hydrated-looking skin.",
  },
  {
    step: "04",
    title: "Protect",
    description: "Finish your morning routine with Daily Shield SPF30.",
  },
];

const TRUST_BADGES = [
  { icon: Truck, label: "Free UK delivery over £35" },
  { icon: ShieldCheck, label: "Patch tested formulas" },
  { icon: Heart, label: "Cruelty-free" },
  { icon: RotateCcw, label: "30-day returns" },
];

export default function HomePage() {
  const featured = PRODUCTS.filter((p) => FEATURED_SLUGS.includes(p.slug));

  return (
    <div>
      {/* Hero */}
      <section className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 pt-16 sm:pt-20 pb-16">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-[10px] tracking-ultra-wide uppercase text-brand-champagne-dark mb-4">
            Considered Skincare
          </p>
          <h1 className="font-display text-4xl sm:text-6xl text-brand-charcoal leading-tight">
            Skincare that fits into real life.
          </h1>
          <p className="mt-5 text-sm sm:text-base text-brand-stone leading-relaxed max-w-md mx-auto">
            A small range of considered essentials for hydrated, comfortable skin, designed
            for daily routines and suitable for most skin types.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/shop"
              className="bg-brand-charcoal text-brand-cream text-[10px] tracking-widest uppercase px-7 py-3.5 hover:bg-brand-champagne-dark transition-colors"
            >
              Shop Now
            </Link>
            <Link
              href="/shop?category=Men%27s"
              className="border border-brand-charcoal text-brand-charcoal text-[10px] tracking-widest uppercase px-7 py-3.5 hover:bg-brand-charcoal hover:text-brand-cream transition-colors"
            >
              Shop Men&rsquo;s Range
            </Link>
          </div>
        </div>

        {/* Visual showcase */}
        <div className="mt-14 grid grid-cols-3 gap-3 sm:gap-5 max-w-2xl mx-auto">
          {featured.slice(0, 3).map((product) => (
            <ProductVisual key={product.id} product={product} className="aspect-[4/5] rounded-sm" />
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-16 border-t border-brand-line">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-[10px] tracking-ultra-wide uppercase text-brand-champagne-dark mb-2">
              Bestsellers
            </p>
            <h2 className="font-display text-3xl sm:text-4xl text-brand-charcoal">Our Favourites</h2>
          </div>
          <Link
            href="/shop"
            className="hidden sm:inline text-[10px] tracking-widest uppercase text-brand-charcoal hover:text-brand-champagne-dark transition-colors"
          >
            View All
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-10">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-brand-sand/60 border-y border-brand-line">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-16">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {BENEFITS.map((benefit) => (
              <div key={benefit.title}>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
                  <benefit.icon className="h-5 w-5 text-brand-champagne-dark" strokeWidth={1.5} />
                </span>
                <h3 className="mt-4 font-display text-xl text-brand-charcoal">{benefit.title}</h3>
                <p className="mt-2 text-sm text-brand-stone leading-relaxed">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Routine */}
      <section className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-16">
        <div className="text-center max-w-xl mx-auto mb-12">
          <p className="text-[10px] tracking-ultra-wide uppercase text-brand-champagne-dark mb-2">
            Getting Started
          </p>
          <h2 className="font-display text-3xl sm:text-4xl text-brand-charcoal">A Simple Daily Routine</h2>
          <p className="mt-3 text-sm text-brand-stone leading-relaxed">
            Four easy steps to build a routine that fits into your morning.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {ROUTINE_STEPS.map((item) => (
            <div key={item.step} className="border-t border-brand-line pt-5">
              <span className="font-display text-3xl text-brand-champagne-dark">{item.step}</span>
              <h3 className="mt-2 font-display text-xl text-brand-charcoal">{item.title}</h3>
              <p className="mt-2 text-sm text-brand-stone leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust badges */}
      <section className="border-y border-brand-line bg-white">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-4">
            {TRUST_BADGES.map((badge) => (
              <div key={badge.label} className="flex items-center gap-3 justify-center text-center sm:text-left sm:justify-start">
                <badge.icon className="h-5 w-5 text-brand-champagne-dark shrink-0" strokeWidth={1.5} />
                <span className="text-xs text-brand-charcoal">{badge.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-16">
        <Newsletter />
      </section>
    </div>
  );
}
