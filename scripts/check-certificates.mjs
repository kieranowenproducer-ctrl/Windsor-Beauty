/**
 * Can the shop show a certificate for everything it says it has one for?
 *
 *   npm run check:certificates          the live catalogue, read-only
 *   npm run check:certificates -- --images   also fetch every external image and prove it loads
 *
 * WHY THIS EXISTS. A certificate of analysis is the one document on this site a customer is
 * entitled to take literally, and it is the only thing here with a real compliance boundary
 * around it: the measured values on it are somebody's laboratory measurement of a specific batch,
 * and nobody, ever, fills one in to make a page look finished.
 *
 * The risk is not that a wrong number gets typed. It is quieter than that. A product page badges
 * "CoA Included" and lists "Certificate of analysis included with every order" unconditionally,
 * for every product, whether or not the shop holds one. On 10 August 2026 that was true of BAC
 * Water and Acetic Acid: both claimed a certificate on the page and neither had one to show. The
 * claim is one line of markup and the certificate is a database row, so the two drift apart in
 * silence and the page keeps promising.
 *
 * WHAT COUNTS AS A REAL CERTIFICATE, because it took a wrong turn to learn there are two kinds:
 *
 *   typed     the fields on the page. Chemistry, test rows, batch, date. Complete when the
 *             measured values are filled in.
 *   external  `mode: 'external'` with `externalImages`: the SUPPLIER'S OWN scanned certificate,
 *             shown as pictures. There is nothing to type and its typed fields being empty is not
 *             a gap. A first pass at this check read only the typed fields, called two perfectly
 *             healthy Remedium Research pens empty, and came within one command of switching off
 *             two working certificates. Hence this paragraph, and hence --images: for these the
 *             only question worth asking is whether the picture still loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, mergeProducts, activeVariants, certificateForDosage } from '@/data/products';

/* This app's scripts are run by hand rather than by a framework, so nothing has loaded the env
 * file for us. Without the database this check would read the static catalogue only, miss every
 * admin edit, and pass on a shop it has not actually looked at. */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(path.join(root, file), 'utf-8').replace(/^﻿/, '').split(/\r?\n/)) {
      const at = line.indexOf('=');
      if (at > 0 && !line.trim().startsWith('#') && !process.env[line.slice(0, at).trim()]) {
        process.env[line.slice(0, at).trim()] = line.slice(at + 1).trim();
      }
    }
  } catch { /* next */ }
}

/* The database module reads its connection string once, at import, into a module constant. A
 * static `import` would therefore be hoisted above the env loading just done and see nothing, and
 * this check would announce that no database is configured while sitting next to the file that
 * configures it. So it is imported here, after. */
const { isDbConfigured, listCustomProducts, getHiddenProductSlugs } = await import('@/lib/db');

const CHECK_IMAGES = process.argv.includes('--images');

/** The values only a laboratory can supply, and the ones this repo never writes. */
const MEASURED = ['purity', 'content', 'appearance', 'batch', 'lot', 'test date', 'date of'];
const isMeasured = (label) => MEASURED.some((m) => String(label).toLowerCase().includes(m));

const failures = [];
/** True findings that are waiting on a decision rather than a fix. Printed, counted, not fatal. */
const worthALook = [];
const notes = [];
let checked = 0;

function ok(condition, message) {
  checked += 1;
  if (!condition) failures.push(message);
}

console.log('\n  CERTIFICATES THE SHOP CAN ACTUALLY SHOW\n');

if (!isDbConfigured()) {
  console.log('  No database configured, so only the static catalogue could be read. Admin edits,');
  console.log('  admin-created products and hidden products are all invisible from here, and this');
  console.log('  check is about exactly those. Set DATABASE_URL. Not treated as a pass.\n');
  process.exit(1);
}

const overrides = await listCustomProducts();
const hidden = new Set(await getHiddenProductSlugs());
const live = mergeProducts(PRODUCTS, overrides).filter((p) => !hidden.has(p.slug));

const externalImages = [];
let typed = 0; let external = 0; let noCertificate = 0;

