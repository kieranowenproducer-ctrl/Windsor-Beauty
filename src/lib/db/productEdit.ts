import type { Product } from '@/data/products';
import { requireDb } from './client';
import { withoutProductAddresses } from '@/lib/productAddress';

// The editor's conditional update preserves a newer save from another tab.
// It never creates a missing product or changes its internal stock/order key.
export async function updateProductIfUnchanged(product: Product, expected: Product): Promise<boolean> {
  const db = requireDb();
  const rows = await db`
    UPDATE custom_products SET data = ${JSON.stringify(withoutProductAddresses(product))}::jsonb, updated_at = now()
    WHERE slug = ${product.slug} AND data - 'webAddress' - 'previousWebAddresses' = ${JSON.stringify(withoutProductAddresses(expected))}::jsonb
    RETURNING slug
  `;
  return rows.length === 1;
}

// A duplicate Create request must never replace an existing listing. Once the
// address migration is installed, its shared lock also assigns a fresh numeric ID.
export async function createProductIfAbsent(product: Product): Promise<Product> {
  const rows=await requireDb()`INSERT INTO custom_products(slug,data,updated_at)
    VALUES(${product.slug},${JSON.stringify(withoutProductAddresses(product))}::jsonb,now()) RETURNING data`;
  return rows[0].data as Product;
}
