'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AdFunds, AdRow, HourRow } from '@/lib/ads/meta';
import type { FunnelRow, LandingReport, OrderStats, VisitorScope } from '@/lib/ads/store';
import type { CreativeLink } from '@/lib/ads/labels';
import { fillDays, fillMissingDays } from '@/lib/ads/chart';

// The one read behind every Ad Results page. The provider lives in the ads
// layout, so moving between the Dashboard, A and B, All ads and the rest keeps
// the same figures on hand and never asks Meta again just for a tab change.
// Everything the old single page computed (filled days, totals, the till by
// campaign) is computed once here and handed to whichever page needs it.
//
// Honest live behaviour (ADSLAB item 6) lives here too: when the figures were
// read, one manual refresh at a time and never more often than every five
// minutes (Meta's own reporting lags about fifteen), and a failed refresh keeps
// the last good figures on screen rather than blanking the page.

export type RangePreset = '7d' | '28d' | '90d' | 'all';

export const RANGE_LABELS: Record<RangePreset, string> = {
  '7d': 'Last 7 days',
  '28d': 'Last 28 days',
  '90d': 'Last 90 days',
  all: 'All time',
};

// Which visitors the after-the-click figures count (ADSLAB item 15). The words
// are the switch on the page, so they have to say what they mean on their own.
export const VISITOR_LABELS: Record<VisitorScope, string> = {
  new: 'People who were not members',
  all: 'Everybody',
};

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
  status: string;
  objective: string;
  startedOn: string | null;
  spendMinor: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  purchaseValueMinor: number;
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

export interface TillRow {
  utm_campaign: string;
  visits: number;
  people: number;
  orders: number;
  revenue_minor: number;
}

export interface Signal {
  kind: 'fact' | 'warning' | 'note';
  text: string;
  solid: boolean;
}

export interface DeliveryIssue {
  adId: string;
  adName: string;
  effectiveStatus: string;
}

export interface AdviceRecord {
  advice: string;
  model: string | null;
  created_at: string;
}

export interface AdsResponse {
  configured: boolean;
  detail?: string;
  error?: string;
  account?: AccountOverview;
  accounts?: AccountOverview[];
  daily?: DailyRow[];
  campaigns?: CampaignRow[];
  ads?: AdRow[];
  placements?: SliceRow[];
  demographics?: SliceRow[];
  countries?: SliceRow[];
  otherCampaigns?: string[];
  previous?: PeriodTotals;
  till?: TillRow[];
  creativeLinks?: Record<string, CreativeLink>;
  signals?: Signal[];
  latestAdvice?: AdviceRecord | null;
  deliveryIssues?: DeliveryIssue[];
  funds?: AdFunds | null;
  funnel?: FunnelRow[];
  orders?: OrderStats | null;
  landing?: LandingReport;
  /** Plain-English names for the page addresses in the landing report. */
  pageNames?: Record<string, string>;
  /** Which visitors the after-the-click figures counted. */
  visitors?: VisitorScope;
  window?: { since: string; until: string };
  previousWindow?: { since: string; until: string };
  previousDaily?: DailyRow[];
  hours?: HourRow[];
  fetchedAt?: string;
}

// The exact tags to paste once into each campaign's "URL parameters" box in
// Meta Ads Manager. Meta fills in the ids per ad on its own.
export const LINK_TAGS = 'utm_source=meta&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}';

// Deep links into Meta's own Ads Manager. The account id needs its act_ prefix
// stripped for these addresses.
export function adsManagerUrl(accountId: string, kind: 'campaigns' | 'ads' = 'campaigns', selected?: string) {
  const num = accountId.replace(/^act_/, '');
  const base = `https://adsmanager.facebook.com/adsmanager/manage/${kind}?act=${num}`;
  if (!selected) return base;
  return `${base}&${kind === 'campaigns' ? 'selected_campaign_ids' : 'selected_ad_ids'}=${selected}`;
}

/* ── Metrics the tiles and the day-by-day chart share ───────────────────── */

export type ChartMetric = 'spend' | 'impressions' | 'reach' | 'clicks' | 'cpc' | 'purchases';

export const METRIC_LABELS: Record<ChartMetric, string> = {
  spend: 'Money spent',
  impressions: 'Times shown',
  reach: 'People reached',
  clicks: 'Clicks',
  cpc: 'Cost per click',
  purchases: 'Purchases',
};

export const METRIC_IS_MONEY: Record<ChartMetric, boolean> = {
  spend: true, impressions: false, reach: false, clicks: false, cpc: true, purchases: false,
};

// Null, not zero, when the number does not exist. A day with no clicks has no
// cost per click, and drawing it as 0p would read as free clicks.
export function metricValue(r: DailyRow, metric: ChartMetric): number | null {
  switch (metric) {
    case 'spend': return r.spendMinor;
    case 'impressions': return r.impressions;
    case 'reach': return r.reach;
    case 'clicks': return r.clicks;
    case 'cpc': return r.clicks > 0 ? r.spendMinor / r.clicks : null;
    case 'purchases': return r.purchases;
  }
}

