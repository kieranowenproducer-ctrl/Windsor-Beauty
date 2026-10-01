import assert from 'node:assert/strict';
import {
  enquiryNeedsHumanAction,
  enquiryNeedsPersonalAdvice,
  looksLikeOrderStatusQuestion,
  orderStatusEmailCopy,
  orderDraftIsStale,
  orderDraftSnapshot,
} from '../src/lib/email/enquiryAutoDraft.ts';

assert.equal(looksLikeOrderStatusQuestion('order', 'Where is my order?', 'WB-ABCD12'), true);
assert.equal(looksLikeOrderStatusQuestion('order', 'Please cancel my order', 'WB-ABCD12'), false);
assert.equal(enquiryNeedsHumanAction('The item arrived damaged and I need help'), true);
assert.equal(enquiryNeedsHumanAction('Can you clear my second order? I only need one.'), true);
assert.equal(enquiryNeedsPersonalAdvice('Should I swap to this serum? Is it right for my skin?'), true);
assert.equal(enquiryNeedsPersonalAdvice('What size is the moisturiser?'), false);
assert.match(orderStatusEmailCopy({ order_number: 'WB-ABCD12', status: 'paid', tracking_number: null, tracking_url: null }), /Warm regards,\nWindsor Beauty$/);
const orderReply = orderStatusEmailCopy({
  order_number: 'WB-ABCD12',
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
