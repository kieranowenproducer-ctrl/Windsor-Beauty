import { requireDb } from './client';

// Finding a group of customers to market to (task c22cb6cb).
//
// Kieran, 19 September 2026: "I should be able to click some drop downs and filter by that and then
// market those people... I think it is very important that I should have as many variables as
// possible, because at the moment I do not know how many people have come by Instagram, how many by
// Ross McCarthy or PAG Gym."
//
// WHY THE QUESTION IS ASKED OF THE DATABASE. The customers screen loads at most 200 people and
// filters them in the browser. That is fine for a list you scroll and fatal for a list you market
// to: the moment there are more than 200 customers, "everybody who joined since September" quietly
// means "everybody who joined since September, out of the most recent 200", and nobody would ever
// see that it was wrong. Every filter here is applied in SQL, over everybody.
//
// THE DROP-DOWNS ARE BUILT FROM THE DATA, not from a list typed in here. How somebody heard about
// us is a text column that has collected "Instagram", "A friend or word of mouth: Sam", "John -
// PAG" and "SAMS CLIENT" over time. A hand-written list would miss most of that. Asking the data
// what is actually in it means the drop-down is always right, and it is how "PAG" turns out to be
// three different spellings.

export interface CustomerFilters {
  /** Joined on or after this date, as YYYY-MM-DD. */
  joinedFrom?: string | null;
  /** Joined on or before this date, as YYYY-MM-DD. */
  joinedTo?: string | null;
  /** Exact value from the "how they heard about us" drop-down. */
  referredBy?: string | null;
  /** Any text inside that field, which is where a name like "PAG Jim" ends up. */
  referredByContains?: string | null;
  /** The campaign or partner who brought them in, e.g. "Riverside Spa". */
  campaign?: string | null;
  /** Their town, exactly as they typed it. */
  town?: string | null;
  /** The front half of the postcode: "RG40" for one town, "RG" for the whole area. */
  postcodeStart?: string | null;
  /** They have bought this product at least once. */
  boughtProduct?: string | null;
  /** 'yes' they have ordered, 'no' they never have. */
  hasOrdered?: 'yes' | 'no' | null;
  /** They have spent at least this much, in pounds. */
  minSpend?: number | null;
  /** 'yes' agreed to marketing, 'no' did not. */
  marketingConsent?: 'yes' | 'no' | null;
  /** 'yes' confirmed their email address, 'no' never did. */
  emailVerified?: 'yes' | 'no' | null;
}

export interface SegmentCustomer {
  id: number;
  email: string;
  name: string | null;
  town: string | null;
  postcode: string | null;
  referredBy: string | null;
  campaign: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  marketingConsent: boolean;
  emailVerified: boolean;
  /** False when nothing can reach them: no consent, unsubscribed, or no marketing record. */
  canBeEmailed: boolean;
  createdAt: string;
}

/** What is actually in the data, for the drop-downs. */
export interface SegmentFacets {
  referralSources: { value: string; count: number }[];
  campaigns: { value: string; count: number }[];
  towns: { value: string; count: number }[];
  postcodeAreas: { value: string; label: string; count: number }[];
  products: { value: string; count: number }[];
}

/**
 * The names of the postcode areas the shop actually sells into.
 *
 * Kieran asked for "a certain part of the UK, example Berkshire". THERE IS NO COUNTY ANYWHERE in
 * this data, only a town and a postcode, so a county drop-down would be inventing a fact. The
 * postcode area is the real thing that is closest to it: RG covers Reading and most of Berkshire,
 * GU covers Guildford and a good deal of north-east Hampshire. Naming them makes the drop-down
 * readable without pretending it is a county list, and the screen says as much.
 *
 * Only the common ones are named. Anything else shows as its bare letters, which is still useful
 * and is never wrong.
 */
