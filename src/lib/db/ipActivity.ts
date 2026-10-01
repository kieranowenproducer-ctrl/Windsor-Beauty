import { requireDb } from './client';

// Where people are coming from. One append-only row per notable thing somebody
// does on the site, with the address behind it and roughly where that address is.
// Read by /admin/ip-addresses. See ensureSchema() for the table.
//
// Writing is fire-and-forget, like the sign-in log: recording where somebody came
// from must never stop them doing the thing they came to do.
//
// The location is free and private. Vercel resolves it at the edge and puts it on
// the request, so no customer address is ever sent to a lookup service.

export type IpEvent =
  | 'sign_in'
  | 'register'
  | 'verification'
  | 'research_question'
  | 'enquiry'
  | 'qr_scan'
  | 'order'
  | 'earlier_record';

export interface IpActivityRow {
  id: number;
  ip_address: string | null;
  event: IpEvent;
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  country: string | null;
  country_region: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
  timezone: string | null;
  postal_code: string | null;
  network: string | null;
  user_agent: string | null;
  detail: string | null;
  created_at: string;
}

export interface IpGeo {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
  timezone: string | null;
  postalCode: string | null;
  /* The internet provider the address belongs to, as a network number. A run of
     sign-ups from a data centre rather than from real homes shows up here long
     before it shows up anywhere else. */
  network: string | null;
  userAgent: string | null;
}

