import test from 'node:test';
import assert from 'node:assert/strict';
import { enquiryAlertRecipients, isUrgentCustomerEmail } from '../src/lib/email/enquiryAlerts.ts';

test('one staff notice reaches only info even with a legacy extra-recipient setting', () => {
  const previous = process.env.ENQUIRY_ALERT_TO;
  try {
    process.env.ENQUIRY_ALERT_TO = 'sales@windsorbeauty.is; colleague@example.com';
    assert.deepEqual(enquiryAlertRecipients(), ['info@windsorbeauty.is']);
  } finally {
    if (previous === undefined) delete process.env.ENQUIRY_ALERT_TO;
    else process.env.ENQUIRY_ALERT_TO = previous;
  }
});

test('a wrong shipment is prioritised while an ordinary question is not', () => {
  assert.equal(isUrgentCustomerEmail('I ordered the serum but you sent the cleanser instead of it'), true);
  assert.equal(isUrgentCustomerEmail('Can you tell me when the shop closes?'), false);
});