const POSTCODE_AREA_NAMES: Record<string, string> = {
  AB: 'Aberdeen', AL: 'St Albans', B: 'Birmingham', BA: 'Bath', BB: 'Blackburn', BD: 'Bradford',
  BH: 'Bournemouth', BL: 'Bolton', BN: 'Brighton', BR: 'Bromley', BS: 'Bristol', CA: 'Carlisle',
  CB: 'Cambridge', CF: 'Cardiff', CH: 'Chester', CM: 'Chelmsford', CO: 'Colchester', CR: 'Croydon',
  CT: 'Canterbury', CV: 'Coventry', CW: 'Crewe', DA: 'Dartford', DE: 'Derby', DH: 'Durham',
  DL: 'Darlington', DN: 'Doncaster', DT: 'Dorchester', DY: 'Dudley', E: 'East London',
  EC: 'City of London', EH: 'Edinburgh', EN: 'Enfield', EX: 'Exeter', FK: 'Falkirk', FY: 'Blackpool',
  G: 'Glasgow', GL: 'Gloucester', GU: 'Guildford', HA: 'Harrow', HD: 'Huddersfield', HG: 'Harrogate',
  HP: 'Hemel Hempstead', HR: 'Hereford', HU: 'Hull', HX: 'Halifax', IG: 'Ilford', IP: 'Ipswich',
  KT: 'Kingston upon Thames', L: 'Liverpool', LA: 'Lancaster', LD: 'Llandrindod Wells', LE: 'Leicester',
  LL: 'Llandudno', LN: 'Lincoln', LS: 'Leeds', LU: 'Luton', M: 'Manchester', ME: 'Medway',
  MK: 'Milton Keynes', ML: 'Motherwell', N: 'North London', NE: 'Newcastle', NG: 'Nottingham',
  NN: 'Northampton', NP: 'Newport', NR: 'Norwich', NW: 'North West London', OL: 'Oldham',
  OX: 'Oxford', PE: 'Peterborough', PL: 'Plymouth', PO: 'Portsmouth', PR: 'Preston', RG: 'Reading',
  RH: 'Redhill', RM: 'Romford', S: 'Sheffield', SA: 'Swansea', SE: 'South East London',
  SG: 'Stevenage', SK: 'Stockport', SL: 'Slough', SM: 'Sutton', SN: 'Swindon', SO: 'Southampton',
  SP: 'Salisbury', SR: 'Sunderland', SS: 'Southend', ST: 'Stoke-on-Trent', SW: 'South West London',
  SY: 'Shrewsbury', TA: 'Taunton', TF: 'Telford', TN: 'Tonbridge', TQ: 'Torquay', TR: 'Truro',
  TS: 'Cleveland', TW: 'Twickenham', UB: 'Southall', W: 'West London', WA: 'Warrington',
  WC: 'London WC', WD: 'Watford', WF: 'Wakefield', WN: 'Wigan', WR: 'Worcester', WS: 'Walsall',
  WV: 'Wolverhampton', YO: 'York',
};

/** The letters at the front of a postcode: "RG40 1JT" and "rg401jt" both give "RG". */
export function postcodeArea(postcode: string | null | undefined): string {
  const match = (postcode ?? '').trim().toUpperCase().match(/^([A-Z]{1,2})/);
  return match ? match[1] : '';
}

/** "RG" reads as "RG — Reading". Anything unknown is left as it is rather than guessed at. */
export function postcodeAreaLabel(area: string): string {
  const name = POSTCODE_AREA_NAMES[area];
  return name ? `${area} — ${name}` : area;
}

/** Orders that count as real money: the same set the sales report uses, so the two never disagree. */
const PAID_STATUSES = ['paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered'];

/**
 * Everything the drop-downs need, from the data itself.
 *
 * Counts are included so that a drop-down entry carries its own weight: "Instagram (14)" tells you
 * whether a segment is worth an email before you pick it.
 */
