/**
 * Where Windsor Beauty lives on social media.
 *
 * One file, so the homepage buttons, the structured data a search engine reads, and
 * anything added later all point at the same addresses and cannot drift apart.
 * Use the clean profile address, never a share link with tracking on the end.
 * A null url keeps the icon as an idle placeholder and out of the search-engine data.
 */
export interface SocialLink {
  /** Stable key, also the icon it draws. */
  id: 'tiktok' | 'instagram' | 'facebook';
  /** The network's name as people say it. */
  name: string;
  /** How the account is written on that network: an @handle where the network has them. */
  account: string;
  /** The public profile address, or null while the visible icon is deliberately inactive. */
  url: string | null;
}

export const SOCIAL_LINKS: readonly SocialLink[] = [
  // Windsor Beauty has no confirmed social accounts yet. Each icon shows but is
  // inactive until its real address is put here; never point these at another brand.
  { id: 'tiktok', name: 'TikTok', account: 'Windsor Beauty', url: null },
  { id: 'instagram', name: 'Instagram', account: 'Windsor Beauty', url: null },
  { id: 'facebook', name: 'Facebook', account: 'Windsor Beauty', url: null },
];

/** Every public profile, for the `sameAs` field of the Organization structured data. */
export const SOCIAL_PROFILE_URLS: readonly string[] = SOCIAL_LINKS.flatMap((link) => (
  link.url ? [link.url] : []
));
