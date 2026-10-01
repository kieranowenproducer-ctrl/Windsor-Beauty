// Default copy for the site footer (src/components/Footer.tsx), and the
// shape of the admin-editable override stored as JSON in site_content.body
// for the 'footer-content' key. Mirrors the structured-JSON pattern already
// used for the homepage trust badges (src/lib/trustBadges.ts) — fixed-length
// arrays mapped positionally onto the defaults, so the footer's layout can
// never end up with more or fewer links than it was designed for.

export interface FooterEmail {
  address: string;
  label: string;
}

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterContent {
  description: string;
  emails: FooterEmail[];
  navLinks: FooterLink[];
  legalLinks: FooterLink[];
  disclaimer: string;
  copyrightSuffix: string;
  bottomRightText: string;
}

export const DEFAULT_FOOTER_CONTENT: FooterContent = {
  description:
    'Premium research compounds supplied by Windsor Beauty, part of the C&S Holdings Group. All products are independently lab-tested and supplied strictly for scientific research use only.',
  emails: [
    { address: 'info@windsorbeauty.co.uk', label: 'general enquiries' },
    { address: 'sales@windsorbeauty.co.uk', label: 'sales & orders' },
    { address: 'beautiful@windsorbeauty.co.uk', label: 'customer support' },
  ],
  navLinks: [
    { label: 'Shop', href: '/shop' },
    { label: 'Reviews', href: '/reviews' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ],
  legalLinks: [
    { label: 'Terms and Conditions', href: '/terms' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Cookie Policy', href: '/cookies' },
    { label: 'Shipping Policy', href: '/shipping' },
    { label: 'Returns Policy', href: '/returns' },
    { label: 'Refund Policy', href: '/refund-policy' },
    { label: 'Payment Policy', href: '/payment-policy' },
    { label: 'Contact Policy', href: '/contact-policy' },
    { label: 'Product Disclaimer', href: '/disclaimer' },
    { label: 'Research Use Disclaimer', href: '/research-disclaimer' },
    { label: 'Age Restriction Policy', href: '/age-restriction' },
  ],
  disclaimer:
    'All products sold by Windsor Beauty are intended strictly for in vitro research and laboratory use by qualified professionals. They are not approved for therapeutic, diagnostic, or any other use in humans or animals. Windsor Beauty assumes no liability for any misuse of these compounds.',
  copyrightSuffix: 'Windsor Beauty. Part of the C&S Holdings Group. All rights reserved.',
  bottomRightText: 'Not for human consumption. Research use only.',
};

function sanitizeLinks(value: unknown, fallback: FooterLink[]): FooterLink[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return fallback.map((fb, i) => {
    const entry = value[i] as { label?: unknown; href?: unknown } | undefined;
    return {
      label: typeof entry?.label === 'string' && entry.label.trim() ? entry.label.trim() : fb.label,
      href: typeof entry?.href === 'string' && entry.href.trim() ? entry.href.trim() : fb.href,
    };
  });
}

function sanitizeEmails(value: unknown, fallback: FooterEmail[]): FooterEmail[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return fallback.map((fb, i) => {
    const entry = value[i] as { address?: unknown; label?: unknown } | undefined;
    return {
      address: typeof entry?.address === 'string' && entry.address.trim() ? entry.address.trim() : fb.address,
      label: typeof entry?.label === 'string' && entry.label.trim() ? entry.label.trim() : fb.label,
    };
  });
}

interface FooterContentSource {
  body?: string | null;
}

export function parseFooterContent(row: FooterContentSource | null): FooterContent {
  if (!row?.body?.trim()) return DEFAULT_FOOTER_CONTENT;

  try {
    const parsed = JSON.parse(row.body);
    return {
      description:
        typeof parsed?.description === 'string' && parsed.description.trim()
          ? parsed.description
          : DEFAULT_FOOTER_CONTENT.description,
      emails: sanitizeEmails(parsed?.emails, DEFAULT_FOOTER_CONTENT.emails),
      navLinks: sanitizeLinks(parsed?.navLinks, DEFAULT_FOOTER_CONTENT.navLinks),
      legalLinks: sanitizeLinks(parsed?.legalLinks, DEFAULT_FOOTER_CONTENT.legalLinks),
      disclaimer:
        typeof parsed?.disclaimer === 'string' && parsed.disclaimer.trim()
          ? parsed.disclaimer
          : DEFAULT_FOOTER_CONTENT.disclaimer,
      copyrightSuffix:
        typeof parsed?.copyrightSuffix === 'string' && parsed.copyrightSuffix.trim()
          ? parsed.copyrightSuffix
          : DEFAULT_FOOTER_CONTENT.copyrightSuffix,
      bottomRightText:
        typeof parsed?.bottomRightText === 'string' && parsed.bottomRightText.trim()
          ? parsed.bottomRightText
          : DEFAULT_FOOTER_CONTENT.bottomRightText,
    };
  } catch {
    return DEFAULT_FOOTER_CONTENT;
  }
}
