import type { Product } from '@/data/productModel';
import { requireDb } from './client';
import { withoutProductAddresses } from '@/lib/productAddress';

export async function productAddressRegistryReady(): Promise<boolean> {
  const rows = await requireDb()`SELECT to_regclass('public.beauty_product_web_addresses') IS NOT NULL AS ready`;
  return rows[0]?.ready === true;
}

export async function withProductAddresses(products: Record<string, Product>): Promise<Record<string, Product>> {
  // Reading an older schema never creates tables or changes product data.
  if (!await productAddressRegistryReady()) return products;
  const rows = await requireDb()`SELECT product_slug,address,is_current FROM public.beauty_product_web_addresses
    WHERE product_slug = ANY(${Object.keys(products)}::text[]) ORDER BY address`;
  const result: Record<string, Product> = {};
  for (const [slug, product] of Object.entries(products)) result[slug] = withoutProductAddresses(product);
  for (const row of rows as {product_slug:string;address:string;is_current:boolean}[]) {
    const product = result[row.product_slug];
    if (!product) continue;
    if (row.is_current) product.webAddress = row.address;
    else if (row.address !== product.slug) (product.previousWebAddresses ??= []).push(row.address);
  }
  return result;
}

export async function changeProductAddress(slug: string, address: string, expectedAddress: string) {
  const rows = await requireDb()`SELECT public.wb_change_product_address(${slug},${address},${expectedAddress}) AS result`;
  return rows[0].result as {slug:string;from:string;to:string};
}

/** Permanent ownership also joins old analytics paths after a product was removed. */
export async function productAddressOwners(): Promise<Map<string,string>> {
  if (!await productAddressRegistryReady()) return new Map();
  const rows=await requireDb()`SELECT address,product_slug FROM public.beauty_product_web_addresses WHERE product_slug<>'@route'`;
  return new Map((rows as {address:string;product_slug:string}[]).map(row=>[row.address,row.product_slug]));
}
