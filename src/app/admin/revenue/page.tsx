'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import {
  OPEN_RANGE,
  describeRange,
  endOfLocalDay,
  isBackwards,
  parseLocalDate,
  presetForRange,
  rangeForPreset,
  rangeFromQuery,
  rangeToQuery,
  withinRange,
  type DateRange,
  type RangePreset,
} from '@/lib/revenueRange';

/* The buttons for the periods that get asked for over and over. The dates they stand for are put
   into the From and To boxes, so the screen always shows exactly what it is counting rather than
   hiding it behind a word like "recent". */
const QUICK_PICKS: { key: RangePreset; label: string }[] = [
  { key: 'all',        label: 'All Time'    },
  { key: 'this_month', label: 'This Month'  },
  { key: 'last_month', label: 'Last Month'  },
  { key: 'last_30',    label: 'Last 30 Days' },
  { key: 'this_year',  label: 'This Year'   },
];

type OrderStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'paid'
  | 'awaiting_dispatch'
  | 'processing'
  | 'exported'
  | 'dispatched'
  | 'delivered'
  | 'payment_failed'
  | 'payment_cancelled'
  | 'refunded'
  | 'cancelled';

const REVENUE_STATUSES: OrderStatus[] = [
  'paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered',
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:           'Pending',
  awaiting_payment:  'Awaiting Payment',
  paid:              'Paid',
  awaiting_dispatch: 'Awaiting Dispatch',
  processing:        'Processing',
  exported:          'Exported',
  dispatched:        'Dispatched',
  delivered:         'Delivered',
  payment_failed:    'Payment Failed',
  payment_cancelled: 'Cancelled (Payment)',
  refunded:          'Refunded',
  cancelled:         'Cancelled',
};

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending:           'bg-yellow-50 text-yellow-600',
  awaiting_payment:  'bg-orange-50 text-orange-600',
  paid:              'bg-blue-50 text-blue-600',
  awaiting_dispatch: 'bg-sky-50 text-sky-600',
  processing:        'bg-purple-50 text-purple-600',
  exported:          'bg-indigo-50 text-indigo-600',
  dispatched:        'bg-gold-50 text-gold-700',
  delivered:         'bg-green-50 text-green-600',
  payment_failed:    'bg-red-50 text-red-400',
  payment_cancelled: 'bg-red-50 text-red-400',
  refunded:          'bg-rose-50 text-rose-500',
  cancelled:         'bg-red-50 text-red-500',
};

