import { NextResponse } from 'next/server';
import {
  getHiddenProductSlugs,
  getManualUpsellOverridesForTriggers,
  getProductStockMap,
  getSiteContent,
  getUpsellRulesForTriggers,
  isDbConfigured,
  listCustomProducts,
} from '@/lib/db';
import { mergeProducts, PRODUCTS } from '@/data/products';
import {
  buildCategoryFallbackRules,
  buildReconstitutionRules,
  buildEffectiveRules,
  computeUpsellRecommendations,
  coveredTriggerSlugs,
  DEFAULT_UPSELL_HEADING,
  parseUpsellSettings,
  resolveUpsellHeading,
} from '@/lib/upsells';

export const dynamic = 'force-dynamic';

const EMPTY_RESPONSE = { enabled: false, recommendations: [] as never[], heading: DEFAULT_UPSELL_HEADING };

// Public endpoint — the basket popup, /cart, and product pages all call this
// with the slugs currently relevant (cart contents, optionally the viewed
// product) and get back a ready-to-render recommendation list (already
// filtered for hidden/out-of-stock/in-basket, deduped, sorted by priority)
// plus a heading to display above it.
//
// `primary` (optional) names a single "anchor" product — either the one
// being viewed on a product page, or the one most recently added to the
// basket — used ONLY to resolve which product's custom heading to show; it
// does not change which products get recommended (that still comes from the
// full `basket` trigger set, which should already include `primary` if
// relevant). `context` ('product' | 'basket', default 'product') picks
// which of that product's two independently-editable headings to use.
// Without `primary` (no single obvious anchor), the default heading is used.
//
// Mandatory safe-fallback behaviour: the system disabled, a malformed
// settings row, or any unexpected error all fall through to the exact same
// "do nothing" response — the basket must never see an error or a broken
// layout because of this feature. A trigger with no CSV rule and no manual
// override is NOT treated as "nothing to show" — it gets catalogue-only
// category/complementary suggestions instead (buildCategoryFallbackRules),
// so a product page never silently has an empty recommendations section.
export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(EMPTY_RESPONSE);
  }

  try {
    const url = new URL(request.url);
    const basketParam = url.searchParams.get('basket') ?? '';
    const basketSlugs = basketParam.split(',').map(s => s.trim()).filter(Boolean);
    const primary = url.searchParams.get('primary')?.trim() || null;
    const context = url.searchParams.get('context') === 'basket' ? 'basket' : 'product';
    if (basketSlugs.length === 0) {
      return NextResponse.json(EMPTY_RESPONSE);
    }

    const settingsRow = await getSiteContent('upsell-settings');
    const settings = parseUpsellSettings(settingsRow?.body);
    if (!settings.enabled) {
      return NextResponse.json(EMPTY_RESPONSE);
    }

    const [csvRules, manualOverrides] = await Promise.all([
      getUpsellRulesForTriggers(basketSlugs),
      getManualUpsellOverridesForTriggers(basketSlugs),
    ]);
    const heading = resolveUpsellHeading(primary, manualOverrides, context);

    const [overrides, hiddenSlugList, stockMap] = await Promise.all([
      listCustomProducts(),
      getHiddenProductSlugs(),
      getProductStockMap(),
    ]);
    const catalogue = mergeProducts(PRODUCTS, overrides);
    const hiddenSlugs = new Set(hiddenSlugList);
    const today = new Date().toISOString().slice(0, 10);

    // Real CSV/manual rules always take priority; any trigger with neither
    // (e.g. a product nobody has curated upsells for yet) falls back to
    // catalogue-only category/complementary suggestions, so this section
    // never silently renders empty — see buildCategoryFallbackRules.
    const effectiveRules = buildEffectiveRules(basketSlugs, csvRules, manualOverrides);
    const fallbackRules = buildCategoryFallbackRules(basketSlugs, catalogue, coveredTriggerSlugs(csvRules, manualOverrides));
    // Bacteriostatic water is not curated and cannot be curated away: a vial of dry powder cannot
    // be used without it. Added on top of whatever else this product has, and ranked first.
    const reconstitutionRules = buildReconstitutionRules(basketSlugs, catalogue);
    const recommendations = computeUpsellRecommendations({
      basketSlugs,
      rules: [...reconstitutionRules, ...effectiveRules, ...fallbackRules],
      catalogue, hiddenSlugs, stockMap, today,
    });

    return NextResponse.json({ enabled: true, recommendations, heading });
  } catch {
    return NextResponse.json(EMPTY_RESPONSE);
  }
}
