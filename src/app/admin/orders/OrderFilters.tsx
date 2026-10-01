'use client';

import { STATUS_OPTIONS, STATUS_LABELS, ORDER_SORT_LABELS, type OrderStatus, type OrderTab, type OrderSort } from './orderTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  statusFilter: OrderTab;
  setStatusFilter: (value: OrderTab) => void;
  /** How many orders are sitting in Archived orders, shown on its tab (task 831a4461). */
  archivedCount: number;
  multiStatusFilter: OrderStatus[] | null;
  setMultiStatusFilter: (value: OrderStatus[] | null) => void;
  periodFilter: 'all' | 'this_month';
  setPeriodFilter: (value: 'all' | 'this_month') => void;
  search: string;
  setSearch: (value: string) => void;
  sort: OrderSort;
  setSort: (value: OrderSort) => void;
  /** Inclusive day range, as YYYY-MM-DD. Empty string means that end is open. */
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
  /** Orders that match the dates but are in the other folder (task: easier searching). */
  matchesHiddenByArchive: number;
  viewingArchive: boolean;
  /** When a search of several words finds nothing, what each word finds on its own. */
  wordBreakdown: { word: string; count: number }[];
  /** How many of the rows on screen were pulled out of Archived orders by the search. */
  archivedShown: number;
}

