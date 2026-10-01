'use client';

import { Children } from 'react';
import { usePathname } from 'next/navigation';
import CampaignPoster from './CampaignPoster';

// Every page opens with the promo bar, the logo row, a long navigation strip
// and the announcement bar. Someone using a keyboard had to press Tab through
// all of it on every single page before reaching a product. This is the first
// thing focus lands on: invisible until it is tabbed to, then it jumps straight
// past the header to the page's own content.
function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[999] focus:bg-white focus:text-stone-900 focus:border focus:border-gold-700 focus:px-4 focus:py-2 focus:text-[11px] focus:tracking-[0.15em] focus:uppercase focus:font-semibold focus:shadow-lg"
    >
      Skip to the main content
    </a>
  );
}

// Wraps every route in the public site's chrome (sticky header stack, cart
// drawer, discount popup, footer). Admin routes get the same site header but
// skip the cart, popup, and footer. There is no entry gate: the shop is open
// to everybody.
export default function SiteChrome({
  children,
  headerStack,
  cartDrawer,
  discountPopup,
  footer,
}: {
  children: React.ReactNode;
  headerStack: React.ReactNode;
  cartDrawer: React.ReactNode;
  discountPopup: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  // Next can supply route children as an array. Normalising it here gives
  // every item a stable React key and keeps the browser console clean.
  const pageChildren = Children.toArray(children);

  // The temporary pre-launch wall — its own full-screen page, not nested
  // inside the normal header/footer/cart/discount-popup chrome.
  if (pathname === '/coming-soon') {
    return <>{pageChildren}</>;
  }

  // Email-link destinations and legal/payment pages never show the discount
  // popup: a password-reset or verification click has to land straight on the
  // action it promised, and nobody reading a policy wants an offer over it.
  const POPUP_EXEMPT_PREFIXES = [
    // /reviews is where the review-request email's button lands.
    '/account', '/pay', '/unsubscribe', '/reviews',
    '/terms', '/privacy', '/refund-policy', '/returns', '/shipping',
    '/disclaimer', '/payment-policy', '/contact-policy', '/cookies',
  ];
  const popupExempt = POPUP_EXEMPT_PREFIXES.some(
    prefix => pathname === prefix || pathname?.startsWith(`${prefix}/`)
  );

  if (pathname?.startsWith('/admin')) {
    return (
      <>
        {headerStack}
        {/* No transform here on purpose. An earlier version added
            [transform:translateZ(0)] to give this box its own containing
            block for fixed-position descendants (to stop AdminSidebar's
            `position: fixed` from starting at true viewport y:0 and
            overlapping the header above). That worked for the overlap, but
            broke on long pages: a `transform`-bearing ancestor only
            repositions a fixed descendant's coordinate origin to ITS box —
            it doesn't make that descendant immune to scrolling if the
            ancestor itself moves with the page. Confirmed live: the sidebar
            scrolled away with the rest of a long admin page. AdminSidebar
            now anchors to the true viewport instead (no ancestor transform
            anywhere in this tree) and pushes itself below the header via a
            `top: var(--site-header-stack-height)` CSS variable that
            StickyHeaderStack keeps live — see AdminSidebar.tsx. */}
        {/* `overflow-clip`, not `overflow-hidden`, and the difference is the whole reason a
            sticky element inside any admin page works at all (task 311bbdc8). Both clip the same
            way. `hidden` ALSO makes this a scrolling box, and `position: sticky` attaches to the
            nearest scrolling box rather than to the viewport — so a sticky toolbar four levels
            down was pinning itself to a box that never scrolls, i.e. doing nothing, while the
            document scrolled past underneath. Measured on a preview: with `hidden` the bar sat at
            -2628px after a 3000px scroll; with `clip`, at 0px. `clip` creates no scroll box, so
            sticky passes through to the document. Nothing about the clipping changes. */}
        <div className="flex-1 min-h-0 overflow-clip">{pageChildren}</div>
      </>
    );
  }

  if (popupExempt) {
    return (
      <>
        <CampaignPoster />
        <SkipLink />
        {headerStack}
        {cartDrawer}
        <main
          id="main"
          /* tabIndex -1 so the skip link actually MOVES focus here rather than
             just scrolling: a fragment link does nothing to the keyboard
             position unless its target can hold focus. scrollMarginTop keeps
             the sticky header from covering the top of what it jumped to. */
          tabIndex={-1}
          style={{ scrollMarginTop: 'var(--site-header-stack-height, 0px)' }}
          className="flex-1 focus:outline-none"
        >{pageChildren}</main>
        {footer}
      </>
    );
  }

  return (
    <>
      <CampaignPoster />
      <SkipLink />
      {headerStack}
      {cartDrawer}
      {discountPopup}
      <main
        id="main"
        /* tabIndex -1 so the skip link actually MOVES focus here rather than
           just scrolling: a fragment link does nothing to the keyboard
           position unless its target can hold focus. scrollMarginTop keeps
           the sticky header from covering the top of what it jumped to. */
        tabIndex={-1}
        style={{ scrollMarginTop: 'var(--site-header-stack-height, 0px)' }}
        className="flex-1 focus:outline-none"
      >{pageChildren}</main>
      {footer}
    </>
  );
}
