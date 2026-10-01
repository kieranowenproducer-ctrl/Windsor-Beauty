import { PRODUCTS, mergeProducts, type Product } from '@/data/products';
import {
  getHiddenProductSlugs,
  getProductVariantStockMap,
  listCustomProducts,
  setProductHidden,
  setProductVariantStock,
  upsertCustomProduct,
} from '@/lib/db';
import { listRetiredVariantKeys, setVariantRetired } from '@/lib/db/lowStock';
import { checkLowStockAndAlert } from '@/lib/lowStock';

// ─── Retiring a product from the shop (tasks 3378ea2d, ecbfbf57) ───────────
// Kieran's definition, in his own words: retire means "I am not stocking
// this any more — but I still have to sell what is left." So retiring:
//   1. marks it retired at once — off the low-stock warning and its emails,
//      no reorder prompts ever again;
//   2. LEAVES it on the shop, buyable, while any stock remains (an early test
//      lost the sale of the last two in stock when v1 removed it immediately);
//   3. the moment its stock reaches zero — the last one sells, or the number
//      is set to zero — it comes off the shop automatically: the dosage is
//      disabled and the whole product is hidden once no sellable dosage
//      remains (hidden is the shop's real "does not exist", direct links
//      included, never a "Sold out" card that promises a return).
// Retiring something already at zero comes off the shop immediately.
// Un-retiring is unchanged: back on the shop with real stock, or shown as
// "Coming soon" (visible, not buyable) until stock arrives.

export interface RetiredVariantInfo {
  slug: string;
  name: string;
  dosage: string;
  /** True when the whole product is off the shop, not just this dosage. */
  productHidden: boolean;
  /** Units still to sell — above zero means it is still on the shop, selling its remainder. */
  quantity: number;
}

async function findMergedProduct(slug: string): Promise<Product | null> {
  const overrides = await listCustomProducts().catch(() => ({} as Record<string, Product>));
  return mergeProducts(PRODUCTS, overrides).find((p) => p.slug === slug) ?? null;
}

