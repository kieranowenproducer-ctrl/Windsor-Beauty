// Generic outbound product naming.
//
// WHY THIS EXISTS
// Real product names ("Retatrutide (30mg)") must never reach a third party's
// systems or logs. Before this module, both integrations sent the real name AND
// the dosage:
//   - src/lib/shipping.ts  -> Royal Mail  (shipment contents)
//   - src/lib/fena.ts      -> Fena        (payment link line items)
// Everything leaving the building for those two now goes through here.
//
// THE ONE RULE: FAIL SAFE.
// If a product has no generic name configured, this NEVER falls back to the real
// name — it falls back to a generic default. A missing config must degrade to
// "too vague", never to "leaked". Every fallback below is deliberate.
//
// SCOPE — WHAT THIS DELIBERATELY DOES NOT TOUCH
// Customs fields (`customsDescription`, `customsCode`, `customsDeclarationCategory`)
// are NOT rewritten. They are a separate field on ShipmentContentItem
// (src/lib/royalMail.ts) and are passed straight through unchanged. Customs
// declarations legally require an accurate description of the goods; swapping a
// generic name into them would be a misdeclaration, not a privacy measure. The
// two concerns are separate fields precisely so they can hold different values.

import type { Product } from '@/data/products';

/**
 * Last-resort name. Used when a product has no `genericName` and no category
 * mapping matches — including when the product isn't in the catalogue at all
 * (deleted, renamed, or a bespoke invoice line). Intentionally bland.
 */
export const DEFAULT_GENERIC_NAME = 'Cosmetic Item';

/**
 * Slug -> generic description. THE AUTHORITATIVE MAP. One unique name per
 * product, covering the entire catalogue (75 products, live and hidden).
 *
 * WHY THIS LIVES IN CODE AND NOT ON THE PRODUCT
 * `mergeProducts` (src/data/products.ts) REPLACES a whole product when a DB
 * override exists — it does not merge field-by-field. 65 of the 75 products have
 * a `custom_products` row, so a `genericName` set in products.ts would be thrown
 * away for most of the catalogue, silently, with everything quietly degrading to
 * DEFAULT_GENERIC_NAME. Keeping the map here makes it immune to admin edits and
 * puts it in version control where a change is reviewable.
 *
 * WHY EVERY NAME IS UNIQUE
 * So the manifest stays operationally useful. If every line read "Cosmetic Item"
 * nobody could tell a packed order apart on the paperwork. Unique-but-bland
 * keeps the warehouse working while telling a third party nothing.
 *
 * RULES FOR ADDING ONE
 *  - Never include the real name, the dosage, or the word "peptide".
 *  - Plausible cosmetic/skincare item; the form should match reality (a pen
 *    product reads as a pen, a nasal spray as a mist, water as a solution).
 *  - Must be unique. The verification harness asserts this.
 *  - Avoid strong efficacy claims — this is a description, not marketing.
 */
