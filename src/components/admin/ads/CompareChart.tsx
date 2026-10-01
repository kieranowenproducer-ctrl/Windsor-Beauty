'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AdRow, AdSeries, CompareRange, SeriesCell } from '@/lib/ads/meta';
import { adDisplayName, type CreativeLink } from '@/lib/ads/labels';
import { pickChosen } from '@/lib/ads/compare';
import { niceScale, segmentsOf, smoothPath } from '@/lib/ads/chart';
import { count, formatDate, formatTime, metaAccountLabel, moneyFromMinor } from './shared';
import { useNarrow } from './useNarrow';

// The centrepiece (ADSLAB item 3): two ads on one chart over time. Ad A is
// green and solid, Ad B red and dashed, so the two lines differ by style as
// well as colour and a colour-blind reader is never guessing. Both colours
// pass 3:1 against the stone background. More than two ads get a third and
// fourth style; beyond that the chart says which ads it left out.
//
// The rules the first line chart learned are reused from src/lib/ads/chart.ts:
// monotone smoothing that cannot overshoot, gap filling (done server side by
// fetchAdSeries), and per-click costs that are null, not zero, on a zero-click
// bucket so the line breaks instead of drawing a free click.

type Metric = 'spend' | 'reach' | 'impressions' | 'clicks' | 'ctr' | 'cpc' | 'cpm' | 'comments' | 'engagement' | 'orders';

const METRICS: { key: Metric; label: string; money?: boolean; percent?: boolean; hourless?: boolean; ours?: boolean }[] = [
  { key: 'spend', label: 'Money spent', money: true },
  { key: 'reach', label: 'People reached', hourless: true },
  { key: 'impressions', label: 'Times shown' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'ctr', label: 'Click rate', percent: true },
  { key: 'cpc', label: 'Cost per click', money: true },
  { key: 'cpm', label: 'Cost per 1,000 views', money: true },
  { key: 'comments', label: 'Comments' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'orders', label: 'Orders', ours: true },
];

const RANGES: { key: CompareRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '24h', label: 'Last 24 hours' },
  { key: '3d', label: '3 days' },
  { key: '7d', label: '7 days' },
  { key: 'all', label: 'Whole run' },
];

const SELECT = 'text-[11px] tracking-[0.12em] uppercase text-stone-700 bg-white border border-stone-200 rounded-lg px-3 py-2 focus:border-gold-500 focus:outline-none';

export const LINE_STYLES = [
  { colour: '#15803d', dash: undefined, name: 'solid green' },
  { colour: '#b91c1c', dash: '7 5', name: 'dashed red' },
  { colour: '#1d4ed8', dash: '2 4', name: 'dotted blue' },
  { colour: '#7e22ce', dash: '10 4 2 4', name: 'dash-dot purple' },
  { colour: '#c2410c', dash: '2 3 8 3', name: 'dot-dash orange' },
];

export function cellValue(c: SeriesCell | undefined, m: Metric): number | null {
  if (!c) return null;
  switch (m) {
    case 'spend': return c.spendMinor;
    case 'reach': return c.reach;
    case 'impressions': return c.impressions;
    case 'clicks': return c.clicks;
    case 'ctr': return c.impressions > 0 ? (c.clicks / c.impressions) * 100 : null;
    case 'cpc': return c.clicks > 0 ? c.spendMinor / c.clicks : null;
    case 'cpm': return c.impressions > 0 ? (c.spendMinor / c.impressions) * 1000 : null;
    case 'comments': return c.comments;
    case 'engagement': return c.engagement;
    case 'orders': return c.orders;
  }
}

/** Which ads draw: the ticked ones in letter order, else every running ad, else the two biggest spenders. */
export function linesFor(ads: AdRow[], links: Record<string, CreativeLink>): { lines: AdRow[]; how: 'slots' | 'running' | 'biggest'; leftOut: number } {
  const max = LINE_STYLES.length;
  const { chosen, bySlot } = pickChosen(ads, (id) => links[id]?.slot);
  if (bySlot) return { lines: chosen.slice(0, max), how: 'slots', leftOut: Math.max(0, chosen.length - max) };
  const running = ads.filter((x) => x.running).sort((x, y) => y.spendMinor - x.spendMinor);
  if (running.length >= 2) return { lines: running.slice(0, max), how: 'running', leftOut: Math.max(0, running.length - max) };
  return { lines: chosen, how: 'biggest', leftOut: 0 };
}

interface Props {
  ads: AdRow[];
  links: Record<string, CreativeLink>;
  currency: string;
  accountIds: string[];
  /** Bumped by the page's Refresh button so this chart re-reads too. */
  refreshKey?: number;
}

interface CompareResponse extends Partial<AdSeries> {
  range?: string;
  configured?: boolean;
  error?: string;
  fetchedAt?: string;
}

