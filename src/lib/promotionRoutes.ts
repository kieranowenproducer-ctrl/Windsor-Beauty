// Known internal destinations for the promotion banner's call-to-action button.
// Used to populate a quick-pick dropdown in the admin promotions form and to
// validate custom links so a promotion can't be published with a dead button.
export const KNOWN_PROMOTION_ROUTES: { value: string; label: string }[] = [
  { value: '/promotion', label: 'Promotion page (shows discount code)' },
  { value: '/shop', label: 'Shop — All Products' },
  { value: '/shop?category=Peptides', label: 'Shop — Peptides' },
  { value: '/shop?category=Pens', label: 'Shop — Pens' },
  { value: '/shop?category=Reconstitution', label: 'Shop — Reconstitution Supplies' },
  { value: '/verify', label: 'Verify a Product' },
  // Dosage Guide and Peptide Calculator removed as promotion destinations on 23 September 2026:
  // both are members-only now (task 98b6dcc6), so a banner pointing at either would send the
  // public straight to a sign-in wall.
  { value: '/reviews', label: 'Reviews' },
  { value: '/about', label: 'About' },
  { value: '/contact', label: 'Contact' },
];

// A valid destination is either:
// - empty (falls back to /promotion in the banner)
// - a site-relative path starting with "/" (e.g. /shop, /shop/slug, /shop?category=Pens)
// - an absolute http(s) URL, for linking to an external page
const RELATIVE_PATH_PATTERN = /^\/[A-Za-z0-9\-_/]*(\?[A-Za-z0-9\-_=&%]*)?$/;
const ABSOLUTE_URL_PATTERN = /^https?:\/\/[^\s]+$/;

export function isValidButtonLink(link: string | null | undefined): boolean {
  if (!link) return true;
  return RELATIVE_PATH_PATTERN.test(link) || ABSOLUTE_URL_PATTERN.test(link);
}
