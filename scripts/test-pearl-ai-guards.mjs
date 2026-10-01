/**
 * Prove the Pearl AI guards hold (Pearl plan Stage D step 10).
 *
 * Runs in `npm run check`, so the build fails if the rules ever weaken:
 * a summary sentence without a source must be rejected, and a drafted fact
 * whose quote is not verbatim in the stored page must be dropped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citedSentences, cleanSearchTerms, verbatimFacts, normaliseForMatch } from '../src/lib/pearl/ai-guards.mjs';

test('a fully cited summary passes', () => {
  const check = citedSentences('BPC-157 was studied in rats [1]. No human trial has completed [2].', 2);
  assert.equal(check.ok, true);
  assert.equal(check.failures.length, 0);
});

test('one uncited sentence rejects the whole summary', () => {
  const check = citedSentences('The compound was studied in rats [1]. It is considered very promising.', 2);
  assert.equal(check.ok, false);
  assert.equal(check.failures.length, 1);
  assert.match(check.failures[0], /very promising/);
});

test('a citation pointing at a passage that was not supplied does not count', () => {
  const check = citedSentences('The compound was studied in rats [7].', 2);
  assert.equal(check.ok, false);
});

test('an empty summary is not acceptable', () => {
  assert.equal(citedSentences('', 3).ok, false);
});

test('multiple citations in one sentence are fine', () => {
  assert.equal(citedSentences('Two sources agree on the half life [1][2].', 2).ok, true);
});

test('a verbatim quote survives; an invented one is dropped', () => {
  const source = 'BPC-157 is a synthetic peptide. Its half-life in rats was measured at about 15 minutes.';
  const { kept, dropped } = verbatimFacts([
    { field: 'half-life', statement: 'About 15 minutes in rats.', quote: 'Its half-life in rats was measured at about 15 minutes.' },
    { field: 'safety', statement: 'It is completely safe.', quote: 'BPC-157 is completely safe in humans.' },
  ], source);
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 1);
  assert.equal(kept[0].field, 'half-life');
});

test('whitespace differences do not defeat a genuine quote', () => {
  const source = 'The  peptide\n was studied   in mice.';
  const { kept } = verbatimFacts([
    { field: 'evidence', statement: 'Studied in mice.', quote: 'The peptide was studied in mice.' },
  ], source);
  assert.equal(kept.length, 1);
});

test('a real quote does not prove that the AI statement interpreted it correctly', () => {
  const source = 'No human trial has confirmed efficacy.';
  const { kept } = verbatimFacts([
    { field: 'evidence', statement: 'Human trials confirmed efficacy.', quote: 'No human trial has confirmed efficacy.' },
  ], source);
  // This deliberately passes. The guard proves provenance, not truth, so the
  // dashboard must tell the reviewer to compare the statement with its quote.
  assert.equal(kept.length, 1);
});

test('a citation marker does not prove that an AI summary read its passage correctly', () => {
  const check = citedSentences('The passage proves the compound is safe in humans [1].', 1);
  // This deliberately passes. The guard proves that a supplied passage was
  // cited, not that the sentence describes that passage honestly.
  assert.equal(check.ok, true);
});

test('a too-short quote cannot smuggle a fact through', () => {
  const { kept, dropped } = verbatimFacts([
    { field: 'safety', statement: 'Something sweeping.', quote: 'peptide' },
  ], 'A peptide.');
  assert.equal(kept.length, 0);
  assert.equal(dropped.length, 1);
});

test('normalisation collapses whitespace only', () => {
  assert.equal(normaliseForMatch('a  b\n\tc'), 'a b c');
});

/* Passage guards: shop-talk and page furniture never become search passages. */
import { looksLikeJunkPassage, JUNK_HEADINGS } from '../src/lib/pearl/passage-guards.mjs';

test('a discount code is junk', () => {
  assert.equal(looksLikeJunkPassage('save 50% with code PEPTIDEDECK Get 50% Off'), true);
});

test('leaked markup fragments are junk', () => {
  assert.equal(looksLikeJunkPassage('svg]:px-2.5" href="/blog"> Back to Blog Contents'), true);
});

test('a shop block with two prices is junk', () => {
  assert.equal(looksLikeJunkPassage('KLOW 80mg from Ascension Peptides. $75.00 $150.00'), true);
});

