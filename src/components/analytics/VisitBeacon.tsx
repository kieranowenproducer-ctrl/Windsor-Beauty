'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getVisitId } from '@/lib/analytics/shopTracking';
import { flushTrackingQueue, queueTrackingEvent } from '@/lib/analytics/trackingQueue';

// Tells the site a page was opened (task dfe5e9ae). One small message per page
// view, sent after the page is on screen, carrying only the page, whether it
// is the first page of this session, the referring site and any utm tags on
// the link. The address and rough location are read on the server from the
// request itself. Nothing is stored in the browser except a session flag that
// says "not the first page any more".
//
// usePathname only, never useSearchParams: reading search params this high in
// the tree opts the whole app out of static rendering. The tags are read from
// window.location inside the effect instead.
//
// Renders nothing. Admin pages are left out here and staff are left out again
// on the server, by the admin cookie.

export default function VisitBeacon() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin') || lastSent.current === pathname) return;
    const previous = lastSent.current;
    lastSent.current = pathname;

    let landing = false;
    let visitId = '';
    try {
      landing = !sessionStorage.getItem('wg_visit_id');
      visitId = getVisitId();
    } catch {
      landing = false;
    }

    const params = new URLSearchParams(window.location.search);
    queueTrackingEvent({
      path: pathname,
      visit_id: visitId,
      landing,
      // Moving within the site keeps the original referrer, so the page just
      // left is sent instead: the server reads it as "moving around the site".
      referrer: document.referrer || (previous ? `${window.location.origin}${previous}` : null),
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      // The ad id Meta fills in ({{ad.id}}), so two ads in one campaign can be told apart later.
      utm_content: params.get('utm_content'),
    });
  }, [pathname]);

  useEffect(() => {
    const retry = () => { if (document.visibilityState === 'visible') void flushTrackingQueue(); };
    const timer = window.setInterval(retry, 15_000);
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    void flushTrackingQueue();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, []);

  return null;
}
