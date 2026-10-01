// THIS FILE WAS src/middleware.ts UNTIL 12 AUGUST 2026.
//
// Next 16 deprecated the "middleware" file convention and renamed it to "proxy",
// printing a warning on every build until the rename was done. Nothing about what
// this file does changed: same code, same decisions, same order. Only the file
// name and the exported function name moved, from `middleware` to `proxy`.
//
// If you are looking for "the middleware", this is it. Next's own build output
// still labels it "Proxy (Middleware)".
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isWallUp } from '@/lib/launchWindow';

// Endpoints that authenticate with the AGENT_TASK_SECRET bearer instead of the
// admin session cookie. Adding a route here ONLY exempts it from the cookie gate;
// the route must still enforce the bearer check in its own handler. If you add an
// agent endpoint and forget this list, it will 401 before your handler runs.
const AGENT_BEARER_ROUTES = new Set([
  '/api/admin/tasks/agent-attach',
  '/api/admin/tasks/agent-catalogue',
  '/api/admin/tasks/agent-order-lookup',
  '/api/admin/tasks/agent-cleanup-media',
  // Stage 5 of the assistant merge: the hosted concierge service's data
  // endpoints (customer orders and the enquiry handover). The blog search
  // entry that used to sit here was removed on 26 September 2026: its route
  // was deleted with the blog, so the entry allowlisted a dead address.
  '/api/admin/tasks/agent-customer-orders',
  '/api/admin/tasks/agent-enquiry',
  '/api/admin/voice-transcribe',
]);

const ADMIN_COOKIE = 'wg_admin_session';
const CUSTOMER_COOKIE = 'wg_customer_session';
const LAUNCH_COOKIE = 'wg_launch_access';

// Temporary pre-launch wall — set while the site is being finished. See
// /coming-soon and /api/launch/* for the rest of this system. The decision of
// whether the wall is up lives in lib/launchWindow so this file and the
// countdown endpoint can never drift apart.
const LAUNCH_ACCESS_CODE = process.env.LAUNCH_ACCESS_CODE;

// Redirects that carry the launch state must never be cached — by the browser,
// by Vercel's edge, or by anything in between. A cached "/ -> /coming-soon"
// would keep a customer walled out long after the site opened, which is the
// single worst failure this system can produce.
function uncached(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, must-revalidate');
  return response;
}

// /account/verify-email and /account/create-password are EMAIL-LINK
// destinations — they are routinely opened in a browser with no session
// cookie (different device, fresh profile) and must never bounce to the
// login page. Second root cause of the "verification link doesn't work"
// reports (the first was the coming-soon wall, below).
const ACCOUNT_PUBLIC_PATHS = [
  '/account/login',
  '/account/register',
  '/account/forgot-password',
  '/account/reset-password',
  '/account/verify-email',
  '/account/create-password',
];

// Pages that must work even while the coming-soon wall is up. Two groups:
// 1. Email-link destinations — a customer who registers on the coming-soon
//    page is sent /account/verify-email and /account/reset-password links;
//    without these exemptions the wall bounced those clicks back to
//    /coming-soon and the links appeared "broken" (real launch-blocking bug).
//    /account is included so "Go to my account" after verifying works and
//    members can log in pre-launch, exactly as the sign-up copy promises.
// 2. Legal + payment pages — invoice emails point customers at /pay/<token>
//    and /terms before the site is public; policies must always be readable
//    before someone pays. These URLs are permanent, so nothing about the
//    payment/terms flow changes at launch — the wall simply disappears.
const WALL_EXEMPT_PREFIXES = [
  '/account',
  '/raf-invite',
  // QR campaign short links (/r/<slug>). Printed posters (e.g. Physique Architect
  // Gyms) are already in the wild — without this exemption the wall bounced
  // scanners to /coming-soon BEFORE the campaign redirect could fire, so no scan
  // was recorded, no attribution cookie set, and no bespoke poster shown. The
  // redirect destination (/account/register) is already exempt, so the full
  // register-and-redeem flow works pre-launch, exactly like the email links above.
  '/r',
  '/pay',
  '/terms',
  '/privacy',
  '/refund-policy',
  '/returns',
  '/shipping',
  '/disclaimer',
  '/research-disclaimer',
  '/payment-policy',
  '/contact-policy',
  '/cookies',
  '/unsubscribe',
];

