// The entry gate asks two things, not three, and both sign-up routes still check all three booleans.
//
//   npm run test:compliance-boxes
//
// Samuel, 10 September 2026: "This disclaimer no longer exists at the beginning as Kieran has
// switched it off. Please make it go live again. However, combine the second box and the third box
// together so it reads 'I confirm I am over the age of 18 and will use this website lawfully and
// responsibly.' Keep everything else the same."
//
// THE THING THIS FILE IS REALLY GUARDING. Two boxes now cover three server-side booleans, and the
// dangerous version of that change is the one where a box says two things and quietly records one.
// A person would tick a sentence about being over 18 and using the site lawfully, and the account
// record would say they never confirmed the second half. So this proves the sentence and the
// booleans behind it match, in the wording Samuel gave, and that the routes still refuse an
// account unless all three are true.
//
// THE GATE ITSELF IS OFF while ads are running (Samuel, same day: "Keep the gate switched off for
// the meantime as we are still advertising"). This file says which state it is in on every run
// rather than assuming one, because believing a compliance control is up when it is down is how it
// sat off for a fortnight in August without anybody noticing.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  COMPLIANCE_CONFIRMATIONS,
  COMPLIANCE_CHECK_LABELS,
  COMPLIANCE_KEYS,
  COMPLIANCE_CONFIRMATIONS_ERROR,
  CHECKOUT_CONFIRMATIONS,
  CHECKOUT_CONFIRMATIONS_ERROR,
} from '../src/lib/complianceConfirmations.ts';

const ROOT = fileURLToPath(new URL('../src/', import.meta.url));

/* Two boxes, in the order Kieran set: research use first, because it carries the weight. */
assert.equal(COMPLIANCE_CONFIRMATIONS.length, 2, 'two boxes, not three and not one');
assert.equal(
  COMPLIANCE_CHECK_LABELS[0],
  'I understand these products are not for human consumption and are intended for research purposes only.',
  'the research-use statement is unchanged and still first',
);
assert.equal(
  COMPLIANCE_CHECK_LABELS[1],
  'I confirm I am over the age of 18 and will use this website lawfully and responsibly.',
  'the combined statement is word for word what Samuel asked for',
);

/* Nothing was dropped when two sentences became one. */
assert.deepEqual(
  [...COMPLIANCE_KEYS].sort(),
  ['ageConfirmed', 'lawfulUseConfirmed', 'researchUseConfirmed'],
  'all three booleans are still covered by a box somebody actually reads',
);
assert.deepEqual([...COMPLIANCE_CONFIRMATIONS[1].keys].sort(), ['ageConfirmed', 'lawfulUseConfirmed'],
  'the combined box answers for BOTH of the statements it merged');

/* The error names what the boxes say. Telling somebody they failed to confirm a statement that
   is not on the screen is the failure this list exists to prevent. */
assert.match(COMPLIANCE_CONFIRMATIONS_ERROR, /both statements/i);
assert.match(COMPLIANCE_CONFIRMATIONS_ERROR, /over the age of 18 and will use this website lawfully/i);
assert.doesNotMatch(COMPLIANCE_CONFIRMATIONS_ERROR, /all three statements/i);

/* WHICH STATE THE GATE IS IN, SAID OUT LOUD RATHER THAN ASSUMED.
 *
 * Samuel asked for the gate back on 10 September and then, the same day: "Keep the gate switched
 * off for the meantime as we are still advertising." So it is OFF on purpose, and the wording
 * above is what a visitor WILL see the moment somebody flips one line in SiteChrome.tsx.
 *
 * This is checked rather than ignored because the danger runs both ways. A team that thinks the
 * gate is up when it is down believes a compliance control is protecting them that is not, which
 * is how it sat off for a fortnight in August without anybody noticing. So the state is printed on
 * every run: nobody has to read a comment to find out. */
const chrome = await readFile(ROOT + 'components/SiteChrome.tsx', 'utf8');
const gateOff = /const TEMPORARILY_BYPASS_ENTRY_GATE = true;/.test(chrome);
assert.match(chrome, /const TEMPORARILY_BYPASS_ENTRY_GATE = (true|false);/,
  'the entry gate switch has been renamed or removed');
