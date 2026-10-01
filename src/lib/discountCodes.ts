// Shared scoping/eligibility logic for admin-managed discount codes, used by
// both the checkout preview (api/discount-validate, checkout/page.tsx) and
// the server-authoritative recalculation in api/checkout/place-order. Having
// one implementation keeps the preview and the final charge in agreement to
// the penny.
import { percentOf, roundMoney } from '@/lib/money';

// The one-time 10% membership signup code, issued automatically at the end
// of a successful registration (see api/account/register). Format/charset
// matches what the now-removed email-only discount-signup route used.
const SIGNUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easier to read and type

export function generateSignupDiscountCode(): string {
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += SIGNUP_CODE_CHARS[Math.floor(Math.random() * SIGNUP_CODE_CHARS.length)];
  }
  return `WGLOW10-${suffix}`;
}

export function isRafPersonalDiscountCode(code: string | null | undefined): boolean {
  return Boolean(code?.trim().toUpperCase().startsWith('RAF5-'));
}

// Why a staff-made code cannot be spent right now, in the basket's own words, or null when it can.
// Used when the order is placed, so a code that is switched off, out of date or used up is refused
// there too, not only in the basket preview (Samuel, 27 Sep 2026). Mirrors the conditions in
// redeemDiscountCodeAtomic (src/lib/db.ts).
export function staffCodeRefusal(
  row: { active: boolean; expires_at: string | Date | null; usage_limit: number | null; times_redeemed: number },
  now: number = Date.now(),
): string | null {
  if (!row.active) return 'That code is no longer active.';
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return 'That code has expired.';
  if (row.usage_limit !== null && Number(row.times_redeemed) >= Number(row.usage_limit)) return 'That code has reached its usage limit.';
  return null;
}

export type DiscountType = 'percentage' | 'fixed';
export type DiscountScopeType = 'all' | 'category' | 'product';

// A cart line item reduced to the fields needed to test scope eligibility.
export interface DiscountScopeItem {
  slug?: string | null;
  price: number;
  quantity: number;
  categories: string[];
}

export interface DiscountCodeInfo {
  discountType: DiscountType;
  percentage: number | null;
  fixedAmount: number | null;
  scopeType: DiscountScopeType;
  scopeCategories: string[];
  scopeProductSlugs: string[];
}

