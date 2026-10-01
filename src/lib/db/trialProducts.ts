import { isDbConfigured, requireDb } from './client';

// Trial products (task 96b2ffe7). A fully SEPARATE, admin-only inventory of
// products Kieran is trialing. Nothing here is ever read by the public shop:
// it lives in its own table, has its own API, and is only rendered on the
// admin Trial page. It mirrors the shape of a real product (name, category,
// dosages with a sale price + stock) plus the same cost basis the Profitability
// page uses (raw cost + named components like box/label + shipping), so the
// Profitability (Trial) view can compute margin exactly the same way.

export interface TrialCostComponent { label: string; amount: number; }

export interface TrialVariant {
  dosage: string;
  price: number;        // sale price
  stock: number;        // units held
  rawCost: number;      // raw unit cost (the item itself)
  components: TrialCostComponent[]; // extra named costs (box, label, anything)
  shipping: number;     // shipping cost per unit
}

export interface TrialProduct {
  id: number;
  /** Permanent decimal code. Stored as bigint so it never wraps at the old 899-ID limit. */
  productCode: string;
  name: string;
  category: string;
  variants: TrialVariant[];
  updated_at: string;
}

// The table and code migration run lazily. Existing rows keep exactly the
// Product numbers Royal Mail already received from trialRoyalMailRef(id).
// New rows take an increasing database sequence number, even after deletion.
let ensured = false;
async function ensureTable(): Promise<void> {
  if (ensured) return;
  const db = requireDb();
  await db`CREATE TABLE IF NOT EXISTS trial_products (
    id serial PRIMARY KEY,
    product_code bigint,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await db`ALTER TABLE trial_products ADD COLUMN IF NOT EXISTS product_code bigint`;
  await db`UPDATE trial_products
    SET product_code = ((id::bigint * 137) % 899) + 10
    WHERE product_code IS NULL`;
  // If old IDs have ever exceeded the legacy 899-ID cycle, a clash is a real
  // historical problem. The unique index makes it visible rather than silently
  // changing a number already used on a consignment.
  await db`CREATE UNIQUE INDEX IF NOT EXISTS trial_products_product_code_unique ON trial_products (product_code)`;
  await db`CREATE SEQUENCE IF NOT EXISTS trial_product_code_seq AS bigint START WITH 909`;
  // Never lower a sequence after deletion or a repeated migration. Raise it
  // above the actual highest old code if that exceeds its current position.
  // On a fresh database with old codes at or below 908, the first nextval is
  // 909. If a row already used 909, setval makes the next code 910.
  await db`SELECT setval('trial_product_code_seq', (SELECT MAX(product_code) FROM trial_products), true)
    WHERE (SELECT COALESCE(MAX(product_code), 0) FROM trial_products)
      >= (SELECT last_value FROM trial_product_code_seq)`;
  await db`ALTER TABLE trial_products ALTER COLUMN product_code SET DEFAULT nextval('trial_product_code_seq')`;
  await db`ALTER TABLE trial_products ALTER COLUMN product_code SET NOT NULL`;
  ensured = true;
}

function normComponents(v: unknown): TrialCostComponent[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => ({ label: String((c as TrialCostComponent)?.label ?? '').slice(0, 40), amount: Number((c as TrialCostComponent)?.amount) || 0 }))
    .filter((c) => c.label || c.amount)
    .slice(0, 6);
}

function normVariants(v: unknown): TrialVariant[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      const o = x as Partial<TrialVariant>;
      return {
        dosage: String(o?.dosage ?? '').slice(0, 40),
        price: Math.max(0, Number(o?.price) || 0),
        stock: Math.max(0, Math.floor(Number(o?.stock) || 0)),
        rawCost: Math.max(0, Number(o?.rawCost) || 0),
        components: normComponents(o?.components),
        shipping: Math.max(0, Number(o?.shipping) || 0),
      };
    })
    .slice(0, 50);
}

export function trialTotalUnitCost(v: Pick<TrialVariant, 'rawCost' | 'components' | 'shipping'>): number {
  const comp = (v.components ?? []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  return Math.round(((Number(v.rawCost) || 0) + comp + (Number(v.shipping) || 0)) * 100) / 100;
}

function mapRow(r: Record<string, unknown>): TrialProduct {
  const d = (r.data ?? {}) as { name?: unknown; category?: unknown; variants?: unknown };
  const productCode = String(r.product_code ?? '');
  if (!/^[1-9]\d*$/.test(productCode)) throw new Error(`Trial product ${String(r.id)} has no valid Product code`);
  return {
    id: Number(r.id),
    productCode,
    name: String(d.name ?? ''),
    category: String(d.category ?? 'Uncategorised'),
    variants: normVariants(d.variants),
    updated_at: String(r.updated_at ?? ''),
  };
}

export async function listTrialProducts(): Promise<TrialProduct[]> {
  if (!isDbConfigured()) return [];
  await ensureTable();
  const db = requireDb();
  const rows = await db`SELECT id, product_code, data, updated_at FROM trial_products ORDER BY id`;
  return (rows as Record<string, unknown>[]).map(mapRow);
}

export async function upsertTrialProduct(input: {
  id?: number;
  name: string;
  category: string;
  variants: TrialVariant[];
}): Promise<TrialProduct | null> {
  if (!isDbConfigured()) return null;
  await ensureTable();
  const db = requireDb();
  const data = JSON.stringify({
    name: String(input.name ?? '').slice(0, 120),
    category: String(input.category ?? 'Uncategorised').slice(0, 60) || 'Uncategorised',
    variants: normVariants(input.variants),
  });
  if (input.id) {
    const [row] = await db`UPDATE trial_products SET data = ${data}::jsonb, updated_at = now() WHERE id = ${input.id} RETURNING id, product_code, data, updated_at`;
    return row ? mapRow(row as Record<string, unknown>) : null;
  }
  const [row] = await db`INSERT INTO trial_products (data) VALUES (${data}::jsonb) RETURNING id, product_code, data, updated_at`;
  return row ? mapRow(row as Record<string, unknown>) : null;
}

/** Resolve the exact stored code for a Trial id without exposing its real name. */
export async function getTrialProductCode(id: number): Promise<string | null> {
  if (!isDbConfigured() || !Number.isInteger(id) || id <= 0) return null;
  await ensureTable();
  const db = requireDb();
  const [row] = await db`SELECT product_code FROM trial_products WHERE id = ${id}`;
  if (!row) return null;
  const code = String((row as Record<string, unknown>).product_code ?? '');
  if (!/^[1-9]\d*$/.test(code)) throw new Error(`Trial product ${id} has no valid Product code`);
  return code;
}

export async function deleteTrialProduct(id: number): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureTable().catch(() => {});
  const db = requireDb();
  await db`DELETE FROM trial_products WHERE id = ${id}`;
}
