import Link from 'next/link';
import FloatingPill from '@/components/FloatingPill';

// Top-of-page link back to the homepage, used on standalone tool/info pages
// that sit outside the main shop navigation (policy pages, reviews,
// reviews, promotion, shop, about, contact, account). Carries its own
// max-w-6xl/px wrapper (matching the header's container) so it lands in the
// exact same on-screen position on every page, regardless of that page's own
// content width or padding. Styled like the gold outline buttons elsewhere on
// the site (e.g. checkout/success "Back to Shop") but compact.
const ARROW = (
  <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

export default function BackToHome() {
  // Pinned to the TOP-left, directly below the sticky promo/header/ticker stack
  // (whose measured height StickyHeaderStack publishes as a CSS variable), and
  // fixed so it stays put while scrolling on desktop and mobile alike. It was
  // previously bottom-left, where on phones it stacked awkwardly over footer
  // content and the admin preview pill (task cb404865). The in-flow spacer keeps
  // the original top spacing so pages that relied on it do not shift up under
  // the sticky header.
  return (
    <>
      <div aria-hidden className="h-14" />
      <FloatingPill
        className="fixed left-4 z-40 flex flex-col items-start gap-2 print:hidden"
        style={{ top: 'calc(var(--site-header-stack-height, 150px) + 10px)' }}
      >
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 bg-gold-700 text-white text-[9px] tracking-[0.2em] uppercase px-4 py-2.5 shadow-lg shadow-black/15 ring-1 ring-black/5 hover:bg-gold-800 transition-colors"
        >
          {ARROW}
          Back to Home
        </Link>
      </FloatingPill>
    </>
  );
}
