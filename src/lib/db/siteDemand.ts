import { PRODUCTS } from '@/data/products';
import { INTERNAL_SLUG } from '@/lib/slugAliases';
import { requireDb } from './client';

export interface ProductDemandRow {
  slug: string;
  path: string;
  name: string;
  categories: string[];
  pageViews: number;
  visitors: number;
  visits: number;
  memberViews: number;
  basketAdds: number;
  orders: number;
  lastSeen: string;
}

export interface CategoryDemandRow {
  name: string;
  pageViews: number;
  visitors: number;
  basketAdds: number;
  orders: number;
  products: number;
}

export interface DemandReport {
  days: number;
  pageViews: number;
  visits: number;
  visitors: number;
  memberViews: number;
  basketAdds: number;
  products: ProductDemandRow[];
  categories: CategoryDemandRow[];
}

export interface DemandTrendRow {
  bucket: string;
  pageViews: number;
  visits: number;
  visitors: number;
  memberViews: number;
  basketAdds: number;
  orders: number;
  topProduct: string | null;
  topCategory: string | null;
}

export interface DemandTrends {
  weekly: DemandTrendRow[];
  monthly: DemandTrendRow[];
}

export interface CheckoutFunnel {
  basketVisitors: number;
  offerShown: number;
  offerDismissed: number;
  offerJoined: number;
  offerContinued: number;
  shippingSeen: number;
  paymentSeen: number;
  payPressed: number;
  paidOrders: number;
}

/**
 * First-party checkout signals. These identify where people leave the journey;
 * they deliberately describe a possible issue, rather than claiming to know
 * why a specific person stopped.
 */
export async function listCheckoutFunnel(days = 30): Promise<CheckoutFunnel> {
  const db = requireDb();
  const safeDays = Math.max(1, Math.min(730, Math.round(days)));
  const [eventRows, orderRows] = await Promise.all([
    db`
      SELECT kind,
             COUNT(DISTINCT COALESCE(NULLIF(visit_id, ''), ip_address, 'anonymous:' || id::text))::int AS people
      FROM site_interactions
      WHERE created_at >= now() - (${safeDays} || ' days')::interval
        AND kind IN ('add_to_basket', 'member_offer_shown', 'member_offer_dismissed', 'member_offer_joined', 'member_offer_checkout', 'checkout_shipping_seen', 'checkout_payment_seen', 'checkout_pay_pressed')
      GROUP BY kind
    `,
    db`
      SELECT COUNT(*)::int AS orders
      FROM orders
      WHERE created_at >= now() - (${safeDays} || ' days')::interval
        AND status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered')
    `,
  ]);
  const count = new Map((eventRows as { kind: string; people: number }[]).map((row) => [row.kind, Number(row.people)]));
  return {
    basketVisitors: count.get('add_to_basket') ?? 0,
    offerShown: count.get('member_offer_shown') ?? 0,
    offerDismissed: count.get('member_offer_dismissed') ?? 0,
    offerJoined: count.get('member_offer_joined') ?? 0,
    offerContinued: count.get('member_offer_checkout') ?? 0,
    shippingSeen: count.get('checkout_shipping_seen') ?? 0,
    paymentSeen: count.get('checkout_payment_seen') ?? 0,
    payPressed: count.get('checkout_pay_pressed') ?? 0,
    paidOrders: Number((orderRows as { orders: number }[])[0]?.orders ?? 0),
  };
}

interface RawProduct {
  path: string;
  page_views: number;
  visitors: number;
  visits: number;
  member_views: number;
  last_seen: string;
  address_keys: string[];
}

