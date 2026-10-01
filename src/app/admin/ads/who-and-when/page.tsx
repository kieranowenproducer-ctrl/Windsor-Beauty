'use client';

import DailyChart from '@/components/admin/ads/DailyChart';
import TimingCard from '@/components/admin/ads/TimingCard';
import BreakdownCard from '@/components/admin/ads/BreakdownCard';
import Waiting from '@/components/admin/ads/Waiting';
import { METRIC_LABELS, RANGE_LABELS, useAds, type ChartMetric } from '@/components/admin/ads/AdsData';

// Who and when: the day-by-day line, time of day, day of the week, where the
// ads ran, who saw them and in which countries.

const CARD = 'bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)]';

// Meta's purchase count needs the Pixel, so it is not offered as a line.
const METRICS = (Object.keys(METRIC_LABELS) as ChartMetric[]).filter((m) => m !== 'purchases');

export default function WhoAndWhenPage() {
  const { ready, data, daily, previousDaily, currency, range, metric, setMetric } = useAds();
  if (!ready || !data) return <Waiting />;
  return (
    <div data-testid="page-who-and-when">
      <div className={`${CARD} p-6 sm:p-7 mb-8`} data-testid="daily-chart">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-stone-800">Day by day</h2>
            <label className="flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase text-stone-500">
              <span>Show</span>
              <select
                aria-label="Day by day measure"
                value={metric === 'purchases' ? 'spend' : metric}
                onChange={(e) => setMetric(e.target.value as ChartMetric)}
                className="text-[11px] tracking-[0.12em] uppercase text-gold-700 bg-white border border-stone-200 rounded-lg px-3 py-2.5 focus:border-gold-500 focus:outline-none"
              >
                {METRICS.map((m) => (
                  <option key={m} value={m}>{METRIC_LABELS[m]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="text-[11px] text-stone-500">Point at or tap a day for the exact figure and how it compares to the average.</div>
        </div>
        <DailyChart daily={daily} metric={metric === 'purchases' ? 'spend' : metric} currency={currency} previous={previousDaily} />
      </div>

      <TimingCard hours={data.hours ?? []} daily={daily} currency={currency} periodLabel={RANGE_LABELS[range]} />

      <h2 className="text-sm font-semibold text-stone-800 mb-2">Who, where and how</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8" data-testid="breakdowns">
        <BreakdownCard title="Where the ads ran" hint="Facebook and Instagram placements" rows={data.placements ?? []} currency={currency} />
        <BreakdownCard title="Who saw them" hint="Age and gender" rows={data.demographics ?? []} currency={currency} />
        <BreakdownCard title="Countries" hint="Where the people who saw the ads were" rows={data.countries ?? []} currency={currency} />
      </div>
    </div>
  );
}
