// Shared pricing helpers used by order placement (place-order) and the
// promotion preview API: extracted so both can re-derive server-trusted
// prices and totals from the same logic.

import type { Product } from '@/data/products';
import { roundMoney } from './money';
import { priceForCustomer } from './memberPricing';

export interface IncomingItem {
  name: string;
  variant: string;
  price: number;
  quantity: number;
  slug?: string;
}

export function isValidItem(item: unknown): item is IncomingItem {
  if (!item || typeof item !== 'object') return false;
  const i = item as Record<string, unknown>;
  return (
    typeof i.name === 'string' &&
    typeof i.variant === 'string' &&
    typeof i.price === 'number' &&
    typeof i.quantity === 'number' &&
    i.quantity > 0 &&
    (i.slug === undefined || typeof i.slug === 'string')
  );
}

// The submitted cart comes from the browser's localStorage and could be
// stale or tampered: re-derive each item's price from the live catalogue by
// slug + variant (dosage) rather than trusting item.price. Items without a
// recognised slug fall back to the submitted price rather than blocking the
// order. If the slug is valid but the variant/dosage no longer exists (stale
// cart after an admin edit), fall back to the cheapest current variant rather
// than the client-submitted price, which would otherwise be fully attacker-controlled.
export function resolveServerItemPrice(item: IncomingItem, productsBySlug: Map<string, Product>, isMember: boolean): number {
  if (!item.slug) throw new Error('A basket item is missing its product reference.');
  const product = productsBySlug.get(item.slug);
  if (!product) throw new Error('A basket item is no longer available.');
  const variant = product.variants.find((v) => v.dosage === item.variant);
  if (variant) return priceForCustomer(variant.price, isMember);
  const active = product.variants.filter((v) => v.enabled !== false);
  const candidates = active.length ? active : product.variants;
  if (!candidates.length) throw new Error('A basket item is no longer available.');
  return priceForCustomer(candidates.reduce((min, v) => (v.price < min.price ? v : min)).price, isMember);
}

// Re-exported for backwards compatibility: see src/lib/money.ts for the
// rounding rationale. All new money arithmetic should import from money.ts
// directly.
export const round2 = roundMoney;
