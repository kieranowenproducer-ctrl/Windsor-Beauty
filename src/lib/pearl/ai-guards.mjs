/**
 * The guards that keep Pearl's AI honest (Pearl plan Stage D step 10).
 *
 * The rule they enforce, in code rather than in hope: AI may organise, find
 * and phrase APPROVED material — it may never supply material of its own.
 *
 *  - A drafted fact only survives if its quote appears VERBATIM in the stored
 *    source text it claims to come from.
 *  - A summary only survives if EVERY sentence carries a citation to one of
 *    the passages it was given. One uncited sentence rejects the whole
 *    summary — "found nothing" beats filling gaps.
 *
 * Plain JavaScript so `npm run test:pearl-ai` can prove these rules in the
 * build without a compile step. If this file weakens, the build fails.
 */

/** Whitespace-insensitive but otherwise exact matching. */
export function normaliseForMatch(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Keep only the drafted facts whose quote genuinely appears in the source
 * text. Case matters: a quote is a quote.
 */
export function verbatimFacts(facts, sourceText) {
  const haystack = normaliseForMatch(sourceText);
  const kept = [];
  const dropped = [];
  for (const fact of Array.isArray(facts) ? facts : []) {
    const quote = normaliseForMatch(fact?.quote);
    if (quote.length >= 12 && haystack.includes(quote)) kept.push(fact);
    else dropped.push(fact);
  }
  return { kept, dropped };
}

/**
 * Check that every sentence of a summary cites at least one of the supplied
 * passages as [n]. Returns { ok, failures } where failures lists the exact
 * sentences that carry no valid citation.
 */
export function citedSentences(summary, passageCount) {
  const text = String(summary || '').trim();
  if (!text) return { ok: false, failures: ['The summary is empty.'] };
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*/g) || [text];
  const failures = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    const citations = [...trimmed.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
    const valid = citations.some((number) => number >= 1 && number <= passageCount);
    if (!valid) failures.push(trimmed.slice(0, 160));
  }
  return { ok: failures.length === 0, failures };
}

/**
 * Search-time query expansion guard (Pearl plan d10b). The AI may suggest
 * alternative SEARCH wordings — words to look for in the stored, approved
 * source text. This guard keeps only plain, short, lower-case terms: no
 * punctuation tricks, no sentences, no duplicates, never the original
 * question itself. Expansion only ever widens a search over approved text;
 * it can never put words into an answer.
 */
export function cleanSearchTerms(terms, question = '', maximum = 5) {
  const original = normaliseForMatch(question).toLowerCase();
  const kept = [];
  const seen = new Set();
  for (const raw of Array.isArray(terms) ? terms : []) {
    const term = normaliseForMatch(raw).toLowerCase();
    if (!term || term.length > 60) continue;
    if (!/^[a-z0-9][a-z0-9 -]*$/.test(term)) continue;
    if (term.split(' ').length > 4) continue;
    if (term === original || seen.has(term)) continue;
    seen.add(term);
    kept.push(term);
    if (kept.length >= maximum) break;
  }
  return kept;
}
