// Proves a trial product's name never reaches a customer (task ae168547).
//
// Kieran: "I do not want the trial products to appear on any invoice whatsoever."
// That is a promise about four separate documents, so it is tested as one rule
// on the function all four go through, and the prices are checked to be
// untouched, because an invoice that hides the name and also breaks the sums
// would be worse than the problem.
//
// Run: npm run test:trial-anonymity
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = fs.mkdtempSync(path.join(ROOT, '.trial-anon-test-'));

let passed = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) { passed += 1; console.log(`  ok    ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

try {
  // Both files: invoiceTrialLines now reads a trial product's fixed Royal Mail reference from
  // trialRoyalMailRef (task 9e2f4a11). That module is pure arithmetic with no imports of its
  // own, so compiling the pair here keeps this test free of the database layer exactly as before.
  execFileSync(process.execPath, [
    path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
    'src/lib/invoiceTrialLines.ts',
    'src/lib/trialRoyalMailRef.ts',
    '--outDir', OUT, '--module', 'esnext', '--target', 'es2022',
    '--moduleResolution', 'bundler', '--skipLibCheck',
  ], { cwd: ROOT, stdio: 'pipe' });

  // tsc emits `from './trialRoyalMailRef'` with no extension, which Node's ESM resolver will not
  // follow. Rewrite the specifier, then rename both to .mjs so they load as modules.
  for (const name of ['invoiceTrialLines', 'trialRoyalMailRef']) {
    const js = path.join(OUT, `${name}.js`);
    let code = fs.readFileSync(js, 'utf8').replace(/(from\s+['"]\.\/trialRoyalMailRef)(['"])/g, '$1.mjs$2');
    fs.writeFileSync(js.replace(/\.js$/, '.mjs'), code);
    fs.rmSync(js);
  }
  const asMjs = path.join(OUT, 'invoiceTrialLines.mjs');
  const { anonymiseTrialLines, isTrialLine, hasTrialLines } = await import(pathToFileURL(asMjs).href);

  // A saved trial invoice keeps the product's fixed code, including the
  // sequence-assigned codes used for new trial products.
  const lines = [
    { type: 'trial', slug: 'trial:8', name: '501', description: '501mg',
      quantity: 1, unitPrice: 45, discount: 3, lineTotal: 42, batchCodes: ['B-1234'] },
    { type: 'product', slug: 'retatrutide', name: 'Retatrutide', description: '10mg',
      quantity: 2, unitPrice: 100, discount: 0, lineTotal: 200 },
    { type: 'trial', slug: 'trial:13', name: 'ANADR 50MG 60S', description: '50MG',
      quantity: 1, unitPrice: 35, discount: 0, lineTotal: 35 },
    { type: 'custom', name: 'Pens customised', quantity: 1, unitPrice: 10, discount: 0, lineTotal: 10 },
  ];

  const out = anonymiseTrialLines(lines);
  const asText = JSON.stringify(out);

  console.log('\nTrial example: 501 at £45 with £3 off');
  check('its permanent code is used on the invoice and dispatch', out[0].name === 'Product 207' && out[0].fulfilmentRef === out[0].name, out[0].name);
  check('the price is still £45', out[0].unitPrice === 45);
  check('the discount is still £3', out[0].discount === 3);
  check('the line total is still £42', out[0].lineTotal === 42);
  check('the quantity is untouched', out[0].quantity === 1);

  console.log('\nNothing that names the product survives');
  check('the name is gone', !asText.includes('501') || !out.some(i => i.name === '501'));
  check('the second trial name is gone', !asText.includes('ANADR'));
  check('the dosage is gone', !asText.includes('50MG') && !asText.includes('501mg'));
  check('the batch code is gone', !asText.includes('B-1234'));
  check('the trial reference is gone', !asText.includes('trial:'));

  console.log('\nEverything else is left completely alone');
  check('a catalogue product keeps its name', out[1].name === 'Retatrutide');
  check('and its dosage', out[1].description === '10mg');
  check('and its price', out[1].unitPrice === 100 && out[1].lineTotal === 200);
  check('a bespoke line keeps its name', out[3].name === 'Pens customised');

  console.log('\nPermanent references');
  check('the second trial has its own fixed code', out[2].name === 'Product 892' && out[2].fulfilmentRef === out[2].name, out[2].name);
  const savedNew = anonymiseTrialLines([{ type: 'trial', slug: 'trial:900', name: 'private name', fulfilmentRef: 'Product 909', quantity: 1, unitPrice: 1, discount: 0, lineTotal: 1 }]);
  check('a new sequence-assigned code survives', savedNew[0].name === 'Product 909' && savedNew[0].slug === undefined);
  const repeated = anonymiseTrialLines([lines[0], lines[0]]);
  check('the same product keeps one code on both lines', repeated[0].name === repeated[1].name);
  const oldPositional = anonymiseTrialLines([{ type: 'trial', slug: 'trial:8', name: 'Product 1' }]);
  check('an old per-invoice label cannot override the permanent code', oldPositional[0].name === 'Product 207');
  let blockedMissingCode = false;
  try { anonymiseTrialLines([{ type: 'trial', name: 'private name' }]); }
  catch { blockedMissingCode = true; }
  check('a Trial line without an ID or saved code cannot leave', blockedMissingCode);
  let blockedOutOfRange = false;
  try { anonymiseTrialLines([{ type: 'trial', slug: 'trial:900', name: 'private name' }]); }
  catch { blockedOutOfRange = true; }
  check('a new Trial ID cannot fall back to a colliding old code', blockedOutOfRange);

  console.log('\nRecognising a trial line');
  check('by its type', isTrialLine({ type: 'trial' }));
  check('or by its reference, if the type was lost', isTrialLine({ type: 'custom', slug: 'trial:8' }));
  check('a normal product is not one', !isTrialLine({ type: 'product', slug: 'retatrutide' }));
  check('an invoice with a trial line is spotted', hasTrialLines(lines));
  check('one without is not', !hasTrialLines([lines[1], lines[3]]));

  console.log('\nThe sums still add up');
  const before = lines.reduce((t, i) => t + i.lineTotal, 0);
  const after = out.reduce((t, i) => t + i.lineTotal, 0);
  check(`the invoice total is unchanged (£${before})`, before === after, `£${before} vs £${after}`);
} finally {
  fs.rmSync(OUT, { recursive: true, force: true });
}

console.log(`\n  ${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  console.error('  Failed: ' + failures.join(', ') + '\n');
  process.exit(1);
}
console.log('  A trial product shows as a number and a price, and nothing else.\n');
