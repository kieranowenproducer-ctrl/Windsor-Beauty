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
    'Premium skincare from Windsor Beauty -\nPart of the C&S Holdings Group.\n\nSerums, moisturisers, cleansers and SPF\nfor a simple daily routine.',
  emails: [
    { address: 'info@windsorbeauty.is', label: 'general enquiries' },
    { address: 'sales@windsorbeauty.is', label: 'sales & orders' },
    { address: 'beautiful@windsorbeauty.is', label: 'customer support' },
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
  ],
  disclaimer:
    'Our products are cosmetics for external use only. They are not medicines and are not intended to diagnose, treat or prevent any condition. Always patch test before first use and stop using a product if irritation occurs.',
  copyrightSuffix: 'Windsor Beauty. Part of the C&S Holdings Group. All rights reserved.',
  bottomRightText: 'For external use only.',
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
