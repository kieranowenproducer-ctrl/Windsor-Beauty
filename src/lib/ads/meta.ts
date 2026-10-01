// Read-only reader for the Windsor Glow Meta ad account (Facebook + Instagram ads).
// Feeds the /admin/ads page and the daily ads cron. There are no write methods
// here on purpose: ads are created, edited and paused in Meta's own Ads Manager
// and nowhere else.
//
// Credentials: META_SYSTEM_USER_TOKEN + META_ADS_ACCOUNT_IDS (or the older
// singular META_ADS_ACCOUNT_ID). The system-user token is shared with the Social
// Engine, while this dashboard can combine more than one Windsor Glow account.
// Deliberately NOT META_ACCESS_TOKEN: that variable
// belongs to the site's social/page library, has different permissions, and was
// found dead (invalidated by Facebook) on 2026-09-03. Sharing it would let a page
// token outage silently break the ads screen, or the reverse.
//
// The parsing rules below (minor units, the purchase alias list, taking the largest
// matching purchase row) are ported from the Social Engine's proven Meta provider.
// If a number here ever disagrees with Ads Manager, suspect these rules last.

const GRAPH = 'https://graph.facebook.com/v21.0';

export type RangePreset = '7d' | '28d' | '90d' | 'all';

const PRESET_DAYS: Record<Exclude<RangePreset, 'all'>, number> = { '7d': 7, '28d': 28, '90d': 90 };

export interface AccountOverview {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  active: boolean;
  lifetimeSpendMinor: number;
}

export interface DailyRow {
  date: string;
  spendMinor: number;
  impressions: number;
  reach: number;
  clicks: number;
  videoViews: number;
  purchases: number;
  purchaseValueMinor: number;
}

export interface CampaignRow {
  id: string;
  accountId: string;
  name: string;
  status: string;        // plain-English: Running / Paused / Ended / Draft
  objective: string;     // plain-English: Sales / Website visits / ...
  startedOn: string | null;
  spendMinor: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  purchaseValueMinor: number;
}

export interface AdRow {
  id: string;
  accountId: string;
  name: string;
  campaignId: string;
  campaignName: string;
  /** Plain English: Running, Paused, In review, Rejected by Meta, Flagged by Meta, Ended. */
  status: string;
  running: boolean;
  createdOn: string | null;
  /** Meta's small thumbnail of the creative. A short-lived CDN address, or null. */
  thumbnailUrl: string | null;
  previewUrl: string | null;
  instagramUrl: string | null;
  /** What the ad's button says, in plain English ("Shop now"). */
  callToAction: string | null;
  /** Who the ad was aimed at, one plain sentence. */
  targeting: string | null;
  /** The ad set's schedule and budget. An ad past its end date is "Finished", not "Running". */
  startsOn: string | null;
  endsOn: string | null;
  budget: string | null;
  /** True when the ad link carries a campaign ID for Windsor Glow's own visit and order attribution. */
  websiteTracking: boolean | null;
  spendMinor: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  linkClicks: number;
  /** People who reached the site after clicking, by Meta's own count. */
  landingPageViews: number;
  comments: number;
  engagement: number;
  videoViews: number;
  purchases: number;
  /** Meta's rankings against similar ads. Null while Meta answers UNKNOWN. */
  rankings: { quality: string | null; engagement: string | null; conversion: string | null };
}

export interface SliceRow {
  label: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
}

export interface PeriodTotals {
  spendMinor: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchaseValueMinor: number;
  bestDayReach: number;
}

export interface AdsDashboard {
  account: AccountOverview;
  /** Each real Meta account behind the combined Windsor Glow view. */
  accounts: AccountOverview[];
  daily: DailyRow[];
  campaigns: CampaignRow[];
  ads: AdRow[];
  placements: SliceRow[];
  demographics: SliceRow[];
  countries: SliceRow[];
  /** Campaigns in this ad account that belong to another business, by name.
   *  Named rather than silently dropped: hiding them without saying so would
   *  make the page disagree with Ads Manager for no visible reason. */
  otherCampaigns?: string[];
  /** The equal-length window immediately before, for up/down arrows. Absent for 'all'. */
  previous?: PeriodTotals;
  /** The exact days the preset covers, so the chart can show every day, not just the ones with rows. Absent for 'all'. */
  window?: DateWindow;
  previousWindow?: DateWindow;
  /** Day-by-day rows for the window before, for the faint second line. Absent for 'all'. */
  previousDaily?: DailyRow[];
  /** The period's figures by hour of the day, on the ad account's clock. */
  hours?: HourRow[];
}

export interface HourRow {
  hour: number;
  spendMinor: number;
  impressions: number;
  clicks: number;
}

export function isMetaAdsConfigured(): boolean {
  return Boolean(process.env.META_SYSTEM_USER_TOKEN && accountIds().length > 0);
}

// The second Windsor Glow account was created through Meta Business Suite and
// verified read-only on 5 September 2026. It is a public account id, not a
// credential. Keeping it here as the project fallback means the live panel
// starts tracking it with the code deployment even before a new optional
// plural environment setting is added in Vercel. META_ADS_ACCOUNT_IDS remains
// the explicit override for any later account change.
const WINDSOR_GLOW_SECONDARY_ACCOUNT_IDS = ['act_4486863841549073'];

export function accountIds(): string[] {
  const explicit = process.env.META_ADS_ACCOUNT_IDS?.trim();
  const original = process.env.META_ADS_ACCOUNT_ID?.trim();
  const raw = explicit || (original ? [original, ...WINDSOR_GLOW_SECONDARY_ACCOUNT_IDS].join(',') : '');
  return Array.from(new Set(raw.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.startsWith('act_') ? value : `act_${value}`)));
}

function primaryAccountId(): string {
  return accountIds()[0] ?? '';
}

/* ── Whose ads are these ─────────────────────────────────────────────────── */

// The ad account is shared: Kieran boosted posts from more than one business
// out of the same personal account, so a guitar-teaching campaign sits beside
// the Windsor Glow ones. An ad belongs to us when the Page or Instagram
// account it promotes is one of ours. Ids, not names, because a campaign can
// be renamed and a name match would quietly start including the wrong thing.
function ownerIds(): string[] {
  const raw = process.env.META_ADS_OWNER_IDS || process.env.FB_PAGE_ID || '';
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

export interface Ownership {
  campaignIds: string[];
  adIds: Set<string>;
}

// Null means "show everything". That is the deliberate answer whenever we
// cannot be sure: no owners configured, Meta refused the lookup, or nothing
// matched. One extra campaign on the page is a nuisance; a page that has
// silently hidden all the real ads looks like an outage and would be believed.
// One read of the ad list carries everything a card needs to know about an ad
// that is not a number: its status, its picture, what its button says, who it
// was aimed at. Read once per page load and shared with ownership() below.
export interface AdMeta {
  id: string;
  accountId: string;
  name: string;
  campaignId: string;
  effectiveStatus: string;
  createdOn: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  instagramUrl: string | null;
  callToAction: string | null;
  targeting: string | null;
  /** The ad set's schedule and budget, so "running" can be told from "finished". */
  startsOn: string | null;
  endsOn: string | null;
  budget: string | null;
  /** The Page and Instagram ids the creative posts as. Decides whose ad it is. */
  promotes: string[];
  /** Meta's URL parameters. Undefined only for an insight row with no matching ad record. */
  urlTags?: string | null;
}

export async function listAds(act: string = primaryAccountId()): Promise<AdMeta[]> {
  const rows = await graphGetAll(`/${act}/ads`, {
    fields: 'id,name,campaign_id,effective_status,created_time,preview_shareable_link,'
      + 'creative{actor_id,instagram_user_id,thumbnail_url,instagram_permalink_url,call_to_action_type,url_tags},'
      + 'adset{optimization_goal,start_time,end_time,daily_budget,lifetime_budget,targeting{targeting_automation,flexible_spec,age_min,age_max,geo_locations}}',
    limit: '500',
  });
  return rows.map((row) => parseAdMeta(row, act)).filter((a) => a.id);
}

function parseAdMeta(row: Record<string, unknown>, act: string): AdMeta {
  const creative = (row.creative ?? {}) as Record<string, unknown>;
  const adset = (row.adset ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id ?? ''),
    accountId: act,
    name: String(row.name ?? 'Untitled ad'),
    campaignId: String(row.campaign_id ?? ''),
    effectiveStatus: String(row.effective_status ?? ''),
    createdOn: day(row.created_time),
    thumbnailUrl: creative.thumbnail_url ? String(creative.thumbnail_url) : null,
    previewUrl: row.preview_shareable_link ? String(row.preview_shareable_link) : null,
    instagramUrl: creative.instagram_permalink_url ? String(creative.instagram_permalink_url) : null,
    callToAction: ctaLabel(creative.call_to_action_type),
    targeting: targetingLine(adset.targeting as Record<string, unknown> | undefined, adset.optimization_goal),
    startsOn: day(adset.start_time),
    endsOn: day(adset.end_time),
    budget: budgetLine(adset.daily_budget, adset.lifetime_budget),
    promotes: [creative.actor_id, creative.instagram_user_id]
      .map((v) => (v == null ? '' : String(v)))
      .filter(Boolean),
    urlTags: creative.url_tags ? String(creative.url_tags) : null,
  };
}