interface RevenueOrder {
  orderNumber: string;
  customerName: string;
  email: string;
  total: number;
  paypalFee: number;
  status: OrderStatus;
  createdAt: string;
  paymentConfirmedAt: string | null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── SVG Revenue Chart ────────────────────────────────────────────────────────
// Inline SVG, no external libraries. Renders a cumulative revenue line with
// a gold area fill, per-order dots, axis labels, and a dashed "today" marker.

function RevenueChart({ orders, rangeEnd }: { orders: RevenueOrder[]; rangeEnd?: Date | null }) {
  const GOLD = '#b8952a'; // gold-500

  // ViewBox dimensions
  const W = 800;
  const H = 300;
  const PAD_L = 72; // left: room for Y labels
  const PAD_R = 24;
  const PAD_T = 20;
  const PAD_B = 44; // bottom: room for X labels
  const PLOT_W = W - PAD_L - PAD_R;
  const PLOT_H = H - PAD_T - PAD_B;

  const sorted = [...orders].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // Chart needs at least two data points to draw a meaningful line
  if (sorted.length <= 1) {
    return (
      <div className="flex items-center justify-center" style={{ height: 300 }}>
        <p className="text-xs text-stone-500">No revenue data for this period</p>
      </div>
    );
  }

  const now = new Date();
  const firstDate = new Date(sorted[0].createdAt);

  /* Where the axis ends. Without this it always ran to today, so a fortnight in August drew as a
     short climb followed by a long flat line to the right-hand edge, which reads as a collapse in
     sales rather than a range that simply finished (task 620fed22). */
  const axisEnd = rangeEnd ?? now;

  const startTime = firstDate.getTime();
  const endTime = Math.max(
    axisEnd.getTime(),
    new Date(sorted[sorted.length - 1].createdAt).getTime(),
  );
  const timeRange = Math.max(endTime - startTime, 1);

  const totalRevenue = sorted.reduce((sum, o) => sum + o.total, 0);

  // Build cumulative points for each order (for dots + line end points)
  let running = 0;
  const dotPoints = sorted.map(o => {
    running += o.total;
    return { date: new Date(o.createdAt), amount: running };
  });

  // Line includes a zero-start point so the line begins at £0 at the first order date
  const linePoints = [
    { date: firstDate, amount: 0 },
    ...dotPoints,
  ];

  // Map helpers: date -> SVG x, amount -> SVG y
  const xFor = (date: Date) => PAD_L + ((date.getTime() - startTime) / timeRange) * PLOT_W;
  const yFor = (amount: number) => PAD_T + PLOT_H - (amount / totalRevenue) * PLOT_H;

  // SVG path for the line
  const linePath = linePoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.date).toFixed(1)},${yFor(p.amount).toFixed(1)}`)
    .join(' ');

  // Close below the X axis to make the fill area
  const last = linePoints[linePoints.length - 1];
  const first = linePoints[0];
  const areaPath =
    linePath +
    ` L${xFor(last.date).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)}` +
    ` L${xFor(first.date).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} Z`;

  // Horizontal grid lines at 0%, 25%, 50%, 75%, 100% of total
  const gridFractions = [0, 0.25, 0.5, 0.75, 1];

  // X axis: one label per calendar month that falls inside the plot area
  const xLabels: { x: number; label: string }[] = [];
  const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  const axisEndDate = new Date(endTime);
  const endMonth = new Date(axisEndDate.getFullYear(), axisEndDate.getMonth() + 1, 1);
  while (cursor <= endMonth) {
    const x = xFor(cursor);
    if (x >= PAD_L && x <= W - PAD_R) {
      xLabels.push({
        x,
        label: cursor.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const todayX = xFor(now);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      aria-label="Cumulative revenue chart"
      style={{ display: 'block' }}
    >
      {/* Horizontal grid lines + Y axis labels */}
      {gridFractions.map(f => {
        const y = yFor(totalRevenue * f);
        const label = `£${Math.round(totalRevenue * f)}`;
        return (
          <g key={f}>
            <line
              x1={PAD_L} y1={y}
              x2={W - PAD_R} y2={y}
              stroke="#e7e5e4" strokeWidth={1}
            />
            <text
              x={PAD_L - 6} y={y + 4}
              textAnchor="end" fontSize={10} fill="#a8a29e"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Chart axes */}
      <line
        x1={PAD_L} y1={PAD_T}
        x2={PAD_L} y2={PAD_T + PLOT_H}
        stroke="#d6d3d1" strokeWidth={1}
      />
      <line
        x1={PAD_L} y1={PAD_T + PLOT_H}
        x2={W - PAD_R} y2={PAD_T + PLOT_H}
        stroke="#d6d3d1" strokeWidth={1}
      />

      {/* Gold area fill */}
      <path d={areaPath} fill={GOLD} fillOpacity={0.12} />

      {/* Gold revenue line */}
      <path
        d={linePath}
        fill="none"
        stroke={GOLD}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dashed vertical marker for today */}
      {todayX > PAD_L && todayX < W - PAD_R && (
        <line
          x1={todayX} y1={PAD_T}
          x2={todayX} y2={PAD_T + PLOT_H}
          stroke={GOLD}
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.45}
        />
      )}

      {/* Per-order dots */}
      {dotPoints.map((p, i) => (
        <circle
          key={i}
          cx={xFor(p.date)}
          cy={yFor(p.amount)}
          r={4}
          fill={GOLD}
          stroke="white"
          strokeWidth={1.5}
        />
      ))}

      {/* X axis month labels */}
      {xLabels.map(({ x, label }, i) => (
        <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize={10} fill="#a8a29e">
          {label}
        </text>
      ))}
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminRevenuePage() {
  const [allOrders, setAllOrders] = useState<RevenueOrder[]>([]);
  const [loading, setLoading] = useState(true);

  /* The screen used to offer two periods and nothing else, so the only question it could answer
     was "this month" or "ever". Now it holds a real range (task 620fed22). ?period=this_month is
     still understood, because that is the link this page used to produce. */
  const [range, setRange] = useState<DateRange>(() => {
    if (typeof window === 'undefined') return { ...OPEN_RANGE };
    return rangeFromQuery(window.location.search);
  });

  const activePreset = presetForRange(range);
  const backwards = isBackwards(range);

  // Keep the address bar in step, so a refresh returns to the same view and it can be sent to
  // somebody. replaceState rather than push: changing a date is not a page you want to go Back to.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = window.location.pathname + rangeToQuery(range);
    window.history.replaceState(null, '', next);
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/orders');
        const data = (await res.json()) as { orders?: RevenueOrder[] };
        if (cancelled) return;
        setAllOrders(Array.isArray(data.orders) ? data.orders : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Filter to revenue-contributing statuses, then optionally by period
  const revenueOrders = useMemo(() => {
    const base = allOrders.filter(o => REVENUE_STATUSES.includes(o.status));
    // A backwards range counts nothing on purpose. Silently swapping the dates would answer a
    // question he did not ask; the screen says what is wrong instead.
    if (backwards) return [];
    return base.filter(o => withinRange(o.createdAt, range));
  }, [allOrders, range, backwards]);

  // The chart's right-hand edge: the end of the chosen range, or today when it is open-ended.
  const chartEnd = useMemo(() => {
    const to = parseLocalDate(range.to);
    return to ? endOfLocalDay(to) : null;
  }, [range.to]);

  const totalRevenue = revenueOrders.reduce((sum, o) => sum + o.total, 0);
  const paidOrderCount = revenueOrders.length;
  const avgOrderValue = paidOrderCount > 0 ? totalRevenue / paidOrderCount : 0;

  // Accounting receives only order references and money fields. No customer
  // details, addresses or raw order payload leave this admin page.
  const accountingOrders = backwards ? [] : allOrders.filter(
    (order) => order.paymentConfirmedAt && withinRange(order.paymentConfirmedAt, range),
  );
  const accountingUnavailable = loading || backwards || accountingOrders.length === 0;

  // Table: most recent first
  const tableOrders = [...revenueOrders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />

      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-5xl">

          {/* Back link */}
          <Link
            href="/admin/dashboard"
            className="text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-700 transition-colors mb-6 inline-block"
          >
            &larr; Dashboard
          </Link>

          {/* Page title */}
          <h1 className="text-lg font-semibold text-stone-800 mb-0.5">Revenue</h1>
          <p className="text-xs text-stone-500 mb-1">Windsor Beauty - Confirmed Payments</p>
          {/* Spelled out, so a figure read off this screen or sent as a photograph is never
              ambiguous about the period it covers. */}
          <p className="text-[11px] text-gold-700 mb-7">{describeRange(range)}</p>

          {/* Period picker: the usual answers as buttons, and any other stretch by hand. */}
          <div className="mb-8 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {QUICK_PICKS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRange(rangeForPreset(key))}
                  className={`text-[9px] tracking-[0.18em] uppercase px-5 py-2.5 border transition-colors ${
                    activePreset === key
                      ? 'bg-gold-700 text-white border-gold-500'
                      : 'border-stone-200 text-stone-500 hover:border-gold-300 hover:text-gold-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="bg-white border border-stone-200 p-4 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="block text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1.5">From</span>
                <input
                  type="date"
                  value={range.from}
                  onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
                  className="border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-xs text-stone-700 bg-white transition-colors"
                />
              </label>
              <label className="block">
                <span className="block text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1.5">To</span>
                <input
                  type="date"
                  value={range.to}
                  onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
                  className="border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-xs text-stone-700 bg-white transition-colors"
                />
              </label>
              {(range.from || range.to) && (
                <button
                  type="button"
                  onClick={() => setRange({ ...OPEN_RANGE })}
                  className="text-[9px] tracking-[0.18em] uppercase text-stone-500 border border-stone-200 px-4 py-2.5 hover:text-gold-700 hover:border-gold-300 transition-colors"
                >
                  Clear dates
                </button>
              )}
              <p className="text-[10px] text-stone-500 basis-full sm:basis-auto sm:ml-auto">
                Both dates are counted in full.
              </p>
            </div>

            {backwards && (
              <p className="text-[11px] text-red-500 border border-red-100 bg-red-50 px-4 py-2.5">
                The To date is before the From date, so nothing can fall between them. Swap them over
                and the figures will come back.
              </p>
            )}
          </div>

          <div className="mb-7 border border-stone-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-stone-600">
              Export {accountingOrders.length} confirmed-payment order{accountingOrders.length === 1 ? '' : 's'} for BRIAN Accounting. Costs or refunds that are not verified stay blank for review.
            </p>
            <a
              href={`/api/admin/accounting-export${rangeToQuery(range)}`}
              aria-disabled={accountingUnavailable || undefined}
              tabIndex={accountingUnavailable ? -1 : undefined}
              onClick={event => { if (accountingUnavailable) event.preventDefault(); }}
              className={`border border-gold-500 px-4 py-2 text-xs font-medium text-gold-700 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-600 ${accountingUnavailable ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gold-50'}`}
            >
              Download Accounting CSV
            </a>
          </div>

          {/* Key stat tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {([
              { label: 'Total Revenue',   value: `£${totalRevenue.toFixed(2)}`  },
              { label: 'Paid Orders',     value: String(paidOrderCount)          },
              { label: 'Avg Order Value', value: `£${avgOrderValue.toFixed(2)}` },
            ] as { label: string; value: string }[]).map(({ label, value }) => (
              <div key={label} className="bg-white border border-stone-200 p-5">
                <div className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-2">{label}</div>
                <div className="text-2xl font-semibold text-stone-800">{loading ? '-' : value}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="bg-white border border-stone-200 p-6 mb-8">
            <div className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-5">Cumulative Revenue</div>
            {loading ? (
              <div className="flex items-center justify-center" style={{ height: 300 }}>
                <p className="text-xs text-stone-500">Loading chart...</p>
              </div>
            ) : (
              <RevenueChart orders={revenueOrders} rangeEnd={chartEnd} />
            )}
          </div>

          {/* Orders table */}
          <div className="bg-white border border-stone-200 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50">
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Order</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Date</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Customer</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Amount</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center text-xs text-stone-500 py-10">Loading...</td>
                  </tr>
                ) : tableOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-xs text-stone-500 py-10">
                      {backwards
                        ? 'Those two dates are the wrong way round.'
                        : 'No paid orders in this period.'}
                    </td>
                  </tr>
                ) : tableOrders.map(order => (
                  <tr
                    key={order.orderNumber}
                    className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-xs font-mono font-medium text-stone-700">{order.orderNumber}</td>
                    <td className="px-4 py-3 text-xs text-stone-500">{formatDate(order.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-stone-700">{order.customerName}</div>
                      <div className="text-[9px] text-stone-500">{order.email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-gold-700">
                      &pound;{order.total.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[8px] tracking-wider uppercase px-2 py-0.5 ${
                          STATUS_STYLES[order.status] ?? 'bg-stone-50 text-stone-500'
                        }`}
                      >
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </main>
    </div>
  );
}
