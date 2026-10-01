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
 * WHAT IS DELIBERATELY KEPT. The old box suggested gyms and personal referrals, and real members
 * have been answering with them: "Energie Fitness", "David Lloyd Windsor", "Friend John Smith".
 * A list of social channels alone would have thrown that away. Those answers keep a place, and a
 * follow-up box catches the detail, so the report gains the channel without losing the name.
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
    value: 'A gym, clinic or partner',
    label: 'A gym, clinic or partner',
    detailLabel: 'Which one?',
  },
  {
    value: 'Another website or forum',
    label: 'Another website or forum',
    detailLabel: 'Which one?',
  },
  /**
   * Added 6 September 2026 for the airline crew tracking link (/r/aircrew), at
   * Kieran's request, so somebody arriving on that link has an answer that
   * matches how the link itself is recorded.
   *
   * The link already tags every sign-up automatically as its campaign, with no
   * action from the customer. This is the OTHER half: the self-reported answer
   * they choose. Before this, an airline crew member had nothing better than
   * "A friend or word of mouth", so the two records disagreed on the same
   * customer. The value is spelled exactly as the campaign is named, because
   * matching is the entire point of it existing.
   */
  { value: 'Airline crew friends and family', label: 'Airline crew friends and family' },
  /**
   * Added 7 September 2026 for Ross McCarthy's affiliate link (/r/ross), at
   * Kieran's request, for the same reason as the airline crew entry above.
   *
   * Spelled exactly as the campaign is named, because matching is the point: the
   * link already tags every arrival "Ross McCarthy" on its own, and this is the
   * other half, the answer somebody picks. Without it the nearest choice is
   * "A friend or word of mouth", so the two records disagree about the same
   * customer and his referrals scatter into a general bucket.
   *
   * NOTE FOR THE NEXT AFFILIATE: this list is people-facing on a public sign-up
   * form. One named person per affiliate reads fine at two; if it grows to a
   * dozen, the list stops being a list and becomes a directory, and the better
   * shape is one "An affiliate or ambassador" entry with a follow-up box for the
   * name. Worth raising with Kieran before adding a third.
   */
  { value: 'Ross McCarthy', label: 'Ross McCarthy' },
  { value: 'RAF affiliate', label: 'Raf' },
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
 * "Instagram" on its own, so every Instagram sign-up counts as the same thing. "A gym, clinic or
 * partner: Energie Fitness" where there is a detail, so the channel still groups while the name
 * of the gym survives. The separator is a colon rather than a dash on purpose: house style bans
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
