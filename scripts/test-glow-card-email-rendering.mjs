import assert from 'node:assert/strict';
import {
  buildGlowCardEmailVisual,
  buildOrderConfirmationEmail,
  sendOrderConfirmationEmail,
} from '../src/lib/orderConfirmationEmail.ts';
import { sendGlowCardMilestoneEmail } from '../src/lib/glowCardMilestoneEmail.ts';

const cases = [
  { points: 1, stage: 1, amount: 10, filled: 1, remaining: 4, numbers: [1, 2, 3, 4, 5] },
  { points: 4, stage: 1, amount: 10, filled: 4, remaining: 1, numbers: [1, 2, 3, 4, 5] },
  { points: 5, stage: 1, amount: 10, filled: 5, remaining: 0, numbers: [1, 2, 3, 4, 5] },
  { points: 6, stage: 2, amount: 20, filled: 1, remaining: 4, numbers: [6, 7, 8, 9, 10] },
  { points: 9, stage: 2, amount: 20, filled: 4, remaining: 1, numbers: [6, 7, 8, 9, 10] },
  { points: 10, stage: 2, amount: 20, filled: 5, remaining: 0, numbers: [6, 7, 8, 9, 10] },
  { points: 11, stage: 3, amount: 30, filled: 1, remaining: 4, numbers: [11, 12, 13, 14, 15] },
  { points: 15, stage: 3, amount: 30, filled: 5, remaining: 0, numbers: [11, 12, 13, 14, 15] },
];

for (const testCase of cases) {
  const html = buildGlowCardEmailVisual(testCase.points);
  assert.match(html, new RegExp(`STAGE ${testCase.stage} &middot;`));
  assert.match(html, new RegExp(`&pound;${testCase.amount} off`));
  assert.match(html, /Plus half-price standard UK delivery/);
  assert.match(html, /windsor-glow-mark-clean\.png/);
  assert.doesNotMatch(html, /header-glow\.png|FIRST CARD|CARD 2|CARD 3/);
  assert.equal((html.match(/bgcolor="#9b7417"/g) || []).length, testCase.filled);
  for (const number of testCase.numbers) {
    assert.match(html, new RegExp(`>${number}<\/td>`));
  }
  for (let otherStage = 1; otherStage <= 3; otherStage++) {
    if (otherStage !== testCase.stage) assert.doesNotMatch(html, new RegExp(`STAGE ${otherStage} &middot;`));
  }
  if (testCase.remaining === 0) {
    assert.match(html, /All 5 stamps are filled/);
  } else {
    assert.match(html, new RegExp(`${testCase.remaining} more point`));
  }
}

const malformed = buildGlowCardEmailVisual(Number.NaN);
assert.match(malformed, /STAGE 1 &middot; 5 POINTS/);
assert.match(malformed, /0 of 5 stamps/);
assert.doesNotMatch(malformed, /NaN|undefined/);
assert.match(buildGlowCardEmailVisual(-4), /0 of 5 stamps/);
assert.match(buildGlowCardEmailVisual(99), /STAGE 3 &middot; 15 POINTS/);
assert.match(buildGlowCardEmailVisual(99), /5 of 5 stamps/);

const sample = buildOrderConfirmationEmail({
  to: 'sample@example.test',
  customerName: 'Sample Customer',
  orderNumber: 'WG-EMAIL-TEST',
  items: [{ name: 'Sample product', variant: '30mg', quantity: 1, price: 35, slug: 'sample' }],
  subtotal: 35,
  shippingLabel: 'Standard UK delivery',
  shippingCost: 10,
  total: 45,
  shippingAddress: '1 Example Street\nExampletown\nEX1 1AA',
  glowCard: {
    earnedPoint: true,
    reason: 'earned',
    points: 4,
    cycle: 1,
    nextMilestone: 5,
    nextRewardAmount: 10,
    pointsAway: 1,
  },
});

assert.match(sample.html, /You earned another Glow Point/);
assert.match(sample.html, /4 of 5 stamps on this reward card/);
assert.match(sample.html, /1 more point until £10 off and half-price standard UK delivery/);
assert.match(sample.text, /You have 4 of 5 stamps on your £10 reward card/);

const previousResendKey = process.env.RESEND_API_KEY;
delete process.env.RESEND_API_KEY;
assert.equal(await sendOrderConfirmationEmail(sample), false);
assert.equal(await sendGlowCardMilestoneEmail({
  to: 'sample@example.test', customerName: 'Sample Customer', milestone: 5, amount: 10,
}), false);
if (previousResendKey !== undefined) process.env.RESEND_API_KEY = previousResendKey;

console.log(`Glow Card email rendering passed ${cases.length} stage-boundary cases, malformed input checks, the fourth-order example, and safe email-provider failure checks.`);
