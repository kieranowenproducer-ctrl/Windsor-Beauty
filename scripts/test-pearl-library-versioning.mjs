/**
 * Prove the source-library version rules hold (churn housekeeping, 18 Aug
 * 2026). Runs in `npm run check`: a promo-only raw change must not mint a
 * version, a real text change always must, and sitemaps never take the
 * promo-only shortcut.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanContentHash, pageReadOutcome } from '../src/lib/pearl/library-versioning.mjs';

const TEXT = 'BPC-157 is a synthetic peptide studied for tissue repair.';
const page = (extra = {}) => ({ kind: 'page', contentHash: 'raw-b', fullText: TEXT, ...extra });

test('a page never seen before is new', () => {
  assert.equal(pageReadOutcome(undefined, page(), cleanContentHash(TEXT)), 'new-page');
});

test('identical raw markup is unchanged', () => {
  const stored = { content_hash: 'raw-b', clean_hash: cleanContentHash(TEXT) };
  assert.equal(pageReadOutcome(stored, page(), cleanContentHash(TEXT)), 'unchanged');
});

test('raw changed but cleaned text identical is promo-only: no new version', () => {
  const stored = { content_hash: 'raw-a', clean_hash: cleanContentHash(TEXT) };
  assert.equal(pageReadOutcome(stored, page(), cleanContentHash(TEXT)), 'promo-only');
});

test('a real cleaned-text change still mints a version', () => {
  const stored = { content_hash: 'raw-a', clean_hash: cleanContentHash(TEXT) };
  const fresh = page({ fullText: `${TEXT} New paragraph published today.` });
  assert.equal(pageReadOutcome(stored, fresh, cleanContentHash(fresh.fullText)), 'changed');
});

test('a legacy row without a clean hash keeps the old behaviour', () => {
  const stored = { content_hash: 'raw-a', clean_hash: null };
  assert.equal(pageReadOutcome(stored, page(), cleanContentHash(TEXT)), 'changed');
});

test('sitemaps and assets never take the promo-only shortcut', () => {
  for (const kind of ['sitemap', 'asset']) {
    const stored = { content_hash: 'raw-a', clean_hash: cleanContentHash('') };
    assert.equal(pageReadOutcome(stored, { kind, contentHash: 'raw-b', fullText: '' }, cleanContentHash('')), 'changed');
  }
});

test('a page with no cleaned text never takes the shortcut either', () => {
  const stored = { content_hash: 'raw-a', clean_hash: cleanContentHash('') };
  assert.equal(pageReadOutcome(stored, page({ fullText: '   ' }), cleanContentHash('   ')), 'changed');
});

test('clean hashes can never collide with stored raw hashes', () => {
  assert.match(cleanContentHash(TEXT), /^clean-[0-9a-f]{64}$/);
});
