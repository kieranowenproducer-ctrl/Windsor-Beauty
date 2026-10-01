import assert from 'node:assert/strict';
import {
  canPreparePearlDraft,
  enquiryNeedsHumanAction,
  enquiryNeedsPersonalAdvice,
  looksLikeOrderStatusQuestion,
  looksLikePearlQuestion,
  orderStatusEmailCopy,
  orderDraftIsStale,
  orderDraftSnapshot,
  pearlAnswerEmailCopy,
  productNamesForPearl,
} from '../src/lib/email/enquiryAutoDraft.ts';

const pearl = {
  kind: 'dose',
  title: 'HGH 191AA source-listed ranges',
  summary: 'The approved sources describe a daily schedule.',
  bullets: ['Lower source range: 1 to 2 IU per day', 'Standard source range: 2 to 4 IU per day'],
};
assert.equal(canPreparePearlDraft(pearl), true);
assert.match(pearlAnswerEmailCopy(pearl), /Lower source range/);
assert.match(pearlAnswerEmailCopy({ ...pearl, bullets: ['Original source schedule text: Daily'] }, 'Is this daily or weekly?'), /daily schedule, rather than a weekly schedule/);
assert.doesNotMatch(pearlAnswerEmailCopy({ ...pearl, bullets: ['Source range: 200 mcg; route Injection; extra detail'] }), /route Injection/);
assert.equal(canPreparePearlDraft({ ...pearl, kind: 'clarify' }), false);
assert.equal(looksLikePearlQuestion('product', 'Product Information', 'Should this be daily or weekly?'), true);
assert.equal(looksLikeOrderStatusQuestion('order', 'Where is my order?', 'WG-ABCD12'), true);
assert.equal(looksLikeOrderStatusQuestion('order', 'Please cancel my order', 'WG-ABCD12'), false);
assert.equal(enquiryNeedsHumanAction('The item arrived damaged and I need help'), true);
assert.equal(enquiryNeedsHumanAction('Can you clear my second order? I only need one.'), true);
assert.equal(enquiryNeedsPersonalAdvice('Should I swap to this to manage my weight?'), true);
assert.equal(enquiryNeedsPersonalAdvice('What is the weekly dosage listed by your sources?'), false);
assert.deepEqual(
  productNamesForPearl([{ name: 'HGH- SUPER HGH (191AA) 100IU PEN (WINDSOR GLOW)', variant: '100IU' }]),
  ['HGH 191AA'],
);

const orderReply = orderStatusEmailCopy({
  order_number: 'WG-ABCD12',
  status: 'dispatched',
  tracking_number: 'RM123456789GB',
  tracking_url: 'https://www.royalmail.com/track-your-item#/tracking-results/RM123456789GB',
});
assert.match(orderReply, /current status is: Dispatched/);
assert.match(orderReply, /RM123456789GB/);
assert.match(orderReply, /Track it here/);

const originalOrder = {
  status: 'awaiting_dispatch',
  tracking_number: null,
  tracking_url: null,
};
const originalSnapshot = orderDraftSnapshot(originalOrder);
assert.equal(orderDraftIsStale(originalSnapshot, originalOrder), false);
assert.equal(orderDraftIsStale(originalSnapshot, {
  ...originalOrder,
  status: 'dispatched',
  tracking_number: 'RM123456789GB',
}), true);

console.log('Enquiry automatic-draft checks passed.');
