import type { Product } from '@/data/products';
import { requireDb } from './client';

// The editor's conditional update preserves a newer save from another tab.
// It never creates a missing product or changes its internal stock/order key.
export async function updateProductIfUnchanged(product: Product, expected: Product): Promise<boolean> {
  const db = requireDb();
  const rows = await db`
    UPDATE custom_products SET data = ${JSON.stringify(product)}::jsonb, updated_at = now()
    WHERE slug = ${product.slug} AND data = ${JSON.stringify(expected)}::jsonb
    RETURNING slug
  `;
  return rows.length === 1;
}