function hasCampaignTracking(urlTags: string | null | undefined, campaignId: string): boolean | null {
  if (urlTags === undefined) return null;
  if (!urlTags) return false;
  const value = new URLSearchParams(urlTags).get('utm_campaign');
  return value === '{{campaign.id}}' || value === campaignId;
}

const CTA_LABELS: Record<string, string> = {
  SHOP_NOW: 'Shop now', SEE_DETAILS: 'See details', LEARN_MORE: 'Learn more', VIEW_INSTAGRAM_PROFILE: 'View Instagram profile',
  MESSAGE_PAGE: 'Send message', WHATSAPP_MESSAGE: 'WhatsApp', SIGN_UP: 'Sign up', CONTACT_US: 'Contact us', WATCH_MORE: 'Watch more',
  NO_BUTTON: 'No button', LIKE_PAGE: 'Like page', GET_OFFER: 'Get offer', BOOK_TRAVEL: 'Book now', ORDER_NOW: 'Order now',
};

// "£25.00 over the run" or "£5.00 a day". Meta reports budgets in minor units.
function budgetLine(daily: unknown, lifetime: unknown): string | null {
  const d = int(daily);
  const l = int(lifetime);
  if (l > 0) return `£${(l / 100).toFixed(2)} over the run`;
  if (d > 0) return `£${(d / 100).toFixed(2)} a day`;
  return null;
}

function humanise(code: string): string {
  const s = code.toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ctaLabel(v: unknown): string | null {
  const code = String(v ?? '');
  return code ? CTA_LABELS[code] ?? humanise(code) : null;
}

const GOAL_LABELS: Record<string, string> = {
  LINK_CLICKS: 'link clicks', LANDING_PAGE_VIEWS: 'people landing on the site', AUTOMATIC_OBJECTIVE: 'whatever Meta thinks best',
  CONVERSATIONS: 'messages', REACH: 'reaching people', IMPRESSIONS: 'views', OFFSITE_CONVERSIONS: 'sales', VALUE: 'sales value',
  POST_ENGAGEMENT: 'engagement', THRUPLAY: 'video views', PROFILE_VISIT: 'profile visits', PAGE_LIKES: 'page likes',
};

const COUNTRY_NAMES: Record<string, string> = { GB: 'UK', US: 'USA', IE: 'Ireland', AU: 'Australia', CA: 'Canada', NZ: 'New Zealand' };

// "Interests: Weight training, Strength training. Ages 18 to 50. UK. Aiming for
// link clicks." Kieran's experiment is manual targeting against Meta's own, so
// the difference has to be readable at a glance on the card.
function targetingLine(t: Record<string, unknown> | undefined, goal: unknown): string | null {
  if (!t) return null;
  const parts: string[] = [];
  const automation = (t.targeting_automation ?? {}) as Record<string, unknown>;
  const auto = automation.advantage_audience === 1 || automation.advantage_audience === true;
  const interests: string[] = [];
  for (const spec of (t.flexible_spec ?? []) as Record<string, unknown>[]) {
    for (const i of (spec.interests ?? []) as { name?: string }[]) {
      if (i.name) interests.push(i.name.replace(/\s*\([^)]*\)\s*$/, ''));
    }
  }
  if (auto) {
    parts.push(interests.length ? `Meta chooses the audience (Advantage+), starting from ${interests.join(', ')}` : 'Meta chooses the audience (Advantage+)');
  } else if (interests.length) {
    parts.push(`Interests: ${interests.join(', ')}`);
  } else {
    parts.push('No interest targeting');
  }
  if (t.age_min != null || t.age_max != null) parts.push(`Ages ${t.age_min ?? '?'} to ${t.age_max ?? '?'}`);
  const geo = (t.geo_locations ?? {}) as Record<string, unknown>;
  const countries = ((geo.countries ?? []) as unknown[]).map((c) => COUNTRY_NAMES[String(c)] ?? String(c));
  if (countries.length) parts.push(countries.join(', '));
  else if (geo.custom_locations || geo.cities || geo.regions) parts.push('A local area');
  const goalLabel = GOAL_LABELS[String(goal ?? '')];
  if (goalLabel) parts.push(`Aiming for ${goalLabel}`);
  return parts.join('. ') + '.';
}

// Null means "show everything". That is the deliberate answer whenever we
// cannot be sure: no owners configured, Meta refused the lookup, or nothing
// matched. One extra campaign on the page is a nuisance; a page that has
// silently hidden all the real ads looks like an outage and would be believed.
async function ownership(ads?: AdMeta[], act: string = primaryAccountId()): Promise<Ownership | null> {
  const owners = new Set(ownerIds());
  if (owners.size === 0) return null;

  let list: AdMeta[];
  try {
    list = ads ?? await listAds(act);
  } catch {
    return null;
  }

  const campaignIds = new Set<string>();
  const adIds = new Set<string>();
  for (const a of list) {
    if (!a.promotes.some((id) => owners.has(id))) continue;
    adIds.add(a.id);
    if (a.campaignId) campaignIds.add(a.campaignId);
  }
  if (campaignIds.size === 0) return null;
  return { campaignIds: Array.from(campaignIds), adIds };
}

// Meta applies this server side, so spend, impressions and clicks all come
// back already restricted, and reach is recalculated rather than added up
// across campaigns, which would overcount people who saw more than one.
function ownedOnly(own: Ownership | null): Record<string, string> {
  if (!own) return {};
  return {
    filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: own.campaignIds }]),
  };
}

/* ── Dates ───────────────────────────────────────────────────────────────── */

// The ad account's timezone is Europe/London, so "today" must be London's
// today, not the server's (Vercel runs in UTC).
export function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}

export function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface DateWindow { since: string; until: string; }

/** The window a preset means, ending today, plus the equal window before it. */
export function windowsForPreset(preset: Exclude<RangePreset, 'all'>): { current: DateWindow; previous: DateWindow } {
  const today = londonToday();
  const days = PRESET_DAYS[preset];
  const current = { since: shiftDays(today, -(days - 1)), until: today };
  const previous = { since: shiftDays(today, -(2 * days - 1)), until: shiftDays(today, -days) };
  return { current, previous };
}

/* ── Parsing rules ported from the Social Engine ─────────────────────────── */

