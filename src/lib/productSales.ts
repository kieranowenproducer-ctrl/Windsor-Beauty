/**
 * What actually sells, and to whom.
 *
 * WHY THIS EXISTS (task aa684446, 9 August 2026). The Dashboard could say how many orders and how
 * much money, but never which products. `getProductSoldCounts()` in db.ts counts units per slug for
 * the shop's "Best Selling" sort, and that is all it does: no money, no customers, no way to ask
 * "and what do the PAG members buy?".
 *
 * WHY IT IS ONE FILE. Three screens need the same answer and would otherwise each invent their own:
 * the Dashboard report, the tick boxes that filter it, and the buyer list behind the marketing
 * button. Three copies of "which orders count" is three copies waiting to disagree about revenue.
 *
 * THE ONE RULE WORTH KNOWING: an order counts when it was actually paid for. A basket somebody
 * abandoned at the payment screen is not a sale, and counting it would overstate both the product
 * and the money.
 */

import { requireDb } from './db/client';

/**
 * The statuses that mean money changed hands. Identical to the list
 * `getProductSoldCounts()` uses (src/lib/db.ts), on purpose: the Dashboard report and the shop's
 * "Best Selling" order must never disagree about what a sale is.
 */
const PAID_STATUSES = ['paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered'];

/** How the customers are grouped. Both are real answers held against the customer. */
export type GroupKind = 'referral' | 'campaign';

/** Where a group has no answer recorded, it still needs a name a person can tick. */
const NO_REFERRAL = 'Not recorded';
const NO_CAMPAIGN = 'Direct (no campaign)';
/** An order placed by somebody with no account at all. */
const NO_ACCOUNT = 'No account';

/**
 * A safety limit, not a page size. Every paid order line is read so the totals are exact; the cap
 * exists so a runaway query can never take the Dashboard down. At 33 orders it is nowhere near.
 */
const MAX_ITEM_ROWS = 20000;

export interface ProductSalesRow {
  /** Stable key for the row: the catalogue slug, or the product name when it was sold off-catalogue. */
  key: string;
  name: string;
  slug: string | null;
  units: number;
  orders: number;
  /** Distinct people, so ten vials on one order is one customer, not ten. */
  customers: number;
  revenue: number;
  firstBought: string | null;
  lastBought: string | null;
}

export interface CustomerGroup {
  key: string;
  label: string;
  /** Paid orders from this group, which is what the report is actually built from. */
  orders: number;
  customers: number;
}

export interface ProductSalesReport {
  products: ProductSalesRow[];
  /** Every group that has at least one paid order, so the tick boxes are built from real answers. */
  groups: CustomerGroup[];
  totals: { units: number; orders: number; customers: number; revenue: number };
  /** True when the figures were cut short by the safety limit, so the screen can say so. */
  truncated: boolean;
}

export interface BuyerRow {
  email: string;
  name: string;
  units: number;
  orders: number;
  spend: number;
  lastBought: string | null;
  group: string;
}

/** One row per item on one paid order, with the buyer's group already resolved. */
interface ItemRow {
  order_id: number;
  order_number: string;
  created_at: string;
  email: string;
  customer_name: string | null;
  customer_id: number | null;
  referred_by: string | null;
  qr_campaign_name: string | null;
  item_name: string | null;
  item_slug: string | null;
  quantity: number;
  price: number;
}

/**
 * Tidies a typed answer into the thing it is grouped under.
 *
 * Deliberately gentle. "PAG" and "Pag" become one group because the difference is a slipped shift
 * key. "PAG GYM" and "John - PAG" stay separate, because deciding those are the same answer is a
 * judgement about the business, not about text, and quietly merging them would invent a figure
 * nobody could check. The tick boxes are the honest answer to that: tick all four and they add up.
 */
function normaliseGroup(raw: string | null | undefined, fallback: string): { key: string; label: string } {
  const text = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return { key: fallback.toLowerCase(), label: fallback };
  return { key: text.toLowerCase(), label: text };
}

function groupFor(row: ItemRow, kind: GroupKind): { key: string; label: string } {
  // An order from somebody with no account has no answer to group by, and calling that "direct"
  // would put guests in with members who told us they came on their own.
  if (row.customer_id === null) return { key: NO_ACCOUNT.toLowerCase(), label: NO_ACCOUNT };
  return kind === 'campaign'
    ? normaliseGroup(row.qr_campaign_name, NO_CAMPAIGN)
    : normaliseGroup(row.referred_by, NO_REFERRAL);
}

/** The product's identity for counting. Off-catalogue sales have no slug, so the name carries it. */
function productKey(row: ItemRow): { key: string; name: string; slug: string | null } {
  const name = (row.item_name ?? '').trim() || 'Unnamed product';
  const slug = (row.item_slug ?? '').trim() || null;
  return { key: slug ?? `name:${name.toLowerCase()}`, name, slug };
}

