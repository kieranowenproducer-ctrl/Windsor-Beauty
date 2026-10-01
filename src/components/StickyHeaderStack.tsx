'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

// Stacks the promo bar, header, and announcement ticker as independent sticky
// elements. The promo bar's height varies with its content (and wraps onto a
// second line on narrow screens), so the header and ticker offsets are
// measured at runtime rather than hard-coded.
//
// ON ADMIN PAGES AT PHONE/TABLET SIZES THE STACK IS NOT STICKY (task
// 717011d8). Measured on an iPhone in landscape: promo + header + ticker
// (236px) + the admin menu bar + a page's pinned filter bar left a ~20px
// working strip out of 390px — Kieran's "I couldn't even scroll". The shop
// chrome now scrolls away on /admin below lg, and the published height
// variable reads 0 there, so everything that offsets itself against this
// stack (the admin menu bar, the sidebar drawer, AdminStickyControls) moves
// to the top of the screen automatically. Desktop, and every non-admin
// page, is pixel-for-pixel unchanged.
export default function StickyHeaderStack({
  promoBar,
  header,
  announcementBar,
}: {
  promoBar: React.ReactNode;
  header: React.ReactNode;
  announcementBar: React.ReactNode;
}) {
  const promoRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const announcementRef = useRef<HTMLDivElement>(null);
  const [promoHeight, setPromoHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const isAdmin = (usePathname() ?? '').startsWith('/admin');

  useLayoutEffect(() => {
    function measure() {
      const promo = promoRef.current?.offsetHeight ?? 0;
      const header = headerRef.current?.offsetHeight ?? 0;
      const announcement = announcementRef.current?.offsetHeight ?? 0;
      setPromoHeight(promo);
      setHeaderHeight(header);
      // Exposed as a CSS variable so other fixed-position UI (currently just
      // AdminSidebar) can sit flush below this stack without overlapping it,
      // using true viewport-relative `position: fixed` rather than being
      // anchored to some ancestor box — see AdminSidebar.tsx for why that
      // ancestor-anchoring approach (a translateZ containing block) turned
      // out to be fragile: it only repositions the fixed element's origin,
      // it doesn't make the element immune to page scroll, so if the page
      // the ancestor sits in ever scrolls for any reason, anything "fixed"
      // to it scrolls right along with it.
      // On admin pages below lg the stack scrolls away (see the header
      // comment), so nothing should offset itself against it — the variable
      // reads 0 and the admin bar/drawer/pinned filters sit at the top.
      const chromeScrollsAway = isAdmin && !window.matchMedia('(min-width: 1024px)').matches;
      document.documentElement.style.setProperty(
        '--site-header-stack-height',
        chromeScrollsAway ? '0px' : `${promo + header + announcement}px`
      );
    }

    measure();

    const observer = new ResizeObserver(measure);
    if (promoRef.current) observer.observe(promoRef.current);
    if (headerRef.current) observer.observe(headerRef.current);
    if (announcementRef.current) observer.observe(announcementRef.current);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isAdmin]);

  // `static lg:sticky` on admin: the chrome participates in normal page flow
  // on phones and tablets (it scrolls away), and pins exactly as before from
  // lg up. Everywhere else it pins at every size, exactly as it always has.
  const stickiness = isAdmin ? 'static lg:sticky' : 'sticky';

  return (
    <>
      <div ref={promoRef} className={`${stickiness} top-0 z-50`}>
        {promoBar}
      </div>
      <div ref={headerRef} className={`${stickiness} z-40`} style={{ top: promoHeight }}>
        {header}
      </div>
      <div ref={announcementRef} className={`${stickiness} z-30`} style={{ top: promoHeight + headerHeight }}>
        {announcementBar}
      </div>
    </>
  );
}
