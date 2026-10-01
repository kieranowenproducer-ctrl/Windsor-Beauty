/**
 * Where Windsor Glow lives on social media.
 *
 * ADDED 24 AUGUST 2026, when Kieran asked for the TikTok, Instagram and Facebook accounts on the
 * homepage. One file, so the homepage buttons, the structured data a search engine reads, and
 * anything added later all point at the same addresses and cannot drift apart.
 *
 * The addresses are the clean profile addresses. The links Kieran copied out of the apps carried
 * share-tracking parameters on the end (`?_r=1&_t=...` from TikTok, `?igsi=...&utm_source=qr`
 * from Instagram, `?mibextid=...` from Facebook); they identify the share, not the account, and a
 * public site should not stamp one person's share token on every visitor.
 *
 * INSTAGRAM PAUSED 22 SEPTEMBER 2026 after Meta banned @windsorglowofficial, and RESTORED 26
 * SEPTEMBER 2026 on Kieran's word: the account is back (now private) and he is happy for visitors
 * to click through and follow. Same address as before the pause, taken from commit 7e2c89ad rather
 * than worked out from the display name. If it is banned again, set url back to null: the icon
 * then stays as an idle placeholder and drops out of the search-engine data.
 *
 * FACEBOOK: Kieran supplied a share link (facebook.com/share/18pPaZmALs/). Followed in a real
 * browser on 24 August 2026 it lands on the page below, which is the address Facebook itself
 * declares as canonical. The page has no custom username yet; if one is ever set, put the short
 * address here and the old one keeps working.
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
  { id: 'tiktok', name: 'TikTok', account: '@windsorglow', url: 'https://www.tiktok.com/@windsorglow' },
  { id: 'instagram', name: 'Instagram', account: '@windsorglowofficial', url: 'https://www.instagram.com/windsorglowofficial/' },
  { id: 'facebook', name: 'Facebook', account: 'Windsor Glow', url: 'https://www.facebook.com/people/Windsor-Glow/61592503357309/' },
];

/** Every public profile, for the `sameAs` field of the Organization structured data. */
export const SOCIAL_PROFILE_URLS: readonly string[] = SOCIAL_LINKS.flatMap((link) => (
  link.url ? [link.url] : []
));
