// Shared shape + eligibility for the automatic sale discount. Originally
// admin-toggled from Discount Codes -> Automatic Sale Discounts (a JSON blob
// in site_content); now driven by the single active percentage-type
// Promotion instead (see siteSaleConfigFromPromotion below) — moved because
// it's not a customer-entered code, it's an automatic visible offer. Reuses
// the exact same scope model (all / category / product) and eligibility
// math as discountCodes.ts, so a sitewide, category, or product sale
// behaves exactly like the equivalent discount code would.
import { itemMatchesDiscountScope, type DiscountScopeType } from './discountCodes';
import { roundMoney } from './money';

export interface SiteSaleConfig {
  enabled: boolean;
  percent: number;
  scopeType: DiscountScopeType;
  scopeCategories: string[];
  scopeProductSlugs: string[];
}

export const DEFAULT_SITE_SALE: SiteSaleConfig = {
  enabled: false,
  percent: 0,
  scopeType: 'all',
  scopeCategories: [],
  scopeProductSlugs: [],
};

// The discount percentage that applies to a single catalogue item under the
// active sale, or 0 if the sale is off or this item falls outside its scope.
// Used for storefront price display (ProductCard, product detail page) —
// the checkout-side cart total instead uses resolveDiscountAmount directly
// (see place-order route) since it needs to split the discount proportionally
// across a whole cart, not just check one item.
export function effectiveSalePercent(config: SiteSaleConfig, item: { slug: string; categories: string[] }): number {
  if (!config.enabled || config.percent <= 0) return 0;
  const inScope = itemMatchesDiscountScope(
    {
      discountType: 'percentage',
      percentage: config.percent,
      fixedAmount: null,
      scopeType: config.scopeType,
      scopeCategories: config.scopeCategories,
      scopeProductSlugs: config.scopeProductSlugs,
    },
    { slug: item.slug, price: 0, quantity: 1, categories: item.categories }
  );
  return inScope ? config.percent : 0;
}

export function salePrice(price: number, percent: number): number {
  return roundMoney(price * (1 - percent / 100));
}

// Converts the single active percentage promotion (src/lib/db.ts
// getActivePercentagePromotion) into the same SiteSaleConfig shape the
// storefront already consumes everywhere (ProductCard, ProductCarousel,
// NewInCarousel, checkout). The automatic sale used to be configured at
// site_content.key = 'site-sale'; it now lives on the `promotions` table
// instead, but every downstream consumer of SiteSaleConfig is untouched
// because this function reproduces that exact shape. Pass null (no active
// percentage promotion) to get the disabled default.
export function siteSaleConfigFromPromotion(
  promo: {
    discount_percent: number | null;
    discount_scope_type: DiscountScopeType;
    discount_scope_categories: string[];
    discount_scope_product_slugs: string[];
  } | null
): SiteSaleConfig {
  if (!promo || !promo.discount_percent || promo.discount_percent <= 0) return DEFAULT_SITE_SALE;
  return {
    enabled: true,
    percent: promo.discount_percent,
    scopeType: promo.discount_scope_type,
    scopeCategories: promo.discount_scope_categories,
    scopeProductSlugs: promo.discount_scope_product_slugs,
  };
}
