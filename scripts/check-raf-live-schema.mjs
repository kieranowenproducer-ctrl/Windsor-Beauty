// Read-only launch check. Pass the live connection through WB_RAF_READONLY_DATABASE_URL.
// This script never calls ensureSchema or changes database data.
const url = process.env.WB_RAF_READONLY_DATABASE_URL;
if (!url) {
  console.error('Set WB_RAF_READONLY_DATABASE_URL to run the read-only schema check.');
  process.exit(1);
}

let parsed;
try { parsed = new URL(url); } catch {
  console.error('The database URL is invalid.');
  process.exit(1);
}
if (decodeURIComponent(parsed.pathname.slice(1)) === 'windsor_beauty_affiliate_test' || parsed.hostname.startsWith('ep-round-cloud-')) {
  console.error('This check is for the live branch, not the isolated test branch.');
  process.exit(1);
}

const { neon } = await import('@neondatabase/serverless');
const sql = neon(url);
const rows = await sql`
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'affiliate_profiles' AND column_name IN ('request_key', 'status'))
      OR (table_name = 'affiliate_invitations' AND column_name IN
        ('created_source', 'delivery_status', 'email_requested_at', 'email_sent_at', 'email_provider_id', 'token_hash'))
    )
`;
const present = new Set(rows.map(row => `${row.table_name}.${row.column_name}`));
const required = [
  'affiliate_profiles.request_key',
  'affiliate_profiles.status',
  'affiliate_invitations.created_source',
  'affiliate_invitations.delivery_status',
  'affiliate_invitations.email_requested_at',
  'affiliate_invitations.email_sent_at',
  'affiliate_invitations.email_provider_id',
  'affiliate_invitations.token_hash',
];
const missing = required.filter(name => !present.has(name));
console.log(missing.length
  ? `Live RAF invitation schema is not ready. Missing: ${missing.join(', ')}`
  : 'Live RAF invitation schema has all required fields.');
const [profile] = await sql`SELECT status FROM affiliate_profiles WHERE customer_id = 83 LIMIT 1`;
console.log(`Live Raf profile: ${profile?.status ?? 'not found'}.`);
process.exitCode = missing.length || profile?.status !== 'paused' ? 1 : 0;
