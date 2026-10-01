/**
 * Searching the admin lists with more than one word.
 *
 * Kieran's complaint, 2026-09-24: typing "Amber Reta" into Orders found nothing, because the box
 * only ever looked for that whole phrase inside ONE field (the name, the email or the order
 * number). Nobody's name is "Amber Reta", so the search came back empty even though the order was
 * sitting right there: Amber bought a Reta pen.
 *
 * What it does now: every word you type has to appear SOMEWHERE on the order or invoice, and they
 * do not have to be in the same place. "Amber Reta" means "the customer Amber AND the product
 * Reta". Add a third word and it narrows further. That is the whole idea.
 *
 * The rules, in plain words:
 *
 *   - Spaces, commas and plus signs separate the words. "Anne + Mots", "Anne, Mots" and
 *     "Anne Mots" all do the same thing.
 *   - A dash between words is treated as a separator too ("Amber- Reta"), but a dash INSIDE a word
 *     is left alone, so MOTS-C stays one word and still finds MOTS-C.
 *   - "and" is ignored, because it is how people join two words out loud and never a product.
 *     "hgh and aod" means the same as "hgh aod".
 *   - "or" does the opposite: "hgh or aod" shows everything with EITHER of them.
 *   - Short names count. "Reta" finds Retatrutide and "Retatrutide" finds an order written down as
 *     "Reta 30mg". The list of short names is PEARL's, see src/lib/searchAliases.ts.
 *   - Punctuation, spacing and accents are forgiven. "motsc", "mots-c" and "MOTS C" all find
 *     MOTS-C; "jose" finds Jose.
 *   - Put double quotes round something to keep it whole, short names and all: "pen kit" then has
 *     to appear exactly like that, next to each other.
 *   - One word on its own behaves exactly as it always did.
 *
 * This file is shared so Orders (filtered in the browser) and Invoices (filtered in the database)
 * split the typed words the same way and can never drift apart. The matching itself happens in two
 * places, and the invoices SQL in src/lib/db/invoices.ts repeats these same two comparisons.
 */

/** Characters that only ever join two search words together, never part of a word worth matching. */
const JOINERS = /^[\s+\-&/,.;:|]+|[\s+\-&/,.;:|]+$/g;

/**
 * Words people put between two things they are looking for. Dropped, but only when something else
 * survives, so searching for the word "and" on its own still does what it says.
 */
const NOISE_WORDS = new Set(['and', 'the', 'of', 'with', 'plus', 'a', 'an']);

/** Lower case, with accents flattened, so "Jose" and "José" are the same thing. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Letters and digits only. This is what makes the search forgive punctuation: both the typed word
 * and the text being searched are squashed down, so "motsc" finds "MOTS-C" and "smithco" finds
 * "Smith & Co".
 */
export function squashForSearch(value: string): string {
  return fold(value).replace(/[^a-z0-9]+/g, '');
}

/**
 * One thing the searcher is looking for, and every other way of writing it that counts as the same
 * thing. The row has to match ONE of them. All the groups have to match for the row to show.
 */
export interface SearchGroup {
  /** The word as it was typed, for saying back on screen. */
  typed: string;
  /** That word plus its short names, and anything joined to it with "or". */
  any: string[];
}

/** Splits what was typed into bare words. No short names, no grouping: just the words. */
export function parseSearchTerms(query: string): string[] {
  return parseSearchGroups(query).map(group => group.typed);
}

/**
 * Turns what somebody typed into the groups that all have to match.
 *
 * `aliasGroups` is the "these words mean the same product" list. Orders gets it from its API and
 * Invoices reads it straight off disk, both from src/lib/searchAliases.ts. Leave it out and the
 * search still works, just without short names.
 */
