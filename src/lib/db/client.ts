import { neon } from '@neondatabase/serverless';

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED;

// `cache: 'no-store'` is forced on every request this driver makes — without it,
// Next.js's fetch Data Cache silently caches the HTTP calls to Neon's Data API
// (keyed by query text), so reads can return stale results forever regardless
// of `export const dynamic = 'force-dynamic'` on the calling route.
export const sql = connectionString
  ? neon(connectionString, { fetchOptions: { cache: 'no-store' } })
  : null;

export function isDbConfigured() {
  return sql !== null;
}

// Exported so the split db modules (schema, and the db.ts query layer) can each
// obtain the checked client without re-deriving the connection. Was module-local
// while everything lived in one file.
export function requireDb() {
  if (!sql) throw new Error('Database not configured — set DATABASE_URL in environment variables');
  return sql;
}
