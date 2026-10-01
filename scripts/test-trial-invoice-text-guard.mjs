// A trial product's real name must never leave in text an admin typed by hand
// (Kieran, 16 Sept 2026). Saving and sending both refuse; see
// src/lib/invoiceTrialTextGuard.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findTrialNameInInvoiceText, trialTextLeakMessage } from '@/lib/invoiceTrialTextGuard';

const trials = [{ name: 'crwn t 300' }, { name: 't 300' }, { name: 'eq' }, { name: 'dec' }, { name: '501' }, { name: 'Tes Ace 125mg' }];
const clean = {
  subject: 'Wholesale order', message: 'Thanks for your order, Product 284 is on its way.',
  footerText: 'For research use only.', customerNotes: 'Payment within 7 days.',
  lineItems: [
    { type: 'trial', slug: 'trial:8', name: 'Product 284', description: '300mg' },
    { type: 'custom', name: 'Pens customised', description: 'Gold finish' },
  ],
};

test('a normal invoice with only product codes is allowed', () => {
  assert.equal(findTrialNameInInvoiceText(clean, trials), null);
});

for (const [key, label] of [['subject', 'Subject / Header Text'], ['message', 'Message to Customer'],
  ['footerText', 'Footer / Disclaimer Text'], ['customerNotes', 'Customer-Facing Notes']]) {
  test(`a trial name typed in "${label}" is refused`, () => {
    const leak = findTrialNameInInvoiceText({ ...clean, [key]: 'Your T-300 is packed' }, trials);
    assert.deepEqual(leak, { field: label, trialName: 't 300' });
  });
}

test('matching ignores case and punctuation', () => {
  assert.ok(findTrialNameInInvoiceText({ ...clean, message: 'TES-ACE 125MG x2' }, trials));
});

test('short names are caught as whole words only', () => {
  assert.ok(findTrialNameInInvoiceText({ ...clean, message: 'One eq included' }, trials));
  assert.ok(findTrialNameInInvoiceText({ ...clean, message: 'Posted 5 Dec' }, trials));
  assert.equal(findTrialNameInInvoiceText({ ...clean, message: 'We decided the equal split, ref 5012' }, trials), null);
});

test('a hand-typed line with a trial name is refused, a picked trial line is not', () => {
  const leak = findTrialNameInInvoiceText({ ...clean, lineItems: [clean.lineItems[0], { type: 'custom', name: 'Extra', description: 'crwn t 300' }] }, trials);
  assert.deepEqual(leak, { field: 'Line item 2', trialName: 'crwn t 300' });
  assert.equal(findTrialNameInInvoiceText({ ...clean, lineItems: [{ type: 'trial', slug: 'trial:3', name: 't 300' }] }, trials), null);
});

test('a saved invoice row (as the send step sees it) is checked too', () => {
  const leak = findTrialNameInInvoiceText({ footer_text: 'Includes 501', customer_notes: null, line_items: [] }, trials);
  assert.deepEqual(leak, { field: 'Footer / Disclaimer Text', trialName: '501' });
});

test('the refusal names the box and the product in plain English', () => {
  const text = trialTextLeakMessage({ field: 'Message to Customer', trialName: 't 300' });
  assert.match(text, /"Message to Customer" contains the trial product name "t 300"/);
});

test('save, create and send all run the check before anything happens', async () => {
  const { readFile } = await import('node:fs/promises');
  const read = (p) => readFile(new URL(`../src/app/api/admin/invoices/${p}`, import.meta.url), 'utf8');
  const patch = await read('[id]/route.ts');
  assert.ok(patch.indexOf('findTrialNameInInvoiceText(body') < patch.indexOf('parseInvoiceInput(body'));
  const post = await read('route.ts');
  assert.ok(post.indexOf('findTrialNameInInvoiceText(body') < post.indexOf('createInvoice('));
  const send = await read('[id]/send/route.ts');
  assert.ok(send.indexOf('findTrialNameInInvoiceText(invoice') < send.indexOf('convertInvoiceToOrder(id)'));
});
