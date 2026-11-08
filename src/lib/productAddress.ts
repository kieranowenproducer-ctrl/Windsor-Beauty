import type { Product } from '@/data/productModel';
import { PRETTY_SLUG, INTERNAL_SLUG } from '@/lib/slugAliases';

type Addressable = Pick<Product, 'slug'> & Partial<Pick<Product, 'webAddress' | 'previousWebAddresses'>>;
export const RESERVED_PRODUCT_ADDRESSES = ['ghk-cu-shampoo-conditioner-bundle', ...Object.keys(PRETTY_SLUG)];
export const validProductAddress = (value: unknown): value is string => typeof value === 'string'
  && value.length <= 90 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export function addressFromName(name: string): string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90).replace(/-+$/, '') || 'product';
}
export const productAddress = (product: Addressable): string => product.webAddress || PRETTY_SLUG[product.slug] || product.slug;
export const productHref = (product: Addressable): string => `/shop/${productAddress(product)}`;

// Addresses are server-owned. Never resolve an ambiguous address to an arbitrary product.
export function resolveProductAddress<T extends Addressable>(catalogue: T[], address: string): {product:T;address:string} | null {
  const candidates = catalogue.filter(p => productAddress(p) === address || p.slug === (INTERNAL_SLUG[address] ?? address)
    || p.previousWebAddresses?.includes(address));
  if (candidates.length !== 1) return null;
  return { product: candidates[0], address: productAddress(candidates[0]) };
}
export function addressIndex(products: Addressable[]): Map<string, string> {
  const claims = new Map<string, Set<string>>();
  for (const p of products) {
    for (const a of [p.slug, productAddress(p), ...(p.previousWebAddresses ?? []), PRETTY_SLUG[p.slug]].filter(Boolean)) {
      const owners = claims.get(a) ?? new Set<string>(); owners.add(p.slug); claims.set(a, owners);
    }
  }
  return new Map(Array.from(claims).filter(([, owners]) => owners.size === 1).map(([a, owners]) => [a, Array.from(owners)[0]]));
}

// The registry overlays these fields when reading. They are never editor-owned JSON.
export function withoutProductAddresses<T extends object>(product:T): Omit<T, 'webAddress' | 'previousWebAddresses'> {
  const copy = { ...product } as T & { webAddress?: unknown; previousWebAddresses?: unknown };
  delete copy.webAddress; delete copy.previousWebAddresses;
  return copy;
}