function isWallExempt(pathname: string): boolean {
  return WALL_EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

// Anything that looks like a static asset bypasses every gate below — the
// coming-soon page itself needs its logo/fonts/etc to load, and these were
// never meant to be routed through page-level auth/wall logic anyway.
const STATIC_FILE_PATTERN = /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt|xml|woff2?|ttf|otf|json)$/i;

// Non-httpOnly hint cookie for client components (entry gate, discount
// popup): tells the browser UI that this visitor already holds a session so
// the "confirm you're 18 / read the terms" gate and the "join for 10% off"
// popup stay out of the way. It carries NO security value — real auth is
// still the httpOnly session cookies — and it is kept in sync here in
// middleware, the one place that sees every request AND the httpOnly cookies.
const UI_HINT_COOKIE = 'wg_ui_session';

function withUiHint(request: NextRequest, response: NextResponse): NextResponse {
  const expectedToken = process.env.ADMIN_SESSION_TOKEN;
  const isStaff = Boolean(expectedToken && request.cookies.get(ADMIN_COOKIE)?.value === expectedToken);
  const isMember = Boolean(request.cookies.get(CUSTOMER_COOKIE)?.value);
  const current = request.cookies.get(UI_HINT_COOKIE)?.value;
  const wanted = isStaff ? 'staff' : isMember ? 'member' : null;
  if (wanted && current !== wanted) {
    response.cookies.set(UI_HINT_COOKIE, wanted, {
      httpOnly: false, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30, path: '/',
    });
  } else if (!wanted && current) {
    response.cookies.set(UI_HINT_COOKIE, '', { maxAge: 0, path: '/' });
  }
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /* Who is allowed into /admin is decided by the gate further down and by
     nothing else. The static-file shortcut below used to run first for every
     address, which meant ANYTHING ending in a file extension skipped every
     gate on this page - and a dynamic admin route matches one happily, because
     a URL segment may contain a dot.

     Measured on the live site, 18 August 2026, with no session at all:
       /api/admin/pearl-terminology/1        -> 401, refused here
       /api/admin/pearl-terminology/1.json   -> reached the handler
     Nothing leaked, because each handler rejected the suffixed id on its own
     account. But that is the second line of defence doing the first line's
     job, and it only held because every handler happened to check. The next
     admin route added would not have been so lucky, and nothing would have
     said so.

     Real static assets are served from /_next/static (already excluded by the
     matcher at the bottom of this file) and from /public, and none of them
     begin with /admin, so holding admin addresses back from this shortcut
     costs nothing and closes the hole for every admin route at once. */
  const isAdminPath = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  if (!isAdminPath && STATIC_FILE_PATTERN.test(pathname)) {
    return NextResponse.next();
  }

  // /coming-soon exists only while the wall is up. Once the site is open it
  // must not be reachable at all: bookmarks, an open tab that reloads, a link
  // shared during the pre-launch period and anything holding a stale URL all
  // land on the live homepage instead. Without this, "the countdown page" stays
  // servable forever and customers can still end up staring at it after launch.
  if (pathname === '/coming-soon') {
    if (isWallUp()) return uncached(NextResponse.next());
    return uncached(NextResponse.redirect(new URL('/', request.url)));
  }

  // Local-only visual review for the new PEARL control centre. The page itself
  // also returns 404 outside development, so this never opens an admin route in
  // a production or Vercel preview build.
  if (pathname === '/admin/pearl/preview' && process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  // Allow login page and the login API through
  if (pathname === '/admin/login' || pathname.startsWith('/api/admin/login')) {
    return NextResponse.next();
  }

  // Let the logout handler clear the cookie without the rolling staff-session
  // refresh adding a second Set-Cookie header that signs the browser back in.
  if (pathname === '/api/admin/logout') {
    return NextResponse.next();
  }

  // These endpoints authenticate themselves with a bearer secret
  // (AGENT_TASK_SECRET), not the admin session cookie — the local task-agent has
  // no cookie. They are let past the admin-cookie gate; each handler enforces the
  // bearer check itself and rejects anything without the secret.
  //
  // Listed explicitly, and deliberately NOT matched by an `agent-*` prefix rule.
  // A prefix rule fails OPEN: a future agent-* route whose handler forgot its
  // bearer check would be served to the public behind no gate at all. Forgetting
  // to add a route here fails CLOSED instead — the route 401s until it is added,
  // which is noisy and safe rather than quiet and dangerous. (That is exactly what
  // happened to agent-cleanup-media: it 401'd here, before its handler ever ran.)
  if (AGENT_BEARER_ROUTES.has(pathname)) {
    return NextResponse.next();
  }

  // Protect all /admin pages and /api/admin endpoints — and never apply the
  // coming-soon wall to them, so the admin panel stays reachable regardless
  // of launch-gate state.
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    const session = request.cookies.get(ADMIN_COOKIE);
    // Validate the cookie VALUE against the real token — never just "a cookie
    // exists". Both admin login routes set this cookie to ADMIN_SESSION_TOKEN,
    // so a valid session's value equals that token and nothing else does.
    // Fail closed if the token isn't configured: no token means no admin
    // access, rather than every non-empty cookie passing.
    const expectedToken = process.env.ADMIN_SESSION_TOKEN;
    if (!expectedToken || session?.value !== expectedToken) {
      if (pathname.startsWith('/api/admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    // Rolling session: every authenticated admin request re-issues the
    // cookie with a fresh 30-day expiry, so an actively used admin login
    // never dies mid-work ("browse the shop, come back, logged out"). An
    // untouched browser still expires after 30 days; signing out explicitly
    // clears it as before.
    const response = NextResponse.next();
    response.cookies.set(ADMIN_COOKIE, expectedToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/',
    });
    return withUiHint(request, response);
  }

  // Every other backend/API route (Fena, PayPal, Royal Mail, email, the
  // launch sign-up/unlock endpoints themselves, etc.) always works,
  // regardless of the coming-soon wall — it only ever gates pages.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Coming-soon wall — active until the go-live instant passes (see isWallUp).
  // Applies to every remaining public page (home, shop, checkout, account,
  // etc.); once unlocked the cookie persists so visitors aren't asked again.
  if (isWallUp() && !isWallExempt(pathname)) {
    const unlocked = request.cookies.get(LAUNCH_COOKIE);
    // A logged-in admin is never walled: clicking Shop from the admin panel
    // should show the shop, not the coming-soon page.
    const adminToken = process.env.ADMIN_SESSION_TOKEN;
    const isAdmin = Boolean(adminToken && request.cookies.get(ADMIN_COOKIE)?.value === adminToken);
    if (unlocked?.value !== LAUNCH_ACCESS_CODE && !isAdmin) {
      return uncached(NextResponse.redirect(new URL('/coming-soon', request.url)));
    }
  }

  // Customer account area — sign-in/registration stay open, the rest requires a session
  if (pathname.startsWith('/account')) {
    // A logged-in ADMIN who lands anywhere in the customer account area (e.g. by
    // clicking the account icon while browsing the public site) should be sent to
    // their admin panel, NOT the customer sign-in. Without this they hit
    // /account/login and it looks like they've been signed out, even though their
    // admin session is still valid. Checked before the public-path allowance so
    // even /account/login itself bounces an admin straight to /admin.
    const adminToken = process.env.ADMIN_SESSION_TOKEN;
    if (adminToken && request.cookies.get(ADMIN_COOKIE)?.value === adminToken) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    if (ACCOUNT_PUBLIC_PATHS.includes(pathname)) {
      return withUiHint(request, NextResponse.next());
    }
    const session = request.cookies.get(CUSTOMER_COOKIE);
    if (!session?.value) {
      return NextResponse.redirect(new URL('/account/login', request.url));
    }
  }

  return withUiHint(request, NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
