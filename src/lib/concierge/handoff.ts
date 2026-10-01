// Carrying a question from the Concierge to PEARL.
//
// Kieran's instruction, 2026-08-05. The Concierge already redirects dosage and
// detailed research questions to PEARL and shows a button that goes
// there. The customer then had to type the question out a second time. This
// module carries it across so the box is already filled in when they arrive.
//
// WHAT IT DOES NOT DO: it never submits anything. The question is placed in the
// box and stops there. The customer reads it and presses Ask themselves. The
// "I understand" screen is untouched and still has to be passed first.
//
// WHY NOT THE ADDRESS BAR. A query string is the obvious way to pass text
// between two pages and the wrong one here. Addresses are shared, bookmarked,
// typed into search boxes by mistake, kept in browser history, and handed to
// every server and proxy in the path as a referrer. A customer's health-shaped
// question does not belong in any of those. Session storage is read only by
// this site, in this one browser tab, never travels to a server, and dies with
// the tab.
//
// THREE RULES THE STORE FOLLOWS.
//
//   Read once      Taking the question also deletes it. A refresh after that
//                  gets an empty box rather than the same question appearing
//                  again and again.
//   Short life     Thirty minutes. A question abandoned on the consent screen
//                  and rediscovered an hour later is not what anyone meant.
//   Never throws   Private browsing and full storage both make session storage
//                  raise an error. Every path here swallows it, and the cost of
//                  that is an empty box, which is exactly how PEARL
//                  behaved before any of this existed.

/* One key, named for the site, so it cannot collide with anything else the
   browser is holding for windsorglow.com. */
export const RESEARCH_HANDOFF_KEY = 'wg:concierge:research-question';

/* Long enough that no genuine question is ever cut short: the Concierge's own
   box is a couple of lines and the longest real question seen is well under
   this. It is a guard against a corrupted or stuffed value, not a limit on the
   customer. */
const MAX_LENGTH = 2000;

/* Thirty minutes. Long enough to read the consent screen, fetch a cup of tea
   and come back; short enough that a forgotten question does not resurface. */
const MAX_AGE_MS = 30 * 60 * 1000;

/** A question travelling between the two tabs of the same page. */
export interface ResearchHandoff {
  text: string;
  /* Bumped on every handover so PEARL can tell a fresh redirect
     from a repeat of the one it has already dealt with, even when the customer
     asks the very same thing twice. */
  key: number;
}

/**
 * Check a question that has come from somewhere else and return it, or null.
 *
 * Deliberately preserves the wording: no collapsing of spaces, no case change,
 * no punctuation tidying. The only characters removed are control codes that a
 * text box cannot hold anyway. Line breaks and tabs survive, because a customer
 * may well have typed them.
 */
export function sanitiseHandoffQuestion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  /* Written as a code-point filter rather than a regular expression: a
     character class of escaped control codes is easy to mistype into something
     that silently matches nothing. */
  const cleaned = Array.from(raw.replace(/\r\n/g, '\n'))
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      if (code === 10 || code === 9) return true; // keep newlines and tabs
      return code >= 32 && code !== 127; // drop the remaining control codes
    })
    .join('');

  const trimmed = cleaned.trim();
  if (!trimmed) return null;

  return trimmed.length > MAX_LENGTH ? trimmed.slice(0, MAX_LENGTH) : trimmed;
}

/**
 * Put a question aside for PEARL, just before leaving this page.
 *
 * Used only on the storefront widget, where the button is a real link and the
 * page is about to be replaced. On the signed-in desk PEARL is the
 * next tab along, so the question is handed over in memory instead and never
 * touches storage at all.
 */
export function stashResearchQuestion(raw: unknown): void {
  if (typeof window === 'undefined') return;
  const text = sanitiseHandoffQuestion(raw);
  if (!text) return;

  try {
    window.sessionStorage.setItem(RESEARCH_HANDOFF_KEY, JSON.stringify({ text, at: Date.now() }));
  } catch {
    /* No storage available. PEARL opens with an empty box, which is
       a small annoyance and not a failure. */
  }
}

/**
 * Collect the waiting question and clear it in the same breath.
 *
 * Anything unexpected, missing, stale or unreadable returns null, and null
 * means PEARL carries on exactly as it always has.
 */
export function takeResearchQuestion(): string | null {
  if (typeof window === 'undefined') return null;

  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(RESEARCH_HANDOFF_KEY);
    /* Removed whether or not it turns out to be usable, so a value this code
       cannot read can never get stuck and be retried forever. */
    if (raw !== null) window.sessionStorage.removeItem(RESEARCH_HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as { text?: unknown; at?: unknown };

  if (typeof record.at !== 'number' || !Number.isFinite(record.at)) return null;
  const age = Date.now() - record.at;
  /* A negative age means the clock moved; treat it as untrustworthy rather than
     as very fresh. */
  if (age < 0 || age > MAX_AGE_MS) return null;

  return sanitiseHandoffQuestion(record.text);
}

/** Throw away anything waiting, without reading it. */
export function clearResearchQuestion(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(RESEARCH_HANDOFF_KEY);
  } catch {
    /* Nothing to do and nothing worth telling anyone about. */
  }
}
