'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import type { SegmentCustomer, SegmentFacets } from '@/lib/db/customerSegments';

// Find Customers (task c22cb6cb).
//
// Kieran, 19 September 2026: "I should be able to click some drop downs and filter by that and then
// market those people... allow me to tick the individuals that I want based on the drop down and use
// an internal system which we already have to draft emails."
//
// A SEPARATE SCREEN, not more controls on the customers list. That list answers "who is this
// person"; this answers "who shall I write to this week", and they want opposite layouts. It also
// keeps a long, already-busy page out of the way of a change that touches money.
//
// IT SENDS NOTHING ITSELF. Ticking people and pressing Export gives a spreadsheet of them.

interface Facets extends SegmentFacets {}

interface Result {
  facets: Facets;
  customers: SegmentCustomer[];
  products: { name: string; units: number; buyers: number }[];
  total: number;
  reachable: number;
}

const EMPTY_FILTERS = {
  joinedFrom: '', joinedTo: '', referredBy: '', referredByContains: '', campaign: '',
  town: '', postcodeStart: '', boughtProduct: '', hasOrdered: '', minSpend: '',
  marketingConsent: '', emailVerified: '',
};

type Filters = typeof EMPTY_FILTERS;

function money(value: number) {
  return `£${value.toFixed(2)}`;
}

function shortDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function FindCustomersPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ticked, setTicked] = useState<Set<number>>(new Set());

  const set = (key: keyof Filters, value: string) => setFilters(f => ({ ...f, [key]: value }));

  const search = useCallback(async (current: Filters) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(current)) {
        if (value) params.set(key, value);
      }
      const res = await fetch(`/api/admin/customer-segments?${params.toString()}`);
      const data = await res.json().catch(() => null);
      /* A SEARCH THAT FAILED IS NOT AN EMPTY ONE. Showing "0 customers" after a broken query is the
         one answer nobody would question, and it would be wrong. */
      if (!res.ok || !data || data.error || !Array.isArray(data.customers)) {
        throw new Error(data?.error || 'The search could not run.');
      }
      setResult(data);
      // Anyone ticked who is no longer in the results is dropped, so the count on the button always
      // matches what is on screen.
      setTicked(prev => {
        const stillHere = new Set<number>(data.customers.map((c: SegmentCustomer) => c.id));
        return new Set(Array.from(prev).filter(id => stillHere.has(id)));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The search could not run.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { search(EMPTY_FILTERS); }, [search]);

  const customers = result?.customers ?? [];
  const tickedList = useMemo(() => customers.filter(c => ticked.has(c.id)), [customers, ticked]);
  const tickedReachable = tickedList.filter(c => c.canBeEmailed);
  const allTicked = customers.length > 0 && tickedList.length === customers.length;

  function toggleAll() {
    setTicked(allTicked ? new Set() : new Set(customers.map(c => c.id)));
  }

  function toggle(id: number) {
    setTicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exportTicked() {
    const rows = tickedList.length > 0 ? tickedList : customers;
    const head = ['First and last name', 'Email', 'Town', 'Postcode', 'How they heard', 'Campaign',
      'Orders', 'Total spent', 'Last order', 'Agreed to marketing', 'Can be emailed', 'Joined'];
    const body = rows.map(c => [
      c.name ?? '', c.email, c.town ?? '', c.postcode ?? '', c.referredBy ?? '', c.campaign ?? '',
      String(c.orderCount), c.totalSpent.toFixed(2), shortDate(c.lastOrderAt),
      c.marketingConsent ? 'Yes' : 'No', c.canBeEmailed ? 'Yes' : 'No', shortDate(c.createdAt),
    ]);
    const csv = [head, ...body]
      .map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'windsor-beauty-customers.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const facets = result?.facets;

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminSidebar />
      <div className="lg:pl-56">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-stone-800 mb-0.5">Find Customers</h1>
              <p className="text-xs text-stone-400">
                Pick who you want, tick them, then email or export them.
              </p>
            </div>
            <Link
              href="/admin/customers"
              className="text-[10px] tracking-[0.2em] uppercase border border-gold-300 text-gold-700 px-4 py-2.5 hover:border-gold-500 hover:bg-gold-50 transition-colors"
            >
              All Customers
            </Link>
          </div>

          {/* ── The filters ────────────────────────────────────────────────────────────────── */}
          <div className="bg-white border border-stone-200 p-5 mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Joined from">
                <input type="date" value={filters.joinedFrom} onChange={e => set('joinedFrom', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Joined up to">
                <input type="date" value={filters.joinedTo} onChange={e => set('joinedTo', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Anything about how they heard" hint="Finds a name however it was typed: PAG, Pag gym, PAG - John Berry.">
                <input value={filters.referredByContains} onChange={e => set('referredByContains', e.target.value)} placeholder="e.g. PAG, Ross" className={inputClass} />
              </Field>

              <Field label="How they heard about us">
                <select value={filters.referredBy} onChange={e => set('referredBy', e.target.value)} className={inputClass}>
                  <option value="">Anyone</option>
                  {facets?.referralSources.map(o => (
                    <option key={o.value} value={o.value}>{o.value} ({o.count})</option>
                  ))}
                </select>
              </Field>
              <Field label="Campaign or partner">
                <select value={filters.campaign} onChange={e => set('campaign', e.target.value)} className={inputClass}>
                  <option value="">Anyone</option>
                  {facets?.campaigns.map(o => (
                    <option key={o.value} value={o.value}>{o.value} ({o.count})</option>
                  ))}
                </select>
              </Field>
              <Field label="They have bought">
                <select value={filters.boughtProduct} onChange={e => set('boughtProduct', e.target.value)} className={inputClass}>
                  <option value="">Anything</option>
                  {facets?.products.map(o => (
                    <option key={o.value} value={o.value}>{o.value} ({o.count})</option>
                  ))}
                </select>
              </Field>

              <Field label="Town">
                <select value={filters.town} onChange={e => set('town', e.target.value)} className={inputClass}>
                  <option value="">Anywhere</option>
                  {facets?.towns.map(o => (
                    <option key={o.value} value={o.value}>{o.value} ({o.count})</option>
                  ))}
                </select>
              </Field>
              <Field label="Part of the country" hint="By postcode. There is no county in the data, so this is the closest real thing.">
                <select value={filters.postcodeStart} onChange={e => set('postcodeStart', e.target.value)} className={inputClass}>
                  <option value="">Anywhere</option>
                  {facets?.postcodeAreas.map(o => (
                    <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
                  ))}
                </select>
              </Field>
              <Field label="Have they ordered?">
                <select value={filters.hasOrdered} onChange={e => set('hasOrdered', e.target.value)} className={inputClass}>
                  <option value="">Either</option>
                  <option value="yes">Yes, they have ordered</option>
                  <option value="no">No, never ordered</option>
                </select>
              </Field>

              <Field label="Spent at least">
                <input type="number" min="0" step="10" value={filters.minSpend} onChange={e => set('minSpend', e.target.value)} placeholder="£ any" className={inputClass} />
              </Field>
              <Field label="Agreed to marketing?">
                <select value={filters.marketingConsent} onChange={e => set('marketingConsent', e.target.value)} className={inputClass}>
                  <option value="">Either</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
              <Field label="Confirmed their email?">
                <select value={filters.emailVerified} onChange={e => set('emailVerified', e.target.value)} className={inputClass}>
                  <option value="">Either</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                type="button"
                onClick={() => search(filters)}
                disabled={loading}
                className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-3 hover:bg-gold-800 transition-colors disabled:opacity-40"
              >
                {loading ? 'Looking...' : 'Find them'}
              </button>
              <button
                type="button"
                onClick={() => { setFilters(EMPTY_FILTERS); search(EMPTY_FILTERS); }}
                className="border border-stone-300 text-stone-600 text-[10px] tracking-[0.18em] uppercase px-5 py-3 hover:border-gold-400 hover:text-gold-700 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {error && (
            <div className="border border-red-200 bg-red-50 px-5 py-3 mb-5 text-xs text-red-700">
              {error} Nothing is shown below, which is not the same as nobody matching.
            </div>
          )}

          {/* ── What was found, and what it can do ─────────────────────────────────────────── */}
          {result && (
            <div className="bg-white border border-stone-200 p-5 mb-5">
              <p className="text-sm text-stone-800 font-semibold">
                {result.total === 1 ? '1 customer matches' : `${result.total} customers match`}
                {tickedList.length > 0 && <span className="text-gold-700"> · {tickedList.length} ticked</span>}
              </p>
              <p className="text-[11px] text-stone-500 mt-1">
                {tickedList.length > 0
                  ? `${tickedReachable.length} of the ${tickedList.length} ticked can be emailed. `
                  : `${result.reachable} of them can be emailed. `}
                The rest have not agreed to marketing, have unsubscribed, or have no marketing record.
              </p>

              <div className="flex flex-wrap gap-2 mt-3.5">
                <button
                  type="button"
                  onClick={exportTicked}
                  disabled={customers.length === 0}
                  className="border border-gold-300 text-gold-700 text-[10px] tracking-[0.18em] uppercase px-5 py-2.5 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40"
                >
                  {tickedList.length > 0 ? 'Export the ticked' : 'Export all of these'}
                </button>
              </div>

              {result.products.length > 0 && (
                <div className="mt-4 pt-4 border-t border-stone-100">
                  <p className="text-[9px] tracking-[0.18em] uppercase text-stone-400 mb-2">
                    What this group buys
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.products.slice(0, 12).map(p => (
                      <span key={p.name} className="text-[10px] border border-stone-200 bg-stone-50 text-stone-600 px-2.5 py-1">
                        {p.name} <span className="text-stone-400">· {p.units} sold to {p.buyers}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── The people ─────────────────────────────────────────────────────────────────── */}
          <div className="bg-white border border-stone-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        aria-label="Tick everyone found"
                        checked={allTicked}
                        onChange={toggleAll}
                        className="h-4 w-4 accent-[#8a6d1f] cursor-pointer"
                      />
                    </th>
                    {['Customer', 'Where', 'How they heard', 'Orders', 'Spent', 'Joined'].map(h => (
                      <th key={h} className="px-4 py-3 text-[9px] tracking-[0.18em] uppercase text-stone-400 font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {loading && (
                    <tr><td colSpan={7} className="px-4 py-8 text-xs text-stone-400">Looking...</td></tr>
                  )}
                  {!loading && customers.length === 0 && !error && (
                    <tr><td colSpan={7} className="px-4 py-8 text-xs text-stone-400">
                      Nobody matches that. Try widening it.
                    </td></tr>
                  )}
                  {!loading && customers.map(c => (
                    <tr key={c.id} className={ticked.has(c.id) ? 'bg-gold-50/40' : 'hover:bg-stone-50'}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Tick ${c.name || c.email}`}
                          checked={ticked.has(c.id)}
                          onChange={() => toggle(c.id)}
                          className="h-4 w-4 accent-[#8a6d1f] cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/customers/${c.id}`} className="text-[11px] font-semibold text-stone-700 hover:text-gold-700 transition-colors">
                          {c.name || c.email}
                        </Link>
                        <p className="text-[10px] text-stone-400">{c.email}</p>
                        {!c.canBeEmailed && (
                          <p className="text-[9px] text-amber-600 mt-0.5">Cannot be emailed</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-stone-500 whitespace-nowrap">
                        {c.town || '—'}
                        {c.postcode && <span className="text-stone-400"> · {c.postcode}</span>}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-stone-500 max-w-[220px]">
                        <span className="block truncate">{c.referredBy || '—'}</span>
                        {c.campaign && <span className="block truncate text-gold-700">{c.campaign}</span>}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-stone-600">{c.orderCount}</td>
                      <td className="px-4 py-3 text-[11px] text-stone-600 whitespace-nowrap">{money(c.totalSpent)}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-400 whitespace-nowrap">{shortDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

const inputClass = 'w-full border border-stone-300 px-3 py-2 text-xs text-stone-700 focus:border-gold-700 outline-none bg-white';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-stone-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}
