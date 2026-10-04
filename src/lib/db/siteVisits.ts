import { requireDb } from './client';
import { ipContextFromRequest, type IpGeo } from './ipActivity';
import { ensureOrderPaymentConfirmationTracking } from './orders';

// Who comes to the shop, and where from (task dfe5e9ae).
//
// The address log (ipActivity.ts) records the notable things a person DOES:
// signing in, registering, ordering. This records the visit itself: every page
// somebody opens, with the address behind it, roughly where that is, and where
// they came from (a link tagged for Instagram, the site that referred them, or
// the app they are browsing inside). Kieran, 30 Aug 2026: "track and trace all
// IP addresses for anyone that comes to the website ... whether that is direct
// via the website address or via a link such as Instagram ... whether any of
// these lead to membership signed up and all orders purchased."
//
// Written from a tiny beacon the page sends after it loads, never from the
// middleware, so a slow or failed write can never slow a page down. No new
// cookie is set: a visit is tied to a later sign-up or order by its address,
// which is honest as far as it goes (a household, an office and a phone mast
// all share one address). Kept for the same two years as the address log.

export type VisitSource =
  | 'direct'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'google'
  | 'bing'
  | 'youtube'
  | 'twitter'
  | 'reddit'
  | 'email'
  | 'campaign-link'
  | 'another-site'
  | 'internal';

/** Plain names for the screen. */
export const VISIT_SOURCE_LABELS: Record<VisitSource, string> = {
  direct: 'Typed the address or a bookmark',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  google: 'Google',
  bing: 'Bing',
  youtube: 'YouTube',
  twitter: 'X (Twitter)',
  reddit: 'Reddit',
  email: 'An email',
  'campaign-link': 'A tracking link',
  'another-site': 'Another website',
  internal: 'Moving around the site',
};

export interface VisitSourceInput {
  utmSource?: string | null;
  utmMedium?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  /** A QR / tracking-link campaign slug from the wb_ref cookie, if any. */
  campaignSlug?: string | null;
  /** Our own host names, so a referral from our own pages reads as internal. */
  ownHosts?: string[];
}

const OWN_HOSTS = ['windsorbeauty.co.uk', 'www.windsorbeauty.co.uk', 'windsorbeauty.is', 'www.windsorbeauty.is', 'localhost'];

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function endsWithHost(host: string, name: string): boolean {
  return host === name || host.endsWith(`.${name}`);
}

/**
 * Where a visit came from, worked out from the strongest signal available:
 * the tag on the link (utm_source), then the referring site, then the app the
 * visitor is browsing inside (the Instagram, Facebook and TikTok apps announce
 * themselves in the browser name), and only then "direct".
 */
export function visitSourceFrom(input: VisitSourceInput): { source: VisitSource; detail: string | null } {
  const utm = (input.utmSource || '').trim().toLowerCase();
  if (utm) {
    if (/^(ig|insta|instagram)$/.test(utm)) return { source: 'instagram', detail: 'tagged link' };
    if (/^(fb|facebook|meta)$/.test(utm)) return { source: 'facebook', detail: 'tagged link' };
    if (/^(tiktok|tt)$/.test(utm)) return { source: 'tiktok', detail: 'tagged link' };
    if (/^(google|adwords|googleads)$/.test(utm)) return { source: 'google', detail: 'tagged link' };
    if (/^(youtube|yt)$/.test(utm)) return { source: 'youtube', detail: 'tagged link' };
    if (/^(twitter|x)$/.test(utm)) return { source: 'twitter', detail: 'tagged link' };
    if (/^(email|newsletter|mail|klaviyo|resend)$/.test(utm) || /^(email|newsletter)$/.test((input.utmMedium || '').toLowerCase())) {
      return { source: 'email', detail: utm };
    }
    return { source: 'campaign-link', detail: utm };
  }

  if (input.campaignSlug) return { source: 'campaign-link', detail: `campaign ${input.campaignSlug}` };

  const host = hostOf(input.referrer);
  if (host) {
    const own = [...OWN_HOSTS, ...(input.ownHosts || [])];
    if (own.some((name) => endsWithHost(host, name))) return { source: 'internal', detail: null };
    if (endsWithHost(host, 'instagram.com')) return { source: 'instagram', detail: null };
    if (endsWithHost(host, 'facebook.com') || endsWithHost(host, 'fb.com') || endsWithHost(host, 'messenger.com')) return { source: 'facebook', detail: null };
    if (endsWithHost(host, 'tiktok.com')) return { source: 'tiktok', detail: null };
    if (/(^|\.)google\.[a-z.]+$/.test(host)) return { source: 'google', detail: null };
    if (endsWithHost(host, 'bing.com')) return { source: 'bing', detail: null };
    if (endsWithHost(host, 'youtube.com') || endsWithHost(host, 'youtu.be')) return { source: 'youtube', detail: null };
    if (endsWithHost(host, 't.co') || endsWithHost(host, 'twitter.com') || endsWithHost(host, 'x.com')) return { source: 'twitter', detail: null };
    if (endsWithHost(host, 'reddit.com')) return { source: 'reddit', detail: null };
    return { source: 'another-site', detail: host };
  }

  const ua = input.userAgent || '';
  if (/\bInstagram\b/i.test(ua)) return { source: 'instagram', detail: 'Instagram app' };
  if (/\b(FBAN|FBAV|FB_IAB|FBIOS)\b/.test(ua)) return { source: 'facebook', detail: 'Facebook app' };
  if (/\b(TikTok|musical_ly|Bytedance)\b/i.test(ua)) return { source: 'tiktok', detail: 'TikTok app' };

  return { source: 'direct', detail: null };
}

