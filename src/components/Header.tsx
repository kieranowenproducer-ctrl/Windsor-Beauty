'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isStaffView } from '@/lib/staffView';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useCart } from '@/contexts/CartContext';

const NAV_LINKS: { label: string; href: string; highlight?: boolean }[] = [
  { label: 'Shop', href: '/shop' },
  { label: 'Special Offers', href: '/promotion' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  // Reviews now sits in the main nav so it's reachable from every page, not only
  // the homepage.
  { label: 'Reviews', href: '/reviews' },
];

export default function Header() {
  const pathname = usePathname();
  const { totalItems, openDrawer } = useCart();

  // The basket is a real link to /cart that upgrades into the slide-out drawer.
  //
  // It used to be a plain <button onClick={openDrawer}>. A button's onClick does
  // nothing until React has finished hydrating the page, but the header is
  // painted long before that, so the basket looked ready and ignored presses.
  // Measured against a production build on 23 August: the button was on screen
  // at 0.9s but dead for a further 0.73-0.84s on a fast desktop line, and for
  // 18.5s (home) to 27.7s (shop) at phone speed. That is the "it's not working,
  // then it works" in the report.
  //
  // As a link it always does something the instant it is pressed: before
  // hydration the browser simply navigates to the full basket page, which needs
  // no JavaScript at all. Once hydrated, preventDefault wins the race and the
  // drawer opens exactly as before. Modified clicks (new tab, middle-click) are
  // left alone so the link behaves like a link.
  const handleBasketClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      openDrawer();
    },
    [openDrawer]
  );

  // When a logged-in ADMIN is browsing the public site, the account icon should
  // take them back to the admin panel (where they're still signed in), not to
  // the customer /account login — otherwise clicking it looks like being
  // "signed out". The middleware sets a non-httpOnly `wb_ui_session=staff`
  // hint cookie for admins, which we can read here.
  const [isStaff, setIsStaff] = useState(false);
  useEffect(() => {
    setIsStaff(isStaffView());
  }, [pathname]);
  const accountHref = isStaff ? '/admin' : '/account';
  const accountLabel = isStaff ? 'Admin panel' : 'My account';
  const navLinks = NAV_LINKS;

  // Mobile nav scroll cues: the strip scrolls sideways, but with a hidden
  // scrollbar nothing says so — links past the fold (Contact, Reviews) looked
  // missing. Track whether more content exists in each direction and show an
  // edge fade + gold chevron on that side; tapping the chevron nudges the strip.
  const mobileNavRef = useRef<HTMLDivElement | null>(null);
  const [navCueLeft, setNavCueLeft] = useState(false);
  const [navCueRight, setNavCueRight] = useState(false);
  const updateNavCues = useCallback(() => {
    const el = mobileNavRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setNavCueLeft(el.scrollLeft > 8);
    setNavCueRight(el.scrollLeft < max - 8);
  }, []);
  useEffect(() => {
    updateNavCues();
    const el = mobileNavRef.current;
    el?.addEventListener('scroll', updateNavCues, { passive: true });
    window.addEventListener('resize', updateNavCues);
    return () => {
      el?.removeEventListener('scroll', updateNavCues);
      window.removeEventListener('resize', updateNavCues);
    };
  }, [updateNavCues]);
  const nudgeNav = (dir: 1 | -1) => {
    const el = mobileNavRef.current;
    el?.scrollBy({ left: dir * Math.round(el.clientWidth * 0.6), behavior: 'smooth' });
  };

  return (
    <header className="bg-stone-50 border-b border-gold-100">
      {/* relative container so nav can be absolutely centered on full width */}
      {/* EXPERIMENTAL MOBILE NAV REDESIGN (2026-06-18): height was a flat h-[96px]
          for both breakpoints. Mobile now uses a shorter h-16 (64px, tightened
          further from an initial h-20) so the logo/icon row sits closer to the
          nav strip below. Desktop is pinned back to the original 96px via
          md:h-[96px] and is otherwise untouched.
          ROLLBACK: change `h-16 md:h-[96px]` back to `h-[96px]`. */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 md:h-[96px] relative flex items-center justify-between">

        {/* Header logo — horizontal version */}
        <Link href="/" className="flex items-center select-none shrink-0 relative z-10">
          <Image
            src="/images/windsor-beauty-logo-transparent.png"
            alt="Windsor Beauty"
            width={2694}
            height={648}
            className="w-auto object-contain"
            style={{ height: '40px' }}
            priority
          />
        </Link>

        {/* Desktop navigation — absolutely centered on the full header width.
            xl:flex (was md:flex) and gap-4 (was gap-6), measured, not guessed:
            with nine links the centered row is ~646px wide, and the free span
            between the logo and the My Account/My Basket block is ~620px at a
            1024 viewport and ~364px at 768 — the row was already running into
            "My Account" at those widths BEFORE the AI Concierge link was added
            (~21px overlap at 1024, measured in a real browser on 2026-08-04).
            So the centered row now appears only from xl (1280px) up, where
            gap-4 clears both neighbours, and everything below xl uses the
            scrollable strip beneath the logo row, which handles any width. */}
        <nav aria-label="Main" className="hidden xl:flex absolute left-1/2 -translate-x-1/2 items-center gap-4">
          {navLinks.map(({ label, href, highlight }) => (
            <Link
              key={href}
              href={href}
              className={`whitespace-nowrap text-[10px] tracking-[0.14em] uppercase transition-colors ${
                highlight
                  ? pathname === href
                    ? 'text-gold-700 font-bold'
                    : 'text-gold-700 font-bold hover:text-gold-700'
                  : pathname === href
                    ? 'text-gold-700 font-semibold'
                    : 'text-stone-500 hover:text-gold-800'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Account + Basket buttons */}
        <div className="hidden md:flex items-center gap-5 shrink-0 relative z-10">
          <Link
            href={accountHref}
            className="flex items-center gap-2 text-[10px] tracking-[0.14em] uppercase text-stone-600 font-semibold hover:text-gold-800 transition-colors"
            aria-label={accountLabel}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>{isStaff ? 'Admin' : 'My Account'}</span>
          </Link>
          <Link
            href="/cart"
            onClick={handleBasketClick}
            className="flex items-center gap-2 text-[10px] tracking-[0.14em] uppercase text-stone-600 font-semibold hover:text-gold-800 transition-colors relative"
            aria-label="Open basket"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <span>My Basket</span>
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-3 w-4 h-4 rounded-full bg-gold-700 text-white text-[8px] flex items-center justify-center font-bold">
                {totalItems > 9 ? '9+' : totalItems}
              </span>
            )}
          </Link>
        </div>

        {/* Mobile: account + basket */}
        <div className="md:hidden flex items-center gap-3">
          <Link
            href={accountHref}
            className="p-1 text-stone-500 hover:text-gold-800 transition-colors"
            aria-label={accountLabel}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </Link>
          <Link
            href="/cart"
            onClick={handleBasketClick}
            className="relative p-1 text-stone-500 hover:text-gold-800 transition-colors"
            aria-label="Open basket"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gold-700 text-white text-[8px] flex items-center justify-center font-bold">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Mobile navigation — horizontally scrollable strip beneath logo/icons.
          Uses overflow-x-auto so the full link list (including Reviews and
          Reviews) can be swiped through on any screen width without compressing
          or wrapping. Each Link has shrink-0 so items never squish — the
          strip overflows internally and does not cause page-level overflow.
          [&::-webkit-scrollbar]:hidden + [scrollbar-width:none] match the
          pattern used in HomeReviewsCarousel for an invisible scrollbar.
          ROLLBACK to the old flex-1 distributed layout: replace the <nav>
          and its children with the version in git history. */}
      {/* xl:hidden (was md:hidden): tablets and small laptops now use this strip
          too, because the centered desktop row does not fit below 1280px — see
          the measurement note on the desktop nav above. w-max/min-w-full keeps
          the strip centred when everything fits and scrollable when it doesn't. */}
      <div className="xl:hidden relative">
        <nav
          aria-label="Main, compact"
          ref={mobileNavRef}
          className="h-10 bg-stone-50 overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
        >
          <div className="flex items-center justify-center h-full px-1 w-max min-w-full">
            {navLinks.map(({ label, href, highlight }) => {
              const isActive = pathname === href;
              return (
                <Link key={href} href={href} className="shrink-0 flex items-center justify-center h-full px-2.5">
                  <span
                    className={`whitespace-nowrap text-[8px] tracking-[0.1em] uppercase transition-colors px-1.5 py-1 ${
                      isActive
                        ? 'bg-gold-700 text-white font-semibold'
                        : highlight
                          ? 'text-gold-700 font-bold hover:text-gold-800'
                          : 'text-gold-700 hover:text-gold-800'
                    }`}
                  >
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Scroll cues: an edge fade + tappable gold chevron on any side with
            more links off-screen. They live outside the scroller so they stay
            pinned; the fade never blocks taps (pointer-events-none), only the
            small chevron button is interactive.

            WIDTH AND OPACITY FIXED 24 SEPTEMBER 2026. The fade was 48px wide and
            only reached 80% white where the chevron sat, so a menu word showed
            through the button and was sliced in half by it. Measured on a 390px
            phone: the chevron overlapped the word "About" by 11 pixels, which is
            what the homepage screenshot showed. The fade is now 64px and fully
            opaque for its first half, so the chevron always sits on clean white
            and a word fades out before it reaches the button.
            ROLLBACK: drop `w-16`/`justify-*` and put back `via-white/80` with the
            old `pr-5`/`pl-5` padding. */}
        {navCueLeft && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex w-16 items-center justify-start bg-gradient-to-r from-white via-white to-transparent pl-1">
            <button
              type="button"
              onClick={() => nudgeNav(-1)}
              aria-label="Scroll menu left"
              className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full border border-gold-200 bg-white text-gold-700 shadow-sm"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 5l-7 7 7 7" />
              </svg>
            </button>
          </div>
        )}
        {navCueRight && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex w-16 items-center justify-end bg-gradient-to-l from-white via-white to-transparent pr-1">
            <button
              type="button"
              onClick={() => nudgeNav(1)}
              aria-label="Scroll menu right"
              className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full border border-gold-200 bg-white text-gold-700 shadow-sm"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
