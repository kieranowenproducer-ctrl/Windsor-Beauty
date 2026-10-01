'use client';
import AdminStickyControls from '@/components/admin/AdminStickyControls';
import AdminViewToggle from '@/components/AdminViewToggle';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import DemandPanel, { type DemandView } from './DemandPanel';
import type { CheckoutFunnel, DemandReport, DemandTrends, VisitorJourney } from '@/lib/db/siteDemand';
import type { TrackingHealth } from '@/lib/db/siteVisits';

// Where people are coming from: the addresses behind what happens on the site,
// roughly where they are, who they belong to, and who looks like a problem.
// Admin only. Built to match /admin/member-logins.

interface AddressRow {
  ip_address: string | null;
  country: string | null;
  country_region: string | null;
  city: string | null;
  postal_code: string | null;
  network: string | null;
  events: number;
  members: number;
  member_names: string[];
  first_seen: string;
  last_seen: string;
}

interface PlaceRow {
  country: string | null;
  country_region: string | null;
  city: string | null;
  events: number;
  addresses: number;
  members: number;
}

interface ConcernRow {
  kind: string;
  headline: string;
  detail: string;
  subject: string;
  count: number;
}

interface ActivityRow {
  id: number;
  ip_address: string | null;
  event: string;
  customer_name: string | null;
  customer_email: string | null;
  country: string | null;
  city: string | null;
  detail: string | null;
  created_at: string;
}

// Banned accounts and the flag they raise (task 9cd55f28).
interface BannedRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  banned_at: string;
  banned_reason: string | null;
  banned_by: string | null;
  addresses: string[];
}

interface MatchRow {
  ip_address: string;
  banned_names: string[];
  customer_id: number;
  customer_name: string | null;
  customer_email: string | null;
  already_banned: boolean;
  last_seen: string;
  events: number;
  city: string | null;
  country: string | null;
}

// Visits (task dfe5e9ae): every page somebody opens, where they came from, and
// what the address went on to do. Shapes match src/lib/db/siteVisits.ts.
interface VisitRow {
  id: number;
  ip_address: string | null;
  path: string;
  landing: boolean;
  source: string;
  source_detail: string | null;
  referrer: string | null;
  country: string | null;
  country_region: string | null;
  city: string | null;
  postal_code: string | null;
  created_at: string;
}

interface VisitSourceRow {
  source: string;
  visits: number;
  addresses: number;
  joined: number;
  ordered: number;
}

interface VisitorRow {
  ip_address: string;
  visits: number;
  first_seen: string;
  last_seen: string;
  first_source: string;
  first_source_detail: string | null;
  country: string | null;
  country_region: string | null;
  city: string | null;
  postal_code: string | null;
  member_names: string[];
  joined: boolean;
  ordered: boolean;
  orders: number;
}

// Kept in step with VISIT_SOURCE_LABELS in src/lib/db/siteVisits.ts, which
// cannot be imported here because that module opens the database.
const SOURCE_LABELS: Record<string, string> = {
  direct: 'Typed the address or a bookmark',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  google: 'Google',
  bing: 'Bing',
  youtube: 'YouTube',
  twitter: 'X (Twitter)',
  reddit: 'Reddit',
  email: 'An email',
  'campaign-link': 'A tracking link',
  'another-site': 'Another website',
  internal: 'Moving around the site',
};

function sourceLabel(source: string, detail: string | null) {
  const base = SOURCE_LABELS[source] ?? source;
  if (!detail) return base;
  if (source === 'another-site' || source === 'campaign-link' || source === 'email') return `${base} (${detail})`;
  return detail.endsWith(' app') ? `${base} (in the app)` : base;
}

const EVENT_LABELS: Record<string, string> = {
  sign_in: 'Signed in',
  register: 'New member',
  verification: 'Checked a batch code',
  research_question: 'Asked a question',
  enquiry: 'Sent an enquiry',
  qr_scan: 'Scanned a QR code',
  order: 'Placed an order',
  earlier_record: 'Recorded earlier',
};