/**
 * The source to record for one visit. A page that is not the first of the
 * session is, by definition, somebody moving around the site, so a missing
 * referrer there (single-page navigation keeps the original one) must not
 * read as "typed the address" or "in the Instagram app" again. A tag on the
 * link is still honoured, because that is a new arrival however it happened.
 */
export function sourceForVisit(input: VisitSourceInput & { landing: boolean }): { source: VisitSource; detail: string | null } {
  const classified = visitSourceFrom(input);
  if (!input.landing && (classified.source === 'direct' || (classified.detail || '').endsWith(' app'))) {
    return { source: 'internal', detail: null };
  }
  return classified;
}

/** Crawlers, monitors and scripts: not people, so not visits. */
export function looksLikeBot(userAgent: string | null | undefined): boolean {
  const ua = userAgent || '';
  if (!ua.trim()) return true;
  return /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|facebookexternalhit|whatsapp|telegram|curl\/|wget\/|python-requests|axios\/|node-fetch|undici|go-http-client|java\/|scrapy|semrush|ahrefs|mj12|dataprovider|petalbot|bytespider/i.test(ua);
}

function clip(value: string | null | undefined, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

export interface RecordSiteVisitParams {
  request: Request;
  path: string;
  landing: boolean;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  /** The ad id from the link (utm_content), so ads in one campaign can be told apart. */
  utmContent?: string | null;
  campaignSlug?: string | null;
  /**
   * Was the person signed in to a Windsor Beauty account when they opened this
   * page? Null means we could not tell, which is what every row written before
   * 5 Sept 2026 says. The ads reports use it to leave existing members out of
   * "how did the ad do", because a member who was already signed in was never
   * won by the ad.
   */
  signedIn?: boolean | null;
  /** Random id kept only for this browser tab, used to group a journey. */
  visitId?: string | null;
  /** Existing signed member token. It is verified inside the insert. */
  customerToken?: string | null;
  /** Stable browser-generated id. Retried deliveries use the same value. */
  eventId?: string | null;
  geo?: IpGeo;
}

/** Returns true only after the row is safely in the database. */
export async function recordSiteVisit(params: RecordSiteVisitParams): Promise<boolean> {
  const geo = params.geo ?? ipContextFromRequest(params.request);
  const { source, detail } = sourceForVisit({
    landing: params.landing,
    utmSource: params.utmSource,
    utmMedium: params.utmMedium,
    referrer: params.referrer,
    userAgent: geo.userAgent,
    campaignSlug: params.campaignSlug,
  });

  const insert = async () => {
    const db = requireDb();
    await db`
      WITH member AS (
        SELECT customer_id FROM customer_sessions
        WHERE token = ${clip(params.customerToken, 200)} AND expires_at > now()
        LIMIT 1
      )
      INSERT INTO site_visits
        (ip_address, path, landing, source, source_detail, referrer,
         utm_source, utm_medium, utm_campaign, utm_content,
         country, country_region, city, postal_code, network, user_agent,
         signed_in, visit_id, customer_id, event_id)
      VALUES (
        ${clip(geo.ip, 100)}, ${clip(params.path, 300)}, ${params.landing}, ${source}, ${clip(detail, 200)}, ${clip(params.referrer, 500)},
        ${clip(params.utmSource, 100)}, ${clip(params.utmMedium, 100)}, ${clip(params.utmCampaign, 200)}, ${clip(params.utmContent, 200)},
        ${clip(geo.country, 8)}, ${clip(geo.region, 100)}, ${clip(geo.city, 120)}, ${clip(geo.postalCode, 40)}, ${clip(geo.network, 40)},
        ${clip(geo.userAgent, 500)},
        CASE WHEN ${clip(params.customerToken, 200)}::text IS NULL THEN ${params.signedIn ?? null} ELSE EXISTS (SELECT 1 FROM member) END,
        ${clip(params.visitId, 100)}, (SELECT customer_id FROM member), ${clip(params.eventId, 100)}
      )
      ON CONFLICT (event_id) DO NOTHING
    `;
  };

  try {
    await insert();
    return true;
  } catch {
    // The first visit after this ships runs before the table exists. Same
    // self-healing retry the address log uses.
    try {
      const { ensureSchema } = await import('./schema');
      await ensureSchema();
      await insert();
      return true;
    } catch (err) {
      console.error('[siteVisits] could not record visit:', err);
      return false;
    }
  }
}

export interface RecordSiteInteractionParams {
  request: Request;
  kind: 'add_to_basket' | 'member_offer_shown' | 'member_offer_dismissed' | 'member_offer_joined' | 'member_offer_checkout' | 'checkout_shipping_seen' | 'checkout_payment_seen' | 'checkout_pay_pressed';
  path: string;
  visitId?: string | null;
  customerToken?: string | null;
  productSlug?: string | null;
  quantity?: number | null;
  eventId?: string | null;
}

/** Important actions that happen without opening a new page. */
export async function recordSiteInteraction(params: RecordSiteInteractionParams): Promise<boolean> {
  const geo = ipContextFromRequest(params.request);
  const insert = async () => {
    const db = requireDb();
    await db`
      WITH member AS (
        SELECT customer_id FROM customer_sessions
        WHERE token = ${clip(params.customerToken, 200)} AND expires_at > now()
        LIMIT 1
      )
      INSERT INTO site_interactions
        (ip_address, visit_id, customer_id, kind, path, product_slug, quantity, event_id)
      VALUES (
        ${clip(geo.ip, 100)}, ${clip(params.visitId, 100)}, (SELECT customer_id FROM member),
        ${params.kind}, ${clip(params.path, 300)}, ${clip(params.productSlug, 200)},
        ${Math.max(1, Math.min(99, Math.round(params.quantity ?? 1)))}, ${clip(params.eventId, 100)}
      )
      ON CONFLICT (event_id) DO NOTHING
    `;
  };
  try {
    await insert();
    return true;
  } catch {
    try {
      const { ensureSchema } = await import('./schema');
      await ensureSchema();
      await insert();
      return true;
    } catch (err) {
      console.error('[siteVisits] could not record interaction:', err);
      return false;
    }
  }
}

/**
 * Attach pages opened before registration to the account just created. The
 * visit id must also come from the same internet address and be recent, so a
 * browser cannot attach somebody else's guessed journey.
 */
export async function attachVisitToCustomer(params: {
  visitId?: string | null;
  customerId: number;
  request: Request;
}): Promise<boolean> {
  const visitId = clip(params.visitId, 100);
  const ip = clip(ipContextFromRequest(params.request).ip, 100);
  if (!visitId || !ip) return false;
  try {
    const db = requireDb();
    await db.transaction([
      db`UPDATE site_visits SET customer_id = ${params.customerId}, signed_in = FALSE
         WHERE visit_id = ${visitId} AND ip_address = ${ip}
           AND customer_id IS NULL AND created_at > now() - interval '24 hours'`,
      db`UPDATE site_interactions SET customer_id = ${params.customerId}
         WHERE visit_id = ${visitId} AND ip_address = ${ip}
           AND customer_id IS NULL AND created_at > now() - interval '24 hours'`,
    ]);
    return true;
  } catch (err) {
    console.error('[siteVisits] could not attach visit to customer:', err);
    return false;
  }
}

export interface TrackingHealth {
  healthy: boolean;
  latestVisitAt: string | null;
  latestCustomerActivityAt: string | null;
  untrackedRegistrations24h: number;
  feedStale: boolean;
}

// The reliable queue and confirmed-save route first became live at this point.
// Older gaps are the known, unrecoverable outage and must not make the new
// system look broken forever. Registrations from this point onward are checked.
const TRACKING_RELIABILITY_STARTED_AT = '2026-09-10T09:50:00Z';

/** A stopped feed must look broken, even when the admin API itself still loads. */
export async function getTrackingHealth(): Promise<TrackingHealth> {
  const db = requireDb();
  const rows = await db`
    SELECT
      (SELECT max(created_at)::text FROM site_visits) AS latest_visit_at,
      (SELECT max(created_at)::text FROM ip_activity_log
       WHERE event IN ('register', 'sign_in', 'order')) AS latest_customer_activity_at,
      (SELECT count(*)::int FROM ip_activity_log a
       WHERE a.event = 'register' AND a.created_at > now() - interval '24 hours'
         AND a.created_at >= ${TRACKING_RELIABILITY_STARTED_AT}::timestamptz
         AND NOT EXISTS (
           SELECT 1 FROM site_visits v
           WHERE v.ip_address = a.ip_address
             AND v.created_at BETWEEN a.created_at - interval '24 hours' AND a.created_at + interval '1 hour'
         )) AS untracked_registrations_24h
  `;
  const row = rows[0] as {
    latest_visit_at: string | null;
    latest_customer_activity_at: string | null;
    untracked_registrations_24h: number;
  };
  const visitAt = row.latest_visit_at ? new Date(row.latest_visit_at).getTime() : 0;
  const activityAt = row.latest_customer_activity_at ? new Date(row.latest_customer_activity_at).getTime() : 0;
  const behindCustomerActivity = activityAt > visitAt + 30 * 60 * 1000;
  // A feed that receives nothing cannot report its own failed requests. The
  // shop normally sees traffic every day, so twelve silent hours is a reason
  // to look, while still avoiding an alarm over a quiet hour overnight.
  const feedStale = visitAt === 0 || Date.now() - visitAt > 12 * 60 * 60 * 1000;
  return {
    healthy: row.untracked_registrations_24h === 0 && !behindCustomerActivity && !feedStale,
    latestVisitAt: row.latest_visit_at,
    latestCustomerActivityAt: row.latest_customer_activity_at,
    untrackedRegistrations24h: row.untracked_registrations_24h,
    feedStale,
  };
}

export interface SiteVisitRow {
  id: number;
  ip_address: string | null;
  path: string;
  landing: boolean;
  source: VisitSource;
  source_detail: string | null;
  referrer: string | null;
  country: string | null;
  country_region: string | null;
  city: string | null;
  postal_code: string | null;
  created_at: string;
}

export async function listRecentVisits(limit = 300): Promise<SiteVisitRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT id, ip_address, path, landing, source, source_detail, referrer,
           country, country_region, city, postal_code, created_at
    FROM site_visits
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as SiteVisitRow[];
}

