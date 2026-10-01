import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDraw } from '../src/components/calculatorDraw.ts';

test('true product IU produces a separate U-100 volume mark', () => {
  const result = calculateDraw(100, 2, 5);
  assert.ok(result);
  assert.equal(result.concentration, 50); // product IU per mL
  assert.equal(result.drawMl, 0.1);
  assert.equal(result.syringeMarks, 10); // 10 U-100 marks, not 10 product IU
  assert.equal(result.totalDoses, 20);
});

test('the same volume gives the same syringe mark for a mass product', () => {
  const result = calculateDraw(10, 2, 0.5);
  assert.ok(result);
  assert.equal(result.drawMl, 0.1);
  assert.equal(result.syringeMarks, 10);
});

test('incomplete and invalid inputs cannot produce a draw instruction', () => {
  for (const inputs of [[100, 0, 5], [100, -1, 5], [100, 2, NaN], [Infinity, 2, 5]]) {
    assert.equal(calculateDraw(...inputs), null);
  }
});
