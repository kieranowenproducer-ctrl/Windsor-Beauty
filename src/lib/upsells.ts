// Pure computation for turning stored upsell rules (already parsed/validated
// at import time — see upsellCsv.ts) into the actual list of recommendations
// shown in the basket popup for a given set of items. No DB/network access
// here, so it's easy to reason about and unit-test in isolation; the public
// API route (src/app/api/upsells/route.ts) is the only caller and supplies
// the rules/catalogue/hidden-slugs/stock data it already has.

import { activeVariants, effectiveAvailability, type Product } from '@/data/products';
import type { UpsellManualOverrideRow, UpsellRuleRow } from './db';

// Stored as one site_content row (key 'upsell-settings'), the same JSON-blob-
// in-a-text-column pattern already used for storage-instructions-default,
// homepage-trust-badges, etc. — no dedicated table needed for a single
// on/off flag plus a snapshot of the most recent import.
export interface UpsellSettings {
  enabled: boolean;
  lastImport: {
    at: string;
    mode: 'replace' | 'append';
    totalRules: number;
    totalProducts: number;
    totalErrors: number;
  } | null;
}

export const DEFAULT_UPSELL_SETTINGS: UpsellSettings = { enabled: true, lastImport: null };

export function parseUpsellSettings(body: string | null | undefined): UpsellSettings {
  if (!body) return DEFAULT_UPSELL_SETTINGS;
  try {
    const parsed = JSON.parse(body);
    const li = parsed?.lastImport;
    return {
      enabled: parsed?.enabled !== false,
      lastImport: li && typeof li === 'object' ? {
        at: typeof li.at === 'string' ? li.at : '',
        mode: li.mode === 'append' ? 'append' : 'replace',
        totalRules: Number.isFinite(Number(li.totalRules)) ? Number(li.totalRules) : 0,
        totalProducts: Number.isFinite(Number(li.totalProducts)) ? Number(li.totalProducts) : 0,
        totalErrors: Number.isFinite(Number(li.totalErrors)) ? Number(li.totalErrors) : 0,
      } : null,
    };
  } catch {
    return DEFAULT_UPSELL_SETTINGS;
  }
}

export interface UpsellRecommendation {
  slug: string;
  productId: string;
  name: string;
  /** The cheapest active variant — what the one-click Add button adds when there's only one option. */
  variant: string;
  price: number;
  image: string | undefined;
  message: string | null;
  /** Every active variant, lowest-strength-first. Add must ask the customer to choose from this list rather than silently adding `variant` whenever it has more than one entry. */
  variants: { dosage: string; price: number }[];
}

const MAX_RECOMMENDATIONS = 8;

function isRuleCurrentlyActive(rule: UpsellRuleRow, today: string): boolean {
  if (!rule.active) return false;
  if (rule.start_date && today < rule.start_date.slice(0, 10)) return false;
  if (rule.end_date && today > rule.end_date.slice(0, 10)) return false;
  return true;
}

// Cheapest enabled variant — matches how ProductCard/shop listings already
// pick a "from £X" starting price for multi-variant products. Also what the
// basket's one-click Add button adds, since a single recommendation card has
// no variant picker of its own.
function cheapestVariant(product: Product) {
  const variants = activeVariants(product);
  return variants.length > 0
    ? variants.reduce((cheapest, v) => (v.price < cheapest.price ? v : cheapest))
    : { dosage: 'Standard', price: 0 };
}

export const DEFAULT_UPSELL_HEADING = 'Frequently bought with';

// Manual, per-product curation (see upsell_manual_overrides in db.ts) takes
// full priority over CSV-imported rules for any trigger it covers — even an
// override with zero upsell_handles means "show nothing for this trigger",
// not "fall back to CSV". This mirrors the admin editor's mental model: once
// a product's upsells have been manually set and saved, that's the whole
// story for that product until the override is explicitly cleared. Building
// this merged list here (rather than inside computeUpsellRecommendations
// itself) keeps that pure function completely unaware manual overrides
// exist — it just receives a flat UpsellRuleRow[] and treats every row the
// same way, CSV or manual.
// The one upsell relationship derivable from real data with zero marketing
// judgement: every lyophilised peptide vial needs BAC Water to reconstitute.
// Pens are pre-mixed and the diluents can't recommend themselves. Shared
// between the fallback engine below and the admin's "Generate Upsell Rules
// CSV" button (src/app/admin/upsells/page.tsx) so the one real business rule
// has a single source of truth instead of two copies that could drift apart.
export const RECONSTITUTION_TARGET_SLUG = 'bac-water';
export const ACETIC_ACID_SLUG = 'acetic-acid-06-10ml';
export const KNOWN_DILUENT_SLUGS = new Set([RECONSTITUTION_TARGET_SLUG, ACETIC_ACID_SLUG]);
const FALLBACK_PRIORITY_BASE = 1000; // always ranks below any real CSV/manual rule (which use small positive integers)
export const FALLBACK_IMPORT_BATCH_ID = 'category-fallback';