export function parseSearchGroups(query: string, aliasGroups: string[][] = []): SearchGroup[] {
  if (!query) return [];

  const words = splitWords(query);
  const meaningful = words.filter(w => !NOISE_WORDS.has(w.text) && w.text !== 'or');
  // "and" typed on its own, or "or" on its own, is what somebody is actually looking for. Only
  // strip the joining words when there is something left over to join.
  const kept = meaningful.length === 0 ? words : words.filter(w => !NOISE_WORDS.has(w.text));

  const aliasIndex = buildAliasIndex(aliasGroups);
  const groups: SearchGroup[] = [];
  let joinNextWithOr = false;

  for (const word of kept) {
    if (word.text === 'or' && !word.quoted) {
      // Only joins two things that are actually there. A trailing "or" is simply ignored.
      joinNextWithOr = groups.length > 0;
      continue;
    }

    // A quoted phrase is taken literally: quoting it is how you say "this exact thing, no
    // substitutes", so short names are not applied to it.
    const alternatives = word.quoted ? [word.text] : alternativesFor(word.text, aliasIndex);

    if (joinNextWithOr) {
      const previous = groups[groups.length - 1];
      previous.typed = `${previous.typed} or ${word.text}`;
      previous.any = Array.from(new Set([...previous.any, ...alternatives]));
    } else if (!groups.some(g => g.typed === word.text)) {
      // The same word twice narrows nothing, and would say itself twice back on screen.
      groups.push({ typed: word.text, any: alternatives });
    }
    joinNextWithOr = false;
  }

  return groups;
}

interface TypedWord { text: string; quoted: boolean }

/** The one place a typed query is broken into words. Everything else works from the result. */
function splitWords(query: string): TypedWord[] {
  const words: TypedWord[] = [];
  // Either a "quoted phrase" (kept whole, spaces and all) or a run of characters with no space or
  // comma in it. Only double quotes count: apostrophes belong to names like O'Brien.
  const pattern = /"([^"]*)"|([^\s,]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(query)) !== null) {
    const quoted = match[1] !== undefined;
    const raw = quoted ? match[1] : match[2];
    // A plus sign inside a word still splits it, so "Anne+Mots" works with no spaces. Inside quotes
    // nothing is split, because the point of quoting is to keep it exactly as typed.
    for (const piece of quoted ? [raw] : raw.split('+')) {
      const text = fold(piece.replace(JOINERS, ''));
      // A "word" with no letter or digit left in it (a stray %, a lone £) is noise. Dropped here,
      // at the one place the words are decided, so the browser and the database cannot disagree
      // about whether it meant "match nothing" or "ignore me".
      if (!text || !/[a-z0-9]/.test(text)) continue;
      words.push({ text, quoted });
    }
  }
  return words;
}

function buildAliasIndex(aliasGroups: string[][]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const group of aliasGroups) {
    for (const word of group) {
      const existing = index.get(word);
      if (existing) index.set(word, Array.from(new Set([...existing, ...group])));
      else index.set(word, group);
    }
  }
  return index;
}

function alternativesFor(word: string, aliasIndex: Map<string, string[]>): string[] {
  const found = aliasIndex.get(word) ?? aliasIndex.get(squashForSearch(word));
  if (!found) return [word];
  return Array.from(new Set([word, ...found]));
}

/** Glues the searchable fields of one record into a single block of text to look through. */
export function searchHaystack(parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== '')
    .join(' | ');
}

/** True when this one word, or any of its short names, is somewhere in the text. */
export function matchesOneGroup(haystack: string, group: SearchGroup): boolean {
  const plain = fold(haystack);
  const squashed = squashForSearch(haystack);
  return group.any.some((alternative) => {
    if (plain.includes(alternative)) return true;
    const squashedAlternative = squashForSearch(alternative);
    return squashedAlternative !== '' && squashed.includes(squashedAlternative);
  });
}

/**
 * True when EVERY group matches. No groups matches everything, so an empty search box never hides
 * a row.
 */
export function matchesSearchGroups(haystack: string, groups: SearchGroup[]): boolean {
  if (groups.length === 0) return true;
  const plain = fold(haystack);
  const squashed = squashForSearch(haystack);
  return groups.every((group) =>
    group.any.some((alternative) => {
      if (plain.includes(alternative)) return true;
      const squashedAlternative = squashForSearch(alternative);
      return squashedAlternative !== '' && squashed.includes(squashedAlternative);
    })
  );
}

/** The older, no-short-names form. Kept because plain words are still all most searches are. */
export function matchesSearchTerms(haystack: string, terms: string[]): boolean {
  return matchesSearchGroups(haystack, terms.map(term => ({ typed: term, any: [term] })));
}

/** Convenience: parse and match in one go, for a one-off check. */
export function matchesSearch(haystack: string, query: string, aliasGroups: string[][] = []): boolean {
  return matchesSearchGroups(haystack, parseSearchGroups(query, aliasGroups));
}
