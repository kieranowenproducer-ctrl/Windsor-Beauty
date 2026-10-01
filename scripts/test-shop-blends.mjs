// Blends the calculator offers come from the shop, so one cannot go missing (task b0f86954).
//
// Kieran, video, after the pen drop-down shipped: "you've got the wolverine recovery pen for 30 mg
// but you've forgotten the 50 mg one... all the blends should be there... if we add any more blends
// your calculator should automatically know."
//
// The hand-written list had the 30mg and not the 50mg. These tests cover the derivation AND the
// three ways an automatic list can be worse than a missing row: a duplicate, a peptide counted
// twice under two spellings, and an even split invented over a product that states its own.
//
// Run: npm run test:shop-blends

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allBlendPresets, shopBlendPresets, componentsInName, splitFromDosage, nameQuotesAmounts,
  BLEND_PRESETS,
} from '@/lib/blend';

const product = (slug, name, dosages) => ({
  slug, name, categories: ['Pens'],
  variants: dosages.map((d) => (typeof d === 'string' ? { dosage: d } : d)),
});

test("the Recovery Pens use Kieran's real breakdown, not a worked-out one", () => {
  // Given 10 September 2026: 30mg is 10/10/10; 50mg is 20mg TB-500, 20mg BPC-157, 10mg KPV.
  // The 50mg is deliberately NOT the 30mg scaled up, which is why it had to be asked: an even
  // split would have published 16.67mg of each.
  const all = allBlendPresets([
    // The live shop product, which the derived list would otherwise cover with an even split.
    product('recovery-pen-wg', 'Recovery Pen (Windsor Glow) BPC 157, TB500, KPV', ['30mg', '50mg']),
  ]);

  const byMg = (mg) => all.filter((p) => /recovery pen/i.test(p.label) && p.totalMg === mg);
  const thirty = byMg(30);
  const fifty = byMg(50);

  assert.equal(thirty.length, 1, 'exactly one 30mg row');
  assert.equal(fifty.length, 1, 'exactly one 50mg row, not the curated one AND a derived one');

  const amounts = (p) => Object.fromEntries(p.components.map((c) => [c.name, c.mg]));
  assert.deepEqual(amounts(thirty[0]), { 'BPC-157': 10, 'TB-500': 10, KPV: 10 });
  assert.deepEqual(amounts(fifty[0]), { 'BPC-157': 20, 'TB-500': 20, KPV: 10 });

  for (const p of [...thirty, ...fifty]) {
    assert.equal(p.confidence, 'published', `${p.label} is a given figure, not a deduction`);
    assert.match(p.source, /Kieran/, 'the source must say where the figures came from');
    assert.doesNotMatch(p.source, /check against the pen label/i,
      'it no longer needs checking: it came from the person who knows');
  }

  // The even split that used to be shown must be gone from the whole list.
  assert.ok(!JSON.stringify(all).includes('16.6'), 'no evenly-divided Recovery Pen left anywhere');
});

test('the Recovery Pen 50mg, the one that was missing, is now offered', () => {
  const list = shopBlendPresets([
    product('recovery-pen', 'Recovery Pen (Windsor Glow) BPC 157, TB500, KPV', ['30mg', '50mg']),
  ]);
  const fifty = list.find((p) => p.label.includes('50mg'));
  assert.ok(fifty, 'the 50mg must be there');
  assert.equal(fifty.totalMg, 50);
  assert.deepEqual(fifty.components.map((c) => c.name), ['BPC-157', 'TB-500', 'KPV']);
  assert.equal(fifty.confidence, 'inferred', 'the split is not published, so it must not claim to be');
  assert.match(fifty.source, /check against the label/i);
});

test('a split printed on the product is used exactly, never averaged', () => {
  assert.deepEqual(splitFromDosage('10/10mg'), [10, 10]);
  assert.deepEqual(splitFromDosage('40/4mg'), [40, 4]);
  assert.deepEqual(splitFromDosage('50mg'), [], 'a single figure is not a split');
  assert.deepEqual(splitFromDosage('Standard'), []);
});

test('one peptide written two ways is counted once', () => {
  // This is the bug the first version had: it read MT2 (Melanotan II) as a two-part
  // blend and split a 10mg pen into 5mg and 5mg.
  assert.deepEqual(componentsInName('MT2 (Melanotan II)'), ['Melanotan II']);
  assert.deepEqual(shopBlendPresets([product('mt2', 'MT2 (Melanotan II)', ['10mg'])]), [],
    'a single peptide is not a blend, however many names it goes by');
  assert.deepEqual(componentsInName('BPC157 & TB500 Wolverine'), ['BPC-157', 'TB-500']);
});

test('a product that quotes its own amounts is left alone', () => {
  // "Ipamorelin 10mg+CJC-1295 No DAC" states 10mg EACH. Splitting the 10mg variant
  // evenly would have published 5mg + 5mg, contradicting the label.
  assert.equal(nameQuotesAmounts('Ipamorelin 10mg+CJC-1295 No DAC +'), true);
  assert.equal(nameQuotesAmounts('Recovery Pen (Windsor Glow) BPC 157, TB500, KPV'), false);
  assert.deepEqual(shopBlendPresets([product('ipa-cjc', 'Ipamorelin 10mg+CJC-1295 No DAC +', ['10mg'])]), [],
    'left to the curated list rather than guessed at');
});

