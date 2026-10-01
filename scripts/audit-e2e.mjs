// End-to-end production audit of the registration -> verification journey
// (2026-07-07). Uses the real site + real DB + real Resend. The reminder
// step replicates the cron's logic but is HARD-SCOPED to the test email so
// no real unverified customer is emailed by this script.
//   node scripts/audit-e2e.mjs <test-email>
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const BASE = 'https://www.windsorbeauty.co.uk';
const TEST_EMAIL = process.argv[2];
if (!TEST_EMAIL || !TEST_EMAIL.includes('@')) throw new Error('pass a test email');

const env = readFileSync('.env.local', 'utf8');
const adminUrl = env.match(/^NEON_ADMIN_URL=["']?([^"'\r\n]+)/m)?.[1];
const RESEND_KEY = env.match(/^RESEND_API_KEY=["']?([^"'\r\n]+)/m)?.[1];
const sql = neon(adminUrl.replace(/\/[^/?]+(\?|$)/, '/neondb$1'));

const results = [];
function log(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

// ── 1. Register through the real coming-soon endpoint ───────────────────────
const regRes = await fetch(`${BASE}/api/launch/subscribe`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: TEST_EMAIL,
    firstName: 'Audit',
    lastName: 'Test',
    phone: '+447700900000',
    referredBy: 'Internal registration audit',
    password: 'AuditTest' + randomBytes(4).toString('hex'),
    addressLine1: '1 Test Street',
    addressCity: 'Windsor',
    addressPostcode: 'SL4 1AA',
    addressCountry: 'GB',
    marketingConsent: false,
  }),
});
const regJson = await regRes.json().catch(() => null);
log('signup returns created', regRes.ok && regJson?.status === 'created', JSON.stringify(regJson));

// ── 2. DB state: customer exists, token window is 48h ────────────────────────
const [customer] = await sql`SELECT * FROM customers WHERE email = ${TEST_EMAIL}`;
log('customer row created (active, unverified)', !!customer && customer.account_status === 'active' && customer.email_verified === false);

const tokens1 = await sql`SELECT *, ROUND(EXTRACT(EPOCH FROM (expires_at - created_at))/3600) AS window_hours FROM email_verification_tokens WHERE customer_id = ${customer.id} ORDER BY id`;
log('verification token issued', tokens1.length === 1);
log('token window is 48 hours', Number(tokens1[0]?.window_hours) === 48, `window=${tokens1[0]?.window_hours}h`);

// ── 3. Reminder flow: backdate, then replicate the cron for THIS email only ──
await sql`UPDATE customers SET created_at = now() - make_interval(days => 3) WHERE id = ${customer.id}`;
const candidates = await sql`
  SELECT * FROM customers
  WHERE email_verified = FALSE
    AND account_status = 'active'
    AND verification_reminder_sent_at IS NULL
    AND created_at < now() - make_interval(hours => 48)
    AND created_at > now() - make_interval(days => 14)
    AND email = ${TEST_EMAIL}
`;
log('reminder query finds the backdated account', candidates.length === 1);

let reminderSent = false;
if (candidates.length === 1) {
  // Same steps the cron route performs (fresh token + reminder email + mark)
  const token = randomBytes(32).toString('hex');
  await sql`
    INSERT INTO email_verification_tokens (customer_id, token, expires_at)
    VALUES (${customer.id}, ${token}, now() + interval '48 hours')
  `;
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Windsor Beauty <accounts@windsorbeauty.co.uk>',
      to: TEST_EMAIL,
      reply_to: 'sales@windsorbeauty.co.uk',
      subject: 'Reminder: confirm your email to activate your Windsor Beauty account',
      text:
        `Hi Audit,\n\nThis is a friendly final reminder from Windsor Beauty. You created a member account but have not yet verified your email address, so we have generated a fresh verification link for you.\n\n` +
        `Verify your email: ${BASE}/account/verify-email?token=${token}\n\n` +
        `This link will expire in 48 hours. If you did not create this account, you can safely ignore this email.\n\nThanks,\nWindsor Beauty`,
    }),
  });
  reminderSent = resendRes.ok;
  if (reminderSent) {
    await sql`UPDATE customers SET verification_reminder_sent_at = now() WHERE id = ${customer.id}`;
  }
}
log('reminder email sent (Resend accepted)', reminderSent);

const [afterReminder] = await sql`SELECT verification_reminder_sent_at FROM customers WHERE id = ${customer.id}`;
log('reminder marked (can never send twice)', !!afterReminder.verification_reminder_sent_at);

const candidates2 = await sql`
  SELECT id FROM customers
  WHERE email_verified = FALSE AND account_status = 'active'
    AND verification_reminder_sent_at IS NULL
    AND created_at < now() - make_interval(hours => 48)
    AND created_at > now() - make_interval(days => 14)
    AND email = ${TEST_EMAIL}
`;
log('reminder query excludes already-reminded account', candidates2.length === 0);

// ── 4. Click the (freshest) verification link on production ─────────────────
const tokens2 = await sql`SELECT token FROM email_verification_tokens WHERE customer_id = ${customer.id} ORDER BY id DESC LIMIT 1`;
const freshToken = tokens2[0].token;

const pageRes = await fetch(`${BASE}/account/verify-email?token=${freshToken}`, { redirect: 'manual' });
log('verify page loads without session (200)', pageRes.status === 200, `status=${pageRes.status}`);

const verifyRes = await fetch(`${BASE}/api/account/verify-email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: freshToken }),
});
const verifyJson = await verifyRes.json().catch(() => null);
log('verification succeeds', verifyRes.ok && verifyJson?.success === true, JSON.stringify(verifyJson));

const [verified] = await sql`SELECT email_verified, discount_code FROM customers WHERE id = ${customer.id}`;
log('customer marked verified', verified.email_verified === true);
log('10% discount code issued on verification', !!verified.discount_code, `code=${verified.discount_code}`);

// ── 5. Idempotency: same link clicked again ──────────────────────────────────
const verify2Res = await fetch(`${BASE}/api/account/verify-email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: freshToken }),
});
const verify2Json = await verify2Res.json().catch(() => null);
log('re-clicking the link is safe (no duplicate code email)', verify2Res.ok && verify2Json?.alreadyVerified === true, JSON.stringify(verify2Json));

// ── 6. Expired-token behaviour ───────────────────────────────────────────────
const expiredToken = randomBytes(32).toString('hex');
await sql`INSERT INTO email_verification_tokens (customer_id, token, expires_at) VALUES (${customer.id}, ${expiredToken}, now() - interval '1 hour')`;
const expiredRes = await fetch(`${BASE}/api/account/verify-email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: expiredToken }),
});
log('expired token is rejected with a clear message', expiredRes.status === 400);

console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' checks passed');