export async function listRetiredVariants(): Promise<RetiredVariantInfo[]> {
  const keys = await listRetiredVariantKeys();
  if (!keys.size) return [];
  const overrides = await listCustomProducts().catch(() => ({} as Record<string, Product>));
  const nameBySlug = new Map(mergeProducts(PRODUCTS, overrides).map((p) => [p.slug, p.name]));
  const hidden = new Set(await getHiddenProductSlugs().catch(() => []));
  const stockMap = await getProductVariantStockMap().catch(() => ({} as Record<string, Record<string, number>>));
  return Array.from(keys)
    .map((key) => {
      const at = key.indexOf('::');
      const slug = key.slice(0, at);
      const dosage = key.slice(at + 2);
      return {
        slug,
        name: nameBySlug.get(slug) ?? slug,
        dosage,
        productHidden: hidden.has(slug),
        quantity: stockMap[slug]?.[dosage] ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.dosage.localeCompare(b.dosage));
}

export async function retireVariant(slug: string, dosage: string): Promise<void> {
  await setVariantRetired(slug, dosage, true);

  // Stock left = keep selling it. Only the marker changes now; the shop is
  // untouched, and completeRetirementsAtZero() takes it off the shop the
  // moment the last unit goes. Removal happens ONLY on a read, genuine zero:
  // a missing stock reading must never yank a sellable product off the shop
  // (seen once in testing — an empty map read made a fully stocked product
  // look untracked and it vanished mid-sale). Erring the other way just
  // means the product keeps selling until a trustworthy zero is seen.
  const stockMap = await getProductVariantStockMap();
  const quantity = stockMap[slug]?.[dosage];
  if (typeof quantity !== 'number' || quantity > 0) {
    await checkLowStockAndAlert();
    return;
  }

  // Already at zero: off the shop immediately.
  await takeVariantOffTheShop(slug, dosage);
  await checkLowStockAndAlert();
}

// The shop-removal half of retirement: disable the dosage, and hide the
// whole product once no sellable dosage remains. activeVariants() falls back
// to showing EVERY dosage when all are disabled, so a fully retired product
// must be hidden outright — that is the only state the shop treats as
// "does not exist".
async function takeVariantOffTheShop(slug: string, dosage: string): Promise<void> {
  const product = await findMergedProduct(slug);
  if (!product) return;
  const variants = product.variants.map((v) => (v.dosage === dosage ? { ...v, enabled: false } : v));
  await upsertCustomProduct({ ...product, variants });
  if (!variants.some((v) => v.enabled !== false)) {
    await setProductHidden(slug, true);
  }
}

// The finishing step (task ecbfbf57): any retired dosage whose stock has
// reached zero comes off the shop. Runs after every stock movement —
// checkout, invoice payment, admin edits — so the LAST SALE ITSELF is what
// removes the product. Cheap when there is nothing to do, idempotent when
// there is.
export async function completeRetirementsAtZero(): Promise<void> {
  const keys = await listRetiredVariantKeys();
  if (!keys.size) return;
  const stockMap = await getProductVariantStockMap();
  for (const key of Array.from(keys)) {
    const at = key.indexOf('::');
    const slug = key.slice(0, at);
    const dosage = key.slice(at + 2);
    const quantity = stockMap[slug]?.[dosage];
    if (typeof quantity !== 'number' || quantity > 0) continue;
    const product = await findMergedProduct(slug);
    const variant = product?.variants.find((v) => v.dosage === dosage);
    if (!variant || variant.enabled === false) continue; // already off
    await takeVariantOffTheShop(slug, dosage);
  }
}

// What every stock-changing path calls (checkout, invoice payment, the admin
// stock editor): finish any retirement that just hit zero, then run the
// low-stock check. Never throws — neither half may break an order.
export async function afterStockMovement(): Promise<void> {
  await completeRetirementsAtZero().catch((err) => console.error('[retireProducts] completing retirements failed:', err));
  await checkLowStockAndAlert();
}

export type UnretireMode = 'restore_with_stock' | 'coming_soon';

export async function unretireVariant(
  slug: string,
  dosage: string,
  mode: UnretireMode,
  quantity?: number
): Promise<void> {
  const product = await findMergedProduct(slug);

  // "Coming soon" is a whole-product switch (there is no per-dosage version),
  // so on a product whose other dosages are still selling it would block
  // every one of them — found the hard way in testing, when marking a
  // retired 30ml "coming soon" made the live 50ml unbuyable.
  if (mode === 'coming_soon' && product) {
    const othersActive = product.variants.some((v) => v.dosage !== dosage && v.enabled !== false);
    if (othersActive) {
      throw new Error(
        'Other dosages of this product are still on the shop, so it cannot be marked Coming soon — use Put back with stock instead.'
      );
    }
  }

  await setVariantRetired(slug, dosage, false);
  if (product) {
    const variants = product.variants.map((v) => (v.dosage === dosage ? { ...v, enabled: true } : v));
    // "Back with stock" must actually sell, so the product-level block is
    // lifted; "Coming soon" is that block, worn deliberately.
    const availability = mode === 'coming_soon' ? ('coming_soon' as const) : ('available' as const);
    await upsertCustomProduct({ ...product, variants, availability });
  }
  await setProductHidden(slug, false);

  if (mode === 'restore_with_stock' && typeof quantity === 'number') {
    await setProductVariantStock(slug, dosage, Math.max(0, Math.round(quantity)));
  }

  await checkLowStockAndAlert();
}

// A positive stock save on a retired dosage that is already OFF the shop
// means it is stocked again — revive it fully, or the new stock would sit
// behind a hidden product forever. A retired dosage still selling its
// remainder is left alone: an ordinary stock correction must not quietly
// cancel the retirement — "Put back with stock" is the explicit way back
// (task ecbfbf57). The caller has already written the stock number itself.
export async function reviveRetiredOnRestock(slug: string, dosage: string): Promise<void> {
  const keys = await listRetiredVariantKeys();
  if (!keys.has(`${slug}::${dosage}`)) return;
  const product = await findMergedProduct(slug);
  const variant = product?.variants.find((v) => v.dosage === dosage);
  if (variant && variant.enabled !== false) return;
  await unretireVariant(slug, dosage, 'restore_with_stock');
}
