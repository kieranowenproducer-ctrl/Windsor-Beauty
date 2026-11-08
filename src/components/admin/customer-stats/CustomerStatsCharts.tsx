'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';

// The colours were checked with the dataviz palette validator (light surface, every pair):
// colour-blind separation and normal-vision separation both pass. The green sits under 3:1
// against the white card, so every chart here has a table of the same numbers beside it and the
// bars carry their own value labels, which is the relief the validator asks for.
export const SERIES = {
  signups: '#2a78d6',
  verified: '#1baf7a',
  ordered: '#9a7520',
} as const;

const GRID = '#e7e5e4';
const AXIS = '#a8a29e';
const INK = '#44403c';
const MUTED = '#78716c';

export interface MonthRow {
  month: string;
  label: string;
  shortLabel: string;
  signups: number;
  verified: number;
  ordered: number;
  paidOrders: number;
  spent: number;
}

export interface SourceRow {
  source: string;
  signups: number;
  verified: number;
  ordered: number;
  spent: number;
}

export const money = (n: number) =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const tooltipBox: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e7e5e4',
  padding: '8px 12px',
  fontSize: 11,
  color: '#1c1917',
};

type TipPayload = { name?: string; value?: number; color?: string; dataKey?: string | number };

function MonthTooltip({ active, payload, label }: { active?: boolean; payload?: TipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipBox}>
      <p style={{ color: MUTED, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} style={{ display: 'flex', alignItems: 'center', gap: 6, color: INK }}>
          <span style={{ width: 8, height: 8, background: p.color, display: 'inline-block' }} />
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

function MoneyTooltip({ active, payload, label }: { active?: boolean; payload?: TipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipBox}>
      <p style={{ color: MUTED, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>{label}</p>
      <p style={{ color: INK }}><strong>{money(Number(payload[0].value ?? 0))}</strong> spent</p>
    </div>
  );
}

/**
 * On a phone, three bars a month leave no room for a number over each one: they ran into each
 * other ("2727"). Below 640px the bar labels go, and the tooltip and the table carry the figures.
 */
function useRoomForLabels(): boolean {
  const [room, setRoom] = useState(true);
  useEffect(() => {
    const q = window.matchMedia('(min-width: 640px)');
    const update = () => setRoom(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);
  return room;
}

/** Drawn by hand so it reads in the same order as the bars (the chart library sorts it A to Z). */
function PeopleKey() {
  const items = [
    { label: 'Signed up', color: SERIES.signups },
    { label: 'Verified', color: SERIES.verified },
    { label: 'Ordered', color: SERIES.ordered },
  ];
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3">
      {items.map(i => (
        <span key={i.label} className="flex items-center gap-1.5 text-[11px] text-stone-700">
          <span className="w-2.5 h-2.5 inline-block" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

const axisProps = {
  tick: { fontSize: 10, fill: MUTED },
  axisLine: { stroke: AXIS },
  tickLine: false,
} as const;

/** Signed up, verified and ordered, side by side for every month. Oldest on the left, as time reads. */
export function MonthlyPeopleChart({ rows }: { rows: MonthRow[] }) {
  const labels = useRoomForLabels();
  return (
    <>
    <PeopleKey />
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} barGap={2} barCategoryGap="22%" margin={{ top: 18, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="shortLabel" {...axisProps} />
        <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
        <Tooltip content={<MonthTooltip />} cursor={{ fill: '#f5f5f4' }} />
        <Bar dataKey="signups" name="Signed up" fill={SERIES.signups} radius={[4, 4, 0, 0]} maxBarSize={22}>
          {labels && <LabelList dataKey="signups" position="top" style={{ fontSize: 9, fill: INK }} />}
        </Bar>
        <Bar dataKey="verified" name="Verified" fill={SERIES.verified} radius={[4, 4, 0, 0]} maxBarSize={22}>
          {labels && <LabelList dataKey="verified" position="top" style={{ fontSize: 9, fill: INK }} />}
        </Bar>
        <Bar dataKey="ordered" name="Ordered" fill={SERIES.ordered} radius={[4, 4, 0, 0]} maxBarSize={22}>
          {labels && <LabelList dataKey="ordered" position="top" style={{ fontSize: 9, fill: INK }} />}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </>
  );
}

/** What each month's new customers have spent so far. One series, so the title names it. */
export function MonthlySpendChart({ rows }: { rows: MonthRow[] }) {
  const labels = useRoomForLabels();
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} barCategoryGap="30%" margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="shortLabel" {...axisProps} />
        <YAxis {...axisProps} axisLine={false} tickFormatter={(v: number) => `£${v.toLocaleString('en-GB')}`} />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: '#f5f5f4' }} />
        <Bar dataKey="spent" name="Spent" fill={SERIES.ordered} radius={[4, 4, 0, 0]} maxBarSize={36}>
          {labels && <LabelList
            dataKey="spent"
            position="top"
            style={{ fontSize: 9, fill: INK }}
            formatter={(v: unknown) => (Number(v) > 0 ? `£${Math.round(Number(v)).toLocaleString('en-GB')}` : '')}
          />}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Where one month's sign-ups came from, biggest first. One series, one colour. */
export function SourcesChart({ rows }: { rows: SourceRow[] }) {
  const height = Math.max(120, rows.length * 30 + 20);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" barCategoryGap="24%" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" allowDecimals={false} {...axisProps} />
        <YAxis type="category" dataKey="source" width={150} {...axisProps} axisLine={false} />
        <Tooltip content={<MonthTooltip />} cursor={{ fill: '#f5f5f4' }} />
        <Bar dataKey="signups" name="Signed up" fill={SERIES.signups} radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList dataKey="signups" position="right" style={{ fontSize: 10, fill: INK }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