function header(request: Request, name: string): string | null {
  const raw = request.headers.get(name);
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  /* Vercel percent-encodes the city and region, so "Kingston upon Thames"
     arrives as "Kingston%20upon%20Thames". Decoding can throw on a malformed
     value, and a bad header must not cost us the row. */
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * The address and its approximate location, read straight off the request.
 *
 * `x-forwarded-for` is the same derivation the sign-in log and /api/verify use.
 * The `x-vercel-ip-*` headers are added by Vercel's edge network in production,
 * free on every plan. Locally they are simply absent, which is why every one of
 * these fields is allowed to be null: the address is still worth recording even
 * when we cannot say where it is.
 */
export function ipContextFromRequest(request?: Request): IpGeo {
  if (!request) {
    return {
      ip: null, country: null, region: null, city: null, latitude: null,
      longitude: null, timezone: null, postalCode: null, network: null, userAgent: null,
    };
  }
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded
    ? forwarded.split(',')[0].trim()
    : request.headers.get('x-real-ip') || null;

  return {
    ip: ip || null,
    country: header(request, 'x-vercel-ip-country'),
    region: header(request, 'x-vercel-ip-country-region'),
    city: header(request, 'x-vercel-ip-city'),
    latitude: header(request, 'x-vercel-ip-latitude'),
    longitude: header(request, 'x-vercel-ip-longitude'),
    timezone: header(request, 'x-vercel-ip-timezone'),
    postalCode: header(request, 'x-vercel-ip-postal-code'),
    network: header(request, 'x-vercel-ip-as-number'),
    userAgent: request.headers.get('user-agent'),
  };
}

function clip(value: string | null | undefined, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

// Never throws. Callers use it without awaiting, so an unhandled rejection here
// would be an unhandled rejection in the customer's own request.
export async function recordIpActivity(params: {
  event: IpEvent;
  request?: Request;
  customerId?: number | null;
  name?: string | null;
  email?: string | null;
  detail?: string | null;
  /* Supplied only where the address was derived before this helper existed, so
     the older routes do not have to change how they read it. */
  geo?: IpGeo;
}): Promise<void> {
  // Staff can be signed into the admin and a member account in the same
  // browser while testing. Page tracking deliberately excludes that browser,
  // so its member sign-ins and test orders must be excluded here too. Keeping
  // one side but dropping the other made the health check report a stopped
  // visitor feed even while real public visits were saving normally.
  const cookies = params.request?.headers.get('cookie') || '';
  if (/(?:^|;\s*)wg_admin_session=/.test(cookies)) return;
  const geo = params.geo ?? ipContextFromRequest(params.request);

  const insert = async () => {
    const db = requireDb();
    await db`
      INSERT INTO ip_activity_log
        (ip_address, event, customer_id, customer_name, customer_email,
         country, country_region, city, latitude, longitude, timezone,
         postal_code, network, user_agent, detail)
      VALUES (
        ${clip(geo.ip, 100)}, ${params.event}, ${params.customerId ?? null},
        ${clip(params.name, 200)}, ${clip(params.email, 320)},
        ${clip(geo.country, 8)}, ${clip(geo.region, 100)}, ${clip(geo.city, 120)},
        ${clip(geo.latitude, 40)}, ${clip(geo.longitude, 40)}, ${clip(geo.timezone, 80)},
        ${clip(geo.postalCode, 40)}, ${clip(geo.network, 40)},
        ${clip(geo.userAgent, 500)}, ${clip(params.detail, 300)}
      )
    `;
  };

  try {
    await insert();
  } catch {
    // The first event after this ships runs before the table exists. Same
    // self-healing retry the sign-in log uses, so nothing is lost waiting for
    // somebody to open the admin page.
    try {
      const { ensureSchema } = await import('./schema');
      await ensureSchema();
      await insert();
    } catch (err) {
      console.error('[ipActivity] could not record activity:', err);
    }
  }
}

export async function listIpActivity(limit = 2000): Promise<IpActivityRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT id, ip_address, event, customer_id, customer_name, customer_email,
           country, country_region, city, latitude, longitude, timezone,
           postal_code, network, user_agent, detail, created_at
    FROM ip_activity_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as IpActivityRow[];
}

export interface IpSummaryRow {
  ip_address: string | null;
  country: string | null;
  country_region: string | null;
  city: string | null;
  postal_code: string | null;
  network: string | null;
  events: number;
  members: number;
  member_names: string[];
  first_seen: string;
  last_seen: string;
}

/**
 * One row per address, which is how somebody actually wants to read this: not a
 * list of things that happened, but a list of the people behind them.
 *
 * The location is taken from the most recent sighting rather than the first,
 * because a phone moves and the latest guess is the better one.
 */
export async function listIpSummary(limit = 500): Promise<IpSummaryRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT ip_address,
           (ARRAY_AGG(country          ORDER BY created_at DESC) FILTER (WHERE country          IS NOT NULL))[1] AS country,
           (ARRAY_AGG(country_region   ORDER BY created_at DESC) FILTER (WHERE country_region   IS NOT NULL))[1] AS country_region,
           (ARRAY_AGG(city             ORDER BY created_at DESC) FILTER (WHERE city             IS NOT NULL))[1] AS city,
           (ARRAY_AGG(postal_code      ORDER BY created_at DESC) FILTER (WHERE postal_code      IS NOT NULL))[1] AS postal_code,
           (ARRAY_AGG(network          ORDER BY created_at DESC) FILTER (WHERE network          IS NOT NULL))[1] AS network,
           COUNT(*)::int                                    AS events,
           COUNT(DISTINCT customer_id)::int                 AS members,
           COALESCE(ARRAY_AGG(DISTINCT customer_name) FILTER (WHERE customer_name IS NOT NULL), '{}') AS member_names,
           MIN(created_at)                                  AS first_seen,
           MAX(created_at)                                  AS last_seen
    FROM ip_activity_log
    WHERE ip_address IS NOT NULL
    GROUP BY ip_address
    ORDER BY MAX(created_at) DESC
    LIMIT ${limit}
  `;
  return rows as IpSummaryRow[];
}

export interface CountryCount {
  country: string | null;
  country_region: string | null;
  city: string | null;
  events: number;
  addresses: number;
  members: number;
}

/** Where our people actually are. The marketing and demographics view. */
export async function listPlaces(limit = 60): Promise<CountryCount[]> {
  const db = requireDb();
  const rows = await db`
    SELECT country, country_region, city,
           COUNT(*)::int                        AS events,
           COUNT(DISTINCT ip_address)::int      AS addresses,
           COUNT(DISTINCT customer_id)::int     AS members
    FROM ip_activity_log
    WHERE country IS NOT NULL
    GROUP BY country, country_region, city
    ORDER BY COUNT(*) DESC
    LIMIT ${limit}
  `;
  return rows as CountryCount[];
}

export interface IpConcern {
  kind: 'many_members_one_address' | 'member_many_countries' | 'research_burst'
      | 'repeated_failures' | 'many_addresses_one_network';
  headline: string;
  detail: string;
  subject: string;
  count: number;
}

/**
 * The safety half of the job: who looks like they are taking liberties.
 *
 * These are SIGNALS, not verdicts, and nothing here blocks anybody. A family
 * sharing a house shares an address; somebody on a train changes country twice
 * before lunch. It is a list to look at, not a list to act on blindly.
 */
export async function listConcerns(): Promise<IpConcern[]> {
  const db = requireDb();
  const out: IpConcern[] = [];

  // One address, several different member accounts. Sharing, or somebody
  // opening accounts to keep claiming a first-order discount.
  const shared = await db`
    SELECT ip_address, COUNT(DISTINCT customer_id)::int AS n,
           ARRAY_AGG(DISTINCT customer_name) FILTER (WHERE customer_name IS NOT NULL) AS names
    FROM ip_activity_log
    WHERE ip_address IS NOT NULL AND customer_id IS NOT NULL
    GROUP BY ip_address
    HAVING COUNT(DISTINCT customer_id) >= 3
    ORDER BY COUNT(DISTINCT customer_id) DESC
    LIMIT 20
  `;
  for (const r of shared as Array<{ ip_address: string; n: number; names: string[] | null }>) {
    out.push({
      kind: 'many_members_one_address',
      headline: `${r.n} different member accounts from one address`,
      detail: (r.names ?? []).slice(0, 6).join(', ') || 'Names not recorded',
      subject: r.ip_address,
      count: r.n,
    });
  }

  // One member, several countries. Either they travel, or somebody else has
  // their password.
  const travelling = await db`
    SELECT customer_id,
           (ARRAY_AGG(customer_name) FILTER (WHERE customer_name IS NOT NULL))[1] AS name,
           COUNT(DISTINCT country)::int AS n,
           ARRAY_AGG(DISTINCT country) FILTER (WHERE country IS NOT NULL) AS countries
    FROM ip_activity_log
    WHERE customer_id IS NOT NULL AND country IS NOT NULL
    GROUP BY customer_id
    HAVING COUNT(DISTINCT country) >= 3
    ORDER BY COUNT(DISTINCT country) DESC
    LIMIT 20
  `;
  for (const r of travelling as Array<{ customer_id: number; name: string | null; n: number; countries: string[] | null }>) {
    out.push({
      kind: 'member_many_countries',
      headline: `${r.name ?? 'A member'} has used the site from ${r.n} countries`,
      detail: (r.countries ?? []).join(', '),
      subject: String(r.customer_id),
      count: r.n,
    });
  }

  return out.sort((a, b) => b.count - a.count);
}

/**
 * Seed the log once from the addresses the site was ALREADY recording, so the
 * page opens with real history instead of nothing:
 *   - member_login_log (sign-ins, with the member attached)
 *   - qr_campaign_scans (poster and card scans)
 *
 * Nothing is invented, and nothing that was never recorded can appear. These
 * rows carry no location, because the location was not being captured at the
 * time: they are marked 'earlier_record' for exactly that reason.
 */
export async function backfillEarlierIpActivity(): Promise<number> {
  const db = requireDb();

  const existing = await db`SELECT 1 FROM ip_activity_log WHERE event = 'earlier_record' LIMIT 1`;
  if (existing.length > 0) return 0;

  let inserted = 0;

  const logins = await db`
    INSERT INTO ip_activity_log
      (ip_address, event, customer_id, customer_name, customer_email, user_agent, detail, created_at)
    SELECT ip_address, 'earlier_record', customer_id, customer_name, customer_email, user_agent,
           'Sign-in recorded before locations were kept', created_at
    FROM member_login_log
    WHERE ip_address IS NOT NULL
    RETURNING id
  `;
  inserted += logins.length;

  try {
    const scans = await db`
      INSERT INTO ip_activity_log
        (ip_address, event, user_agent, detail, created_at)
      SELECT ip_address, 'earlier_record', user_agent,
             'QR scan recorded before locations were kept', created_at
      FROM qr_campaign_scans
      WHERE ip_address IS NOT NULL
      RETURNING id
    `;
    inserted += scans.length;
  } catch { /* table may not exist on a fresh database */ }

  return inserted;
}