const SLUG_GENERIC: Record<string, string> = {
  // ── Vials / ampoules ────────────────────────────────────────────────────────
  '5-amino-1mq-100mg':                 'Contour Serum',
  'ahk-cu-50mg':                       'Radiance Ampoule',
  'aod-9604':                          'Sculpt Serum',
  'ara-290':                           'Soothing Essence',
  'b7-33':                             'Restore Concentrate',
  'bpc-157':                           'Repair Serum',
  'cagrilintide':                      'Refine Serum',
  'cjc-1295':                          'Vitality Concentrate',
  'cjc-1295-no-dac-ipamorelin-10mg':   'Dual Vitality Blend',
  'dihexa':                            'Clarity Essence',
  'dsip-5mg':                          'Night Calm Serum',
  'epithalon':                         'Youth Elixir',
  'follistatin-315':                   'Firming Concentrate',
  'follistatin-344':                   'Firming Elixir',
  'ghk-cu':                            'Radiance Booster',
  'ghrp-2':                            'Energising Ampoule',
  'ghrp-6':                            'Energising Concentrate',
  'glow-70mg':                         'Luminous Serum',
  'gonadorelin':                       'Balance Ampoule',
  'hexarelin':                         'Vitality Booster',
  'hgh-fragment-176-191':              'Refining Essence',
  'hgh191aa':                          'Renewal Complex',
  'hhb':                               'Strengthening Elixir',
  'hmg-human-menopausal-gonadotropin': 'Balance Complex',
  'igf-1-des':                         'Firming Booster',
  'igf-1-lr3':                         'Firming Serum',
  'ipamorelin':                        'Vitality Serum',
  'kisspeptin-10':                     'Harmony Ampoule',
  'kisspeptin-54':                     'Harmony Concentrate',
  'kpv':                               'Calm Defence Serum',
  'l-carnitine-5000mg':                'Energising Elixir',
  'll-37':                             'Defence Ampoule',
  'melanotan-i':                       'Bronzing Serum',
  'melanotan-ii':                      'Bronzing Drops',
  'mgf':                               'Contour Booster',
  'mots-c':                            'Metabolic Essence',
  'n-acetyl-semax-amidate':            'Focus Essence',
  'nad-1000mg':                        'Revive Complex',
  'oxytocin':                          'Comfort Serum',
  'peg-mgf':                           'Contour Concentrate',
  'peptide-complex':                   'Multi Renewal Serum',
  'pinealon':                          'Night Clarity Serum',
  'pt-141':                            'Warmth Ampoule',
  'retatrutide':                       'Sculpt Ampoule',
  'selank':                            'Calm Essence',
  'semaglutide':                       'Refining Ampoule',
  'semax':                             'Focus Serum',
  'sermorelin':                        'Renewal Booster',
  'slu-pp-332':                        'Metabolic Booster',
  'super-human-blend':                 'Prestige Renewal Fluid',
  'tb-500':                            'Recovery Serum',
  'tesamorelin':                       'Contour Elixir',
  'thymosin-alpha-1':                  'Defence Complex',
  'tirzepatide':                       'Refine Ampoule',
  'triptorelin':                       'Balance Essence',
  'vesugen':                           'Vital Essence',
  'wolverine-blend':                   'Dual Recovery Serum',

  // ── Pens (form matches reality — these really are pens) ─────────────────────
  'bpc157-tb500-critical-bio-tech':    'Dual Repair Pen',
  'ghk-cu-critical-bio-tech':          'Radiance Pen',
  'glow-pen':                          'Luminous Pen',
  'glow-pen-critical-bio-tech':        'Luminous Precision Pen',
  'klow-pen-critical-bio-tech':        'Velvet Precision Pen',
  'mots-c-critical-bio-tech':          'Metabolic Pen',
  'mt2-critical-bio-tech':             'Bronzing Pen',
  'mt2-tanning-pen':                   'Bronzing Applicator Pen',
  'omnimorph-retatrutide-pen':         'Sculpt Precision Pen',
  'retatrutide-pen':                   'Sculpt Pen',
  'retatrutide-pen-slimfinity-40mg':   'Slim Contour Pen',
  'retatrutide-pen-synedica-40mg':     'Refine Contour Pen',
  'tirzepatide-pen':                   'Refine Pen',
  'tirzepatide-pen-lean-luxe-60mg':    'Svelte Contour Pen',
  'wolverine-recovery-pen':            'Dual Restore Pen',

  // ── Sprays / waters ─────────────────────────────────────────────────────────
  'nasal-spray-melanotan-ii-critical-bio-tech': 'Bronzing Mist',
  'acetic-acid-06-10ml':               'Clarifying Solution',
  'bac-water':                         'Hydrating Solution',
};

/**
 * RESERVE POOL — names held back for products added in future.
 *
 * HOW IT IS USED
 * When a product is saved in the admin with no shipping description, the first
 * unused name here is assigned to it and STORED on the product (see
 * assignReserveName). Assign-once-and-persist, not hash-on-read: hashing ~30
 * products into ~30 slots collides almost immediately (birthday problem), and a
 * product's shipping name must never change once it has been used on a real
 * consignment.
 *
 * FORM-AWARE ON PURPOSE
 * Split by physical form so a new pen is never labelled a serum. Nothing on the
 * paperwork should contradict what is actually in the box.
 *
 * Sized at 30 (~a year of new products at Kieran's rate, 2026-07-17). When it
 * runs out the resolver falls back to DEFAULT_GENERIC_NAME — safe, but no longer
 * unique — and assignReserveName returns null so the caller can warn loudly.
 * Top it up here; the verification harness asserts no name collides.
 *
 * Every descriptor is deliberately absent from SLUG_GENERIC above.
 */
