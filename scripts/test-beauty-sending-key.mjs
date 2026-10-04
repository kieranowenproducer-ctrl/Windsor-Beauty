import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const deliveries = [];
globalThis.__beautyDedicatedSend = { deliveries };
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'resend') return { url: 'data:text/javascript,' + encodeURIComponent(`
    export class Resend {
      constructor(key) { this.emails = { send: async payload => { globalThis.__beautyDedicatedSend.deliveries.push({ key, payload }); return { data: { id: 'synthetic-send' }, error: null }; } }; }
    }
  `), shortCircuit: true };
  return nextResolve(specifier, context);
} });
globalThis.fetch = async () => { throw new Error('Network is forbidden'); };
process.env.RESEND_API_KEY = 'retained-legacy-main';
process.env.RESEND_API_KEY_PAYPAL = 'retained-legacy-paypal';
process.env.RESEND_API_KEY_MARKETING = 'retained-legacy-marketing';
delete process.env.RESEND_API_KEY_BEAUTY_IS;
const { sendEmail } = await import('../src/lib/email/send.ts');
const payload = { from: 'Windsor Beauty <orders@windsorbeauty.is>', to: 'internal@example.invalid', subject: 'Synthetic proof', text: 'No real email' };
assert.equal((await sendEmail(payload, { internal: true })).ok, false, 'Missing dedicated key fails closed despite legacy keys');
assert.equal((await sendEmail(payload, { internal: true, apiKey: process.env.RESEND_API_KEY_PAYPAL })).ok, false, 'Explicit legacy override cannot bypass missing dedicated key');
const password = await import('../src/lib/passwordResetEmail.ts');
const verify = await import('../src/lib/verifyEmailEmail.ts');
const shipping = await import('../src/lib/shippingEmail.ts');
assert.equal(password.isPasswordResetEmailConfigured(), false);
assert.equal(verify.isVerifyEmailConfigured(), false);
assert.equal(shipping.isShippingEmailConfigured(), false);
assert.equal(await password.sendPasswordResetEmail({ to: 'customer@example.invalid', customerName: 'Synthetic', resetUrl: 'https://www.windsorbeauty.is/account/reset' }), false);
assert.equal(await (await import('../src/lib/adminOrderNotificationEmail.ts')).sendAdminOrderNotificationEmail({}), false, 'Staff notification also fails closed');
assert.equal(await (await import('../src/lib/paypalInstructionsEmail.ts')).sendPaypalInstructionsEmail({}), false, 'Dormant PayPal sender cannot use retained legacy key');
assert.equal(deliveries.length, 0);
process.env.RESEND_API_KEY_BEAUTY_IS = 'synthetic-beauty-is';
assert.equal((await sendEmail(payload, { internal: true })).ok, true);
assert.equal(deliveries.length, 1);
assert.equal(deliveries[0].key, 'synthetic-beauty-is');
assert.equal((await sendEmail(payload, { internal: true, apiKey: 'retained-legacy-main' })).ok, false, 'Dedicated sender rejects mismatching overrides');
assert.equal(deliveries.length, 1);
assert.equal(password.isPasswordResetEmailConfigured(), true);
assert.equal(verify.isVerifyEmailConfigured(), true);
assert.equal(shipping.isShippingEmailConfigured(), true);

const incomingOnly = new Set(['src/app/api/webhooks/resend-inbound/route.ts', 'src/app/api/admin/enquiries/attachment/route.ts']);
function audit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) audit(path);
    else if (/\.(ts|tsx|mjs)$/.test(path)) {
      const source = readFileSync(path, 'utf8');
      if (/process\.env\.RESEND_API_KEY(?:_PAYPAL|_MARKETING)?\b/.test(source)) assert.ok(incomingOnly.has(path), `Outgoing legacy-key reader reintroduced: ${path}`);
    }
  }
}
audit('src');
console.log('Dedicated Beauty .is key used on intercepted provider send; missing key and legacy overrides fail closed; configuration/staff/PayPal gates and outgoing credential-reader audit passed. No real email.');
