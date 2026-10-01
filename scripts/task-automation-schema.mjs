// Additive, idempotent migration for the Task Automation agent (Phase 2).
// Adds automation statuses + task_type + agent bookkeeping to the SEPARATE
// `taskengine` database. Never drops or alters existing task data.
//
//   node scripts/task-automation-schema.mjs          # dry run: prints the SQL
//   node scripts/task-automation-schema.mjs --apply   # applies it
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

// Superset of the original 5 (todo/in_progress/waiting_client/needs_review/done)
// plus the automation states, so widening can never reject an existing row.
// v3 deploy pipeline (2026-07-10): approved / deploying / deploy_failed added —
// approval now starts a verified deployment instead of instantly meaning done.
const NEW_STATUSES = ['todo', 'analysing', 'in_progress', 'ready_for_review', 'needs_review', 'needs_kieran', 'waiting_client', 'failed', 'done', 'approved', 'deploying', 'deploy_failed'];
const statusList = NEW_STATUSES.map((s) => `'${s}'`).join(',');

const DDL = [
  // Additive columns on tasks
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type TEXT`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS agent_state TEXT DEFAULT 'new'`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS agent_locked_at TIMESTAMPTZ`,
  // input vs output attachments
  `ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'input'`,
  // one row per agent run — full audit
  `CREATE TABLE IF NOT EXISTS agent_runs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
     status TEXT, business TEXT, task_type TEXT,
     safety_tier SMALLINT, confidence SMALLINT,
     plan_md TEXT, report_md TEXT, verify_md TEXT, evidence JSONB,
     model TEXT, cost_usd NUMERIC(8,4), error TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_id, created_at)`,
];

async function widenStatusConstraint(sql) {
  // Find and drop ANY check constraint on tasks that references the status column,
  // then add the widened superset. Robust to the auto-generated constraint name.
  const cons = await sql`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'tasks'::regclass AND contype = 'c'`;
  for (const c of cons) {
    // Postgres rewrites `status IN (...)` as `status = ANY (ARRAY[...])`, so match
    // on the column name alone, not the IN syntax.
    if (/\bstatus\b/i.test(c.def)) {
      await sql.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS "${c.conname}"`);
      console.log('dropped old status constraint:', c.conname);
    }
  }
  await sql.query(`ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN (${statusList}))`);
  console.log('added widened status constraint');
}

const apply = process.argv.includes('--apply');
if (!apply) {
  console.log('DRY RUN. Would widen tasks.status to:', NEW_STATUSES.join(', '));
  console.log('\n' + DDL.join(';\n\n') + ';');
  console.log('\nRun again with --apply to apply.');
  process.exit(0);
}

const sql = neon(url);
for (const stmt of DDL) { await sql.query(stmt); console.log('ok:', stmt.split('\n')[0].trim().slice(0, 70)); }
await widenStatusConstraint(sql);
console.log('\nDone. Additive only — no existing task data changed.');
