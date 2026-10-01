import { isDbConfigured, requireDb } from './client';

// Cost basis per product+dosage variant (task 66a6a137 + revision). The true cost
// "to achieve the bottle" = raw vial cost (unit_cost) + named components (box, label,
// anything the owner defines) + this vial's allocated share of a bulk order's shipping.

export interface CostComponent { label: string; amount: number; }

export interface ProductCostRow {
  product_slug: string;
  dosage: string;
  unit_cost: number;          // RAW vial cost
  components: CostComponent[]; // extra named costs (box, label, ...)
  shipping_per_unit: number;   // allocated share of bulk-order shipping
  supplier: string | null;
  note: string | null;
  updated_at: string;
}

function normComponents(v: unknown): CostComponent[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => ({ label: String((c as CostComponent)?.label ?? '').slice(0, 40), amount: Number((c as CostComponent)?.amount) || 0 }))
    .filter((c) => c.label || c.amount)
    .slice(0, 6);
}

export function totalUnitCost(row: Pick<ProductCostRow, 'unit_cost' | 'components' | 'shipping_per_unit'>): number {
  const comp = (row.components ?? []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  return Math.round(((Number(row.unit_cost) || 0) + comp + (Number(row.shipping_per_unit) || 0)) * 100) / 100;
}

function mapRow(r: Record<string, unknown>): ProductCostRow {
  return {
    product_slug: String(r.product_slug),
    dosage: String(r.dosage ?? ''),
    unit_cost: Number(r.unit_cost) || 0,
    components: normComponents(r.components),
    shipping_per_unit: Number(r.shipping_per_unit) || 0,
    supplier: (r.supplier as string) ?? null,
    note: (r.note as string) ?? null,
    updated_at: String(r.updated_at ?? ''),
  };
}

export async function listProductCosts(): Promise<ProductCostRow[]> {
  if (!isDbConfigured()) return [];
  const db = requireDb();
  const rows = await db`SELECT product_slug, dosage, unit_cost, components, shipping_per_unit, supplier, note, updated_at FROM product_costs`;
  return (rows as Record<string, unknown>[]).map(mapRow);
}

// Upsert the manually-editable parts of a product's cost (raw cost, named components,
// supplier). Shipping-per-unit is managed by the bulk-purchase allocator, not here.
export async function upsertProductCost(input: {
  productSlug: string;
  dosage: string;
  unitCost: number;
  components?: CostComponent[];
  supplier?: string | null;
  note?: string | null;
  shippingPerUnit?: number; // optional manual override of the allocated shipping
}): Promise<ProductCostRow | null> {
  if (!isDbConfigured()) return null;
  const db = requireDb();
  const cost = Number.isFinite(input.unitCost) && input.unitCost >= 0 ? Math.round(input.unitCost * 100) / 100 : 0;
  const components = JSON.stringify(normComponents(input.components));
  const supplier = input.supplier?.trim() || null;
  const note = input.note?.trim() || null;
  const ship = typeof input.shippingPerUnit === 'number' && input.shippingPerUnit >= 0 ? Math.round(input.shippingPerUnit * 100) / 100 : null;
  const [row] = ship === null
    ? await db`
        INSERT INTO product_costs (product_slug, dosage, unit_cost, components, supplier, note, updated_at)
        VALUES (${input.productSlug}, ${input.dosage ?? ''}, ${cost}, ${components}::jsonb, ${supplier}, ${note}, now())
        ON CONFLICT (product_slug, dosage)
        DO UPDATE SET unit_cost = EXCLUDED.unit_cost, components = EXCLUDED.components, supplier = EXCLUDED.supplier, note = EXCLUDED.note, updated_at = now()
        RETURNING product_slug, dosage, unit_cost, components, shipping_per_unit, supplier, note, updated_at`
    : await db`
        INSERT INTO product_costs (product_slug, dosage, unit_cost, components, shipping_per_unit, supplier, note, updated_at)
        VALUES (${input.productSlug}, ${input.dosage ?? ''}, ${cost}, ${components}::jsonb, ${ship}, ${supplier}, ${note}, now())
        ON CONFLICT (product_slug, dosage)
        DO UPDATE SET unit_cost = EXCLUDED.unit_cost, components = EXCLUDED.components, shipping_per_unit = EXCLUDED.shipping_per_unit, supplier = EXCLUDED.supplier, note = EXCLUDED.note, updated_at = now()
        RETURNING product_slug, dosage, unit_cost, components, shipping_per_unit, supplier, note, updated_at`;
  return row ? mapRow(row as Record<string, unknown>) : null;
}

export async function deleteSupplierPurchase(id: number): Promise<void> {
  if (!isDbConfigured()) return;
  const db = requireDb();
  await db`DELETE FROM supplier_purchases WHERE id = ${id}`;
}

// ─── Bulk purchases ───────────────────────────────────────────────────────────
export interface PurchaseLine { slug: string; dosage: string; qty: number; blockCost: number }
export interface SupplierPurchaseRow {
  id: number;
  supplier: string;
  purchase_date: string | null;
  shipping_cost: number;
  update_inventory: boolean;
  lines: PurchaseLine[];
  created_at: string;
}

export async function listSupplierPurchases(): Promise<SupplierPurchaseRow[]> {
  if (!isDbConfigured()) return [];
  const db = requireDb();
  const rows = await db`SELECT id, supplier, purchase_date, shipping_cost, update_inventory, lines, created_at FROM supplier_purchases ORDER BY COALESCE(purchase_date, created_at::date) DESC, id DESC`;
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    supplier: String(r.supplier ?? ''),
    purchase_date: r.purchase_date ? String(r.purchase_date) : null,
    shipping_cost: Number(r.shipping_cost) || 0,
    update_inventory: Boolean(r.update_inventory),
    lines: (Array.isArray(r.lines) ? r.lines : []) as PurchaseLine[],
    created_at: String(r.created_at ?? ''),
  }));
}

