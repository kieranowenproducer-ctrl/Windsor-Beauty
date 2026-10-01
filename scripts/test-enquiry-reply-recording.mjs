import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getEnquiryReplyArchiveAddress } from '../src/lib/email/enquiryReplyDelivery.ts';
import { isSimpleAcknowledgement, visibleInboundEmailText } from '../src/lib/email/inboundRouting.ts';

const previous = process.env.ENQUIRY_REPLY_ARCHIVE_TO;

delete process.env.ENQUIRY_REPLY_ARCHIVE_TO;
assert.equal(getEnquiryReplyArchiveAddress('yvonne@example.com'), 'info@windsorbeauty.co.uk');
assert.equal(getEnquiryReplyArchiveAddress('INFO@WINDSORGLOW.COM'), null);

process.env.ENQUIRY_REPLY_ARCHIVE_TO = ' archive@windsorbeauty.co.uk ';
assert.equal(getEnquiryReplyArchiveAddress('yvonne@example.com'), 'archive@windsorbeauty.co.uk');

process.env.ENQUIRY_REPLY_ARCHIVE_TO = 'off';
assert.equal(getEnquiryReplyArchiveAddress('yvonne@example.com'), null);

if (previous === undefined) delete process.env.ENQUIRY_REPLY_ARCHIVE_TO;
else process.env.ENQUIRY_REPLY_ARCHIVE_TO = previous;

const route = await readFile(new URL('../src/app/api/admin/enquiries/[id]/reply/route.ts', import.meta.url), 'utf8');
assert.match(route, /bcc: archiveAddress \?\? undefined/);
assert.match(route, /recorded: false/);
assert.match(route, /Do not send it again/);
assert.match(route, /messageStartsWithGreeting/);
assert.match(route, /addAutomaticGreeting/);

const iphoneReply = `Thank you\nSent from my iPhone\n\n> On 18 Sep 2026, at 10:11, Windsor Beauty wrote:\n> Hi Pauline,\n> Earlier answer`;
assert.equal(visibleInboundEmailText(iphoneReply), 'Thank you');
assert.equal(isSimpleAcknowledgement(iphoneReply), true);
assert.equal(isSimpleAcknowledgement('Thank you, but can you check my order?'), false);

const webhook = await readFile(new URL('../src/app/api/webhooks/resend-inbound/route.ts', import.meta.url), 'utf8');
assert.match(webhook, /visibleInboundEmailText/);
assert.match(webhook, /isSimpleAcknowledgement/);
assert.match(webhook, /!autoClosedAcknowledgement/);

const enquiries = await readFile(new URL('../src/lib/db/enquiries.ts', import.meta.url), 'utf8');
assert.match(enquiries, /WITH saved_reply AS/);
assert.match(enquiries, /marked_done AS/);
assert.match(enquiries, /SET status = 'closed'/);
assert.match(enquiries, /closeAsAcknowledged/);

const existingReplyRoute = await readFile(
  new URL('../src/app/api/admin/enquiries/[id]/record-existing-reply/route.ts', import.meta.url),
  'utf8',
);
assert.match(existingReplyRoute, /recordExistingEnquiryReply/);
assert.doesNotMatch(existingReplyRoute, /new Resend|emails\.send/);

console.log('Enquiry reply recording checks passed.');