// ─── Bacteriostatic water is not an upsell ───────────────────────────────────
// A vial of dry powder cannot be used without something to reconstitute it, so
// offering the water is not marketing — it is part of selling the vial.
// Samuel's words: "Every vial of dry powder sold should be suggested to a
// customer to be sold with BAC. That is standard. That is not an upsell."
//
// It used to be a FALLBACK, offered only to a product nobody had curated rules
// for. The moment a product picked up any imported or hand-set rule it counted
// as "covered" and the water quietly dropped off. Measured on the live shop on
// 22 Aug 2026: 27 of the 48 curated products carried no water rule, and HGH
// 191AA, Oxytocin, NAD+ and the Wolverine blend — all dry powder vials — showed
// no water anywhere on the page. It is now a standing rule instead: always
// emitted, for every product that needs it, whatever else is set up.
export const RECONSTITUTION_BATCH_ID = 'reconstitution';
// Zero, so it ranks above every curated rule, which start at 1. Not cosmetic:
// the list is capped at MAX_RECOMMENDATIONS, so a product with a full set of
// curated suggestions would otherwise push the water off the end and show
// nothing — the exact failure this rule exists to prevent.
const RECONSTITUTION_PRIORITY = 0;
export const RECONSTITUTION_MESSAGE = 'Needed to reconstitute this product';
// Acetic acid products get their own line, because a customer who already keeps BAC water in the
// cupboard needs telling that this one is different, not just offering a second bottle.
export const ACETIC_ACID_MESSAGE = 'Needed to reconstitute this one, instead of BAC Water';
export function reconstitutionMessageFor(targetSlug: string): string {
  return targetSlug === ACETIC_ACID_SLUG ? ACETIC_ACID_MESSAGE : RECONSTITUTION_MESSAGE;
}

// Two exclusions, and only two, both facts rather than guesses: a pen arrives pre-mixed, and a
// diluent cannot recommend itself. EVERYTHING else is offered water.
//
// There was a third: a list of words — nasal, spray, capsule, tablet, oral — that excluded a
// product whose NAME contained one. Samuel struck it out: "5-Amino-1MQ Will Need bac water so do
// not assume this is a capsule. This needs fixing. Don't assume." He is right, and the reasoning
// generalises. This catalogue has no field saying what form a product takes, so a word in a name is
// a guess, and a guess in this direction silently removes water from something that needs it —
// which is the whole complaint this rule exists to answer.
//
// If a specific product genuinely should not be offered water, it gets named here as a decision.
// Nothing is excluded because of what it happens to be called.
//
// Two named lists, and both are DECISIONS with a person and a reason attached — never a reading of
// what a product happens to be called.

// Already a liquid, so there is nothing to reconstitute. Samuel, 23 Aug 2026: "L-Carnitine Doesn't
// needs any water !!! It already is already liquid as is Pag NRG and UP 389."
// (UP-389 is stored under the slug `super-human-blend`; its display name was changed, the slug was
// not. Checked against the live catalogue rather than assumed from the name.)
const NEVER_NEEDS_WATER = new Set<string>([
  'l-carnitine-5000mg',   // L-Carnitine
  'pag-nrg',              // PAG~NRG
  'super-human-blend',    // UP-389
]);

// Must be reconstituted in acetic acid, not bacteriostatic water, AT EVERY DOSAGE. Samuel,
// 23 Aug 2026: "The pH value of these products must be kept between 4.0 and 6.0. These product
// need to reconstructed in an acetic acid solution; otherwise, it is prone to becoming cloudy or
// jelly like." He listed CJC-1295 both with and without DAC; this shop sells one CJC-1295, and
// since both forms take acetic acid the single entry covers it either way. He wrote
// "KS：KissPeptin"; the shop sells two, and the reason he gave is about kisspeptin itself, so both
// are here.
const NEEDS_ACETIC_ACID = new Set<string>([
  'ipamorelin',                        // IPA
  'cjc-1295-no-dac-ipamorelin-10mg',   // IPA/CJC-1295 (Ipamorelin 10mg + CJC-1295 No DAC)
  'aod-9604',                          // AOD-9604
  'tesamorelin',                       // Tesamorelin
  'cjc-1295',                          // CJC-1295, with or without DAC
  'kisspeptin-10',                     // KissPeptin
  'kisspeptin-54',                     // KissPeptin
]);

/**
 * Which diluent this product has to be mixed with, or null when it needs none.
 * The single source of truth for the whole shop: the product page, the basket, the question before
 * payment and the admin's CSV generator all read this, so none of them can drift from the others.
 */