console.log(gateOff
  ? '  NOTE: the entry gate is currently OFF, by Samuel\'s instruction of 10 September while ads are\n'
    + '        running. Nobody visiting the site is asked to confirm anything. The two statements\n'
    + '        below are what returns the moment it is switched back on.'
  : '  NOTE: the entry gate is currently ON. Every visitor confirms the two statements below.');

/* The server still refuses an account unless all three are true, whichever box carried them. */
for (const route of ['app/api/account/register/route.ts', 'app/api/launch/subscribe/route.ts']) {
  const source = await readFile(ROOT + route, 'utf8');
  assert.match(source, /!ageConfirmed \|\| !researchUseConfirmed \|\| !lawfulUseConfirmed/,
    `${route} no longer checks all three booleans`);
}

/* Both screens read from the one list rather than writing their own copy of it. */
const gate = await readFile(ROOT + 'components/EntryGate.tsx', 'utf8');
assert.match(gate, /COMPLIANCE_CHECK_LABELS/, 'the entry gate writes its own boxes again');
const form = await readFile(ROOT + 'components/MemberRegistrationForm.tsx', 'utf8');
assert.match(form, /COMPLIANCE_CONFIRMATIONS/, 'the sign-up form writes its own boxes again');
assert.doesNotMatch(form, /all three confirmations/i, 'the form still says "all three" to the person');

/* The terms step is untouched: "keep everything else the same". */
assert.match(gate, /Please review our Terms &amp; Conditions before entering/);
assert.match(gate, /Enter Website/);

/* ── The last thing somebody ticks before they pay (Samuel, 10 September 2026) ────────────────
 *
 * "When a customer checked out before payment add a box similar to state 'I confirm I am over the
 * age 18 and any items bought are not for human consumption and for research purposes only' and
 * the terms and conditions that they have to confirms they have read and adhere to."
 */
assert.equal(CHECKOUT_CONFIRMATIONS.length, 2, 'checkout asks two things before payment');
assert.equal(
  CHECKOUT_CONFIRMATIONS[0].label,
  'I confirm I am over the age of 18, and that any items bought are not for human consumption and '
  + 'are for research purposes only.',
);
assert.equal(
  CHECKOUT_CONFIRMATIONS[1].label,
  'I confirm I have read the Windsor Beauty Terms & Conditions and will adhere to them.',
);
assert.match(CHECKOUT_CONFIRMATIONS[1].label, /adhere to/, 'the Terms box must say adhere, not just agree');
assert.equal(CHECKOUT_CONFIRMATIONS[1].link?.href, '/terms', 'the Terms have to be openable');

const checkout = await readFile(ROOT + 'app/checkout/page.tsx', 'utf8');
assert.match(checkout, /CHECKOUT_CONFIRMATIONS/, 'checkout writes its own wording again');
assert.match(checkout, /disabled=\{placingOrder \|\| !allConfirmed\}/,
  'the Pay button no longer waits for BOTH confirmations');
assert.match(checkout, /allConfirmed = CHECKOUT_CONFIRMATIONS\.every/,
  'allConfirmed must be derived from the list, so adding a box automatically gates payment');

/* THE LINK IS OUTSIDE THE TICKABLE SENTENCE, and this is not cosmetic.
 *
 * Inline, the whole sentence toggled the box AND part of it was a link, so a customer aiming at
 * the words "Terms & Conditions" got a new tab and no tick, came back to a Pay button that was
 * still grey, and had nothing telling them why. Measured on a real browser: clicking the middle of
 * that sentence opened a tab and left the box empty every time. */
assert.doesNotMatch(checkout, /<span[^>]*>\s*\{[\s\S]{0,200}link\.text[\s\S]{0,200}<\/span>/,
  'the Terms link has been put back inside the sentence that ticks the box');
assert.match(checkout, /Read the \{link\.text\}/, 'the Terms link should be its own separate target');

/* Why the Pay button is grey has to be on the screen. A dead button with no explanation is the
   thing people email about. */
assert.match(checkout, /CHECKOUT_CONFIRMATIONS_ERROR/,
  'nothing on screen says why the Pay button is locked');
assert.match(CHECKOUT_CONFIRMATIONS_ERROR, /confirm both statements/i);

console.log(`Compliance box checks passed: two statements, all three confirmations recorded, gate currently ${gateOff ? 'OFF' : 'ON'}.
  Checkout asks for both confirmations before the Pay button unlocks.`);