export const blankDay = (date: string): DailyRow => ({
  date, spendMinor: 0, impressions: 0, reach: 0, clicks: 0, videoViews: 0, purchases: 0, purchaseValueMinor: 0,
});

/* ── The shared state ───────────────────────────────────────────────────── */

export interface Totals {
  spendMinor: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchaseValueMinor: number;
  videoViews: number;
}

export interface AdviceState {
  text: string | null;
  when: string | null;
  note: string | null;
}

export interface AdsContextValue {
  range: RangePreset;
  setRange: (r: RangePreset) => void;
  /** Whose visits the after-the-click figures count. */
  visitors: VisitorScope;
  setVisitors: (v: VisitorScope) => void;
  /** Page address -> the name a person would use for it. */
  pageNames: Record<string, string>;
  data: AdsResponse | null;
  loading: boolean;
  /** True once real figures are on hand and nothing is wrong with them. */
  ready: boolean;
  refreshedAt: string | null;
  refreshError: string | null;
  refreshWaitMinutes: number;
  refreshNow: () => void;
  refreshKey: number;
  currency: string;
  accountId: string;
  accountIds: string[];
  daily: DailyRow[];
  previousDaily: DailyRow[] | undefined;
  till: Map<string, TillRow>;
  totals: Totals;
  bestDayReach: number;
  /** Every ad Meta returned, including past and locally hidden ones. */
  allAds: AdRow[];
  /** Running, non-hidden ads used by the everyday results pages. */
  ads: AdRow[];
  campaigns: CampaignRow[];
  issues: DeliveryIssue[];
  signals: Signal[];
  otherTill: TillRow[];
  neverRan: boolean;
  links: Record<string, CreativeLink>;
  /** After a save: this ad's new labels, and when the save answered with them, every ad's. */
  updateLink: (adId: string, link: CreativeLink, all?: Record<string, CreativeLink>) => void;
  /** Move an ad in or out of this panel's local archive. Meta is untouched. */
  setAdHidden: (adId: string, adName: string, hidden: boolean) => Promise<string | null>;
  openInAdsManager: (kind: 'campaigns' | 'ads', selected?: string) => void;
  /** The measure the headline tiles and the day-by-day chart show. */
  metric: ChartMetric;
  setMetric: (m: ChartMetric) => void;
  advice: AdviceState;
  writing: boolean;
  writeFreshAdvice: () => Promise<void>;
}

const AdsContext = createContext<AdsContextValue | null>(null);

export function useAds(): AdsContextValue {
  const v = useContext(AdsContext);
  if (!v) throw new Error('useAds must be used inside the ads layout');
  return v;
}

