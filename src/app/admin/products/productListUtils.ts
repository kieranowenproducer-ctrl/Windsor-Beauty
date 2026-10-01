import { effectiveAvailability, type Product, type AvailabilityStatus } from '@/data/products';

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Exports the exact handles (slugs) the live shop uses today, so an admin
// building an upsell CSV elsewhere can copy-paste real values instead of
// guessing — the #1 cause of an upsell rule silently never firing. Hidden
// products are left out since they can never be recommended anyway
// (computeUpsellRecommendations excludes them at runtime). There's no real
// SKU field anywhere in this catalogue (Product has no `sku` property) — the
// product's internal `id` is used as the closest stable per-product
// identifier instead of inventing one, and the column is still named `sku`
// to match what an admin coming from a typical e-commerce CSV would expect.
export function exportProductHandlesCsv(products: Product[], hiddenSlugs: Set<string>, stock: Record<string, number>) {
  const header = 'product_name,product_handle,sku,status';
  const lines = products
    .filter(p => !hiddenSlugs.has(p.slug))
    .map(p => {
      const status = effectiveAvailability(p, stock[p.slug]);
      return [csvField(p.name), csvField(p.slug), csvField(p.id), status].join(',');
    });
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `product-handles-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  available: 'Available',
  out_of_stock: 'Out of Stock',
  coming_soon: 'Coming Soon',
};

// "Hidden" is a fourth choice on the admin availability dropdown, and ONLY
// there. It is deliberately not a fourth AvailabilityStatus: that type is read
// by checkout, the product page and the shop cards, so widening it would put a
// state the storefront has never handled in front of customers. Hiding is a
// separate flag (setProductHidden / getHiddenProductSlugs) that takes the
// product off every customer-facing page, and it leaves the availability
// underneath alone — so unhiding puts the product back exactly as it was.
export const HIDDEN_CHOICE = 'hidden';
export type ProductVisibilityChoice = AvailabilityStatus | typeof HIDDEN_CHOICE;

export const VISIBILITY_CHOICES: { value: ProductVisibilityChoice; label: string }[] = [
  { value: 'available', label: AVAILABILITY_LABELS.available },
  { value: 'out_of_stock', label: AVAILABILITY_LABELS.out_of_stock },
  { value: 'coming_soon', label: AVAILABILITY_LABELS.coming_soon },
  { value: HIDDEN_CHOICE, label: 'Hidden (off the site)' },
];

/** What the dropdown should be showing for this product right now. */
export function visibilityChoiceFor(
  availability: AvailabilityStatus | undefined,
  isHidden: boolean
): ProductVisibilityChoice {
  return isHidden ? HIDDEN_CHOICE : availability ?? 'available';
}

export type ProductSortOption = 'az' | 'za' | 'price-asc' | 'price-desc' | 'newest' | 'oldest' | 'stock-asc' | 'stock-desc';

export const PRODUCT_SORT_OPTIONS: { value: ProductSortOption; label: string }[] = [
  { value: 'az', label: 'Name: A to Z' },
  { value: 'za', label: 'Name: Z to A' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'stock-asc', label: 'Stock: Low to High' },
  { value: 'stock-desc', label: 'Stock: High to Low' },
];

function startingPrice(p: Product) {
  return Math.min(...p.variants.map(v => v.price));
}

// Mirrors the sort conventions on /shop — "Newest"/"Oldest" use the numeric
// id, which the catalogue API assigns sequentially for exactly this purpose.
export function sortProducts(products: Product[], sort: ProductSortOption, stock: Record<string, number>) {
  const list = [...products];
  switch (sort) {
    case 'az':
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'za':
      return list.sort((a, b) => b.name.localeCompare(a.name));
    case 'price-asc':
      return list.sort((a, b) => startingPrice(a) - startingPrice(b));
    case 'price-desc':
      return list.sort((a, b) => startingPrice(b) - startingPrice(a));
    case 'newest':
      return list.sort((a, b) => Number(b.id) - Number(a.id));
    case 'oldest':
      return list.sort((a, b) => Number(a.id) - Number(b.id));
    case 'stock-asc':
      return list.sort((a, b) => (stock[a.slug] ?? 0) - (stock[b.slug] ?? 0));
    case 'stock-desc':
      return list.sort((a, b) => (stock[b.slug] ?? 0) - (stock[a.slug] ?? 0));
    default:
      return list;
  }
}
