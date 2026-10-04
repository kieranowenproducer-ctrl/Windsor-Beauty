export interface ProductAudience { isAdmin: boolean; isMember: boolean }
export interface ProductAccessRule { hidden: boolean; membersOnly: boolean }
export interface ProductAccess { rules: Map<string, ProductAccessRule>; audience: ProductAudience }

export function mayAccessProduct(slug: string, access: ProductAccess): boolean {
  const rule = access.rules.get(slug);
  if (rule?.hidden) return false;
  return !rule?.membersOnly || access.audience.isAdmin || access.audience.isMember;
}

export function filterProductRecords<T>(records: Record<string, T>, access: ProductAccess): Record<string, T> {
  return Object.fromEntries(Object.entries(records).filter(([slug]) => mayAccessProduct(slug, access)));
}


/** Rules must not manufacture gifts or describe product-specific offers outside this catalogue. */
export function filterPromotionRulesForProducts<T extends import('./promotionRules').PromotionRule>(rules: T[], products: Map<string, unknown>): T[] {
  return rules.filter(rule => {
    if (rule.type === 'bundle') return rule.config.items.every(item => products.has(item.slug));
    if (rule.type === 'spend_threshold') return !rule.config.freeItem || products.has(rule.config.freeItem.slug);
    const selectors = [rule.config.buy.selector, rule.config.get?.selector].filter(Boolean);
    return selectors.every(selector => selector?.scope !== 'product' || products.has(selector.slug));
  });
}
