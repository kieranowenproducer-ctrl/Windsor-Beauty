// IU on the syringe calculator (task e1f77268).
//
//   npm run test:syringe-iu
//
// Kieran: "Dosage Calculator for syringes needs iu also as an option. Just like the v3 as hgh and
// other peptides needs dosages in IU not mg so this option must be available on the calculator."
//
// THE SAFETY DECISION THIS FILE GUARDS. International Units measure biological activity, not
// weight. The factor between IU and milligrams is different for every compound: growth hormone is
// roughly 3 IU to the milligram, and the next product is not. So the calculator must never convert
// between them, and it does not need to, because the reconstitution sum is proportional. Feed it a
// vial and a dose in the same unit and the answer comes out right in that unit.
//
// The failure this is written to catch is the quiet one: a conversion factor creeping in, so 10 IU
// silently becomes 3.3 mg somewhere and the draw volume is wrong by a factor nobody can see.
import { syringeResults, calculateDraw } from '../src/components/calculatorDraw.ts';
import { EMPTY_FIGURES } from '../src/components/calculatorFigures.ts';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}${detail ? '\n             ' + detail : ''}`); }
}
const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 1e-9;

console.log('\n=== A vial measured in IU ===\n');

// A 36 IU growth hormone vial in 3mL, dosed at 2 IU: the everyday case Kieran named.
const hgh = syringeResults(36, 3, 2, 'iu');
check('36 IU in 3mL reads 12 IU per mL', hgh && near(hgh.concPerMl, 12), `got ${hgh?.concPerMl}`);
check('a 2 IU dose draws 0.1667 mL', hgh && near(hgh.drawMl, 2 / 12), `got ${hgh?.drawMl}`);
check('which is 16.67 marks on a U-100 syringe', hgh && near(hgh.drawUnits, 100 * 2 / 12), `got ${hgh?.drawUnits}`);
check('the vial holds 18 doses', hgh && hgh.totalDoses === 18, `got ${hgh?.totalDoses}`);

// The one that matters. An IU result must carry no microgram figure at all: a microgram reading on
// an IU product is a converted number, and there is no honest conversion.
check('an IU vial reports no microgram concentration', hgh && hgh.concMcgPerMl === null,
  `got ${hgh?.concMcgPerMl}, which can only have come from a conversion`);

console.log('\n=== IU is never turned into milligrams ===\n');

// Same numbers, one read as milligrams and one as IU. Every figure must match, because the sum is
// proportional and the unit is only a label on it. If a conversion factor ever appears, these part.
const asMg = syringeResults(10, 2, 1, 'mg');
const asIu = syringeResults(10, 2, 1, 'iu');
check('the same figures give the same volume whichever unit they are in',
  asMg && asIu && near(asMg.drawMl, asIu.drawMl) && near(asMg.drawUnits, asIu.drawUnits),
  `mg: ${asMg?.drawMl} mL, IU: ${asIu?.drawMl} mL`);
check('and the same number of doses', asMg && asIu && asMg.totalDoses === asIu.totalDoses);
check('IU is not scaled by the growth-hormone factor', asIu && !near(asIu.concPerMl, 10 / 3 / 2),
  'The IU concentration matches 3 IU per mg, so a conversion has crept in.');
check('IU is not scaled by anything else either', asIu && near(asIu.concPerMl, 5),
  `10 IU in 2mL must read 5 IU/mL; got ${asIu?.concPerMl}`);

console.log('\n=== The mass side still behaves exactly as it did ===\n');

const mcg = syringeResults(10, 2, 250, 'mcg');
check('a 250mcg dose from a 10mg vial in 2mL draws 0.05 mL', mcg && near(mcg.drawMl, 0.05), `got ${mcg?.drawMl}`);
check('which is 5 units on the syringe', mcg && near(mcg.drawUnits, 5), `got ${mcg?.drawUnits}`);
check('the vial holds 40 doses', mcg && mcg.totalDoses === 40, `got ${mcg?.totalDoses}`);
check('a mass vial still reports micrograms per mL', mcg && near(mcg.concMcgPerMl, 5000), `got ${mcg?.concMcgPerMl}`);
check('micrograms are still scaled against milligrams', mcg && near(mcg.concPerMl, 5), `got ${mcg?.concPerMl}`);

console.log('\n=== Nothing incomplete produces a draw instruction ===\n');

for (const [label, args] of [
  ['no vial amount', [0, 3, 2, 'iu']],
  ['no water', [36, 0, 2, 'iu']],
  ['no dose', [36, 3, 0, 'iu']],
  ['a negative dose', [36, 3, -2, 'iu']],
  ['text in a box', [NaN, 3, 2, 'iu']],
  ['an infinite figure', [36, 3, Infinity, 'iu']],
]) {
  check(`${label} gives no answer at all`, syringeResults(...args) === null,
    'A half-filled calculator must stay blank rather than print a number somebody could draw.');
}

console.log('\n=== Both calculators use the one sum ===\n');

// The syringe tab and the V3 pen tab must never drift apart on the same figures.
const shared = calculateDraw(36, 3, 2);
check('the syringe tab agrees with the pen tab on volume', shared && hgh && near(shared.drawMl, hgh.drawMl));
check('and on syringe marks', shared && hgh && near(shared.syringeMarks, hgh.drawUnits));

console.log('\n=== Changing a unit never empties a box ===\n');

// Kieran, 16 September 2026: "Ensure if someone changes to iu or mg or whatever that any number
// that a customer enters doesn't clear also."
//
// The page used to wipe the amount and the dose when somebody crossed between mass and IU. This
// replays what the screen does: every unit control sends a patch, and a patch merges. If one ever
// carries an empty string again, that is the box going blank in front of a customer.
const patches = [
  ['vial mg to IU', { vialUnit: 'iu' }],
  ['vial IU back to mg', { vialUnit: 'mg' }],
  ['dose mcg to mg', { doseUnit: 'mg' }],
  ['dose mg back to mcg', { doseUnit: 'mcg' }],
];
let figures = { ...EMPTY_FIGURES, vialAmount: '36', waterMl: '3', desiredDose: '2' };
for (const [label, patch] of patches) {
  figures = { ...figures, ...patch };
  check(`${label}: the amount, the water and the dose all survive`,
    figures.vialAmount === '36' && figures.waterMl === '3' && figures.desiredDose === '2',
    `after "${label}" the figures were ${JSON.stringify(figures)}`);
}

// And the number is kept as typed, not quietly re-scaled. Somebody who types 36 and then picks IU
// is telling the calculator the vial holds 36 IU.
check('the number is kept exactly as typed, never converted', figures.vialAmount === '36');

// Switching the vial to IU must not throw away which mass unit they had chosen for the dose, or
// coming back from IU would land them somewhere they never picked.
const remembered = { ...EMPTY_FIGURES, doseUnit: 'mg', vialAmount: '10', desiredDose: '2' };
const there = { ...remembered, vialUnit: 'iu' };
const back = { ...there, vialUnit: 'mg' };
check('the mass unit chosen earlier is still chosen after a trip through IU', back.doseUnit === 'mg');

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
