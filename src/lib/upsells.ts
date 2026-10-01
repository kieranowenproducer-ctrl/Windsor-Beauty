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
  /** Every active variant, smallest size first. Add must ask the customer to choose from this list rather than silently adding `variant` whenever it has more than one entry. */
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
// Ranks every automatic same-category suggestion below any real CSV or manual rule
// (which use small positive integers).
const FALLBACK_PRIORITY_BASE = 1000;
export const FALLBACK_IMPORT_BATCH_ID = 'category-fallback';

// ─── No product in this shop REQUIRES another one ────────────────────────────
// There is no built-in rule and no hard-coded product: every suggestion comes
// from the admin's own rules (CSV or hand-picked), with same-category products
// as the fallback.

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
// admin hadn't gotten around to curating yet. One signal,
// for each uncovered trigger: same-category siblings, the best signal available
// without real purchase data. Always synthetic, always catalogue-only (every
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