// Country codes are what arrives on the request. Spell out the ones that will
// actually turn up so nobody has to know that GB means here.
const COUNTRY_NAMES: Record<string, string> = {
  GB: 'United Kingdom', IE: 'Ireland', US: 'United States', CA: 'Canada',
  AU: 'Australia', NZ: 'New Zealand', DE: 'Germany', FR: 'France', ES: 'Spain',
  IT: 'Italy', NL: 'Netherlands', BE: 'Belgium', PL: 'Poland', PT: 'Portugal',
  SE: 'Sweden', NO: 'Norway', DK: 'Denmark', CH: 'Switzerland', AT: 'Austria',
  AE: 'United Arab Emirates', IN: 'India', ZA: 'South Africa', SG: 'Singapore',
};

function countryName(code: string | null) {
  if (!code) return 'Not known';
  return COUNTRY_NAMES[code] ?? code;
}

function formatDatetime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function placeOf(row: { city: string | null; country_region: string | null; country: string | null }) {
  const parts = [row.city, row.country_region, countryName(row.country)].filter(Boolean);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length ? unique.join(', ') : 'Not known';
}

type MainView = DemandView | 'technical';
type TechnicalTab = 'raw' | 'addresses' | 'places' | 'concerns' | 'recent' | 'banned';

export default function AdminIpAddressesPage() {
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [concerns, setConcerns] = useState<ConcernRow[]>([]);
  const [recent, setRecent] = useState<ActivityRow[]>([]);
  const [banned, setBanned] = useState<BannedRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [visitSources, setVisitSources] = useState<VisitSourceRow[]>([]);
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [demand, setDemand] = useState<DemandReport | null>(null);
  const [trends, setTrends] = useState<DemandTrends | null>(null);
  const [journeys, setJourneys] = useState<VisitorJourney[]>([]);
  const [checkoutFunnel, setCheckoutFunnel] = useState<CheckoutFunnel | null>(null);
  const [pageNames, setPageNames] = useState<Record<string, string>>({});
  const [trackingHealth, setTrackingHealth] = useState<TrackingHealth | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<MainView>('overview');
  const [tab, setTab] = useState<TechnicalTab>('raw');
  const [search, setSearch] = useState('');
  const [banBusy, setBanBusy] = useState<number | null>(null);
  const [banMessage, setBanMessage] = useState('');
  const [banError, setBanError] = useState('');
  /* Asked for on the page, not in pop-up boxes (task 38494f7e). On a phone in an in-app browser a
   * pop-up never appears: a blocked "why?" box reads as cancelled and a blocked yes/no box reads as
   * no, so the ban silently did not happen and nothing said so. */
  const [banAsking, setBanAsking] = useState<number | null>(null);
  const [banReason, setBanReason] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const savedView = params.get('view');
    const savedDetail = params.get('detail');
    const savedDays = Number(params.get('days'));
    if (savedView === 'products' || savedView === 'journeys' || savedView === 'technical') setView(savedView);
    if (savedDetail === 'raw' || savedDetail === 'addresses' || savedDetail === 'places' || savedDetail === 'concerns' || savedDetail === 'recent' || savedDetail === 'banned') setTab(savedDetail);
    if ([1, 7, 30, 90, 730].includes(savedDays)) setDays(savedDays);
  }, []);

  function chooseView(next: MainView) {
    setView(next);
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('view'); else url.searchParams.set('view', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function chooseTechnicalTab(next: TechnicalTab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'technical');
    if (next === 'raw') url.searchParams.delete('detail'); else url.searchParams.set('detail', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  const load = useCallback((quiet = false) => {
    if (quiet) setRefreshing(true);
    return fetch(`/api/admin/ip-addresses?days=${days}`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.addresses)) {
          setAddresses(d.addresses);
          setPlaces(d.places ?? []);
          setConcerns(d.concerns ?? []);
          setRecent(d.recent ?? []);
          setBanned(d.banned ?? []);
          setMatches(d.bannedMatches ?? []);
          setVisits(d.visits ?? []);
          setVisitSources(d.visitSources ?? []);
          setVisitors(d.visitors ?? []);
          setDemand(d.demand ?? null);
          setTrends(d.trends ?? null);
          setJourneys(d.journeys ?? []);
          setCheckoutFunnel(d.checkoutFunnel ?? null);
          setPageNames(d.pageNames ?? {});
          setTrackingHealth(d.trackingHealth ?? null);
          setFailed(false);
          setLastUpdated(new Date());
        } else setFailed(true);
      })
      .catch(() => setFailed(true))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [days]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Keep this screen current while it is open. Hidden tabs stay quiet, then
  // catch up as soon as the administrator comes back to them.
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') load(true);
    };
    const timer = window.setInterval(refreshIfVisible, 30_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [load]);

  /**
   * Banning from a flag. Still two deliberate steps, because this shuts a real person out of the
   * shop: a panel naming who it is, then the reason, which is what makes the record readable
   * months later. Nothing here happens on its own, and nothing here uses a pop-up box.
   */
  async function banFromFlag(row: MatchRow, reason: string) {
    const who = row.customer_name || row.customer_email || `Customer ${row.customer_id}`;
    setBanAsking(null);
    setBanReason('');

    setBanBusy(row.customer_id);
    setBanError('');
    setBanMessage('');
    try {
      const res = await fetch(`/api/admin/customers/${row.customer_id}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setBanMessage(`${who}: ${data?.message ?? 'Account banned.'}`);
        await load();
      } else {
        setBanError(data?.error || 'Could not ban that account.');
      }
    } catch {
      setBanError('Could not reach the server. Please try again.');
    } finally {
      setBanBusy(null);
    }
  }

  const stats = useMemo(() => {
    const countries = new Set(addresses.map(a => a.country).filter(Boolean));
    const located = addresses.filter(a => a.country).length;
    return {
      addresses: addresses.length,
      countries: countries.size,
      located,
      concerns: concerns.length,
    };
  }, [addresses, concerns]);

  const q = search.trim().toLowerCase();
  const filteredAddresses = addresses.filter(a => !q
    || (a.ip_address ?? '').toLowerCase().includes(q)
    || placeOf(a).toLowerCase().includes(q)
    || a.member_names.some(n => n.toLowerCase().includes(q)));
  const filteredVisitors = visitors.filter(v => !q
    || v.ip_address.toLowerCase().includes(q)
    || placeOf(v).toLowerCase().includes(q)
    || sourceLabel(v.first_source, v.first_source_detail).toLowerCase().includes(q)
    || v.member_names.some(n => n.toLowerCase().includes(q)));
  const filteredVisits = visits.filter(v => !q
    || (v.ip_address ?? '').toLowerCase().includes(q)
    || v.path.toLowerCase().includes(q)
    || sourceLabel(v.source, v.source_detail).toLowerCase().includes(q)
    || (v.city ?? '').toLowerCase().includes(q));
  const visitsLast30Days = visitSources.reduce((sum, s) => sum + s.visits, 0);
  const filteredRecent = recent.filter(r => !q
    || (r.ip_address ?? '').toLowerCase().includes(q)
    || (r.customer_name ?? '').toLowerCase().includes(q)
    || (r.customer_email ?? '').toLowerCase().includes(q)
    || (r.city ?? '').toLowerCase().includes(q));

  const MAIN_VIEWS: Array<{ id: MainView; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'products', label: 'Products & Categories' },
    { id: 'journeys', label: 'Visitor Journeys' },
    { id: 'technical', label: 'Technical Details' },
  ];
  const SECURITY_TABS: Array<{ id: TechnicalTab; label: string; count: number }> = [
    { id: 'raw', label: 'Raw Page Log', count: visits.length },
    { id: 'addresses', label: 'Addresses', count: addresses.length },
    { id: 'places', label: 'Visitor Locations', count: places.length },
    { id: 'concerns', label: 'Worth a Look', count: concerns.length },
    { id: 'banned', label: 'Banned & Flagged', count: matches.length + banned.length },
    { id: 'recent', label: 'Recent Activity', count: recent.length },
  ];
  const trackingNeedsAttention = !loading && !failed && trackingHealth?.healthy !== true;

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />

      <main id="main-content" className="flex-1 overflow-clip p-4 pb-24 sm:p-8">
        <div className="max-w-6xl">

          <div className="mb-5 flex items-start justify-between gap-3">
            <Link
              href="/admin/dashboard"
              className="inline-block rounded-full px-2 py-1 text-xs font-semibold text-stone-700 transition-colors hover:bg-white hover:text-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            >
              &larr; Dashboard
            </Link>
            <AdminViewToggle inline />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-pretty text-2xl font-semibold text-stone-900 sm:text-3xl">Visitor & Product Demand</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-600">
                Every human visitor is included, whether they have an account or not. Times are shown in UK time.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-xs font-bold ${failed || trackingNeedsAttention ? 'border-red-300 bg-red-50 text-red-900' : 'border-green-300 bg-green-50 text-green-900'}`}>
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${failed || trackingNeedsAttention ? 'bg-red-600' : 'bg-green-600 motion-safe:animate-pulse'}`} />
                {refreshing ? 'Checking now' : failed ? 'Live feed unavailable' : trackingNeedsAttention ? 'Tracking needs attention' : 'Tracking is healthy'}
              </span>
              <button
                type="button"
                onClick={() => load(true)}
                disabled={refreshing}
                className="min-h-11 rounded-full border border-stone-300 bg-white px-4 text-xs font-bold text-stone-800 transition-colors hover:border-gold-500 hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:cursor-wait disabled:opacity-60"
              >
                Refresh now
              </button>
            </div>
          </div>
          <p className="mb-6 mt-2 text-xs text-stone-500" aria-live="polite">
            {lastUpdated ? `Last checked ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Checking for the latest activity'}
          </p>

          {trackingNeedsAttention && (
            <div role="alert" className="mb-6 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-red-950">
              <span className="block text-xs font-bold uppercase tracking-[0.14em] text-red-700">Tracking needs attention</span>
              <p className="mt-1 text-sm font-semibold">Some customer activity has no matching visitor journey.</p>
              <p className="mt-1 text-sm text-red-900">
                {!trackingHealth
                  ? 'The tracking health check did not answer.'
                  : trackingHealth.untrackedRegistrations24h > 0
                  ? `${trackingHealth.untrackedRegistrations24h} new account${trackingHealth.untrackedRegistrations24h === 1 ? '' : 's'} in the last 24 hours did not have a matching page journey.`
                  : trackingHealth.feedStale
                    ? 'No page visit has been saved for 12 hours.'
                    : 'Customer activity is newer than the latest saved page visit.'}
              </p>
            </div>
          )}

          {/* A banned account's address seen on somebody else's account (task 9cd55f28). Above
              everything else, because it is the one thing on this page that asks for a decision. */}
          {!loading && matches.length > 0 && (
            <button
              type="button"
              onClick={() => { chooseView('technical'); chooseTechnicalTab('banned'); }}
              className="mb-6 flex w-full touch-manipulation items-center justify-between gap-4 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-left transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <span>
                <span className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-red-700">Needs Attention</span>
                <span className="block text-sm text-stone-800 font-semibold">
                  {matches.length === 1
                    ? 'One account is using an address a banned account used'
                    : `${matches.length} accounts are using an address a banned account used`}
                </span>
                <span className="mt-1 block text-sm text-stone-700">
                  It can be innocent: a house, an office and a phone mast all share one address. Have a look and decide.
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-red-700 px-4 py-2.5 text-xs font-bold text-white">See Who</span>
            </button>
          )}

          {view === 'technical' && <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Visits, 30 Days', value: loading ? '-' : String(visitsLast30Days) },
              { label: 'Addresses Seen', value: loading ? '-' : String(stats.addresses) },
              { label: 'Countries',      value: loading ? '-' : String(stats.countries) },
              { label: 'With A Location',value: loading ? '-' : String(stats.located) },
              { label: 'Worth A Look',   value: loading ? '-' : String(stats.concerns) },
              { label: 'Banned',         value: loading ? '-' : String(banned.length) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="mb-1 text-xs font-bold text-stone-600">{label}</div>
                <div className="text-2xl font-semibold tabular-nums text-stone-900">{value}</div>
              </div>
            ))}
          </div>}

          {/* Pinned so the tabs and search stay reachable down a long list (task 7fdb1670). */}
          <AdminStickyControls inset="p-4-sm-8">
          <div className="space-y-3 pb-3">
            <nav className="flex flex-wrap gap-2" aria-label="Demand sections">
              {MAIN_VIEWS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={view === item.id ? 'page' : undefined}
                  onClick={() => chooseView(item.id)}
                  className={`min-h-11 touch-manipulation rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${
                    view === item.id
                      ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
                      : 'border-stone-300 bg-white text-stone-800 hover:border-gold-500 hover:bg-gold-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            {view === 'technical' && <div className="flex flex-col gap-3 rounded-2xl border border-stone-300 bg-white p-2 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex flex-wrap gap-1" aria-label="Technical detail">
                {SECURITY_TABS.map(item => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => chooseTechnicalTab(item.id)} className={`min-h-11 touch-manipulation rounded-full px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${tab === item.id ? 'bg-stone-900 text-white' : 'text-stone-800 hover:bg-stone-100'}`}><span>{item.label}</span>{!loading && <span className="ml-1.5 opacity-70">{item.count}</span>}</button>)}
              </div>
              {(tab === 'raw' || tab === 'addresses' || tab === 'recent') && <label className="min-w-[220px] flex-1"><span className="sr-only">Search technical details</span><input type="text" name="technical-search" autoComplete="off" placeholder={tab === 'raw' ? 'Address, page or source…' : 'Address, place or member…'} value={search} onChange={e => setSearch(e.target.value)} className="min-h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none placeholder:text-stone-500 focus-visible:ring-2 focus-visible:ring-gold-500" /></label>}
            </div>}
          </div>
          </AdminStickyControls>

          <div className={view === 'technical' ? 'overflow-x-auto rounded-2xl border border-stone-300 bg-white shadow-sm [&_p]:!leading-relaxed [&_th]:!text-xs [&_th]:!font-bold [&_th]:!text-stone-700 [&_td]:!text-xs' : ''}>
            {loading ? (
              <p className="py-10 text-center text-sm text-stone-600">Loading…</p>
            ) : failed ? (
              <p className="py-10 text-center text-sm text-red-700">Could not load the visitor information. Refresh the page to try again.</p>
            ) : view !== 'technical' ? (
              <DemandPanel demand={demand} trends={trends} journeys={journeys} checkoutFunnel={checkoutFunnel} pageNames={pageNames} days={days} onDaysChange={setDays} view={view} />
            ) : tab === 'raw' ? (
              <div>
                {/* Where visitors come from, counted on the page that brought them. */}
                <div className="px-4 py-4 border-b border-stone-100">
                  <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">Where visitors came from, last 30 days</p>
                  <p className="text-[10px] text-stone-500">
                    Counted on the first page of each visit. Signed up and Ordered are addresses that went on to do
                    that, matched by address: a fair guide, not a proof, because a house, an office or a phone mast
                    shares one address.
                  </p>
                </div>
                <table className="w-full min-w-[620px]">
                  <thead>
                    <tr className="border-b border-stone-100 bg-stone-50">
                      {['Came From', 'Visits', 'Addresses', 'Signed Up', 'Ordered'].map(h => (
                        <th key={h} className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visitSources.length === 0 ? (
                      <tr><td colSpan={5} className="text-center text-xs text-stone-500 py-8">
                        Nothing recorded yet. Every page opened on the shop appears here from the moment this goes live.
                      </td></tr>
                    ) : visitSources.map(s => (
                      <tr key={s.source} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
                        <td className="px-4 py-3 text-[10px] text-stone-700">{SOURCE_LABELS[s.source] ?? s.source}</td>
                        <td className="px-4 py-3 text-[10px] text-stone-600">{s.visits}</td>
                        <td className="px-4 py-3 text-[10px] text-stone-600">{s.addresses}</td>
                        <td className="px-4 py-3 text-[10px] text-stone-600">{s.joined}</td>
                        <td className="px-4 py-3 text-[10px] text-stone-600">{s.ordered}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* One row per address that has visited, and what it went on to do. */}
                <div className="px-4 py-4 border-y border-stone-100 bg-stone-50/60">
                  <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">Visitor addresses</p>
                  <p className="text-[10px] text-stone-500">How each address first arrived, how often it has been back, and whether it became a member or placed an order.</p>
                </div>
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-stone-100 bg-stone-50">
                      {['Address', 'Roughly Where', 'First Came From', 'Visits', 'Became A Member', 'Ordered', 'First Seen', 'Last Seen'].map(h => (
                        <th key={h} className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVisitors.length === 0 ? (
                      <tr><td colSpan={8} className="text-center text-xs text-stone-500 py-8">
                        {visitors.length === 0 ? 'No visitors recorded yet.' : 'Nothing matches this search.'}
                      </td></tr>
                    ) : filteredVisitors.map(v => (
                      <tr key={v.ip_address} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors align-top">
                        <td className="px-4 py-3 text-[10px] font-mono text-stone-600 whitespace-nowrap">{v.ip_address}</td>
                        <td className="px-4 py-3 text-[10px] text-stone-600">
                          {placeOf(v)}
                          {v.postal_code && <span className="block text-[9px] text-stone-500">{v.postal_code}</span>}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-stone-600">{sourceLabel(v.first_source, v.first_source_detail)}</td>
                        <td className="px-4 py-3 text-[10px] text-stone-600">{v.visits}</td>
                        <td className="px-4 py-3 text-[10px] text-stone-600">
                          {v.joined
                            ? <span className="text-gold-700">Yes{v.member_names.length ? `: ${v.member_names.slice(0, 3).join(', ')}` : ''}</span>
                            : <span className="text-stone-300">No</span>}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-stone-600">
                          {v.ordered ? <span className="text-gold-700">Yes ({v.orders})</span> : <span className="text-stone-300">No</span>}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-stone-500 whitespace-nowrap">{formatDatetime(v.first_seen)}</td>
                        <td className="px-4 py-3 text-[10px] text-stone-500 whitespace-nowrap">{formatDatetime(v.last_seen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* The latest page views, one per row. */}
                <div className="px-4 py-4 border-y border-stone-100 bg-stone-50/60">
                  <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">Latest visits</p>
                  <p className="text-[10px] text-stone-500">Every page opened, newest first. A first page is the one that brought the visitor in.</p>
                </div>
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-stone-100 bg-stone-50">
                      {['Date / Time', 'Address', 'Roughly Where', 'Came From', 'Page', 'First Page'].map(h => (
                        <th key={h} className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVisits.length === 0 ? (
                      <tr><td colSpan={6} className="text-center text-xs text-stone-500 py-8">
                        {visits.length === 0 ? 'No visits recorded yet.' : 'Nothing matches this search.'}
                      </td></tr>
                    ) : filteredVisits.map(v => (
                      <tr key={v.id} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
                        <td className="px-4 py-3 text-[10px] text-stone-500 whitespace-nowrap">{formatDatetime(v.created_at)}</td>
                        <td className="px-4 py-3 text-[10px] font-mono text-stone-500">{v.ip_address ?? <span className="text-stone-300">Not known</span>}</td>
                        <td className="px-4 py-3 text-[10px] text-stone-600">
                          {v.country ? placeOf(v) : <span className="text-stone-300">Not known</span>}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-stone-600">{sourceLabel(v.source, v.source_detail)}</td>
                        <td className="px-4 py-3 text-[10px] font-mono text-stone-600">{v.path}</td>
                        <td className="px-4 py-3 text-[10px] text-stone-600">{v.landing ? 'Yes' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : tab === 'addresses' ? (
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50">
                    {['Address', 'Roughly Where', 'Members Seen', 'Times Seen', 'First Seen', 'Last Seen'].map(h => (
                      <th key={h} className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAddresses.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-xs text-stone-500 py-10">
                      {addresses.length === 0
                        ? 'Nothing recorded yet. Sign-ins, new members and batch code checks appear here from now on.'
                        : 'Nothing matches this search.'}
                    </td></tr>
                  ) : filteredAddresses.map(row => (
                    <tr key={row.ip_address ?? 'unknown'} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors align-top">
                      <td className="px-4 py-3 text-[10px] font-mono text-stone-600 whitespace-nowrap">{row.ip_address}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-600">
                        {placeOf(row)}
                        {row.postal_code && <span className="block text-[9px] text-stone-500">{row.postal_code}</span>}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-stone-600">
                        {row.member_names.length === 0
                          ? <span className="text-stone-300">Not signed in</span>
                          : row.member_names.slice(0, 4).join(', ')}
                        {row.member_names.length > 4 && <span className="text-stone-500"> +{row.member_names.length - 4} more</span>}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-stone-600">{row.events}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-500 whitespace-nowrap">{formatDatetime(row.first_seen)}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-500 whitespace-nowrap">{formatDatetime(row.last_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : tab === 'places' ? (
              <table className="w-full min-w-[620px]">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50">
                    {['Country', 'Area', 'Town Or City', 'Addresses', 'Members', 'Times Seen'].map(h => (
                      <th key={h} className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {places.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-xs text-stone-500 py-10">
                      No locations recorded yet. Locations are worked out live on the real site, so they
                      start filling in the moment this goes live.
                    </td></tr>
                  ) : places.map((p, i) => (
                    <tr key={`${p.country}-${p.country_region}-${p.city}-${i}`} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
                      <td className="px-4 py-3 text-[10px] text-stone-700">{countryName(p.country)}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-600">{p.country_region ?? ''}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-600">{p.city ?? ''}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-600">{p.addresses}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-600">{p.members}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-600">{p.events}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : tab === 'concerns' ? (
              <div className="divide-y divide-stone-50">
                {concerns.length === 0 ? (
                  <p className="text-center text-xs text-stone-500 py-10">
                    Nothing looks out of the ordinary.
                  </p>
                ) : concerns.map((c, i) => (
                  <div key={i} className="px-4 py-4">
                    <div className="text-[11px] text-stone-800">{c.headline}</div>
                    <div className="text-[10px] text-stone-500 mt-0.5">{c.detail}</div>
                    <div className="text-[9px] font-mono text-stone-500 mt-1">{c.subject}</div>
                  </div>
                ))}
              </div>
            ) : tab === 'banned' ? (
              <div>
                {(banMessage || banError) && (
                  <div className={`px-4 py-3 text-[11px] border-b ${banError ? 'bg-red-50 text-red-700 border-red-100' : 'bg-gold-50 text-gold-700 border-gold-100'}`}>
                    {banError || banMessage}
                  </div>
                )}

                {/* The flag. An address a banned account used, now on somebody else's account. */}
                <div className="px-4 py-4 border-b border-stone-100">
                  <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">
                    Flagged: same address as a banned account
                  </p>
                  <p className="text-[10px] text-stone-500">
                    A warning, never a verdict. Families share an address, so do offices, and so does
                    everybody on one phone mast. Read it, then decide.
                  </p>
                </div>
                {matches.length === 0 ? (
                  <p className="text-center text-xs text-stone-500 py-8">
                    Nothing flagged. Nobody has appeared on an address a banned account used.
                  </p>
                ) : (
                  <div className="divide-y divide-stone-50">
                    {matches.map(row => (
                      <div key={`${row.ip_address}-${row.customer_id}`} className="px-4 py-4 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] text-stone-800">
                            <Link href={`/admin/customers/${row.customer_id}`} className="text-gold-700 hover:underline">
                              {row.customer_name || row.customer_email}
                            </Link>
                            {' '}has used <span className="font-mono text-stone-600">{row.ip_address}</span>
                          </p>
                          <p className="text-[10px] text-stone-500 mt-0.5">
                            The same address as {row.banned_names.join(', ')}, who {row.banned_names.length === 1 ? 'is' : 'are'} banned.
                          </p>
                          <p className="text-[9px] text-stone-500 mt-0.5">
                            Seen {row.events} time{row.events === 1 ? '' : 's'}, last on {formatDatetime(row.last_seen)}
                            {row.city || row.country ? ` from ${placeOf({ city: row.city, country_region: null, country: row.country })}` : ''}.
                          </p>
                        </div>
                        {row.already_banned ? (
                          <span className="shrink-0 text-[9px] tracking-[0.15em] uppercase bg-stone-100 text-stone-500 px-3 py-2">
                            Already banned
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setBanError('');
                              setBanAsking(banAsking === row.customer_id ? null : row.customer_id);
                              setBanReason(`Seen on ${row.ip_address}, an address used by ${row.banned_names.join(', ')}`);
                            }}
                            disabled={banBusy === row.customer_id}
                            className="shrink-0 text-[9px] tracking-[0.15em] uppercase border border-red-300 text-red-600 px-3 py-2 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            {banBusy === row.customer_id ? 'Banning…' : 'Ban this account too'}
                          </button>
                        )}

                        {/* On the page, because a pop-up is not there at all on a phone. */}
                        {banAsking === row.customer_id && (
                          <div className="w-full mt-2 border border-red-300 bg-red-50 px-4 py-3">
                            <p className="text-[11px] text-stone-800 font-semibold mb-1">
                              Ban {row.customer_name || row.customer_email || `Customer ${row.customer_id}`}?
                            </p>
                            <p className="text-[10px] text-stone-600 leading-relaxed mb-2.5">
                              They will be signed out and will not be able to sign in or order. You can lift it
                              again at any time from their customer page.
                            </p>
                            <label htmlFor={`ip-ban-${row.customer_id}`} className="block text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">
                              Why?
                            </label>
                            <input
                              id={`ip-ban-${row.customer_id}`}
                              value={banReason}
                              onChange={e => setBanReason(e.target.value)}
                              placeholder="Staff only ever see this"
                              autoComplete="off"
                              className="w-full border border-stone-300 px-3 py-2 text-xs text-stone-700 focus:border-gold-700 outline-none bg-white"
                            />
                            <div className="flex flex-wrap gap-2 mt-2.5">
                              <button
                                type="button"
                                onClick={() => banFromFlag(row, banReason)}
                                disabled={banBusy === row.customer_id}
                                className="bg-red-600 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2 hover:bg-red-700 transition-colors disabled:opacity-50"
                              >
                                {banBusy === row.customer_id ? 'Banning…' : 'Yes, ban them'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setBanAsking(null); setBanReason(''); }}
                                className="text-[9px] tracking-[0.18em] uppercase text-stone-500 px-3 py-2 hover:text-stone-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Who is currently shut out, and which addresses they used. */}
                <div className="px-4 py-4 border-y border-stone-100 bg-stone-50/60">
                  <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">Banned accounts</p>
                  <p className="text-[10px] text-stone-500">
                    Shut out of the shop. Nothing has been deleted, and any of these can be let back
                    in from their own customer page.
                  </p>
                </div>
                {banned.length === 0 ? (
                  <p className="text-center text-xs text-stone-500 py-8">
                    Nobody is banned. You can ban an account from its customer page.
                  </p>
                ) : (
                  <div className="divide-y divide-stone-50">
                    {banned.map(row => (
                      <div key={row.id} className="px-4 py-4">
                        <p className="text-[11px] text-stone-800">
                          <Link href={`/admin/customers/${row.id}`} className="text-gold-700 hover:underline">
                            {`${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || row.email}
                          </Link>
                          <span className="text-stone-500"> · {row.email}</span>
                        </p>
                        <p className="text-[10px] text-stone-500 mt-0.5">
                          Banned {formatDatetime(row.banned_at)}
                          {row.banned_by ? ` by ${row.banned_by}` : ''}
                          {row.banned_reason ? `. ${row.banned_reason}` : '.'}
                        </p>
                        <p className="text-[9px] text-stone-500 mt-1">
                          {row.addresses.length === 0
                            ? 'No addresses recorded against this account.'
                            : `Addresses used: ${row.addresses.slice(0, 8).join(', ')}${row.addresses.length > 8 ? ` and ${row.addresses.length - 8} more` : ''}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50">
                    {['Date / Time', 'What Happened', 'Member', 'Address', 'Roughly Where'].map(h => (
                      <th key={h} className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRecent.length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-xs text-stone-500 py-10">Nothing to show.</td></tr>
                  ) : filteredRecent.map(row => (
                    <tr key={row.id} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
                      <td className="px-4 py-3 text-[10px] text-stone-500 whitespace-nowrap">{formatDatetime(row.created_at)}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-600">{EVENT_LABELS[row.event] ?? row.event}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-600">
                        {row.customer_name ?? <span className="text-stone-300">Not signed in</span>}
                      </td>
                      <td className="px-4 py-3 text-[10px] font-mono text-stone-500">{row.ip_address}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-600">
                        {row.country ? placeOf({ city: row.city, country_region: null, country: row.country }) : <span className="text-stone-300">Not known</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <details className="mt-4 rounded-xl border border-stone-300 bg-white p-4 text-sm text-stone-700">
            <summary className="min-h-11 cursor-pointer rounded-lg py-3 font-bold text-stone-900 hover:text-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">How This Data Works</summary>
            <p className="mt-2 leading-relaxed">
              Visits are recorded after a page loads. Staff browsing while signed in here and search-engine crawlers are left out. “Recorded earlier” means the address was stored before precise journeys existed, so no location is available. Locations come from the website’s hosting and are not sent to another company. Records older than 2 years are removed automatically. An address can be shared by a house, office or phone mast, so it is always a guide and never an automatic reason to ban somebody.
            </p>
          </details>

        </div>
      </main>
    </div>
  );
}