export const RESERVE_POOL = {
  /** Vials, ampoules — the default shape for a new peptide product. */
  vial: [
    'Satin Serum', 'Aurora Essence', 'Petal Concentrate', 'Amber Elixir',
    'Silk Ampoule', 'Opal Serum', 'Ivory Essence', 'Pearl Ampoule',
    'Cashmere Serum', 'Marble Concentrate', 'Linen Essence', 'Dune Elixir',
    'Halo Ampoule', 'Lumen Serum', 'Coral Essence', 'Jade Concentrate',
    'Saffron Elixir', 'Cedar Ampoule', 'Willow Serum', 'Iris Essence',
  ],
  /** Anything in the Pens category. */
  pen: [
    'Lotus Pen', 'Orchid Precision Pen', 'Bloom Pen', 'Ember Precision Pen',
    'Haven Pen', 'Nectar Precision Pen', 'Muse Pen', 'Vellum Precision Pen',
  ],
  /** Waters, sprays, solutions. */
  liquid: [
    'Dew Solution', 'Frost Mist',
  ],
} as const;

/** Which pool a product draws from, by its categories. */
function poolFor(categories: readonly string[]): keyof typeof RESERVE_POOL {
  if (categories.includes('Pens')) return 'pen';
  if (categories.includes('BAC Water')) return 'liquid';
  return 'vial';
}

/**
 * Pick a reserve name for a product that has none.
 *
 * Skips any name already in use, and any name sharing a word with the product's
 * own real name — otherwise "Wolverine Recovery Pen" could draw a name
 * containing "Recovery" and quietly correlate back to itself. Falls back to the
 * other pools before giving up, so an empty pen pool still yields a real name.
 *
 * @returns the assigned name, or null when every pool is exhausted (the caller
 *          must then warn — a silent fallback to the default is how "unique"
 *          quietly stops being true).
 */
export function assignReserveName(
  realName: string,
  categories: readonly string[],
  taken: ReadonlySet<string>
): string | null {
  const realWords = realName.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const preferred = poolFor(categories);
  const order: (keyof typeof RESERVE_POOL)[] = [preferred, ...(['vial', 'pen', 'liquid'] as const).filter((p) => p !== preferred)];

  for (const pool of order) {
    for (const candidate of RESERVE_POOL[pool]) {
      if (taken.has(candidate)) continue;
      const lower = candidate.toLowerCase();
      if (realWords.some((w) => lower.includes(w))) continue;
      return candidate;
    }
  }
  return null;
}

/** The 75 names hard-mapped by slug. Part of the `taken` set when handing out reserves. */
export function mappedGenericNames(): string[] {
  return Object.values(SLUG_GENERIC);
}

/** Every name this module can emit — used to build the `taken` set and by tests. */
export function allKnownGenericNames(): string[] {
  return [
    ...mappedGenericNames(),
    ...RESERVE_POOL.vial, ...RESERVE_POOL.pen, ...RESERVE_POOL.liquid,
  ];
}

/**
 * Category -> generic description. Only reached when a slug isn't in the map
 * above — i.e. a product added after this map was written. A deliberately dull
 * safety net, not a place to add new products; add them to SLUG_GENERIC instead.
 */
const CATEGORY_GENERIC: Record<string, string> = {
  'BAC Water': 'Laboratory Solution',
  'Pens': 'Cosmetic Applicator Pen',
};

/** A record of one real -> generic substitution, for the internal audit trail. */
export interface GenericNameAudit {
  /** Catalogue slug, or the raw slug from the order line if not in the catalogue. */
  slug: string;
  /** The real name, kept INTERNALLY only. Never send this field onwards. */
  realName: string;
  /** What actually left the building. */
  genericName: string;
  /** Which rule produced it — useful when a generic looks wrong. */
  source: 'product.genericName' | 'slug-map' | 'category' | 'default' | 'trial-fulfilment-ref';
  /** Where it was going. */
  destination: 'royal-mail' | 'fena';
}

/**
 * Resolve the generic name for a product.
 *
 * Order: explicit `genericName` -> SLUG_GENERIC -> category -> default.
 *
 * `genericName` is first so a deliberate admin override wins, but note it is
 * usually absent: an admin edit rewrites the whole product row and drops it
 * (see the SLUG_GENERIC comment). SLUG_GENERIC is the path that actually runs.
 *
 * @param product The merged catalogue product, or undefined when the slug isn't
 *                in the catalogue. Undefined is safe — it returns the default.
 * @param slug    The order line's slug. Needed because SLUG_GENERIC must still
 *                resolve even if the product has been deleted from the catalogue.
 */
