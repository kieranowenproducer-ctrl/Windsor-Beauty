// Plain-English names for the pages people land on.
//
// The after-the-click tables used to print the raw web address ("/account/
// verify-email", "/shop/hydra-veil-serum"). Kieran reads these tables to decide
// where to spend money, and a list of slugs is not something you can read at a
// glance. Every page now gets the name a person would use for it, with the
// address kept underneath in small type so a row is still traceable.
//
// Product and article names cannot be worked out from the address alone, so the
// admin read looks them up and hands them down
// as a path -> name map. Everything else is decided here, and this file is pure
// so it can run on the server and in the browser.

export type PageKind = 'home' | 'shop' | 'product' | 'buying' | 'account' | 'tool' | 'info' | 'other';

export interface PageDescription {
  /** What to show. Never an address. */
  title: string;
  /** The address itself, for the small line underneath. */
  address: string;
  kind: PageKind;
}

interface Known { title: string; kind: PageKind }

// One entry per fixed public page. Written the way Kieran would say it out loud.
const KNOWN: Record<string, Known> = {
  '/': { title: 'Home page', kind: 'home' },
  '/shop': { title: 'Shop, the whole product list', kind: 'shop' },
  '/shop/category': { title: 'Shop, browsing by category', kind: 'shop' },
  '/cart': { title: 'Basket', kind: 'buying' },
  '/checkout': { title: 'Checkout, filling in their details', kind: 'buying' },
  '/checkout/success': { title: 'Thank-you page, straight after ordering', kind: 'buying' },
  '/checkout/cancelled': { title: 'Payment cancelled page', kind: 'buying' },
  '/account': { title: 'Their own account area', kind: 'account' },
  '/account/login': { title: 'Sign-in page', kind: 'account' },
  '/account/register': { title: 'Signing up for an account', kind: 'account' },
  '/account/verify-email': { title: 'Confirming their email address', kind: 'account' },
  '/account/forgot-password': { title: 'Forgotten password', kind: 'account' },
  '/account/reset-password': { title: 'Choosing a new password', kind: 'account' },
  '/account/create-password': { title: 'Setting their first password', kind: 'account' },
  '/promotion': { title: 'Special offers', kind: 'shop' },
  '/reviews': { title: 'Reviews page', kind: 'info' },
  '/about': { title: 'About us', kind: 'info' },
  '/contact': { title: 'Contact page', kind: 'info' },
  '/unsubscribe': { title: 'Unsubscribing from emails', kind: 'other' },
  '/coming-soon': { title: 'Coming-soon holding page', kind: 'other' },
};

// The pages nobody arrives on by choice. Grouped under one honest name rather
// than eleven separate rows of legal wording.
const SMALL_PRINT: Record<string, string> = {
  '/privacy': 'Privacy policy',
  '/terms': 'Terms and conditions',
  '/cookies': 'Cookie policy',
  '/disclaimer': 'Disclaimer',
  '/shipping': 'Delivery information',
  '/returns': 'Returns information',
  '/refund-policy': 'Refund policy',
  '/payment-policy': 'Payment policy',
  '/contact-policy': 'Contact policy',
};

// Abbreviations that must keep their capitals when an address is tidied into
// words. A general "short word" rule cannot do this: "why" is three letters and
// is not an abbreviation, "spf" is three and is. So it is a list, and adding to
// it is the whole maintenance cost.
const SHOUTED = new Set([
  'spf', 'uv', 'uva', 'uvb', 'aha', 'bha', 'pha', 'ai', 'uk', 'usa',
]);

/** "daily-defence-spf-50" -> "Daily Defence SPF 50". */
export function prettifySlug(slug: string): string {
  const words = slug.split(/[-_]/).filter(Boolean);
  if (words.length === 0) return slug;
  return words
    .map((w) => {
      const lower = w.toLowerCase();
      if (/^\d+(mg|ml|mcg|iu|g|kg)?$/i.test(w)) return lower;            // 50, 30ml
      if (SHOUTED.has(lower)) return lower.toUpperCase();                 // SPF, AHA
      if (/^[a-z]{2,4}\d+$/i.test(w)) return lower.toUpperCase();         // B5, Q10
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/**
 * The name to show for one page.
 *
 * `names` is the path -> real name map the admin read supplies for products,
 * articles and offers. When it is missing, the address is tidied into words so
 * a row never falls back to raw slug text.
 */
export function describePage(path: string, names: Record<string, string> = {}): PageDescription {
  const address = path;
  const clean = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  const supplied = names[clean];

  const known = KNOWN[clean];
  if (known) return { title: known.title, address, kind: known.kind };

  if (SMALL_PRINT[clean]) return { title: `Small print: ${SMALL_PRINT[clean]}`, address, kind: 'info' };

  if (clean.startsWith('/shop/category/')) {
    return { title: `Shop, the ${supplied ?? prettifySlug(clean.slice(15))} category`, address, kind: 'shop' };
  }
  if (clean.startsWith('/shop/')) {
    return { title: `Product page: ${supplied ?? prettifySlug(clean.slice(6))}`, address, kind: 'product' };
  }
  if (clean.startsWith('/promotion/')) {
    return { title: `Offer: ${supplied ?? prettifySlug(clean.slice(11))}`, address, kind: 'shop' };
  }
  if (clean.startsWith('/orders/')) {
    return { title: 'Looking up their own order', address, kind: 'account' };
  }
  if (clean.startsWith('/pay/')) {
    return { title: 'Paying an invoice we sent them', address, kind: 'buying' };
  }
  if (clean.startsWith('/r/')) {
    return { title: `Tracking link: ${supplied ?? prettifySlug(clean.slice(3))}`, address, kind: 'other' };
  }

  return { title: supplied ?? (prettifySlug(clean.replace(/^\//, '')) || 'Home page'), address, kind: 'other' };
}

/** Just the words, for the one-line summaries above the table. */
export const pageTitle = (path: string, names?: Record<string, string>): string => describePage(path, names).title;