export function reconstitutionTargetFor(product: Product): string | null {
  if (KNOWN_DILUENT_SLUGS.has(product.slug)) return null;   // water cannot need water
  if (product.categories.includes('Pens')) return null;     // a pen arrives pre-mixed
  if (NEVER_NEEDS_WATER.has(product.slug)) return null;     // named as already liquid
  if (NEEDS_ACETIC_ACID.has(product.slug)) return ACETIC_ACID_SLUG;
  return RECONSTITUTION_TARGET_SLUG;
}

export function needsReconstitution(product: Product): boolean {
  return reconstitutionTargetFor(product) !== null;
}

/**
 * The water rule for every trigger that needs it. Applied on top of the curated rules rather than
 * instead of them, and deduped downstream by upsell slug — so a product that already lists BAC
 * Water keeps its own message and simply moves to the front.
 */
export function buildReconstitutionRules(
  triggerSlugs: string[],
  catalogue: Product[],
): UpsellRuleRow[] {
  const bySlug = new Map(catalogue.map(p => [p.slug, p]));
  const now = new Date().toISOString();
  const rules: UpsellRuleRow[] = [];
  for (const trigger of triggerSlugs) {
    const product = bySlug.get(trigger);
    if (!product) continue;
    const target = reconstitutionTargetFor(product);
    // No diluent needed, or the shop is not currently selling the one it needs.
    if (!target || !bySlug.has(target)) continue;
    rules.push({
      id: -3,
      trigger_handle: trigger,
      upsell_handle: target,
      priority: RECONSTITUTION_PRIORITY,
      custom_message: reconstitutionMessageFor(target),
      active: true,
      start_date: null,
      end_date: null,
      import_batch_id: RECONSTITUTION_BATCH_ID,
      created_at: now,
    });
  }
  return rules;
}

// A trigger counts as "covered" the moment it has a manual override saved
// (even one with zero upsell_handles — that's an admin's deliberate "show
// nothing here", which must never be papered over by a fallback) or at least
// one CSV rule naming it. Only a trigger with neither gets the synthetic
// fallback below.
export function coveredTriggerSlugs(csvRules: UpsellRuleRow[], manualOverrides: UpsellManualOverrideRow[]): Set<string> {
  const covered = new Set<string>();
  for (const rule of csvRules) covered.add(rule.trigger_handle);
  for (const override of manualOverrides) covered.add(override.trigger_handle);
  return covered;
}

// Guarantees "Frequently bought with" always has something sensible to show
// instead of silently rendering nothing — the gap the old, separate,
// image-less "Related Products" block was papering over for any product an
// admin hadn't gotten around to curating yet (e.g. 5-Amino-1MQ). Two signals,
// ranked in this order, for each uncovered trigger: (1) the one real
// complementary relationship in this catalogue (peptide vial -> BAC Water),
// then (2) same-category siblings — the best signal available without real
// purchase/research data. Always synthetic, always catalogue-only (every
// candidate comes straight from the live `catalogue` array), always ranked
// below any real CSV/manual rule via FALLBACK_PRIORITY_BASE, and automatically
// filtered for hidden/out-of-stock/duplicate/self by computeUpsellRecommendations
// downstream exactly like every other rule — this function only proposes.
export function buildCategoryFallbackRules(
  triggerSlugs: string[],
  catalogue: Product[],
  coveredTriggers: Set<string>
): UpsellRuleRow[] {
  const now = new Date().toISOString();
  const bySlug = new Map(catalogue.map(p => [p.slug, p]));
  const fallback: UpsellRuleRow[] = [];

  const makeRule = (trigger: string, upsell: string, priority: number, message: string | null): UpsellRuleRow => ({
    id: -2,
    trigger_handle: trigger,
    upsell_handle: upsell,
    priority,
    custom_message: message,
    active: true,
    start_date: null,
    end_date: null,
    import_batch_id: FALLBACK_IMPORT_BATCH_ID,
    created_at: now,
  });

  for (const trigger of triggerSlugs) {
    if (coveredTriggers.has(trigger)) continue;
    const product = bySlug.get(trigger);
    if (!product) continue;

    let priority = FALLBACK_PRIORITY_BASE;
    const added = new Set<string>([trigger]);

    // The water itself is no longer emitted here: buildReconstitutionRules emits it for every
    // product that needs it, curated or not, so doing it in both places would be two copies of
    // one business rule waiting to drift apart. It is still marked as added so the sibling loop
    // below does not offer it a second time as a same-category suggestion.
    const diluent = reconstitutionTargetFor(product);
    if (diluent && bySlug.has(diluent)) {
      added.add(diluent);
    }

    const siblings = catalogue.filter(p => !added.has(p.slug) && p.categories.some(c => product.categories.includes(c)));
    for (const sibling of siblings) {
      fallback.push(makeRule(trigger, sibling.slug, priority++, null));
      added.add(sibling.slug);
    }
  }
  return fallback;
}

