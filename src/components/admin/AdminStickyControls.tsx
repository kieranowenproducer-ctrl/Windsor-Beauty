'use client';

/**
 * Pins an admin list page's own controls — the search box, the filters, the
 * status chips — so they stay on screen while you scroll the list they filter.
 * Task 7fdb1670: on a phone these scrolled away on every page except Products,
 * so narrowing a long list meant scrolling back to the top every time.
 *
 * Two things make it work, and both are easy to get wrong on their own:
 *
 * 1. THE OFFSET. It pins below the public promo/header/ticker stack AND below
 *    the admin menu bar, both live measurements published as CSS variables
 *    (StickyHeaderStack and AdminSidebar respectively). Pinning to top-0 would
 *    park it behind them. `--admin-bar-height` is 0px above `lg`, where that
 *    bar is hidden, so desktop behaviour is unchanged.
 *
 * 2. THE PAGE MUST NOT BE A SCROLL BOX. `position: sticky` attaches to the
 *    nearest ancestor with a scrolling box, not to the page. Admin pages wrap
 *    their content in `<main className="... overflow-y-auto">` and the page
 *    root in `overflow-hidden`, and NEITHER ever actually scrolls — they grow
 *    to fit the list, and the document is what scrolls. So a sticky child pins
 *    itself to a box that never moves, i.e. does nothing. Both must be
 *    `overflow-clip`, which clips identically but creates no scroll box.
 *    Measured, not assumed: commit 307b332 recorded the bar sitting at -2628px
 *    after a 3000px scroll until all of them were changed.
 *
 * `inset` spans the bar across the parent's padding so rows pass underneath it
 * rather than beside it, and must match that padding — hence the prop.
 */
export default function AdminStickyControls({
  children,
  inset = 'p-8',
  className = '',
}: {
  children: React.ReactNode;
  /**
   * Must match the parent <main>'s horizontal padding so the bar spans it and
   * rows pass underneath. `card` is for a toolbar that already lives inside a
   * white panel: no negative margins (the panel already spans), and it pins
   * within that panel, so it stays while the panel's own rows scroll past and
   * leaves with the panel. That is the right behaviour there, and stone-50
   * would look wrong against the panel.
   */
  inset?: 'p-8' | 'p-4-sm-8' | 'px-4-sm-6' | 'card';
  className?: string;
}) {
  const spans = {
    'p-8': '-mx-8 px-8 -mt-2 pt-2 mb-4 bg-stone-50 border-b border-stone-200',
    'p-4-sm-8': '-mx-4 px-4 sm:-mx-8 sm:px-8 -mt-2 pt-2 mb-4 bg-stone-50 border-b border-stone-200',
    'px-4-sm-6': '-mx-4 px-4 sm:-mx-6 sm:px-6 -mt-2 pt-2 mb-4 bg-stone-50 border-b border-stone-200',
    card: 'bg-white border-b border-stone-100',
  }[inset];

  return (
    <div
      className={`sticky z-30 ${spans} shadow-[0_1px_0_rgba(0,0,0,0.04)] ${className}`}
      style={{ top: 'calc(var(--site-header-stack-height, 0px) + var(--admin-bar-height, 0px))' }}
    >
      {children}
    </div>
  );
}