export default function OrderFilters({
  statusFilter, setStatusFilter, archivedCount, multiStatusFilter, setMultiStatusFilter,
  periodFilter, setPeriodFilter, search, setSearch,
  sort, setSort, dateFrom, setDateFrom, dateTo, setDateTo,
  matchesHiddenByArchive, viewingArchive, wordBreakdown, archivedShown,
}: Props) {
  const anyNarrowing = search.trim() !== '' || dateFrom !== '' || dateTo !== '' || sort !== 'newest';
  return (
    /* Pinned, the same way the products filter bar is (task 7fdb1670). Scrolling a
       long order list used to take the status chips, the search and the dropdown
       with it, so narrowing the list meant scrolling back to the top every time.
       Everything you use WHILE reading the list is in this one bar and the bar
       stays put.

       Offset by the public header stack AND the admin menu bar, both live
       measurements, so the three sit one under the other rather than on top of
       each other. `--admin-bar-height` is 0px above lg, where that bar is hidden.

       The negative margins span it across <main>'s p-8 padding so rows pass
       underneath rather than beside it. bg-stone-50 matches the page so nothing
       shows through. */
    <div
      className="sticky z-30 -mx-8 -mt-2 mb-2 px-8 pt-3 bg-stone-50 border-b border-stone-200 shadow-[0_1px_0_rgba(0,0,0,0.04)]"
      style={{ top: 'calc(var(--site-header-stack-height, 0px) + var(--admin-bar-height, 0px))' }}
    >
          {/* Quick-filter chips. One sideways-scrolling line on phones: left to wrap,
              five chips ran to three lines and the pinned bar swallowed the list it
              exists to help you read. From sm up they wrap exactly as before. */}
          <div className="flex gap-2 mb-3 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible">
            {([
              { label: 'All', value: 'all' },
              { label: 'Awaiting Payment', value: 'awaiting_payment' },
              { label: 'Awaiting Dispatch', value: 'awaiting_dispatch' },
              { label: 'Dispatched', value: 'dispatched' },
              { label: 'Delivered', value: 'delivered' },
              // The archive, last, because it is where finished work goes (task 831a4461).
              { label: `Archived orders${archivedCount ? ` (${archivedCount})` : ''}`, value: 'archived' },
            ] as { label: string; value: OrderTab }[]).map(({ label, value }) => (
              <button
                key={value}
                onClick={() => { setStatusFilter(value); setMultiStatusFilter(null); }}
                className={`shrink-0 text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 border transition-colors ${
                  multiStatusFilter === null && statusFilter === value
                    ? 'bg-gold-700 text-white border-gold-500'
                    : 'bg-white border-stone-200 text-stone-400 hover:border-gold-300 hover:text-gold-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search + full status dropdown. On a phone the search takes the width it
              needs and the dropdown sits beside it, one line instead of two. */}
          <div className="flex flex-wrap gap-3 pb-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search, eg Amber serum"
              aria-label="Search orders"
              className="min-w-0 flex-1 sm:flex-none border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-sm text-stone-700 bg-white transition-colors sm:w-56"
            />
            <select
              value={multiStatusFilter !== null ? 'all' : statusFilter}
              onChange={e => { setStatusFilter(e.target.value as OrderTab); setMultiStatusFilter(null); }}
              aria-label="Filter by status"
              className="border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-sm text-stone-500 bg-white transition-colors"
            >
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Put them in an order, and show one stretch of days. Separate line from the search so
              neither wraps into the other on a phone. */}
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <label className="flex items-center gap-1.5">
              <span className="text-[9px] tracking-[0.12em] uppercase text-stone-500">Order by</span>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as OrderSort)}
                className="border border-stone-200 focus:border-gold-400 outline-none px-2 py-1.5 text-xs text-stone-600 bg-white transition-colors"
              >
                {(Object.keys(ORDER_SORT_LABELS) as OrderSort[]).map(key => (
                  <option key={key} value={key}>{ORDER_SORT_LABELS[key]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-[9px] tracking-[0.12em] uppercase text-stone-500">Between</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={e => setDateFrom(e.target.value)}
                aria-label="Show orders placed on or after this day"
                className="border border-stone-200 focus:border-gold-400 outline-none px-2 py-1.5 text-xs text-stone-600 bg-white transition-colors"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-[9px] tracking-[0.12em] uppercase text-stone-500">And</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={e => setDateTo(e.target.value)}
                aria-label="Show orders placed on or before this day"
                className="border border-stone-200 focus:border-gold-400 outline-none px-2 py-1.5 text-xs text-stone-600 bg-white transition-colors"
              />
            </label>
            {anyNarrowing && (
              <button
                type="button"
                onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setSort('newest'); }}
                className="text-[10px] tracking-[0.15em] uppercase text-stone-400 hover:text-gold-700 transition-colors px-2 py-1"
              >
                Clear
              </button>
            )}
          </div>

          {/* Says out loud what the search will now do, because nobody guesses it. */}
          <p className="text-[11px] text-stone-500 pb-3">
            Search takes more than one word, and every word has to be on the order somewhere.
            <span className="text-stone-700 font-medium"> Amber serum</span> finds Amber&rsquo;s serum order,
            <span className="text-stone-700 font-medium"> serum or cleanser</span> finds either.
            Short names work both ways, and searching looks in Archived orders too.
          </p>

          {/* A search pulls matches out of the archive, so say when that has happened. */}
          {archivedShown > 0 && (
            <p className="text-[11px] text-stone-600 bg-stone-50 border border-stone-200 px-3 py-2 mb-3">
              {archivedShown === 1 ? '1 of these is' : `${archivedShown} of these are`} in Archived
              orders. {archivedShown === 1 ? 'It is' : 'They are'} shown here because you searched, and
              marked <span className="uppercase tracking-[0.1em] text-[9px] text-stone-500">Archived</span> in the list.
            </p>
          )}

          {/* Dates, unlike a search, still respect the folder you are looking at. */}
          {matchesHiddenByArchive > 0 && (
            <p className="text-[11px] text-gold-700 bg-gold-50 border border-gold-200 px-3 py-2 mb-3">
              {matchesHiddenByArchive === 1 ? '1 more order is' : `${matchesHiddenByArchive} more orders are`}
              {' in those dates'}
              {viewingArchive ? ' out in the working list.' : ' in Archived orders.'}
              {' '}
              <button
                type="button"
                onClick={() => { setStatusFilter(viewingArchive ? 'all' : 'archived'); setMultiStatusFilter(null); }}
                className="underline underline-offset-2 hover:text-gold-800"
              >
                {viewingArchive ? 'Show the working list' : 'Look in Archived orders'}
              </button>
            </p>
          )}

          {/* Nothing matched, and more than one word was typed. Rather than leave somebody staring
              at an empty table, say what each word finds on its own: usually the answer is that no
              single order has both, and one press fixes it. */}
          {wordBreakdown.length > 0 && (
            <div className="text-[11px] text-gold-700 bg-gold-50 border border-gold-200 px-3 py-2 mb-3">
              <p>No order has all of those words. On their own:</p>
              <ul className="mt-1 space-y-0.5">
                {wordBreakdown.map(({ word, count }) => (
                  <li key={word}>
                    {count > 0 ? (
                      <button
                        type="button"
                        onClick={() => setSearch(word)}
                        className="underline underline-offset-2 hover:text-gold-800"
                      >
                        {word}
                      </button>
                    ) : (
                      <span className="text-stone-500">{word}</span>
                    )}
                    {' — '}
                    {count === 0 ? 'no orders at all' : count === 1 ? '1 order' : `${count} orders`}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-stone-600">
                Type <span className="text-stone-700 font-medium">or</span> between them to see both
                sets at once.
              </p>
            </div>
          )}

          {/* Period filter badge */}
          {periodFilter === 'this_month' && (
            <div className="flex items-center gap-2 pb-3">
              <span className="inline-flex items-center gap-1.5 text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 bg-gold-50 text-gold-700 border border-gold-200">
                Showing: This Month
                <button
                  onClick={() => setPeriodFilter('all')}
                  className="ml-1 text-gold-400 hover:text-gold-700 transition-colors font-bold leading-none"
                  aria-label="Clear period filter"
                >
                  ×
                </button>
              </span>
            </div>
          )}
    </div>
  );
}
