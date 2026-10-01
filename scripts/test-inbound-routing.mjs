import test from 'node:test';
import assert from 'node:assert/strict';
import { isCapturedThreadReply, isIgnoredInboundSender } from '../src/lib/email/inboundRouting.ts';

const captureAddress = 'reply@inbound.windsorglow.com';

test('a captured customer reply can return to its open enquiry', () => {
  assert.equal(isCapturedThreadReply({
    captureAddress, receivedFor: captureAddress,
    originalRecipients: [captureAddress],
    headers: { 'In-Reply-To': '<previous-message@example.com>' },
  }), true);
});

test('a public-mailbox forward becomes a new case even for an existing customer', () => {
  assert.equal(isCapturedThreadReply({
    captureAddress, receivedFor: captureAddress,
    originalRecipients: ['sales@windsorglow.com'],
    headers: { 'In-Reply-To': '<unrelated-message@example.com>' },
  }), false);
  assert.equal(isCapturedThreadReply({
    captureAddress, receivedFor: captureAddress,
    originalRecipients: [captureAddress], headers: {},
  }), false);
});

test('Royal Mail operational emails never become website enquiries', () => {
  assert.equal(isIgnoredInboundSender('no-reply@royalmail.com'), true);
  assert.equal(isIgnoredInboundSender('updates@clickanddrop.royalmail.com'), true);
  assert.equal(isIgnoredInboundSender('billing@royalmailgroup.com'), true);
  assert.equal(isIgnoredInboundSender('customer@example.com'), false);
  assert.equal(isIgnoredInboundSender('royalmail.com@example.com'), false);
});