test('cookie banners and cart buttons are junk', () => {
  assert.equal(looksLikeJunkPassage('We use cookies. See our cookie policy. Add to cart to continue.'), true);
});

test('research prose with one measurement is NOT junk', () => {
  assert.equal(looksLikeJunkPassage('The half-life in rats was measured at about 15 minutes after intravenous dosing, and no accumulation was observed.'), false);
});

test('prose mentioning a single price stays searchable', () => {
  assert.equal(looksLikeJunkPassage('The trial medication cost was reported as $120.00 per participant per month in the study appendix.'), false);
});

test('junk headings are matched exactly, not loosely', () => {
  assert.equal(JUNK_HEADINGS.test('Related products'), true);
  assert.equal(JUNK_HEADINGS.test('Newsletter'), true);
  assert.equal(JUNK_HEADINGS.test('Related compound evidence and tools'), false);
  assert.equal(JUNK_HEADINGS.test('Safety and tolerability'), false);
});

test('search expansion keeps only short plain terms', () => {
  const kept = cleanSearchTerms([
    'tendon repair', 'TENDON  HEALING', 'connective tissue recovery time', 'one two three four five',
    'DROP TABLE users;', 'a'.repeat(80), '', 'wound-healing',
  ], 'tendon repair research');
  assert.deepEqual(kept, ['tendon repair', 'tendon healing', 'connective tissue recovery time', 'wound-healing']);
});

test('search expansion never returns the original question or duplicates', () => {
  assert.deepEqual(cleanSearchTerms(['sleep quality', 'sleep quality', 'Sleep Quality'], 'sleep quality'), []);
});

test('search expansion caps the list', () => {
  assert.equal(cleanSearchTerms(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'], '').length, 5);
});

/**
 * Terminology-kind drift guard (Pearl repairs Stage B, 18 Aug 2026).
 *
 * The "Category or group" kind was offered on both admin screens and accepted
 * by the app's validation while the live database's check constraint still
 * carried the old five-kind list, so approving one failed with a generic 500.
 * These tests read the actual sources and fail the build if the kind lists
 * ever drift apart again: the PearlTermKind union, the admin KINDS set, the
 * CREATE TABLE check and the DROP+ADD constraint refresh must all agree.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relative) => readFileSync(join(repoRoot, relative), 'utf8');

function kindListsFromChecks(source, table) {
  // Every `kind IN ('a', 'b', ...)` that appears in a statement naming the
  // table, whether in CREATE TABLE or in the ADD CONSTRAINT refresh.
  const lists = [];
  for (const statement of source.split('await db`')) {
    if (!statement.includes(table)) continue;
    for (const match of statement.matchAll(/kind IN \(([^)]+)\)/g)) {
      lists.push(match[1].split(',').map((part) => part.trim().replace(/^'|'$/g, '')).sort());
    }
  }
  return lists;
}

test('the terminology kind list is identical in the union, the admin validation and both database checks', () => {
  const union = [...readSource('src/lib/db/pearlTerminology.ts')
    .match(/export type PearlTermKind = ([^;]+);/)[1]
    .matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
  const adminKinds = [...readSource('src/lib/concierge/research/terminology-admin.ts')
    .match(/const KINDS = new Set<PearlTermKind>\(\[([^\]]+)\]\)/)[1]
    .matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
  const schemaLists = kindListsFromChecks(readSource('src/lib/db/schema-parts/operations-and-logs.ts'), 'pearl_terminology_overrides');

  assert.ok(union.length >= 6, 'expected the PearlTermKind union to be found');
  assert.deepEqual(adminKinds, union, 'admin KINDS set drifted from the PearlTermKind union');
  assert.equal(schemaLists.length, 2, 'expected a CREATE check and a constraint refresh for pearl_terminology_overrides');
  for (const list of schemaLists) {
    assert.deepEqual(list, union, 'a database kind check drifted from the PearlTermKind union');
  }
});

test('the proposals kind list is identical in the CREATE check and the constraint refresh', () => {
  const lists = kindListsFromChecks(readSource('src/lib/db/schema-parts/operations-and-logs.ts'), 'pearl_proposals');
  assert.equal(lists.length, 2, 'expected a CREATE check and a constraint refresh for pearl_proposals');
  assert.deepEqual(lists[0], lists[1], 'the pearl_proposals kind refresh drifted from its CREATE check');
});
