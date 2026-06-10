export type Category = "Serums" | "Moisturisers" | "Cleansers" | "Men's" | "SPF";

export const CATEGORIES: Category[] = ["Serums", "Moisturisers", "Cleansers", "Men's", "SPF"];

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: Category;
  size: string;
  price: number;
  badge?: "Bestseller" | "New";
  shortDescription: string;
  description: string;
  benefits: string[];
  howToUse: string[];
  ingredients: string;
  /** Tailwind gradient classes used for the placeholder product visual */
  visual: {
    from: string;
    to: string;
    accent: string;
  };
}

export const PRODUCTS: Product[] = [
  {
    id: "1",
    slug: "hydra-veil-serum",
    name: "Hydra Veil Serum",
    category: "Serums",
    size: "30ml",
    price: 24,
    shortDescription: "A lightweight hyaluronic acid serum that supports hydrated, plump-looking skin.",
    description:
      "Hydra Veil Serum is a featherlight, fast-absorbing formula built around hyaluronic acid. It's designed to sit comfortably under moisturiser as part of a daily routine, leaving skin feeling smoother and more comfortable. Suitable for most skin types, including those new to active skincare.",
    benefits: [
      "Supports hydrated, plump-looking skin",
      "Lightweight, fast-absorbing texture",
      "Helps skin feel smoother and more supple",
      "Layers well under moisturiser and SPF",
    ],
    howToUse: [
      "Apply to clean, slightly damp skin morning and evening.",
      "Smooth 2 to 3 drops across face and neck.",
      "Follow with your usual moisturiser to help lock in hydration.",
      "Patch test before first use.",
    ],
    ingredients:
      "Formulated with hyaluronic acid, glycerin and panthenol. Free from added fragrance and suitable for most skin types.",
    visual: { from: "from-amber-50", to: "to-brand-sand", accent: "bg-brand-champagne" },
  },
  {
    id: "2",
    slug: "glow-drops-vitamin-c-serum",
    name: "Glow Drops Vitamin C Serum",
    category: "Serums",
    size: "30ml",
    price: 26,
    badge: "Bestseller",
    shortDescription: "A brightening vitamin C serum designed to support a more even, radiant-looking complexion.",
    description:
      "Glow Drops combines a stable form of vitamin C with antioxidant plant extracts to support a fresher, more awake-looking complexion. Designed for daily morning use, it pairs naturally with SPF as part of a simple skincare routine. Suitable for most skin types.",
    benefits: [
      "Supports a brighter, more even-looking complexion",
      "Lightweight serum with a silky finish",
      "Pairs well with daily SPF",
      "Suitable for most skin types",
    ],
    howToUse: [
      "Apply a few drops to clean, dry skin each morning.",
      "Gently press into face and neck until absorbed.",
      "Follow with moisturiser and SPF.",
      "Patch test before first use.",
    ],
    ingredients:
      "Formulated with a stable vitamin C derivative, vitamin E and botanical extracts. Free from added fragrance.",
    visual: { from: "from-orange-50", to: "to-brand-sand", accent: "bg-brand-champagne" },
  },
  {
    id: "3",
    slug: "pore-refine-niacinamide-serum",
    name: "Pore Refine Niacinamide Serum",
    category: "Serums",
    size: "30ml",
    price: 22,
    shortDescription: "A niacinamide serum that helps skin feel smoother and look more refined.",
    description:
      "Pore Refine Niacinamide Serum is a balancing, water-light formula designed to help skin feel smoother and more comfortable, with a more refined appearance over time. A good fit for daily routines, particularly for those who prefer a fresh, matte-leaning finish.",
    benefits: [
      "Helps skin feel smoother and more refined",
      "Water-light, fast-absorbing formula",
      "Designed for daily use, morning or evening",
      "Suitable for most skin types",
    ],
    howToUse: [
      "Apply to clean skin morning or evening.",
      "Smooth a small amount evenly across the face.",
      "Allow to absorb before applying moisturiser.",
      "Patch test before first use.",
    ],
    ingredients:
      "Formulated with niacinamide and zinc PCA. Free from added fragrance and suitable for most skin types.",
    visual: { from: "from-stone-50", to: "to-brand-sand", accent: "bg-brand-sage" },
  },
  {
    id: "4",
    slug: "renew-night-serum",
    name: "Renew Night Serum",
    category: "Serums",
    size: "30ml",
    price: 29,
    badge: "New",
    shortDescription: "A gentle retinol night serum designed for evening skincare routines.",
    description:
      "Renew Night Serum introduces a gentle, encapsulated form of retinol into your evening routine. Designed to be used gradually, it's intended to help skin look smoother and feel more refreshed over time. As with any new active product, start slowly and always patch test first.",
    benefits: [
      "Designed for evening skincare routines",
      "Gentle, encapsulated retinol formula",
      "Helps skin feel smoother over time",
      "Pairs well with a hydrating moisturiser",
    ],
    howToUse: [
      "For evening use only, 2 to 3 times per week to begin with.",
      "Apply a small amount to clean, dry skin.",
      "Follow with a hydrating moisturiser.",
      "Always apply SPF the following morning.",
      "Patch test before first use.",
    ],
    ingredients:
      "Formulated with encapsulated retinol, squalane and soothing botanical extracts. Free from added fragrance.",
    visual: { from: "from-indigo-50", to: "to-brand-sand", accent: "bg-brand-charcoal" },
  },
  {
    id: "5",
    slug: "daily-veil-moisturiser",
    name: "Daily Veil Moisturiser",
    category: "Moisturisers",
    size: "50ml",
    price: 21,
    shortDescription: "A lightweight daily moisturiser that supports comfortable, hydrated-looking skin.",
    description:
      "Daily Veil Moisturiser is a soft, breathable cream designed for everyday use across most skin types. It absorbs quickly without feeling heavy, making it an easy final step in both morning and evening routines.",
    benefits: [
      "Supports comfortable, hydrated-looking skin",
      "Lightweight, breathable texture",
      "Suitable for daily morning and evening use",
      "Designed for most skin types",
    ],
    howToUse: [
      "Apply to clean skin as the final step of your routine.",
      "Smooth evenly over face and neck.",
      "Use morning and evening.",
      "Patch test before first use.",
    ],
    ingredients:
      "Formulated with glycerin, shea butter and ceramides. Free from added fragrance.",
    visual: { from: "from-rose-50", to: "to-brand-sand", accent: "bg-brand-champagne" },
  },
  {
    id: "6",
    slug: "pure-cream-cleanser",
    name: "Pure Cream Cleanser",
    category: "Cleansers",
    size: "150ml",
    price: 17,
    shortDescription: "A gentle cream cleanser that removes makeup and daily build-up without feeling stripping.",
    description:
      "Pure Cream Cleanser is a soft, non-foaming formula designed to lift away makeup, SPF and daily build-up while helping skin feel comfortable rather than tight. A simple, gentle first step for morning and evening routines.",
    benefits: [
      "Gently removes makeup and daily build-up",
      "Helps skin feel comfortable, not tight",
      "Non-foaming, soap-free formula",
      "Suitable for most skin types, including sensitive skin",
    ],
    howToUse: [
      "Massage onto dry or damp skin using fingertips.",
      "Add water to emulsify, then rinse thoroughly.",
      "Pat skin dry and follow with your usual routine.",
      "Patch test before first use.",
    ],
    ingredients:
      "Formulated with oat extract, glycerin and a gentle plant-derived cleansing base. Free from added fragrance.",
    visual: { from: "from-sky-50", to: "to-brand-sand", accent: "bg-brand-sage" },
  },
  {
    id: "7",
    slug: "bright-eye-cream",
    name: "Bright Eye Cream",
    category: "Moisturisers",
    size: "15ml",
    price: 19.5,
    shortDescription: "A light, cooling eye cream designed for the delicate eye area.",
    description:
      "Bright Eye Cream is a light, cooling formula designed specifically for the delicate skin around the eyes. With a gentle roller-ball style applicator feel and a fast-absorbing texture, it's designed to fit easily into both morning and evening routines.",
    benefits: [
      "Designed for the delicate eye area",
      "Light, cooling, fast-absorbing texture",
      "Helps skin around the eyes feel refreshed",
      "Suitable for daily use",
    ],
    howToUse: [
      "Apply a small amount around the orbital bone using your ring finger.",
      "Gently pat until absorbed, avoiding direct contact with the eyes.",
      "Use morning and evening.",
      "Patch test before first use.",
    ],
    ingredients:
      "Formulated with caffeine extract, peptides and panthenol. Free from added fragrance.",
    visual: { from: "from-teal-50", to: "to-brand-sand", accent: "bg-brand-champagne" },
  },
  {
    id: "8",
    slug: "daily-shield-spf30",
    name: "Daily Shield SPF30",
    category: "SPF",
    size: "50ml",
    price: 23,
    shortDescription: "A lightweight daily face cream with SPF30, designed for everyday wear.",
    description:
      "Daily Shield SPF30 combines a lightweight daily moisturiser with broad-spectrum SPF30 protection. With a soft, natural finish, it's designed to sit comfortably under makeup and become an easy final step in your morning routine.",
    benefits: [
      "Broad-spectrum SPF30 daily protection",
      "Lightweight, non-greasy finish",
      "Sits comfortably under makeup",
      "Designed for daily morning use",
    ],
    howToUse: [
      "Apply generously as the last step of your morning routine.",
      "Smooth evenly over face and neck, avoiding the eye area.",
      "Reapply if exposed to direct sun for long periods.",
      "Patch test before first use.",
    ],
    ingredients:
      "Formulated with broad-spectrum SPF30 filters, glycerin and antioxidant plant extracts. Free from added fragrance.",
    visual: { from: "from-yellow-50", to: "to-brand-sand", accent: "bg-brand-champagne" },
  },
  {
    id: "9",
    slug: "active-hydration-serum-men",
    name: "Active Hydration Serum",
    category: "Men's",
    size: "30ml",
    price: 23,
    shortDescription: "A fast-absorbing hydration serum designed for men's daily skincare routines, including post-shave.",
    description:
      "Active Hydration Serum is a fast-absorbing, non-greasy formula designed for men's skincare routines. With a lightweight feel that suits beard and skin alike, it's designed to support comfortable, hydrated-looking skin, including after shaving.",
    benefits: [
      "Designed for daily skincare routines",
      "Fast-absorbing, non-greasy formula",
      "Suits skin and beard alike",
      "Comfortable feel after shaving",
    ],
    howToUse: [
      "Apply a few drops to clean, dry skin.",
      "Smooth evenly across face, and through beard if applicable.",
      "Use morning and evening, or after shaving.",
      "Patch test before first use.",
    ],
    ingredients:
      "Formulated with hyaluronic acid, panthenol and a light botanical blend. Free from added fragrance.",
    visual: { from: "from-slate-100", to: "to-brand-sand", accent: "bg-brand-charcoal" },
  },
  {
    id: "10",
    slug: "calm-repair-cream",
    name: "Calm Repair Cream",
    category: "Moisturisers",
    size: "50ml",
    price: 22.5,
    shortDescription: "A fragrance-free repair cream designed for sensitive skin and dry patches.",
    description:
      "Calm Repair Cream is a rich, fragrance-free formula designed for sensitive skin. With a soft, balm-like texture, it's intended to help skin feel calmer and more comfortable, making it a good fit for areas that feel dry or easily irritated.",
    benefits: [
      "Designed for sensitive skin",
      "Rich, balm-like texture",
      "Helps skin feel calmer and more comfortable",
      "Fragrance-free formula",
    ],
    howToUse: [
      "Apply to clean skin as needed, morning and evening.",
      "Smooth gently over dry or sensitive areas.",
      "Can be used on face and body.",
      "Patch test before first use.",
    ],
    ingredients:
      "Formulated with colloidal oatmeal, ceramides and shea butter. Fragrance-free.",
    visual: { from: "from-emerald-50", to: "to-brand-sand", accent: "bg-brand-sage" },
  },
];

export function getProductBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function getProductsByCategory(category: Category | "All"): Product[] {
  if (category === "All") return PRODUCTS;
  return PRODUCTS.filter((p) => p.category === category);
}

export function formatPrice(price: number): string {
  return `£${price.toFixed(2)}`;
}
