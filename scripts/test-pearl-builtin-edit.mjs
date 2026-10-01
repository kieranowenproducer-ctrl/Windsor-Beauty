/**
 * Editing a built-in terminology record actually changes what PEARL does.
 *
 *   node --test scripts/test-pearl-builtin-edit.mjs
 *
 * Kieran, 19 Aug 2026: the terminology screen must be fully editable, built-in
 * records included. Those records live in source control and cannot be written
 * to at run time, so an edit is stored as an override row naming the built-in
 * it replaces, and the resolver drops the named built-in.
 *
 * The thing worth testing is not that a row saved, but that the SUPPLIED
 * wording stops working when you remove it. An override that only ever ADDS
 * would look identical in the admin screen and be useless for a correction.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolvePearlTerminology, CURATED_TERMINOLOGY } from '../src/lib/concierge/research/terminology.mjs';
import { COMPOUNDS } from '../src/lib/concierge/research/chat-engine.mjs';

const builtInSemax = CURATED_TERMINOLOGY.find((record) => record.id === 'semax');

test('the supplied Semax record exists and recognises its built-in misspellings', () => {
  assert.ok(builtInSemax, 'the built-in semax record should exist');
  assert.ok((builtInSemax.misspellings || []).includes('semaks'), 'semaks is one of the supplied misspellings');
  const resolved = resolvePearlTerminology('what is semaks', COMPOUNDS);
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.entities[0].slug, 'semax');
});

/* An override in the shape pearlRowToRuntimeRecord produces. */
function overrideRecord(fields) {
  return {
    id: 'admin-1',
    recordType: 'compound',
    canonicalSlug: 'semax',
    displayName: 'Semax',
    aliases: [],
    abbreviations: [],
    misspellings: [],
    phoneticForms: [],
    confidence: 'high',
    reviewStatus: 'approved',
    autoResolve: true,
    enabled: true,
    sources: [],
    lastVerified: '2026-08-19',
    notes: 'Edited by an administrator.',
    ...fields,
  };
}

test('editing a built-in REMOVES a supplied misspelling, not just adds to it', () => {
  // The edit keeps every supplied misspelling except "semaks".
  const kept = (builtInSemax.misspellings || []).filter((word) => word !== 'semaks');
  const edit = overrideRecord({ supersedesBuiltIn: 'semax', misspellings: kept, aliases: builtInSemax.aliases || [] });

  const resolved = resolvePearlTerminology('what is semaks', COMPOUNDS, { overrides: [edit] });
  assert.notEqual(resolved.status, 'resolved', 'the removed misspelling must stop resolving');

  // Everything the edit kept still works, so the edit replaced the record
  // rather than deleting it.
  const stillWorks = resolvePearlTerminology(`what is ${kept[0]}`, COMPOUNDS, { overrides: [edit] });
  assert.equal(stillWorks.status, 'resolved');
  assert.equal(stillWorks.entities[0].slug, 'semax');
});

test('an edit can add wording the supplied record never had', () => {
  const edit = overrideRecord({
    supersedesBuiltIn: 'semax',
    aliases: [...(builtInSemax.aliases || []), 'kierans test wording'],
    misspellings: builtInSemax.misspellings || [],
  });
  const resolved = resolvePearlTerminology('what is kierans test wording', COMPOUNDS, { overrides: [edit] });
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.entities[0].slug, 'semax');
});

test('an unapproved or disabled edit never replaces the supplied record', () => {
  const kept = (builtInSemax.misspellings || []).filter((word) => word !== 'semaks');
  for (const half of [
    overrideRecord({ supersedesBuiltIn: 'semax', misspellings: kept, reviewStatus: 'review' }),
    overrideRecord({ supersedesBuiltIn: 'semax', misspellings: kept, enabled: false }),
  ]) {
    const resolved = resolvePearlTerminology('what is semaks', COMPOUNDS, { overrides: [half] });
    assert.equal(resolved.status, 'resolved', 'a half-finished edit must not switch a supplied term off');
    assert.equal(resolved.entities[0].slug, 'semax');
  }
});

test('putting the original back restores the supplied wording exactly', () => {
  // Reverting is simply removing the override, so with no overrides the
  // supplied record must behave exactly as it did before any edit.
  const resolved = resolvePearlTerminology('what is semaks', COMPOUNDS, { overrides: [] });
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.entities[0].slug, 'semax');
});

test('an override that names no built-in still only adds, as before', () => {
  const addition = overrideRecord({ aliases: ['a brand new wording'], misspellings: builtInSemax.misspellings || [] });
  const added = resolvePearlTerminology('what is a brand new wording', COMPOUNDS, { overrides: [addition] });
  assert.equal(added.status, 'resolved');
  // and the supplied misspellings are untouched
  const supplied = resolvePearlTerminology('what is semaks', COMPOUNDS, { overrides: [addition] });
  assert.equal(supplied.status, 'resolved');
});

/* The save writes to a column added by ensureSchema. This proves the first save
   after a deploy heals itself rather than failing, which is the one thing that
   could not be tested from a machine without owner rights on the store
   database (19 Aug 2026). Three links in the chain, all asserted here. */
test('the first save after deploy adds the missing column and retries, rather than failing', () => {
  const route = readFileSync(new URL('../src/app/api/admin/pearl-terminology/route.ts', import.meta.url), 'utf8');
  // 1. the insert goes through withSchema
  assert.match(route, /withSchema\(\(\) => createPearlTerminology/);
  // 2. withSchema retries on undefined_column (42703), not just undefined_table
  const guard = route.slice(route.indexOf('async function withSchema'), route.indexOf('type BuiltInRecord'));
  assert.match(guard, /'42703'/, 'undefined_column must trigger the schema repair');
  assert.match(guard, /await ensureSchema\(\)/);
  assert.match(guard, /return work\(\)/, 'the work must be retried after repairing the schema');

  // 3. and ensureSchema really does add this column
  const schema = readFileSync(new URL('../src/lib/db/schema.ts', import.meta.url), 'utf8');
  assert.match(schema, /await ensureOperationsAndLogs\(db\)/);
  const part = readFileSync(new URL('../src/lib/db/schema-parts/operations-and-logs.ts', import.meta.url), 'utf8');
  assert.match(part, /ALTER TABLE pearl_terminology_overrides ADD COLUMN IF NOT EXISTS supersedes_builtin TEXT/);
});