export interface VisitSourceRow {
  source: VisitSource;
  visits: number;
  addresses: number;
  /** Addresses that registered as a member on or after arriving this way. */
  joined: number;
  /** Addresses that placed an order on or after arriving this way. */
  ordered: number;
}

/**
 * Where visitors come from, over the last so-many days, counted on the visit
 * that brought them (the first page of a session), so moving around the site
 * is never counted as arriving again. Sign-ups and orders are taken from the
 * address log by matching the address, which is a fair guide and not a proof.
 */
export async function listVisitSources(days = 30): Promise<VisitSourceRow[]> {
  await ensureOrderPaymentConfirmationTracking();
  const db = requireDb();
  const rows = await db`
    SELECT v.source,
           COUNT(*)::int AS visits,
           COUNT(DISTINCT v.ip_address)::int AS addresses,
           COUNT(DISTINCT v.ip_address) FILTER (WHERE EXISTS (
             SELECT 1 FROM ip_activity_log a
             WHERE a.ip_address = v.ip_address AND a.event = 'register' AND a.created_at >= v.created_at - interval '1 hour'
           ))::int AS joined,
           COUNT(DISTINCT v.ip_address) FILTER (WHERE EXISTS (
             SELECT 1
             FROM ip_activity_log a
             JOIN orders o ON o.order_number = substring(a.detail from 'Order ([A-Z0-9-]+)')
             WHERE a.ip_address = v.ip_address AND a.event = 'order'
               AND a.created_at >= v.created_at - interval '1 hour'
               AND o.payment_confirmed_at IS NOT NULL
           ))::int AS ordered
    FROM site_visits v
    WHERE v.landing = TRUE
      AND v.created_at >= now() - (${days} || ' days')::interval
    GROUP BY v.source
    ORDER BY COUNT(*) DESC
  `;
  return rows as VisitSourceRow[];
}

