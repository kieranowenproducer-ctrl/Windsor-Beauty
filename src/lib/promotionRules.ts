// Automatic promotion rules engine: BOGO, bundle pricing, and
// spend-threshold rewards applied to every cart/order automatically (no
// discount code required). Additive to the existing `promotions` (homepage
// banner) and `discount_codes` (manual %) systems.

import type { Product } from '@/data/products';
import type { OrderItemRecord, PromotionRuleRow } from './db';
import { round2 } from './orderPricing';

// ─── Selectors ──────────────────────────────────────────────────────────────

export type RuleSelector =
  | { scope: 'product'; slug: string; dosage?: string }
  | { scope: 'category'; category: string };

function isValidSelector(value: unknown): value is RuleSelector {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.scope === 'product') {
    return typeof v.slug === 'string' && v.slug.length > 0 && (v.dosage === undefined || typeof v.dosage === 'string');
  }
  if (v.scope === 'category') {
    return typeof v.category === 'string' && v.category.length > 0;
  }
  return false;
}

// ─── Config shapes ──────────────────────────────────────────────────────────

export interface BogoConfig {
  buy: { selector: RuleSelector; quantity: number };
  /** Omitted = same as `buy.selector`, quantity 1 (classic same-product BOGO). */
  get?: { selector: RuleSelector; quantity: number };
  rewardType: 'free' | 'percent_off';
  rewardPercent?: number;
}

export interface BundleItemSpec {
  slug: string;
  dosage?: string;
  /** Defaults to 1. */
  quantity?: number;
}

export interface BundleConfig {
  items: BundleItemSpec[];
  rewardType: 'bundle_price' | 'percent_off';
  bundlePrice?: number;
  rewardPercent?: number;
}

export type SpendScope = { type: 'all' } | { type: 'category'; category: string };

export interface SpendThresholdConfig {
  minSpend: number;
  scope: SpendScope;
  rewardType: 'percent_off' | 'free_item';
  rewardPercent?: number;
  freeItem?: { slug: string; dosage?: string; quantity?: number };
}

export type PromotionRule =
  | { id: number; name: string; type: 'bogo'; config: BogoConfig; priority: number }
  | { id: number; name: string; type: 'bundle'; config: BundleConfig; priority: number }
  | { id: number; name: string; type: 'spend_threshold'; config: SpendThresholdConfig; priority: number };

// ─── Validation (shared with admin API) ────────────────────────────────────

function validateBogoConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object') return 'Missing config.';
  const c = config as Record<string, unknown>;
  if (!c.buy || typeof c.buy !== 'object') return 'Missing "buy" condition.';
  const buy = c.buy as Record<string, unknown>;
  if (!isValidSelector(buy.selector)) return 'Invalid "buy" selector.';
  if (typeof buy.quantity !== 'number' || buy.quantity < 1) return '"buy" quantity must be at least 1.';
  if (c.get !== undefined) {
    if (!c.get || typeof c.get !== 'object') return 'Invalid "get" condition.';
    const get = c.get as Record<string, unknown>;
    if (!isValidSelector(get.selector)) return 'Invalid "get" selector.';
    if (typeof get.quantity !== 'number' || get.quantity < 1) return '"get" quantity must be at least 1.';
  }
  if (c.rewardType !== 'free' && c.rewardType !== 'percent_off') return 'rewardType must be "free" or "percent_off".';
  if (c.rewardType === 'percent_off' && (typeof c.rewardPercent !== 'number' || c.rewardPercent <= 0 || c.rewardPercent > 100)) {
    return 'rewardPercent must be between 0 and 100.';
  }
  return null;
}

function validateBundleConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object') return 'Missing config.';
  const c = config as Record<string, unknown>;
  if (!Array.isArray(c.items) || c.items.length < 2) return 'A bundle needs at least 2 items.';
  for (const item of c.items) {
    if (!item || typeof item !== 'object') return 'Invalid bundle item.';
    const i = item as Record<string, unknown>;
    if (typeof i.slug !== 'string' || !i.slug) return 'Each bundle item needs a product.';
    if (i.dosage !== undefined && typeof i.dosage !== 'string') return 'Invalid bundle item dosage.';
    if (i.quantity !== undefined && (typeof i.quantity !== 'number' || i.quantity < 1)) return 'Bundle item quantity must be at least 1.';
  }
  if (c.rewardType !== 'bundle_price' && c.rewardType !== 'percent_off') return 'rewardType must be "bundle_price" or "percent_off".';
  if (c.rewardType === 'bundle_price') {
    if (typeof c.bundlePrice !== 'number' || c.bundlePrice < 0) return 'bundlePrice must be a positive number.';
  } else if (typeof c.rewardPercent !== 'number' || c.rewardPercent <= 0 || c.rewardPercent > 100) {
    return 'rewardPercent must be between 0 and 100.';
  }
  return null;
}

function validateSpendThresholdConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object') return 'Missing config.';
  const c = config as Record<string, unknown>;
  if (typeof c.minSpend !== 'number' || c.minSpend <= 0) return 'minSpend must be a positive number.';
  if (!c.scope || typeof c.scope !== 'object') return 'Missing scope.';
  const scope = c.scope as Record<string, unknown>;
  if (scope.type === 'category') {
    if (typeof scope.category !== 'string' || !scope.category) return 'Category scope needs a category.';
  } else if (scope.type !== 'all') {
    return 'scope.type must be "all" or "category".';
  }
  if (c.rewardType !== 'percent_off' && c.rewardType !== 'free_item') return 'rewardType must be "percent_off" or "free_item".';
  if (c.rewardType === 'percent_off') {
    if (typeof c.rewardPercent !== 'number' || c.rewardPercent <= 0 || c.rewardPercent > 100) return 'rewardPercent must be between 0 and 100.';
  } else {
    if (!c.freeItem || typeof c.freeItem !== 'object') return 'Missing freeItem.';
    const freeItem = c.freeItem as Record<string, unknown>;
    if (typeof freeItem.slug !== 'string' || !freeItem.slug) return 'freeItem needs a product.';
    if (freeItem.dosage !== undefined && typeof freeItem.dosage !== 'string') return 'Invalid freeItem dosage.';
    if (freeItem.quantity !== undefined && (typeof freeItem.quantity !== 'number' || freeItem.quantity < 1)) return 'freeItem quantity must be at least 1.';
  }
  return null;
}

// Returns an error message if `config` is invalid for `type`, or `null` if valid.
export function validateRuleConfig(type: string, config: unknown): string | null {
  switch (type) {
    case 'bogo': return validateBogoConfig(config);
    case 'bundle': return validateBundleConfig(config);
    case 'spend_threshold': return validateSpendThresholdConfig(config);
    default: return 'Unknown rule type.';
  }
}

// Narrows a raw DB row into a typed PromotionRule, dropping (returning null
// for) malformed rows: one bad row can't break checkout for everyone.
export function parsePromotionRule(row: PromotionRuleRow): PromotionRule | null {
  if (row.type === 'bogo') {
    if (validateBogoConfig(row.config)) return null;
    return { id: row.id, name: row.name, type: 'bogo', config: row.config as BogoConfig, priority: row.priority };
  }
  if (row.type === 'bundle') {
    if (validateBundleConfig(row.config)) return null;
    return { id: row.id, name: row.name, type: 'bundle', config: row.config as BundleConfig, priority: row.priority };
  }
  if (row.type === 'spend_threshold') {
    if (validateSpendThresholdConfig(row.config)) return null;
    return { id: row.id, name: row.name, type: 'spend_threshold', config: row.config as SpendThresholdConfig, priority: row.priority };
  }
  return null;
}

// ─── Cart items ─────────────────────────────────────────────────────────────

export interface RuleCartItem {
  index: number;
  slug?: string;
  dosage: string;
  price: number;
  quantity: number;
  categories: string[];
  name: string;
}

export function toRuleCartItems(items: OrderItemRecord[], productsBySlug: Map<string, Product>): RuleCartItem[] {
  return items.map((item, index) => {
    const product = item.slug ? productsBySlug.get(item.slug) : undefined;
    return {
      index,
      slug: item.slug,
      dosage: item.variant,
      price: item.price,
      quantity: item.quantity,
      categories: product?.categories ?? [],
      name: item.name,
    };
  });
}

