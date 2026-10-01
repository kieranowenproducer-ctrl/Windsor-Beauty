'use client';

import type { CertificateStatus } from '@/lib/certificateAudit';
import type { Product } from '@/data/products';
import { PRODUCT_SORT_OPTIONS, type ProductSortOption } from './productListUtils';
import { CERTIFICATE_STATUS_CONFIG } from './CertificateBadge';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  statusFilter: 'all' | 'live' | 'hidden';
  setStatusFilter: (value: 'all' | 'live' | 'hidden') => void;
  statusCounts: { all: number; live: number; hidden: number };
  certFilter: 'all' | CertificateStatus;
  setCertFilter: (value: 'all' | CertificateStatus) => void;
  certCounts: { all: number; live: number; warning: number; missing: number };
  certAuditOpen: boolean;
  setCertAuditOpen: (update: (value: boolean) => boolean) => void;
  search: string;
  setSearch: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  allCategories: string[];
  sort: ProductSortOption;
  setSort: (value: ProductSortOption) => void;
  filtered: Product[];
  products: Product[];
}

export default function ProductFilterBar({
  statusFilter, setStatusFilter, statusCounts,
  certFilter, setCertFilter, certCounts,
  certAuditOpen, setCertAuditOpen,
  search, setSearch, categoryFilter, setCategoryFilter, allCategories,
  sort, setSort, filtered, products,
}: Props) {
  return (
    <>
          {/* ── The controls, pinned ─────────────────────────────────────────
              Task 311bbdc8. Scrolling 77 products took the filters, the search and the sort with
              it, so narrowing the list meant scrolling back to the top every time. Everything you
              use WHILE reading the list is in this one bar and the bar stays put.

              Not pinned, deliberately: the page title, the count line and the three buttons above
              (Export CSV / Check All Stock / + Add Product). They are circled in the task photo,
              but they are things you press once on arrival rather than while scanning, and on a
              390px phone pinning them costs about half the screen before a single product row.

              THIS ALSO COVERS DESKTOP, which task 6e41a11d had already solved by a different
              route: it gave the table its own scroll box so the page itself would not scroll.
              That box is `max-h-[calc(100dvh-11rem)]`, which assumes everything above it is under
              176px. The page has since grown a second filter row and the audit toggle, so on a
              short window the page scrolls again and the bar went with it. Pinning removes the
              dependency on that number staying true.

              `sticky` works here because <main> is `overflow-y-auto`, i.e. a real scrolling
              ancestor. Worth checking rather than assuming: AdminSidebar.tsx records `lg:sticky`
              failing on this very admin because its nearest scrolling ancestor never scrolled.
              z-30 because the desktop table's own sticky header is z-20 and would otherwise ride
              over this one. The negative margin spans the bar across <main>'s p-8 padding, so
              rows pass underneath it rather than beside it. */}
          {/* Offset by the admin bar too, not just the public header stack: on a phone that bar
              is itself sticky at the header-stack height (task 7fdb1670), so pinning this to the
              same line would drop one straight on top of the other. `--admin-bar-height` is
              published by AdminSidebar and is 0px above lg, where that bar is hidden, so the
              desktop position is exactly what it was. */}
          <div className="sticky z-30 -mx-8 -mt-2 mb-5 px-8 pt-2 bg-stone-50 border-b border-stone-200 shadow-[0_1px_0_rgba(0,0,0,0.04)]"
            style={{ top: 'calc(var(--site-header-stack-height, 0px) + var(--admin-bar-height, 0px))' }}>

          {/* Status filter. `flex-nowrap` with a sideways scroll on phones: left wrapping, these
              two rows alone ran to three lines and the pinned bar swallowed the list it exists to
              help you read. From `sm` up they behave exactly as before. */}
          <div className="flex items-center gap-1 mb-3 flex-nowrap overflow-x-auto sm:overflow-visible">
            {([
              { key: 'live' as const, label: 'Live' },
              { key: 'all' as const, label: 'All' },
              { key: 'hidden' as const, label: 'Hidden' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[9px] tracking-[0.15em] uppercase border transition-colors ${
                  statusFilter === key
                    ? 'bg-stone-800 border-stone-800 text-white'
                    : 'border-stone-200 text-stone-500 hover:border-stone-300 bg-white'
                }`}
              >
                {key === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
                {key === 'hidden' && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />}
                {label}
                <span className={`text-[8px] ${statusFilter === key ? 'text-white/60' : 'text-stone-300'}`}>
                  ({statusCounts[key]})
                </span>
              </button>
            ))}
          </div>

          {/* Certificate filter. Same single sliding line on phones as the row above. */}
          <div className="flex items-center gap-1 mb-3 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible">
            {([
              { key: 'all' as const, label: 'All Certificates' },
              { key: 'live' as const, label: 'Live' },
              { key: 'warning' as const, label: 'Issues' },
              { key: 'missing' as const, label: 'Missing' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setCertFilter(key)}
                className={`flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[9px] tracking-[0.15em] uppercase border transition-colors ${
                  certFilter === key
                    ? 'bg-stone-800 border-stone-800 text-white'
                    : 'border-stone-200 text-stone-500 hover:border-stone-300 bg-white'
                }`}
              >
                {key !== 'all' && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CERTIFICATE_STATUS_CONFIG[key].dot}`} />}
                {label}
                <span className={`text-[8px] ${certFilter === key ? 'text-white/60' : 'text-stone-300'}`}>
                  ({certCounts[key]})
                </span>
              </button>
            ))}
            <button
              onClick={() => setCertAuditOpen(v => !v)}
              className="shrink-0 sm:ml-auto text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 border border-gold-300 text-gold-700 hover:bg-gold-50 transition-colors"
            >
              {certAuditOpen ? 'Hide Certificate Audit' : 'Certificate Audit'}
            </button>
          </div>

          {/* Search, category filter & sort. On a phone the search box keeps its own line and the
              two dropdowns share the next one, rather than three stacked lines: same controls,
              one line shorter, which is worth having in a bar that is now always on screen. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 pb-3">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full sm:max-w-xs border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-sm text-stone-700 bg-white transition-colors"
            />
            <div className="flex items-center gap-2 sm:contents">
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="min-w-0 flex-1 border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-xs text-stone-600 bg-white transition-colors sm:flex-none sm:w-48"
              >
                <option value="All">All Categories</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as ProductSortOption)}
                className="min-w-0 flex-1 border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-xs text-stone-600 bg-white transition-colors sm:flex-none sm:w-48"
              >
                {PRODUCT_SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {/* Travels with the filters on purpose: a filter that is always on screen has to show
                its own effect, or you cannot tell a narrow filter from an empty catalogue. */}
            <span className="text-[10px] text-stone-500 tracking-wider sm:ml-auto shrink-0">
              {filtered.length} of {products.length} products
            </span>
          </div>

          </div>
          {/* ── end of the pinned bar ─────────────────────────────────────── */}
    </>
  );
}
