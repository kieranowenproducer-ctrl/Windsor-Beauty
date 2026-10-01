'use client';

import { useAds, type ChartMetric } from './AdsData';
import { count, moneyFromMinor } from './shared';

// The six big boxes. Five from Meta with an up or down line against the equal
// period before, and one from our own records: orders and sales credited to
// these ads (audit item 13: the old Purchases box always read 0, because
// Meta's own count needs the Pixel). The day-by-day chart they used to drive
// now lives on Who and when, so the boxes are plain boxes (audit item 16).

const CARD = 'bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)] p-5';

export default function HeadlineTiles() {
  const { loading, data, totals, bestDayReach, currency, campaigns, till, ads, allAds } = useAds();
  const multipleAccounts = (data?.accounts?.length ?? 0) > 1;

  const cpcMinor = totals.clicks > 0 ? totals.spendMinor / totals.clicks : 0;

  // Orders from our own records, credited to campaigns in this ad account.
  const ours = campaigns.map((c) => till.get(c.id)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  const orders = ours.reduce((t, r) => t + r.orders, 0);
  const revenueMinor = ours.reduce((t, r) => t + r.revenue_minor, 0);
  const salesPerPound = totals.spendMinor > 0 && revenueMinor > 0 ? revenueMinor / totals.spendMinor : 0;

  // The saved comparison covers the whole account. Do not mix it into a view
  // that is deliberately showing only the current live ads.
  const prev = ads.length === allAds.length ? data?.previous : undefined;
  const prevFor: Record<ChartMetric, number | null> = {
    spend: prev ? prev.spendMinor : null,
    impressions: prev ? prev.impressions : null,
    reach: prev ? prev.bestDayReach : null,
    clicks: prev ? prev.clicks : null,
    cpc: prev && prev.clicks > 0 ? prev.spendMinor / prev.clicks : null,
    purchases: null,
  };

  function deltaLine(m: ChartMetric, now: number): string | null {
    const before = prevFor[m];
    if (before === null || (before === 0 && now === 0)) return null;
    if (before === 0) return 'nothing in the period before';
    const change = Math.round(((now - before) / before) * 100);
    if (Math.abs(change) < 5) return 'level with the period before';
    return `${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% on the period before`;
  }

  const tiles: { metric: ChartMetric | null; label: string; value: string; raw: number; sub: string; source: 'meta' | 'ours' }[] = [
    { metric: 'spend', label: 'Money spent', raw: totals.spendMinor, value: moneyFromMinor(totals.spendMinor, currency), sub: 'what the ads cost', source: 'meta' },
    { metric: 'impressions', label: 'Times shown', raw: totals.impressions, value: count(totals.impressions), sub: 'every appearance on a screen', source: 'meta' },
    {
      metric: 'reach', label: 'People reached', raw: bestDayReach, value: count(bestDayReach), source: 'meta',
      sub: multipleAccounts ? 'best day; one person can count once in each account' : 'different people, best single day',
    },
    { metric: 'clicks', label: 'Clicks', raw: totals.clicks, value: count(totals.clicks), sub: 'visits the ads sent us', source: 'meta' },
    { metric: 'cpc', label: 'Cost per click', raw: cpcMinor, value: totals.clicks > 0 ? moneyFromMinor(cpcMinor, currency) : 'n/a', sub: 'what one visit cost', source: 'meta' },
    {
      metric: null, label: 'Orders', raw: orders, value: count(orders), source: 'ours',
      sub: orders > 0
        ? `${moneyFromMinor(revenueMinor, currency)} of sales` + (salesPerPound > 0 ? `, ${moneyFromMinor(salesPerPound * 100, currency)} per £1 spent` : '')
        : 'none yet, from our own records',
    },
  ];

  return (
    <section data-testid="headline-tiles" className="mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-stone-800">The headline numbers</h2>
        <div className="text-[11px] text-stone-500">Meta&apos;s figures, plus orders from our own records. Day by day is on Who and when.</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiles.map(({ metric: m, label, value, raw, sub, source }) => {
          const delta = loading || !m ? null : deltaLine(m, raw);
          return (
            <div key={label} className={CARD} data-testid="tile" data-tile={label}>
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className="text-[10px] tracking-[0.18em] uppercase text-stone-500">{label}</span>
                {source === 'ours' && <span className="text-[10px] tracking-[0.14em] uppercase text-gold-700">ours</span>}
              </div>
              <div className="text-2xl font-semibold text-stone-800">{loading ? '-' : value}</div>
              {!loading && <div className="text-[11px] text-stone-500 mt-1">{sub}</div>}
              {delta && <div className="text-[11px] text-gold-700 mt-0.5">{delta}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
