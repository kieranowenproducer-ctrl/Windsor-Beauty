// Re-test: POSTing an already-USED verification token must return success
// (alreadyVerified) for a verified account, not "invalid or expired".
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const email = process.argv[2];
const env = readFileSync('.env.local', 'utf8');
const adminUrl = env.match(/^NEON_ADMIN_URL=["']?([^"'\r\n]+)/m)?.[1];
const sql = neon(adminUrl.replace(/\/[^/?]+(\?|$)/, '/neondb$1'));

const [customer] = await sql`SELECT id, email_verified FROM customers WHERE email = ${email}`;
const [used] = await sql`SELECT token FROM email_verification_tokens WHERE customer_id = ${customer.id} AND used_at IS NOT NULL ORDER BY id DESC LIMIT 1`;
const res = await fetch('https://www.windsorbeauty.co.uk/api/account/verify-email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: used.token }),
});
const json = await res.json();
console.log(res.ok && json.alreadyVerified === true ? 'PASS' : 'FAIL', 're-clicked used link ->', res.status, JSON.stringify(json));
