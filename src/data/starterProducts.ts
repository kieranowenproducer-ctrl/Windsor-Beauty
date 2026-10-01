// The starter catalogue: Windsor Beauty's 18 skincare products.
//
// These are NOT the live catalogue. They are copied into the database once, the
// first time "Run Database Setup" is pressed on an empty shop (see
// seedStarterProducts in src/lib/db/starterSeed.ts). From then on every product
// lives in the database and is edited, replaced or deleted in Admin > Products.
// Changing this file later does not change the shop.
import type { Product } from './productModel';

export const STARTER_PRODUCTS: Product[] = [
  {
    "id": "wb-001",
    "name": "Hydra Veil Serum",
    "slug": "hydra-veil-serum",
    "categories": [
      "Serums"
    ],
    "shortDescription": "A lightweight hyaluronic acid serum that supports hydrated, plump-looking skin.",
    "fullDescription": "Hydra Veil Serum is a featherlight, fast-absorbing formula built around hyaluronic acid. It's designed to sit comfortably under moisturiser as part of a daily routine, leaving skin feeling smoother and more comfortable. Suitable for most skin types, including those new to active skincare.\n\n**Benefits**\n- Supports hydrated, plump-looking skin\n- Lightweight, fast-absorbing texture\n- Helps skin feel smoother and more supple\n- Layers well under moisturiser and SPF\n\n**How to use**\n1. Apply to clean, slightly damp skin morning and evening.\n2. Smooth 2 to 3 drops across face and neck.\n3. Follow with your usual moisturiser to help lock in hydration.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with hyaluronic acid, glycerin and panthenol. Free from added fragrance and suitable for most skin types.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "30ml",
        "price": 24
      }
    ],
    "inStock": true,
    "image": "/images/products/hydra-veil-serum.jpg",
    "form": "30ml glass dropper bottle",
    "shipping": {
      "weightGrams": 110
    },
    "keywords": [
      "serums",
      "skincare"
    ]
  },
  {
    "id": "wb-002",
    "name": "Glow Drops Vitamin C Serum",
    "slug": "glow-drops-vitamin-c-serum",
    "categories": [
      "Serums"
    ],
    "shortDescription": "A brightening vitamin C serum designed to support a more even, radiant-looking complexion.",
    "fullDescription": "Glow Drops combines a stable form of vitamin C with antioxidant plant extracts to support a fresher, more awake-looking complexion. Designed for daily morning use, it pairs naturally with SPF as part of a simple skincare routine. Suitable for most skin types.\n\n**Benefits**\n- Supports a brighter, more even-looking complexion\n- Lightweight serum with a silky finish\n- Pairs well with daily SPF\n- Suitable for most skin types\n\n**How to use**\n1. Apply a few drops to clean, dry skin each morning.\n2. Gently press into face and neck until absorbed.\n3. Follow with moisturiser and SPF.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with a stable vitamin C derivative, vitamin E and botanical extracts. Free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "30ml",
        "price": 26
      }
    ],
    "badge": "Bestseller",
    "inStock": true,
    "image": "/images/products/glow-drops-vitamin-c-serum.jpg",
    "form": "30ml glass dropper bottle",
    "shipping": {
      "weightGrams": 110
    },
    "keywords": [
      "serums",
      "skincare"
    ]
  },
  {
    "id": "wb-003",
    "name": "Pore Refine Niacinamide Serum",
    "slug": "pore-refine-niacinamide-serum",
    "categories": [
      "Serums"
    ],
    "shortDescription": "A niacinamide serum that helps skin feel smoother and look more refined.",
    "fullDescription": "Pore Refine Niacinamide Serum is a balancing, water-light formula designed to help skin feel smoother and more comfortable, with a more refined appearance over time. A good fit for daily routines, particularly for those who prefer a fresh, matte-leaning finish.\n\n**Benefits**\n- Helps skin feel smoother and more refined\n- Water-light, fast-absorbing formula\n- Designed for daily use, morning or evening\n- Suitable for most skin types\n\n**How to use**\n1. Apply to clean skin morning or evening.\n2. Smooth a small amount evenly across the face.\n3. Allow to absorb before applying moisturiser.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with niacinamide and zinc PCA. Free from added fragrance and suitable for most skin types.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "30ml",
        "price": 22
      }
    ],
    "inStock": true,
    "image": "/images/products/pore-refine-niacinamide-serum.jpg",
    "form": "30ml glass dropper bottle",
    "shipping": {
      "weightGrams": 110
    },
    "keywords": [
      "serums",
      "skincare"
    ]
  },
  {
    "id": "wb-004",
    "name": "Renew Night Serum",
    "slug": "renew-night-serum",
    "categories": [
      "Serums"
    ],
    "shortDescription": "A gentle retinol night serum designed for evening skincare routines.",
    "fullDescription": "Renew Night Serum introduces a gentle, encapsulated form of retinol into your evening routine. Designed to be used gradually, it's intended to help skin look smoother and feel more refreshed over time. As with any new active product, start slowly and always patch test first.\n\n**Benefits**\n- Designed for evening skincare routines\n- Gentle, encapsulated retinol formula\n- Helps skin feel smoother over time\n- Pairs well with a hydrating moisturiser\n\n**How to use**\n1. For evening use only, 2 to 3 times per week to begin with.\n2. Apply a small amount to clean, dry skin.\n3. Follow with a hydrating moisturiser.\n4. Always apply SPF the following morning.\n5. Patch test before first use.\n\n**Ingredients**\nFormulated with encapsulated retinol, squalane and soothing botanical extracts. Free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "30ml",
        "price": 29
      }
    ],
    "newIn": true,
    "inStock": true,
    "image": "/images/products/renew-night-serum.jpg",
    "form": "30ml glass dropper bottle",
    "shipping": {
      "weightGrams": 110
    },
    "keywords": [
      "serums",
      "skincare"
    ]
  },
  {
    "id": "wb-005",
    "name": "Daily Veil Moisturiser",
    "slug": "daily-veil-moisturiser",
    "categories": [
      "Moisturisers"
    ],
    "shortDescription": "A lightweight daily moisturiser that supports comfortable, hydrated-looking skin.",
    "fullDescription": "Daily Veil Moisturiser is a soft, breathable cream designed for everyday use across most skin types. It absorbs quickly without feeling heavy, making it an easy final step in both morning and evening routines.\n\n**Benefits**\n- Supports comfortable, hydrated-looking skin\n- Lightweight, breathable texture\n- Suitable for daily morning and evening use\n- Designed for most skin types\n\n**How to use**\n1. Apply to clean skin as the final step of your routine.\n2. Smooth evenly over face and neck.\n3. Use morning and evening.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with glycerin, shea butter and ceramides. Free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "50ml",
        "price": 21
      }
    ],
    "inStock": true,
    "image": "/images/products/daily-veil-moisturiser.jpg",
    "form": "50ml pump bottle",
    "shipping": {
      "weightGrams": 180
    },
    "keywords": [
      "moisturisers",
      "skincare"
    ]
  },
  {
    "id": "wb-006",
    "name": "Pure Cream Cleanser",
    "slug": "pure-cream-cleanser",
    "categories": [
      "Cleansers"
    ],
    "shortDescription": "A gentle cream cleanser that removes makeup and daily build-up without feeling stripping.",
    "fullDescription": "Pure Cream Cleanser is a soft, non-foaming formula designed to lift away makeup, SPF and daily build-up while helping skin feel comfortable rather than tight. A simple, gentle first step for morning and evening routines.\n\n**Benefits**\n- Gently removes makeup and daily build-up\n- Helps skin feel comfortable, not tight\n- Non-foaming, soap-free formula\n- Suitable for most skin types, including sensitive skin\n\n**How to use**\n1. Massage onto dry or damp skin using fingertips.\n2. Add water to emulsify, then rinse thoroughly.\n3. Pat skin dry and follow with your usual routine.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with oat extract, glycerin and a gentle plant-derived cleansing base. Free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "150ml",
        "price": 17
      }
    ],
    "inStock": true,
    "image": "/images/products/pure-cream-cleanser.jpg",
    "form": "150ml pump bottle",
    "shipping": {
      "weightGrams": 180
    },
    "keywords": [
      "cleansers",
      "skincare"
    ]
  },
  {
    "id": "wb-007",
    "name": "Bright Eye Cream",
    "slug": "bright-eye-cream",
    "categories": [
      "Moisturisers"
    ],
    "shortDescription": "A light, cooling eye cream designed for the delicate eye area.",
    "fullDescription": "Bright Eye Cream is a light, cooling formula designed specifically for the delicate skin around the eyes. With a gentle roller-ball style applicator feel and a fast-absorbing texture, it's designed to fit easily into both morning and evening routines.\n\n**Benefits**\n- Designed for the delicate eye area\n- Light, cooling, fast-absorbing texture\n- Helps skin around the eyes feel refreshed\n- Suitable for daily use\n\n**How to use**\n1. Apply a small amount around the orbital bone using your ring finger.\n2. Gently pat until absorbed, avoiding direct contact with the eyes.\n3. Use morning and evening.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with caffeine extract, peptides and panthenol. Free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "15ml",
        "price": 19.5
      }
    ],
    "inStock": true,
    "image": "/images/products/bright-eye-cream.jpg",
    "form": "15ml jar",
    "shipping": {
      "weightGrams": 160
    },
    "keywords": [
      "moisturisers",
      "skincare"
    ]
  },
  {
    "id": "wb-008",
    "name": "Daily Shield SPF30",
    "slug": "daily-shield-spf30",
    "categories": [
      "SPF"
    ],
    "shortDescription": "A lightweight daily face cream with SPF30, designed for everyday wear.",
    "fullDescription": "Daily Shield SPF30 combines a lightweight daily moisturiser with broad-spectrum SPF30 protection. With a soft, natural finish, it's designed to sit comfortably under makeup and become an easy final step in your morning routine.\n\n**Benefits**\n- Broad-spectrum SPF30 daily protection\n- Lightweight, non-greasy finish\n- Sits comfortably under makeup\n- Designed for daily morning use\n\n**How to use**\n1. Apply generously as the last step of your morning routine.\n2. Smooth evenly over face and neck, avoiding the eye area.\n3. Reapply if exposed to direct sun for long periods.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with broad-spectrum SPF30 filters, glycerin and antioxidant plant extracts. Free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "50ml",
        "price": 23
      }
    ],
    "inStock": true,
    "image": "/images/products/daily-shield-spf30.jpg",
    "form": "50ml pump bottle",
    "shipping": {
      "weightGrams": 180
    },
    "keywords": [
      "spf",
      "skincare"
    ]
  },
  {
    "id": "wb-009",
    "name": "Active Hydration Serum",
    "slug": "active-hydration-serum-men",
    "categories": [
      "Men's"
    ],
    "shortDescription": "A fast-absorbing hydration serum designed for men's daily skincare routines, including post-shave.",
    "fullDescription": "Active Hydration Serum is a fast-absorbing, non-greasy formula designed for men's skincare routines. With a lightweight feel that suits beard and skin alike, it's designed to support comfortable, hydrated-looking skin, including after shaving.\n\n**Benefits**\n- Designed for daily skincare routines\n- Fast-absorbing, non-greasy formula\n- Suits skin and beard alike\n- Comfortable feel after shaving\n\n**How to use**\n1. Apply a few drops to clean, dry skin.\n2. Smooth evenly across face, and through beard if applicable.\n3. Use morning and evening, or after shaving.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with hyaluronic acid, panthenol and a light botanical blend. Free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "30ml",
        "price": 23
      }
    ],
    "inStock": true,
    "image": "/images/products/active-hydration-serum-men.jpg",
    "form": "30ml glass dropper bottle",
    "shipping": {
      "weightGrams": 110
    },
    "keywords": [
      "men's",
      "skincare"
    ]
  },
  {
    "id": "wb-010",
    "name": "Calm Repair Cream",
    "slug": "calm-repair-cream",
    "categories": [
      "Moisturisers"
    ],
    "shortDescription": "A fragrance-free repair cream designed for sensitive skin and dry patches.",
    "fullDescription": "Calm Repair Cream is a rich, fragrance-free formula designed for sensitive skin. With a soft, balm-like texture, it's intended to help skin feel calmer and more comfortable, making it a good fit for areas that feel dry or easily irritated.\n\n**Benefits**\n- Designed for sensitive skin\n- Rich, balm-like texture\n- Helps skin feel calmer and more comfortable\n- Fragrance-free formula\n\n**How to use**\n1. Apply to clean skin as needed, morning and evening.\n2. Smooth gently over dry or sensitive areas.\n3. Can be used on face and body.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with colloidal oatmeal, ceramides and shea butter. Fragrance-free.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "50ml",
        "price": 22.5
      }
    ],
    "inStock": true,
    "image": "/images/products/calm-repair-cream.jpg",
    "form": "50ml jar",
    "shipping": {
      "weightGrams": 160
    },
    "keywords": [
      "moisturisers",
      "skincare"
    ]
  },
  {
    "id": "wb-011",
    "name": "Soothing Toning Mist",
    "slug": "soothing-toning-mist",
    "categories": [
      "Extras"
    ],
    "shortDescription": "A fine facial mist with rosewater and aloe, designed to refresh and prep skin.",
    "fullDescription": "Soothing Toning Mist is a light, alcohol-free spray designed to refresh skin throughout the day or prepare it for the next step of your routine. With rosewater and aloe vera, it's intended to leave skin feeling calm and comfortable, whether used in the morning, before serum, or as a midday refresh. Suitable for most skin types, including sensitive skin.\n\n**Benefits**\n- Refreshes and preps skin before serum or moisturiser\n- Lightweight, alcohol-free formula\n- Can be used throughout the day as needed\n- Suitable for sensitive skin\n\n**How to use**\n1. Mist evenly over face with eyes closed, holding the bottle at arm's length.\n2. Use on clean skin before serum, or anytime to refresh.\n3. Allow to absorb naturally or pat in gently.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with rosewater, aloe vera and panthenol. Alcohol-free and free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "100ml",
        "price": 18
      }
    ],
    "newIn": true,
    "inStock": true,
    "image": "/images/products/soothing-toning-mist.jpg",
    "form": "100ml spray bottle",
    "shipping": {
      "weightGrams": 150
    },
    "keywords": [
      "extras",
      "skincare"
    ]
  },
  {
    "id": "wb-012",
    "name": "Velvet Lip Balm",
    "slug": "velvet-lip-balm",
    "categories": [
      "Extras"
    ],
    "shortDescription": "A nourishing lip balm with shea butter, designed to soften and protect dry lips.",
    "fullDescription": "Velvet Lip Balm is a rich, fast-melting balm designed to soften dry or chapped lips. With shea butter and a light wax base, it leaves a smooth, non-sticky finish and fits easily into a bag or pocket for use throughout the day. Suitable for everyone.\n\n**Benefits**\n- Softens and comforts dry lips\n- Light, non-sticky, fast-melting balm\n- Compact size for on-the-go use\n- Suitable for everyone\n\n**How to use**\n1. Apply directly to lips as needed throughout the day.\n2. Reapply after eating or drinking.\n3. Suitable for layering under lipstick or alone.\n\n**Ingredients**\nFormulated with shea butter, beeswax and vitamin E. Free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "15g",
        "price": 9.5
      }
    ],
    "inStock": true,
    "image": "/images/products/velvet-lip-balm.jpg",
    "form": "15g tube",
    "shipping": {
      "weightGrams": 90
    },
    "keywords": [
      "extras",
      "skincare"
    ]
  },
  {
    "id": "wb-013",
    "name": "Restore Hand Cream",
    "slug": "restore-hand-cream",
    "categories": [
      "Extras"
    ],
    "shortDescription": "A rich, fast-absorbing hand cream for dry or hardworking hands.",
    "fullDescription": "Restore Hand Cream is a rich, fast-absorbing formula designed for hands that need a little extra care. With shea butter and glycerin, it helps hands feel soft and comfortable without leaving a greasy residue, making it easy to use throughout the day, including before bed.\n\n**Benefits**\n- Helps dry hands feel soft and comfortable\n- Fast-absorbing, non-greasy formula\n- Compact tube for desks, bags and bedside tables\n- Suitable for everyone\n\n**How to use**\n1. Apply to clean, dry hands as needed.\n2. Massage in until fully absorbed.\n3. Use throughout the day or as a final step before bed.\n\n**Ingredients**\nFormulated with shea butter, glycerin and oat extract. Free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "50ml",
        "price": 13.5
      }
    ],
    "inStock": true,
    "image": "/images/products/restore-hand-cream.jpg",
    "form": "50ml tube",
    "shipping": {
      "weightGrams": 90
    },
    "keywords": [
      "extras",
      "skincare"
    ]
  },
  {
    "id": "wb-014",
    "name": "Cooling Aftershave Balm",
    "slug": "cooling-aftershave-balm",
    "categories": [
      "Men's"
    ],
    "shortDescription": "A cooling, fragrance-free balm designed to calm skin after shaving.",
    "fullDescription": "Cooling Aftershave Balm is a lightweight, fast-absorbing formula designed to calm and comfort skin straight after shaving. With aloe vera and panthenol, it helps reduce that tight, freshly-shaved feeling, leaving skin feeling cool and comfortable. Fragrance-free and suitable for sensitive skin.\n\n**Benefits**\n- Designed to calm skin after shaving\n- Cooling, fragrance-free formula\n- Fast-absorbing, non-greasy finish\n- Suitable for sensitive skin\n\n**How to use**\n1. Apply a small amount to clean skin immediately after shaving.\n2. Smooth evenly over face and neck.\n3. Avoid contact with eyes.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with aloe vera, panthenol and a light botanical blend. Fragrance-free.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "75ml",
        "price": 19.5
      }
    ],
    "inStock": true,
    "image": "/images/products/cooling-aftershave-balm.jpg",
    "form": "75ml tube",
    "shipping": {
      "weightGrams": 90
    },
    "keywords": [
      "men's",
      "skincare"
    ]
  },
  {
    "id": "wb-015",
    "name": "Gentle Exfoliating Scrub",
    "slug": "gentle-exfoliating-scrub",
    "categories": [
      "Cleansers"
    ],
    "shortDescription": "A gentle, fine-grain scrub designed to smooth and refresh skin without over-stripping.",
    "fullDescription": "Gentle Exfoliating Scrub uses fine, naturally derived particles in a soft cream base to help lift away dull, flaky skin and everyday build-up. Designed for a couple of uses a week, it leaves skin feeling smoother and more refreshed without that tight, over-scrubbed feeling.\n\n**Benefits**\n- Helps skin feel smoother and more refreshed\n- Fine, gentle particles in a soft cream base\n- Designed for two to three uses per week\n- Suitable for most skin types\n\n**How to use**\n1. Apply to damp skin, avoiding the eye area.\n2. Massage gently in circular motions for around 30 seconds.\n3. Rinse thoroughly with warm water.\n4. Use two to three times a week, followed by moisturiser.\n5. Patch test before first use.\n\n**Ingredients**\nFormulated with fine jojoba esters, glycerin and oat extract. Free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "100ml",
        "price": 16.5
      }
    ],
    "inStock": true,
    "image": "/images/products/gentle-exfoliating-scrub.jpg",
    "form": "100ml tube",
    "shipping": {
      "weightGrams": 90
    },
    "keywords": [
      "cleansers",
      "skincare"
    ]
  },
  {
    "id": "wb-016",
    "name": "Silk Body Oil",
    "slug": "silk-body-oil",
    "categories": [
      "Women's"
    ],
    "shortDescription": "A fast-absorbing dry body oil that leaves skin feeling silky, never greasy.",
    "fullDescription": "Silk Body Oil is a lightweight, fast-absorbing dry oil designed to leave skin feeling soft and smooth without a heavy or greasy after-feel. A blend of nourishing plant oils sinks in within moments, making it an easy addition to a morning or evening routine, straight after the shower or before bed.\n\n**Benefits**\n- Leaves skin feeling silky, never greasy\n- Fast-absorbing dry oil texture\n- Nourishing blend of plant oils\n- Suitable for daily use, morning or evening\n\n**How to use**\n1. Apply to clean, slightly damp skin after showering or bathing.\n2. Smooth a small amount evenly over arms, legs and body.\n3. Allow a moment to absorb before dressing.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with sweet almond oil, jojoba oil and vitamin E. Free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "100ml",
        "price": 24
      }
    ],
    "inStock": true,
    "image": "/images/products/silk-body-oil.jpg",
    "form": "100ml pump bottle",
    "shipping": {
      "weightGrams": 180
    },
    "keywords": [
      "women's",
      "skincare"
    ]
  },
  {
    "id": "wb-017",
    "name": "Rose Quartz Sleep Mask",
    "slug": "rose-quartz-sleep-mask",
    "categories": [
      "Women's"
    ],
    "shortDescription": "A rich overnight mask designed to leave skin feeling replenished by morning.",
    "fullDescription": "Rose Quartz Sleep Mask is a rich, comforting overnight treatment designed to be applied as the last step of your evening routine. While you sleep, it works to support the skin's natural overnight recovery, so skin feels soft, comfortable and replenished come morning. A little goes a long way.\n\n**Benefits**\n- Designed to support overnight skin recovery\n- Rich, comforting texture for evening use\n- Skin feels soft and replenished by morning\n- Suitable for most skin types\n\n**How to use**\n1. Apply as the final step of your evening routine, two to three times a week.\n2. Smooth a thin, even layer over face and neck.\n3. Leave on overnight and rinse or massage in any excess in the morning.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with shea butter, squalane and panthenol. Free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "50ml",
        "price": 27
      }
    ],
    "newIn": true,
    "inStock": true,
    "image": "/images/products/rose-quartz-sleep-mask.jpg",
    "form": "50ml jar",
    "shipping": {
      "weightGrams": 160
    },
    "keywords": [
      "women's",
      "skincare"
    ]
  },
  {
    "id": "wb-018",
    "name": "Velvet Body Lotion",
    "slug": "velvet-body-lotion",
    "categories": [
      "Women's"
    ],
    "shortDescription": "A soft, fast-absorbing body lotion for everyday hydration.",
    "fullDescription": "Velvet Body Lotion is a soft, fast-absorbing everyday lotion designed to leave skin feeling smooth and comfortable from the moment it's applied. With a light, comforting texture and no heavy residue, it's an easy daily step for hands, arms and body.\n\n**Benefits**\n- Leaves skin feeling smooth and comfortable\n- Fast-absorbing, lightweight texture\n- No heavy or sticky residue\n- Suitable for daily use\n\n**How to use**\n1. Apply to clean skin, ideally after showering or bathing.\n2. Smooth evenly over arms, legs and body.\n3. Use daily for best results.\n4. Patch test before first use.\n\n**Ingredients**\nFormulated with shea butter, glycerin and oat extract. Free from added fragrance.",
    "fullDescriptionFormat": "markdown",
    "variants": [
      {
        "dosage": "200ml",
        "price": 21
      }
    ],
    "inStock": true,
    "image": "/images/products/velvet-body-lotion.jpg",
    "form": "200ml pump bottle",
    "shipping": {
      "weightGrams": 180
    },
    "keywords": [
      "women's",
      "skincare"
    ]
  }
];

// Stock given to each starter product so the shop can be tested end to end.
export const STARTER_STOCK = 25;