/** The products and categories attracting attention in one chosen period. */
export async function listDemand(days = 30): Promise<DemandReport> {
  const db = requireDb();
  const safeDays = Math.max(1, Math.min(730, Math.round(days)));
  const [summaryRows, productRows, basketRows, orderRows, customRows] = await Promise.all([
    db`
      SELECT COUNT(*)::int AS page_views,
             COUNT(*) FILTER (WHERE landing)::int AS visits,
             COUNT(DISTINCT ip_address)::int AS visitors,
             COUNT(*) FILTER (WHERE customer_id IS NOT NULL OR signed_in IS TRUE)::int AS member_views
      FROM site_visits
      WHERE created_at >= now() - (${safeDays} || ' days')::interval
    `,
    db`
      SELECT path, COUNT(*)::int AS page_views,
             COUNT(DISTINCT ip_address)::int AS visitors,
             COUNT(DISTINCT COALESCE(visit_id, ip_address || ':' || created_at::date::text))::int AS visits,
             COUNT(*) FILTER (WHERE customer_id IS NOT NULL OR signed_in IS TRUE)::int AS member_views,
             MAX(created_at)::text AS last_seen,
             array_remove(array_agg(DISTINCT ip_address), NULL) AS address_keys
      FROM site_visits
      WHERE created_at >= now() - (${safeDays} || ' days')::interval
        AND path LIKE '/shop/%' AND path NOT LIKE '/shop/category/%'
      GROUP BY path
    `,
    db`
      SELECT product_slug AS slug, SUM(COALESCE(quantity, 1))::int AS basket_adds
      FROM site_interactions
      WHERE created_at >= now() - (${safeDays} || ' days')::interval
        AND kind = 'add_to_basket' AND product_slug IS NOT NULL
      GROUP BY product_slug
    `,
    db`
      SELECT item->>'slug' AS slug, COUNT(DISTINCT o.id)::int AS orders
      FROM orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) item
      WHERE o.created_at >= now() - (${safeDays} || ' days')::interval
        AND o.status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered')
        AND item->>'slug' IS NOT NULL
      GROUP BY item->>'slug'
    `,
    db`SELECT slug, data FROM custom_products`,
  ]);

  const catalogue = new Map(PRODUCTS.map((p) => [p.slug, { name: p.name, categories: p.categories }]));
  for (const row of customRows as { slug: string; data: { name?: string; categories?: string[] } }[]) {
    catalogue.set(row.slug, {
      name: row.data?.name || row.slug,
      categories: Array.isArray(row.data?.categories) ? row.data.categories : [],
    });
  }
  const baskets = new Map((basketRows as { slug: string; basket_adds: number }[]).map((r) => [r.slug, Number(r.basket_adds)]));
  const orders = new Map((orderRows as { slug: string; orders: number }[]).map((r) => [r.slug, Number(r.orders)]));

  const products = (productRows as RawProduct[]).map((row) => {
    const urlSlug = row.path.slice('/shop/'.length);
    const slug = INTERNAL_SLUG[urlSlug] ?? urlSlug;
    const product = catalogue.get(slug);
    return {
      slug,
      path: row.path,
      name: product?.name ?? urlSlug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      categories: product?.categories ?? [],
      pageViews: Number(row.page_views),
      visitors: Number(row.visitors),
      visits: Number(row.visits),
      memberViews: Number(row.member_views),
      basketAdds: baskets.get(slug) ?? 0,
      orders: orders.get(slug) ?? 0,
      lastSeen: row.last_seen,
      addressKeys: row.address_keys ?? [],
    };
  }).sort((a, b) => b.visitors - a.visitors || b.pageViews - a.pageViews);

  const categoryMap = new Map<string, CategoryDemandRow>();
  const categoryAddresses = new Map<string, Set<string>>();
  for (const product of products) {
    for (const category of product.categories.filter((name) => name !== 'Peptides')) {
      const row = categoryMap.get(category) ?? { name: category, pageViews: 0, visitors: 0, basketAdds: 0, orders: 0, products: 0 };
      row.pageViews += product.pageViews;
      const addresses = categoryAddresses.get(category) ?? new Set<string>();
      product.addressKeys.forEach((address) => addresses.add(address));
      categoryAddresses.set(category, addresses);
      row.visitors = addresses.size;
      row.basketAdds += product.basketAdds;
      row.orders += product.orders;
      row.products += 1;
      categoryMap.set(category, row);
    }
  }
  const summary = (summaryRows as { page_views: number; visits: number; visitors: number; member_views: number }[])[0];
  const publicProducts: ProductDemandRow[] = products.map(({ addressKeys: _addressKeys, ...product }) => product);
  return {
    days: safeDays,
    pageViews: Number(summary?.page_views ?? 0),
    visits: Number(summary?.visits ?? 0),
    visitors: Number(summary?.visitors ?? 0),
    memberViews: Number(summary?.member_views ?? 0),
    basketAdds: Array.from(baskets.values()).reduce((sum, value) => sum + value, 0),
    products: publicProducts,
    categories: Array.from(categoryMap.values()).sort((a, b) => b.visitors - a.visitors || b.pageViews - a.pageViews),
  };
}

