import { roundMoney } from '@/lib/money';

// Moved out of page.tsx unchanged: the promotion and rule form types, their
// empty defaults, the config builders and the small converters.
// Only the word `export` was added.

export interface PromotionRow {
  id: number;
  title: string;
  description: string;
  button_text: string | null;
  button_link: string | null;
  discount_code: string | null;
  image_url: string | null;
  image_urls: string[];
  promotion_type: 'code' | 'informational' | 'percentage';
  discount_percent: number | null;
  discount_scope_type: 'all' | 'category' | 'product';
  discount_scope_categories: string[];
  discount_scope_product_slugs: string[];
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export const EMPTY_FORM = {
  title: '',
  description: '',
  buttonText: '',
  buttonLink: '',
  discountCode: '',
  imageUrls: [] as string[],
  promotionType: 'informational' as 'code' | 'informational' | 'percentage',
  discountPercent: '10',
  discountScopeType: 'all' as 'all' | 'category' | 'product',
  discountScopeCategories: [] as string[],
  discountScopeProductSlugs: [] as string[],
  startDate: '',
  endDate: '',
  active: true,
};

// ─── Automatic promotion rules (BOGO / bundle / spend threshold) ───────────

export interface PromotionRuleRow {
  id: number;
  name: string;
  type: string;
  config: unknown;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
}

export type RuleSelectorPayload =
  | { scope: 'product'; slug: string; dosage?: string }
  | { scope: 'category'; category: string };

export interface SelectorFormState {
  scope: 'product' | 'category';
  slug: string;
  dosage: string;
  category: string;
}

export const EMPTY_SELECTOR: SelectorFormState = { scope: 'product', slug: '', dosage: '', category: '' };

export interface BundleItemFormState {
  slug: string;
  dosage: string;
  quantity: string;
}

export const EMPTY_BUNDLE_ITEM: BundleItemFormState = { slug: '', dosage: '', quantity: '1' };

export interface RuleFormState {
  name: string;
  type: 'bogo' | 'bundle' | 'spend_threshold';
  active: boolean;
  startDate: string;
  endDate: string;
  priority: string;
  // BOGO
  buySelector: SelectorFormState;
  buyQuantity: string;
  sameAsBuy: boolean;
  getSelector: SelectorFormState;
  getQuantity: string;
  bogoRewardType: 'free' | 'percent_off';
  bogoRewardPercent: string;
  // Bundle
  bundleItems: BundleItemFormState[];
  bundleRewardType: 'bundle_price' | 'percent_off';
  bundlePrice: string;
  bundleRewardPercent: string;
  // Spend threshold
  minSpend: string;
  spendScopeType: 'all' | 'category';
  spendScopeCategory: string;
  spendRewardType: 'percent_off' | 'free_item';
  spendRewardPercent: string;
  freeItemSlug: string;
  freeItemDosage: string;
  freeItemQuantity: string;
}

export const EMPTY_RULE_FORM: RuleFormState = {
  name: '',
  type: 'bogo',
  active: true,
  startDate: '',
  endDate: '',
  priority: '0',
  buySelector: { ...EMPTY_SELECTOR },
  buyQuantity: '2',
  sameAsBuy: true,
  getSelector: { ...EMPTY_SELECTOR },
  getQuantity: '1',
  bogoRewardType: 'free',
  bogoRewardPercent: '50',
  bundleItems: [{ ...EMPTY_BUNDLE_ITEM }, { ...EMPTY_BUNDLE_ITEM }],
  bundleRewardType: 'bundle_price',
  bundlePrice: '',
  bundleRewardPercent: '10',
  minSpend: '',
  spendScopeType: 'all',
  spendScopeCategory: '',
  spendRewardType: 'percent_off',
  spendRewardPercent: '10',
  freeItemSlug: '',
  freeItemDosage: '',
  freeItemQuantity: '1',
};

export const RULE_TYPE_LABELS: Record<string, string> = {
  bogo: 'BOGO',
  bundle: 'Bundle Pricing',
  spend_threshold: 'Spend Threshold',
};

export const SELECT_CLASS = 'border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors bg-white';
export const INPUT_CLASS = 'border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors';

export function selectorFromForm(s: SelectorFormState): RuleSelectorPayload | null {
  if (s.scope === 'product') {
    if (!s.slug) return null;
    return s.dosage ? { scope: 'product', slug: s.slug, dosage: s.dosage } : { scope: 'product', slug: s.slug };
  }
  if (!s.category) return null;
  return { scope: 'category', category: s.category };
}

export function selectorToForm(selector: unknown): SelectorFormState {
  if (!selector || typeof selector !== 'object') return { ...EMPTY_SELECTOR };
  const s = selector as Record<string, unknown>;
  if (s.scope === 'category') {
    return { scope: 'category', slug: '', dosage: '', category: typeof s.category === 'string' ? s.category : '' };
  }
  return {
    scope: 'product',
    slug: typeof s.slug === 'string' ? s.slug : '',
    dosage: typeof s.dosage === 'string' ? s.dosage : '',
    category: '',
  };
}

export function buildBogoConfig(form: RuleFormState): { config: unknown; error: string | null } {
  const buySelector = selectorFromForm(form.buySelector);
  if (!buySelector) return { config: null, error: 'Select a product or category for "Buy".' };
  const buyQuantity = Number(form.buyQuantity);
  if (!Number.isFinite(buyQuantity) || buyQuantity < 1) return { config: null, error: '"Buy" quantity must be at least 1.' };

  const config: Record<string, unknown> = {
    buy: { selector: buySelector, quantity: buyQuantity },
    rewardType: form.bogoRewardType,
  };

  if (!form.sameAsBuy) {
    const getSelector = selectorFromForm(form.getSelector);
    if (!getSelector) return { config: null, error: 'Select a product or category for "Get".' };
    const getQuantity = Number(form.getQuantity);
    if (!Number.isFinite(getQuantity) || getQuantity < 1) return { config: null, error: '"Get" quantity must be at least 1.' };
    config.get = { selector: getSelector, quantity: getQuantity };
  }

  if (form.bogoRewardType === 'percent_off') {
    const pct = Number(form.bogoRewardPercent);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return { config: null, error: 'Reward percent must be between 0 and 100.' };
    config.rewardPercent = pct;
  }

  return { config, error: null };
}

export function buildBundleConfig(form: RuleFormState): { config: unknown; error: string | null } {
  const items = form.bundleItems
    .filter((item) => item.slug)
    .map((item) => {
      const spec: Record<string, unknown> = { slug: item.slug };
      if (item.dosage) spec.dosage = item.dosage;
      const qty = Number(item.quantity);
      if (Number.isFinite(qty) && qty > 1) spec.quantity = qty;
      return spec;
    });
  if (items.length < 2) return { config: null, error: 'A bundle needs at least 2 items.' };

  const config: Record<string, unknown> = { items, rewardType: form.bundleRewardType };
  if (form.bundleRewardType === 'bundle_price') {
    const price = Number(form.bundlePrice);
    if (!Number.isFinite(price) || price < 0) return { config: null, error: 'Bundle price must be a positive number.' };
    config.bundlePrice = roundMoney(price);
  } else {
    const pct = Number(form.bundleRewardPercent);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return { config: null, error: 'Reward percent must be between 0 and 100.' };
    config.rewardPercent = pct;
  }
  return { config, error: null };
}

export function buildSpendThresholdConfig(form: RuleFormState): { config: unknown; error: string | null } {
  const minSpend = roundMoney(Number(form.minSpend));
  if (!Number.isFinite(minSpend) || minSpend <= 0) return { config: null, error: 'Minimum spend must be a positive number.' };

  if (form.spendScopeType === 'category' && !form.spendScopeCategory) {
    return { config: null, error: 'Select a category for the spend scope.' };
  }
  const scope: Record<string, unknown> = form.spendScopeType === 'category'
    ? { type: 'category', category: form.spendScopeCategory }
    : { type: 'all' };

  const config: Record<string, unknown> = { minSpend, scope, rewardType: form.spendRewardType };
  if (form.spendRewardType === 'percent_off') {
    const pct = Number(form.spendRewardPercent);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return { config: null, error: 'Reward percent must be between 0 and 100.' };
    config.rewardPercent = pct;
  } else {
    if (!form.freeItemSlug) return { config: null, error: 'Select a free item product.' };
    const freeItem: Record<string, unknown> = { slug: form.freeItemSlug };
    if (form.freeItemDosage) freeItem.dosage = form.freeItemDosage;
    const qty = Number(form.freeItemQuantity);
    if (Number.isFinite(qty) && qty > 1) freeItem.quantity = qty;
    config.freeItem = freeItem;
  }
  return { config, error: null };
}

export function toDatetimeLocal(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}
