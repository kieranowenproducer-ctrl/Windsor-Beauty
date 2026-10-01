'use client';

import { useEffect, useMemo, useState } from 'react';
import { pageTitle, prettifySlug } from '@/lib/ads/pageNames';
import type { CategoryDemandRow, CheckoutFunnel, DemandReport, DemandTrendRow, DemandTrends, ProductDemandRow, VisitorJourney } from '@/lib/db/siteDemand';

export type DemandView = 'overview' | 'products' | 'journeys';
type ProductView = 'products' | 'categories';
type Sort = 'visitors' | 'pageViews' | 'basketAdds' | 'orders' | 'recent';

const SORT_LABELS: Record<Sort, string> = {
  visitors: 'Most visitor interest', pageViews: 'Most page views', basketAdds: 'Most basket adds',
  orders: 'Most orders', recent: 'Most recent attention',
};
const PERIODS = [
  { days: 1, label: 'Today' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' },
  { days: 90, label: '90 days' }, { days: 730, label: 'All time' },
];
const SOURCE_NAMES: Record<string, string> = {
  direct: 'Direct or bookmark', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
  google: 'Google', bing: 'Bing', youtube: 'YouTube', twitter: 'X', reddit: 'Reddit',
  email: 'Email', 'campaign-link': 'Tracking link', 'another-site': 'Another website', internal: 'Inside the shop',
};

function setUrlValue(name: string, value: string, defaultValue?: string) {
  const url = new URL(window.location.href);
  if (value === defaultValue) url.searchParams.delete(name); else url.searchParams.set(name, value);
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}
function when(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}
function duration(journey: VisitorJourney) {
  const seconds = Math.max(0, (new Date(journey.lastAt).getTime() - new Date(journey.startedAt).getTime()) / 1000);
  if (journey.steps.length < 2) return 'One recorded action';
  if (seconds < 60) return 'Under a minute';
  return `${Math.round(seconds / 60)} min activity span`;
}
function place(journey: VisitorJourney) {
  const bits = [journey.city, journey.countryRegion, journey.country].filter(Boolean);
  return bits.length ? Array.from(new Set(bits)).join(', ') : 'Location not known';
}

export default function DemandPanel({ demand, trends, journeys, checkoutFunnel, pageNames, days, onDaysChange, view }: {
  demand: DemandReport | null; trends: DemandTrends | null; journeys: VisitorJourney[]; checkoutFunnel: CheckoutFunnel | null;
  pageNames: Record<string, string>; days: number; onDaysChange: (days: number) => void; view: DemandView;
}) {
  const [productView, setProductView] = useState<ProductView>('products');
  const [sort, setSort] = useState<Sort>('visitors');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('list') === 'categories') setProductView('categories');
    const order = params.get('order');
    if (order && order in SORT_LABELS) setSort(order as Sort);
  }, []);

  const q = search.trim().toLowerCase();
  const products = useMemo(() => [...(demand?.products ?? [])]
    .filter((row) => !q || row.name.toLowerCase().includes(q) || row.categories.some((category) => category.toLowerCase().includes(q)))
    .sort((a, b) => sort === 'recent' ? new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime() : b[sort] - a[sort]), [demand, q, sort]);
  const categories = useMemo(() => [...(demand?.categories ?? [])]
    .filter((row) => !q || row.name.toLowerCase().includes(q))
    .sort((a, b) => b[sort === 'recent' ? 'visitors' : sort] - a[sort === 'recent' ? 'visitors' : sort]), [demand, q, sort]);
  const visibleJourneys = journeys.filter((journey) => !q
    || (journey.ipAddress ?? '').toLowerCase().includes(q)
    || (journey.customerName ?? '').toLowerCase().includes(q)
    || (journey.customerEmail ?? '').toLowerCase().includes(q)
    || journey.steps.some((step) => pageTitle(step.path, pageNames).toLowerCase().includes(q)));
  const summary = [
    { label: 'Visits', value: demand?.visits ?? 0, hint: 'Separate trips to the shop' },
    { label: 'Estimated visitors', value: demand?.visitors ?? 0, hint: 'Based on visitor addresses' },
    { label: 'Page views', value: demand?.pageViews ?? 0, hint: 'Every page people opened' },
    { label: 'Basket adds', value: demand?.basketAdds ?? 0, hint: 'Products added to a basket' },
  ];
  const topProduct = demand?.products[0];
  const topCategory = demand?.categories[0];

  return <div className="overflow-hidden rounded-2xl border border-stone-300 bg-white shadow-[0_18px_50px_rgba(28,25,23,0.08)]">
    <section className="bg-stone-900 px-5 py-6 text-white sm:px-7 sm:py-7">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-gold-300">What People Want</p>
          <h2 className="text-pretty text-2xl font-semibold sm:text-3xl">Demand Across the Shop</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-200">See what is attracting attention and follow the visitor journeys behind the numbers. A page view is not another visit.</p>
        </div>
        <div aria-label="Reporting period" className="flex flex-wrap gap-2">
          {PERIODS.map((period) => <button key={period.days} type="button" aria-pressed={days === period.days}
            onClick={() => { onDaysChange(period.days); setUrlValue('days', String(period.days), '30'); }}
            className={`min-h-11 touch-manipulation rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900 ${days === period.days ? 'border-gold-600 bg-gold-700 text-white' : 'border-stone-500 bg-stone-800 text-white hover:border-gold-300 hover:bg-stone-700'}`}>{period.label}</button>)}
        </div>
      </div>
    </section>

    <div className="grid gap-3 bg-stone-100 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
      {summary.map((item) => <div key={item.label} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="text-3xl font-semibold tabular-nums text-stone-900">{item.value.toLocaleString('en-GB')}</div>
        <div className="mt-1 text-sm font-bold text-stone-800">{item.label}</div>
        <div className="mt-1 text-xs leading-relaxed text-stone-600">{item.hint}</div>
      </div>)}
    </div>

    {view === 'overview' && <div className="space-y-4 bg-stone-50 p-4 sm:p-6">
      <CheckoutFunnelPanel funnel={checkoutFunnel} />
      <section aria-labelledby="winning-now" className="overflow-hidden rounded-2xl border border-gold-300 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-gold-50 px-5 py-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-gold-800">Demand Leaders</p><h3 id="winning-now" className="mt-1 text-xl font-semibold text-stone-900">What Is Winning Now</h3></div>
          <span className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white">Selected Period</span>
        </div>
        <div className="grid gap-px bg-gold-200 md:grid-cols-2">
          <div className="min-w-0 bg-white p-5"><p className="text-xs font-bold text-stone-600">Top Product</p><p className="mt-2 break-words text-lg font-semibold text-stone-900">{topProduct?.name ?? 'No product views yet'}</p>{topProduct && <p className="mt-2 text-sm text-stone-700"><strong>{topProduct.visitors.toLocaleString('en-GB')}</strong> estimated visitors · <strong>{topProduct.pageViews.toLocaleString('en-GB')}</strong> page views · <strong>{topProduct.basketAdds.toLocaleString('en-GB')}</strong> basket adds</p>}</div>
          <div className="min-w-0 bg-white p-5"><p className="text-xs font-bold text-stone-600">Top Category</p><p className="mt-2 break-words text-lg font-semibold text-stone-900">{topCategory?.name ?? 'No category views yet'}</p>{topCategory && <p className="mt-2 text-sm text-stone-700"><strong>{topCategory.visitors.toLocaleString('en-GB')}</strong> estimated visitors · <strong>{topCategory.pageViews.toLocaleString('en-GB')}</strong> page views · <strong>{topCategory.basketAdds.toLocaleString('en-GB')}</strong> basket adds</p>}</div>
        </div>
      </section>
      <PerformanceLedger trends={trends} />
    </div>}

    {view === 'products' && <section aria-labelledby="product-demand-title">
      <div className="border-b border-stone-200 bg-stone-50 p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><h3 id="product-demand-title" className="text-xl font-semibold text-stone-900">Products & Categories</h3><p className="mt-1 text-sm text-stone-600">Rank attention using the measure that matters to you.</p></div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div><span className="mb-1.5 block text-xs font-bold text-stone-700">Show</span><div className="inline-flex rounded-full border border-stone-300 bg-white p-1" aria-label="Products or categories">
              {([['products', 'Products'], ['categories', 'Categories']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={productView === id} onClick={() => { setProductView(id); setUrlValue('list', id, 'products'); }} className={`min-h-11 touch-manipulation rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${productView === id ? 'bg-stone-900 text-white' : 'text-stone-800 hover:bg-stone-100'}`}>{label}</button>)}
            </div></div>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-stone-700">Search</span><input name="demand-search" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product or category…" className="min-h-11 w-full min-w-[220px] rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none placeholder:text-stone-500 focus-visible:ring-2 focus-visible:ring-gold-500 sm:w-auto" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-stone-700">Order By</span><select name="demand-order" autoComplete="off" value={sort} onChange={(event) => { const next = event.target.value as Sort; setSort(next); setUrlValue('order', next, 'visitors'); }} className="min-h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 sm:w-auto">{(Object.keys(SORT_LABELS) as Sort[]).map((key) => <option key={key} value={key}>{SORT_LABELS[key]}</option>)}</select></label>
          </div>
        </div>
      </div>
      {productView === 'products' ? <ProductResults rows={products} /> : <CategoryResults rows={categories} />}
    </section>}

    {view === 'journeys' && <section aria-labelledby="journeys-title">
      <div className="flex flex-col gap-4 border-b border-stone-200 bg-stone-50 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div><h3 id="journeys-title" className="text-xl font-semibold text-stone-900">Visitor Journeys</h3><p className="mt-1 text-sm text-stone-600">Open a visitor to see the pages and products they explored.</p></div>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-stone-700">Find a Visitor</span><input name="journey-search" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Member, address or page…" className="min-h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none placeholder:text-stone-500 focus-visible:ring-2 focus-visible:ring-gold-500 sm:min-w-[280px]" /></label>
      </div>
      <JourneyList rows={visibleJourneys} pageNames={pageNames} />
    </section>}
  </div>;
}

