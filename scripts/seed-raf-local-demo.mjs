// Seed an invented affiliate only in the existing isolated affiliate test database.
// This is never a production setup or a live affiliate account change.
import { randomBytes } from 'node:crypto';

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error('No test DATABASE_URL was provided.');
const url = new URL(raw);
if (decodeURIComponent(url.pathname) !== '/windsor_beauty_affiliate_test' || !url.hostname.startsWith('ep-round-cloud-')) {
  throw new Error('Refusing a connection outside the existing affiliate test database and branch.');
}
const { neon } = await import('@neondatabase/serverless');
const sql = neon(raw);
const [database] = await sql`SELECT current_database() AS name`;
const [tables] = await sql`
  SELECT COUNT(*)::INTEGER AS count FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
`;
if (database.name !== 'windsor_beauty_affiliate_test' || tables.count !== 0) {
  throw new Error('The dedicated demo database must be empty before seeding.');
}

const { ensureSchema } = await import('../src/lib/db/schema.ts');
const { hashPassword } = await import('../src/lib/auth.ts');
const { createAffiliateProfile } = await import('../src/lib/affiliates.ts');
await ensureSchema();
const email = 'raf-demo@example.test';
const password = `RafDemo-${randomBytes(9).toString('base64url')}!`;
const [customer] = await sql`
  INSERT INTO customers (email, password_hash, first_name, last_name, email_verified)
  VALUES (${email}, ${hashPassword(password)}, 'Demo', 'Partner', TRUE)
  RETURNING id
`;
await createAffiliateProfile({ customerId: Number(customer.id), displayName: 'Demo Partner', referralCode: 'PARTNER', durationDays: 183 });
console.log(`Isolated demo affiliate ready. Login: ${email}`);
console.log(`One-time test password: ${password}`);