function selectorMatches(selector: RuleSelector, item: RuleCartItem): boolean {
  if (selector.scope === 'product') {
    if (item.slug !== selector.slug) return false;
    if (selector.dosage !== undefined && item.dosage !== selector.dosage) return false;
    return true;
  }
  return item.categories.includes(selector.category);
}

function describeSelector(selector: RuleSelector, productsBySlug: Map<string, Product>): string {
  if (selector.scope === 'product') {
    const product = productsBySlug.get(selector.slug);
    const name = product?.name ?? selector.slug;
    return selector.dosage ? `${name} (${selector.dosage})` : name;
  }
  return selector.category;
}

// ─── Results ────────────────────────────────────────────────────────────────

export interface RuleAdjustment {
  /** Index into the cart-items array this adjustment applies to. */
  index: number;
  quantity: number;
  amountPerUnit: number;
}

export interface FreeItemAward {
  slug: string;
  dosage: string;
  name: string;
  /** Catalogue price, for display only: the order line itself is recorded at price 0. */
  price: number;
  quantity: number;
}

export interface AppliedRuleResult {
  ruleId: number;
  name: string;
  type: PromotionRule['type'];
  description: string;
  discountAmount: number;
  adjustments: RuleAdjustment[];
  freeItems: FreeItemAward[];
}

// Lightweight snapshot stored on the order / returned from the preview API:
// drops the internal adjustments used only during evaluation.
export interface AppliedRuleSummary {
  ruleId: number;
  name: string;
  type: PromotionRule['type'];
  description: string;
  discountAmount: number;
}

export function toAppliedRuleSummary(result: AppliedRuleResult): AppliedRuleSummary {
  return {
    ruleId: result.ruleId,
    name: result.name,
    type: result.type,
    description: result.description,
    discountAmount: result.discountAmount,
  };
}

export function toOrderItemRecord(award: FreeItemAward): OrderItemRecord {
  return {
    name: award.name,
    variant: award.dosage,
    price: 0,
    quantity: award.quantity,
    slug: award.slug,
  };
}

export interface CartRulesResult {
  ruleDiscountAmount: number;
  appliedRules: AppliedRuleResult[];
  freeItems: FreeItemAward[];
}

type RuleEvalResult = {
  discountAmount: number;
  adjustments: RuleAdjustment[];
  freeItems: FreeItemAward[];
  description: string;
} | null;

// ─── BOGO ───────────────────────────────────────────────────────────────────

function evaluateBogo(
  config: BogoConfig,
  items: RuleCartItem[],
  consumedUnits: Map<number, number>,
  productsBySlug: Map<string, Product>
): RuleEvalResult {
  const { buy, get, rewardType, rewardPercent } = config;
  const getSelector = get?.selector ?? buy.selector;
  const getQuantity = get?.quantity ?? 1;

  // Eligibility uses each line's full quantity, regardless of consumedUnits.
  const totalBuyQty = items
    .filter((item) => selectorMatches(buy.selector, item))
    .reduce((sum, item) => sum + item.quantity, 0);

  const cycles = Math.floor(totalBuyQty / buy.quantity);
  if (cycles <= 0) return null;

  let wanted = cycles * getQuantity;

  // Granting only consumes units not already claimed by an earlier rule,
  // cheapest-first so the reward is as generous as possible for the customer.
  const candidates = items
    .filter((item) => selectorMatches(getSelector, item))
    .map((item) => ({ item, available: item.quantity - (consumedUnits.get(item.index) ?? 0) }))
    .filter((c) => c.available > 0)
    .sort((a, b) => a.item.price - b.item.price);

  const adjustments: RuleAdjustment[] = [];
  let discountAmount = 0;
  for (const candidate of candidates) {
    if (wanted <= 0) break;
    const take = Math.min(wanted, candidate.available);
    const amountPerUnit = rewardType === 'free'
      ? candidate.item.price
      : round2(candidate.item.price * (rewardPercent ?? 0) / 100);
    discountAmount = round2(discountAmount + amountPerUnit * take);
    adjustments.push({ index: candidate.item.index, quantity: take, amountPerUnit });
    wanted -= take;
  }

  // "get" item isn't in the basket: can't discount a unit that doesn't exist.
  if (adjustments.length === 0) return null;

  const buyName = describeSelector(buy.selector, productsBySlug);
  const getName = get ? describeSelector(getSelector, productsBySlug) : buyName;
  const rewardLabel = rewardType === 'free' ? 'free' : `${rewardPercent}% off`;
  const description = `Buy ${buy.quantity} ${buyName}, get ${getQuantity} ${getName} ${rewardLabel}`;

  return { discountAmount, adjustments, freeItems: [], description };
}

