'use client';

import { Children } from 'react';
import { usePathname } from 'next/navigation';
import EntryGate from './EntryGate';
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

// NO CHAT BUBBLE ON THE PUBLIC SITE. Kieran's written answer to open decision 4,
// 2026-08-02: "Do not place the AI Concierge chat bubble anywhere on the public
// shop or website. The AI Concierge is a members-only feature and should only be
// accessible inside the customer's Account area after they have logged in."
//
// The former public support widget has been removed, and the `NEXT_PUBLIC_SUPPORT_WIDGET`
// flag cannot put it back by being set. That flag still gates the server
// side (`publicWidgetOpen()` in lib/concierge/availability.ts) and still defaults to
// closed, so the endpoint refuses too. Two independent reasons the public bubble is
// off, which is the point: the 2026-08-02 audit found the endpoint answering
// anonymous requests while the bubble was hidden, because only the drawing was gated.
//
interface TermsOverride {
  title: string | null;
  body: string;
  format?: string;
}

// Temporary homepage showcase, requested by Kieran on 25 August 2026.
// Change this one switch back to false to restore the age and terms entry screen.
//
// STILL OFF, AND DELIBERATELY (Samuel, 10 September 2026). He asked for the gate
// back that day, then: "Keep the gate switched off for the meantime as we are
// still advertising." The gate itself is READY: its two statements were rewritten
// the same day, so switching this to false brings back the version he asked for
// rather than the old three-box one. Nothing else needs doing.
const TEMPORARILY_BYPASS_ENTRY_GATE = true;

// Wraps every route in the public site's chrome (age/terms gate, sticky
// header stack, cart drawer, discount popup, footer). Admin routes get the
// same site header but skip the entry gate, cart, popup, and footer.
export default function SiteChrome({
  children,
  termsOverride,
  headerStack,
  cartDrawer,
  discountPopup,
  footer,
}: {
  children: React.ReactNode;
  termsOverride: TermsOverride | null;
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
  // inside the normal header/footer/age-gate/cart/discount-popup chrome.
  if (pathname === '/coming-soon') {
    return <>{pageChildren}</>;
  }

  // Email-link destinations and legal/payment pages must never sit behind
  // the entry gate: a password-reset or verification click has to land
  // straight on the action it promised, and policies must be readable before
  // anyone ticks a box agreeing to them. The gate (and the discount popup)
  // only belong to normal browsing.
  const GATE_EXEMPT_PREFIXES = [
    // /reviews is here for the same reason as the rest: it is where the
    // review-request email's button lands (task ba827a09). A customer who has
    // already bought, already agreed to the terms and already been through
    // this gate should not be met by the tick-box notice when they click
    // "Leave your review" — they simply do not, and the review is lost.
    // Leaving a review still requires being signed in, so nothing about who
    // can post is loosened; only the notice in front of reading the page.
    '/account', '/pay', '/unsubscribe', '/reviews',
    '/terms', '/privacy', '/refund-policy', '/returns', '/shipping',
    '/disclaimer', '/research-disclaimer', '/payment-policy', '/contact-policy', '/cookies',
  ];
  const gateExempt = GATE_EXEMPT_PREFIXES.some(
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

  if (gateExempt) {
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

  // The campaign poster is a SIBLING of the gate, not a child of it. It draws
  // at z-100, above the gate's z-50, and the gate now makes everything beneath
  // it inert so a keyboard or screen-reader visitor cannot walk past the age
  // and research-use confirmations. Left inside, the poster a QR scanner sees
  // would have been inert too — visible, on top, and impossible to dismiss.
  const storefront = (
    <>
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

  return (
    <>
      <CampaignPoster />
      {TEMPORARILY_BYPASS_ENTRY_GATE
        ? storefront
        : <EntryGate termsOverride={termsOverride}>{storefront}</EntryGate>}
    </>
  );
}
