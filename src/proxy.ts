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
import { isHoldingScreenOn, holdingResponse, previewAccessCode, PREVIEW_COOKIE } from '@/lib/holdingScreen';
import { storefrontHostDecision, storefrontRequestHostname } from '@/lib/storefrontHostPolicy';

const ADMIN_COOKIE = 'wb_admin_session';
const CUSTOMER_COOKIE = 'wb_customer_session';
// These inherited features are not part of Windsor Beauty. Keep their shared
// code intact, but reject every page and action, including staff and demo URLs.
const RETIRED_ROUTE_PREFIXES = [
  '/coming-soon', '/api/launch', '/api/admin/launch',
  '/raf-invite', '/refer', '/glow-card-terms',
  '/account/glow-card', '/account/affiliate',
  '/admin/affiliates', '/admin/member-referrals',
  '/api/admin/affiliates', '/api/admin/member-referrals',
  '/api/account/affiliate', '/api/account/referrals',
  '/api/affiliate-invitation', '/api/affiliate-request',
  '/api/cron/affiliate-code-reminders',
];

// Email links and sign-in pages do not need a customer session.
const ACCOUNT_PUBLIC_PATHS = [
  '/account/login',
  '/account/register',
  '/account/forgot-password',
  '/account/reset-password',
  '/account/verify-email',
  '/account/create-password',
];

// Images and fonts used by the holding screen may load before sign-in.
const HOLDING_SAFE_ASSET_PATTERN = /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/i;

const STATIC_FILE_PATTERN = /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt|xml|woff2?|ttf|otf|json)$/i;

// Non-httpOnly hint cookie for client components (entry gate, discount
// popup): tells the browser UI that this visitor already holds a session so
// the "confirm you're 18 / read the terms" gate and the "join for 10% off"
// popup stay out of the way. It carries NO security value — real auth is
// still the httpOnly session cookies — and it is kept in sync here in
// middleware, the one place that sees every request AND the httpOnly cookies.
const UI_HINT_COOKIE = 'wb_ui_session';

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
  const storefront = storefrontHostDecision({
    brand: 'beauty', hostname: storefrontRequestHostname(request.headers.get('host'), request.nextUrl.hostname), pathname, method: request.method,
    mode: process.env.WINDSOR_STOREFRONT_MODE,
    compatibilityHosts: process.env.WINDSOR_COMPATIBILITY_HOSTS,
  });
  // Host retirement wins over every staff/preview shortcut and never redirects.
  if (storefront === 'retired' || storefront === 'closed') {
    return new NextResponse(storefront === 'retired'
      ? 'This storefront is no longer available at this address.'
      : 'This shop is temporarily unavailable.', {
      status: storefront === 'retired' ? 410 : 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store, must-revalidate', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }

  /* Who is allowed into /admin is decided by the gate further down and by
     nothing else. The static-file shortcut below used to run first for every
     address, which meant ANYTHING ending in a file extension skipped every
     gate on this page - and a dynamic admin route matches one happily, because
     a URL segment may contain a dot.

     Measured on the live site, 18 August 2026, with no session at all:
       /api/admin/<dynamic-route>/1        -> 401, refused here
       /api/admin/<dynamic-route>/1.json   -> reached the handler
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

  /* THE HOLDING SCREEN comes before everything else. While it is on, the only
     people who get past this point are staff: the admin area (which has its own
     sign-in gate below), anyone already signed in as admin, and a browser that
     has typed the access code on the holding screen. They see the real shop. Everyone else, on every page and every /api address, gets the
     holding screen. Pictures and fonts are let through so the admin sign-in page
     can draw itself; they reveal nothing about the shop. See lib/holdingScreen. */
  if (storefront === 'legacy' && isHoldingScreenOn() && !isAdminPath) {
    const adminToken = process.env.ADMIN_SESSION_TOKEN;
    const isStaff = Boolean(adminToken && request.cookies.get(ADMIN_COOKIE)?.value === adminToken);
    // The access code typed into the box on the holding screen arrives as ?access=.
    // Right code: remember this browser for 30 days and send it on without the
    // code left in the address bar. Wrong code: the holding screen again, saying so.
    const typed = request.nextUrl.searchParams.get('access');
    if (typed !== null && !pathname.startsWith('/api/')) {
      if (typed.trim() === previewAccessCode()) {
        const clean = request.nextUrl.clone();
        clean.searchParams.delete('access');
        const res = NextResponse.redirect(clean);
        res.headers.set('Cache-Control', 'no-store');
        res.cookies.set(PREVIEW_COOKIE, previewAccessCode(), {
          httpOnly: true, secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/',
        });
        return res;
      }
      if (!isStaff) return holdingResponse(pathname, true);
    }
    const hasPreview = request.cookies.get(PREVIEW_COOKIE)?.value === previewAccessCode();
    // Payment notifications and scheduled jobs come from machines, not visitors, and
    // each checks its own secret (the webhook key, the CRON_SECRET bearer). They must
    // get through while the shop is closed, or an order paid by somebody with the
    // access code would never be marked paid or sent on to Royal Mail.
    const isMachineRoute = pathname.startsWith('/api/webhooks/') || pathname.startsWith('/api/cron/');
    if (!isStaff && !hasPreview && !isMachineRoute && (pathname.startsWith('/api/') || !HOLDING_SAFE_ASSET_PATTERN.test(pathname))) {
      return holdingResponse(pathname);
    }
  }

  if (RETIRED_ROUTE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return new NextResponse('This page is not available.', {
      status: 404, headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (!isAdminPath && STATIC_FILE_PATTERN.test(pathname)) {
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

  // Remaining APIs have passed the holding screen and enforce their own access checks.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
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
