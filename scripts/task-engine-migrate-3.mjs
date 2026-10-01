// Task engine migration 003 (idempotent): permanent per-workspace task numbers.
// Every task gets a stable human reference (#1, #2, ...) assigned at creation
// that NEVER changes on reorder/filter/delete. Additive + safe on existing data.
// Run: node scripts/task-engine-migrate-3.mjs
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = env.match(/^TASKS_DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) { console.error('TASKS_DATABASE_URL missing'); process.exit(1); }
const sql = neon(url);

// 1. The column (nullable first so it can be backfilled before the constraint).
await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_number INTEGER`;

// 2. A per-workspace counter table — the single source of the next number.
//    Atomic UPDATE ... RETURNING makes concurrent task creation race-safe
//    (no two tasks can draw the same number).
await sql`CREATE TABLE IF NOT EXISTS task_counters (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  next_number  INTEGER NOT NULL DEFAULT 1
)`;

// 3. Backfill existing tasks: number them per workspace in creation order, so
//    the oldest task is #1. Only touches rows that don't already have a number
//    (idempotent — re-running never renumbers).
const numbered = await sql`
  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY workspace_id ORDER BY created_at ASC, id ASC) AS n
    FROM tasks WHERE task_number IS NULL
  )
  UPDATE tasks t SET task_number = ranked.n
  FROM ranked WHERE t.id = ranked.id
  RETURNING t.id`;

// 4. Seed each workspace's counter to max(task_number)+1 so new tasks continue
//    the sequence without ever colliding with a backfilled number.
await sql`
  INSERT INTO task_counters (workspace_id, next_number)
  SELECT workspace_id, COALESCE(MAX(task_number), 0) + 1
  FROM tasks GROUP BY workspace_id
  ON CONFLICT (workspace_id) DO UPDATE
    SET next_number = GREATEST(task_counters.next_number, EXCLUDED.next_number)`;

// 5. Now enforce uniqueness per workspace (after backfill, so it can't fail).
await sql`CREATE UNIQUE INDEX IF NOT EXISTS tasks_workspace_number_uidx ON tasks (workspace_id, task_number)`;

const [{ n }] = await sql`SELECT count(*)::int n FROM tasks WHERE task_number IS NOT NULL`;
const counters = await sql`SELECT w.name, c.next_number FROM task_counters c JOIN workspaces w ON w.id = c.workspace_id`;
console.log(`Migration 003 complete. Backfilled ${numbered.length} tasks; ${n} tasks now numbered.`);
console.log('Counters:', counters.map((c) => `${c.name}: next #${c.next_number}`).join(' · '));
