// The Qty box on a manual invoice used to put a 1 back the instant you cleared it, so on a phone
// every number got typed onto the end of that 1. Reported from a real invoice as a quantity of
// 1222222 and a line total of £177 million. This check FAILS THE BUILD if that behaviour returns.
// Run: npm run check:invoice-number-fields (also inside npm run check).

import { liveNumber, settleNumber, stockWord } from '../src/app/admin/invoices/[id]/edit/invoiceEditTypes.ts';

let failures = 0;
const check = (label, condition, detail) => {
  if (condition) { console.log(`  ok       ${label}`); return; }
  failures++;
  console.log(`  FAILED   ${label}${detail ? `\n           ${detail}` : ''}`);
};

const QTY = 1;      // a quantity can never be less than one
const MONEY = 0;    // a price or a discount can be zero

console.log('\n=== Clearing the box while you type ===');
check('an empty Qty box commits NOTHING, so no 1 is put back',
  liveNumber('', QTY) === null, `got: ${liveNumber('', QTY)}`);
check('an empty price box commits NOTHING either',
  liveNumber('', MONEY) === null, `got: ${liveNumber('', MONEY)}`);
check('typing 2 into a cleared Qty box gives 2, not 12',
  liveNumber('2', QTY) === 2, `got: ${liveNumber('2', QTY)}`);
check('a half-typed decimal commits nothing rather than a wrong number',
  liveNumber('.', MONEY) === null, `got: ${liveNumber('.', MONEY)}`);
check('nonsense commits nothing', liveNumber('abc', QTY) === null, `got: ${liveNumber('abc', QTY)}`);

console.log('\n=== Real numbers still go through ===');
check('Qty 2 is 2', liveNumber('2', QTY) === 2);
check('Qty 0 is lifted to 1, because you cannot invoice none of something',
  liveNumber('0', QTY) === 1, `got: ${liveNumber('0', QTY)}`);
check('a negative Qty is lifted to 1', liveNumber('-5', QTY) === 1, `got: ${liveNumber('-5', QTY)}`);
check('a price of 0 is allowed', liveNumber('0', MONEY) === 0, `got: ${liveNumber('0', MONEY)}`);
check('a negative price is lifted to 0', liveNumber('-3', MONEY) === 0, `got: ${liveNumber('-3', MONEY)}`);
check('45.50 keeps its pence', liveNumber('45.50', MONEY) === 45.5, `got: ${liveNumber('45.50', MONEY)}`);

console.log('\n=== Leaving the box settles it ===');
check('leaving an empty Qty box settles at 1', settleNumber('', QTY) === 1, `got: ${settleNumber('', QTY)}`);
check('leaving an empty price box settles at 0', settleNumber('', MONEY) === 0, `got: ${settleNumber('', MONEY)}`);
check('leaving nonsense settles at the minimum', settleNumber('abc', QTY) === 1, `got: ${settleNumber('abc', QTY)}`);
check('leaving a real number keeps it', settleNumber('7', QTY) === 7, `got: ${settleNumber('7', QTY)}`);

console.log('\n=== The exact fault from the video cannot happen ===');
// Somebody clears "1" and types "2". Old code: '' -> 1, then '12'. New code: '' -> nothing, '2' -> 2.
let committed = 1;
for (const keystroke of ['', '2']) {
  const n = liveNumber(keystroke, QTY);
  if (n !== null) committed = n;
}
check('clear the box, type 2, and the quantity is 2', committed === 2, `got: ${committed}`);
check('the old snap-back would have given 12 here', committed !== 12);

console.log('\n=== Stock reads honestly ===');
check('an untracked product does not read as sold out',
  stockWord(null) === 'stock not tracked', `got: ${stockWord(null)}`);
check('none left reads as none left', stockWord(0) === '0 in stock', `got: ${stockWord(0)}`);
check('a real number reads plainly', stockWord(42) === '42 in stock', `got: ${stockWord(42)}`);

console.log('');
if (failures > 0) {
  console.log(`  ${failures} check(s) FAILED. An invoice number box cannot be edited properly.\n`);
  process.exit(1);
}
console.log('  Invoice number boxes can be cleared and retyped, and stock reads honestly.\n');
