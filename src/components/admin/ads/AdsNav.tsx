'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// The navigation bar across the top of Ad Results, the way the shop's header
// works: click a name, land on that page. Six pages, each one thing. The page
// you are on is bold, gold and tinted. On a phone they stay in one swipeable
// row. That leaves more of the figures on screen while keeping all six pages
// one tap away.

export const ADS_PAGES: { href: string; label: string; hint: string }[] = [
  { href: '/admin/ads', label: 'Dashboard', hint: 'The money, the verdict, the big numbers and the graph' },
  { href: '/admin/ads/compare', label: 'Compare', hint: 'Make a new ad, tick the ads to compare, and see them side by side' },
  { href: '/admin/ads/all', label: 'Current and past', hint: 'Current ads first, with past and hidden ads folded away' },
  { href: '/admin/ads/after-the-click', label: 'After the click', hint: 'What people did on the site, cost per visitor, break-even' },
  { href: '/admin/ads/who-and-when', label: 'Who and when', hint: 'Day by day, time of day, day of the week, who saw the ads and where' },
  { href: '/admin/ads/advice', label: 'Advice', hint: 'What the numbers say, and what to try next' },
];

export default function AdsNav() {
  const pathname = usePathname();
  const scrollerRef = useRef<HTMLDivElement>(null);

  // A direct link to a later page, such as Advice, opens with its active tab
  // already visible. This only moves the tab row, never the whole page.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = scroller?.querySelector<HTMLElement>('[aria-current="page"]')?.closest<HTMLElement>('li');
    if (!scroller || !active || scroller.scrollWidth <= scroller.clientWidth) return;
    const left = active.offsetLeft - ((scroller.clientWidth - active.clientWidth) / 2);
    scroller.scrollTo({ left: Math.max(0, left), behavior: 'auto' });
  }, [pathname]);

  return (
    <nav
      aria-label="Ad Results pages"
      data-testid="ads-nav"
      style={{ top: 'calc(var(--site-header-stack-height, 0px) + var(--admin-bar-height, 0px) + 8px)' }}
      className="sticky sm:static z-20 bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)] mb-8"
    >
      <div className="flex items-center justify-between gap-3 px-3 pt-2 sm:hidden" aria-hidden="true">
        <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-stone-600">Sections</span>
        <span className="text-[10px] tracking-[0.12em] uppercase text-stone-500">Swipe for more &#8594;</span>
      </div>
      <div
        ref={scrollerRef}
        data-testid="ads-nav-scroll"
        className="overflow-x-auto overscroll-x-contain touch-pan-x"
      >
        <ul className="flex w-max min-w-full snap-x snap-mandatory items-stretch gap-1 p-1.5 sm:grid sm:w-auto sm:grid-cols-3 lg:grid-cols-6">
          {ADS_PAGES.map((p) => {
            const active = p.href === '/admin/ads' ? pathname === p.href : pathname.startsWith(p.href);
            return (
              <li key={p.href} className="shrink-0 snap-center sm:min-w-0">
                <Link
                  href={p.href}
                  title={p.hint}
                  aria-current={active ? 'page' : undefined}
                  data-testid="ads-nav-link"
                  data-active={active}
                  className={`flex min-h-11 touch-manipulation items-center justify-center rounded-xl border-b-[3px] px-4 py-3 text-center text-[11px] tracking-[0.14em] uppercase whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-inset ${
                    active
                      ? 'bg-gold-50 text-gold-800 font-bold border-gold-600'
                      : 'text-stone-600 font-medium border-transparent hover:bg-stone-50 hover:text-gold-700'
                  }`}
                >
                  {p.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