for (const product of live) {
  const claimsCoa = !(product.hiddenSpecs ?? []).includes('coa');

  for (const variant of activeVariants(product)) {
    const where = `${product.name} ${variant.dosage}`;
    const cert = certificateForDosage(product, variant.dosage);
    const shown = Boolean(cert?.enabled);

    /* THE ONE THAT MATTERS. The page says a certificate comes with the order; the shop must be
     * able to produce it. Either fix is fine and both are the admin's, not the code's: load the
     * certificate, or turn the CoA row off for that product. */
    if (!shown) {
      noCertificate += 1;
      ok(!claimsCoa,
        `${where} promises "CoA Included" and a certificate with every order, and there is no `
        + 'certificate behind it. Either load one, or hide the CoA row for this product in the '
        + 'admin, which now removes the badge as well.');
      continue;
    }

    if (cert.mode === 'external') {
      const images = cert.externalImages ?? [];
      external += 1;
      ok(images.length > 0,
        `${where} shows a certificate button set to the supplier's own images and has no images. `
        + 'A customer pressing it gets nothing.');
      for (const url of images) externalImages.push({ where, url });
      continue;
    }

    typed += 1;
    const tests = cert.testRows ?? [];
    const summary = cert.verificationSummary ?? [];
    ok(tests.length > 0 || summary.length > 0,
      `${where} shows a certificate button and the certificate is completely empty.`);

    /* Blank measured values are not a fault to fix here. They are a fault to REPORT, because the
     * only correct hand is Kieran's or the supplier's, and a blank one on a public page is a
     * document that looks official and measures nothing. */
    const blank = [
      ...tests.filter((r) => isMeasured(r.test) && !String(r.result ?? '').trim()).map((r) => r.test),
      ...summary.filter((r) => isMeasured(r.label) && !String(r.value ?? '').trim()).map((r) => r.label),
    ];
    ok(blank.length === 0,
      `${where} is public with no ${blank.join(', ')} on it. Those are laboratory measurements: `
      + 'nobody here fills them in, so either the real figures go in or the certificate comes down.');

    ok(String(cert.certificateId ?? '').trim().length > 0,
      `${where} has a certificate with no certificate number on it.`);

    /* IS THIS CERTIFICATE EVEN ABOUT THIS DOSE.
     *
     * A dose with no certificate of its own falls back to the product's, which is correct and is
     * how most of the catalogue works. It stops being obviously correct when the fallback document
     * is about a different strength. MOTS-c 20mg was found by eye on 10 August 2026: it inherits a
     * certificate whose Content specification reads "10mg (reference batch)", so somebody buying
     * 20mg is shown a report on a 10mg batch.
     *
     * RAISED, NOT FAILED, AND THE DIFFERENCE IS A DECISION KIERAN HAS NOT BEEN ASKED FOR. The
     * words "reference batch" suggest this is deliberate: one representative batch documented for
     * the compound. If that is the policy these are fine and the disclosure could be plainer; if
     * it is not, they are five products showing the wrong document. Failing the run on a policy
     * nobody has stated would make this check noise, and a noisy check gets switched off. So they
     * are counted and named as loudly as a failure, and the run still passes. One line below turns
     * them into failures the day he says they should be.
     *
     * Deliberately narrow: one milligram figure on each side or it says nothing. A combination pen
     * reading "40mg + 4mg" against a dose of "40/4mg" is not a mismatch, and the first version of
     * this check reported it as one. */
    const spec = tests.find((r) => /content/i.test(r.test))?.specification ?? '';
    const specMg = spec.match(/([\d.]+)\s*mg/gi) ?? [];
    const doseMg = String(variant.dosage).match(/([\d.]+)\s*mg/gi) ?? [];
    if (specMg.length === 1 && doseMg.length === 1) {
      const written = parseFloat(specMg[0]);
      const sold = parseFloat(doseMg[0]);
      if (written !== sold) {
        worthALook.push(`${where} shows a certificate written for ${written}mg. Either give this `
          + 'dose its own certificate, or say on the page which batch the document covers.');
      }
    }
  }
}

/* Certificate numbers must be unique, or two products point at one document. */
const seen = new Map();
for (const product of live) {
  for (const variant of activeVariants(product)) {
    const cert = certificateForDosage(product, variant.dosage);
    const id = String(cert?.certificateId ?? '').trim();
    if (!cert?.enabled || !id) continue;
    const owner = `${product.name} ${variant.dosage}`;
    if (seen.has(id) && seen.get(id) !== owner) {
      ok(false, `Certificate number ${id} is on two different products: ${seen.get(id)} and ${owner}.`);
    }
    seen.set(id, owner);
  }
}

/* NOBODY ELSE'S NAME ON A WINDSOR BEAUTY CERTIFICATE.
 *
 * Task de7e8496, 14 August 2026. Kieran found another peptide company printed on
 * a certificate a member can open. It was the Tesamorelin 10mg certificate,
 * which carried a "Customer: Key Peptides" line in its verification summary —
 * the supplier's own lab paperwork, typed in wholesale, including the line that
 * says who the lab tested it for. A second certificate was numbered KP-GH420
 * instead of WB-, carrying the same supplier's initials.
 *
 * Certificates are typed in through the admin panel, so nothing in the code
 * stops it happening again. This does. Two rules:
 *
 *   1. A certificate must not carry a "customer", "client", "supplier" or
 *      "manufacturer" line at all. A Windsor Beauty certificate is Windsor Beauty's
 *      own document; whoever the lab originally tested for is not the customer's
 *      business and naming a rival on it damages the brand.
 *   2. Certificate numbers start WB-. That is what makes them Windsor Beauty's.
 *
 * NOTE ON WHAT THIS DOES NOT TOUCH: it never looks at a purity, a content
 * figure, a batch or a date. Removing a supplier's name changes no measured
 * value, which is why it is safe to enforce automatically. Lab values remain
 * Kieran's alone.
 */
