// Default copy for the homepage trust badges (src/app/page.tsx), and the
// shape of the admin-editable override stored as JSON in site_content.body
// for the 'homepage-trust-badges' key. Mirrors the structured-JSON pattern
// already used for the About page (src/lib/aboutContent.ts) — plain text
// only, no rich text, since these are short labels.

export interface TrustBadge {
  title: string;
  subtitle: string;
}

export const DEFAULT_TRUST_BADGES: TrustBadge[] = [
  { title: 'Premium Skincare', subtitle: 'For your daily routine' },
  { title: 'Clear Sizes', subtitle: 'Shown on every product' },
  { title: 'UK Supplier', subtitle: 'C&S Holdings Group' },
  { title: 'Customer Reviews', subtitle: 'Read before you buy' },
];

interface TrustBadgesSource {
  body?: string | null;
}

export function parseTrustBadges(row: TrustBadgesSource | null): TrustBadge[] {
  if (!row?.body?.trim()) return DEFAULT_TRUST_BADGES;

  try {
    const parsed = JSON.parse(row.body);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TRUST_BADGES;
    return DEFAULT_TRUST_BADGES.map((fallback, i) => {
      const entry = parsed[i] as { title?: unknown; subtitle?: unknown } | undefined;
      return {
        title: typeof entry?.title === 'string' && entry.title.trim() ? entry.title : fallback.title,
        subtitle: typeof entry?.subtitle === 'string' && entry.subtitle.trim() ? entry.subtitle : fallback.subtitle,
      };
    });
  } catch {
    return DEFAULT_TRUST_BADGES;
  }
}
