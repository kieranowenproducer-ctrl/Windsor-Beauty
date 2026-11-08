'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import AdminSidebar from '@/components/admin/AdminSidebar';
import type { MonthRow, SourceRow } from '@/components/admin/customer-stats/CustomerStatsCharts';

const money = (value: number) => `£${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Customer Stats (Samuel, 1 Nov 2026): month by month, how many people signed up, how many
// verified their email, where they came from, and whether they ordered and how much.
//
// The numbers are worked out fresh from the customer list every time this page loads, every
// time Refresh is pressed, every 15 seconds while it is open, and whenever the tab comes back into
// view, so a new sign-up shows without anybody having to remember to update anything. How each
// number is counted is written in src/lib/db/customerStats.ts.

const Charts = {
  People: dynamic(() => import('@/components/admin/customer-stats/CustomerStatsCharts').then(m => m.MonthlyPeopleChart), { ssr: false }),
  Spend: dynamic(() => import('@/components/admin/customer-stats/CustomerStatsCharts').then(m => m.MonthlySpendChart), { ssr: false }),
  Sources: dynamic(() => import('@/components/admin/customer-stats/CustomerStatsCharts').then(m => m.SourcesChart), { ssr: false }),
};

interface Person {
  id: number;
  name: string;
  email: string;
  month: string;
  createdAt: string;
  verified: boolean;
  source: string;
  sourceDetail: string | null;
  sourceKnown: boolean;
  paidOrders: number;
  spent: number;
}

const ALL = 'all';
// Samuel wanted it live, not something to come back to: re-counted every 15 seconds while open.
const REFRESH_EVERY_MS = 15_000;

function ukMonthNow(): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  return `${y}-${m}`;
}

function monthLabel(month: string, style: 'long' | 'short' = 'long'): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return style === 'long'
    ? d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

/** Every month from the first sign-up to this month, so a quiet month shows as nought, not missing. */
function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '0%';
}

function ukDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
}

function ukTimeSeconds(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/London' });
}

const th = 'text-left text-[9px] tracking-[0.15em] uppercase text-stone-500 font-normal px-3 py-2';
const td = 'px-3 py-2 text-xs text-stone-700';
const num = 'px-3 py-2 text-xs text-stone-700 text-right tabular-nums';

export default function AdminCustomerStatsPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(ukMonthNow());
  const requestNumber = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback((quiet: boolean) => {
    const mine = ++requestNumber.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    if (!quiet) setRefreshing(true);
    return fetch('/api/admin/customer-stats', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Stats unavailable');
        return response.json();
      })
      .then(d => {
        if (mine !== requestNumber.current) return;
        if (!Array.isArray(d.people) || !d.dbConfigured) throw new Error('Stats unavailable');
        setFailed(false);
        setPeople(d.people);
        setUpdatedAt(d.at ?? new Date().toISOString());
      })
      .catch(() => {
        if (mine === requestNumber.current) { setFailed(true); setPeople([]); setUpdatedAt(null); }
      })
      .finally(() => {
        if (mine !== requestNumber.current) return;
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    const sequence = requestNumber;
    const request = activeRequest;
    load(false);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, REFRESH_EVERY_MS);
    const onShow = () => { if (document.visibilityState === 'visible') load(true); };
    document.addEventListener('visibilitychange', onShow);
    return () => { ++sequence.current; request.current?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
  }, [load]);

  const thisMonth = ukMonthNow();

  // Oldest first for the charts, because time reads left to right.
  const months: MonthRow[] = useMemo(() => {
    if (people.length === 0) return [];
    const first = people.reduce((min, p) => (p.month < min ? p.month : min), thisMonth);
    return monthsBetween(first, thisMonth).map(month => {
      const these = people.filter(p => p.month === month);
      return {
        month,
        label: monthLabel(month),
        shortLabel: monthLabel(month, 'short'),
        signups: these.length,
        verified: these.filter(p => p.verified).length,
        ordered: these.filter(p => p.paidOrders > 0).length,
        paidOrders: these.reduce((s, p) => s + p.paidOrders, 0),
        spent: Math.round(these.reduce((s, p) => s + p.spent, 0) * 100) / 100,
      };
    });
  }, [people, thisMonth]);

  // Every list on this dashboard is newest first.
  const monthsNewestFirst = useMemo(() => [...months].reverse(), [months]);

  const inSelected = useMemo(
    () => (selected === ALL ? people : people.filter(p => p.month === selected)),
    [people, selected],
  );

  const totals = useMemo(() => ({
    signups: inSelected.length,
    verified: inSelected.filter(p => p.verified).length,
    ordered: inSelected.filter(p => p.paidOrders > 0).length,
    spent: Math.round(inSelected.reduce((s, p) => s + p.spent, 0) * 100) / 100,
  }), [inSelected]);

  const sources: SourceRow[] = useMemo(() => {
    const map = new Map<string, SourceRow>();
    for (const p of inSelected) {
      const row = map.get(p.source) ?? { source: p.source, signups: 0, verified: 0, ordered: 0, spent: 0 };
      row.signups += 1;
      if (p.verified) row.verified += 1;
      if (p.paidOrders > 0) row.ordered += 1;
      row.spent = Math.round((row.spent + p.spent) * 100) / 100;
      map.set(p.source, row);
    }
    return Array.from(map.values()).sort((a, b) => b.signups - a.signups || a.source.localeCompare(b.source));
  }, [inSelected]);

  const selectedName = selected === ALL ? 'All time' : monthLabel(selected);
  const pickable = monthsNewestFirst.map(m => m.month);
  if (!pickable.includes(selected) && selected !== ALL && !loading) pickable.unshift(selected);

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />

      <main className="flex-1 p-4 sm:p-8 overflow-clip">
        <div className="max-w-6xl">

          <Link
            href="/admin/dashboard"
            className="text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-700 transition-colors mb-6 inline-block"
          >
            &larr; Dashboard
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div className="max-w-2xl">
              <h1 className="text-lg font-semibold text-stone-800 mb-0.5">Customer Stats</h1>
              <p className="text-xs text-stone-500">
                Month by month: how many people signed up, how many verified their email, where they
                came from, and whether they ordered and how much. Months are UK months. Ordered means
                a paid order; spent leaves out cancelled and refunded orders. Deleted accounts are not
                counted.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {updatedAt && (
                <span className="flex items-center gap-1.5 text-[10px] text-stone-500" title="Re-counted every 15 seconds while this page is open">
                  <span className={`w-1.5 h-1.5 rounded-full ${failed ? 'bg-stone-400' : 'bg-green-600'}`} aria-hidden="true" />
                  {failed ? 'Paused' : 'Live'}, updated {ukTimeSeconds(updatedAt)}
                </span>
              )}
              <button
                type="button"
                onClick={() => load(false)}
                disabled={refreshing}
                className="text-[10px] tracking-[0.15em] uppercase whitespace-nowrap border border-stone-300 bg-white text-stone-700 px-4 py-2 hover:border-gold-500 hover:text-gold-700 transition-colors disabled:opacity-60"
              >
                {refreshing ? 'Refreshing' : 'Refresh'}
              </button>
            </div>
          </div>

          {failed && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-4 py-3 mb-6">
              The stats could not be loaded just now. Press Refresh to try again.
            </p>
          )}

          {loading ? (
            <p className="text-xs text-stone-500">Loading the customer stats...</p>
          ) : failed ? null : people.length === 0 ? (
            <p className="text-xs text-stone-500">There are no customers yet.</p>
          ) : (
            <>
              {/* Month by month */}
              <section className="bg-white border border-stone-200 p-4 sm:p-5 mb-5">
                <h2 className="text-sm font-semibold text-stone-800 mb-1">Every month</h2>
                <p className="text-[11px] text-stone-500 mb-4">
                  People who signed up in each month, how many of them have verified, and how many have ordered.
                </p>
                <Charts.People rows={months} />
              </section>

              <section className="bg-white border border-stone-200 p-4 sm:p-5 mb-5">
                <h2 className="text-sm font-semibold text-stone-800 mb-1">Money spent by each month&apos;s new customers</h2>
                <p className="text-[11px] text-stone-500 mb-4">
                  Everything the people who signed up that month have spent so far, on any date.
                </p>
                <Charts.Spend rows={months} />
              </section>

              <section className="bg-white border border-stone-200 mb-8 overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="border-b border-stone-200 bg-stone-50">
                    <tr>
                      <th className={th}>Month</th>
                      <th className={`${th} text-right`}>Signed up</th>
                      <th className={`${th} text-right`}>Verified</th>
                      <th className={`${th} text-right`}>Ordered</th>
                      <th className={`${th} text-right`}>Paid orders</th>
                      <th className={`${th} text-right`}>Spent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {monthsNewestFirst.map(m => (
                      <tr
                        key={m.month}
                        onClick={() => setSelected(m.month)}
                        className={`cursor-pointer hover:bg-gold-50 ${selected === m.month ? 'bg-gold-50' : ''}`}
                      >
                        <td className={`${td} font-medium`}>{m.label}{m.month === thisMonth ? ' (so far)' : ''}</td>
                        <td className={num}>{m.signups}</td>
                        <td className={num}>{m.verified} <span className="text-stone-500">({pct(m.verified, m.signups)})</span></td>
                        <td className={num}>{m.ordered} <span className="text-stone-500">({pct(m.ordered, m.signups)})</span></td>
                        <td className={num}>{m.paidOrders}</td>
                        <td className={num}>{money(m.spent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {/* One month in detail */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <h2 className="text-sm font-semibold text-stone-800">Look closer at</h2>
                <select
                  value={selected}
                  onChange={e => setSelected(e.target.value)}
                  aria-label="Choose a month"
                  className="text-xs border border-stone-300 bg-white text-stone-700 px-3 py-2 focus:outline-none focus:border-gold-500"
                >
                  {pickable.map(m => (
                    <option key={m} value={m}>{monthLabel(m)}</option>
                  ))}
                  <option value={ALL}>All time</option>
                </select>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="bg-white border border-stone-200 p-4">
                  <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Signed up</p>
                  <p className="text-lg font-semibold text-stone-800 tabular-nums">{totals.signups}</p>
                </div>
                <div className="bg-white border border-stone-200 p-4">
                  <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Verified</p>
                  <p className="text-lg font-semibold text-stone-800 tabular-nums">
                    {totals.verified} <span className="text-xs font-normal text-stone-500">{pct(totals.verified, totals.signups)}</span>
                  </p>
                </div>
                <div className="bg-white border border-stone-200 p-4">
                  <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Ordered</p>
                  <p className="text-lg font-semibold text-stone-800 tabular-nums">
                    {totals.ordered} <span className="text-xs font-normal text-stone-500">{pct(totals.ordered, totals.signups)}</span>
                  </p>
                </div>
                <div className="bg-white border border-stone-200 p-4">
                  <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Spent</p>
                  <p className="text-lg font-semibold text-gold-700 tabular-nums">{money(totals.spent)}</p>
                </div>
              </div>

              {totals.signups === 0 ? (
                <p className="text-xs text-stone-500 mb-8">Nobody signed up in {selectedName}.</p>
              ) : (
                <>
                  <section className="bg-white border border-stone-200 p-4 sm:p-5 mb-5">
                    <h3 className="text-sm font-semibold text-stone-800 mb-1">Where they came from: {selectedName}</h3>
                    <p className="text-[11px] text-stone-500 mb-4">
                      From the sign-up form answer, or the QR or affiliate link they arrived on.
                    </p>
                    <Charts.Sources rows={sources} />
                  </section>

                  <section className="bg-white border border-stone-200 mb-5 overflow-x-auto">
                    <table className="w-full min-w-[560px]">
                      <thead className="border-b border-stone-200 bg-stone-50">
                        <tr>
                          <th className={th}>Came from</th>
                          <th className={`${th} text-right`}>Signed up</th>
                          <th className={`${th} text-right`}>Verified</th>
                          <th className={`${th} text-right`}>Ordered</th>
                          <th className={`${th} text-right`}>Spent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {sources.map(s => (
                          <tr key={s.source}>
                            <td className={`${td} font-medium`}>{s.source}</td>
                            <td className={num}>{s.signups}</td>
                            <td className={num}>{s.verified}</td>
                            <td className={num}>{s.ordered}</td>
                            <td className={num}>{money(s.spent)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>

                  <section className="bg-white border border-stone-200 mb-8 overflow-x-auto">
                    <h3 className="text-sm font-semibold text-stone-800 px-4 sm:px-5 pt-4 pb-3">
                      Everyone who signed up: {selectedName}
                    </h3>
                    <table className="w-full min-w-[720px]">
                      <thead className="border-y border-stone-200 bg-stone-50">
                        <tr>
                          <th className={th}>Name</th>
                          <th className={th}>Signed up</th>
                          <th className={th}>Verified</th>
                          <th className={th}>Came from</th>
                          <th className={`${th} text-right`}>Paid orders</th>
                          <th className={`${th} text-right`}>Spent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {inSelected.map(p => (
                          <tr key={p.id}>
                            <td className={td}>
                              <Link href={`/admin/customers/${p.id}`} className="text-stone-800 hover:text-gold-700 font-medium">
                                {p.name}
                              </Link>
                              <span className="block text-[10px] text-stone-500">{p.email}</span>
                            </td>
                            <td className={`${td} whitespace-nowrap`}>{ukDate(p.createdAt)}</td>
                            <td className={td}>{p.verified ? 'Yes' : <span className="text-stone-500">Not yet</span>}</td>
                            <td className={td}>
                              <span className={p.sourceKnown ? '' : 'text-stone-500'}>{p.source}</span>
                              {p.sourceDetail && <span className="block text-[10px] text-stone-500">{p.sourceDetail}</span>}
                            </td>
                            <td className={num}>{p.paidOrders}</td>
                            <td className={num}>{p.spent > 0 ? money(p.spent) : <span className="text-stone-500">None</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