const WHOSE_DOCUMENT = /^(customer|client|supplier|manufacturer|distributor|prepared for|tested for|sold to)\b/i;

// Someone else's web address written into a certificate value. This is what
// Kieran actually saw: the Tesamorelin 20mg Content row read
// "5mg (reference batch, peptide-warehouse.com)" — a rival's domain, printed
// under the Content heading on a Windsor Beauty certificate.
const SOMEONE_ELSES_SITE = /\b([a-z0-9][a-z0-9-]*\.)+(com|co\.uk|net|org|io|shop|store|eu|us)\b/i;
// Matches both "windsorbeauty.co.uk" and "Windsor Beauty" — the domain check and the
// "is this our own name" check use the same idea of us.
const OUR_OWN = /windsor\s*glow/i;

for (const product of live) {
  const rowsSeen = new Set();
  for (const variant of activeVariants(product)) {
    const cert = certificateForDosage(product, variant.dosage);
    if (!cert?.enabled) continue;
    // Fingerprint on the CONTENT, not the certificate number. Tesamorelin 10mg
    // and 20mg share the number WB-CB438 but their Content rows differ, and it
    // was the 20mg row that named the rival — deduplicating by number skipped
    // the very row this check exists to catch.
    const fingerprint = JSON.stringify(cert);
    if (rowsSeen.has(fingerprint)) continue;
    rowsSeen.add(fingerprint);
    const where = `${product.name} ${variant.dosage}`.trim();

    for (const row of cert.verificationSummary ?? []) {
      // A "Customer" line is only a problem when it names SOMEBODY ELSE.
      // "Customer: Windsor Beauty" is true and belongs there. The first version of
      // this rule refused the line itself, so the day the certificates were
      // corrected to say Windsor Beauty it started failing on the right answer —
      // and a check that cries wolf on correct data is one nobody runs twice.
      const value = String(row.value ?? '').trim();
      if (WHOSE_DOCUMENT.test(String(row.label ?? '').trim()) && !OUR_OWN.test(value)) {
        ok(false, `${where}: its certificate has a "${row.label}" line saying "${value}". `
          + 'That names somebody other than Windsor Beauty on a Windsor Beauty document. '
          + 'Remove the row in Admin > Certificates, or correct it to Windsor Beauty.');
      }
    }

    // Every readable value on the certificate, whatever section it sits in.
    const everyValue = [
      ...(cert.testRows ?? []).flatMap((r) => [r.test, r.specification, r.result]),
      ...(cert.verificationSummary ?? []).flatMap((r) => [r.label, r.value]),
      ...(cert.analyticalResults ?? []).flatMap((r) => [r.label, r.value]),
      cert.productName, cert.storage, cert.caution,
    ].filter(Boolean).map(String);

    for (const value of everyValue) {
      const site = value.match(SOMEONE_ELSES_SITE);
      if (site && !OUR_OWN.test(site[0])) {
        ok(false, `${where}: its certificate says "${value}". That prints another company's `
          + `website (${site[0]}) on a Windsor Beauty certificate. Remove it in Admin > Certificates.`);
      }
    }

    const id = String(cert.certificateId ?? '').trim();
    if (id && !/^WB-/i.test(id)) {
      ok(false, `${where}: its certificate number is "${id}", which is not a Windsor Beauty number. `
        + 'Every certificate number starts WB-. Renumber it in Admin > Certificates.');
    }
  }
}

if (CHECK_IMAGES) {
  for (const { where, url } of externalImages) {
    try {
      const res = await fetch(url, { method: 'GET' });
      ok(res.ok && Number(res.headers.get('content-length') ?? 1) > 0,
        `${where}: its certificate image answered ${res.status}. The button opens a broken picture.`);
    } catch (error) {
      ok(false, `${where}: its certificate image could not be fetched (${error.message}).`);
    }
  }
  notes.push(`fetched ${externalImages.length} supplier certificate images.`);
} else if (externalImages.length) {
  notes.push(`${externalImages.length} supplier images not fetched. Run with --images to prove they load.`);
}

console.log(`  ${live.length} live products, ${typed + external + noCertificate} product and dosage rows`);
console.log(`  ${typed} typed out in full, ${external} shown as the supplier's own scan, `
  + `${noCertificate} with no certificate button`);
for (const note of notes) console.log(`  ..    ${note}`);

if (worthALook.length) {
  console.log(`\n  ${worthALook.length} certificates are for a different strength from the dose `
    + 'they sit on.');
  console.log('  Printed rather than failed: "reference batch" wording suggests this may be '
    + 'deliberate,\n  and that is Kieran\'s call, not this script\'s. Turn these into failures the '
    + 'day he says so.\n');
  for (const line of worthALook) console.log(`  LOOK  ${line}\n`);
}

if (failures.length) {
  console.log(`\n  ${failures.length} of ${checked} checks FAILED:\n`);
  for (const line of failures) console.log(`  FAIL  ${line}\n`);
  process.exit(1);
}
console.log(`\n  All ${checked} checks pass.\n`);
