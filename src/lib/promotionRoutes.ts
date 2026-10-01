// Known internal destinations for the promotion banner's call-to-action button.
// Used to populate a quick-pick dropdown in the admin promotions form and to
// validate custom links so a promotion can't be published with a dead button.
export const KNOWN_PROMOTION_ROUTES: { value: string; label: string }[] = [
  { value: '/promotion', label: 'Promotion page (shows discount code)' },
  { value: '/shop', label: 'Shop: All Products' },
  { value: '/shop?category=Serums', label: 'Shop: Serums' },
  { value: '/shop?category=Moisturisers', label: 'Shop: Moisturisers' },
  { value: '/shop?category=Cleansers', label: 'Shop: Cleansers' },
  { value: '/shop?category=SPF', label: 'Shop: SPF' },
  { value: '/shop?category=Extras', label: 'Shop: Extras' },
  { value: '/reviews', label: 'Reviews' },
  { value: '/about', label: 'About' },
  { value: '/contact', label: 'Contact' },
];

// A valid destination is either:
// - empty (falls back to /promotion in the banner)
// - a site-relative path starting with "/" (e.g. /shop, /shop/slug, /shop?category=Serums)
// - an absolute http(s) URL, for linking to an external page
const RELATIVE_PATH_PATTERN = /^\/[A-Za-z0-9\-_/]*(\?[A-Za-z0-9\-_=&%]*)?$/;
const ABSOLUTE_URL_PATTERN = /^https?:\/\/[^\s]+$/;

export function isValidButtonLink(link: string | null | undefined): boolean {
  if (!link) return true;
  return RELATIVE_PATH_PATTERN.test(link) || ABSOLUTE_URL_PATTERN.test(link);
}
