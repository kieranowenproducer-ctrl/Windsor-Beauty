import type { MetadataRoute } from 'next';

/**
 * /robots.txt
 *
 * THERE WAS NO ROBOTS ROUTE AT ALL, and that is worse than it sounds. A request for
 * /robots.txt fell through to the catch-all and was answered with the app's own HTML, carrying a
 * `noindex` meta tag. Google does not read that as "no rules, crawl away". A robots.txt that
 * returns a page rather than a robots file is a fetch error, and a crawler that cannot read the
 * file it is required to read backs off the whole site.
 *
 * Found on 7 August 2026 while checking whether the shop was visible to search at all. The bigger
 * half of that fault, the homepage serving a blank noindex shell to anything without JavaScript,
 * had already been fixed: fetched as Googlebot, / and /shop now return real content
 * with no noindex. This was the piece still missing.
 *
 * WHY THIS FILE AND NOT public/robots.txt. The sitemap address has to match the canonical host and
 * the disallow list has to stay honest as routes are added, and a hand-written file in `public/`
 * drifts from the app silently. This one is generated from the same code the routes are.
 *
 * MIDDLEWARE ALREADY LETS IT THROUGH. `STATIC_FILE_PATTERN` in src/proxy.ts matches `.txt`
 * and `.xml`, so neither this nor the sitemap is touched by the coming-soon wall or the entry
 * gate. Nothing there needed changing, which was worth checking before assuming.
 */

export const SITE_URL = 'https://www.windsorbeauty.co.uk';

/**
 * What a crawler is asked to stay out of, and why each one is here.
 *
 * These are not secrets. Everything genuinely private is behind a session check, and robots.txt is
 * a request rather than a lock. They are here because a search engine spending its crawl budget on
 * a checkout step is crawl budget not spent on a product page, and because a half-filled cart or
 * an unsubscribe link surfacing in search results is a bad experience nobody chose.
 */
const OFF_LIMITS = [
  '/admin',                    // staff only, and behind a session check
  '/api',                      // machine endpoints, nothing readable
  '/account',                  // signed-in pages, different for every person
  '/orders',                   // somebody's own order history
  '/cart',                     // a moment in a purchase, not a page
  '/checkout',                 // the same
  '/pay',                      // one-time payment links from invoice emails
  '/resume-payment',           // secure one-time order payment recovery links
  '/unsubscribe',              // acting on this by accident is the whole problem
  '/r',                        // QR campaign short links, which redirect
  '/coming-soon',              // exists only while the launch wall is up
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: OFF_LIMITS,
    }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