// ─── Bundle ─────────────────────────────────────────────────────────────────

function evaluateBundle(
  config: BundleConfig,
  items: RuleCartItem[],
  consumedUnits: Map<number, number>,
  productsBySlug: Map<string, Product>
): RuleEvalResult {
  const { items: specs, rewardType, bundlePrice, rewardPercent } = config;

  const specMatches = specs.map((spec) => {
    const quantity = spec.quantity ?? 1;
    const matches = items
      .filter((item) => item.slug === spec.slug && (spec.dosage === undefined || item.dosage === spec.dosage))
      .map((item) => ({ item, available: item.quantity - (consumedUnits.get(item.index) ?? 0) }))
      .filter((c) => c.available > 0)
      .sort((a, b) => a.item.price - b.item.price);
    const availableQty = matches.reduce((sum, m) => sum + m.available, 0);
    return { spec, quantity, matches, availableQty };
  });

  // Bundle is only complete if every spec has at least one full set available.
  const instances = Math.min(...specMatches.map((sm) => Math.floor(sm.availableQty / sm.quantity)));
  if (!Number.isFinite(instances) || instances <= 0) return null;

  const adjustments: RuleAdjustment[] = [];
  let catalogueTotal = 0;

  for (const sm of specMatches) {
    let remaining = sm.quantity * instances;
    for (const m of sm.matches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, m.available);
      adjustments.push({ index: m.item.index, quantity: take, amountPerUnit: 0 });
      catalogueTotal = round2(catalogueTotal + m.item.price * take);
      remaining -= take;
    }
  }

  let discountAmount: number;
  if (rewardType === 'bundle_price') {
    discountAmount = Math.max(0, round2(catalogueTotal - (bundlePrice ?? 0) * instances));
    // Distribute the bundle discount proportionally across allocated units
    // so each line's per-unit reduction is visible in the breakdown.
    for (const adj of adjustments) {
      const item = items.find((i) => i.index === adj.index)!;
      const lineShare = catalogueTotal > 0 ? (item.price * adj.quantity) / catalogueTotal : 0;
      adj.amountPerUnit = adj.quantity > 0 ? round2((discountAmount * lineShare) / adj.quantity) : 0;
    }
  } else {
    discountAmount = 0;
    for (const adj of adjustments) {
      const item = items.find((i) => i.index === adj.index)!;
      adj.amountPerUnit = round2(item.price * (rewardPercent ?? 0) / 100);
      discountAmount = round2(discountAmount + adj.amountPerUnit * adj.quantity);
    }
  }

  if (discountAmount <= 0) return null;

  const itemNames = specs
    .map((spec) => {
      const product = productsBySlug.get(spec.slug);
      const name = product?.name ?? spec.slug;
      return spec.dosage ? `${name} (${spec.dosage})` : name;
    })
    .join(' + ');
  const description = rewardType === 'bundle_price'
    ? `${itemNames} bundle for £${(bundlePrice ?? 0).toFixed(2)}`
    : `${itemNames} bundle: ${rewardPercent}% off`;

  return { discountAmount, adjustments, freeItems: [], description };
}

// ─── Spend threshold ────────────────────────────────────────────────────────

