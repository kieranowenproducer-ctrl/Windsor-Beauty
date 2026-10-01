// Read-only preflight for the existing dedicated affiliate test database.
// The connection must be supplied in DATABASE_URL by the invoking shell.
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
if (database.name !== 'windsor_beauty_affiliate_test') throw new Error('Database identity check failed.');
console.log(`Isolated affiliate test database confirmed: ${tables.count} public tables.`);