export function AdsProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<RangePreset>('28d');
  const [visitors, setVisitors] = useState<VisitorScope>('new');
  const [metric, setMetric] = useState<ChartMetric>('spend');
  const [data, setData] = useState<AdsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [advice, setAdvice] = useState<AdviceState>({ text: null, when: null, note: null });
  const [writing, setWriting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const refreshWaitMinutes = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 60_000));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRefreshError(null);
    fetch(`/api/admin/ads?range=${range}&visitors=${visitors}`)
      .then(async (res) => ({ ok: res.ok, body: (await res.json()) as AdsResponse }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok || body.error) {
          // Keep the last good figures and say the refresh failed. The message
          // is Meta's error explained in plain words by the reader.
          setData((d) => (d && d.configured && !d.error ? d : body));
          setRefreshError(body.error ?? 'Meta could not be read.');
        } else {
          setData(body);
          setRefreshedAt(body.fetchedAt ?? new Date().toISOString());
        }
        if (body.latestAdvice) {
          setAdvice({ text: body.latestAdvice.advice, when: body.latestAdvice.created_at, note: null });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setRefreshError('The request to Meta did not complete. Try again in a moment.');
        setData((d) => d ?? { configured: true });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, visitors, refreshKey]);

  const currency = data?.account?.currency ?? 'GBP';
  const accountId = data?.account?.id ?? '';
  const accountIds = data?.accounts?.map((account) => account.id) ?? (accountId ? [accountId] : []);
  const daily = useMemo(() => (data?.window
    ? fillDays(data.daily ?? [], data.window.since, data.window.until, blankDay)
    : fillMissingDays(data?.daily ?? [], blankDay)), [data]);
  const previousDaily = useMemo(() => (data?.previousWindow && data.previousDaily
    ? fillDays(data.previousDaily, data.previousWindow.since, data.previousWindow.until, blankDay)
    : undefined), [data]);
  const till = useMemo(() => new Map((data?.till ?? []).map((t) => [t.utm_campaign, t])), [data]);

  const accountTotals = useMemo(() => {
    const t: Totals = { spendMinor: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValueMinor: 0, videoViews: 0 };
    for (const r of daily) {
      t.spendMinor += r.spendMinor;
      t.impressions += r.impressions;
      t.clicks += r.clicks;
      t.purchases += r.purchases;
      t.purchaseValueMinor += r.purchaseValueMinor;
      t.videoViews += r.videoViews;
    }
    return t;
  }, [daily]);

  // Reach cannot be summed across days (the same person counts once per day),
  // so the tile shows the biggest single day and says so.
  const accountBestDayReach = useMemo(() => Math.max(0, ...daily.map((r) => r.reach)), [daily]);

  const links = data?.creativeLinks ?? {};
  const allAds = data?.ads ?? [];
  const ads = allAds.filter((ad) => ad.running && !links[ad.id]?.hidden);
  const bestDayReach = ads.length > 0 ? Math.max(0, ...ads.map((ad) => ad.reach)) : accountBestDayReach;
  const emptyTotals: Totals = { spendMinor: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValueMinor: 0, videoViews: 0 };
  const totals: Totals = ads.length > 0 ? ads.reduce((sum, ad) => ({
    spendMinor: sum.spendMinor + ad.spendMinor,
    impressions: sum.impressions + ad.impressions,
    clicks: sum.clicks + ad.clicks,
    purchases: sum.purchases + ad.purchases,
    purchaseValueMinor: sum.purchaseValueMinor,
    videoViews: sum.videoViews + ad.videoViews,
  }), emptyTotals) : allAds.length > 0 ? emptyTotals : accountTotals;
  const currentCampaignIds = new Set(ads.map((ad) => ad.campaignId));
  const campaigns = (data?.campaigns ?? []).filter((campaign) => currentCampaignIds.has(campaign.id));
  const currentAdIds = new Set(ads.map((ad) => ad.id));
  const issues = (data?.deliveryIssues ?? []).filter((issue) => currentAdIds.has(issue.adId));
  const signals = data?.signals ?? [];
  const ready = Boolean(!loading && data?.configured && !data.error);
  const neverRan = ready && allAds.length === 0 && accountTotals.impressions === 0;
  const otherTill = (data?.till ?? []).filter((t) => !campaigns.some((c) => c.id === t.utm_campaign));

  const value: AdsContextValue = {
    range,
    setRange,
    visitors,
    setVisitors,
    pageNames: data?.pageNames ?? {},
    data,
    loading,
    ready,
    refreshedAt,
    refreshError,
    refreshWaitMinutes,
    refreshNow: () => {
      if (loading || refreshWaitMinutes > 0) return;
      setNextRefreshAt(Date.now() + 5 * 60_000);
      setRefreshKey((k) => k + 1);
    },
    refreshKey,
    currency,
    accountId,
    accountIds,
    daily,
    previousDaily,
    till,
    totals,
    bestDayReach,
    allAds,
    ads,
    campaigns,
    issues,
    signals,
    otherTill,
    neverRan,
    links,
    updateLink: (adId, link, all) => setData((d) => (d ? { ...d, creativeLinks: all ?? { ...(d.creativeLinks ?? {}), [adId]: link } } : d)),
    setAdHidden: async (adId, adName, hidden) => {
      try {
        const res = await fetch('/api/admin/ads/visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adId, adName, hidden }),
        });
        const answer = await res.json().catch(() => null) as { error?: string; links?: Record<string, CreativeLink> } | null;
        if (!res.ok || !answer?.links) return answer?.error ?? 'The advert could not be moved.';
        setData((current) => current ? { ...current, creativeLinks: answer.links } : current);
        return null;
      } catch {
        return 'The advert could not be moved. Please try again.';
      }
    },
    openInAdsManager: (kind, selected) => {
      const selectedAccount = selected
        ? (kind === 'ads'
          ? ads.find((ad) => ad.id === selected)?.accountId
          : campaigns.find((campaign) => campaign.id === selected)?.accountId)
        : null;
      const targetAccount = selectedAccount ?? accountId;
      if (!targetAccount) return;
      window.open(adsManagerUrl(targetAccount, kind, selected), '_blank', 'noopener');
    },
    metric,
    setMetric,
    advice,
    writing,
    writeFreshAdvice: async () => {
      setWriting(true);
      setAdvice((a) => ({ ...a, note: null }));
      try {
        const res = await fetch('/api/admin/ads/advice', { method: 'POST' });
        const body = (await res.json()) as { advice?: string | null; reason?: string };
        if (body.advice) {
          setAdvice({ text: body.advice, when: new Date().toISOString(), note: null });
        } else {
          setAdvice((a) => ({ ...a, note: body.reason ?? 'The adviser could not run.' }));
        }
      } catch {
        setAdvice((a) => ({ ...a, note: 'The adviser could not be reached. Try again in a moment.' }));
      } finally {
        setWriting(false);
      }
    },
  };

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}
