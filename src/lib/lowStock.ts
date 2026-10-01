import { getProductVariantStockMap, isDbConfigured, listCustomProducts } from '@/lib/db';
import {
  clearLowStockNotifications,
  listActiveLowStockNotifications,
  listRetiredVariantKeys,
  recordLowStockNotifications,
} from '@/lib/db/lowStock';
import { sendLowStockAlertEmail } from '@/lib/lowStockAlertEmail';
import { mergeProducts, PRODUCTS, type Product } from '@/data/products';

// ─── Low-stock warning (task efc5cb9a) ──────────────────────────────────────
// Kieran's rule: below 6 units left on any product means highlight it on the
// admin dashboard and email sales@windsorglow.com so more gets ordered.
// "Below 6" — a variant with 5 or fewer is low. Tracked per (slug, dosage)
// because that is how stock itself is tracked; a variant nobody has ever set
// a number for is untracked/unlimited and never counts as low.
export const LOW_STOCK_THRESHOLD = 6;

export interface LowStockItem {
  slug: string;
  name: string;
  dosage: string;
  quantity: number;
}

// The live low list — computed fresh from product_variant_stock every time,
// never from the notification bookkeeping, so the dashboard can never show a
// stale picture because an email failed or was already sent.
export async function listLowStockVariants(): Promise<LowStockItem[]> {
  const stockMap = await getProductVariantStockMap();
  const overrides = await listCustomProducts().catch(() => ({} as Record<string, Product>));
  const nameBySlug = new Map(mergeProducts(PRODUCTS, overrides).map((p) => [p.slug, p.name]));
  // Retired variants (task 3378ea2d) are deliberately not stocked any more —
  // leaving them out here removes them from the panel AND the emails at once.
  const retired = await listRetiredVariantKeys();

  const items: LowStockItem[] = [];
  for (const [slug, dosages] of Object.entries(stockMap)) {
    for (const [dosage, quantity] of Object.entries(dosages)) {
      if (retired.has(`${slug}::${dosage}`)) continue;
      if (quantity < LOW_STOCK_THRESHOLD) {
        // A stray row for a since-deleted product still shows, under its
        // slug — a low number is worth seeing wherever it lives.
        items.push({ slug, name: nameBySlug.get(slug) ?? slug, dosage, quantity });
      }
    }
  }
  items.sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name) || a.dosage.localeCompare(b.dosage));
  return items;
}

// Runs after every place stock changes: checkout, invoice payment, and the
// admin stock editor. One email per low-stock episode — a variant that has
// already been emailed about stays quiet until it is restocked to the
// threshold or above (which deletes its bookkeeping row and re-arms it).
// Never throws: an alert problem must never break an order or a stock edit.
export async function checkLowStockAndAlert(): Promise<void> {
  try {
    if (!isDbConfigured()) return;

    const low = await listLowStockVariants();
    const active = await listActiveLowStockNotifications();
    const lowKeys = new Set(low.map((i) => `${i.slug}::${i.dosage}`));

    // Restocked variants re-arm for their next drop.
    const restocked = active.filter((n) => !lowKeys.has(`${n.slug}::${n.dosage}`));
    await clearLowStockNotifications(restocked.map((n) => ({ slug: n.slug, dosage: n.dosage })));

    const activeKeys = new Set(active.map((n) => `${n.slug}::${n.dosage}`));
    const newlyLow = low.filter((i) => !activeKeys.has(`${i.slug}::${i.dosage}`));
    if (!newlyLow.length) return;

    // Recorded only after a successful send, so a failed email is retried on
    // the next stock movement instead of silently counting as delivered.
    const sent = await sendLowStockAlertEmail(newlyLow, LOW_STOCK_THRESHOLD);
    if (sent) await recordLowStockNotifications(newlyLow);
  } catch (err) {
    console.error('[lowStock] check failed:', err);
  }
}
