// Task engine migration 002 (idempotent): remodel from client-workflow tasks
// to a simple internal team to-do list. Additive + data-normalising only.
// Run: node scripts/task-engine-migrate-2.mjs
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = env.match(/^TASKS_DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) { console.error('TASKS_DATABASE_URL missing'); process.exit(1); }
const sql = neon(url);

// 1. Multi-assign join table (assignee_id column kept for back-compat, unused)
await sql`
  CREATE TABLE IF NOT EXISTS task_assignees (
    task_id   UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, member_id)
  )`;
// migrate existing single assignees into the join table
await sql`
  INSERT INTO task_assignees (task_id, member_id)
  SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL
  ON CONFLICT DO NOTHING`;

// 2. Binary status model: everything not done becomes 'todo'
const collapsed = await sql`
  UPDATE tasks SET status = 'todo' WHERE status NOT IN ('todo', 'done') RETURNING id`;

// 3. Team wording: no client role in this workspace's memberships
await sql`UPDATE workspace_members SET role = 'staff' WHERE role = 'client'`;

console.log(`migrated: task_assignees ready, ${collapsed.length} tasks collapsed to todo, roles normalised`);
console.log('DONE');
