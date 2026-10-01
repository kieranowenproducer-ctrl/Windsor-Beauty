'use client';

/**
 * "Most Popular Products" on the admin Dashboard (task aa684446).
 *
 * The dashboard could say how many orders and how much money, but never which products. This is the
 * answer to "what actually sells", with two things bolted on that the request turned on:
 *   - tick boxes to include or leave out a kind of customer, so "what do the PAG members buy" is a
 *     question you can ask, and
 *   - the list of people behind any one product, with a button that opens the email composer
 *     already addressed to them.
 *
 * It starts closed. The dashboard is the page everyone lands on and it is already long; a report
 * nobody asked for should not push the day's orders further down the screen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatMoney, formatWholeNumber } from '@/lib/money';

type GroupKind = 'referral' | 'campaign';

interface ProductRow {
  key: string;
  name: string;
  slug: string | null;
  units: number;
  orders: number;
  customers: number;
  revenue: number;
  firstBought: string | null;
  lastBought: string | null;
}

interface GroupRow {
  key: string;
  label: string;
  orders: number;
  customers: number;
}

interface BuyerRow {
  email: string;
  name: string;
  units: number;
  orders: number;
  spend: number;
  lastBought: string | null;
  group: string;
}

const GROUP_KINDS: { key: GroupKind; label: string; note: string }[] = [
  {
    key: 'referral',
    label: 'How they heard about us',
    note: 'The answer each member gave when they signed up, e.g. PAG, Facebook, a friend.',
  },
  {
    key: 'campaign',
    label: 'Referral campaign',
    note: 'The QR campaign a member came in through. Everyone else counts as direct.',
  },
];

function shortDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TopProductsPanel() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<GroupKind>('referral');
  // Held as the groups LEFT OUT rather than the ones ticked, so that "nobody ticked" and "nothing
  // touched yet" can never look like the same thing. An empty list means everyone, which is what
  // somebody who has never opened the filter expects to see.
  const [excluded, setExcluded] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [totals, setTotals] = useState({ units: 0, orders: 0, customers: 0, revenue: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [buyers, setBuyers] = useState<BuyerRow[]>([]);
  const [buyersLoading, setBuyersLoading] = useState(false);
  const [buyersError, setBuyersError] = useState('');

  // The groups still ticked. Derived rather than stored, so a group that disappears (nobody in it
  // has ordered since) cannot leave a filter switched on that no tick box can turn off.
  const groupKeys = groups.map(g => g.key);
  const groupSignature = groupKeys.join('|');
  const included = excluded.length === 0 ? groupKeys : groupKeys.filter(key => !excluded.includes(key));
  const nothingTicked = groups.length > 0 && excluded.length > 0 && included.length === 0;

  /**
   * The query string, as a string. Deliberately a primitive: the effect below re-runs when it
   * changes, and an object rebuilt on every render would fetch forever.
   */
  const query = useMemo(() => {
    const search = new URLSearchParams({ groupBy: kind });
    if (excluded.length > 0) {
      const keep = groupSignature.split('|').filter(key => key && !excluded.includes(key));
      search.set('groups', keep.join('|'));
    }
    return search.toString();
    // groupSignature is a string of the group keys, so this recomputes when the groups themselves
    // change and not merely when the array is rebuilt by a reload.
  }, [kind, excluded, groupSignature]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/stats/top-products?${query}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Could not load the product figures.');
        return;
      }
      setProducts(Array.isArray(data.products) ? data.products : []);
      setGroups(Array.isArray(data.groups) ? data.groups : []);
      setTotals(data.totals ?? { units: 0, orders: 0, customers: 0, revenue: 0 });
      setLoaded(true);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  // Nothing is fetched until the panel is opened, so the dashboard costs exactly what it did
  // before for anyone who never opens it. After that, every change of grouping or tick box
  // reloads, which is the "it generates on screen for whichever box you ticked" behaviour.
  useEffect(() => {
    if (!open) return;
    setExpanded(null);
    // Every box unticked means "show me nobody", and asking the server for that would come back
    // reading as everyone. It is answered here instead, in words.
    if (nothingTicked) {
      setProducts([]);
      setTotals({ units: 0, orders: 0, customers: 0, revenue: 0 });
      return;
    }
    load();
  }, [open, load, nothingTicked]);

  async function openBuyers(product: ProductRow) {
    if (expanded === product.key) {
      setExpanded(null);
      return;
    }
    setExpanded(product.key);
    setBuyers([]);
    setBuyersError('');
    setBuyersLoading(true);
    try {
      const res = await fetch(`/api/admin/stats/top-products/buyers?${query}&product=${encodeURIComponent(product.key)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setBuyersError(data?.error || 'Could not load who bought this.');
        return;
      }
      setBuyers(Array.isArray(data.buyers) ? data.buyers : []);
    } catch {
      setBuyersError('Could not reach the server. Please try again.');
    } finally {
      setBuyersLoading(false);
    }
  }

  function toggleGroup(key: string) {
    setExcluded(list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]));
  }

  const allTicked = excluded.length === 0;
  const activeCount = included.length;

  return (
    <div className="mb-10">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-xs tracking-[0.18em] uppercase text-stone-500 font-semibold mb-1">Most Popular Products</h2>
          <p className="text-[10px] text-stone-500">
            What sells the most, and who buys it. Counts orders that have been paid for.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="shrink-0 bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-5 py-2.5 hover:bg-gold-800 transition-colors"
        >
          {open ? 'Hide' : 'Show most popular'}
        </button>
      </div>

      {open && (
        <div className="mt-4 bg-white border border-stone-200">
          {/* Controls */}
          <div className="px-5 py-4 border-b border-stone-100 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Group customers by</label>
              <select
                value={kind}
                onChange={e => { setKind(e.target.value as GroupKind); setExcluded([]); }}
                className="border border-stone-200 px-3 py-2 text-xs text-stone-600 bg-white focus:border-gold-400 outline-none"
              >
                {GROUP_KINDS.map(g => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </select>
              <p className="text-[9px] text-stone-500 mt-1 max-w-xs">
                {GROUP_KINDS.find(g => g.key === kind)?.note}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setFilterOpen(o => !o)}
              className={`text-[10px] tracking-[0.18em] uppercase px-5 py-2.5 border transition-colors ${
                allTicked
                  ? 'border-stone-300 text-stone-600 hover:border-gold-400 hover:text-gold-700'
                  : 'border-gold-400 bg-gold-50 text-gold-700'
              }`}
            >
              Filter {allTicked ? '' : `(${formatWholeNumber(activeCount)} of ${formatWholeNumber(groups.length)})`}
            </button>
          </div>

          {/* Tick boxes */}
          {filterOpen && (
            <div className="px-5 py-4 border-b border-stone-100 bg-stone-50/60">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500">
                  Include these customers
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setExcluded([])}
                    className="text-[9px] tracking-[0.15em] uppercase border border-stone-300 text-stone-600 px-3 py-1.5 hover:border-gold-400 hover:text-gold-700 transition-colors"
                  >
                    Everyone
                  </button>
                </div>
              </div>
              {groups.length === 0 ? (
                <p className="text-[10px] text-stone-500">No paid orders yet, so there is nobody to group.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {groups.map(group => {
                    const ticked = !excluded.includes(group.key);
                    return (
                      <label
                        key={group.key}
                        className={`flex items-start gap-2 border px-3 py-2 cursor-pointer transition-colors ${
                          ticked ? 'border-gold-300 bg-white' : 'border-stone-200 bg-white/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={ticked}
                          onChange={() => toggleGroup(group.key)}
                          className="mt-0.5 accent-gold-700"
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] text-stone-700 truncate">{group.label}</span>
                          <span className="block text-[9px] text-stone-500">
                            {formatWholeNumber(group.customers)} who {group.customers === 1 ? 'has' : 'have'} ordered · {formatWholeNumber(group.orders)} order{group.orders === 1 ? '' : 's'}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {excluded.length === 0 && groups.length > 0 && (
                <p className="text-[9px] text-stone-500 mt-3">
                  Everyone is included. Untick a group to leave those customers out.
                </p>
              )}
            </div>
          )}

          {/* Results */}
          <div className="px-5 py-4">
            {loading ? (
              <p className="text-xs text-stone-500">Working it out…</p>
            ) : error ? (
              <p className="text-xs text-red-600">{error}</p>
            ) : nothingTicked ? (
              <p className="text-xs text-stone-500">
                Every group is unticked, so there is nobody to count. Tick a group, or press Everyone.
              </p>
            ) : !loaded ? null : products.length === 0 ? (
              <p className="text-xs text-stone-500">
                Nothing to show for the customers you have ticked. Tick more groups, or press Everyone.
              </p>
            ) : (
              <>
                <p className="text-[10px] text-stone-500 mb-1">
                  {formatWholeNumber(totals.units)} item{totals.units === 1 ? '' : 's'} across {formatWholeNumber(totals.orders)} paid order{totals.orders === 1 ? '' : 's'}
                  {' '}from {formatWholeNumber(totals.customers)} customer{totals.customers === 1 ? '' : 's'}, worth &pound;{formatMoney(totals.revenue)}.
                </p>
                {/* Said plainly because this figure is NOT the Revenue tile above and never will
                    be: that one is money taken, this one is what the products themselves came to. */}
                <p className="text-[9px] text-stone-500 mb-4">
                  Product prices only, before delivery and any discount, so it will not match the Revenue figure above.
                </p>

                <div className="border border-stone-200 divide-y divide-stone-100">
                  {products.map((product, index) => {
                    const isOpen = expanded === product.key;
                    return (
                      <div key={product.key}>
                        <button
                          type="button"
                          onClick={() => openBuyers(product)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-stone-50 transition-colors"
                        >
                          <span className={`shrink-0 w-6 text-center text-[11px] font-semibold ${index === 0 ? 'text-gold-700' : 'text-stone-500'}`}>
                            {formatWholeNumber(index + 1)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs text-stone-700 truncate">{product.name}</span>
                            <span className="block text-[9px] text-stone-500">
                              {formatWholeNumber(product.orders)} order{product.orders === 1 ? '' : 's'} · {formatWholeNumber(product.customers)} customer{product.customers === 1 ? '' : 's'}
                              {product.lastBought ? ` · last bought ${shortDate(product.lastBought)}` : ''}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-xs font-semibold text-stone-800">{formatWholeNumber(product.units)} sold</span>
                            <span className="block text-[9px] text-stone-500">&pound;{formatMoney(product.revenue)}</span>
                          </span>
                          <span className={`shrink-0 text-stone-300 text-[10px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                        </button>

                        {isOpen && (
                          <div className="px-4 pb-4 pt-1 bg-stone-50/60">
                            {buyersLoading ? (
                              <p className="text-[11px] text-stone-500">Loading who bought it…</p>
                            ) : buyersError ? (
                              <p className="text-[11px] text-red-600">{buyersError}</p>
                            ) : buyers.length === 0 ? (
                              <p className="text-[11px] text-stone-500">Nobody in the ticked groups has bought this.</p>
                            ) : (
                              <>
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                  <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500">
                                    Who buys it ({formatWholeNumber(buyers.length)})
                                  </p>
                                </div>
                                <div className="bg-white border border-stone-200 divide-y divide-stone-50">
                                  {buyers.map(buyer => (
                                    <div key={buyer.email} className="px-3 py-2 flex items-center justify-between gap-3">
                                      <span className="min-w-0">
                                        <span className="block text-[11px] text-stone-700 truncate">{buyer.name}</span>
                                        <span className="block text-[9px] text-stone-500 truncate">
                                          {buyer.email} · {buyer.group}
                                        </span>
                                      </span>
                                      <span className="shrink-0 text-right">
                                        <span className="block text-[11px] text-stone-700">{formatWholeNumber(buyer.units)} bought</span>
                                        <span className="block text-[9px] text-stone-500">
                                          &pound;{formatMoney(buyer.spend)}{buyer.lastBought ? ` · ${shortDate(buyer.lastBought)}` : ''}
                                        </span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <p className="text-[9px] text-stone-500 mt-2">
                                  Pressing Email these customers opens the composer with these addresses filled in.
                                  Nothing is sent until you write it and press send, and anyone who has unsubscribed
                                  is dropped at that point.
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
