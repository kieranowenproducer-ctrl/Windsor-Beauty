'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { londonDateString } from '@/lib/date';
import { sumMoney } from '@/lib/money';

interface OrderItem {
  name: string;
  variant: string;
  quantity: number;
  price: number;
}

interface CalendarOrder {
  orderNumber: string;
  customerName: string;
  email: string;
  items: OrderItem[];
  total: number;
  status: string;
  paymentMethod: string;
  shippingLabel: string;
  createdAt: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_CHIP: Record<string, string> = {
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
  cancelled:         'bg-red-50 text-red-500',
};

const STATUS_LABEL: Record<string, string> = {
  pending:           'Pending',
  awaiting_payment:  'Awaiting Payment',
  paid:              'Paid',
  awaiting_dispatch: 'Awaiting Dispatch',
  processing:        'Processing',
  exported:          'Exported',
  dispatched:        'Dispatched',
  delivered:         'Delivered',
  payment_failed:    'Payment Failed',
  payment_cancelled: 'Payment Cancelled',
  cancelled:         'Cancelled',
};

// Derived breakdowns, layered on top of the existing combined `status` field
// (kept as-is for the existing chip) so the calendar can also answer
// "has this order been paid?" / "has it been dispatched?" on their own.
const PAID_STATUSES = new Set(['paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered']);
const DISPATCHED_STATUSES = new Set(['dispatched', 'delivered']);
const AWAITING_DISPATCH_STATUSES = new Set(['paid', 'awaiting_dispatch', 'processing', 'exported']);

type PaymentStatus = 'paid' | 'unpaid' | 'failed' | 'refunded';
type DispatchStatus = 'dispatched' | 'awaiting' | 'na';

function getPaymentStatus(status: string): PaymentStatus {
  if (PAID_STATUSES.has(status)) return 'paid';
  if (status === 'payment_failed' || status === 'payment_cancelled') return 'failed';
  if (status === 'refunded') return 'refunded';
  return 'unpaid';
}

function getDispatchStatus(status: string): DispatchStatus {
  if (DISPATCHED_STATUSES.has(status)) return 'dispatched';
  if (AWAITING_DISPATCH_STATUSES.has(status)) return 'awaiting';
  return 'na';
}

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: 'Paid',
  unpaid: 'Awaiting Payment',
  failed: 'Payment Failed',
  refunded: 'Refunded',
};

const PAYMENT_STATUS_CHIP: Record<PaymentStatus, string> = {
  paid: 'bg-green-50 text-green-600',
  unpaid: 'bg-orange-50 text-orange-600',
  failed: 'bg-red-50 text-red-400',
  refunded: 'bg-stone-100 text-stone-500',
};

const DISPATCH_STATUS_LABEL: Record<DispatchStatus, string> = {
  dispatched: 'Dispatched',
  awaiting: 'Awaiting Dispatch',
  na: 'Not Dispatched',
};