test('a single-peptide product is never offered as a blend', () => {
  assert.deepEqual(shopBlendPresets([product('reta', 'Retatrutide Pen', ['30mg'])]), []);
  assert.deepEqual(shopBlendPresets([product('glow', 'Glow Pen', ['70mg'])]), [],
    'the name names no peptides, so nothing can be inferred from it');
});

test('a withdrawn strength is not offered', () => {
  const list = shopBlendPresets([
    product('recovery-pen', 'Recovery Pen BPC 157, TB500, KPV', [
      { dosage: '30mg' }, { dosage: '50mg', enabled: false },
    ]),
  ]);
  assert.equal(list.length, 1);
  assert.ok(list[0].label.includes('30mg'));
});

test('the curated entries survive and are never replaced by a guess', () => {
  const all = allBlendPresets([
    product('bpc-tb-pen', 'BPC157 & TB500 Wolverine Repair and Recovery Pen', ['10/10mg']),
  ]);
  // Every curated entry still there, in order, untouched.
  assert.deepEqual(all.slice(0, BLEND_PRESETS.length), BLEND_PRESETS);
  // And the shop copy of a pen the curated list already covers does not appear twice.
  const twenties = all.filter((p) => p.totalMg === 20 && p.components.length === 2
    && p.components.every((c) => /BPC-157|TB-500/.test(c.name)));
  assert.equal(twenties.length, 2, 'the two curated 20mg entries only: the vial blend and the pen');
  assert.ok(twenties.every((p) => BLEND_PRESETS.includes(p)), 'both must be the curated ones');
});

/* These two use a composition the curated list does NOT hold (BPC-157 with KPV, 40mg), on purpose.
   They are about de-duplication between shop rows, and a fixture that the curated list happens to
   cover gets filtered before the rule under test is ever reached. That is what happened the moment
   the real Recovery Pen 50mg became a curated entry. */
test('two rows that read the same collapse to one', () => {
  const all = allBlendPresets([
    product('a', 'Trial Pen BPC 157, KPV', ['40mg']),
    product('b', 'Trial Pen BPC 157, KPV', ['40mg']),
  ]);
  const shopOnes = all.slice(BLEND_PRESETS.length);
  assert.equal(shopOnes.length, 1, 'the drop-down must not show the same words twice');
});

test('but two differently named products both appear, even sharing a formulation', () => {
  const all = allBlendPresets([
    product('a', 'Trial Pen (Windsor Glow) BPC 157, KPV', ['40mg']),
    product('b', 'Repair Pen (Another Supplier) BPC 157, KPV', ['40mg']),
  ]);
  const shopOnes = all.slice(BLEND_PRESETS.length);
  assert.equal(shopOnes.length, 2, 'they are two real products a customer must be able to choose between');
  assert.equal(new Set(shopOnes.map((p) => p.label)).size, 2);
});

/**
 * Kieran, 10 September 2026: "Ensure all future multi dosages pens are always catered for."
 *
 * This is the rule the whole task exists because of. The Recovery Pen is sold at 30mg and 50mg,
 * the hand-written list held only the 30mg, and the 50mg was invisible. So: EVERY sellable
 * strength of a blend pen must reach the list, including the ones a curated entry does not cover,
 * and including strengths of pens that do not exist yet.
 */
test('every strength of a multi-dosage blend pen is catered for', () => {
  const all = allBlendPresets([
    product('future-pen', 'Future Recovery Pen BPC 157, TB500, KPV', ['20mg', '35mg', '60mg', '75mg']),
  ]);
  const mine = all.slice(BLEND_PRESETS.length);
  assert.equal(mine.length, 4, 'all four strengths, not just the first');
  assert.deepEqual(mine.map((p) => p.totalMg).sort((a, b) => a - b), [20, 35, 60, 75]);
  for (const p of mine) {
    assert.equal(p.components.length, 3, `${p.label} must split across all three peptides`);
    assert.equal(p.components.reduce((s, c) => s + c.mg, 0), p.totalMg, `${p.label} must add up to its own total`);
  }
});

test('a strength a curated entry already covers does not hide its siblings', () => {
  // The exact shape of the original fault: one strength known, the others not.
  const all = allBlendPresets([
    product('recovery-pen-wg', 'Recovery Pen (Windsor Glow) BPC 157, TB500, KPV', ['30mg', '50mg', '80mg']),
  ]);
  const recovery = all.filter((p) => /recovery pen/i.test(p.label));
  const totals = [...new Set(recovery.map((p) => p.totalMg))].sort((a, b) => a - b);
  assert.deepEqual(totals, [30, 50, 80], 'the 80mg must appear even though 30 and 50 are curated');
  // And the two curated ones are still the curated ones, not derived replacements.
  for (const mg of [30, 50]) {
    const row = recovery.find((p) => p.totalMg === mg);
    assert.equal(row.confidence, 'published', `the ${mg}mg must stay the given figure`);
  }
});

test('an empty catalogue leaves the curated list exactly as it was', () => {
  assert.deepEqual(allBlendPresets([]), BLEND_PRESETS);
  assert.deepEqual(allBlendPresets(), BLEND_PRESETS);
});
