'use client';

import { useRouter } from 'next/navigation';
import FloatingPill from '@/components/FloatingPill';

// Returns the customer to whatever page they came from (catalogue, category,
// search results, special offers, New In carousel) by checking the browser
// referrer is same-origin before calling router.back() — falls back to /shop
// for direct links or external referrers so we never navigate users off-site.
export default function BackButton({ fallbackHref = '/shop' }: { fallbackHref?: string }) {
  const router = useRouter();

  function handleBack() {
    if (typeof document !== 'undefined' && document.referrer) {
      try {
        if (new URL(document.referrer).origin === window.location.origin) {
          router.back();
          return;
        }
      } catch {}
    }
    router.push(fallbackHref);
  }

  // Pinned to the TOP-left directly below the sticky promo/header/ticker stack,
  // matching BackToHome's placement exactly (task 2496e1c2 - "floating on top
  // just like the back to home button"). Previously bottom-left, where on
  // phones it sat awkwardly over page content.
  return (
    <FloatingPill
      className="fixed left-4 z-40 print:hidden"
      style={{ top: 'calc(var(--site-header-stack-height, 150px) + 10px)' }}
    >
      <button
        type="button"
        onClick={handleBack}
        aria-label="Go back"
        className="inline-flex items-center gap-1.5 bg-gold-700 text-white text-[9px] tracking-[0.2em] uppercase px-4 py-2.5 shadow-lg shadow-black/15 ring-1 ring-black/5 hover:bg-gold-800 transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back
      </button>
    </FloatingPill>
  );
}