function trendLabel(bucket: string, period: 'week' | 'month') {
  const date = new Date(`${bucket}T12:00:00`);
  return period === 'week' ? `Week of ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)}` : new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(date);
}
function changeFrom(row: DemandTrendRow, before: DemandTrendRow | undefined) {
  if (!before) return { text: 'First recorded period', tone: 'text-stone-600' };
  if (before.visitors === 0) return row.visitors > 0 ? { text: 'New visitor activity', tone: 'text-green-800' } : { text: 'No change', tone: 'text-stone-600' };
  const change = Math.round(((row.visitors - before.visitors) / before.visitors) * 100);
  if (Math.abs(change) < 5) return { text: 'Visitor interest stayed level', tone: 'text-stone-700' };
  return change > 0 ? { text: `Visitor interest up ${change}%`, tone: 'text-green-800' } : { text: `Visitor interest down ${Math.abs(change)}%`, tone: 'text-red-800' };
}

function CheckoutFunnelPanel({ funnel }: { funnel: CheckoutFunnel | null }) {
  if (!funnel) return null;
  const shippingToPayment = funnel.shippingSeen ? Math.round((funnel.paymentSeen / funnel.shippingSeen) * 100) : null;
  const deliverySignal = funnel.shippingSeen >= 20 && funnel.paymentSeen <= funnel.shippingSeen * 0.55;
  const offerDismissal = funnel.offerShown ? Math.round((funnel.offerDismissed / funnel.offerShown) * 100) : null;
  const steps = [
    ['Added to basket', funnel.basketVisitors],
    ['Member offer shown', funnel.offerShown],
    ['Saw delivery price', funnel.shippingSeen],
    ['Reached payment', funnel.paymentSeen],
    ['Pressed pay', funnel.payPressed],
    ['Paid order', funnel.paidOrders],
  ];
  return <section aria-labelledby="checkout-funnel" className="overflow-hidden rounded-2xl border border-gold-300 bg-white shadow-sm">
    <div className="bg-gold-50 px-5 py-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-gold-800">Checkout Test</p><h3 id="checkout-funnel" className="mt-1 text-xl font-semibold text-stone-900">Where People Stop</h3><p className="mt-1 text-sm text-stone-700">This shows the point people reached, not a guess about why they left.</p></div>
    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{steps.map(([label, value]) => <div key={String(label)} className="rounded-xl border border-stone-200 bg-stone-50 p-4"><p className="text-2xl font-semibold tabular-nums text-stone-900">{Number(value).toLocaleString('en-GB')}</p><p className="mt-1 text-sm font-semibold text-stone-700">{label}</p></div>)}</div>
    <div className="border-t border-stone-200 px-5 py-4 text-sm leading-relaxed text-stone-700">
      {deliverySignal ? <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950"><strong>Possible delivery-fee friction:</strong> {funnel.shippingSeen - funnel.paymentSeen} people saw the delivery price but did not reach payment. The £10 fee may be contributing. Check this pattern again after more traffic before changing prices.</p> : <p>No delivery-fee warning yet. A warning appears only after at least 20 people have seen the delivery price and fewer than 55% then reach payment.</p>}
      <p className="mt-3">{shippingToPayment === null ? 'No one has reached the delivery step yet.' : `${shippingToPayment}% of people who saw delivery reached payment.`}{offerDismissal === null ? '' : ` ${offerDismissal}% closed the member offer.`} Member-offer choices: {funnel.offerJoined} chose to join and {funnel.offerContinued} continued as a non-member.</p>
    </div>
  </section>;
}

function PerformanceLedger({ trends }: { trends: DemandTrends | null }) {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const rows = period === 'week' ? trends?.weekly ?? [] : trends?.monthly ?? [];
  const visibleRows = period === 'week' && !showAllWeeks ? rows.slice(0, 13) : rows;
  const maxVisitors = Math.max(1, ...rows.map((row) => row.visitors));
  return <section className="overflow-hidden rounded-2xl border border-stone-300 bg-white shadow-sm">
    <div className="flex flex-col gap-4 border-b border-stone-200 p-5 sm:flex-row sm:items-end sm:justify-between">
      <div><h3 className="text-xl font-semibold text-stone-900">Performance Over Time</h3><p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-600">Latest first. The gold line compares visitor interest. The current period is still in progress.</p></div>
      <div className="inline-flex self-start rounded-full border border-stone-300 bg-stone-100 p-1" aria-label="Performance period">{([['week', 'Week by Week'], ['month', 'Month by Month']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setPeriod(id)} aria-pressed={period === id} className={`min-h-11 touch-manipulation rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${period === id ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-800 hover:bg-white'}`}>{label}</button>)}</div>
    </div>
    <div className="hidden grid-cols-[minmax(180px,1.4fr)_repeat(5,minmax(72px,0.65fr))_minmax(220px,1.5fr)] gap-3 border-b border-stone-200 bg-stone-100 px-5 py-3 text-xs font-bold text-stone-700 lg:grid"><span>Period & Change</span><span>Visitors</span><span>Pages</span><span>Visits</span><span>Basket</span><span>Orders</span><span>Demand Leaders</span></div>
    <div className="space-y-3 bg-stone-50 p-3 sm:p-4">{visibleRows.map((row, index) => { const change = changeFrom(row, rows[index + 1]); return <div key={`${period}:${row.bucket}`} className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-stone-200 bg-white px-4 py-5 transition-colors hover:border-gold-300 sm:px-5 lg:grid-cols-[minmax(180px,1.4fr)_repeat(5,minmax(72px,0.65fr))_minmax(220px,1.5fr)] lg:items-center lg:gap-3">
      <div className="col-span-2 lg:col-span-1"><div className="text-sm font-bold text-stone-900">{trendLabel(row.bucket, period)}</div><div className={`mt-1 text-xs font-semibold ${change.tone}`}>{change.text}</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200"><span className="block h-full rounded-full bg-gold-700" style={{ width: `${Math.max(3, (row.visitors / maxVisitors) * 100)}%` }} /></div></div>
      {([['Visitors', row.visitors], ['Pages', row.pageViews], ['Visits', row.visits], ['Basket', row.basketAdds], ['Orders', row.orders]] as [string, number][]).map(([label, value]) => <div key={label}><div className="text-xs font-bold text-stone-600 lg:hidden">{label}</div><div className="mt-1 text-base font-semibold tabular-nums text-stone-900 lg:mt-0">{value.toLocaleString('en-GB')}</div></div>)}
      <div className="col-span-2 rounded-xl bg-stone-100 px-3 py-3 lg:col-span-1"><div className="text-xs font-semibold text-stone-600">Top Product</div><div className="truncate text-sm font-bold text-stone-900">{row.topProduct ?? 'No product views'}</div><div className="mt-1 text-xs text-stone-700">Top Category: <span className="font-bold">{row.topCategory ?? 'Not known'}</span></div></div>
    </div>; })}</div>
    {rows.length === 0 && <p className="p-8 text-center text-sm text-stone-600">There is no recorded performance for this period yet.</p>}
    {period === 'week' && rows.length > 13 && <div className="border-t border-stone-200 p-4 text-center"><button type="button" onClick={() => setShowAllWeeks((shown) => !shown)} className="min-h-11 touch-manipulation rounded-full border border-stone-400 bg-white px-5 text-sm font-semibold text-stone-900 transition-colors hover:border-gold-500 hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">{showAllWeeks ? 'Show Latest 13 Weeks' : `Show ${rows.length - 13} Earlier Weeks`}</button></div>}
  </section>;
}

function ProductResults({ rows }: { rows: ProductDemandRow[] }) {
  const [showAll, setShowAll] = useState(false); const visible = showAll ? rows : rows.slice(0, 10);
  return <div><div className="space-y-3 bg-stone-50 p-3 md:hidden">{visible.map((row, index) => <ProductCard key={row.path} row={row} rank={index + 1} />)}</div>
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[850px]"><thead><tr className="border-b border-stone-200 bg-stone-100">{['Product', 'Category', 'Visitors', 'Page Views', 'Visits', 'Member Views', 'Basket Adds', 'Orders'].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-bold text-stone-700">{label}</th>)}</tr></thead><tbody>{visible.map((row, index) => <tr key={row.path} data-demand-product={row.name} style={{ contentVisibility: 'auto' }} className="border-b border-stone-200 align-top transition-colors hover:bg-gold-50"><td className="px-4 py-4"><span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-gold-100 text-xs font-bold text-gold-900">{index + 1}</span><span className="text-sm font-bold text-stone-900">{row.name}</span></td><td className="max-w-[220px] px-4 py-4 text-xs text-stone-700">{row.categories.filter((name) => name !== 'Peptides').join(', ') || 'Other'}</td>{[row.visitors, row.pageViews, row.visits, row.memberViews, row.basketAdds, row.orders].map((value, cell) => <td key={cell} className="px-4 py-4 text-sm font-semibold tabular-nums text-stone-800">{value.toLocaleString('en-GB')}</td>)}</tr>)}</tbody></table></div>
    {rows.length === 0 && <p className="p-8 text-center text-sm text-stone-600">No product attention matches this view.</p>}{rows.length > 10 && <ShowAllButton shown={showAll} total={rows.length} onClick={() => setShowAll((shown) => !shown)} />}</div>;
}
function ProductCard({ row, rank }: { row: ProductDemandRow; rank: number }) {
  return <article data-demand-product={row.name} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-100 text-sm font-bold text-gold-900">{rank}</span><div className="min-w-0"><h4 className="break-words text-base font-bold text-stone-900">{row.name}</h4><p className="mt-0.5 text-xs text-stone-600">{row.categories.filter((name) => name !== 'Peptides').join(', ') || 'Other'}</p></div></div><dl className="mt-4 grid grid-cols-3 gap-3 border-t border-stone-200 pt-4">{[['Visitors', row.visitors], ['Page Views', row.pageViews], ['Basket Adds', row.basketAdds]].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-stone-600">{label}</dt><dd className="mt-1 text-lg font-bold tabular-nums text-stone-900">{Number(value).toLocaleString('en-GB')}</dd></div>)}</dl><details className="mt-3"><summary className="min-h-11 cursor-pointer rounded-full border border-stone-300 px-4 py-3 text-center text-sm font-semibold text-stone-800 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">More Figures</summary><dl className="mt-3 grid grid-cols-3 gap-3 rounded-xl bg-stone-100 p-3">{[['Visits', row.visits], ['Member Views', row.memberViews], ['Orders', row.orders]].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-stone-600">{label}</dt><dd className="mt-1 font-bold tabular-nums text-stone-900">{Number(value).toLocaleString('en-GB')}</dd></div>)}</dl></details></article>;
}
function CategoryResults({ rows }: { rows: CategoryDemandRow[] }) {
  const [showAll, setShowAll] = useState(false); const visible = showAll ? rows : rows.slice(0, 10);
  return <div><div className="grid gap-3 bg-stone-50 p-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map((row, index) => <article key={row.name} data-demand-category={row.name} style={{ contentVisibility: 'auto' }} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-100 text-sm font-bold text-gold-900">{index + 1}</span><h4 className="text-base font-bold text-stone-900">{row.name}</h4></div><dl className="mt-4 grid grid-cols-2 gap-3 border-t border-stone-200 pt-4">{[['Visitors', row.visitors], ['Page Views', row.pageViews], ['Basket Adds', row.basketAdds], ['Orders', row.orders]].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-stone-600">{label}</dt><dd className="mt-1 text-lg font-bold tabular-nums text-stone-900">{Number(value).toLocaleString('en-GB')}</dd></div>)}</dl></article>)}</div>{rows.length === 0 && <p className="p-8 text-center text-sm text-stone-600">No category attention matches this view.</p>}{rows.length > 10 && <ShowAllButton shown={showAll} total={rows.length} onClick={() => setShowAll((shown) => !shown)} />}</div>;
}
function ShowAllButton({ shown, total, onClick }: { shown: boolean; total: number; onClick: () => void }) {
  return <div className="border-t border-stone-200 bg-white p-4 text-center"><button type="button" onClick={onClick} className="min-h-11 touch-manipulation rounded-full border border-stone-400 bg-white px-5 text-sm font-semibold text-stone-900 transition-colors hover:border-gold-500 hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">{shown ? 'Show Top 10' : `Show All ${total}`}</button></div>;
}
function JourneyList({ rows, pageNames }: { rows: VisitorJourney[]; pageNames: Record<string, string> }) {
  return <div className="space-y-3 bg-stone-50 p-3 sm:p-4">{rows.map((journey) => <details key={journey.id} style={{ contentVisibility: 'auto' }} className="group overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm open:border-gold-300"><summary className="grid min-h-14 cursor-pointer list-none grid-cols-1 gap-3 px-4 py-4 transition-colors hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500 sm:grid-cols-[minmax(180px,1.2fr)_minmax(150px,1fr)_auto] sm:items-center sm:px-5"><div className="min-w-0"><div className="break-words text-sm font-bold text-stone-900">{journey.customerName || journey.customerEmail || 'Visitor'}</div><div className="mt-1 break-all font-mono text-xs text-stone-600">{journey.ipAddress ?? 'Address not known'}</div></div><div className="text-sm text-stone-700"><span className="font-bold">{SOURCE_NAMES[journey.source] ?? journey.source}</span><span className="mt-0.5 block text-xs text-stone-600">{place(journey)}</span></div><div className="text-left text-sm text-stone-700 sm:text-right"><span className="font-bold">{journey.pageViews} page {journey.pageViews === 1 ? 'view' : 'views'}</span>{journey.basketAdds > 0 && <span className="ml-2 font-semibold text-gold-800">{journey.basketAdds} basket</span>}<span className="mt-0.5 block text-xs text-stone-600">{when(journey.lastAt)} · {duration(journey)}</span></div></summary><div className="border-t border-stone-200 bg-stone-50 px-4 py-4 sm:px-5">{!journey.precise && <p className="mb-3 text-sm text-stone-600">Earlier activity is grouped carefully by address and time. New activity has an exact visit identifier.</p>}<ol className="flex flex-col gap-2">{journey.steps.slice(0, 30).map((step, index) => <li key={step.id} className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-3 rounded-lg bg-white p-3 text-sm sm:grid-cols-[28px_minmax(0,1fr)_auto]"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step.kind === 'add_to_basket' ? 'bg-gold-200 text-gold-900' : 'bg-stone-200 text-stone-800'}`}>{index + 1}</span><span className="break-words pt-1 text-stone-800">{step.kind === 'add_to_basket' ? `Added ${prettifySlug(step.productSlug ?? 'product')} to basket` : pageTitle(step.path, pageNames)}</span><time className="col-start-2 tabular-nums text-xs text-stone-600 sm:col-start-3 sm:pt-1">{when(step.at)}</time></li>)}</ol></div></details>)}{rows.length === 0 && <p className="p-8 text-center text-sm text-stone-600">No visitor journeys match this view.</p>}</div>;
}
