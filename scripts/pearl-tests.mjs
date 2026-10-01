// Run every saved PEARL test from the command line, without writing anything.
//
//   npm run pearl:tests
//
// The saved tests live in the database (pearl_test_cases), written by the
// admin dashboard. The local credential is read-only agent_ro, so this script
// compares and reports but never stores results; storing the accepted picture
// happens through the dashboard's Run button. With no database configured it
// says so and exits cleanly, so `npm run check` works anywhere.
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { answerQuestion } from '../src/lib/concierge/research/chat-engine.mjs';
import { parseStoredResult, answerSnapshot, snapshotDifferences } from '../src/lib/concierge/research/test-snapshot.mjs';

function env(name) {
  if (process.env[name]) return process.env[name];
  for (const file of ['.env.local', '.env']) {
    try {
      const text = readFileSync(file, 'utf-8').replace(/^﻿/, '');
      for (const line of text.split(/\r?\n/)) {
        const at = line.indexOf('=');
        if (at > 0 && !line.trim().startsWith('#') && line.slice(0, at).trim() === name) {
          return line.slice(at + 1).trim();
        }
      }
    } catch { /* file absent */ }
  }
  return '';
}

/* The same shaping the live site applies to an approved terminology row
   (pearlRowToRuntimeRecord). Duplicated minimally here because that module is
   TypeScript and this script runs on plain node. */
function runtimeRecord(row) {
  const base = {
    id: `admin-${row.id}`,
    sources: [],
    confidence: row.confidence,
    reviewStatus: row.review_status,
    autoResolve: row.auto_resolve,
    enabled: row.enabled,
    lastVerified: row.last_verified || 'Not verified',
    notes: row.notes || 'Administrator-maintained terminology record.',
  };
  if (row.kind === 'blend') {
    return {
      ...base, recordType: 'blend', canonicalName: row.display_name || row.term,
      aliases: row.aliases || [], misspellings: row.misspellings || [],
      components: row.component_slugs, profileSlug: '', compositionFixed: false,
      conflicts: ['Administrator-maintained mapping.'],
    };
  }
  return {
    ...base,
    recordType: row.kind === 'ambiguous' || row.kind === 'category' ? 'ambiguous' : 'compound',
    canonicalSlug: row.canonical_slug || '',
    displayName: row.display_name || row.term,
    aliases: [...new Set([...(row.aliases || []), ...(['alias', 'ambiguous', 'category'].includes(row.kind) ? [row.term] : [])])],
    abbreviations: row.kind === 'abbreviation' ? [row.term] : [],
    misspellings: [...new Set([...(row.misspellings || []), ...(row.kind === 'misspelling' ? [row.term] : [])])],
    phoneticForms: [],
    relatedSlugs: row.related_slugs || [],
    ambiguousWith: row.ambiguous_with,
  };
}

async function main() {
  const url = env('DATABASE_URL');
  if (!url) {
    process.stdout.write('PEARL tests: no database configured here, so there are no saved tests to run. Skipping.\n');
    return;
  }
  const db = neon(url, { fetchOptions: { cache: 'no-store' } });

  let tests = [];
  let overrides = [];
  try {
    tests = await db`
      SELECT id, question, expected_outcome, status, last_result
      FROM pearl_test_cases WHERE status = 'active' ORDER BY id
    `;
    overrides = (await db`
      SELECT * FROM pearl_terminology_overrides
      WHERE review_status = 'approved' AND enabled = TRUE AND archived_at IS NULL
      ORDER BY id ASC
    `).map(runtimeRecord);
  } catch (error) {
    if (String(error?.code) === '42P01') {
      process.stdout.write('PEARL tests: the test table does not exist in this database yet. Skipping.\n');
      return;
    }
    throw error;
  }

  if (!tests.length) {
    process.stdout.write('PEARL tests: none saved yet. Add them from the Saved Tests screen in the admin dashboard.\n');
    return;
  }

  let pass = 0;
  let noPicture = 0;
  const changed = [];
  for (const test of tests) {
    const prior = parseStoredResult(test.last_result);
    const snapshot = answerSnapshot(answerQuestion(test.question, [], { overrides }));
    if (!prior) { noPicture += 1; continue; }
    const differences = snapshotDifferences(prior.snapshot, snapshot);
    if (!differences.length) { pass += 1; continue; }
    changed.push({ question: test.question, differences });
  }

  process.stdout.write(`PEARL tests: ${tests.length} saved. ${pass} unchanged, ${changed.length} changed, ${noPicture} with no recorded picture yet.\n`);
  if (noPicture) {
    process.stdout.write('A test with no picture has never been run from the dashboard. Press "Run all tests" there once to record it.\n');
  }
  for (const item of changed) {
    process.stdout.write(`\n  CHANGED  ${item.question}\n`);
    for (const line of item.differences.slice(0, 6)) process.stdout.write(`      ${line}\n`);
  }
  if (changed.length) {
    process.stdout.write('\nIf a change above was meant, run the tests from the dashboard to accept the new picture. If not, stop and look.\n');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