export async function listSegmentFacets(): Promise<SegmentFacets> {
  const db = requireDb();

  const referrals = await db`
    SELECT referred_by AS value, count(*)::int AS count
    FROM customers
    WHERE referred_by IS NOT NULL AND trim(referred_by) <> ''
    GROUP BY 1 ORDER BY count DESC, value ASC
  `;

  const campaigns = await db`
    SELECT COALESCE(NULLIF(trim(qr_partner_name), ''), qr_campaign_name) AS value, count(*)::int AS count
    FROM customers
    WHERE qr_campaign_name IS NOT NULL AND trim(qr_campaign_name) <> ''
    GROUP BY 1 ORDER BY count DESC, value ASC
  `;

  const towns = await db`
    SELECT trim(address_city) AS value, count(*)::int AS count
    FROM customers
    WHERE address_city IS NOT NULL AND trim(address_city) <> ''
    GROUP BY 1 ORDER BY count DESC, value ASC
  `;

  // Grouped by the letters, not the full outward code: "RG" is a part of the country, "RG40" is one
  // town within it, and the part of the country is what was asked for.
  const areas = await db`
    SELECT upper(substring(trim(address_postcode) from '^[A-Za-z]{1,2}')) AS value, count(*)::int AS count
    FROM customers
    WHERE address_postcode IS NOT NULL AND trim(address_postcode) <> ''
    GROUP BY 1 HAVING upper(substring(trim(address_postcode) from '^[A-Za-z]{1,2}')) <> ''
    ORDER BY count DESC, value ASC
  `;

  // Every product anybody has actually bought, from the order lines themselves.
  const products = await db`
    SELECT item->>'name' AS value, count(DISTINCT o.id)::int AS count
    FROM orders o, jsonb_array_elements(o.items) AS item
    WHERE o.status = ANY(${PAID_STATUSES}) AND COALESCE(item->>'name', '') <> ''
    GROUP BY 1 ORDER BY count DESC, value ASC
  `;

  return {
    referralSources: referrals as { value: string; count: number }[],
    campaigns: campaigns as { value: string; count: number }[],
    towns: towns as { value: string; count: number }[],
    postcodeAreas: (areas as { value: string; count: number }[])
      .map((row) => ({ ...row, label: postcodeAreaLabel(row.value) })),
    products: products as { value: string; count: number }[],
  };
}

/**
 * Who matches. Every filter is optional and they all narrow together.
 *
 * `canBeEmailed` is worked out here rather than guessed at on screen, because the marketing sender
 * silently drops anyone who has not agreed, has unsubscribed, or has no marketing record at all.
 * Ticking fifty people and reaching thirty of them, with no warning, is the kind of thing that is
 * only noticed weeks later when a campaign underperforms for no apparent reason.
 */
