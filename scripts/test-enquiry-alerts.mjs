import test from 'node:test';
import assert from 'node:assert/strict';
import { enquiryAlertRecipients, isUrgentCustomerEmail } from '../src/lib/email/enquiryAlerts.ts';

test('one staff notice reaches sales and info without repeating an address', () => {
  assert.deepEqual(
    enquiryAlertRecipients('Sales@WindsorBeauty.com; colleague@example.com, colleague@example.com'),
    ['sales@windsorbeauty.co.uk', 'info@windsorbeauty.co.uk', 'colleague@example.com'],
  );
});

test('a wrong shipment is prioritised while an ordinary question is not', () => {
  assert.equal(isUrgentCustomerEmail('I ordered Retatrutide but you sent Tirzepatide instead of it'), true);
  assert.equal(isUrgentCustomerEmail('Can you tell me when the shop closes?'), false);
});