interface RawTrendSummary {
  period_type: 'week' | 'month';
  bucket: string;
  page_views: number;
  visits: number;
  visitors: number;
  member_views: number;
}

interface RawTrendProduct {
  period_type: 'week' | 'month';
  bucket: string;
  path: string;
  page_views: number;
}

interface RawTrendCount {
  period_type: 'week' | 'month';
  bucket: string;
  total: number;
}

/** Week-by-week and month-by-month demand across the full two-year window. */
export async function listDemandTrends(): Promise<DemandTrends> {
  const db = requireDb();
  const [summaryRows, productRows, basketRows, orderRows, customRows] = await Promise.all([
    db`
      WITH period_visits AS (
        SELECT p.period_type, p.bucket, v.ip_address, v.landing,
               (v.customer_id IS NOT NULL OR v.signed_in IS TRUE) AS member_view
        FROM site_visits v
        CROSS JOIN LATERAL (VALUES
          ('week', date_trunc('week', v.created_at AT TIME ZONE 'Europe/London')::date),
          ('month', date_trunc('month', v.created_at AT TIME ZONE 'Europe/London')::date)
        ) AS p(period_type, bucket)
        WHERE v.created_at >= now() - interval '730 days'
      )
      SELECT period_type, bucket::text, COUNT(*)::int AS page_views,
             COUNT(*) FILTER (WHERE landing)::int AS visits,
             COUNT(DISTINCT ip_address)::int AS visitors,
             COUNT(*) FILTER (WHERE member_view)::int AS member_views
      FROM period_visits
      GROUP BY period_type, bucket
    `,
    db`
      WITH period_products AS (
        SELECT p.period_type, p.bucket, v.path
        FROM site_visits v
        CROSS JOIN LATERAL (VALUES
          ('week', date_trunc('week', v.created_at AT TIME ZONE 'Europe/London')::date),
          ('month', date_trunc('month', v.created_at AT TIME ZONE 'Europe/London')::date)
        ) AS p(period_type, bucket)
        WHERE v.created_at >= now() - interval '730 days'
          AND v.path LIKE '/shop/%' AND v.path NOT LIKE '/shop/category/%'
      )
      SELECT period_type, bucket::text, path, COUNT(*)::int AS page_views
      FROM period_products
      GROUP BY period_type, bucket, path
    `,
    db`
      SELECT p.period_type, p.bucket::text, SUM(COALESCE(i.quantity, 1))::int AS total
      FROM site_interactions i
      CROSS JOIN LATERAL (VALUES
        ('week', date_trunc('week', i.created_at AT TIME ZONE 'Europe/London')::date),
        ('month', date_trunc('month', i.created_at AT TIME ZONE 'Europe/London')::date)
      ) AS p(period_type, bucket)
      WHERE i.created_at >= now() - interval '730 days' AND i.kind = 'add_to_basket'
      GROUP BY p.period_type, p.bucket
    `,
    db`
      SELECT p.period_type, p.bucket::text, COUNT(DISTINCT o.id)::int AS total
      FROM orders o
      CROSS JOIN LATERAL (VALUES
        ('week', date_trunc('week', o.created_at AT TIME ZONE 'Europe/London')::date),
        ('month', date_trunc('month', o.created_at AT TIME ZONE 'Europe/London')::date)
      ) AS p(period_type, bucket)
      WHERE o.created_at >= now() - interval '730 days'
        AND o.status IN ('paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered')
      GROUP BY p.period_type, p.bucket
    `,
    db`SELECT slug, data FROM custom_products`,
  ]);

  const catalogue = new Map(PRODUCTS.map((product) => [product.slug, { name: product.name, categories: product.categories }]));
  for (const row of customRows as { slug: string; data: { name?: string; categories?: string[] } }[]) {
    catalogue.set(row.slug, {
      name: row.data?.name || row.slug,
      categories: Array.isArray(row.data?.categories) ? row.data.categories : [],
    });
  }

  const rows = new Map<string, DemandTrendRow>();
  const keyOf = (period: string, bucket: string) => `${period}:${bucket}`;
  for (const raw of summaryRows as RawTrendSummary[]) {
    rows.set(keyOf(raw.period_type, raw.bucket), {
      bucket: raw.bucket,
      pageViews: Number(raw.page_views),
      visits: Number(raw.visits),
      visitors: Number(raw.visitors),
      memberViews: Number(raw.member_views),
      basketAdds: 0,
      orders: 0,
      topProduct: null,
      topCategory: null,
    });
  }
  for (const raw of basketRows as RawTrendCount[]) {
    const row = rows.get(keyOf(raw.period_type, raw.bucket));
    if (row) row.basketAdds = Number(raw.total);
  }
  for (const raw of orderRows as RawTrendCount[]) {
    const row = rows.get(keyOf(raw.period_type, raw.bucket));
    if (row) row.orders = Number(raw.total);
  }

  const periodProducts = new Map<string, Array<{ name: string; categories: string[]; pageViews: number }>>();
  for (const raw of productRows as RawTrendProduct[]) {
    const urlSlug = raw.path.slice('/shop/'.length);
    const slug = INTERNAL_SLUG[urlSlug] ?? urlSlug;
    const product = catalogue.get(slug);
    const key = keyOf(raw.period_type, raw.bucket);
    const list = periodProducts.get(key) ?? [];
    list.push({
      name: product?.name ?? urlSlug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      categories: product?.categories ?? [],
      pageViews: Number(raw.page_views),
    });
    periodProducts.set(key, list);
  }
  for (const [key, products] of Array.from(periodProducts.entries())) {
    const row = rows.get(key);
    if (!row) continue;
    products.sort((a, b) => b.pageViews - a.pageViews);
    row.topProduct = products[0]?.name ?? null;
    const categories = new Map<string, number>();
    for (const product of products) {
      for (const category of product.categories.filter((name) => name !== 'Peptides')) {
        categories.set(category, (categories.get(category) ?? 0) + product.pageViews);
      }
    }
    row.topCategory = Array.from(categories).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  const collect = (period: 'week' | 'month') => Array.from(rows)
    .filter(([key]) => key.startsWith(`${period}:`))
    .map(([, row]) => row)
    .sort((a, b) => b.bucket.localeCompare(a.bucket));
  return { weekly: collect('week'), monthly: collect('month') };
}

export interface JourneyStep {
  id: string;
  kind: 'page_view' | 'add_to_basket' | 'member_offer_shown' | 'member_offer_dismissed' | 'member_offer_joined' | 'member_offer_checkout' | 'checkout_shipping_seen' | 'checkout_payment_seen' | 'checkout_pay_pressed';
  path: string;
  productSlug: string | null;
  at: string;
}

export interface VisitorJourney {
  id: string;
  ipAddress: string | null;
  customerId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  country: string | null;
  countryRegion: string | null;
  city: string | null;
  source: string;
  sourceDetail: string | null;
  startedAt: string;
  lastAt: string;
  pageViews: number;
  basketAdds: number;
  steps: JourneyStep[];
  precise: boolean;
}

interface RawJourneyEvent {
  id: number;
  kind: JourneyStep['kind'];
  ip_address: string | null;
  visit_id: string | null;
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  path: string;
  product_slug: string | null;
  landing: boolean;
  source: string | null;
  source_detail: string | null;
  country: string | null;
  country_region: string | null;
  city: string | null;
  created_at: string;
}

/** Recent journeys. Older rows are carefully grouped by address and a 30 minute gap. */
export async function listVisitorJourneys(days = 30, limit = 100): Promise<VisitorJourney[]> {
  const db = requireDb();
  const safeDays = Math.max(1, Math.min(730, Math.round(days)));
  const [views, actions] = await Promise.all([
    db`
      SELECT v.id, 'page_view' AS kind, v.ip_address, v.visit_id, v.customer_id,
             trim(concat_ws(' ', c.first_name, c.last_name)) AS customer_name, c.email AS customer_email,
             v.path, NULL::text AS product_slug, v.landing, v.source, v.source_detail,
             v.country, v.country_region, v.city, v.created_at::text
      FROM site_visits v LEFT JOIN customers c ON c.id = v.customer_id
      WHERE v.created_at >= now() - (${safeDays} || ' days')::interval
      ORDER BY v.created_at DESC LIMIT 900
    `,
    db`
      SELECT i.id, i.kind, i.ip_address, i.visit_id, i.customer_id,
             trim(concat_ws(' ', c.first_name, c.last_name)) AS customer_name, c.email AS customer_email,
             i.path, i.product_slug, FALSE AS landing, NULL::text AS source, NULL::text AS source_detail,
             NULL::text AS country, NULL::text AS country_region, NULL::text AS city, i.created_at::text
      FROM site_interactions i LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.created_at >= now() - (${safeDays} || ' days')::interval
      ORDER BY i.created_at DESC LIMIT 300
    `,
  ]);
  const events = [...views, ...actions] as RawJourneyEvent[];
  events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const groups = new Map<string, VisitorJourney>();
  const lastLegacy = new Map<string, { key: string; at: number }>();
  for (const event of events) {
    const at = new Date(event.created_at).getTime();
    const address = event.ip_address ?? 'unknown';
    const prior = lastLegacy.get(address);
    const legacyNew = event.landing || !prior || at - prior.at > 30 * 60 * 1000;
    const key = event.visit_id || (legacyNew ? `legacy:${address}:${event.id}` : prior!.key);
    if (!event.visit_id) lastLegacy.set(address, { key, at });
    const current = groups.get(key) ?? {
      id: key,
      ipAddress: event.ip_address,
      customerId: event.customer_id,
      customerName: event.customer_name || null,
      customerEmail: event.customer_email,
      country: event.country,
      countryRegion: event.country_region,
      city: event.city,
      source: event.source ?? 'internal',
      sourceDetail: event.source_detail,
      startedAt: event.created_at,
      lastAt: event.created_at,
      pageViews: 0,
      basketAdds: 0,
      steps: [],
      precise: Boolean(event.visit_id),
    };
    current.lastAt = event.created_at;
    if (event.customer_id) {
      current.customerId = event.customer_id;
      current.customerName = event.customer_name || event.customer_email;
      current.customerEmail = event.customer_email;
    }
    if (event.country) {
      current.country = event.country;
      current.countryRegion = event.country_region;
      current.city = event.city;
    }
    if (event.kind === 'page_view') current.pageViews += 1;
    if (event.kind === 'add_to_basket') current.basketAdds += 1;
    current.steps.push({ id: `${event.kind}:${event.id}`, kind: event.kind, path: event.path, productSlug: event.product_slug, at: event.created_at });
    groups.set(key, current);
  }
  return Array.from(groups.values())
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
    .slice(0, Math.max(1, Math.min(200, limit)));
}