// Structural shape of the relevant DiscountCodeRow columns — kept separate
// from `@/lib/db`'s DiscountCodeRow so this module has no server-only
// dependencies and can be imported from client components.
export interface DiscountCodeRowLike {
  percentage: number | null;
  discount_type: string;
  fixed_amount: string | number | null;
  scope_type: string;
  scope_categories: unknown;
  scope_product_slugs: unknown;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function discountCodeInfoFromRow(row: DiscountCodeRowLike): DiscountCodeInfo {
  return {
    discountType: row.discount_type === 'fixed' ? 'fixed' : 'percentage',
    percentage: row.percentage === null || row.percentage === undefined ? null : Number(row.percentage),
    fixedAmount: row.fixed_amount === null || row.fixed_amount === undefined ? null : Number(row.fixed_amount),
    scopeType: row.scope_type === 'category' || row.scope_type === 'product' ? row.scope_type : 'all',
    scopeCategories: toStringArray(row.scope_categories),
    scopeProductSlugs: toStringArray(row.scope_product_slugs),
  };
}

export function itemMatchesDiscountScope(info: DiscountCodeInfo, item: DiscountScopeItem): boolean {
  if (info.scopeType === 'category') return item.categories.some((c) => info.scopeCategories.includes(c));
  if (info.scopeType === 'product') return !!item.slug && info.scopeProductSlugs.includes(item.slug);
  return true;
}

// The portion of the cart subtotal this code is allowed to discount.
export function eligibleSubtotal(info: DiscountCodeInfo, items: DiscountScopeItem[]): number {
  const total = items
    .filter((item) => itemMatchesDiscountScope(info, item))
    .reduce((sum, item) => sum + item.price * item.quantity, 0);
  return roundMoney(total);
}

// Resolves the final discount amount for an order subtotal that has already
// had automatic promotion-rule discounts applied. Whole-order ("all" scope)
// codes discount that subtotal directly. Category/product-scoped codes work
// out what share of the pre-rule cart total the eligible items represent,
// then apply that same share of `subtotal` — so a scoped code discounts what
// the customer is actually paying for those items once automatic rules have
// already reduced the order, in the same proportion as the rest of the cart.
// When no automatic rules are active (subtotal === pre-rule total) this is
// identical to discounting the eligible items at their own price. Shared by
// the checkout preview and the server-authoritative recalculation so they
// agree to the penny.
export function resolveDiscountAmount(info: DiscountCodeInfo, subtotal: number, items: DiscountScopeItem[]): number {
  if (subtotal <= 0) return 0;
  if (info.scopeType === 'all') {
    if (info.discountType === 'fixed') return Math.min(roundMoney(info.fixedAmount ?? 0), subtotal);
    return percentOf(subtotal, info.percentage ?? 0);
  }

  const preRuleTotal = roundMoney(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const eligiblePreRule = eligibleSubtotal(info, items);
  if (eligiblePreRule <= 0 || preRuleTotal <= 0) return 0;

  const eligibleShare = roundMoney(eligiblePreRule * (subtotal / preRuleTotal));
  if (info.discountType === 'fixed') return Math.min(roundMoney(info.fixedAmount ?? 0), eligibleShare, subtotal);
  return Math.min(percentOf(eligibleShare, info.percentage ?? 0), subtotal);
}

// Human-readable description of which products a code applies to, for
// customer-facing messages and admin tables.
export function discountScopeLabel(info: DiscountCodeInfo): string {
  if (info.scopeType === 'category') {
    return info.scopeCategories.length > 0 ? info.scopeCategories.join(', ') : 'selected categories';
  }
  if (info.scopeType === 'product') return 'selected products';
  return 'your whole order';
}

export function discountAmountLabel(info: DiscountCodeInfo): string {
  if (info.discountType === 'fixed') return `£${(info.fixedAmount ?? 0).toFixed(2)} off`;
  return `${info.percentage ?? 0}% off`;
}

const VALID_DISCOUNT_TYPES = ['percentage', 'fixed'];
const VALID_SCOPE_TYPES = ['all', 'category', 'product'];

export type ParsedDiscountFields =
  | { error: string; status: number }
  | {
      error: null;
      discountType: string;
      percentage: number | null;
      fixedAmount: number | null;
      scopeType: string;
      scopeCategories: string[];
      scopeProductSlugs: string[];
    };

// Shared validation for the discount-type/amount and scope fields submitted
// from the admin discount code form — used by both the create
// (api/admin/discount-codes) and edit (api/admin/discount-codes/[id]) routes.
export function parseDiscountTypeAndScope(body: Record<string, unknown>): ParsedDiscountFields {
  const discountType = VALID_DISCOUNT_TYPES.includes(body.discountType as string) ? (body.discountType as string) : 'percentage';

  let percentage: number | null = null;
  let fixedAmount: number | null = null;

  if (discountType === 'fixed') {
    const parsed = Number(body.fixedAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { error: 'Fixed discount amount must be a positive amount.', status: 400 };
    }
    fixedAmount = roundMoney(parsed);
  } else {
    const parsed = Number(body.percentage);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      return { error: 'Percentage off must be a whole number between 1 and 100.', status: 400 };
    }
    percentage = parsed;
  }

  const scopeType = VALID_SCOPE_TYPES.includes(body.scopeType as string) ? (body.scopeType as string) : 'all';
  let scopeCategories: string[] = [];
  let scopeProductSlugs: string[] = [];

  if (scopeType === 'category') {
    scopeCategories = Array.isArray(body.scopeCategories)
      ? body.scopeCategories.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).map((c) => c.trim())
      : [];
    if (scopeCategories.length === 0) {
      return { error: 'Select at least one category for a category-scoped code.', status: 400 };
    }
  } else if (scopeType === 'product') {
    scopeProductSlugs = Array.isArray(body.scopeProductSlugs)
      ? body.scopeProductSlugs.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
      : [];
    if (scopeProductSlugs.length === 0) {
      return { error: 'Select at least one product for a product-scoped code.', status: 400 };
    }
  }

  return { error: null, discountType, percentage, fixedAmount, scopeType, scopeCategories, scopeProductSlugs };
}
