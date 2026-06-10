import type { Metadata } from "next";
import { Leaf, MapPin, Recycle, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description: "Windsor Beauty is a small, considered skincare range designed in London for everyday routines.",
};

const VALUES = [
  {
    icon: Sparkles,
    title: "Considered, Not Crowded",
    description: "A small range of formulas, each with a clear purpose, rather than an overwhelming wall of products.",
  },
  {
    icon: Leaf,
    title: "Everyday Ingredients",
    description: "Familiar, skin-friendly ingredients chosen for how they feel in a daily routine, not just on a label.",
  },
  {
    icon: Recycle,
    title: "Cruelty-Free",
    description: "None of our products or the ingredients within them are tested on animals.",
  },
  {
    icon: MapPin,
    title: "Designed in London",
    description: "Our team is based in the UK, where every order is packed and despatched.",
  },
];

export default function AboutPage() {
  return (
    <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
      {/* Header */}
      <div className="max-w-2xl">
        <p className="text-[10px] tracking-ultra-wide uppercase text-brand-champagne-dark mb-2">Our Story</p>
        <h1 className="font-display text-4xl sm:text-5xl text-brand-charcoal">About Windsor Beauty</h1>
      </div>

      {/* Story */}
      <div className="mt-12 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div className="space-y-5 text-sm text-brand-stone leading-relaxed">
          <p>
            Windsor Beauty started with a simple idea: skincare should fit into real
            life, not the other way around. Rather than launching dozens of
            products, we focused on a small range of considered essentials that
            cover the basics of a daily routine, for anyone, regardless of gender.
          </p>
          <p>
            Each formula is designed to be straightforward to use and easy to
            understand, with no confusing routines or unnecessary steps. We believe
            good skincare should feel calm and uncomplicated, from the bottle to the
            bathroom shelf.
          </p>
          <p>
            Our products are suitable for most skin types and are not tested on
            animals. As with any new skincare product, we always recommend a patch
            test before first use. Our small team is based in the UK, where every
            order is packed and despatched.
          </p>
        </div>
        <div className="aspect-[4/5] rounded-sm bg-gradient-to-br from-brand-sand to-brand-cream flex items-center justify-center">
          <div className="flex h-40 w-40 sm:h-48 sm:w-48 flex-col items-center justify-center rounded-full bg-white/70 shadow-sm backdrop-blur-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-champagne">
              <Leaf className="h-5 w-5 text-white" strokeWidth={1.5} />
            </span>
            <span className="mt-4 font-display text-lg text-brand-charcoal">Windsor Beauty</span>
            <span className="mt-1 text-[10px] tracking-widest uppercase text-brand-stone">London</span>
          </div>
        </div>
      </div>

      {/* Values */}
      <div className="mt-20 pt-16 border-t border-brand-line">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {VALUES.map((value) => (
            <div key={value.title}>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-sand">
                <value.icon className="h-5 w-5 text-brand-champagne-dark" strokeWidth={1.5} />
              </span>
              <h3 className="mt-4 font-display text-xl text-brand-charcoal">{value.title}</h3>
              <p className="mt-2 text-sm text-brand-stone leading-relaxed">{value.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