export async function findCustomers(filters: CustomerFilters, limit = 2000): Promise<SegmentCustomer[]> {
  const db = requireDb();

  // Empty strings arrive from unset drop-downs; they must mean "no filter", not "match the blank".
  const clean = (v: string | null | undefined) => {
    const t = (v ?? '').trim();
    return t === '' ? null : t;
  };
  const joinedFrom = clean(filters.joinedFrom);
  const joinedTo = clean(filters.joinedTo);
  const referredBy = clean(filters.referredBy);
  const referredByContains = clean(filters.referredByContains);
  const campaign = clean(filters.campaign);
  const town = clean(filters.town);
  const postcodeStart = clean(filters.postcodeStart);
  const boughtProduct = clean(filters.boughtProduct);
  const hasOrdered = filters.hasOrdered === 'yes' || filters.hasOrdered === 'no' ? filters.hasOrdered : null;
  const minSpend = typeof filters.minSpend === 'number' && Number.isFinite(filters.minSpend) && filters.minSpend > 0
    ? filters.minSpend : null;
  const marketingConsent = filters.marketingConsent === 'yes' || filters.marketingConsent === 'no' ? filters.marketingConsent : null;
  const emailVerified = filters.emailVerified === 'yes' || filters.emailVerified === 'no' ? filters.emailVerified : null;

  const rows = await db`
    WITH spend AS (
      SELECT c.id,
             COUNT(o.id)::int AS order_count,
             COALESCE(SUM(o.total), 0)::float AS total_spent,
             MAX(o.payment_confirmed_at) AS last_order_at
      FROM customers c
      LEFT JOIN orders o
        ON (o.customer_id = c.id OR (o.customer_id IS NULL AND lower(o.email) = lower(c.email)))
       AND o.payment_confirmed_at IS NOT NULL
       AND o.status NOT IN ('cancelled', 'refunded')
      GROUP BY c.id
    )
    SELECT c.id, c.email, c.first_name, c.last_name, c.address_city, c.address_postcode,
           c.referred_by,
           COALESCE(NULLIF(trim(c.qr_partner_name), ''), c.qr_campaign_name) AS campaign,
           c.marketing_consent, c.email_verified, c.created_at,
           s.order_count, s.total_spent, s.last_order_at,
           (mc.id IS NOT NULL AND mc.consent = TRUE AND mc.unsubscribed_at IS NULL
            AND mc.unsubscribe_token IS NOT NULL) AS can_be_emailed
    FROM customers c
    JOIN spend s ON s.id = c.id
    LEFT JOIN marketing_contacts mc ON lower(mc.email) = lower(c.email)
    WHERE (${joinedFrom}::text IS NULL OR c.created_at >= (${joinedFrom}::text)::date)
      AND (${joinedTo}::text IS NULL OR c.created_at < ((${joinedTo}::text)::date + INTERVAL '1 day'))
      AND (${referredBy}::text IS NULL OR c.referred_by = ${referredBy}::text)
      AND (${referredByContains}::text IS NULL
           OR c.referred_by ILIKE '%' || ${referredByContains}::text || '%'
           OR COALESCE(c.qr_partner_name, '') ILIKE '%' || ${referredByContains}::text || '%'
           OR COALESCE(c.qr_campaign_name, '') ILIKE '%' || ${referredByContains}::text || '%')
      AND (${campaign}::text IS NULL
           OR COALESCE(NULLIF(trim(c.qr_partner_name), ''), c.qr_campaign_name) = ${campaign}::text)
      AND (${town}::text IS NULL OR lower(trim(c.address_city)) = lower(${town}::text))
      AND (${postcodeStart}::text IS NULL
           OR upper(replace(COALESCE(c.address_postcode, ''), ' ', '')) LIKE upper(${postcodeStart}::text) || '%')
      AND (${hasOrdered}::text IS NULL
           OR (${hasOrdered}::text = 'yes' AND s.order_count > 0)
           OR (${hasOrdered}::text = 'no' AND s.order_count = 0))
      AND (${minSpend}::float IS NULL OR s.total_spent >= ${minSpend}::float)
      AND (${marketingConsent}::text IS NULL
           OR (${marketingConsent}::text = 'yes' AND c.marketing_consent = TRUE)
           OR (${marketingConsent}::text = 'no' AND COALESCE(c.marketing_consent, FALSE) = FALSE))
      AND (${emailVerified}::text IS NULL
           OR (${emailVerified}::text = 'yes' AND c.email_verified = TRUE)
           OR (${emailVerified}::text = 'no' AND COALESCE(c.email_verified, FALSE) = FALSE))
      AND (${boughtProduct}::text IS NULL OR EXISTS (
            SELECT 1 FROM orders o2, jsonb_array_elements(o2.items) AS item
            WHERE (o2.customer_id = c.id OR (o2.customer_id IS NULL AND lower(o2.email) = lower(c.email)))
              AND o2.status = ANY(${PAID_STATUSES})
              AND item->>'name' = ${boughtProduct}::text))
    ORDER BY c.created_at DESC
    LIMIT ${limit}
  `;

  return (rows as Record<string, unknown>[]).map((row) => ({
    id: Number(row.id),
    email: String(row.email),
    name: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || null,
    town: (row.address_city as string) || null,
    postcode: (row.address_postcode as string) || null,
    referredBy: (row.referred_by as string) || null,
    campaign: (row.campaign as string) || null,
    orderCount: Number(row.order_count ?? 0),
    totalSpent: Number(row.total_spent ?? 0),
    lastOrderAt: row.last_order_at ? String(row.last_order_at) : null,
    marketingConsent: row.marketing_consent === true,
    emailVerified: row.email_verified === true,
    canBeEmailed: row.can_be_emailed === true,
    createdAt: String(row.created_at),
  }));
}

/**
 * What this group actually buys.
 *
 * Kieran: "If I wanted to work out what people from certain referrals like PAG Gym or Ross are
 * buying, I should be able to run a drop down and see what products those customers have bought."
 * So the answer is scoped to whoever is on screen, rather than being a shop-wide report with a
 * filter bolted on.
 */
export async function segmentProducts(customerIds: number[]): Promise<{ name: string; units: number; buyers: number }[]> {
  if (customerIds.length === 0) return [];
  const db = requireDb();
  const rows = await db`
    SELECT item->>'name' AS name,
           SUM(COALESCE((item->>'quantity')::int, (item->>'qty')::int, 1))::int AS units,
           COUNT(DISTINCT c.id)::int AS buyers
    FROM customers c
    JOIN orders o
      ON (o.customer_id = c.id OR (o.customer_id IS NULL AND lower(o.email) = lower(c.email)))
    CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
    WHERE c.id = ANY(${customerIds})
      AND o.status = ANY(${PAID_STATUSES})
      AND COALESCE(item->>'name', '') <> ''
    GROUP BY 1
    ORDER BY units DESC, name ASC
    LIMIT 40
  `;
  return rows as { name: string; units: number; buyers: number }[];
}
