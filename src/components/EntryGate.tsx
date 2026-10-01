'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import TermsAcceptanceModal from './TermsAcceptanceModal';
import { useViewportOwner } from './viewportOwner';
import { COMPLIANCE_CHECK_LABELS } from '@/lib/complianceConfirmations';

// The one shared list, so the gate and the sign-up form can never drift apart
// (Kieran, 7 Sept). The wording below came from here, unchanged.
const CHECKS = COMPLIANCE_CHECK_LABELS;

const SESSION_KEY = 'wb_entry_confirmed';
const TERMS_SESSION_KEY = 'wb_terms_accepted';

// The gate acceptance now persists in localStorage for 90 days, so opening a
// new tab (every email link does this) no longer re-asks someone who already
// confirmed. sessionStorage is still read as a fallback for visitors who
// accepted under the old scheme mid-session.
const PERSIST_KEY = 'wb_entry_confirmed_v2';
const PERSIST_DAYS = 90;

function hasPersistedEntry(): boolean {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < PERSIST_DAYS * 24 * 60 * 60 * 1000;
  } catch { return false; }
}

function persistEntry() {
  try { localStorage.setItem(PERSIST_KEY, String(Date.now())); } catch { /* private mode */ }
}

// Set by middleware whenever the browser holds a real (httpOnly) admin or
// customer session. An account holder has already been through this gate —
// re-asking them after a password reset or on every new tab is pure friction.
function hasSessionHint(): boolean {
  return document.cookie.split('; ').some(row => {
    const [k, v] = row.split('=');
    return k === 'wb_ui_session' && (v === 'member' || v === 'staff');
  });
}

interface TermsOverride {
  title: string | null;
  body: string;
  format?: string;
}