// Meta returns money as a decimal string in the AD ACCOUNT'S currency, so these
// are minor units of that currency (pence for our GBP account). The account
// overview reports the currency so a mismatch surfaces on screen instead of as
// silently wrong spend.
function toMinorUnits(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function int(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

type ActionRow = { action_type?: string; value?: string };

// A "conversion" is a purchase. Meta reports the same purchase under several
// action_type aliases depending on how it was tracked, and they overlap, so
// taking the largest single matching row avoids double counting one sale.
const PURCHASE_TYPES = [
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'omni_purchase',
  'onsite_web_purchase',
];

function purchases(rows: ActionRow[] | undefined): number {
  if (!rows?.length) return 0;
  return Math.max(0, ...rows
    .filter((r) => PURCHASE_TYPES.includes(r.action_type ?? ''))
    .map((r) => Number(r.value ?? 0))
    .filter((n) => Number.isFinite(n)));
}

function purchaseValue(rows: ActionRow[] | undefined): number {
  if (!rows?.length) return 0;
  const best = Math.max(0, ...rows
    .filter((r) => PURCHASE_TYPES.includes(r.action_type ?? ''))
    .map((r) => Number(r.value ?? 0))
    .filter((n) => Number.isFinite(n)));
  return toMinorUnits(best);
}

function firstActionValue(rows: ActionRow[] | undefined): number {
  if (!rows?.length) return 0;
  return int(rows[0]?.value);
}

function day(v: unknown): string | null {
  const s = String(v ?? '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

// Meta renamed every objective to the OUTCOME_ set, and old campaigns keep the
// old names, so both generations are mapped. Anything unrecognised shows its raw
// name rather than being hidden: a campaign missing from the screen is worse
// than one with an odd label.
const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_AWARENESS: 'Awareness', BRAND_AWARENESS: 'Awareness', REACH: 'Awareness',
  OUTCOME_TRAFFIC: 'Website visits', LINK_CLICKS: 'Website visits',
  OUTCOME_ENGAGEMENT: 'Engagement', POST_ENGAGEMENT: 'Engagement', PAGE_LIKES: 'Engagement',
  OUTCOME_LEADS: 'Leads', LEAD_GENERATION: 'Leads',
  OUTCOME_SALES: 'Sales', CONVERSIONS: 'Sales', PRODUCT_CATALOG_SALES: 'Sales',
  VIDEO_VIEWS: 'Video views', OUTCOME_APP_PROMOTION: 'App promotion',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Running', PAUSED: 'Paused', DELETED: 'Ended', ARCHIVED: 'Ended',
};

/* ── Graph API access ────────────────────────────────────────────────────── */

// A short memory of Meta's answers, per server instance. The ad account is on
// Meta's development access tier, and on 4 Sept 2026 a run of page loads a few
// seconds apart earned "Ad account has too many API calls" (code 17), which
// then blocks every read for a while. Meta's own reporting lags about fifteen
// minutes anyway, so answering the same question twice within two minutes
// from memory loses nothing and protects the whole page. The page shows the
// time the figures were actually read, never the time of the request.
const GRAPH_MEMO_MS = 2 * 60 * 1000;
const graphMemo = new Map<string, { at: number; body: Record<string, unknown> }>();

function memoKey(path: string, params: Record<string, string>): string {
  return `${path}?${Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&')}`;
}

/** When the figures on screen were last actually read from Meta, for this server. */
export function lastGraphReadAt(): string | null {
  let latest = 0;
  for (const m of Array.from(graphMemo.values())) latest = Math.max(latest, m.at);
  return latest ? new Date(latest).toISOString() : null;
}

async function graphGet(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const key = memoKey(path, params);
  const remembered = graphMemo.get(key);
  if (remembered && Date.now() - remembered.at < GRAPH_MEMO_MS) return remembered.body;

  const u = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', process.env.META_SYSTEM_USER_TOKEN || '');
  const res = await fetch(u.toString(), { cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const err = body.error as { message?: string; code?: number; type?: string } | undefined;
  if (!res.ok || err) {
    throw new Error(explainGraphError(err, res.status, path));
  }
  graphMemo.set(key, { at: Date.now(), body });
  if (graphMemo.size > 200) {
    for (const [k, m] of Array.from(graphMemo)) if (Date.now() - m.at >= GRAPH_MEMO_MS) graphMemo.delete(k);
  }
  return body;
}

// Meta's own wording is jargon, and this message is printed straight onto the
// admin page for a non-technical reader. The two failures that actually happen
// are "the token died" and "this token was never given access to that account",
// and each has a different fix, so each gets its own sentence.
function explainGraphError(
  err: { message?: string; code?: number; type?: string } | undefined,
  status: number,
  path = '',
): string {
  const raw = err?.message ?? `request failed (HTTP ${status})`;
  const act = (path.match(/^\/(act_\d+)/)?.[1] ?? primaryAccountId()) || 'the ad account';

  // Code 200 here means the system user has no permission on this ad account.
  if (err?.code === 200 || /has NOT grant|ads_management or ads_read/i.test(raw)) {
    return `This site is not allowed to read ad account ${act} yet. `
      + 'In Meta Business Manager go to Business settings, then Users, then System users, '
      + 'pick the system user this site uses, choose Add assets, then Ad accounts, tick '
      + `${act} and switch on View performance. The figures in Ads Manager are unaffected `
      + 'and nothing has been lost.';
  }

  // 190 is an expired, revoked or password-invalidated token.
  if (err?.code === 190 || /access token/i.test(raw)) {
    return 'The Meta access token has stopped working, usually because a password changed or '
      + 'it was revoked. A new system user token is needed in the site settings. '
      + 'The figures in Ads Manager are unaffected.';
  }

  // 4, 17 and 613 are Meta throttling us. It clears on its own.
  if (err?.code === 4 || err?.code === 17 || err?.code === 613) {
    return 'Meta is limiting how often it will answer just now. This clears by itself, '
      + 'so try again in a few minutes.';
  }

  return `Meta answered with an error (${err?.type ?? status}`
    + `${err?.code ? `, code ${err.code}` : ''}): ${raw}`;
}

// Insights lists can page. A dashboard pull cannot legitimately run past a few
// pages, so the cap is a guard against a runaway loop, not a real limit.
async function graphGetAll(path: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let body = await graphGet(path, params);
  let pages = 0;
  for (;;) {
    rows.push(...(((body.data as Record<string, unknown>[]) ?? [])));
    const next = (body.paging as { next?: string } | undefined)?.next;
    pages += 1;
    if (!next || pages >= 20) return rows;
    const res = await fetch(next, { cache: 'no-store' });
    body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.error) return rows;
  }
}

// Either an explicit window or Meta's own whole-lifetime preset.
function timeParams(range: DateWindow | 'maximum'): Record<string, string> {
  return range === 'maximum'
    ? { date_preset: 'maximum' }
    : { time_range: JSON.stringify({ since: range.since, until: range.until }) };
}

const BASE_FIELDS = ['spend', 'impressions', 'reach', 'clicks', 'actions', 'action_values'];

function parseDaily(rows: Record<string, unknown>[]): DailyRow[] {
  return rows
    .map((row) => ({
      date: day(row.date_start) ?? '',
      spendMinor: toMinorUnits(row.spend),
      impressions: int(row.impressions),
      reach: int(row.reach),
      clicks: int(row.clicks),
      videoViews: firstActionValue(row.video_thruplay_watched_actions as ActionRow[]),
      purchases: purchases(row.actions as ActionRow[]),
      purchaseValueMinor: purchaseValue(row.action_values as ActionRow[]),
    }))
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function totalsOf(daily: DailyRow[]): PeriodTotals {
  const t: PeriodTotals = { spendMinor: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValueMinor: 0, bestDayReach: 0 };
  for (const r of daily) {
    t.spendMinor += r.spendMinor;
    t.impressions += r.impressions;
    t.clicks += r.clicks;
    t.purchases += r.purchases;
    t.purchaseValueMinor += r.purchaseValueMinor;
    t.bestDayReach = Math.max(t.bestDayReach, r.reach);
  }
  return t;
}

async function fetchAccountDaily(
  range: DateWindow | 'maximum',
  own: Ownership | null = null,
  act: string = primaryAccountId(),
): Promise<DailyRow[]> {
  const rows = await graphGetAll(`/${act}/insights`, {
    ...timeParams(range),
    ...ownedOnly(own),
    time_increment: '1',
    level: 'account',
    limit: '500',
    fields: [...BASE_FIELDS, 'video_thruplay_watched_actions', 'date_start'].join(','),
  });
  return parseDaily(rows);
}

export async function fetchAccountOverview(act: string = primaryAccountId()): Promise<AccountOverview> {
  const raw = await graphGet(`/${act}`, {
    fields: 'name,currency,timezone_name,account_status,amount_spent',
  });
  return {
    id: act,
    name: String(raw.name ?? act),
    currency: String(raw.currency ?? ''),
    timezone: String(raw.timezone_name ?? ''),
    // 1 is ACTIVE. Anything else still reads, but the operator should know.
    active: raw.account_status === 1,
    lifetimeSpendMinor: int(raw.amount_spent),
  };
}

/* ── The money: what is left to spend ────────────────────────────────────── */

export interface AdFunds {
  /** spend_cap minus amount_spent, minor units. Null when Meta withheld either field. */
  availableMinor: number | null;
  capMinor: number | null;
  spentMinor: number | null;
  prepay: boolean;
  /** Meta's own words, e.g. "Available balance (£43.37 GBP)". */
  displayString: string | null;
  /** The figure parsed out of displayString, when it carries one. */
  displayMinor: number | null;
  /** True when the computed figure and Meta's own words differ by more than a penny. */
  disagreement: boolean;
  currency: string;
  fetchedAt: string;
  /** Plain-English reason when the figure could not be read. */
  missing?: string;
  /** Accounts that returned a real prepaid balance. Card numbers never count as money. */
  fundedAccountIds?: string[];
  /** The separate funding details behind the Windsor Glow accounts. */
  accounts?: AdAccountFunds[];
}

export interface AdAccountFunds {
  accountId: string;
  accountName: string;
  availableMinor: number | null;
  capMinor: number | null;
  spentMinor: number | null;
  prepay: boolean;
  displayString: string | null;
  displayMinor: number | null;
  disagreement: boolean;
  currency: string;
  fetchedAt: string;
  missing?: string;
}

// The money on a prepay account, two ways that must agree (measured 4 Sept
// 2026): spend_cap - amount_spent is the number, and funding_source_details
// .display_string is Meta's own sentence about the same balance. The number is
// shown; the sentence is the cross-check. If they part company the page says
// so rather than quietly picking one. `balance` is postpaid arrears and is
// always 0 on this account, so it is not read. spend_cap is also the hard
// stop: when amount_spent reaches it the ads stop regardless of the balance,
// which is why "£x available" and "cap reached" are the same warning.
async function fetchAdFundsForAccount(act: string): Promise<AdAccountFunds> {
  const raw = await graphGet(`/${act}`, {
    fields: 'name,spend_cap,amount_spent,funding_source_details,is_prepay_account,currency',
  });
  const currency = String(raw.currency ?? '');
  const fetchedAt = new Date().toISOString();
  const cap = raw.spend_cap == null || raw.spend_cap === '' ? null : int(raw.spend_cap);
  const spent = raw.amount_spent == null || raw.amount_spent === '' ? null : int(raw.amount_spent);
  const details = (raw.funding_source_details ?? null) as { display_string?: unknown } | null;
  const displayString = details?.display_string ? String(details.display_string) : null;
  const displayMinor = parseDisplayMoney(displayString);
  const prepay = raw.is_prepay_account === true;

  const availableMinor = cap !== null && spent !== null && cap > 0 ? Math.max(0, cap - spent) : null;
  const disagreement = availableMinor !== null && displayMinor !== null
    && Math.abs(availableMinor - displayMinor) > 1;

  let missing: string | undefined;
  if (availableMinor === null) {
    missing = displayMinor !== null
      ? 'Meta did not return a spending cap for this account, so the figure is taken from Meta\'s own wording alone.'
      : 'Meta did not return the funds figures for this account, so nothing is shown rather than a guess. The balance inside Ads Manager is unaffected.';
  }

  return {
    accountId: act,
    accountName: String(raw.name ?? act),
    availableMinor, capMinor: cap, spentMinor: spent, prepay,
    displayString, displayMinor, disagreement, currency, fetchedAt,
    ...(missing ? { missing } : {}),
  };
}

export async function fetchAdFunds(): Promise<AdFunds> {
  const ids = accountIds();
  const accounts = await Promise.all(ids.map(fetchAdFundsForAccount));
  if (accounts.length === 1) return accounts[0];

  const currencies = new Set(accounts.map((account) => account.currency).filter(Boolean));
  const sameCurrency = currencies.size <= 1;
  // Only an explicit balance is money. Meta also puts a masked card number in
  // funding_source_details.display_string. Treating "Mastercard *4531" as
  // £4,531 caused the false total this guard is here to prevent.
  const fundedAccounts = accounts.filter((account) =>
    account.availableMinor !== null || account.displayMinor !== null);
  const sum = (values: Array<number | null>) => values.reduce<number>((total, value) => total + (value ?? 0), 0);
  const availableMinor = sameCurrency && fundedAccounts.length > 0
    ? sum(fundedAccounts.map((account) => account.availableMinor ?? account.displayMinor))
    : null;
  const allCaps = fundedAccounts.length > 0 && fundedAccounts.every((account) => account.capMinor !== null);
  const allSpent = fundedAccounts.length > 0 && fundedAccounts.every((account) => account.spentMinor !== null);
  const disagreement = fundedAccounts.some((account) => account.disagreement);

  let missing: string | undefined;
  if (!sameCurrency) {
    missing = 'The Meta accounts use different currencies, so no combined balance is shown.';
  } else if (fundedAccounts.length === 0) {
    missing = 'Meta did not return a prepaid balance for either account, so no number is guessed.';
  } else if (fundedAccounts.length < accounts.length) {
    missing = 'This is the real prepaid balance. The other account is billed to its payment card, so its card number is not added as money.';
  }

  return {
    availableMinor,
    capMinor: allCaps ? sum(fundedAccounts.map((account) => account.capMinor)) : null,
    spentMinor: allSpent ? sum(fundedAccounts.map((account) => account.spentMinor)) : null,
    prepay: fundedAccounts.length > 0 && fundedAccounts.every((account) => account.prepay),
    displayString: null,
    displayMinor: null,
    disagreement,
    currency: accounts.find((account) => account.currency)?.currency ?? '',
    fetchedAt: accounts.reduce((latest, account) => account.fetchedAt > latest ? account.fetchedAt : latest, ''),
    fundedAccountIds: fundedAccounts.map((account) => account.accountId),
    accounts,
    ...(missing ? { missing } : {}),
  };
}

// "Available balance (£43.37 GBP)" -> 4337. Meta uses the same field for
// masked payment cards, so it must say "available balance" before any digits
// are accepted. This prevents "Mastercard *4531" becoming £4,531.
export function parseDisplayMoney(text: string | null): number | null {
  if (!text || !/\bavailable\s+balance\b/i.test(text)) return null;
  const m = text.match(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/);
  if (!m) return null;
  const whole = Number(m[1].replace(/,/g, ''));
  const frac = m[2] ? Number((m[2] + '0').slice(0, 2)) : 0;
  return Number.isFinite(whole) ? whole * 100 + frac : null;
}

/* ── The dashboard read ──────────────────────────────────────────────────── */

async function fetchAdsDashboardForAccount(preset: RangePreset, act: string): Promise<AdsDashboard> {
  const range: DateWindow | 'maximum' = preset === 'all' ? 'maximum' : windowsForPreset(preset).current;

  // Which ads are ours has to be settled before anything is measured, so that
  // the tiles at the top and the campaign table below can never disagree. The
  // ad list is read once here and reused for the cards.
  // If the ad list cannot be read, fail the refresh. Falling back to insight
  // rows would silently omit running ads that have not spent yet.
  const adList = await listAds(act);
  const own = await ownership(adList.length ? adList : undefined, act);
  const mine = ownedOnly(own);

  const [account, campaignListRaw, daily, campaignInsightsRaw, adInsightsRaw,
    placementRaw, demographicRaw, countryRaw, previousDaily, hourlyRaw] = await Promise.all([
    fetchAccountOverview(act),
    graphGetAll(`/${act}/campaigns`, {
      // Budgets too: a boosted post keeps its budget on the campaign, not the ad set.
      fields: 'id,name,status,objective,start_time,created_time,daily_budget,lifetime_budget',
      limit: '200',
    }),
    fetchAccountDaily(range, own, act),
    graphGetAll(`/${act}/insights`, {
      ...timeParams(range),
      ...mine,
      level: 'campaign',
      limit: '200',
      fields: [...BASE_FIELDS, 'campaign_id'].join(','),
    }),
    graphGetAll(`/${act}/insights`, {
      ...timeParams(range),
      ...mine,
      level: 'ad',
      limit: '200',
      fields: [...BASE_FIELDS, 'frequency', 'inline_link_clicks', 'video_thruplay_watched_actions',
        'quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking',
        'ad_id', 'ad_name', 'campaign_id', 'campaign_name'].join(','),
    }),
    graphGetAll(`/${act}/insights`, {
      ...timeParams(range),
      ...mine,
      breakdowns: 'publisher_platform,platform_position',
      limit: '200',
      fields: 'spend,impressions,clicks',
    }),
    graphGetAll(`/${act}/insights`, {
      ...timeParams(range),
      ...mine,
      breakdowns: 'age,gender',
      limit: '200',
      fields: 'spend,impressions,clicks',
    }),
    graphGetAll(`/${act}/insights`, {
      ...timeParams(range),
      ...mine,
      breakdowns: 'country',
      limit: '200',
      fields: 'spend,impressions,clicks',
    }),
    preset === 'all' ? Promise.resolve(null) : fetchAccountDaily(windowsForPreset(preset).previous, own, act),
    // By hour of the day, on the account's clock (London). Verified on this
    // account on 4 Sept 2026. A refusal leaves the timing card empty rather
    // than failing the page.
    graphGetAll(`/${act}/insights`, {
      ...timeParams(range),
      ...mine,
      breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
      limit: '200',
      fields: 'spend,impressions,clicks',
    }).catch((): Record<string, unknown>[] => []),
  ]);

  const hours: HourRow[] = hourlyRaw
    .map((r) => ({
      hour: Number(String(r.hourly_stats_aggregated_by_advertiser_time_zone ?? '').slice(0, 2)),
      spendMinor: toMinorUnits(r.spend),
      impressions: int(r.impressions),
      clicks: int(r.clicks),
    }))
    .filter((h) => Number.isInteger(h.hour) && h.hour >= 0 && h.hour < 24)
    .sort((a, b) => a.hour - b.hour);

  // Every campaign appears, even with zero delivery in the range. A paused
  // campaign that vanished from the screen would read as deleted.
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of campaignInsightsRaw) byId.set(String(row.campaign_id ?? ''), row);
  // A campaign belongs to somebody else only when it has ads and none of them
  // are ours. A campaign with no ads at all stays, because there is nothing to
  // judge it by and it cannot have spent anything.
  const ourCampaignIds = own ? new Set(own.campaignIds) : null;
  const otherCampaigns = ourCampaignIds
    ? campaignListRaw
      .filter((c) => c.id && !ourCampaignIds.has(String(c.id)))
      .map((c) => String(c.name ?? 'Untitled campaign'))
    : [];

  const campaigns: CampaignRow[] = campaignListRaw
    .filter((c) => !ourCampaignIds || ourCampaignIds.has(String(c.id ?? '')))
    .map((c) => {
      const ins = byId.get(String(c.id ?? ''));
      return {
        id: String(c.id ?? ''),
        accountId: act,
        name: String(c.name ?? 'Untitled campaign'),
        status: STATUS_LABELS[String(c.status ?? '')] ?? 'Draft',
        objective: OBJECTIVE_LABELS[String(c.objective ?? '')] ?? String(c.objective ?? 'Unknown'),
        startedOn: day(c.start_time ?? c.created_time),
        spendMinor: toMinorUnits(ins?.spend),
        impressions: int(ins?.impressions),
        reach: int(ins?.reach),
        clicks: int(ins?.clicks),
        purchases: purchases(ins?.actions as ActionRow[]),
        purchaseValueMinor: purchaseValue(ins?.action_values as ActionRow[]),
      };
    })
    .filter((c) => c.id)
    .sort((a, b) => b.spendMinor - a.spendMinor);

  // Every owned ad gets a row, even with nothing delivered in the range: a
  // paused ad that vanished from the cards would read as deleted. Running ads
  // first, then biggest spend.
  const insightsByAd = new Map<string, Record<string, unknown>>();
  for (const row of adInsightsRaw) if (row.ad_id) insightsByAd.set(String(row.ad_id), row);
  const campaignNameById = new Map(campaignListRaw.map((c) => [String(c.id ?? ''), String(c.name ?? '')]));
  const campaignBudgetById = new Map(campaignListRaw.map((c) => [String(c.id ?? ''), budgetLine(c.daily_budget, c.lifetime_budget)]));
  const seen = new Set<string>();
  const ads: AdRow[] = [];
  for (const meta of adList.filter((a) => !own || own.adIds.has(a.id))) {
    seen.add(meta.id);
    ads.push(adRowFrom(meta, insightsByAd.get(meta.id), campaignNameById, campaignBudgetById));
  }
  for (const [id, row] of Array.from(insightsByAd)) {
    if (seen.has(id)) continue;
    ads.push(adRowFrom({
      id, accountId: act, name: String(row.ad_name ?? 'Untitled ad'), campaignId: String(row.campaign_id ?? ''),
      effectiveStatus: '', createdOn: null, thumbnailUrl: null, previewUrl: null, instagramUrl: null,
      callToAction: null, targeting: null, startsOn: null, endsOn: null, budget: null, promotes: [],
      urlTags: undefined,
    }, row, campaignNameById, campaignBudgetById));
  }
  ads.sort((a, b) => Number(b.running) - Number(a.running) || b.spendMinor - a.spendMinor);

  return {
    account,
    accounts: [account],
    daily,
    campaigns,
    ads,
    placements: slice(placementRaw, placementLabel),
    demographics: slice(demographicRaw, demographicLabel),
    countries: slice(countryRaw, (r) => String(r.country ?? 'Unknown')),
    ...(otherCampaigns.length ? { otherCampaigns } : {}),
    ...(previousDaily ? { previous: totalsOf(previousDaily), previousDaily } : {}),
    ...(preset !== 'all' ? { window: windowsForPreset(preset).current, previousWindow: windowsForPreset(preset).previous } : {}),
    hours,
  };
}

function mergeDaily(groups: DailyRow[][]): DailyRow[] {
  const merged = new Map<string, DailyRow>();
  for (const row of groups.flat()) {
    const prior = merged.get(row.date);
    merged.set(row.date, prior ? {
      date: row.date,
      spendMinor: prior.spendMinor + row.spendMinor,
      impressions: prior.impressions + row.impressions,
      reach: prior.reach + row.reach,
      clicks: prior.clicks + row.clicks,
      videoViews: prior.videoViews + row.videoViews,
      purchases: prior.purchases + row.purchases,
      purchaseValueMinor: prior.purchaseValueMinor + row.purchaseValueMinor,
    } : { ...row });
  }
  return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function mergeSlices(groups: SliceRow[][]): SliceRow[] {
  const merged = new Map<string, SliceRow>();
  for (const row of groups.flat()) {
    const prior = merged.get(row.label);
    merged.set(row.label, prior ? {
      label: row.label,
      spendMinor: prior.spendMinor + row.spendMinor,
      impressions: prior.impressions + row.impressions,
      clicks: prior.clicks + row.clicks,
    } : { ...row });
  }
  return Array.from(merged.values()).sort((a, b) => b.spendMinor - a.spendMinor);
}

function mergeHours(groups: HourRow[][]): HourRow[] {
  const merged = new Map<number, HourRow>();
  for (const row of groups.flat()) {
    const prior = merged.get(row.hour);
    merged.set(row.hour, prior ? {
      hour: row.hour,
      spendMinor: prior.spendMinor + row.spendMinor,
      impressions: prior.impressions + row.impressions,
      clicks: prior.clicks + row.clicks,
    } : { ...row });
  }
  return Array.from(merged.values()).sort((a, b) => a.hour - b.hour);
}

function combinedAccount(accounts: AccountOverview[]): AccountOverview {
  const first = accounts[0];
  if (!first) throw new Error('No Meta ad account is configured.');
  const currencies = new Set(accounts.map((account) => account.currency).filter(Boolean));
  if (currencies.size > 1) throw new Error('The configured Meta ad accounts use different currencies, so their money cannot be combined safely.');
  return {
    id: first.id,
    name: accounts.length === 1 ? first.name : `Windsor Glow (${accounts.length} Meta ad accounts)`,
    currency: first.currency,
    timezone: first.timezone,
    active: accounts.every((account) => account.active),
    lifetimeSpendMinor: accounts.reduce((total, account) => total + account.lifetimeSpendMinor, 0),
  };
}

export async function fetchAdsDashboard(preset: RangePreset): Promise<AdsDashboard> {
  const dashboards = await Promise.all(accountIds().map((act) => fetchAdsDashboardForAccount(preset, act)));
  if (dashboards.length === 1) return dashboards[0];

  const accounts = dashboards.map((dashboard) => dashboard.account);
  const previousDaily = preset === 'all'
    ? undefined
    : mergeDaily(dashboards.map((dashboard) => dashboard.previousDaily ?? []));
  const campaigns = dashboards.flatMap((dashboard) => dashboard.campaigns)
    .sort((a, b) => b.spendMinor - a.spendMinor);
  const ads = dashboards.flatMap((dashboard) => dashboard.ads)
    .sort((a, b) => Number(b.running) - Number(a.running) || b.spendMinor - a.spendMinor);

  return {
    account: combinedAccount(accounts),
    accounts,
    daily: mergeDaily(dashboards.map((dashboard) => dashboard.daily)),
    campaigns,
    ads,
    placements: mergeSlices(dashboards.map((dashboard) => dashboard.placements)),
    demographics: mergeSlices(dashboards.map((dashboard) => dashboard.demographics)),
    countries: mergeSlices(dashboards.map((dashboard) => dashboard.countries)),
    otherCampaigns: Array.from(new Set(dashboards.flatMap((dashboard) => dashboard.otherCampaigns ?? []))),
    ...(previousDaily ? { previousDaily, previous: totalsOf(previousDaily) } : {}),
    ...(preset !== 'all' ? {
      window: windowsForPreset(preset).current,
      previousWindow: windowsForPreset(preset).previous,
    } : {}),
    hours: mergeHours(dashboards.map((dashboard) => dashboard.hours ?? [])),
  };
}

const EFFECTIVE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Running', PAUSED: 'Paused', CAMPAIGN_PAUSED: 'Paused', ADSET_PAUSED: 'Paused',
  PENDING_REVIEW: 'In review', DISAPPROVED: 'Rejected by Meta', WITH_ISSUES: 'Flagged by Meta',
  PREAPPROVED: 'Approved, not yet running', PENDING_BILLING_INFO: 'Waiting for billing details',
  IN_PROCESS: 'Starting up', ARCHIVED: 'Ended', DELETED: 'Ended', CAMPAIGN_GROUP_PAUSED: 'Paused',
};

const RANKING_LABELS: Record<string, string> = {
  ABOVE_AVERAGE: 'Above average', AVERAGE: 'Average',
  BELOW_AVERAGE_10: 'Bottom 10%', BELOW_AVERAGE_20: 'Bottom 20%', BELOW_AVERAGE_35: 'Bottom 35%',
};

// Null while Meta says UNKNOWN: it withholds rankings until an ad has enough
// volume, and an empty box would read as "bad" rather than "not yet".
function ranking(v: unknown): string | null {
  const s = String(v ?? '');
  return !s || s === 'UNKNOWN' ? null : RANKING_LABELS[s] ?? humanise(s);
}

function adRowFrom(
  meta: AdMeta,
  ins: Record<string, unknown> | undefined,
  campaignNames: Map<string, string>,
  campaignBudgets: Map<string, string | null> = new Map(),
): AdRow {
  const actions = (ins?.actions ?? []) as ActionRow[];
  const action = (type: string) => int(actions.find((a) => a.action_type === type)?.value);
  const finished = Boolean(meta.endsOn && meta.endsOn < londonToday());
  return {
    id: meta.id,
    accountId: meta.accountId,
    name: meta.name,
    campaignId: meta.campaignId,
    campaignName: String(ins?.campaign_name ?? campaignNames.get(meta.campaignId) ?? ''),
    // Meta keeps a boosted post ACTIVE after its schedule has ended, which is
    // how a "running" ad came to have spent nothing for a week. Past the end
    // date it is finished, and the page says so.
    status: finished ? 'Finished' : EFFECTIVE_STATUS_LABELS[meta.effectiveStatus] ?? (meta.effectiveStatus ? humanise(meta.effectiveStatus) : 'Unknown'),
    running: meta.effectiveStatus === 'ACTIVE' && !finished,
    startsOn: meta.startsOn,
    endsOn: meta.endsOn,
    budget: meta.budget ?? campaignBudgets.get(meta.campaignId) ?? null,
    createdOn: meta.createdOn,
    thumbnailUrl: meta.thumbnailUrl,
    previewUrl: meta.previewUrl,
    instagramUrl: meta.instagramUrl,
    callToAction: meta.callToAction,
    targeting: meta.targeting,
    websiteTracking: hasCampaignTracking(meta.urlTags, meta.campaignId),
    spendMinor: toMinorUnits(ins?.spend),
    impressions: int(ins?.impressions),
    reach: int(ins?.reach),
    frequency: Number(ins?.frequency ?? 0) || 0,
    clicks: int(ins?.clicks),
    linkClicks: int(ins?.inline_link_clicks),
    landingPageViews: action('landing_page_view'),
    comments: action('comment'),
    engagement: action('post_engagement'),
    videoViews: firstActionValue(ins?.video_thruplay_watched_actions as ActionRow[] | undefined),
    purchases: purchases(actions),
    rankings: {
      quality: ranking(ins?.quality_ranking),
      engagement: ranking(ins?.engagement_rate_ranking),
      conversion: ranking(ins?.conversion_rate_ranking),
    },
  };
}

function slice(rows: Record<string, unknown>[], label: (r: Record<string, unknown>) => string): SliceRow[] {
  return rows
    .map((r) => ({
      label: label(r),
      spendMinor: toMinorUnits(r.spend),
      impressions: int(r.impressions),
      clicks: int(r.clicks),
    }))
    .filter((s) => s.impressions > 0 || s.spendMinor > 0)
    .sort((a, b) => b.spendMinor - a.spendMinor || b.impressions - a.impressions);
}

const PLATFORMS: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger',
  audience_network: 'Partner apps', threads: 'Threads',
};
const GENDERS: Record<string, string> = { male: 'men', female: 'women', unknown: 'unknown' };

function placementLabel(r: Record<string, unknown>): string {
  const platform = PLATFORMS[String(r.publisher_platform ?? '')] ?? String(r.publisher_platform ?? 'Other');
  const position = String(r.platform_position ?? '').replace(/^facebook_|^instagram_/, '').replace(/_/g, ' ');
  return position && position !== 'unknown' ? `${platform}, ${position}` : platform;
}

function demographicLabel(r: Record<string, unknown>): string {
  const age = String(r.age ?? '');
  const gender = GENDERS[String(r.gender ?? '')] ?? String(r.gender ?? '');
  return `${age} ${gender}`.trim() || 'Unknown';
}

/* ── Per-ad series for the comparison chart ──────────────────────────────── */

export type CompareRange = 'today' | '24h' | '3d' | '7d' | 'all';

export interface SeriesCell {
  spendMinor: number;
  impressions: number;
  /** Null by the hour: Meta does not report reach with the hourly breakdown. */
  reach: number | null;
  clicks: number;
  linkClicks: number;
  comments: number;
  engagement: number;
  /** Orders from our own records, filled in by the compare route. */
  orders: number;
}

export interface SeriesPoint {
  /** 'YYYY-MM-DD' for days, 'YYYY-MM-DD HH' (London time) for hours. */
  key: string;
  label: string;
  byAd: Record<string, SeriesCell>;
}

export interface AdSeries {
  granularity: 'hour' | 'day';
  since: string;
  ads: { id: string; accountId: string; name: string; campaignId: string; running: boolean; spendMinor: number }[];
  points: SeriesPoint[];
  note?: string;
}

const blankCell = (): SeriesCell => ({
  spendMinor: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, comments: 0, engagement: 0, orders: 0,
});

function londonHourNow(): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
  return Number(h) % 24;
}

// Each ad's figures in hourly (today, last 24 hours) or daily (3 days, 7 days,
// the whole run) buckets, gap-filled with zeros so nothing is drawn on an hour
// or a day that nothing ran. The hourly breakdown was verified on this account
// on 4 Sept 2026; it does not carry reach, so reach is null by the hour and the
// chart says so.
async function fetchAdSeriesForAccount(range: CompareRange, act: string): Promise<AdSeries> {
  const adList = await listAds(act);
  const own = await ownership(adList.length ? adList : undefined, act);
  const mine = ownedOnly(own);
  const today = londonToday();
  const hourly = range === 'today' || range === '24h';

  const since = range === 'today' ? today
    : range === '24h' ? shiftDays(today, -1)
    : range === '3d' ? shiftDays(today, -2)
    : range === '7d' ? shiftDays(today, -6)
    : null;
  const time = since ? timeParams({ since, until: today }) : timeParams('maximum');

  const rows = await graphGetAll(`/${act}/insights`, {
    ...time,
    ...mine,
    level: 'ad',
    time_increment: '1',
    limit: '500',
    ...(hourly ? { breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone' } : {}),
    fields: ['spend', 'impressions', ...(hourly ? [] : ['reach']), 'clicks', 'inline_link_clicks', 'actions',
      'ad_id', 'ad_name', 'campaign_id', 'date_start'].join(','),
  });

  // Every owned ad is a candidate line, even one with nothing in the window,
  // so a paused ad marked B still draws (flat) rather than vanishing.
  const adsOut = new Map<string, AdSeries['ads'][number]>();
  for (const a of adList.filter((x) => !own || own.adIds.has(x.id))) {
    adsOut.set(a.id, { id: a.id, accountId: act, name: a.name, campaignId: a.campaignId, running: a.effectiveStatus === 'ACTIVE' && !(a.endsOn && a.endsOn < today), spendMinor: 0 });
  }

  const cells = new Map<string, Map<string, SeriesCell>>();
  let firstKey: string | null = null;
  for (const r of rows) {
    const date = day(r.date_start);
    const adId = String(r.ad_id ?? '');
    if (!date || !adId) continue;
    const hour = hourly ? String(r.hourly_stats_aggregated_by_advertiser_time_zone ?? '').slice(0, 2) : '';
    if (hourly && !/^\d\d$/.test(hour)) continue;
    const key = hourly ? `${date} ${hour}` : date;
    if (!adsOut.has(adId)) {
      adsOut.set(adId, { id: adId, accountId: act, name: String(r.ad_name ?? 'Untitled ad'), campaignId: String(r.campaign_id ?? ''), running: false, spendMinor: 0 });
    }
    const actions = (r.actions ?? []) as ActionRow[];
    const action = (type: string) => int(actions.find((a) => a.action_type === type)?.value);
    const cell: SeriesCell = {
      spendMinor: toMinorUnits(r.spend), impressions: int(r.impressions), reach: hourly ? null : int(r.reach),
      clicks: int(r.clicks), linkClicks: int(r.inline_link_clicks),
      comments: action('comment'), engagement: action('post_engagement'), orders: 0,
    };
    const bucket = cells.get(key) ?? new Map<string, SeriesCell>();
    const prior = bucket.get(adId);
    bucket.set(adId, prior ? {
      ...cell,
      spendMinor: prior.spendMinor + cell.spendMinor, impressions: prior.impressions + cell.impressions,
      reach: hourly ? null : (prior.reach ?? 0) + (cell.reach ?? 0), clicks: prior.clicks + cell.clicks,
      linkClicks: prior.linkClicks + cell.linkClicks, comments: prior.comments + cell.comments, engagement: prior.engagement + cell.engagement,
    } : cell);
    cells.set(key, bucket);
    const summary = adsOut.get(adId);
    if (summary) summary.spendMinor += cell.spendMinor;
    if (!firstKey || key < firstKey) firstKey = key;
  }

  const keys: string[] = [];
  if (hourly) {
    const nowHour = londonHourNow();
    const back = range === 'today' ? nowHour : 23;
    for (let i = back; i >= 0; i--) {
      const h = nowHour - i;
      const date = h < 0 ? shiftDays(today, -1) : today;
      keys.push(`${date} ${String(((h % 24) + 24) % 24).padStart(2, '0')}`);
    }
  } else {
    const start = since ?? (firstKey ? firstKey.slice(0, 10) : today);
    for (let d = start; d <= today; d = shiftDays(d, 1)) keys.push(d);
  }

  const ads = Array.from(adsOut.values());
  const points: SeriesPoint[] = keys.map((key) => {
    const bucket = cells.get(key);
    const byAd: Record<string, SeriesCell> = {};
    for (const a of ads) byAd[a.id] = { ...(bucket?.get(a.id) ?? blankCell()), ...(hourly ? { reach: null } : {}) };
    return { key, label: hourly ? `${key.slice(11)}:00` : key, byAd };
  });

  return {
    granularity: hourly ? 'hour' : 'day',
    since: keys[0]?.slice(0, 10) ?? today,
    ads,
    points,
    ...(hourly ? { note: 'Reach is not reported by the hour, so it is left out of the hourly views.' } : {}),
  };
}

export async function fetchAdSeries(range: CompareRange): Promise<AdSeries> {
  const series = await Promise.all(accountIds().map((act) => fetchAdSeriesForAccount(range, act)));
  if (series.length === 1) return series[0];

  const ads = series.flatMap((item) => item.ads);
  const keys = Array.from(new Set(series.flatMap((item) => item.points.map((point) => point.key)))).sort();
  const pointsBySeries = series.map((item) => new Map(item.points.map((point) => [point.key, point])));
  const hourly = series[0]?.granularity === 'hour';
  const points: SeriesPoint[] = keys.map((key) => {
    const byAd: Record<string, SeriesCell> = {};
    for (const ad of ads) byAd[ad.id] = { ...blankCell(), ...(hourly ? { reach: null } : {}) };
    for (const pointMap of pointsBySeries) {
      const point = pointMap.get(key);
      if (point) Object.assign(byAd, point.byAd);
    }
    return { key, label: hourly ? `${key.slice(11)}:00` : key, byAd };
  });

  return {
    granularity: hourly ? 'hour' : 'day',
    since: keys[0]?.slice(0, 10) ?? londonToday(),
    ads,
    points,
    ...(hourly ? { note: 'Reach is not reported by the hour, so it is left out of the hourly views.' } : {}),
  };
}

/* ── The daily snapshot the cron stores ──────────────────────────────────── */

export interface SnapshotData {
  account: AccountOverview;
  accountDaily: DailyRow[];
  campaignDaily: { date: string; id: string; name: string; row: DailyRow }[];
  adDaily: { date: string; id: string; name: string; campaignName: string; row: DailyRow }[];
  sliceDaily: { date: string; dimension: 'placement' | 'agegender' | 'country'; label: string; spendMinor: number; impressions: number; clicks: number }[];
  campaignInfo: Map<string, { status: string; objective: string }>;
}

async function fetchSnapshotForAccount(window: DateWindow, act: string): Promise<SnapshotData> {
  const own = await ownership(undefined, act);
  const mine = ownedOnly(own);

  const [account, campaignListRaw, accountDailyRaw, campaignDailyRaw, adDailyRaw,
    placementRaw, demographicRaw, countryRaw] = await Promise.all([
    fetchAccountOverview(act),
    graphGetAll(`/${act}/campaigns`, { fields: 'id,name,status,objective', limit: '200' }),
    fetchAccountDaily(window, own, act),
    graphGetAll(`/${act}/insights`, {
      ...timeParams(window), ...mine, time_increment: '1', level: 'campaign', limit: '500',
      fields: [...BASE_FIELDS, 'video_thruplay_watched_actions', 'campaign_id', 'campaign_name', 'date_start'].join(','),
    }),
    graphGetAll(`/${act}/insights`, {
      ...timeParams(window), ...mine, time_increment: '1', level: 'ad', limit: '500',
      fields: [...BASE_FIELDS, 'video_thruplay_watched_actions', 'ad_id', 'ad_name', 'campaign_name', 'date_start'].join(','),
    }),
    graphGetAll(`/${act}/insights`, {
      ...timeParams(window), ...mine, time_increment: '1', breakdowns: 'publisher_platform,platform_position',
      limit: '500', fields: 'spend,impressions,clicks,date_start',
    }),
    graphGetAll(`/${act}/insights`, {
      ...timeParams(window), ...mine, time_increment: '1', breakdowns: 'age,gender',
      limit: '500', fields: 'spend,impressions,clicks,date_start',
    }),
    graphGetAll(`/${act}/insights`, {
      ...timeParams(window), ...mine, time_increment: '1', breakdowns: 'country',
      limit: '500', fields: 'spend,impressions,clicks,date_start',
    }),
  ]);

  const campaignInfo = new Map<string, { status: string; objective: string }>();
  for (const c of campaignListRaw) {
    campaignInfo.set(String(c.id ?? ''), {
      status: STATUS_LABELS[String(c.status ?? '')] ?? 'Draft',
      objective: OBJECTIVE_LABELS[String(c.objective ?? '')] ?? String(c.objective ?? 'Unknown'),
    });
  }

  const oneDaily = (row: Record<string, unknown>): DailyRow => parseDaily([row])[0];

  const sliceOf = (rows: Record<string, unknown>[], dimension: 'placement' | 'agegender' | 'country',
    label: (r: Record<string, unknown>) => string) =>
    rows
      .filter((r) => day(r.date_start))
      .map((r) => ({
        date: day(r.date_start) as string,
        dimension,
        label: label(r),
        spendMinor: toMinorUnits(r.spend),
        impressions: int(r.impressions),
        clicks: int(r.clicks),
      }))
      .filter((s) => s.impressions > 0 || s.spendMinor > 0);

  return {
    account,
    accountDaily: accountDailyRaw,
    campaignDaily: campaignDailyRaw
      .filter((r) => day(r.date_start) && r.campaign_id)
      .map((r) => ({
        date: day(r.date_start) as string,
        id: String(r.campaign_id),
        name: String(r.campaign_name ?? ''),
        row: oneDaily(r),
      }))
      .filter((r) => r.row),
    adDaily: adDailyRaw
      .filter((r) => day(r.date_start) && r.ad_id)
      .map((r) => ({
        date: day(r.date_start) as string,
        id: String(r.ad_id),
        name: String(r.ad_name ?? ''),
        campaignName: String(r.campaign_name ?? ''),
        row: oneDaily(r),
      }))
      .filter((r) => r.row),
    sliceDaily: [
      ...sliceOf(placementRaw, 'placement', placementLabel),
      ...sliceOf(demographicRaw, 'agegender', demographicLabel),
      ...sliceOf(countryRaw, 'country', (r) => String(r.country ?? 'Unknown')),
    ],
    campaignInfo,
  };
}

export async function fetchSnapshot(window: DateWindow): Promise<SnapshotData> {
  const snapshots = await Promise.all(accountIds().map((act) => fetchSnapshotForAccount(window, act)));
  if (snapshots.length === 1) return snapshots[0];

  const sliceMap = new Map<string, SnapshotData['sliceDaily'][number]>();
  for (const row of snapshots.flatMap((snapshot) => snapshot.sliceDaily)) {
    const key = `${row.date}|${row.dimension}|${row.label}`;
    const prior = sliceMap.get(key);
    sliceMap.set(key, prior ? {
      ...row,
      spendMinor: prior.spendMinor + row.spendMinor,
      impressions: prior.impressions + row.impressions,
      clicks: prior.clicks + row.clicks,
    } : { ...row });
  }
  const campaignInfo = new Map<string, { status: string; objective: string }>();
  for (const snapshot of snapshots) {
    for (const [id, info] of Array.from(snapshot.campaignInfo)) campaignInfo.set(id, info);
  }

  return {
    account: combinedAccount(snapshots.map((snapshot) => snapshot.account)),
    accountDaily: mergeDaily(snapshots.map((snapshot) => snapshot.accountDaily)),
    campaignDaily: snapshots.flatMap((snapshot) => snapshot.campaignDaily),
    adDaily: snapshots.flatMap((snapshot) => snapshot.adDaily),
    sliceDaily: Array.from(sliceMap.values()),
    campaignInfo,
  };
}

/* ── Delivery problems worth an alert ────────────────────────────────────── */

export interface DeliveryIssue {
  adId: string;
  adName: string;
  effectiveStatus: string;
}

// An ad Meta has rejected or flagged. effective_status folds in the review
// outcome, which plain status does not.
async function fetchDeliveryIssuesForAccount(act: string): Promise<DeliveryIssue[]> {
  const [own, rows] = await Promise.all([
    ownership(undefined, act),
    graphGetAll(`/${act}/ads`, {
      fields: 'id,name,effective_status',
      limit: '200',
    }),
  ]);
  return rows
    .filter((r) => !own || own.adIds.has(String(r.id ?? '')))
    .map((r) => ({
      adId: String(r.id ?? ''),
      adName: String(r.name ?? 'Untitled ad'),
      effectiveStatus: String(r.effective_status ?? ''),
    }))
    .filter((r) => r.adId && ['DISAPPROVED', 'WITH_ISSUES'].includes(r.effectiveStatus));
}

export async function fetchDeliveryIssues(): Promise<DeliveryIssue[]> {
  return (await Promise.all(accountIds().map(fetchDeliveryIssuesForAccount))).flat();
}