function evaluateSpendThreshold(
  config: SpendThresholdConfig,
  items: RuleCartItem[],
  consumedUnits: Map<number, number>,
  productsBySlug: Map<string, Product>
): RuleEvalResult {
  const { minSpend, scope, rewardType, rewardPercent, freeItem } = config;

  const scopedItems = scope.type === 'category'
    ? items.filter((item) => item.categories.includes(scope.category))
    : items;
  const scopeSubtotal = round2(scopedItems.reduce((sum, item) => sum + item.price * item.quantity, 0));

  if (scopeSubtotal < minSpend) return null;

  const scopeLabel = scope.type === 'category' ? ` in ${scope.category}` : '';

  if (rewardType === 'percent_off') {
    // A blanket % off the whole order: doesn't mark consumedUnits, since
    // it's not a per-unit reward. If multiple spend-threshold percent_off
    // rules are active, they apply cumulatively (admin's responsibility not
    // to overlap them, documented in the admin UI).
    const fullSubtotal = round2(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
    const discountAmount = round2(fullSubtotal * (rewardPercent ?? 0) / 100);
    if (discountAmount <= 0) return null;
    const description = `Spend £${minSpend.toFixed(2)}${scopeLabel}, get ${rewardPercent}% off your order`;
    return { discountAmount, adjustments: [], freeItems: [], description };
  }

  if (!freeItem) return null;
  const wantQty = freeItem.quantity ?? 1;

  // Prefer giving the discount against an existing matching line (consumes
  // spare units); only add a genuinely new line if none has spare capacity.
  const matches = items
    .filter((item) => item.slug === freeItem.slug && (freeItem.dosage === undefined || item.dosage === freeItem.dosage))
    .map((item) => ({ item, available: item.quantity - (consumedUnits.get(item.index) ?? 0) }))
    .filter((c) => c.available > 0)
    .sort((a, b) => a.item.price - b.item.price);

  const adjustments: RuleAdjustment[] = [];
  const freeItems: FreeItemAward[] = [];
  let discountAmount = 0;
  let remaining = wantQty;

  for (const m of matches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, m.available);
    adjustments.push({ index: m.item.index, quantity: take, amountPerUnit: m.item.price });
    discountAmount = round2(discountAmount + m.item.price * take);
    remaining -= take;
  }

  if (remaining > 0) {
    const product = productsBySlug.get(freeItem.slug);
    const dosage = freeItem.dosage ?? product?.variants[0]?.dosage ?? '';
    const variant = product?.variants.find((v) => v.dosage === dosage) ?? product?.variants[0];
    freeItems.push({
      slug: freeItem.slug,
      dosage,
      name: product?.name ?? freeItem.slug,
      price: variant?.price ?? 0,
      quantity: remaining,
    });
  }

  const product = productsBySlug.get(freeItem.slug);
  const itemName = product?.name ?? freeItem.slug;
  const itemLabel = freeItem.dosage ? `${itemName} (${freeItem.dosage})` : itemName;
  const description = `Spend £${minSpend.toFixed(2)}${scopeLabel}, get a free ${itemLabel}`;

  return { discountAmount, adjustments, freeItems, description };
}

// ─── Top-level evaluation ───────────────────────────────────────────────────

// Evaluates every active rule (in priority order) against the cart, sharing a
// `consumedUnits` map across rules so two rules never discount the same
// physical unit twice.
export function evaluateCartRules(
  items: RuleCartItem[],
  activeRules: PromotionRule[],
  productsBySlug: Map<string, Product>
): CartRulesResult {
  const consumedUnits = new Map<number, number>();
  const appliedRules: AppliedRuleResult[] = [];
  const freeItems: FreeItemAward[] = [];
  let ruleDiscountAmount = 0;

  for (const rule of activeRules) {
    const result = rule.type === 'bogo'
      ? evaluateBogo(rule.config, items, consumedUnits, productsBySlug)
      : rule.type === 'bundle'
      ? evaluateBundle(rule.config, items, consumedUnits, productsBySlug)
      : evaluateSpendThreshold(rule.config, items, consumedUnits, productsBySlug);

    if (!result) continue;

    for (const adj of result.adjustments) {
      consumedUnits.set(adj.index, (consumedUnits.get(adj.index) ?? 0) + adj.quantity);
    }
    freeItems.push(...result.freeItems);
    ruleDiscountAmount = round2(ruleDiscountAmount + result.discountAmount);
    appliedRules.push({
      ruleId: rule.id,
      name: rule.name,
      type: rule.type,
      description: result.description,
      discountAmount: result.discountAmount,
      adjustments: result.adjustments,
      freeItems: result.freeItems,
    });
  }

  return { ruleDiscountAmount, appliedRules, freeItems };
}

export function notNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
