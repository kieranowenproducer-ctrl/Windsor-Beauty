/**
 * Version-churn housekeeping for the Pearl source library (18 Aug 2026).
 *
 * About 577 stored pages carry rotating promotional chrome, so their RAW
 * markup hashes differently on every visit even though the cleaned text -
 * the only thing Pearl stores and searches - is identical. Every full reload
 * appended a new "version" of unchanged knowledge.
 *
 * The fix: each page now also records a hash of its CLEANED text. A fresh
 * read whose raw markup changed but whose cleaned text is identical is a
 * promo-only change: the hashes are updated, "last read" moves, and no new
 * version is minted. A page whose cleaned text really changed still gets its
 * new version, exactly as before. Plain JavaScript so the build can prove
 * the rules without a compile step.
 */
import { createHash } from 'node:crypto';

/** Hash of the cleaned page text. Prefixed so it can never collide with the
 *  raw-markup hashes already stored. */
export function cleanContentHash(fullText) {
  return `clean-${createHash('sha256').update(String(fullText || ''), 'utf8').digest('hex')}`;
}

/**
 * Decide what a fresh read of a page means.
 *
 *  - 'new-page'   nothing stored yet
 *  - 'unchanged'  the raw markup is identical to the last read
 *  - 'promo-only' the raw markup changed but the cleaned text is identical:
 *                 update the stored hashes, do NOT mint a version. Only real
 *                 pages with actual text qualify - sitemaps and assets keep
 *                 raw-only comparison, because two different sitemaps can
 *                 both clean down to nothing.
 *  - 'changed'    the cleaned text really changed: mint a new version
 */
export function pageReadOutcome(stored, page, cleanedHash) {
  if (!stored) return 'new-page';
  if (stored.content_hash === page.contentHash) return 'unchanged';
  if (page.kind === 'page' && String(page.fullText || '').trim() && stored.clean_hash === cleanedHash) {
    return 'promo-only';
  }
  return 'changed';
}
