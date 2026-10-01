'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import AdminEnquiryPopup, { type EnquiryPopupSnapshot } from './AdminEnquiryPopup';
import { subscribeAdminEnquiryCount } from '@/lib/adminEnquiryPolling';

interface NavItem { label: string; href: string; external?: boolean; }
interface NavGroup { group: string; items: NavItem[]; }

const ADMIN_NAV_GROUPS: NavGroup[] = [
  { group: 'Operations', items: [
    { label: 'Dashboard', href: '/admin/dashboard' },
    { label: 'Orders', href: '/admin/orders' },
    { label: 'Invoices', href: '/admin/invoices' },
    { label: 'Dispatch', href: '/admin/dispatch' },
    { label: 'Profitability', href: '/admin/profit' },
  ]},
  { group: 'Catalogue', items: [
    { label: 'Products', href: '/admin/products' },
    { label: 'Trial (Products & Profit)', href: '/admin/trial' },
    { label: 'Certificates', href: '/admin/certificates' },
    { label: 'Categories', href: '/admin/categories' },
  ]},
  { group: 'Promotions', items: [
    { label: 'Promotions', href: '/admin/promotions' },
    { label: 'Discount Codes', href: '/admin/discount-codes' },
    { label: 'Upsell System', href: '/admin/upsells' },
    { label: 'QR Campaigns', href: '/admin/qr-campaigns' },
    { label: 'Reviews', href: '/admin/reviews' },
  ]},
  { group: 'Customers', items: [
    { label: 'Customers', href: '/admin/customers' },
    { label: 'Security Review', href: '/admin/security-reviews' },
    { label: 'Member Logins', href: '/admin/member-logins' },
    { label: 'Batches', href: '/admin/batches' },
  ]},
  { group: 'Settings', items: [
    { label: 'Site Content', href: '/admin/content' },
    { label: 'System Health', href: '/admin/system-health' },
    { label: 'Shipping Settings', href: '/admin/bulk-weights' },
    { label: 'Nav Links', href: '/admin/nav-links' },
  ]},
];

interface CustomNavLink { id: number; label: string; href: string; }
const ENQUIRY_SEEN_KEY = 'wb-admin-enquiry-alert-seen-v1';
const SEARCH_ALIASES: Record<string, string> = {
  '/admin/dispatch': 'postage post royal mail labels shipping parcels',
  '/admin/products': 'stock inventory catalogue shop items',
  '/admin/enquiries': 'customer service support messages email questions',
  '/admin/orders': 'sales purchases customers payments',
  '/admin/system-health': 'problems errors faults status',
  '/admin/security-reviews': 'security accounts duplicates discount abuse shared network',
};

