'use client';

import { useState } from 'react';
import { niceScale, segmentsOf, smoothPath } from '@/lib/ads/chart';
import { METRIC_IS_MONEY, METRIC_LABELS, metricValue, type ChartMetric, type DailyRow } from './AdsData';
import { GOLD, count, formatDate, moneyFromMinor } from './shared';
import { useNarrow } from './useNarrow';

/* ── Day-by-day line chart ────────────────────────────────────────────────────
   Inline SVG, one gold series on one axis. Monotone cubic smoothing, chosen
   over a plain curve because it cannot overshoot: a bulge above a data point
   would draw a number that never happened. Axis steps are 1, 2 or 5 of a power
   of ten rather than quarters of the maximum, so the labels read as money
   rather than as arithmetic. Hit targets are full-height columns, so a flat run
   of days is as hoverable as a peak, and a tap does what a hover does (audit
   item 8). On a phone the picture is drawn taller with bigger labels (audit
   item 7). The period before is drawn faintly behind this one, day for day. */

export default function DailyChart({ daily, metric, currency, previous }: {
  daily: DailyRow[]; metric: ChartMetric; currency: string; previous?: DailyRow[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const narrow = useNarrow();

  const W = narrow ? 420 : 800, H = 300;
  const PAD_L = narrow ? 52 : 68, PAD_R = narrow ? 12 : 18, PAD_T = 26, PAD_B = 36;
  const PLOT_W = W - PAD_L - PAD_R;
  const PLOT_H = H - PAD_T - PAD_B;
  const fs = narrow ? 13 : 10;

  const isMoney = METRIC_IS_MONEY[metric];
  const fmt = (v: number) => (isMoney ? moneyFromMinor(v, currency) : count(Math.round(v)));
  const axisLabel = (v: number) =>
    isMoney ? `£${(v / 100).toFixed(v > 0 && v < 500 ? 2 : 0)}` : count(Math.round(v));

  const values = daily.map((r) => metricValue(r, metric));
  const present = values.filter((v): v is number => v !== null);
  // The window before, faint, aligned day for day (same length by construction).
  const prevValues = (previous ?? []).map((r) => metricValue(r, metric));
  const prevPresent = prevValues.filter((v): v is number => v !== null);
  const hasPrevious = prevPresent.some((v) => v > 0);

  if (daily.length === 0 || present.length === 0 || present.every((v) => v === 0)) {
    return (
      <div className="flex items-center justify-center" style={{ height: 300 }}>
        <p className="text-xs text-stone-500">Nothing to show for these days.</p>
      </div>
    );
  }

  const { top, ticks } = niceScale(Math.max(...present, ...(hasPrevious ? prevPresent : [])));
  const average = present.reduce((a, b) => a + b, 0) / present.length;
  const peak = Math.max(...present);
  const bestIndex = values.findIndex((v) => v === peak);

  const colW = PLOT_W / daily.length;
  const xFor = (i: number) => PAD_L + colW * (i + 0.5);
  const yFor = (v: number) => PAD_T + PLOT_H - (v / top) * PLOT_H;

  const points = values.map((v, i) => (v === null ? null : { x: xFor(i), y: yFor(v) }));
  // Runs of consecutive days that have a number. Cost per click has no value on
  // a day with no clicks, so the line stops and starts again rather than diving
  // to the floor and inventing a free click.
  const segments = segmentsOf(points);

  const labelEvery = Math.max(1, Math.ceil(daily.length / (narrow ? 4 : 6)));
  const gradientId = `ads-line-${metric}`;
  const bestPoint = points[bestIndex];
  const prevPoints = hasPrevious ? prevValues.map((v, i) => (v === null || i >= daily.length ? null : { x: xFor(i), y: yFor(v) })) : [];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-label={`${METRIC_LABELS[metric]} per day`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.22} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} y1={yFor(t)} x2={W - PAD_R} y2={yFor(t)}
              stroke={t === 0 ? '#d6d3d1' : '#f0efee'} strokeWidth={1} />
            <text x={PAD_L - 8} y={yFor(t) + 3.5} textAnchor="end" fontSize={fs} fill="#78716c">{axisLabel(t)}</text>
          </g>
        ))}

        {/* The period average, so a single day can be read as good or bad at a glance. */}
        {average > 0 && present.length > 2 && (
          <g>
            <line x1={PAD_L} y1={yFor(average)} x2={W - PAD_R} y2={yFor(average)}
              stroke="#a8a29e" strokeWidth={1} strokeDasharray="3 4" />
            <text x={W - PAD_R} y={yFor(average) - 5} textAnchor="end" fontSize={fs - 1} fill="#78716c">
              average {fmt(average)}
            </text>
          </g>
        )}

        {/* The period before, paler and dashed, so this period can be read against it. */}
        {hasPrevious && segmentsOf(prevPoints).map((seg, i) => (
          <path key={`prev-${i}`} d={smoothPath(seg)} fill="none" stroke="#c8c4c0" strokeWidth={1.5} strokeDasharray="5 4" strokeLinecap="round" data-testid="previous-line" />
        ))}

        {segments.map((seg, i) => {
          const line = smoothPath(seg);
          const area = `${line} L ${seg[seg.length - 1].x} ${PAD_T + PLOT_H} L ${seg[0].x} ${PAD_T + PLOT_H} Z`;
          return (
            <g key={`seg-${i}`}>
              {seg.length > 1 && <path d={area} fill={`url(#${gradientId})`} />}
              <path d={line} fill="none" stroke={GOLD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}

        {bestPoint && present.length > 1 && (
          <text
            x={Math.min(Math.max(bestPoint.x, PAD_L + 34), W - PAD_R - 34)}
            y={Math.max(bestPoint.y - 12, PAD_T - 10)}
            textAnchor="middle" fontSize={fs - 1} fill="#8a6f1f"
          >
            best day {fmt(peak)}
          </text>
        )}

        {points.map((pt, i) => (pt ? (
          <circle key={daily[i].date} cx={pt.x} cy={pt.y}
            r={hover === i ? 4.5 : i === bestIndex ? 3.5 : 2.5}
            fill={hover === i || i === bestIndex ? GOLD : '#ffffff'}
            stroke={GOLD} strokeWidth={1.5} />
        ) : null))}

        {hover !== null && (
          <line x1={xFor(hover)} y1={PAD_T} x2={xFor(hover)} y2={PAD_T + PLOT_H}
            stroke={GOLD} strokeWidth={1} strokeDasharray="2 3" opacity={0.55} />
        )}

        {daily.map((r, i) => (
          <g key={`hit-${r.date}`}>
            <rect x={PAD_L + i * colW} y={PAD_T} width={colW} height={PLOT_H} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              onClick={() => setHover((h) => (h === i ? null : i))} />
            {i % labelEvery === 0 && (
              <text x={xFor(i)} y={H - 8} textAnchor="middle" fontSize={fs} fill="#78716c">
                {formatDate(r.date)}
              </text>
            )}
          </g>
        ))}
      </svg>

      {hasPrevious && (
        <p className="text-[11px] text-stone-500 mt-2" data-testid="previous-legend">Gold: this period. Grey, dashed: the same number of days immediately before, day for day.</p>
      )}
      {hover !== null && daily[hover] && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 bg-stone-800 text-white text-[11px] px-2.5 py-1.5 rounded-md whitespace-nowrap"
          style={{ left: `${(xFor(hover) / W) * 100}%`, top: 0 }}
        >
          <span className="text-stone-300">{formatDate(daily[hover].date)}</span>
          <span className="mx-1.5 text-stone-500">|</span>
          {hasPrevious && (
            <span className="mr-1.5 text-stone-400">before: {prevValues[hover] === null ? 'n/a' : fmt(prevValues[hover] as number)}</span>
          )}
          {values[hover] === null ? (
            <span className="text-stone-300">nothing to measure, no clicks that day</span>
          ) : (
            <>
              <span className="font-semibold">{fmt(values[hover] as number)}</span>
              {average > 0 && present.length > 2 && (
                <span className="ml-1.5 text-stone-400">
                  {(values[hover] as number) >= average
                    ? `${((values[hover] as number) / average).toFixed(1)}x the average`
                    : `${Math.round((1 - (values[hover] as number) / average) * 100)}% below average`}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
