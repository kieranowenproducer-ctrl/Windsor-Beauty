import { filterPromotionRulesForProducts } from '@/lib/productVisibility';
import { loadProductAccess, filterProductRecords, mayAccessProduct, productJson } from '@/lib/productAccess';
import { NextResponse } from 'next/server';
import { isDbConfigured, listActivePromotionRules, type OrderItemRecord } from '@/lib/db';
import { getProductsBySlug } from '@/lib/shipping';
import { sumMoney } from '@/lib/money';
import { priceForCustomer } from '@/lib/memberPricing';
import { resolveCustomerFromRequest } from '@/lib/auth';
import {
  evaluateCartRules,
  notNull,
  parsePromotionRule,
  toAppliedRuleSummary,
  toRuleCartItems,
  type AppliedRuleSummary,
  type FreeItemAward,
} from '@/lib/promotionRules';

interface PreviewItemInput {
  slug?: string;
  variant?: string;
  quantity: number;
}

function isValidPreviewItem(item: unknown): item is PreviewItemInput {
  if (!item || typeof item !== 'object') return false;
  const i = item as Record<string, unknown>;
  return (
    typeof i.quantity === 'number' &&
    i.quantity > 0 &&
    (i.slug === undefined || typeof i.slug === 'string') &&
    (i.variant === undefined || typeof i.variant === 'string')
  );
}

interface PreviewResponse {
  subtotal: number;
  ruleDiscountAmount: number;
  subtotalAfterRules: number;
  appliedRules: AppliedRuleSummary[];
  freeItems: FreeItemAward[];
}

const EMPTY_RESPONSE: PreviewResponse = {
  subtotal: 0,
  ruleDiscountAmount: 0,
  subtotalAfterRules: 0,
  appliedRules: [],
  freeItems: [],
};

// Read-only, unauthenticated preview of which automatic promotion rules apply
// to a cart — used by the cart drawer and checkout to show "Promotions
// applied" before the order is placed. Returns zeros on any error.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return productJson(EMPTY_RESPONSE);
  }

  const body = await request.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items.filter(isValidPreviewItem) as PreviewItemInput[] : [];

  if (!items.length) {
    return productJson(EMPTY_RESPONSE);
  }

  try {
    const access = await loadProductAccess(request);
    if (items.some(item => !item.slug || !mayAccessProduct(item.slug, access))) return productJson({ error: 'An item is no longer available to this account.' }, { status: 403 });
    const [productsBySlug, customer] = await Promise.all([getProductsBySlug(access), resolveCustomerFromRequest(request)]);

    const serverItems: OrderItemRecord[] = items.map((item) => {
      const product = item.slug ? productsBySlug.get(item.slug) : undefined;
      const variant = product?.variants.find((v) => v.dosage === item.variant);
      const active = product?.variants.filter((v) => v.enabled !== false);
      const candidates = active && active.length ? active : product?.variants;
      const memberPrice = variant?.price ?? candidates?.reduce((min, v) => (v.price < min.price ? v : min), candidates[0])?.price ?? 0;
      return {
        name: product?.name ?? item.slug ?? 'Item',
        variant: item.variant ?? '',
        price: priceForCustomer(memberPrice, Boolean(customer)),
        quantity: item.quantity,
        slug: item.slug,
      };
    });

    const subtotal = sumMoney(serverItems.map((item) => item.price * item.quantity));

    const activeRules = filterPromotionRulesForProducts((await listActivePromotionRules()).map(parsePromotionRule).filter(notNull), productsBySlug);
    if (!activeRules.length) {
      return productJson({ ...EMPTY_RESPONSE, subtotal, subtotalAfterRules: subtotal });
    }

    const result = evaluateCartRules(toRuleCartItems(serverItems, productsBySlug), activeRules, productsBySlug);
    const subtotalAfterRules = sumMoney([subtotal, -result.ruleDiscountAmount]);

    return productJson({
      subtotal,
      ruleDiscountAmount: result.ruleDiscountAmount,
      subtotalAfterRules,
      appliedRules: result.appliedRules.map(toAppliedRuleSummary),
      freeItems: result.freeItems,
    });
  } catch {
    return productJson(EMPTY_RESPONSE);
  }
}