export default function CompareChart({ ads, links, currency, accountIds, refreshKey = 0 }: Props) {
  const [range, setRange] = useState<CompareRange>('7d');
  const [metric, setMetric] = useState<Metric>('spend');
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const narrow = useNarrow();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/ads/compare?range=${range}`)
      .then((r) => r.json())
      .then((body: CompareResponse) => { if (!cancelled) setData(body); })
      .catch(() => { if (!cancelled) setData({ error: 'The request to Meta did not complete. Try again in a moment.' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, refreshKey]);

  const { lines, how, leftOut } = useMemo(() => linesFor(ads, links), [ads, links]);
  const hourly = data?.granularity === 'hour';
  const activeMetric = hourly && METRICS.find((m) => m.key === metric)?.hourless ? 'spend' : metric;
  const metricInfo = METRICS.find((m) => m.key === activeMetric)!;
  const points = data?.points ?? [];

  const fmt = (v: number) => (metricInfo.money ? moneyFromMinor(v, currency)
    : metricInfo.percent ? `${v.toFixed(v < 10 ? 2 : 1)}%`
    : count(Math.round(v)));
  const axisLabel = (v: number) => (metricInfo.money ? `£${(v / 100).toFixed(v > 0 && v < 500 ? 2 : 0)}`
    : metricInfo.percent ? `${v.toFixed(v < 10 ? 1 : 0)}%`
    : count(Math.round(v)));

  const series = lines.map((ad, i) => ({
    ad,
    name: adDisplayName(links[ad.id], ad.name),
    accountName: metaAccountLabel(ad.accountId, accountIds),
    style: LINE_STYLES[i % LINE_STYLES.length],
    values: points.map((p) => cellValue(p.byAd[ad.id], activeMetric)),
    total: points.reduce((t, p) => {
      const c = p.byAd[ad.id];
      return c ? { spend: t.spend + c.spendMinor, clicks: t.clicks + c.clicks, impressions: t.impressions + c.impressions, comments: t.comments + c.comments, orders: t.orders + c.orders } : t;
    }, { spend: 0, clicks: 0, impressions: 0, comments: 0, orders: 0 }),
  }));

  const present = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const nothing = points.length === 0 || present.length === 0 || present.every((v) => v === 0);

  const W = narrow ? 420 : 800, H = 300;
  const PAD_L = narrow ? 52 : 68, PAD_R = narrow ? 12 : 18, PAD_T = 26, PAD_B = 36;
  const fs = narrow ? 13 : 10;
  const PLOT_W = W - PAD_L - PAD_R;
  const PLOT_H = H - PAD_T - PAD_B;
  const { top, ticks } = niceScale(Math.max(0, ...present));
  const colW = points.length ? PLOT_W / points.length : PLOT_W;
  const xFor = (i: number) => PAD_L + colW * (i + 0.5);
  const yFor = (v: number) => PAD_T + PLOT_H - (v / top) * PLOT_H;
  const labelEvery = Math.max(1, Math.ceil(points.length / (narrow ? 4 : 6)));
  const xLabel = (p: { key: string; label: string }) => (hourly ? p.label : formatDate(p.key));

  let howNote: string;
  if (lines.length === 0) howNote = 'No ads to draw yet.';
  else if (how === 'slots') howNote = lines.length === 1
    ? 'Only one ad is ticked. Tick a second one on the Compare page to compare them.'
    : `Showing the ${lines.length} ads you ticked on the Compare page.`;
  else if (how === 'running') howNote = 'Nothing ticked yet, so this shows every running ad. Tick the ones you want on the Compare page.';
  else howNote = lines.length === 1
    ? 'Only one ad has run, so there is one line. The second appears when the next ad starts.'
    : 'Showing the two biggest spenders.';
  if (leftOut > 0) howNote += ` ${leftOut} more ${leftOut === 1 ? 'ad is' : 'ads are'} not drawn.`;

  return (
    <section data-testid="compare-chart" data-loading={loading} data-shown-range={data?.range ?? ''} className="bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)] p-6 sm:p-7 mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-stone-800">
          Ad against ad: <span className="text-gold-700">{metricInfo.label}</span>
        </h2>
        <div className="text-[11px] text-stone-500">
          {data?.fetchedAt ? `Read from Meta at ${formatTime(data.fetchedAt)}. Meta's figures lag about 15 minutes.` : ''}
        </div>
      </div>

      {/* Dropdowns, not button rows (Kieran, 4 Sept 2026: "drop down boxes so you can change how the graph looks"). */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4" data-testid="compare-controls">
        <label className="flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase text-stone-500">
          <span>Show</span>
          <select
            aria-label="Measure"
            value={activeMetric}
            onChange={(e) => setMetric(e.target.value as Metric)}
            className={SELECT}
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key} disabled={Boolean(hourly && m.hourless)}>
                {m.label}{m.ours ? ' (ours)' : ''}{hourly && m.hourless ? ' (not by the hour)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase text-stone-500">
          <span>Graph window</span>
          <select
            aria-label="Time range"
            value={range}
            onChange={(e) => setRange(e.target.value as CompareRange)}
            className={SELECT}
          >
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-[11px] text-stone-600 mb-1" data-testid="compare-how">{howNote}</p>
      <p className="text-[11px] text-stone-500 mb-3" data-testid="compare-window-note">The graph window is separate from the period at the top, so today and the last 24 hours are always to hand.</p>

      {data?.error ? (
        <div className="flex items-center justify-center" style={{ height: 300 }}>
          <p className="text-xs text-red-600 max-w-md text-center" data-testid="compare-error">{data.error}</p>
        </div>
      ) : loading && !data ? (
        <div className="flex items-center justify-center" style={{ height: 300 }}>
          <p className="text-xs text-stone-500">Loading...</p>
        </div>
      ) : nothing || lines.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 300 }}>
          <p className="text-xs text-stone-500" data-testid="compare-empty">
            {range === 'today' ? 'Nothing has run yet today.' : 'Nothing ran in this window.'}
          </p>
        </div>
      ) : (
        <div className="relative" style={{ opacity: loading ? 0.6 : 1 }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-label={`${metricInfo.label}, ad against ad`} style={{ display: 'block' }} data-testid="compare-svg">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD_L} y1={yFor(t)} x2={W - PAD_R} y2={yFor(t)} stroke={t === 0 ? '#d6d3d1' : '#f0efee'} strokeWidth={1} />
                <text x={PAD_L - 8} y={yFor(t) + 3.5} textAnchor="end" fontSize={fs} fill="#78716c">{axisLabel(t)}</text>
              </g>
            ))}

            {series.map((s) => {
              const pts = s.values.map((v, i) => (v === null ? null : { x: xFor(i), y: yFor(v) }));
              return (
                <g key={s.ad.id} data-testid="compare-line" data-style={s.style.name}>
                  {segmentsOf(pts).map((seg, i) => (
                    <path key={i} d={smoothPath(seg)} fill="none" stroke={s.style.colour} strokeWidth={2.25}
                      strokeDasharray={s.style.dash} strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                  {pts.map((pt, i) => (pt ? (
                    <circle key={i} cx={pt.x} cy={pt.y} r={hover === i ? 4.5 : 2.5}
                      fill={hover === i ? s.style.colour : '#ffffff'} stroke={s.style.colour} strokeWidth={1.5} />
                  ) : null))}
                </g>
              );
            })}

            {hover !== null && (
              <line x1={xFor(hover)} y1={PAD_T} x2={xFor(hover)} y2={PAD_T + PLOT_H} stroke="#a8a29e" strokeWidth={1} strokeDasharray="2 3" />
            )}

            {points.map((p, i) => (
              <g key={p.key}>
                <rect x={PAD_L + i * colW} y={PAD_T} width={colW} height={PLOT_H} fill="transparent"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              onClick={() => setHover((h) => (h === i ? null : i))} />
                {i % labelEvery === 0 && (
                  <text x={xFor(i)} y={H - 8} textAnchor="middle" fontSize={fs} fill="#78716c">{xLabel(p)}</text>
                )}
              </g>
            ))}
          </svg>

          {hover !== null && points[hover] && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 bg-stone-800 text-white text-[11px] px-2.5 py-1.5 rounded-md whitespace-nowrap"
              style={{ left: `${(xFor(hover) / W) * 100}%`, top: 0 }}
            >
              <div className="text-stone-300 mb-0.5">{xLabel(points[hover])}</div>
              {series.map((s) => (
                <div key={s.ad.id}>
                  <span style={{ color: s.style.colour }}>&#9679;</span>
                  <span className="ml-1 text-stone-300">{s.name}, {s.accountName}:</span>
                  <span className="ml-1 font-semibold">{s.values[hover] === null ? 'nothing to measure' : fmt(s.values[hover] as number)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-x-6 gap-y-2 mt-4" data-testid="compare-legend">
        {series.map((s) => (
          <div key={s.ad.id} className="flex items-start gap-2 min-w-[180px]" data-testid="legend-item">
            <svg width="34" height="12" aria-hidden className="mt-1 shrink-0">
              <line x1="1" y1="6" x2="33" y2="6" stroke={s.style.colour} strokeWidth={2.5} strokeDasharray={s.style.dash} strokeLinecap="round" />
            </svg>
            <div>
              <div className="text-xs font-semibold text-stone-700">{s.name}</div>
              <div className="text-[10px] font-semibold text-gold-700">{s.accountName}</div>
              <div className="text-[11px] text-stone-500">
                {s.style.name}. In this window: {moneyFromMinor(s.total.spend, currency)}, {count(s.total.clicks)} clicks, {count(s.total.comments)} comments
                {s.total.orders > 0 ? `, ${count(s.total.orders)} orders (ours)` : ''}.
              </div>
            </div>
          </div>
        ))}
      </div>
      {data?.note && <p className="text-[11px] text-stone-500 mt-2">{data.note}</p>}
    </section>
  );
}