/**
 * Reads every paid order line with its buyer.
 *
 * The customer is found by id, and only failing that by email address, so an order placed before
 * somebody registered still lands on their record. LATERAL with LIMIT 1 rather than a plain join:
 * a plain `id = ? OR email = ?` can match two different customer rows for one order and would
 * silently count that order twice.
 */
async function readItemRows(from?: string, to?: string): Promise<ItemRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT
      o.id            AS order_id,
      o.order_number  AS order_number,
      o.created_at    AS created_at,
      o.email         AS email,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), o.customer_name) AS customer_name,
      c.id            AS customer_id,
      c.referred_by   AS referred_by,
      COALESCE(c.qr_campaign_name, o.qr_campaign_name) AS qr_campaign_name,
      item->>'name'   AS item_name,
      item->>'slug'   AS item_slug,
      COALESCE(NULLIF(item->>'quantity', '')::numeric, 1)::int AS quantity,
      COALESCE(NULLIF(item->>'price', '')::numeric, 0)         AS price
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT cc.*
      FROM customers cc
      WHERE cc.id = o.customer_id OR lower(cc.email) = lower(o.email)
      ORDER BY (cc.id = o.customer_id) DESC
      LIMIT 1
    ) c ON TRUE,
    jsonb_array_elements(o.items) AS item
    WHERE o.status = ANY(${PAID_STATUSES})
      AND (${from ?? null}::timestamptz IS NULL OR o.created_at >= ${from ?? null}::timestamptz)
      AND (${to ?? null}::timestamptz IS NULL OR o.created_at < (${to ?? null}::timestamptz + INTERVAL '1 day'))
    ORDER BY o.created_at DESC
    LIMIT ${MAX_ITEM_ROWS + 1}
  `;
  return rows as unknown as ItemRow[];
}

export interface SalesQuery {
  kind?: GroupKind;
  /** Group keys to include. Empty or undefined means every group. */
  groups?: string[];
  from?: string;
  to?: string;
}

/**
 * The ranked products, and the groups you can narrow them to.
 *
 * The group list is always built from ALL paid orders, never from the filtered set — otherwise
 * ticking one group would make every other tick box vanish and there would be no way back.
 */
export async function getProductSalesReport(query: SalesQuery = {}): Promise<ProductSalesReport> {
  const kind: GroupKind = query.kind === 'campaign' ? 'campaign' : 'referral';
  const rows = await readItemRows(query.from, query.to);
  const truncated = rows.length > MAX_ITEM_ROWS;
  const items = truncated ? rows.slice(0, MAX_ITEM_ROWS) : rows;

  const wanted = new Set((query.groups ?? []).map((g) => g.trim().toLowerCase()).filter(Boolean));

  const groups = new Map<string, { label: string; orders: Set<number>; customers: Set<string> }>();
  const products = new Map<string, {
    name: string;
    slug: string | null;
    units: number;
    revenue: number;
    orders: Set<number>;
    customers: Set<string>;
    first: string | null;
    last: string | null;
  }>();
  const totalOrders = new Set<number>();
  const totalCustomers = new Set<string>();
  let totalUnits = 0;
  let totalRevenue = 0;

  for (const row of items) {
    const group = groupFor(row, kind);
    const who = (row.email ?? '').toLowerCase();

    const seenGroup = groups.get(group.key) ?? { label: group.label, orders: new Set<number>(), customers: new Set<string>() };
    seenGroup.orders.add(row.order_id);
    if (who) seenGroup.customers.add(who);
    groups.set(group.key, seenGroup);

    if (wanted.size && !wanted.has(group.key)) continue;

    const product = productKey(row);
    const units = Number.isFinite(row.quantity) ? Math.max(0, row.quantity) : 0;
    const revenue = (Number(row.price) || 0) * units;

    const entry = products.get(product.key) ?? {
      name: product.name,
      slug: product.slug,
      units: 0,
      revenue: 0,
      orders: new Set<number>(),
      customers: new Set<string>(),
      first: null as string | null,
      last: null as string | null,
    };
    entry.units += units;
    entry.revenue += revenue;
    entry.orders.add(row.order_id);
    if (who) entry.customers.add(who);
    if (!entry.first || row.created_at < entry.first) entry.first = row.created_at;
    if (!entry.last || row.created_at > entry.last) entry.last = row.created_at;
    // An off-catalogue sale that later gained a catalogue entry keeps the slug once one appears.
    if (!entry.slug && product.slug) entry.slug = product.slug;
    products.set(product.key, entry);

    totalUnits += units;
    totalRevenue += revenue;
    totalOrders.add(row.order_id);
    if (who) totalCustomers.add(who);
  }

  return {
    products: Array.from(products.entries())
      .map(([key, p]) => ({
        key,
        name: p.name,
        slug: p.slug,
        units: p.units,
        orders: p.orders.size,
        customers: p.customers.size,
        revenue: Math.round(p.revenue * 100) / 100,
        firstBought: p.first,
        lastBought: p.last,
      }))
      .sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name)),
    groups: Array.from(groups.entries())
      .map(([key, g]) => ({ key, label: g.label, orders: g.orders.size, customers: g.customers.size }))
      .sort((a, b) => b.customers - a.customers || b.orders - a.orders || a.label.localeCompare(b.label)),
    totals: {
      units: totalUnits,
      orders: totalOrders.size,
      customers: totalCustomers.size,
      revenue: Math.round(totalRevenue * 100) / 100,
    },
    truncated,
  };
}

/**
 * Who bought one product, most-bought first.
 *
 * This is the list the marketing button hands to the email composer, so it is people, not numbers:
 * the name to recognise, the address to write to, and how much of it they have actually bought.
 */
export async function listProductBuyers(wantedProduct: string, query: SalesQuery = {}): Promise<BuyerRow[]> {
  const kind: GroupKind = query.kind === 'campaign' ? 'campaign' : 'referral';
  const rows = await readItemRows(query.from, query.to);
  const wanted = new Set((query.groups ?? []).map((g) => g.trim().toLowerCase()).filter(Boolean));

  const buyers = new Map<string, BuyerRow & { orderIds: Set<number> }>();

  for (const row of rows.slice(0, MAX_ITEM_ROWS)) {
    if (productKey(row).key !== wantedProduct) continue;
    const group = groupFor(row, kind);
    if (wanted.size && !wanted.has(group.key)) continue;

    const email = (row.email ?? '').toLowerCase();
    if (!email) continue;
    const units = Number.isFinite(row.quantity) ? Math.max(0, row.quantity) : 0;

    const entry = buyers.get(email) ?? {
      email,
      name: (row.customer_name ?? '').trim() || email,
      units: 0,
      orders: 0,
      spend: 0,
      lastBought: null as string | null,
      group: group.label,
      orderIds: new Set<number>(),
    };
    entry.units += units;
    entry.spend += (Number(row.price) || 0) * units;
    entry.orderIds.add(row.order_id);
    if (!entry.lastBought || row.created_at > entry.lastBought) entry.lastBought = row.created_at;
    buyers.set(email, entry);
  }

  return Array.from(buyers.values())
    .map(({ orderIds, ...b }) => ({ ...b, orders: orderIds.size, spend: Math.round(b.spend * 100) / 100 }))
    .sort((a, b) => b.units - a.units || b.spend - a.spend || a.name.localeCompare(b.name));
}

export interface CustomerProductRow {
  name: string;
  slug: string | null;
  units: number;
  orders: number;
  spend: number;
  firstBought: string | null;
  lastBought: string | null;
}

/**
 * What one customer buys, most-bought first — the "trends" half of the task.
 *
 * Matched on the customer's id AND their email address, because four of the thirty-three orders on
 * the live shop were placed before that person had an account. Matching on id alone would show a
 * long-standing customer an empty history.
 */
export async function getCustomerProductHistory(customerId: number, email: string): Promise<CustomerProductRow[]> {
  const db = requireDb();
  const rows = (await db`
    SELECT
      o.id            AS order_id,
      o.created_at    AS created_at,
      item->>'name'   AS item_name,
      item->>'slug'   AS item_slug,
      COALESCE(NULLIF(item->>'quantity', '')::numeric, 1)::int AS quantity,
      COALESCE(NULLIF(item->>'price', '')::numeric, 0)         AS price
    FROM orders o, jsonb_array_elements(o.items) AS item
    WHERE o.status = ANY(${PAID_STATUSES})
      AND (o.customer_id = ${customerId} OR lower(o.email) = lower(${email}))
    ORDER BY o.created_at DESC
    LIMIT 2000
  `) as unknown as Pick<ItemRow, 'order_id' | 'created_at' | 'item_name' | 'item_slug' | 'quantity' | 'price'>[];

  const products = new Map<string, CustomerProductRow & { orderIds: Set<number> }>();
  for (const row of rows) {
    const product = productKey(row as ItemRow);
    const units = Number.isFinite(row.quantity) ? Math.max(0, row.quantity) : 0;
    const entry = products.get(product.key) ?? {
      name: product.name,
      slug: product.slug,
      units: 0,
      orders: 0,
      spend: 0,
      firstBought: null as string | null,
      lastBought: null as string | null,
      orderIds: new Set<number>(),
    };
    entry.units += units;
    entry.spend += (Number(row.price) || 0) * units;
    entry.orderIds.add(row.order_id);
    if (!entry.firstBought || row.created_at < entry.firstBought) entry.firstBought = row.created_at;
    if (!entry.lastBought || row.created_at > entry.lastBought) entry.lastBought = row.created_at;
    if (!entry.slug && product.slug) entry.slug = product.slug;
    products.set(product.key, entry);
  }

  return Array.from(products.values())
    .map(({ orderIds, ...p }) => ({ ...p, orders: orderIds.size, spend: Math.round(p.spend * 100) / 100 }))
    .sort((a, b) => b.units - a.units || b.spend - a.spend || a.name.localeCompare(b.name));
}
