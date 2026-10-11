import { activeVariants, type Product } from '@/data/products';
import type { PromotionRuleRow } from '@/lib/db';
import { roundMoney, sumMoney } from '@/lib/money';
import type { CartItem } from '@/contexts/CartContext';

export const HAIR_BUNDLE_SLUG = 'ghk-cu-shampoo-conditioner-bundle';
export const HAIR_BUNDLE_NAME = 'GHK-Cu Shampoo & Conditioner Bundle';
export const HAIR_BOTTLE_SLUGS = ['ghk-cu-copper-peptide-shampoo', 'ghk-cu-copper-peptide-conditioner'] as const;

export interface HairCareBundle {
  ruleId: number;
  image: string;
  price: number;
  separatePrice: number;
  saving: number;
  stock: number;
  componentStock: Record<string, number>;
  products: Product[];
}

// A storefront bundle expands into the two real catalogue lines. The existing
// checkout then prices, counts stock and dispatches the physical bottles.
// Never create a third independent stock pool for the same bottles.
export function makeHairCareBundle(products: Product[], hidden: string[], stocks: Record<string, Record<string, number>>, activeRules: PromotionRuleRow[]): HairCareBundle | null {
  const components = HAIR_BOTTLE_SLUGS.map(slug => products.find(p => p.slug === slug && !hidden.includes(slug)));
  if (components.some(p => !p)) return null;
  const bottles = components as Product[];
  const variants = bottles.map(p => activeVariants(p).find(v => v.dosage === '350ml' && v.enabled !== false));
  if (variants.some(v => !v || v.price <= 0)) return null;
  const rule = activeRules.find(r => {
    const c = r.config as { items?: { slug: string; dosage?: string; quantity?: number }[]; rewardType?: string; bundlePrice?: number };
    return r.type === 'bundle' && r.active && c?.rewardType === 'bundle_price' && typeof c.bundlePrice === 'number' && c.bundlePrice > 0 && c.items?.length === 2 && HAIR_BOTTLE_SLUGS.every(slug => c.items?.some(i => i.slug === slug && i.dosage === '350ml' && (i.quantity ?? 1) === 1));
  });
  if (!rule) return null;
  const config = rule.config as { bundlePrice: number; storefrontImage?: string };
  if (!config.storefrontImage) return null;
  try { const url = new URL(config.storefrontImage); if (url.protocol !== 'https:' || url.hostname !== 'spccq4gx9wznklip.public.blob.vercel-storage.com') return null; } catch { return null; }
  const separatePrice = sumMoney(variants.map(v => v!.price));
  if (config.bundlePrice >= separatePrice) return null;
  const quantities = bottles.map(p => p.availability && p.availability !== 'available' ? 0 : stocks[p.slug]?.['350ml'] ?? 0);
  const stock = Math.max(0, Math.floor(Math.min(...quantities)));
  return { ruleId: rule.id, image: config.storefrontImage, price: config.bundlePrice, separatePrice, saving: roundMoney(separatePrice - config.bundlePrice), stock, componentStock: Object.fromEntries(bottles.map((p, i) => [p.slug, quantities[i]])), products: bottles };
}

export function bundleAsProduct(bundle: HairCareBundle): Product {
  return { id: String(Math.max(...bundle.products.map(p => Number(p.id) || 0)) + 0.5), name: HAIR_BUNDLE_NAME, slug: HAIR_BUNDLE_SLUG, categories: ['Hair & Scalp'], image: bundle.image, shortDescription: 'One 350ml shampoo and one 350ml conditioner.', variants: [{ dosage: '2 × 350ml', price: bundle.price }], availability: bundle.stock > 0 ? 'available' : 'out_of_stock' };
}

export function bundleCartItems(bundle: HairCareBundle): CartItem[] {
  return bundle.products.map(p => ({ productId: p.id, name: p.name, slug: p.slug, variant: '350ml', price: p.variants.find(v => v.dosage === '350ml')!.price, quantity: 1, image: p.image }));
}

export function bundlesAvailableForCart(bundle: HairCareBundle, items: ReadonlyArray<Pick<CartItem, 'slug' | 'variant' | 'quantity'>>): number {
  return Math.max(0, Math.min(...HAIR_BOTTLE_SLUGS.map(slug => bundle.componentStock[slug] - items.filter(i => i.slug === slug && i.variant === '350ml').reduce((n, i) => n + i.quantity, 0))));
}
