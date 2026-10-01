/**
 * Where a new member says they heard about Windsor Beauty.
 *
 * WHY THIS IS A LIST AND NOT A TYPING BOX (task 38962e15, 7 August 2026).
 *
 * It was a free typing box, and the admin customers screen counts the answers by grouping on the
 * text somebody typed. So one person wrote "Instagram", the next "instagram", the next "IG" and
 * the next "insta", and the report counted four separate sources of one customer each. With a
 * social media campaign about to start, that report is the thing the spending decisions get made
 * from, and it could not be read.
 *
 * IT LIVES IN ITS OWN FILE because three places need the same answer: the sign-up form draws it,
 * the sign-up route re-checks it (a form is a courtesy, the route is the gate), and the admin
 * report groups by it. Three copies of a list is three lists waiting to disagree.
 *
 * WHAT IS DELIBERATELY KEPT. The old box invited business and personal referrals, and a list of
 * social channels alone would have thrown those away. Those answers keep a place, and a follow-up
 * box catches the detail, so the report gains the channel without losing the name.
 */

export interface ReferralSource {
  /** Stored on the customer, and the thing the admin report groups by. Never change one of these
   *  without deciding what happens to the members already recorded under it. */
  value: string;
  /** What the member reads. */
  label: string;
  /**
   * The follow-up question, where the answer is worth more than the channel alone. A social
   * channel needs none: "Instagram" is the whole of the useful answer, and asking for a detail
   * would be asking somebody to invent one.
   */
  detailLabel?: string;
}

export const REFERRAL_SOURCES: ReferralSource[] = [
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'TikTok', label: 'TikTok' },
  { value: 'YouTube', label: 'YouTube' },
  { value: 'Google or another search engine', label: 'Google or another search engine' },
  {
    value: 'A friend or word of mouth',
    label: 'A friend or word of mouth',
    detailLabel: 'Who told you about us?',
  },
  {
    value: 'A business or partner',
    label: 'A business or partner',
    detailLabel: 'Which one?',
  },
  {
    value: 'Another website or forum',
    label: 'Another website or forum',
    detailLabel: 'Which one?',
  },
  // Offered only to somebody who arrives with a private affiliate invitation. The stored value is
  // matched by the sign-up form and the sign-up route, so it keeps its original spelling.
  { value: 'RAF affiliate', label: 'A partner invitation' },
  { value: 'Other', label: 'Something else', detailLabel: 'Where did you hear about us?' },
];

const BY_VALUE = new Map(REFERRAL_SOURCES.map((s) => [s.value, s]));

export const isReferralSource = (value: string): boolean => BY_VALUE.has(value);

export const referralNeedsDetail = (value: string): boolean =>
  Boolean(BY_VALUE.get(value)?.detailLabel);

/**
 * A social profile is useful only where the member chose the matching social
 * network. It is deliberately stored separately from `referred_by`: reporting
 * must continue to count every Instagram or Facebook sign-up together.
 */
export function referralAllowsSocialProfile(value: string): boolean {
  return value === 'Instagram' || value === 'Facebook';
}

export function socialProfilePrompt(value: string): string | null {
  if (value === 'Instagram') return 'Your Instagram username (optional)';
  if (value === 'Facebook') return 'Your Facebook profile name (optional)';
  return null;
}

/** Keep a name supplied by the member readable, bounded and free of controls. */
export function cleanSocialProfile(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  if (clean.length > 100 || /[\u0000-\u001F\u007F]/.test(clean)) return null;
  return clean;
}

/**
 * The one string saved against the member.
 *
 * "Instagram" on its own, so every Instagram sign-up counts as the same thing. "A business or
 * partner: Example Studio" where there is a detail, so the channel still groups while the name
 * of the business survives. The separator is a colon rather than a dash on purpose: house style bans
 * em dashes in anything a person reads, and this string is shown on the member's own account page.
 */
export function composeReferral(source: string, detail: string): string {
  const clean = detail.trim().replace(/\s+/g, ' ');
  if (!referralNeedsDetail(source) || !clean) return source;
  return `${source}: ${clean}`;
}

/**
 * The channel out of a saved answer, for counting.
 *
 * Everything recorded before 7 August 2026 is whatever that member typed, so it will not match a
 * known source and is returned unchanged rather than forced into "Other". Losing the old answers
 * into one bucket would destroy the only history this report has.
 */
export function referralChannel(saved: string | null | undefined): string | null {
  const text = (saved ?? '').trim();
  if (!text) return null;
  const before = text.split(':')[0].trim();
  return isReferralSource(before) ? before : text;
}
