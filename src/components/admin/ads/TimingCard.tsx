'use client';

import { useState } from 'react';
import type { DailyRow, HourRow } from '@/lib/ads/meta';
import { niceScale } from '@/lib/ads/chart';
import { GOLD, count, moneyFromMinor } from './shared';
import { useNarrow } from './useNarrow';

// Time of day and day of week (ADSLAB item 11). Hours come from Meta's own
// hourly breakdown, by the ad account's clock (London); days of the week are
// derived from the day-by-day rows already on the page. Two bar charts drawn
// as SVG, the same way the other charts here are drawn, so every bar is to the
// same scale (the first version drew them with page layout and the hour labels
// squashed the bars they sat under). Bars rather than a line because each hour
// and each weekday is its own bucket, and a line between them would claim a
// value at half past that was never measured.

interface Props {
  hours: HourRow[];
  daily: DailyRow[];
  currency: string;
  periodLabel: string;
}

type Mode = 'spend' | 'clicks' | 'impressions';
const MODES: { key: Mode; label: string }[] = [
  { key: 'clicks', label: 'Clicks' },
  { key: 'spend', label: 'Spent' },
  { key: 'impressions', label: 'Views' },
];

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function weekdayOf(isoDate: string): number {
  // Monday = 0. Dates are London days already, so plain UTC arithmetic is right.
  return (new Date(`${isoDate}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function byWeekday(daily: DailyRow[]): { day: string; spendMinor: number; clicks: number; impressions: number; days: number }[] {
  const out = WEEKDAYS.map((day) => ({ day, spendMinor: 0, clicks: 0, impressions: 0, days: 0 }));
  for (const r of daily) {
    const w = out[weekdayOf(r.date)];
    w.spendMinor += r.spendMinor;
    w.clicks += r.clicks;
    w.impressions += r.impressions;
    w.days += 1;
  }
  return out;
}

type Bucket = { spendMinor: number; clicks: number; impressions: number };

function Bars({ rows, mode, currency, labelFor, testId, ariaLabel, narrow }: {
  rows: Bucket[]; mode: Mode; currency: string; labelFor: (i: number) => string; testId: string; ariaLabel: string; narrow: boolean;
}) {
  const value = (r: Bucket) => r[mode === 'spend' ? 'spendMinor' : mode];
  const fmt = (v: number) => (mode === 'spend' ? moneyFromMinor(v, currency) : count(v));
  const axisLabel = (v: number) => (mode === 'spend' ? `£${(v / 100).toFixed(v > 0 && v < 500 ? 2 : 0)}` : count(Math.round(v)));

  const W = narrow ? 420 : 800, H = narrow ? 220 : 190;
  const PAD_L = narrow ? 44 : 48, PAD_R = 10, PAD_T = 20, PAD_B = 26;
  const fs = narrow ? 12 : 9;
  const PLOT_W = W - PAD_L - PAD_R;
  const PLOT_H = H - PAD_T - PAD_B;
  const n = rows.length;
  const colW = PLOT_W / n;
  const gap = n > 12 ? 3 : 12;
  const barW = Math.max(2, colW - gap);
  const values = rows.map(value);
  const peak = Math.max(0, ...values);
  const { top, ticks } = niceScale(peak);
  const yFor = (v: number) => PAD_T + PLOT_H - (v / top) * PLOT_H;
  const labelEvery = n > 12 ? (narrow ? 4 : 3) : 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} data-testid={testId} style={{ display: 'block' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD_L} y1={yFor(t)} x2={W - PAD_R} y2={yFor(t)} stroke={t === 0 ? '#d6d3d1' : '#f0efee'} strokeWidth={1} />
          <text x={PAD_L - 6} y={yFor(t) + 3.5} textAnchor="end" fontSize={fs} fill="#78716c">{axisLabel(t)}</text>
        </g>
      ))}
      {rows.map((_, i) => {
        const v = values[i];
        const x = PAD_L + i * colW + gap / 2;
        const y = yFor(v);
        const h = PAD_T + PLOT_H - y;
        const best = v > 0 && v === peak;
        return (
          <g key={i}>
            <rect data-bar data-value={v} x={x} y={y} width={barW} height={h} rx={2} fill={GOLD} opacity={best ? 1 : 0.55}>
              <title>{`${labelFor(i)}: ${fmt(v)}`}</title>
            </rect>
            {best && <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize={fs} fill="#8a6f1f">{fmt(v)}</text>}
            {i % labelEvery === 0 && (
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={fs} fill="#78716c">{labelFor(i)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function TimingCard({ hours, daily, currency, periodLabel }: Props) {
  const [mode, setMode] = useState<Mode>('clicks');
  const narrow = useNarrow();
  const week = byWeekday(daily);
  const value = (r: Bucket) => r[mode === 'spend' ? 'spendMinor' : mode];
  const totalClicks = hours.reduce((t, h) => t + h.clicks, 0);
  const totalDays = daily.length;

  const hourRows = Array.from({ length: 24 }, (_, h) => hours.find((x) => x.hour === h) ?? { hour: h, spendMinor: 0, impressions: 0, clicks: 0 });
  const bestHour = hourRows.reduce((best, r) => (value(r) > value(best) ? r : best), hourRows[0]);
  const bestDay = week.reduce((best, r) => (value(r) > value(best) ? r : best), week[0]);
  const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const nothing = hourRows.every((r) => value(r) === 0) && week.every((r) => value(r) === 0);
  const thin = totalClicks < 100 || totalDays < 14;
  const what = mode === 'spend' ? 'money goes' : mode === 'clicks' ? 'clicks come' : 'views come';
  const modeWord = MODES.find((m) => m.key === mode)?.label.toLowerCase() ?? mode;

  return (
    <section data-testid="timing" className="bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)] p-6 sm:p-7 mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-stone-800">Time of day and day of week</h2>
        <label className="flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase text-stone-500">
          <span>Show</span>
          <select
            aria-label="Timing measure"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="text-[11px] tracking-[0.12em] uppercase text-stone-700 bg-white border border-stone-200 rounded-lg px-3 py-2 focus:border-gold-500 focus:outline-none"
          >
            {MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
      </div>
      <p className="text-[11px] text-stone-500 mb-4">
        {periodLabel}. Hours are by the ad account&apos;s clock (London), from Meta&apos;s own breakdown. Days of the week are added up from the day-by-day figures.
      </p>
      {nothing ? (
        <p className="text-xs text-stone-500 py-2" data-testid="timing-empty">Nothing ran in this period, so there is no pattern to show.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <div className="text-[10px] tracking-[0.14em] uppercase text-stone-500 mb-2">By hour of the day</div>
              <Bars rows={hourRows} mode={mode} currency={currency} labelFor={(i) => hourLabel(i)} testId="timing-hours" ariaLabel={`${modeWord} by hour of the day`} narrow={narrow} />
            </div>
            <div className="lg:col-span-2">
              <div className="text-[10px] tracking-[0.14em] uppercase text-stone-500 mb-2">By day of the week</div>
              <Bars rows={week} mode={mode} currency={currency} labelFor={(i) => WEEKDAYS[i].slice(0, 3)} testId="timing-days" ariaLabel={`${modeWord} by day of the week`} narrow={narrow} />
            </div>
          </div>
          <p className="text-xs text-stone-700 mt-4" data-testid="timing-sentence">
            Most {what} between {hourLabel(bestHour.hour)} and {hourLabel((bestHour.hour + 1) % 24)}, and on {bestDay.day}s.
            {thin && <span className="text-stone-500"> A hint rather than a rule: only {count(totalClicks)} clicks over {count(totalDays)} {totalDays === 1 ? 'day' : 'days'} so far.</span>}
          </p>
        </>
      )}
    </section>
  );
}
