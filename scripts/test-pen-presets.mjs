// The calculator's pen drop-down (task b0f86954).
//
// The point of interest is the two pens whose strength is written as a split, "10/10mg" and
// "40/4mg". "The amount that's already in the pen" could have meant one component or the whole,
// so this asserts the drop-down agrees with the blend table the site already publishes, rather
// than carrying a second opinion about the same pen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPenStrength, penPresets, PEN_WATER_ML } from '@/lib/penPresets';
import { BLEND_PRESETS } from '@/lib/blend';

test('reads a plain strength', () => {
  assert.deepEqual(readPenStrength('80mg'), { amount: '80', unit: 'mg' });
  assert.deepEqual(readPenStrength('70mg'), { amount: '70', unit: 'mg' });
  assert.deepEqual(readPenStrength('30mg'), { amount: '30', unit: 'mg' });
  assert.deepEqual(readPenStrength('50mg'), { amount: '50', unit: 'mg' });
});

test('reads International Units, which the calculator also understands', () => {
  assert.deepEqual(readPenStrength('200IU'), { amount: '200', unit: 'iu' });
  assert.deepEqual(readPenStrength('100IU'), { amount: '100', unit: 'iu' });
});

test('adds up a split, and matches the published blend totals', () => {
  assert.deepEqual(readPenStrength('10/10mg'), { amount: '20', unit: 'mg' });
  assert.deepEqual(readPenStrength('40/4mg'), { amount: '44', unit: 'mg' });

  // The authority for those two figures, so the drop-down can never drift from it.
  const bpcTb = BLEND_PRESETS.find((p) => p.id === 'bpc-tb-pen-10-10');
  const omnimorph = BLEND_PRESETS.find((p) => p.id === 'omnimorph-retatrutide-cagrilintide-40-4');
  assert.ok(bpcTb, 'the 10/10 pen blend preset must exist');
  assert.ok(omnimorph, 'the 40/4 pen blend preset must exist');
  assert.equal(Number(readPenStrength('10/10mg').amount), bpcTb.totalMg);
  assert.equal(Number(readPenStrength('40/4mg').amount), omnimorph.totalMg);
});

test('refuses to invent a number it cannot read', () => {
  assert.equal(readPenStrength('Standard'), null);
  assert.equal(readPenStrength(''), null);
  assert.equal(readPenStrength('one pen'), null);
});

test('lists one entry per sellable strength, and leaves withdrawn ones out', () => {
  const catalogue = [
    {
      slug: 'recovery-pen', name: 'Recovery Pen', categories: ['Pens'],
      variants: [{ dosage: '30mg', price: 95 }, { dosage: '50mg', price: 120 }],
    },
    {
      slug: 'retired-pen', name: 'Retired Pen', categories: ['Pens'],
      variants: [{ dosage: '40mg', price: 145, enabled: false }],
    },
    {
      slug: 'a-vial', name: 'Not A Pen', categories: ['Fat Loss'],
      variants: [{ dosage: '10mg', price: 50 }],
    },
  ];

  const list = penPresets(catalogue);
  assert.equal(list.length, 2, 'both strengths of the one sellable pen, and nothing else');
  assert.deepEqual(list.map((p) => p.label), ['Recovery Pen, 30mg', 'Recovery Pen, 50mg']);
  assert.deepEqual(list.map((p) => p.amount), ['30', '50']);
  assert.ok(list.every((p) => !/[—–]/.test(p.label)), 'no em dashes in anything a person reads');
  assert.equal(new Set(list.map((p) => p.id)).size, list.length, 'ids must be unique');
});

test('a pen whose strength cannot be read is still offered, with no invented amount', () => {
  const list = penPresets([
    { slug: 'mystery-pen', name: 'Mystery Pen', categories: ['Pens'], variants: [{ dosage: 'Standard', price: 10 }] },
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].amount, null);
});

test('the water a pen takes is a fixed 3mL', () => {
  assert.equal(PEN_WATER_ML, '3');
});

/**
 * Kieran, 10 September 2026: "Ensure all future multi dosages pens are always catered for."
 *
 * Every strength a pen is sold in gets its own row in the drop-down, however many there are and
 * whenever the pen is added. A pen sold in four strengths that offered only one would send three
 * customers to the wrong figure.
 */
test('every strength of a multi-dosage pen gets its own entry', () => {
  const list = penPresets([
    {
      slug: 'future-pen', name: 'Future Pen', categories: ['Pens'],
      variants: [{ dosage: '15mg' }, { dosage: '30mg' }, { dosage: '45mg' }, { dosage: '60mg' }],
    },
  ]);
  assert.equal(list.length, 4, 'one row per strength');
  assert.deepEqual(list.map((p) => p.amount), ['15', '30', '45', '60']);
  assert.equal(new Set(list.map((p) => p.id)).size, 4, 'and each addressable on its own');
  assert.ok(list.every((p) => p.unit === 'mg'));
});

test('a multi-dosage pen mixing units still caters for every one', () => {
  const list = penPresets([
    {
      slug: 'mixed', name: 'Mixed Pen', categories: ['Pens'],
      // A real possibility: an HGH pen in IU beside a milligram strength, and a blend split.
      variants: [{ dosage: '100IU' }, { dosage: '10mg' }, { dosage: '10/10mg' }],
    },
  ]);
  assert.equal(list.length, 3);
  const byLabel = Object.fromEntries(list.map((p) => [p.label, p]));
  assert.equal(byLabel['Mixed Pen, 100IU'].unit, 'iu');
  assert.equal(byLabel['Mixed Pen, 100IU'].amount, '100');
  assert.equal(byLabel['Mixed Pen, 10mg'].amount, '10');
  assert.equal(byLabel['Mixed Pen, 10/10mg'].amount, '20', 'a split strength totals up');
});
