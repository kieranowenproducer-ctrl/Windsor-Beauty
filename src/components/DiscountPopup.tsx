'use client';

import { useEffect, useState } from 'react';
import { useDialog } from './useDialog';
import { useViewportBlocked, useViewportOwner } from './viewportOwner';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isMemberView } from '@/lib/staffView';

const SESSION_KEY = 'wg_discount_popup_seen';
const SHOW_DELAY_MS = 5000;
const POPUP_ID = 'discount-popup';

// A "become a member" pitch makes no sense to someone who is actively
// recovering access to an existing account, or already mid-registration —
// skip it on those pages.
const SUPPRESSED_PATHS = [
  '/account/forgot-password', '/account/reset-password', '/account/register',
  '/affiliate-preview', '/affiliate-admin-preview',
];

export default function DiscountPopup() {
  const pathname = usePathname();
  const suppressed = SUPPRESSED_PATHS.includes(pathname);
  const [visible, setVisible] = useState(false);
  // IS SOMETHING MORE IMPORTANT ON SCREEN? This is a sales message and it must
  // never interrupt a legal one. It is also the only overlay on the site that
  // opens itself, on a timer, with no click from anybody — which is exactly how
  // it used to land on top of the Terms and Conditions while a customer was
  // reading them. See viewportOwner.ts for the full account.
  const blocked = useViewportBlocked(POPUP_ID);

  // Everything that follows keys off `open`, never off `visible` alone. This
  // component lives in the root layout, so it never unmounts when the route
  // changes (clicking "Become a Member" navigates to /account/register without
  // remounting anything outside `children`). Keyed off `visible`, an effect's
  // cleanup would never re-run on that navigation and the scroll lock would
  // stay on <body> for good.
  const open = visible && !suppressed && !blocked;

  // Track the same 640px breakpoint the markup uses for the full-screen veil,
  // and keep it live. The old code read window.innerWidth once when the pop-up
  // opened, so turning a phone sideways while it was up left the page frozen
  // with nothing left to unfreeze it.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // On a phone this is a full-screen sheet, so it takes the screen and locks the
  // page behind it through the shared counter. On a wider screen it is a card
  // and the page stays scrollable, as before.
  useViewportOwner(open, POPUP_ID, { lockScroll: isMobile });

  useEffect(() => {
    // Hold the timer while the gate or the Terms own the screen. When they let
    // go, the five seconds start from that point, so the offer arrives once the
    // customer is actually looking at the shop.
    if (suppressed || blocked) return;
    if (sessionStorage.getItem(SESSION_KEY) === 'true') return;
    // Signed-in members and staff already have accounts — a "become a
    // member for 10% off" pitch is irrelevant noise for them. isMemberView()
    // reads the hint cookie but also respects an admin's "preview as guest"
    // mode, so the popup correctly appears in a not-logged-in simulation.
    if (isMemberView()) return;

    const timer = setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setVisible(true);
    }, SHOW_DELAY_MS);

    return () => clearTimeout(timer);
  }, [suppressed, blocked]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false);
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [open]);

  function close() {
    setVisible(false);
  }

  const dialog = useDialog({ open, labelledBy: 'discount-popup-title' });

  if (!open) return null;

  return (
    // pointer-events-none on this full-viewport wrapper + pointer-events-auto
    // on the card itself lets clicks pass through to the page underneath
    // everywhere except the popup's own box — otherwise this invisible
    // fixed inset-0 div would silently swallow every click on the rest of
    // the site (nav, buttons, etc.) for as long as the popup is open,
    // even though only a small card is visible.
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm sm:hidden pointer-events-auto" onClick={close} />

      <div {...dialog} className="relative bg-white border border-gold-200 shadow-2xl w-full max-w-sm pointer-events-auto outline-none">
        <button
          onClick={close}
          aria-label="Close offer"
          className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="px-6 pt-7 pb-6 sm:px-7">
          <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700 mb-2">Membership Offer</p>
          <h2 id="discount-popup-title" className="font-serif text-2xl text-stone-800 tracking-wide leading-snug mb-2">
            Become a member, get 10% off
          </h2>
          <p className="text-xs text-stone-500 leading-relaxed mb-5">
            Register as a Windsor Glow member and we will issue you a one-time code for 10% off your first order,
            ready to use at checkout.
          </p>

          <Link
            href="/account/register"
            className="block w-full text-center bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase py-3.5 hover:bg-gold-800 transition-colors"
          >
            Become a Member
          </Link>

          <button
            type="button"
            onClick={close}
            className="w-full mt-3 text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-stone-600 transition-colors"
          >
            No thanks, I do not want to sign up right now
          </button>
        </div>
      </div>
    </div>
  );
}
