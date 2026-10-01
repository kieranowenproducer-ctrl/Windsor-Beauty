'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * ONE BLOCKING LAYER OWNS THE CUSTOMER'S SCREEN AT A TIME.
 *
 * WHY THIS EXISTS. On 12 August 2026 an entry gate started marking
 * everything behind it `inert`, so a keyboard or screen-reader visitor could no
 * longer walk past the three confirmations. That was right, and it stays.
 *
 * What nobody noticed is that the 10%-membership pop-up is mounted INSIDE the
 * gate, and it is the one overlay on this site that opens itself: a five-second
 * timer, no click needed. So five seconds after landing, while the customer was
 * still reading the Terms, the pop-up drew itself on top of everything (it sits
 * at z-250, the gate at z-50) while being inert, which means dead. On a phone
 * that is a full-screen black veil with a 4px blur over the legal text the
 * customer is required to read, and no tap on it does anything at all: not the
 * X, not "No thanks", not the backdrop. Measured, both sizes, before the fix.
 *
 * The lesson is not "move the pop-up". It is that nothing was keeping track of
 * which overlay owns the screen. This module does that, and two other things
 * that were going wrong quietly alongside it:
 *
 *   1. WHO OWNS THE SCREEN. A blocking layer (the gate, the Terms) claims it.
 *      A promotional pop-up asks first and waits its turn. A sales message can
 *      never again interrupt a legal one.
 *
 *   2. THE SCROLL LOCK IS COUNTED, NOT COPIED. Thirteen components on this site
 *      each set `document.body.style.position = 'fixed'` themselves and each
 *      clear it back to '' on the way out. Two open at once and the first one to
 *      close unlocks the page underneath the second, then scrolls the customer
 *      to whatever position it happened to capture. Here one counter owns those
 *      four style properties: the page locks when the first layer needs it and
 *      unlocks only when the last one has gone, restoring the scroll position
 *      captured before any of them opened.
 *
 * Migrated so far: EntryGate, TermsAcceptanceModal, DiscountPopup — the three in
 * the journey that broke. The other body-lock writers (CartDrawer, the calculator,
 * certificate, storage and variant modals, and the admin ones) still
 * do it themselves. They are all opened by a deliberate click rather than a
 * timer, so none of them can ambush another, but they should move onto this
 * counter when each is next touched.
 */

const owners = new Set<string>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// ---------------------------------------------------------------------------
// The counted body-scroll lock.
// ---------------------------------------------------------------------------

const scrollLockers = new Set<string>();
// The page position captured before the FIRST layer locked it. Anything that
// opens on top afterwards must not re-capture: by then the body is already
// `position: fixed`, so `window.scrollY` reads 0 and restoring it would throw
// the customer back to the top of the page on the way out.
let lockedAtScrollY: number | null = null;

function lockScroll(id: string) {
  scrollLockers.add(id);
  if (lockedAtScrollY !== null) return; // somebody already holds it
  lockedAtScrollY = window.scrollY;
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${lockedAtScrollY}px`;
  document.body.style.width = '100%';
}

/**
 * Move the page without animating it.
 *
 * globals.css sets `html { scroll-behavior: smooth }` so in-page anchor links
 * glide, and that also makes every window.scrollTo ANIMATE. Measured on the
 * live shop: a scrollTo(0, 0) from 1497 was still at 1415 a tenth of a second
 * later. Anywhere the page is being PUT somewhere rather than travelling there
 * on purpose, that animation is a bug the customer reads as the page moving on
 * its own. An inline style beats the stylesheet, so this turns it off for one
 * jump and puts the setting straight back.
 */
export function jumpScrollTo(y: number) {
  const html = document.documentElement;
  const previous = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  window.scrollTo(0, y);
  html.style.scrollBehavior = previous;
}

function unlockScroll(id: string) {
  scrollLockers.delete(id);
  if (scrollLockers.size > 0 || lockedAtScrollY === null) return; // still needed
  const restoreTo = lockedAtScrollY;
  lockedAtScrollY = null;

  // An overflow-only overlay (certificate, storage instructions) may still be
  // open on top. It needs the page held, so leave `overflow` alone for it.
  if (overflowHolders.size === 0) document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';

  // PUT THE PAGE BACK INSTANTLY, NOT SMOOTHLY. While it is locked the page
  // really is sitting at 0, with the content held where it was by `top: -Ypx`.
  // Releasing it and calling a plain scrollTo made the whole page visibly
  // scroll itself back up to where the customer already was, over about a
  // second. Measured on a phone from 1200: still travelling through 537 a
  // sixth of a second later, and the basket drawer did the same from 1000 on
  // phone and desktop alike.
  //
  // For the offer this was always latent and only started showing when it began
  // appearing five seconds after somebody enters the shop rather than five
  // seconds after the page loads, because by then they have actually scrolled.
  jumpScrollTo(restoreTo);
}

// ---------------------------------------------------------------------------
// Public hooks.
// ---------------------------------------------------------------------------

/**
 * Claim the screen while `active`. Give every layer its own `id`.
 *
 * `lockScroll` is opt-in because the gate does not want it: the gate is a
 * full-screen `position: fixed` sheet that scrolls inside itself, and freezing
 * the body underneath it would change behaviour that is currently correct.
 */
export function useViewportOwner(
  active: boolean,
  id: string,
  { lockScroll: wantsLock = false }: { lockScroll?: boolean } = {},
) {
  useEffect(() => {
    if (!active) return;
    owners.add(id);
    if (wantsLock) lockScroll(id);
    notify();
    return () => {
      owners.delete(id);
      if (wantsLock) unlockScroll(id);
      notify();
    };
  }, [active, id, wantsLock]);
}

/**
 * True while some OTHER layer owns the screen. A promotional pop-up calls this
 * and holds back until it comes back false.
 *
 * `exceptId` is the caller's own id, so a pop-up that has already claimed the
 * screen does not read itself as the thing blocking it.
 */
export function useViewportBlocked(exceptId?: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      let someoneElse = false;
      owners.forEach(owner => { if (owner !== exceptId) someoneElse = true; });
      return someoneElse;
    },
    () => false, // on the server nothing is open yet
  );
}

/** Take part in the counted scroll lock without claiming the screen. */
export function useScrollLock(active: boolean, id: string) {
  useEffect(() => {
    if (!active) return;
    lockScroll(id);
    return () => unlockScroll(id);
  }, [active, id]);
}

/**
 * Claim the screen but only stop the page scrolling, without pinning it with
 * `position: fixed`.
 *
 * For the two overlays that have always used `overflow: hidden` alone (the
 * certificate and the storage instructions). Giving them the full lock would
 * change how they sit on the page, which is not worth the risk for a fault they
 * cannot have: with no `position: fixed` there is no scroll position to put
 * back, so there is nothing to animate. What they DID have is the shared
 * property problem — each set `overflow` and each cleared it to '' on the way
 * out, so closing one released the page underneath another that was still open.
 * Counting fixes that much.
 */
const overflowHolders = new Set<string>();

export function useOverflowLock(active: boolean, id: string) {
  useEffect(() => {
    if (!active) return;
    owners.add(id);
    overflowHolders.add(id);
    if (lockedAtScrollY === null) document.body.style.overflow = 'hidden';
    notify();
    return () => {
      owners.delete(id);
      overflowHolders.delete(id);
      // Only give the page back if nothing else still wants it held.
      if (overflowHolders.size === 0 && lockedAtScrollY === null) {
        document.body.style.overflow = '';
      }
      notify();
    };
  }, [active, id]);
}