export function genericNameFor(product: Product | undefined, slug?: string): {
  name: string;
  source: GenericNameAudit['source'];
} {
  const explicit = product?.genericName?.trim();
  if (explicit) return { name: explicit, source: 'product.genericName' };

  const bySlug = SLUG_GENERIC[slug ?? product?.slug ?? ''];
  if (bySlug) return { name: bySlug, source: 'slug-map' };

  for (const category of product?.categories ?? []) {
    const mapped = CATEGORY_GENERIC[category];
    if (mapped) return { name: mapped, source: 'category' };
  }

  return { name: DEFAULT_GENERIC_NAME, source: 'default' };
}

/**
 * The name to put on an outbound payload for one order line.
 *
 * Note it takes the product, NOT the order line's name — so there is no code
 * path where the real name can be returned by accident. The dosage/variant is
 * dropped too: "30mg" identifies the product almost as precisely as its name.
 */
export function outboundItemName(
  product: Product | undefined,
  opts: {
    slug: string;
    realName: string;
    destination: GenericNameAudit['destination'];
    /**
     * A trial product's fixed neutral name, e.g. "Product 284" (task 9e2f4a11).
     *
     * WINS OVER EVERYTHING, and safely so: it is already a neutral name, carrying no product
     * identity of any kind, so this cannot become a route by which a real name escapes. It has to
     * be first because a trial line reaches here with its slug and product stripped, so every
     * rule below it would find nothing and fall through to "Cosmetic Item" — which is precisely
     * what every trial product used to ship as, indistinguishably.
     */
    fulfilmentRef?: string;
  }
): { name: string; audit: GenericNameAudit } {
  const ref = opts.fulfilmentRef?.trim();
  if (ref) {
    return {
      name: ref,
      audit: {
        slug: opts.slug,
        realName: opts.realName,
        genericName: ref,
        source: 'trial-fulfilment-ref',
        destination: opts.destination,
      },
    };
  }
  const { name, source } = genericNameFor(product, opts.slug);
  return {
    name,
    audit: {
      slug: opts.slug,
      realName: opts.realName,
      genericName: name,
      source,
      destination: opts.destination,
    },
  };
}

/**
 * An opaque, stable reference to send in place of the SKU.
 *
 * WHY THIS EXISTS — a leak that nearly shipped.
 * Royal Mail's payload carries `SKU` alongside `name` (royalMail.ts). We were
 * sending the catalogue slug there — and the slug IS the product name
 * ("retatrutide", "mt2-tanning-pen"). A generic `name` next to a real `SKU`
 * leaks exactly the thing this module exists to hide, while looking correct.
 *
 * A short hash keeps the field useful (stable per product, so Royal Mail's own
 * reporting still groups it, and you can look it up) without revealing anything.
 * Deterministic: the same slug always yields the same code.
 */
export function outboundSku(slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  // djb2 — deliberately not crypto. This is obfuscation for a shipping label,
  // not a security boundary, and it must run identically everywhere with no deps.
  let h = 5381;
  for (let i = 0; i < slug.length; i++) h = ((h << 5) + h + slug.charCodeAt(i)) >>> 0;
  return `WB-${h.toString(16).toUpperCase().padStart(8, '0')}`;
}

/**
 * Write the substitutions to the internal audit trail.
 *
 * Deliberately a structured console log rather than a database table: Vercel
 * captures these, they cost nothing, and they cannot fail a customer's checkout
 * or dispatch if the write errors. If this ever needs to be queryable, promote
 * it to a table alongside `verification_audit_log` (src/lib/db/schema.ts) — but
 * keep the call site non-blocking.
 *
 * Safe to log the real name here: this is OUR log, not the third party's. That
 * distinction is the entire point of the module.
 */
export function logGenericNameAudit(orderReference: string, records: GenericNameAudit[]): void {
  if (records.length === 0) return;
  console.info('[generic-names] outbound substitution', JSON.stringify({
    orderReference,
    destination: records[0]?.destination,
    at: new Date().toISOString(),
    mappings: records.map((r) => ({
      slug: r.slug,
      real: r.realName,
      sent: r.genericName,
      via: r.source,
    })),
  }));
}
