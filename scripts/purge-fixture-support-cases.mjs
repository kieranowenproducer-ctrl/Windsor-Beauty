/**
 * One-off cleanup: remove fixture rows from the PRODUCTION support_cases table.
 *
 * Why this exists. The live admin panel showed "11 open cases where the team was never emailed"
 * in red for weeks. Every one was a test row written into production during build sessions on
 * 11 July and 2 August: test-guest@example.invalid, stage4test@vat.com, casey@demo.example and
 * one row with no address at all. Not one was a customer.
 *
 * The code no longer writes them (see isReservedTestAddress in src/lib/testAddress.ts) and the
 * admin figures already filter them out, but leaving them in the table means anyone querying it
 * directly gets the same wrong answer. This deletes them.
 *
 * Run:  node scripts/purge-fixture-support-cases.mjs          (dry run, shows what would go)
 *       node scripts/purge-fixture-support-cases.mjs --delete (actually deletes)
 */
import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--delete');

function readEnv(key) {
  if (process.env[key]) return process.env[key];
  for (const file of ['.env.local', '.env']) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, 'utf-8').replace(/^﻿/, '');
    const line = raw.split(/\r?\n/).find(l => l.startsWith(key + '='));
    if (line) return line.slice(key.length + 1).replace(/^["']|["']$/g, '').trim();
  }
  return null;
}

const url = readEnv('AISUPPORT_DATABASE_URL');
if (!url) {
  console.error('AISUPPORT_DATABASE_URL is not set. Nothing done.');
  process.exit(1);
}

// Kept in step with TEST_ADDRESS_SQL_PATTERNS in src/lib/testAddress.ts.
const PATTERNS = [
  '%.invalid', '%.test', '%.example', '%.localhost',
  '%@example.com', '%@example.net', '%@example.org', '%@example.edu',
  'test@%', 'test-%@%', 'test.%@%', 'test_%@%',
  'stage%test@%', 'qa@%', 'fixture%@%', 'dummy%@%', 'sample%@%',
];

/**
 * The site was behind its pre-launch wall until 29 July 2026, so a case with no contact address
 * at all created before that date cannot be a customer. After that date a null address is left
 * alone: it might be a real guest, and deleting a real person's problem to tidy a screen would be
 * a far worse mistake than leaving one stale row.
 */
const PUBLIC_LAUNCH = '2026-07-29';

const sql = neon(url, { fetchOptions: { cache: 'no-store' } });

const doomed = await sql`
  SELECT id, contact_email, status, urgency, created_at, left(summary, 70) AS summary
  FROM support_cases
  WHERE lower(contact_email) LIKE ANY(${PATTERNS})
     OR (contact_email IS NULL AND created_at < ${PUBLIC_LAUNCH})
  ORDER BY created_at DESC`;

const keeping = await sql`
  SELECT count(*)::int AS n FROM support_cases
  WHERE NOT (lower(contact_email) LIKE ANY(${PATTERNS}))
    AND NOT (contact_email IS NULL AND created_at < ${PUBLIC_LAUNCH})`;

console.log(`Fixture cases found: ${doomed.length}`);
for (const c of doomed) {
  console.log(`  ${c.created_at.toISOString?.() ?? c.created_at}  ${c.contact_email ?? '(no address)'}  [${c.status}/${c.urgency}]  ${c.summary}`);
}
console.log(`Real cases that will be kept: ${keeping[0].n}`);

if (!APPLY) {
  console.log('\nDRY RUN. Nothing deleted. Re-run with --delete to remove the rows above.');
  process.exit(0);
}

const removed = await sql`
  DELETE FROM support_cases
  WHERE lower(contact_email) LIKE ANY(${PATTERNS})
     OR (contact_email IS NULL AND created_at < ${PUBLIC_LAUNCH})
  RETURNING id`;
console.log(`\nDeleted ${removed.length} fixture case(s).`);
