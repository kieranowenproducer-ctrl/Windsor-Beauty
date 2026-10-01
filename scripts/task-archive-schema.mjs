// Additive, idempotent migration for "save this info and archive it" (task
// 12881e9c). Adds one nullable column to the SEPARATE `taskengine` database.
// Never drops, alters or rewrites existing task data.
//
//   node scripts/task-archive-schema.mjs           # dry run: prints the SQL
//   node scripts/task-archive-schema.mjs --apply   # applies it
//
// WHY A COLUMN AND NOT A NEW STATUS. `tasks.status` carries a CHECK constraint
// on a shared live database that the task scheduler is using right now. Adding
// a value there means dropping and re-adding that constraint. A nullable column
// cannot reject an existing row, is inert until the new code reads it, and can
// be applied before the deploy without anything noticing — which is the order
// this has to happen in, since the Tasks screen would break if the code went
// live first.
//
// Connection: TASKS_DATABASE_URL from .env.local (the taskengine DB), same as
// the rest of the Task Engine. Never prints connection strings.

import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'node:fs';

const parse = (p) => {
  if (!existsSync(p)) return {};
  return Object.fromEntries(readFileSync(p, 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
};
const env = { ...parse(new URL('../.env.production.local', import.meta.url)), ...parse(new URL('../.env.local', import.meta.url)) };
const url = env.TASKS_DATABASE_URL;
if (!url) { console.error('TASKS_DATABASE_URL not found in .env.local'); process.exit(1); }

const DDL = [
  // When this task was filed away to be read later. NULL = not archived, which
  // is every task that exists today.
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`,
  // The Archive tab lists by newest first, and every other view filters on
  // "archived_at IS NULL".
  `CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(workspace_id, archived_at)`,
];

const apply = process.argv.includes('--apply');
if (!apply) {
  console.log('DRY RUN. Additive only: one nullable column and one index.\n');
  console.log(DDL.join(';\n\n') + ';');
  console.log('\nRun again with --apply to apply.');
  process.exit(0);
}

const sql = neon(url);
for (const stmt of DDL) { await sql.query(stmt); console.log('ok:', stmt.split('\n')[0].trim().slice(0, 70)); }

const [{ total, archived }] = await sql`
  SELECT COUNT(*)::int AS total, COUNT(archived_at)::int AS archived FROM tasks`;
console.log(`\nDone. ${total} tasks, ${archived} archived. Additive only — no existing task data changed.`);