const DISPATCH_STATUS_CHIP: Record<DispatchStatus, string> = {
  dispatched: 'bg-gold-50 text-gold-700',
  awaiting: 'bg-sky-50 text-sky-600',
  na: 'bg-stone-100 text-stone-400',
};

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDayHeading(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const EXPORTABLE_STATUSES = new Set(['paid', 'awaiting_dispatch']);

interface DispatchCalendarProps {
  onExported?: () => void;
}

export default function DispatchCalendar({ onExported }: DispatchCalendarProps) {
  const [orders, setOrders] = useState<CalendarOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadOrders = useCallback(() => {
    return fetch('/api/admin/orders')
      .then(r => r.json())
      .then(data => {
        setOrders(Array.isArray(data.orders) ? data.orders : []);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadOrders().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadOrders]);

  async function handleExportCsv(date: string) {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/admin/dispatch/csv?date=${date}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setExportError(data?.error ?? 'Nothing to export for this day.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `windsor-beauty-dispatch-${date}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      await loadOrders();
      onExported?.();
    } catch {
      setExportError('Could not export. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  // Group orders by calendar date (YYYY-MM-DD), using UK local time so an
  // order placed just after midnight BST isn't bucketed under the previous day.
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarOrder[]>();
    for (const o of orders) {
      if (!o.createdAt) continue;
      const date = londonDateString(o.createdAt);
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(o);
    }
    return map;
  }, [orders]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const today = londonDateString(new Date());

  // Build the day grid: nulls = padding cells before the 1st
  const calendarCells = useMemo(() => {
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [
      ...Array(firstDow).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    // Pad end to complete the last week row
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  // Summary stats for the month in view
  const monthStats = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    let count = 0;
    let revenue = 0;
    byDate.forEach((dayOrders, date) => {
      if (date.startsWith(prefix)) {
        count += dayOrders.length;
        revenue += sumMoney(dayOrders.map((o: CalendarOrder) => o.total));
      }
    });
    return { count, revenue };
  }, [byDate, year, month]);

  // Memoised because selectedStats below depends on it. Built fresh on every
  // render, the `?? []` produced a brand-new empty array each time, so the
  // stats useMemo saw a changed dependency and recomputed on every render even
  // when nothing about the day had changed.
  const selectedOrders = useMemo(
    () => (selectedDay ? (byDate.get(selectedDay) ?? []) : []),
    [selectedDay, byDate]
  );
  const selectedRevenue = sumMoney(selectedOrders.map(o => o.total));
  const hasExportable = selectedOrders.some(o => EXPORTABLE_STATUSES.has(o.status));

  // Payment/dispatch breakdown for the selected day's orders.
  const selectedStats = useMemo(() => {
    let paid = 0, unpaid = 0, dispatched = 0, awaitingDispatch = 0;
    for (const o of selectedOrders) {
      if (getPaymentStatus(o.status) === 'paid') paid += 1; else unpaid += 1;
      const ds = getDispatchStatus(o.status);
      if (ds === 'dispatched') dispatched += 1;
      else if (ds === 'awaiting') awaitingDispatch += 1;
    }
    return { paid, unpaid, dispatched, awaitingDispatch };
  }, [selectedOrders]);

  if (loading) {
    return <p className="text-xs text-stone-400 py-4">Loading calendar...</p>;
  }

  return (
    <div className="border border-stone-200 bg-white">

      {/* Calendar header: month nav + month stats */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setViewDate(new Date(year, month - 1, 1)); setSelectedDay(null); }}
            className="w-7 h-7 flex items-center justify-center text-stone-400 hover:text-gold-700 hover:bg-gold-50 rounded-sm transition-colors text-sm"
          >
            ‹
          </button>
          <div className="text-center min-w-[140px]">
            <span className="text-sm font-semibold text-stone-800">
              {MONTH_NAMES[month]} {year}
            </span>
          </div>
          <button
            onClick={() => { setViewDate(new Date(year, month + 1, 1)); setSelectedDay(null); }}
            className="w-7 h-7 flex items-center justify-center text-stone-400 hover:text-gold-700 hover:bg-gold-50 rounded-sm transition-colors text-sm"
          >
            ›
          </button>
        </div>
        <div className="flex items-center gap-6 text-right">
          <div>
            <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400">Orders this month</p>
            <p className="text-base font-semibold text-stone-800">{monthStats.count}</p>
          </div>
          <div>
            <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400">Revenue this month</p>
            <p className="text-base font-semibold text-gold-700">£{monthStats.revenue.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Day-of-week header row */}
      <div className="grid grid-cols-7 border-b border-stone-100">
        {DAY_LABELS.map(d => (
          <div key={d} className="py-2 text-center text-[9px] tracking-[0.18em] uppercase text-stone-400 font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 divide-x divide-y divide-stone-100">
        {calendarCells.map((day, idx) => {
          if (day === null) {
            return <div key={`pad-${idx}`} className="h-16 bg-stone-50/60" />;
          }

          const iso = isoDate(year, month, day);
          const dayOrders = byDate.get(iso) ?? [];
          const count = dayOrders.length;
          const isToday = iso === today;
          const isSelected = iso === selectedDay;
          const hasOrders = count > 0;

          // Day revenue
          const dayRevenue = dayOrders.reduce((s, o) => s + o.total, 0);
          const dayAwaitingDispatch = dayOrders.filter(o => getDispatchStatus(o.status) === 'awaiting').length;

          return (
            <div
              key={iso}
              onClick={() => hasOrders ? setSelectedDay(isSelected ? null : iso) : undefined}
              className={`h-16 p-1.5 flex flex-col justify-between transition-colors relative ${
                isSelected
                  ? 'bg-gold-700'
                  : hasOrders
                    ? 'bg-white hover:bg-gold-50 cursor-pointer'
                    : 'bg-white'
              }`}
            >
              {/* Date number */}
              <span className={`text-xs font-medium ${
                isSelected
                  ? 'text-white'
                  : isToday
                    ? 'text-gold-700 font-bold'
                    : 'text-stone-500'
              }`}>
                {day}
                {isToday && !isSelected && (
                  <span className="ml-1 w-1 h-1 rounded-full bg-gold-700 inline-block align-middle" />
                )}
              </span>

              {/* Order count + revenue */}
              {hasOrders && (
                <div className="flex flex-col gap-0.5">
                  <span className={`text-[9px] font-semibold leading-none ${isSelected ? 'text-white' : 'text-gold-700'}`}>
                    {count} order{count !== 1 ? 's' : ''}
                  </span>
                  <span className={`text-[8px] leading-none ${isSelected ? 'text-white/80' : 'text-stone-400'}`}>
                    £{dayRevenue.toFixed(0)}
                  </span>
                </div>
              )}

              {/* Awaiting-dispatch indicator */}
              {dayAwaitingDispatch > 0 && (
                <span
                  title={`${dayAwaitingDispatch} order${dayAwaitingDispatch !== 1 ? 's' : ''} awaiting dispatch`}
                  className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-sky-400'}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Selected day detail panel */}
      {selectedDay && selectedOrders.length > 0 && (
        <div className="border-t border-stone-200">
          {/* Panel heading */}
          <div className="flex items-center justify-between px-5 py-3 bg-gold-700">
            <div>
              <p className="text-xs font-semibold text-white">{formatDayHeading(selectedDay)}</p>
              <p className="text-[10px] text-white/80 mt-0.5">
                {selectedOrders.length} order{selectedOrders.length !== 1 ? 's' : ''} &nbsp;·&nbsp; £{selectedRevenue.toFixed(2)} total
              </p>
            </div>
            <div className="flex items-center gap-2">
              {hasExportable && (
                <button
                  onClick={e => { e.stopPropagation(); handleExportCsv(selectedDay); }}
                  disabled={exporting}
                  className="text-[9px] tracking-[0.15em] uppercase text-white/90 hover:text-white border border-white/30 hover:border-white/60 disabled:opacity-50 px-3 py-1 transition-colors"
                >
                  {exporting ? 'Exporting...' : 'Export CSV'}
                </button>
              )}
              <button
                onClick={() => setSelectedDay(null)}
                className="text-white/70 hover:text-white text-sm transition-colors px-2"
              >
                ✕
              </button>
            </div>
          </div>

          {exportError && (
            <p className="px-5 py-2 text-[10px] text-red-500 bg-red-50 border-b border-red-100">{exportError}</p>
          )}

          {/* Day breakdown: payment + dispatch progress at a glance */}
          <div className="flex items-center gap-4 px-5 py-2 bg-stone-50 border-b border-stone-100 text-[10px] flex-wrap">
            <span className="text-green-600"><span className="font-semibold">{selectedStats.paid}</span> paid</span>
            <span className="text-orange-500"><span className="font-semibold">{selectedStats.unpaid}</span> awaiting payment</span>
            <span className="text-gold-700"><span className="font-semibold">{selectedStats.dispatched}</span> dispatched</span>
            <span className="text-sky-600"><span className="font-semibold">{selectedStats.awaitingDispatch}</span> awaiting dispatch</span>
          </div>

          {/* Order rows */}
          <div className="divide-y divide-stone-100">
            {selectedOrders.map(o => {
              const itemsSummary = o.items
                .map(i => `${i.quantity}× ${i.name}${i.variant ? ` (${i.variant})` : ''}`)
                .join(', ');
              const statusChip = STATUS_CHIP[o.status] ?? 'bg-stone-100 text-stone-500';
              const statusText = STATUS_LABEL[o.status] ?? o.status;
              const paymentStatus = getPaymentStatus(o.status);
              const dispatchStatus = getDispatchStatus(o.status);

              return (
                <div key={o.orderNumber} className="px-5 py-3">
                  <div className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-4 items-start">
                    {/* Order number */}
                    <span className="font-mono text-[11px] text-gold-700 tracking-wider mt-0.5">{o.orderNumber}</span>

                    {/* Customer */}
                    <div>
                      <p className="text-xs text-stone-700 font-medium">{o.customerName}</p>
                      <p className="text-[10px] text-stone-400">{o.email}</p>
                    </div>

                    {/* Items */}
                    <p className="text-[11px] text-stone-500 leading-relaxed">{itemsSummary}</p>

                    {/* Total */}
                    <span className="text-xs font-semibold text-stone-700 whitespace-nowrap">£{o.total.toFixed(2)}</span>

                    {/* Status */}
                    <span className={`text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 font-medium whitespace-nowrap ${statusChip}`}>
                      {statusText}
                    </span>
                  </div>

                  {/* Payment + dispatch breakdown */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 font-medium whitespace-nowrap ${PAYMENT_STATUS_CHIP[paymentStatus]}`}>
                      {PAYMENT_STATUS_LABEL[paymentStatus]}
                    </span>
                    <span className={`text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 font-medium whitespace-nowrap ${DISPATCH_STATUS_CHIP[dispatchStatus]}`}>
                      {DISPATCH_STATUS_LABEL[dispatchStatus]}
                    </span>
                    {o.paymentMethod && (
                      <span className="text-[9px] text-stone-400">via {o.paymentMethod}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
