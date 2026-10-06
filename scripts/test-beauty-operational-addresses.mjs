import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { beautyOperationalAddress } from '../src/lib/operationalAddress.ts';

globalThis.fetch = async () => { throw new Error('Network is forbidden'); };
assert.equal(beautyOperationalAddress('https://www.windsorbeauty.co.uk/contact?a=1'), 'https://www.windsorbeauty.is/contact?a=1');
assert.equal(beautyOperationalAddress('Windsor Beauty <Sales@WINDSORBEAUTY.CO.UK>'), 'Windsor Beauty <Sales@windsorbeauty.is>');
for (const value of ['https://windsorbeauty.co.uk.attacker.invalid', 'otherwindsorbeauty.co.uk', 'info@another.co.uk', 'info@windsorglow.com', 'https://sub.windsorbeauty.co.uk', 'off', 'http://localhost:3002']) {
  assert.equal(beautyOperationalAddress(value), value, 'Unrelated domains, deliberate switches and local previews stay intact');
}
assert.equal(beautyOperationalAddress(undefined), undefined);
process.env.SUPPORT_REPLY_TO = 'info@windsorbeauty.co.uk';
process.env.ADMIN_SALES_FROM_ADDRESS = 'Windsor Beauty <sales@windsorbeauty.co.uk>';
process.env.PAYPAL_RECEIVING_EMAIL = 'sales@windsorbeauty.co.uk';
process.env.EMAIL_ARCHIVE_TO = 'info@windsorbeauty.co.uk';
process.env.ENQUIRY_ALERT_TO = 'sales@windsorbeauty.co.uk,team@other.co.uk';
assert.equal((await import('../src/lib/email/supportAddress.ts')).SUPPORT_REPLY_TO, 'info@windsorbeauty.is');
assert.equal((await import('../src/lib/email/adminSenders.ts')).ADMIN_SENDERS.sales.address, 'sales@windsorbeauty.is');
const archive = await import('../src/lib/email/archive.ts');
assert.equal(archive.getArchiveAddress('customer@example.invalid'), 'info@windsorbeauty.is');
assert.equal(archive.getArchiveAddress('info@windsorbeauty.is'), null);
assert.equal(archive.getArchiveAddress('customer@example.invalid', 'off'), null);
assert.deepEqual((await import('../src/lib/email/enquiryAlerts.ts')).enquiryAlertRecipients(), ['sales@windsorbeauty.is', 'info@windsorbeauty.is', 'team@other.co.uk']);
const paypal = await import('../src/lib/paypalInstructionsEmail.ts');
assert.equal(new URL(paypal.buildPaypalLink('WB-SYNTHETIC', 2)).searchParams.get('business'), 'sales@windsorbeauty.is');

const stored = { key: 'terms', body: 'Contact info@windsorbeauty.co.uk or https://www.windsorbeauty.co.uk/contact. Other https://other.co.uk.', title: null, image_url: null, format: 'text', updated_at: 'synthetic' };
const queries = [];
globalThis.__beautySettingsDb = async (parts, ...values) => {
  queries.push({ text: parts.join('?'), values });
  return [stored];
};
registerHooks({ resolve(specifier, context, nextResolve) {
  const result = nextResolve(specifier, context);
  if (result.url.endsWith('/src/lib/db/client.ts')) return { url: 'data:text/javascript,export const requireDb = () => globalThis.__beautySettingsDb;', shortCircuit: true };
  return result;
} });
const content = await import('../src/lib/db/siteContent.ts');
assert.match((await content.getSiteContent('terms')).body, /info@windsorbeauty\.is/);
assert.match((await content.getAllSiteContent())[0].body, /https:\/\/other\.co\.uk/);
assert.match(stored.body, /windsorbeauty\.co\.uk/, 'Reading current copy does not rewrite stored or historical evidence');
await content.upsertSiteContent('terms', null, stored.body);
assert.match(queries.at(-1).values[2], /windsorbeauty\.is/);
assert.doesNotMatch(queries.at(-1).values[2], /windsorbeauty\.co\.uk/);

// Every old-domain source occurrence must have a narrow compatibility purpose.
const retained = new Set(['src/lib/operationalAddress.ts', 'src/lib/db/siteVisits.ts', 'src/app/api/webhooks/resend-inbound/route.ts', 'src/app/api/webhooks/resend-outbound/route.ts','src/lib/email/threadReferences.ts', 'src/lib/qrOperationalDomain.ts', 'src/lib/email/beautyInboundEnvelope.ts']);
// QR compatibility converts only leading owned addresses; current defaults stay .is.
const qrCompatibility = readFileSync('src/lib/qrOperationalDomain.ts', 'utf8');
assert.match(qrCompatibility, /const OLD_ORIGIN = new RegExp/);
assert.match(qrCompatibility, /const BARE_WEBSITE = new RegExp/);
assert.doesNotMatch(qrCompatibility, /fetch\(|sendEmail|deliverVerificationEmail/);
// Historical provider delivery events may name an old Beauty sender. This
// compatibility check must never become a new sending/template default.
const outboundCompatibility = readFileSync('src/app/api/webhooks/resend-outbound/route.ts','utf8').split('\n').filter(line=>line.includes('windsorbeauty.co.uk'));
assert.equal(outboundCompatibility.length,1);
assert.match(outboundCompatibility[0], /if\(from && .*from\.endsWith\('@windsorbeauty\.co\.uk'\)/);
// Closed inbound compatibility retains proven old original mailboxes, never sending defaults.
const inboundCompatibility = readFileSync('src/lib/email/beautyInboundEnvelope.ts', 'utf8');
assert.match(inboundCompatibility, /BEAUTY_INBOUND_MAILBOXES = new Set/);
assert.match(inboundCompatibility, /capture !== GLOW_CAPTURE/);
assert.doesNotMatch(inboundCompatibility, /fetch\(|sendEmail|deliverVerificationEmail/);
function audit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) audit(path);
    else if (/\.(ts|tsx|mjs)$/.test(path) && /windsorbeauty(?:\.|\\\.)co(?:\.|\\\.)uk/i.test(readFileSync(path, 'utf8').split('\n').filter(line => !/^\s*(?:\/\/|\*)/.test(line)).join('\n'))) {
      assert.ok(retained.has(path), `Unexplained old-domain reference: ${path}`);
    }
  }
}
audit('src');
console.log('Stale settings, current content read/save, PayPal target, sender/archive/alert isolation, domain boundaries and source recurrence audit passed. No network or real database.');