export default function AdminSidebar({ previewMode = false }: { previewMode?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navSearch, setNavSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const [customLinks, setCustomLinks] = useState<CustomNavLink[]>([]);
  const [failureCount, setFailureCount] = useState(0);
  const [securityReviewCount, setSecurityReviewCount] = useState(0);
  // Reviews arrive unapproved and show to nobody until someone acts on them, so
  // the count travels with you on every admin page rather than living only on
  // the Reviews page you would have to think to open.
  const [pendingReviews, setPendingReviews] = useState(0);
  const [newEnquiries, setNewEnquiries] = useState(0);
  const [enquiryCountError, setEnquiryCountError] = useState(false);
  const [enquiryPopup, setEnquiryPopup] = useState<EnquiryPopupSnapshot | null>(null);
  const seenEnquiryInMemory = useRef<{ lastTime: number; id: number } | null>(null);

  function acknowledgeEnquiryPopup() {
    if (!enquiryPopup) return;
    const lastTime = Date.parse(enquiryPopup.latestUpdatedAt);
    const id = enquiryPopup.recent[0]?.id;
    if (!Number.isFinite(lastTime) || !Number.isFinite(id)) return;
    seenEnquiryInMemory.current = { lastTime, id };
    try {
      window.localStorage.setItem(ENQUIRY_SEEN_KEY, JSON.stringify({ lastTime, id }));
    } catch { /* The current page can still dismiss its own note. */ }
    setEnquiryPopup(null);
  }

  useEffect(() => {
    if (previewMode) return;
    return subscribeAdminEnquiryCount(({ data, error }) => {
      if (error) {
        setEnquiryCountError(true);
        return;
      }
      try {
        setNewEnquiries(data.newCount);
        setEnquiryCountError(false);
        if (data.newCount === 0) {
          setEnquiryPopup(null);
        } else if (typeof data.latestUpdatedAt === 'string' && Array.isArray(data.recent) && data.recent.length) {
          const lastTime = Date.parse(data.latestUpdatedAt);
          if (Number.isFinite(lastTime)) {
            let seen = seenEnquiryInMemory.current;
            try {
              const stored = JSON.parse(window.localStorage.getItem(ENQUIRY_SEEN_KEY) ?? 'null');
              if (Number.isFinite(stored?.lastTime) && Number.isFinite(stored?.id)) seen = stored;
            } catch { /* show the note */ }
            const latestId = Number(data.recent[0].id);
            if (!seen || lastTime > seen.lastTime || (lastTime === seen.lastTime && latestId !== seen.id)) {
              setEnquiryPopup({
                newCount: data.newCount,
                latestUpdatedAt: data.latestUpdatedAt,
                recent: data.recent,
              });
            }
          }
        }
      } catch {
        setEnquiryCountError(true);
      }
    });
  }, [previewMode]);

  useEffect(() => {
    if (previewMode) return;
    fetch('/api/admin/nav-links')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.links)) setCustomLinks(data.links);
      })
      .catch(() => {});

    fetch('/api/admin/system-health')
      .then(res => res.json())
      .then(data => {
        // Open faults, not everything logged in the last day: see
        // src/lib/automationFailureKinds.ts for why a declined payment is not
        // a fault and must not put a red number on the sidebar.
        if (typeof data.openCount === 'number') setFailureCount(data.openCount);
      })
      .catch(() => {});

    fetch('/api/admin/security-reviews')
      .then(res => res.json())
      .then(data => {
        if (typeof data.pendingCount === 'number') setSecurityReviewCount(data.pendingCount);
      })
      .catch(() => {});

    fetch('/api/admin/reviews/pending-count')
      .then(res => res.json())
      .then(data => {
        if (typeof data.pending === 'number') setPendingReviews(data.pending);
      })
      .catch(() => {});
  }, [previewMode]);

  useEffect(() => {
    if (!mobileOpen) return;
    const trigger = mobileTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector<HTMLButtonElement>('[data-testid="admin-drawer-close"]')?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      trigger?.focus();
    };
  }, [mobileOpen]);

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  }

  const visitorDemandActive = pathname === '/admin/ip-addresses'
    || pathname.startsWith('/admin/ip-addresses/');
  const websiteEnquiriesActive = pathname === '/admin/enquiries'
    || pathname.startsWith('/admin/enquiries/');
  const searchTerm = navSearch.trim().toLowerCase();
  const matchesSearch = (label: string, href: string) => !searchTerm
    || `${label} ${href} ${SEARCH_ALIASES[href] ?? ''}`.toLowerCase().includes(searchTerm);
  const visibleGroups = ADMIN_NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter(({ label, href }) => matchesSearch(label, href)) }))
    .filter((group) => group.items.length > 0);
  const visitorDemandVisible = matchesSearch('Visitor Demand', '/admin/ip-addresses');
  const websiteEnquiriesVisible = matchesSearch('Website Enquiries', '/admin/enquiries');
  const visibleCustomLinks = customLinks.filter(({ label, href }) => matchesSearch(label, href));
  const noSearchResults = Boolean(searchTerm)
    && !visitorDemandVisible
    && !websiteEnquiriesVisible
    && visibleGroups.length === 0
    && visibleCustomLinks.length === 0;

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'Escape' && navSearch) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setNavSearch('');
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleSearchShortcut, true);
    return () => window.removeEventListener('keydown', handleSearchShortcut, true);
  }, [navSearch]);

  // Publishes the mobile bar's own height as `--admin-bar-height`, the same way
  // StickyHeaderStack publishes the public header stack's. Anything else pinned
  // inside an admin page (currently the products filter bar) offsets by both, so
  // the two stack instead of landing on top of each other. Measured rather than
  // hard-coded because the bar's height follows its font and padding.
  // Above `lg` the bar is `display: none`, so offsetHeight is 0 and every
  // consumer's calc() collapses back to the header stack alone.
  const mobileBarRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = mobileBarRef.current;
    if (!el) return;
    const measure = () =>
      document.documentElement.style.setProperty('--admin-bar-height', `${el.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      document.documentElement.style.removeProperty('--admin-bar-height');
    };
  }, []);

  return (
    <>
      {enquiryPopup && <AdminEnquiryPopup alert={enquiryPopup} onAcknowledge={acknowledgeEnquiryPopup} />}
      {/* Mobile top bar — only rendered below lg, where the sidebar below is an
          off-canvas drawer rather than always-visible. Desktop (lg:) keeps the
          original always-visible aside untouched, so this bar never shows there.

          `sticky`, because this bar carries the only way to reach the menu on a
          phone and it used to scroll off the top of every admin page, stranding
          you at the bottom of a long list with no navigation (task 7fdb1670).
          It pins below the public promo/header/ticker stack via the same live
          `--site-header-stack-height` the sidebar uses, rather than top-0, which
          would park it behind them.

          This only works because the admin page wrappers use `overflow-clip`
          rather than `overflow-hidden`: `hidden` also creates a scrolling box,
          and sticky attaches to the nearest scrolling box instead of the page,
          so the bar would pin itself to something that never moves. That is
          measured, not assumed — see SiteChrome.tsx and commit 307b332.

          z-30 sits above page content and the products filter bar (also z-30 but
          earlier in paint order and offset below this), and below the drawer
          backdrop (z-40) and the drawer itself (z-50), so opening the menu still
          covers this bar rather than fighting it. */}
      <div
        ref={mobileBarRef}
        style={{ top: 'var(--site-header-stack-height, 0px)' }}
        className="lg:hidden sticky z-30 flex items-center justify-between gap-3 bg-white border-b border-stone-200 px-4 py-3 shrink-0">
        <button
          ref={mobileTriggerRef}
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open admin menu"
          aria-expanded={mobileOpen}
          className="-ml-2 flex h-11 w-11 touch-manipulation items-center justify-center text-stone-500 transition-colors hover:text-gold-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="font-serif text-sm text-gold-700 font-bold">Windsor Beauty</span>
          <span className="inline-flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 text-[7px] tracking-[0.2em] uppercase px-1.5 py-0.5 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            Admin
          </span>
        </div>
        <div className="w-9" aria-hidden="true" />
      </div>

      {/* Backdrop — mobile drawer only */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close admin menu"
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Invisible spacer — reserves the sidebar's width in each admin page's
          flex row. The real <aside> below is `fixed`, so it's taken out of
          flow entirely; without this, <main> would expand under it. Desktop
          only — the mobile drawer is already an overlay with no layout
          space to reserve. */}
      <div className="hidden lg:block lg:w-56 shrink-0" aria-hidden="true" />

      {/* Sidebar. `fixed` directly against the true browser viewport (no
          transform-bearing ancestor in between) — anchored with an inline
          `top` instead of Tailwind's `inset-y-0` so it sits flush below the
          public promo/header/announcement stack via the `--site-header-
          stack-height` CSS variable that StickyHeaderStack measures and
          keeps live.
          History: `lg:sticky` scrolled off on long pages (its nearest
          scrolling ancestor never itself scrolled, so sticky had nothing to
          stick against) → fixed it with `position: fixed`, but anchored
          to an ancestor wrapper given `transform: translateZ(0)` so the
          sidebar wouldn't start at true viewport y:0 and overlap the header.
          That ancestor-anchoring approach was itself the bug: a `transform`
          only repositions a fixed element's coordinate origin to that
          ancestor's box — it does NOT make the element immune to scrolling
          if that ancestor box itself moves with the page (confirmed live:
          on long admin pages the sidebar scrolled away with the rest of the
          page). True viewport-relative `fixed` has no such failure mode —
          it ignores ALL scrolling, on every page, by definition. */}
      <aside
        ref={drawerRef}
        role={mobileOpen ? 'dialog' : undefined}
        aria-label="Admin menu"
        aria-modal={mobileOpen ? true : undefined}
        style={{ top: 'var(--site-header-stack-height, 0px)' }}
        className={`w-64 lg:w-56 bg-white border-r border-stone-200 shadow-[2px_0_16px_-4px_rgba(0,0,0,0.08)] flex flex-col shrink-0 overflow-y-auto overscroll-contain fixed bottom-0 left-0 z-50 transform transition-[transform,visibility] duration-200 motion-reduce:transition-none lg:visible lg:translate-x-0 ${
          mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        {/* Branding + admin indicator */}
        <div className="px-5 py-5 border-b border-stone-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="font-serif text-base text-gold-700 font-bold">Windsor Beauty</div>
              <span className="inline-flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 text-[7px] tracking-[0.2em] uppercase px-1.5 py-0.5 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                Admin
              </span>
            </div>
            <div className="text-[8px] tracking-[0.25em] text-stone-600 uppercase">Admin Portal</div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close admin menu"
            data-testid="admin-drawer-close"
            className="lg:hidden -mr-2 flex h-11 w-11 touch-manipulation items-center justify-center text-stone-500 transition-colors hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Grouped navigation */}
        <nav className="flex-1 px-3 py-3">
          <div className="relative mb-3">
            <label htmlFor="admin-nav-search" className="sr-only">Search admin pages</label>
            <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="8.5" cy="8.5" r="5.25" />
              <path d="m12.5 12.5 4 4" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              id="admin-nav-search"
              type="search"
              value={navSearch}
              onChange={(event) => setNavSearch(event.target.value)}
              placeholder="Find an admin page"
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-stone-200 bg-stone-50 pl-9 pr-9 text-xs text-stone-800 outline-none transition-colors placeholder:text-stone-500 focus:border-gold-600 focus:bg-white focus:ring-2 focus:ring-gold-200"
            />
            {navSearch && (
              <button
                type="button"
                onClick={() => { setNavSearch(''); searchRef.current?.focus(); }}
                aria-label="Clear admin search"
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
              >
                <span aria-hidden>&times;</span>
              </button>
            )}
          </div>

          <div className="mb-4 space-y-2">
            {visitorDemandVisible && <Link
              href="/admin/ip-addresses"
              onClick={() => setMobileOpen(false)}
              className={`flex min-h-11 touch-manipulation items-center rounded-xl border-2 px-3 py-2.5 font-serif text-sm font-bold tracking-[0.02em] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-inset lg:min-h-0 lg:py-2 ${
                visitorDemandActive
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-gold-600 bg-gold-50 text-stone-900 hover:border-gold-700 hover:bg-gold-100'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg aria-hidden="true" className={`h-4 w-4 shrink-0 ${visitorDemandActive ? 'text-gold-300' : 'text-gold-700'}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 16V9m5 7V5m5 11v-4m4 4V2" strokeLinecap="round" />
                </svg>
                Visitor Demand
              </span>
            </Link>}

            {websiteEnquiriesVisible && <Link
              href="/admin/enquiries"
              onClick={() => setMobileOpen(false)}
              className={`flex min-h-11 touch-manipulation items-center justify-between rounded-xl border-2 px-3 py-2.5 font-serif text-[13px] font-bold tracking-0 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-inset lg:min-h-0 lg:py-2 ${
                websiteEnquiriesActive
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-gold-600 bg-white text-stone-900 hover:border-gold-700 hover:bg-gold-50'
              }`}
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <svg aria-hidden="true" className={`h-4 w-4 shrink-0 ${websiteEnquiriesActive ? 'text-gold-300' : 'text-gold-700'}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M2.75 5.25A1.75 1.75 0 0 1 4.5 3.5h11A1.75 1.75 0 0 1 17.25 5.25v7.5a1.75 1.75 0 0 1-1.75 1.75H9l-3.75 2v-2H4.5a1.75 1.75 0 0 1-1.75-1.75v-7.5Z" strokeLinejoin="round" />
                  <path d="m4.25 5.5 5.75 4 5.75-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Website Enquiries
              </span>
              {(newEnquiries > 0 || enquiryCountError) && (
                <span
                  title={enquiryCountError ? 'Customer enquiry alerts could not be checked. Open this page.' : `${newEnquiries} customer enquiries need an answer`}
                  className={`ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-sans text-[9px] font-bold leading-none text-white ${enquiryCountError ? 'bg-red-600' : 'bg-gold-700'}`}
                >
                  {enquiryCountError ? '!' : newEnquiries > 99 ? '99+' : newEnquiries}
                </span>
              )}
            </Link>}
          </div>

          {visibleGroups.map((group) => (
            <div key={group.group} className="mb-3">
              <div className="px-3 py-1 text-[7px] tracking-[0.3em] uppercase text-gold-650 font-bold underline underline-offset-2 decoration-1">
                {group.group}
              </div>
              {group.items.map(({ label, href, external }) => {
                // An external entry must never match on pathname, or a stray
                // startsWith could light it up while you are elsewhere in admin.
                const active = !external
                  && (pathname === href || (href !== '/admin/dashboard' && pathname.startsWith(href)));
                const Cmp = external ? 'a' : Link;
                return (
                  <Cmp
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className={`flex min-h-11 touch-manipulation items-center justify-between rounded-sm px-3 py-2.5 text-xs tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-inset lg:min-h-0 lg:py-2 ${
                      active
                        ? 'bg-gold-50 font-semibold text-gold-700'
                        : 'text-stone-500 hover:bg-gold-50 hover:text-gold-700'
                    }`}
                  >
                    <span>
                      {label}
                      {external && (
                        <span aria-hidden className="ml-1.5 text-stone-300">&#8599;</span>
                      )}
                      {external && <span className="sr-only"> (opens in a new tab)</span>}
                    </span>
                    {href === '/admin/system-health' && failureCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold leading-none">
                        {failureCount > 99 ? '99+' : failureCount}
                      </span>
                    )}
                    {href === '/admin/security-reviews' && securityReviewCount > 0 && (
                      <span className="inline-flex min-w-[16px] items-center justify-center rounded-full bg-gold-700 px-1 text-[9px] font-semibold leading-4 text-white">
                        {securityReviewCount > 99 ? '99+' : securityReviewCount}
                      </span>
                    )}
                    {/* Gold, not red: a review waiting is work to do, not a fault. */}
                    {href === '/admin/reviews' && pendingReviews > 0 && (
                      <span
                        title={`${pendingReviews} ${pendingReviews === 1 ? 'review is' : 'reviews are'} waiting for approval`}
                        className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-gold-700 text-white text-[9px] font-semibold leading-none"
                      >
                        {pendingReviews > 99 ? '99+' : pendingReviews}
                      </span>
                    )}
                  </Cmp>
                );
              })}
            </div>
          ))}

          {visibleCustomLinks.length > 0 && (
            <div className="mb-3">
              <div className="px-3 py-1 text-[7px] tracking-[0.3em] uppercase text-gold-650 font-bold underline underline-offset-2 decoration-1">
                Custom
              </div>
              {visibleCustomLinks.map(({ id, label, href }) => {
                const external = !href.startsWith('/');
                const active = !external && (pathname === href || pathname.startsWith(href));
                const className = `flex min-h-11 touch-manipulation items-center rounded-sm px-3 py-2.5 text-xs tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-inset lg:min-h-0 lg:py-2 ${
                  active
                    ? 'text-gold-700 bg-gold-50 font-semibold'
                    : 'text-stone-500 hover:text-gold-700 hover:bg-gold-50'
                }`;
                return external ? (
                  <a key={id} href={href} target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)} className={className}>
                    {label} ↗
                  </a>
                ) : (
                  <Link key={id} href={href} onClick={() => setMobileOpen(false)} className={className}>
                    {label}
                  </Link>
                );
              })}
            </div>
          )}

          {noSearchResults && (
            <div role="status" className="mx-2 mt-6 rounded-lg border border-stone-200 bg-stone-50 px-3 py-4 text-center text-xs leading-5 text-stone-500">
              No admin page matches “{navSearch.trim()}”.
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-stone-100 shrink-0">
          <button
            type="button"
            onClick={handleLogout}
            className="min-h-11 w-full touch-manipulation bg-gold-700 py-2.5 text-[9px] tracking-[0.18em] uppercase text-white transition-colors hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 lg:min-h-0 lg:py-2"
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