export interface VisitorAddressRow {
  ip_address: string;
  visits: number;
  first_seen: string;
  last_seen: string;
  /** How this address first arrived. */
  first_source: VisitSource;
  first_source_detail: string | null;
  country: string | null;
  country_region: string | null;
  city: string | null;
  postal_code: string | null;
  member_names: string[];
  joined: boolean;
  ordered: boolean;
  orders: number;
}

/** One row per address that has visited, with what it went on to do. */
export async function listVisitorAddresses(limit = 300): Promise<VisitorAddressRow[]> {
  await ensureOrderPaymentConfirmationTracking();
  const db = requireDb();
  const rows = await db`
    SELECT v.ip_address,
           COUNT(*)::int AS visits,
           MIN(v.created_at) AS first_seen,
           MAX(v.created_at) AS last_seen,
           (ARRAY_AGG(v.source ORDER BY v.created_at ASC))[1] AS first_source,
           (ARRAY_AGG(v.source_detail ORDER BY v.created_at ASC))[1] AS first_source_detail,
           (ARRAY_AGG(v.country        ORDER BY v.created_at DESC) FILTER (WHERE v.country        IS NOT NULL))[1] AS country,
           (ARRAY_AGG(v.country_region ORDER BY v.created_at DESC) FILTER (WHERE v.country_region IS NOT NULL))[1] AS country_region,
           (ARRAY_AGG(v.city           ORDER BY v.created_at DESC) FILTER (WHERE v.city           IS NOT NULL))[1] AS city,
           (ARRAY_AGG(v.postal_code    ORDER BY v.created_at DESC) FILTER (WHERE v.postal_code    IS NOT NULL))[1] AS postal_code,
           COALESCE((SELECT ARRAY_AGG(DISTINCT a.customer_name) FROM ip_activity_log a
                     WHERE a.ip_address = v.ip_address AND a.customer_name IS NOT NULL), '{}') AS member_names,
           EXISTS (SELECT 1 FROM ip_activity_log a WHERE a.ip_address = v.ip_address AND a.event = 'register') AS joined,
           EXISTS (
             SELECT 1 FROM ip_activity_log a
             JOIN orders o ON o.order_number = substring(a.detail from 'Order ([A-Z0-9-]+)')
             WHERE a.ip_address = v.ip_address AND a.event = 'order'
               AND o.payment_confirmed_at IS NOT NULL
           ) AS ordered,
           (
             SELECT COUNT(*)::int FROM ip_activity_log a
             JOIN orders o ON o.order_number = substring(a.detail from 'Order ([A-Z0-9-]+)')
             WHERE a.ip_address = v.ip_address AND a.event = 'order'
               AND o.payment_confirmed_at IS NOT NULL
           ) AS orders
    FROM site_visits v
    WHERE v.ip_address IS NOT NULL
    GROUP BY v.ip_address
    ORDER BY MAX(v.created_at) DESC
    LIMIT ${limit}
  `;
  return rows as VisitorAddressRow[];
}
