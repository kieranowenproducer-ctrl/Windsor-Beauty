import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { looksLikeBot, recordSiteInteraction, recordSiteVisit } from '@/lib/db/siteVisits';
import { reportAutomationFailure } from '@/lib/automationFailure';
import { visitPathAsSeen } from '@/lib/memberOnlyPages';

export const dynamic = 'force-dynamic';

// POST /api/visit
//
// The beacon every public page sends once it has loaded (task dfe5e9ae):
// which page, whether it was the first page of the session, the referring
// site and any utm tags on the link. The address, rough location and browser
// come off the request itself. Answers 204 whatever happens: a visit record is
// never worth a customer seeing an error, and nothing the browser sends here
// is trusted beyond a page path and some tags.
//
// Staff are left out (the admin cookie), and so are crawlers and monitors.
//
// Whether the person was signed in to an account is recorded too (ADSLAB item
// 15), so the ads reports can leave existing members out of "how did the ad
// do". The existing member session is checked before a customer name can ever
// be connected to the page view.

const ADMIN_COOKIE = 'wb_admin_session';
const CUSTOMER_COOKIE = 'wb_customer_session';

function cookieValue(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function cleanPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.split('?')[0].split('#')[0].trim();
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  if (path.startsWith('/admin') || path.startsWith('/api')) return null;
  return path.slice(0, 300);
}

function cleanText(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, limit) : null;
}

export async function POST(request: Request) {
  const done = new NextResponse(null, { status: 204 });
  if (!isDbConfigured()) return done;

  const cookies = request.headers.get('cookie') || '';
  if (cookieValue(cookies, ADMIN_COOKIE)) return done;
  if (looksLikeBot(request.headers.get('user-agent'))) return done;

  // sendBeacon posts the body as a blob, so the content type is not reliable:
  // read the text and parse it ourselves.
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return done;
  }
  const path = cleanPath(body?.path);
  if (!path) return done;
  // Local-only payment demonstrations must never become customer traffic in
  // the live reporting database. The preview route is 404 in production, but
  // a local build can still use production-shaped environment values.
  if (path === '/checkout/paypal-preview' || path === '/checkout/paypal-demo') return done;

  const customerToken = cookieValue(cookies, CUSTOMER_COOKIE);
  const visitId = cleanText(body?.visit_id, 100);
  const eventId = cleanText(body?.event_id, 100);
  const interactionKinds = new Set(['add_to_basket', 'member_offer_shown', 'member_offer_dismissed', 'member_offer_joined', 'member_offer_checkout', 'checkout_shipping_seen', 'checkout_payment_seen', 'checkout_pay_pressed']);
  if (typeof body?.kind === 'string' && interactionKinds.has(body.kind)) {
    const productSlug = cleanText(body?.product_slug, 200);
    if (body.kind === 'add_to_basket' && !productSlug) return done;
    const saved = await recordSiteInteraction({
      request,
      kind: body.kind as import('@/lib/analytics/shopTracking').ShopActionKind,
      path,
      visitId,
      customerToken,
      productSlug,
      quantity: typeof body?.quantity === 'number' ? body.quantity : 1,
      eventId,
    });
    if (saved) return done;
    await reportAutomationFailure('visitor_tracking', 'A basket action could not be saved.', {
      alertAdmin: true,
      detail: { path, eventId },
      whatToDo: 'Open Visitor Demand. The tracking health warning will show whether the feed has recovered.',
    });
    return NextResponse.json({ error: 'Tracking save failed.' }, { status: 503 });
  }

  // The browser sends this after the page is already visible. Awaiting the
  // insert here is therefore invisible to the customer and is the only honest
  // acknowledgement: 204 now means the row is safely stored, not merely queued
  // in a server process that may end with the response.
  const saved = await recordSiteVisit({
    request,
    // The calculator and dosage guide show a "For members" notice at the same address to anybody
    // not signed in. Log which of the two they saw, not just the address they typed.
    path: await visitPathAsSeen(path, customerToken),
    landing: body?.landing === true,
    referrer: cleanText(body?.referrer, 500),
    utmSource: cleanText(body?.utm_source, 100),
    utmMedium: cleanText(body?.utm_medium, 100),
    utmCampaign: cleanText(body?.utm_campaign, 200),
    utmContent: cleanText(body?.utm_content, 200),
    campaignSlug: cookieValue(cookies, 'wb_ref'),
    signedIn: Boolean(customerToken),
    visitId,
    customerToken,
    eventId,
  });

  if (!saved) {
    await reportAutomationFailure('visitor_tracking', 'A visitor page could not be saved.', {
      alertAdmin: true,
      detail: { path, eventId },
      whatToDo: 'Open Visitor Demand. The tracking health warning will show whether the feed has recovered.',
    });
    return NextResponse.json({ error: 'Tracking save failed.' }, { status: 503 });
  }

  return done;
}
