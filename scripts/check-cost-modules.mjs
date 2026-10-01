// The shared cost modules in this app must be the same modules the social engine has.
//
//   node scripts/check-cost-modules.mjs
//
// WHY THIS EXISTS, AND IT IS NOT HYPOTHETICAL. Before 2026-08-02 this app and the social engine
// each kept their own table of model prices. Both were real published rates. They disagreed about
// Sonnet 5 by fifty percent, had done for weeks, and nothing anywhere compared them, so the same
// model cost two different amounts depending on which screen you looked at.
//
// The fix was one pricing module and one ledger, copied rather than packaged, because the two
// apps are separate deployments in separate repositories with no shared dependency. A copy that
// nothing checks is just the old problem with extra steps. This is the check.
//
// If it fails: the social engine's copy is the original. Copy it here, do not edit it here.
//
// LINE ENDINGS ARE NORMALISED BEFORE COMPARING, AND THAT IS THE POINT OF THIS PARAGRAPH.
// It used to hash the raw bytes. The two files live in two repositories that disagree about line
// endings: the workspace repo has core.autocrlf off and stores this file with CRLF, while this
// app's .gitattributes says `src/lib/costs/* text eol=lf`. So a correct copy became a reported
// drift the moment it was committed, every single time, and the fix for the phantom was to copy
// the file again, which changed nothing. Twice now that noise has sat on top of a REAL difference
// and made it look like the same old false alarm. A newline is not a behaviour, so it is not
// drift. Anything a compiler would notice still is: normalising \r\n cannot hide a change to a
// line's content.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

/** Where the originals live, relative to this app. Overridable for a different checkout layout. */
const SOURCE = process.env.COST_MODULE_SOURCE ?? resolve(
  process.cwd(),
  '../../../../03_Kierans-Media-Generator/projects/social-engine/src/lib/costs',
);

const SHARED = ['pricing.ts', 'ledger.ts', 'period.ts'];

/* Read as text and settle the line endings first. See the note at the top of this file for why
 * that is honest rather than lenient. A byte-order mark goes too: it is invisible, it is not code,
 * and an editor adding one on one side is the same phantom in a different coat. */
const digest = (path) => createHash('sha256')
  .update(readFileSync(path, 'utf-8').replace(/^﻿/, '').replace(/\r\n/g, '\n'))
  .digest('hex');

console.log('\n  SHARED COST MODULES\n');

if (!existsSync(SOURCE)) {
  // Not a failure. The engine is a separate repository and will not always be checked out beside
  // this one, and refusing to build the shop because of that would be absurd. Saying so is the
  // point: a check that quietly passes when it cannot see the thing it checks is worse than none.
  console.log(`  Cannot see the social engine at ${SOURCE}, so nothing was compared.`);
  console.log('  Set COST_MODULE_SOURCE if it lives elsewhere. Not treated as a failure.\n');
  process.exit(0);
}

let drifted = 0;
for (const file of SHARED) {
  const mine = join(process.cwd(), 'src/lib/costs', file);
  const theirs = join(SOURCE, file);
  if (!existsSync(mine)) {
    console.log(`  MISSING  ${file} is not in this app at all`);
    drifted += 1;
    continue;
  }
  if (!existsSync(theirs)) {
    console.log(`  MISSING  ${file} is not in the social engine`);
    drifted += 1;
    continue;
  }
  if (digest(mine) === digest(theirs)) {
    console.log(`  same     ${file}`);
  } else {
    console.log(`  DRIFTED  ${file} differs from the social engine's copy`);
    drifted += 1;
  }
}

/* The one file that is meant to differ. `record.ts` is this app's binding: it supplies the
 * connection and the defaults, and it is deliberately NOT shared, because the two apps spend on
 * different things. Named here so its absence from the list above is obviously intentional. */
console.log('\n  record.ts is this app\'s own binding and is not compared.');

/* ── Nothing about money reaches a customer ────────────────────────────────
 *
 * Read out of the source rather than trusted. The concierge computes a cost on every turn and
 * writes it to the database, and the response object is assembled a few lines away from that
 * figure, so the two are one careless edit apart for ever. This is the check that notices.
 *
 * It reads the object literal returned to the browser and asserts that no money-shaped field is
 * in it. A regex over source is a blunt instrument, and it is the right one here: the alternative
 * is running the whole concierge against a live model to inspect one response. */
console.log('\n  WHAT A CUSTOMER CAN SEE\n');

const CUSTOMER_ROUTES = [
  'src/app/api/account/concierge/route.ts',
  'src/app/api/support/chat/route.ts',
];
const MONEY_FIELDS = /\b(cost|costUsd|cost_usd|costPence|cost_pence|tokens|usage|pence|spend)\s*[,:]/;

let leaked = 0;
for (const route of CUSTOMER_ROUTES) {
  const path = join(process.cwd(), route);
  if (!existsSync(path)) { console.log(`  ..       ${route} is not in this app`); continue; }
  const source = readFileSync(path, 'utf-8');

  /* Only the object handed to NextResponse.json is examined. Writing a cost to the database in
   * the same file is correct and expected; putting one in the reply is not. */
  const replies = [...source.matchAll(/NextResponse\.json\(\s*\{([\s\S]*?)\}\s*[,)]/g)]
    .map((m) => m[1])
    // A `sql` template inside the match would be a false positive; the reply objects have none.
    .filter((body) => !/INSERT|UPDATE|SELECT/i.test(body));

  const offending = replies.filter((body) => MONEY_FIELDS.test(body));
  if (offending.length) {
    leaked += 1;
    console.log(`  LEAK     ${route} returns a money field to the browser`);
    console.log(`           ${offending[0].trim().slice(0, 120).replace(/\s+/g, ' ')}`);
  } else {
    console.log(`  ok       ${route} returns nothing about money`);
  }
}

if (drifted || leaked) {
  if (drifted) {
    console.log(`\n  ${drifted} shared module(s) have drifted. The social engine's copy is the`);
    console.log('  original: copy it here rather than editing this side.');
  }
  if (leaked) {
    console.log(`\n  ${leaked} customer-facing route(s) return cost information. Customers must `);
    console.log('  never see what an answer cost us. Remove the field from the response.');
  }
  console.log('');
  process.exit(1);
}
console.log('\n  Shared modules match the social engine, and no customer route leaks a cost.\n');