export function buildEffectiveRules(
  triggerSlugs: string[],
  csvRules: UpsellRuleRow[],
  manualOverrides: UpsellManualOverrideRow[]
): UpsellRuleRow[] {
  const manualByTrigger = new Map(manualOverrides.map(o => [o.trigger_handle, o]));
  const effective: UpsellRuleRow[] = [];
  const now = new Date().toISOString();

  for (const trigger of triggerSlugs) {
    const manual = manualByTrigger.get(trigger);
    if (manual) {
      manual.upsell_handles.forEach((upsellHandle, index) => {
        effective.push({
          id: -1,
          trigger_handle: trigger,
          upsell_handle: upsellHandle,
          priority: index + 1,
          custom_message: null,
          active: true,
          start_date: null,
          end_date: null,
          import_batch_id: 'manual',
          created_at: now,
        });
      });
    } else {
      for (const rule of csvRules) {
        if (rule.trigger_handle === trigger) effective.push(rule);
      }
    }
  }
  return effective;
}

// The heading is resolved against a single "primary" product rather than the
// whole trigger set, since a basket/cart context can have several different
// trigger products with conflicting headings — see the public route for how
// `primary` is chosen. Each product has two independently-editable headings:
// `heading` for its own product-page upsell section, `basket_heading` for the
// popup shown right after it's added to the basket. Precedence is always
// this product's heading for the given context, falling straight back to the
// hardcoded DEFAULT_UPSELL_HEADING constant — fully product-specific, no
// site-wide tier.
export function resolveUpsellHeading(
  primarySlug: string | null,
  manualOverrides: UpsellManualOverrideRow[],
  context: 'product' | 'basket' = 'product'
): string {
  if (!primarySlug) return DEFAULT_UPSELL_HEADING;
  const override = manualOverrides.find(o => o.trigger_handle === primarySlug);
  const heading = (context === 'basket' ? override?.basket_heading : override?.heading)?.trim();
  return heading ? heading : DEFAULT_UPSELL_HEADING;
}

export function computeUpsellRecommendations(params: {
  basketSlugs: string[];
  rules: UpsellRuleRow[];
  catalogue: Product[];
  hiddenSlugs: Set<string>;
  stockMap: Record<string, number>;
  today: string; // 'YYYY-MM-DD'
}): UpsellRecommendation[] {
  const { basketSlugs, rules, catalogue, hiddenSlugs, stockMap, today } = params;

  const basketSet = new Set(basketSlugs);
  const productBySlug = new Map(catalogue.map(p => [p.slug, p]));

  // Merge across every triggering basket item: collect (priority, rule) pairs
  // keyed by upsell slug, keeping the lowest (best) priority number seen for
  // each one if it's recommended by more than one item in the basket.
  const bestPriority = new Map<string, { priority: number; message: string | null }>();

  for (const rule of rules) {
    if (!basketSet.has(rule.trigger_handle)) continue;
    if (!isRuleCurrentlyActive(rule, today)) continue;
    if (basketSet.has(rule.upsell_handle)) continue; // already in the basket

    const product = productBySlug.get(rule.upsell_handle);
    if (!product) continue; // handle no longer matches any real product
    if (hiddenSlugs.has(product.slug)) continue;
    if (effectiveAvailability(product, stockMap[product.slug]) !== 'available') continue;

    const existing = bestPriority.get(rule.upsell_handle);
    if (!existing || rule.priority < existing.priority) {
      bestPriority.set(rule.upsell_handle, { priority: rule.priority, message: rule.custom_message });
    }
  }

  // "Suggest AA water INSTEAD of BAC water." A curated rule saved months ago may still name the
  // wrong one, so drop any diluent that nothing in this basket actually calls for. A basket holding
  // both kinds keeps both, because then both are genuinely wanted.
  const wantedDiluents = new Set<string>();
  for (const slug of basketSlugs) {
    const product = productBySlug.get(slug);
    const target = product ? reconstitutionTargetFor(product) : null;
    if (target) wantedDiluents.add(target);
  }
  for (const slug of Array.from(bestPriority.keys())) {
    if (KNOWN_DILUENT_SLUGS.has(slug) && !wantedDiluents.has(slug)) bestPriority.delete(slug);
  }

  return Array.from(bestPriority.entries())
    .sort((a, b) => a[1].priority - b[1].priority)
    .slice(0, MAX_RECOMMENDATIONS)
    .map(([slug, { message }]) => {
      const product = productBySlug.get(slug)!;
      const variant = cheapestVariant(product);
      return {
        slug,
        productId: product.id,
        name: product.name,
        variant: variant.dosage,
        price: variant.price,
        image: variant.image || product.image,
        message,
        variants: activeVariants(product).map(v => ({ dosage: v.dosage, price: v.price })),
      };
    });
}
