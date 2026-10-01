/**
 * How every Windsor Beauty email says hello.
 *
 * Kieran, 10 September 2026, after seeing a draft open "Hello Emma Lewis":
 *
 *   "no email should start with hello Emma Louise. It should never ever show their full name.
 *    It should be hi Emma. Please change this for any response."
 *
 * So there is one function, and every email uses it. Before this, greetings were written out
 * by hand in fourteen places: some said Hello and some said Hi, some used the first name and
 * some used whatever the customer typed into the name box, and in three emails the HTML half
 * and the plain-text half of the SAME message disagreed with each other. A rule spread across
 * fourteen copies is not a rule, it is fourteen chances to get it wrong.
 *
 * WHAT IT WILL NOT DO. It will not greet somebody by a title, because "Hi Mrs," is worse than
 * no name at all, and it will not put a name in at all when there is nothing usable to use.
 */

/** Words people put in front of their name that are not their name. */
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'professor', 'sir', 'rev']);

/**
 * Words that are part of the name that follows them rather than a name on their own.
 *
 * "de Souza" taken one word at a time greets somebody as "De", which is not anybody's name and
 * reads as a bug to the person it is addressed to.
 */
const PARTICLES = new Set(['de', 'del', 'della', 'di', 'da', 'dos', 'du', 'la', 'le', 'van', 'von', 'der', 'den', 'bin', 'ibn', 'al', 'st', 'mc', 'o']);

/**
 * The one word to call this person, or an empty string when there is nothing usable.
 *
 * A name is whatever the customer typed into a box, so it can be "Emma Lewis", "emma", "Mrs Emma
 * Lewis", an email address, or nothing at all.
 */
export function emailGreetingName(fullName: string | null | undefined): string {
  const cleaned = String(fullName ?? '')
    .replace(/[<>"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  // Somebody who typed their email address into the name box is not greeted by it: half an
  // address as a first name reads like a mistake, and the whole one is worse.
  if (cleaned.includes('@')) return '';

  const words = cleaned.split(' ').filter(Boolean);
  const start = words.findIndex(word => !TITLES.has(word.replace(/\./g, '').toLowerCase()));
  if (start < 0) return '';

  // A particle carries the word after it, so "de Souza" stays "de Souza" rather than "De".
  const first = PARTICLES.has(words[start].replace(/[.']/g, '').toLowerCase()) && words[start + 1]
    ? `${words[start]} ${words[start + 1]}`
    : words[start];

  // Capitalised only when they typed it all in lower case. "McDonald" and "O'Brien" are left
  // exactly as the person wrote them, because they are more likely to be right than we are.
  return /[A-Z]/.test(first) ? first : first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * The whole opening line, comma and all. When there is no reliable name,
 * "Hi there," reads naturally without guessing who the person is.
 */
export function emailGreeting(fullName: string | null | undefined): string {
  const name = emailGreetingName(fullName);
  return name ? `Hi ${name},` : 'Hi there,';
}

/** True when somebody already wrote an opening greeting in the reply box. */
export function messageStartsWithGreeting(message: string): boolean {
  const firstLine = String(message ?? '').replace(/^\s+/, '').split(/\r?\n/, 1)[0].trim();
  return /^(?:hi|hello|dear)(?:\s+[^,\n]+)?(?:[,!:](?:\s|$)|$)/i.test(firstLine);
}
