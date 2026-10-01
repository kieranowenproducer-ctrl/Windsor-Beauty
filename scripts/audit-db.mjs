// One-off audit helper (registration/verification audit 2026-07-07).
// Reads DATABASE_URL from .env.production.local. Subcommands:
//   node scripts/audit-db.mjs schema                 — run the audit's column adds (idempotent)
//   node scripts/audit-db.mjs inspect <email>        — customer + tokens + subscriber rows for an email
//   node scripts/audit-db.mjs backdate <email> <days>— age a test account for the reminder-cron test
//   node scripts/audit-db.mjs latest-invoice         — newest invoices' number/status/token
//   node scripts/audit-db.mjs cleanup <email>        — delete every row created by a test registration
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

// NEON_ADMIN_URL (in .env.local, gitignored) is the direct admin connection
// to the Windsor Glow Neon database — production env vars are Sensitive-type
// in Vercel and cannot be pulled, so this is the local access path.
const env = readFileSync('.env.local', 'utf8');
const adminUrl = env.match(/^NEON_ADMIN_URL=["']?([^"'\r\n]+)/m)?.[1];
if (!adminUrl) throw new Error('NEON_ADMIN_URL not found in .env.local');
// NEON_ADMIN_URL's default database is kj-guitar; Windsor Glow lives in
// `neondb` on the same Neon host (verified via pg_tables, 2026-07-07).
const url = adminUrl.replace(/\/[^/?]+(\?|$)/, '/neondb$1');
const sql = neon(url, { fetchOptions: { cache: 'no-store' } });

const [cmd, arg1, arg2] = process.argv.slice(2);

if (cmd === 'schema') {
  await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS verification_reminder_sent_at TIMESTAMPTZ`;
  await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fena_payment_url TEXT`;
  await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ`;
  await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms_accepted_ip TEXT`;
  console.log('columns ensured');
} else if (cmd === 'inspect') {
  const customers = await sql`SELECT id, email, account_status, email_verified, verification_reminder_sent_at, discount_code, created_at FROM customers WHERE email = ${arg1}`;
  console.log('customer:', JSON.stringify(customers, null, 1));
  if (customers[0]) {
    const tokens = await sql`SELECT id, created_at, expires_at, used_at, ROUND(EXTRACT(EPOCH FROM (expires_at - created_at))/3600) AS window_hours FROM email_verification_tokens WHERE customer_id = ${customers[0].id} ORDER BY id`;
    console.log('tokens:', JSON.stringify(tokens, null, 1));
  }
  const subs = await sql`SELECT id, email, discount_code FROM launch_subscribers WHERE email = ${arg1}`;
  console.log('subscriber:', JSON.stringify(subs));
  const signups = await sql`SELECT id, email, code, status FROM discount_signups WHERE email = ${arg1}`;
  console.log('discount_signup:', JSON.stringify(signups));
} else if (cmd === 'backdate') {
  const days = Number(arg2 ?? 3);
  const r = await sql`UPDATE customers SET created_at = now() - make_interval(days => ${days}) WHERE email = ${arg1} RETURNING id, created_at`;
  console.log('backdated:', JSON.stringify(r));
} else if (cmd === 'latest-invoice') {
  const r = await sql`SELECT invoice_number, status, public_token, total, terms_accepted_at, fena_payment_url IS NOT NULL AS has_fena_url FROM invoices ORDER BY id DESC LIMIT 3`;
  console.log(JSON.stringify(r, null, 1));
} else if (cmd === 'cleanup') {
  const customers = await sql`SELECT id FROM customers WHERE email = ${arg1}`;
  for (const c of customers) {
    await sql`DELETE FROM email_verification_tokens WHERE customer_id = ${c.id}`;
    await sql`DELETE FROM customer_sessions WHERE customer_id = ${c.id}`;
  }
  const d1 = await sql`DELETE FROM customers WHERE email = ${arg1} RETURNING id`;
  const d2 = await sql`DELETE FROM launch_subscribers WHERE email = ${arg1} RETURNING id`;
  const d3 = await sql`DELETE FROM discount_signups WHERE email = ${arg1} RETURNING id`;
  const d4 = await sql`DELETE FROM marketing_contacts WHERE email = ${arg1} RETURNING id`;
  console.log(`deleted customers=${d1.length} subscribers=${d2.length} signups=${d3.length} contacts=${d4.length}`);
} else {
  console.log('unknown command');
}