// Record a bulk order AND fold its costs into each product's cost basis:
//  - raw vial cost   = blockCost / qty
//  - shipping/unit   = (order shipping / total vials in the order), allocated evenly
// (Even per-vial split is the honest default; weight-based needs per-product weights
// we don't hold yet. Both raw + shipping are still editable on the Profitability page.)
export async function recordSupplierPurchase(input: {
  supplier: string;
  purchaseDate: string | null;
  shippingCost: number;
  adhocCost?: number; // extra / ad-hoc costs on this order (customs, handling, etc.)
  updateInventory: boolean;
  lines: PurchaseLine[];
}): Promise<{
  purchase: SupplierPurchaseRow;
  // Product slugs where a tracked variant went 0 -> positive in this purchase,
  // so the caller can fire back-in-stock alerts (same rule as the stock
  // editor route: an untracked variant was never "out of stock", so it never
  // notifies).
  restockedProductSlugs: string[];
} | null> {
  if (!isDbConfigured()) return null;
  const db = requireDb();
  const lines = (input.lines ?? [])
    .map((l) => ({ slug: String(l.slug || ''), dosage: String(l.dosage ?? ''), qty: Math.max(0, Math.floor(Number(l.qty) || 0)), blockCost: Math.max(0, Number(l.blockCost) || 0) }))
    .filter((l) => l.slug && l.qty > 0);
  const shippingCost = Math.max(0, Number(input.shippingCost) || 0);
  const adhocCost = Math.max(0, Number(input.adhocCost) || 0);
  // Shipping AND any ad-hoc/extra costs are both allocated evenly across the vials
  // and folded into each product's cost basis (Kieran, task c5842838). Stored
  // together in shipping_cost so the per-vial allocation and the record match.
  const allocatable = Math.round((shippingCost + adhocCost) * 100) / 100;
  const totalVials = lines.reduce((s, l) => s + l.qty, 0);
  const shipPerVial = totalVials > 0 ? Math.round((allocatable / totalVials) * 100) / 100 : 0;

  const [row] = await db`
    INSERT INTO supplier_purchases (supplier, purchase_date, shipping_cost, update_inventory, lines, created_at)
    VALUES (${input.supplier?.trim() || ''}, ${input.purchaseDate || null}, ${allocatable}, ${!!input.updateInventory}, ${JSON.stringify(lines)}::jsonb, now())
    RETURNING id, supplier, purchase_date, shipping_cost, update_inventory, lines, created_at
  `;
  // Fold each line into the product cost basis (latest purchase wins for that product).
  for (const l of lines) {
    const rawCost = Math.round((l.blockCost / l.qty) * 100) / 100;
    const supplier = input.supplier?.trim() || null;
    await db`
      INSERT INTO product_costs (product_slug, dosage, unit_cost, shipping_per_unit, supplier, updated_at)
      VALUES (${l.slug}, ${l.dosage}, ${rawCost}, ${shipPerVial}, ${supplier}, now())
      ON CONFLICT (product_slug, dosage)
      DO UPDATE SET unit_cost = ${rawCost}, shipping_per_unit = ${shipPerVial}, supplier = ${supplier}, updated_at = now()
    `;
  }
  // The whole point of the tick box (task c9aa1323): the vials that arrived
  // go INTO stock. Until now the flag was stored and then nothing happened —
  // Kieran recorded 40 vials, saw "Saved", and the shop still said 0.
  // Existing tracked variant: quantity += qty. Untracked variant: adding
  // stock explicitly starts tracking it at qty.
  const restockedProductSlugs: string[] = [];
  if (input.updateInventory) {
    for (const l of lines) {
      const prevRows = await db`
        SELECT quantity FROM product_variant_stock WHERE slug = ${l.slug} AND dosage = ${l.dosage}
      `;
      const prevQty = prevRows.length ? Number((prevRows[0] as { quantity: number }).quantity) : null;
      await db`
        INSERT INTO product_variant_stock (slug, dosage, quantity, updated_at)
        VALUES (${l.slug}, ${l.dosage}, ${l.qty}, now())
        ON CONFLICT (slug, dosage)
        DO UPDATE SET quantity = product_variant_stock.quantity + ${l.qty}, updated_at = now()
      `;
      if (prevQty === 0 && l.qty > 0 && !restockedProductSlugs.includes(l.slug)) {
        restockedProductSlugs.push(l.slug);
      }
    }
  }

  const r = row as Record<string, unknown>;
  return {
    purchase: {
      id: Number(r.id), supplier: String(r.supplier ?? ''), purchase_date: r.purchase_date ? String(r.purchase_date) : null,
      shipping_cost: Number(r.shipping_cost) || 0, update_inventory: Boolean(r.update_inventory),
      lines: (Array.isArray(r.lines) ? r.lines : []) as PurchaseLine[], created_at: String(r.created_at ?? ''),
    },
    restockedProductSlugs,
  };
}