export default function EntryGate({
  children,
  termsOverride,
}: {
  children: React.ReactNode;
  termsOverride?: TermsOverride | null;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(new Array(CHECKS.length).fill(false));
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    if (hasSessionHint()) {
      // Logged-in member/admin: never gate an account holder.
      setConfirmed(true);
      return;
    }
    if (hasPersistedEntry() || sessionStorage.getItem(SESSION_KEY) === 'true') {
      setConfirmed(true);
      return; // already through the gate — skip poster detection
    }
    if (sessionStorage.getItem(TERMS_SESSION_KEY) === 'true') {
      setTermsAccepted(true);
    }
  }, []);

  // Put focus inside the notice the moment it appears. Without this the browser
  // leaves focus on the document, so a screen reader carries on reading from
  // wherever it had got to and never announces that there is something to
  // answer before entering.
  useEffect(() => {
    if (mounted && !confirmed) noticeRef.current?.focus();
  }, [mounted, confirmed]);

  function toggle(i: number) {
    setChecked(prev => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  function handleAcceptTerms() {
    sessionStorage.setItem(TERMS_SESSION_KEY, 'true');
    setTermsAccepted(true);
    setTermsModalOpen(false);
  }

  function handleEnter() {
    if (checked.every(Boolean) && termsAccepted) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      persistEntry();
      setConfirmed(true);
    }
  }

  /**
   * THE PAGE IS ALWAYS RENDERED. THE GATE SITS ON TOP OF IT.
   *
   * This used to `return null` until the component mounted, and mounting only happens in a
   * browser. So every gated route, which is nearly the whole site, served an empty `<body>` to
   * anything that does not run JavaScript, and served ONLY this notice to anything that does. Not
   * one page had an h1, a paragraph, or a link to a product in it. Measured on the live site on
   * 10 August 2026: the homepage, /shop and every product page all came back with 35 characters
   * of visible text, and that was the body's class attribute. The shop was invisible to search
   * for a reason that had nothing to do with the shop.
   *
   * NOTHING ABOUT THE GATE ITSELF IS WEAKER. It still covers the entire viewport, opaque and on
   * top; the same three statements must still be ticked and the same terms still accepted; the
   * same button is still the only way through and it is still disabled until they are. What
   * changed is that the page underneath now exists in the HTML instead of not being drawn at all,
   * which is what a search engine reads and what a person still cannot reach.
   *
   * `overscroll-contain` on the notice stops a scroll gesture that runs out of notice from
   * carrying on into the page behind it, which is the one way the content underneath could have
   * made itself felt.
   *
   * Rendering the children before `mounted` is also what makes the first browser paint match the
   * server's, which is what the flag was for. The gate appears a frame later, exactly as the
   * notice did before.
   */
  const gateUp = mounted && !confirmed;
  const allChecked = checked.every(Boolean);
  const canEnter = allChecked && termsAccepted;

  // While the notice is up it owns the screen, so the 10%-membership pop-up
  // holds its five-second timer instead of drawing itself on top of the Terms.
  // No scroll lock: this sheet is `position: fixed` and scrolls inside itself,
  // which already works. See viewportOwner.ts for what went wrong without this.
  useViewportOwner(gateUp, 'entry-gate');

  return (
    <>
    {/* The page renders in BOTH states, and the wrapper is present in both, so
        passing the gate does not swap one element type for another and force
        React to throw the whole site away and rebuild it.

        `display: contents` means this div draws no box of its own: the header,
        main and footer stay direct flex children of <body> exactly as before.
        It is the one wrapper shape that cannot disturb a sticky or fixed
        descendant, which this tree is full of.

        `inert` is the point of it. The gate covers the screen and always has,
        so a person using a mouse could never reach the site behind it. A person
        using a keyboard could: Tab moved straight past the notice into the
        header, the products and the basket, and a screen reader read the whole
        shop out while the age and research-use confirmations sat unanswered.
        `inert` takes the page behind out of the tab order and out of the
        accessibility tree while the notice is up, so the gate now stops
        everybody it is supposed to stop. */}
    <div data-behind-gate="" style={{ display: 'contents' }} inert={gateUp}>{children}</div>
    {gateUp && (
    <div
      ref={noticeRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-gate-title"
      className={`fixed inset-0 z-50 flex items-center justify-center bg-white px-4 py-8 overscroll-contain outline-none ${termsModalOpen ? 'overflow-hidden' : 'overflow-y-auto'}`}
    >
      <div className="w-full max-w-md my-auto">

        {/* Real logo — larger so tagline is readable */}
        <div className="flex justify-center mb-8">
          <Image
            src="/images/logo-transparent.png"
            alt="Windsor Beauty"
            width={320}
            height={200}
            className="w-72 h-auto object-contain"
            priority
          />
        </div>

        {/* Gate card */}
        <div className="border border-gold-200 bg-white px-6 py-8 sm:px-8">
          <div className="mb-5 pb-5 border-b border-gold-100">
            <h2 id="entry-gate-title" className="text-xs tracking-[0.15em] uppercase text-stone-600 font-semibold mb-2">
              Important Notice
            </h2>
            <p className="text-xs text-stone-500 leading-relaxed">
              This website contains information about research compounds intended strictly for qualified scientific and laboratory use. Please read and confirm each statement below before entering.
            </p>
          </div>

          <div className="space-y-2 sm:space-y-1 mb-5">
            {CHECKS.map((label, i) => (
              <label
                key={i}
                htmlFor={`entry-check-${i}`}
                className="flex items-start gap-3 cursor-pointer group py-3 sm:py-2 px-1 -mx-1 rounded-sm"
              >
                <input
                  type="checkbox"
                  id={`entry-check-${i}`}
                  checked={checked[i]}
                  onChange={() => toggle(i)}
                  className="sr-only peer"
                />
                {/* Box is slightly larger on mobile only (sm: restores the
                    original desktop size). The full row is the actual tap
                    target via the surrounding <label> plus the wider py-3
                    on mobile, so the checkbox itself just needs to look
                    easier to hit at a glance. */}
                <div
                  aria-hidden="true"
                  className={`mt-0.5 h-5 w-5 sm:h-4 sm:w-4 flex-shrink-0 border transition-all duration-150 flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-gold-400 peer-focus-visible:ring-offset-2 ${
                    checked[i] ? 'bg-gold-700 border-gold-500' : 'border-gold-300 bg-white group-hover:border-gold-400'
                  }`}
                >
                  {checked[i] && (
                    <svg className="w-3 h-3 sm:w-2.5 sm:h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-xs text-stone-600 leading-relaxed select-none">{label}</span>
              </label>
            ))}
          </div>

          {/* Terms and Conditions — must be opened and read in full before the user can proceed */}
          <div className="border border-gold-200 bg-gold-50/40 px-4 py-4 sm:px-5 sm:py-5 mb-6">
            <h3 className="text-xs tracking-[0.05em] text-stone-700 font-semibold leading-snug mb-1.5">
              Please review our Terms &amp; Conditions before entering
            </h3>
            <p className="text-[11px] text-stone-500 leading-relaxed mb-4">
              Please review our Terms and Conditions before entering. Our Terms and Conditions include important
              information regarding research use, product disclaimers, and the stated use of any needles sold or
              included with products. Any needles or syringes supplied with our products are not intended for
              human or animal use. Open them below, read to the end, and confirm to continue.
            </p>

            {!termsAccepted ? (
              <button
                type="button"
                onClick={() => setTermsModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 bg-white border border-gold-400 text-gold-700 text-[10px] tracking-[0.2em] uppercase font-semibold px-5 py-3.5 hover:bg-gold-800 hover:text-white hover:border-gold-500 transition-colors"
              >
                Read Terms &amp; Conditions
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <div className="flex items-center justify-between gap-3 bg-white border border-gold-200 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-4 w-4 flex-shrink-0 bg-gold-700 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-xs text-stone-600 leading-relaxed">
                    Terms &amp; Conditions and research-use disclaimer read and agreed.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setTermsModalOpen(true)}
                  className="shrink-0 text-[9px] tracking-[0.2em] uppercase text-gold-700 hover:text-gold-700 border-b border-gold-300 hover:border-gold-500 pb-0.5 transition-colors"
                >
                  Read Again
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleEnter}
            disabled={!canEnter}
            className={`w-full py-3.5 text-xs tracking-[0.2em] uppercase font-semibold transition-all duration-150 ${
              canEnter ? 'bg-gold-700 text-white hover:bg-gold-800 cursor-pointer' : 'bg-stone-100 text-stone-500 cursor-not-allowed'
            }`}
          >
            Enter Website
          </button>
          {!canEnter && (
            <p className="text-[10px] text-stone-500 leading-relaxed text-center mt-3">
              {!termsAccepted
                ? 'Read and agree to the Terms & Conditions above to unlock this button.'
                : 'Confirm each statement above to unlock this button.'}
            </p>
          )}
        </div>

        <p className="text-center text-[10px] text-stone-500 tracking-wide mt-5">
          Part of the C&S Holdings Group
        </p>
      </div>

      <TermsAcceptanceModal
        open={termsModalOpen}
        onAccept={handleAcceptTerms}
        onClose={() => setTermsModalOpen(false)}
        override={termsOverride}
      />
    </div>
    )}
    </>
  );
}
