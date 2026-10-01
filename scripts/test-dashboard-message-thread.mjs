import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A message typed in the dashboard must land on a Website Enquiries thread (Kieran, 18 Sept 2026).
//
// Before this, it was filed under the customer and nowhere else, so a reply to it opened a brand
// new case holding only the customer's half of the conversation.

const route = readFileSync(new URL('../src/app/api/admin/customer-message/route.ts', import.meta.url), 'utf8');
assert.match(route, /recordDashboardMessageOnThread/);
assert.match(route, /providerMessageId: result\.messageId/);
// The thread is written only once the provider has accepted the message, never before.
assert.ok(route.indexOf('if (!result.sent)') < route.indexOf('await recordDashboardMessageOnThread('),
  'the thread must only be written after a successful send');

// The send has to hand back the provider's id, which is the thread's de-duplication key.
const sender = readFileSync(new URL('../src/lib/customerMessageEmail.ts', import.meta.url), 'utf8');
assert.match(sender, /messageId\?: string \| null/);
assert.match(sender, /return \{ sent: true, from: sender\.address, messageId: id \}/);
// And replies must come back somewhere the website can see, not to a mailbox it cannot read.
assert.match(sender, /replyTo: getReplyCaptureAddress\(\) \?\? sender\.replyTo/);

const enquiries = readFileSync(new URL('../src/lib/db/enquiries.ts', import.meta.url), 'utf8');
const fn = enquiries.slice(enquiries.indexOf('export async function recordDashboardMessageOnThread'));
const body = fn.slice(0, fn.indexOf('\nexport '));
// An existing thread is reused, so writing twice to one person does not make two cases.
assert.match(body, /findEnquiryForCustomerEmail/);
assert.match(body, /recordExistingEnquiryReply/);
assert.match(body, /createEnquiry/);
// We have spoken and nothing is owed by us until they answer.
assert.match(body, /status = 'replied'/);
// Recording the conversation must never fail a message that has already gone out.
assert.match(body, /catch \{\s*return null;\s*\}/);

// A reply that opens a fresh case brings what we already said onto it, so conversations sent
// before any of this still read as conversations.
const hook = readFileSync(new URL('../src/app/api/webhooks/resend-inbound/route.ts', import.meta.url), 'utf8');
assert.match(hook, /attachEarlierSentMessages\(\{ enquiryId, email: fromAddress \}\)/);
const history = enquiries.slice(enquiries.indexOf('export async function attachEarlierSentMessages'));
const historyBody = history.slice(0, history.indexOf('\nexport '));
assert.match(historyBody, /ce\.direction = 'sent'/);
assert.match(historyBody, /'history-' \|\| ce\.id::text/);
assert.match(historyBody, /ORDER BY ce\.created_at/);
assert.match(historyBody, /NOT EXISTS/);

console.log('A dashboard message is kept as a thread, a reply lands on it, and older messages come with it.');
