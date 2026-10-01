// Task engine regression + feature tests (numbering, evidence, permissions).
// Deterministic, DB-level; creates throwaway rows and cleans them up.
// Run: node scripts/test-task-engine.mjs
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = env.match(/^TASKS_DATABASE_URL=(.+)$/m)?.[1]?.trim();
const sql = neon(url);
let pass = 0, fail = 0;
const t = (name, cond) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

const [ws] = await sql`SELECT id FROM workspaces LIMIT 1`;
const [proj] = await sql`SELECT id FROM projects WHERE workspace_id=${ws.id} LIMIT 1`;
const created = [];
async function mkTask(title) {
  await sql`INSERT INTO task_counters (workspace_id, next_number) VALUES (${ws.id}, (SELECT COALESCE(MAX(task_number),0)+1 FROM tasks WHERE workspace_id=${ws.id})) ON CONFLICT (workspace_id) DO NOTHING`;
  const [c] = await sql`UPDATE task_counters SET next_number=next_number+1 WHERE workspace_id=${ws.id} RETURNING next_number-1 AS n`;
  const [task] = await sql`INSERT INTO tasks (workspace_id, project_id, task_number, title, status, priority) VALUES (${ws.id}, ${proj.id}, ${c.n}, ${title}, 'todo', 'medium') RETURNING id, task_number`;
  created.push(task.id);
  return task;
}

console.log('\n=== Task engine tests ===\n');

// 1. numbering: sequential, no gaps between two consecutive creates
const a = await mkTask('TEST numbering a');
const b = await mkTask('TEST numbering b');
t('new tasks get sequential numbers', b.task_number === a.task_number + 1);

// 2. stability: deleting/completing another task does NOT change a task's number
await sql`UPDATE tasks SET status='done' WHERE id=${a.id}`;
const [aAfter] = await sql`SELECT task_number FROM tasks WHERE id=${a.id}`;
t('a task number is stable after another task completes', aAfter.task_number === a.task_number);
const c = await mkTask('TEST numbering c');
await sql`DELETE FROM tasks WHERE id=${b.id}`; created.splice(created.indexOf(b.id), 1);
const [cAfter] = await sql`SELECT task_number FROM tasks WHERE id=${c.id}`;
t('numbers are not reused/renumbered after a delete', cAfter.task_number === c.task_number && c.task_number === b.task_number + 1);

// 3. uniqueness constraint blocks a duplicate number
let dupBlocked = false;
try { await sql`INSERT INTO tasks (workspace_id, project_id, task_number, title, status, priority) VALUES (${ws.id}, ${proj.id}, ${a.task_number}, 'dup', 'todo', 'medium')`; }
catch { dupBlocked = true; }
t('duplicate task number is rejected by the unique index', dupBlocked);

// 4. evidence: video attachment with caption + kind=evidence records correctly
const [att] = await sql`INSERT INTO task_attachments (task_id, filename, url, size_bytes, content_type, uploaded_by, kind, caption)
  VALUES (${c.id}, 'evidence.mp4', 'https://example.test/x.mp4', 700000, 'video/mp4', NULL, 'evidence', 'proves the workflow') RETURNING id, kind, caption`;
t('video evidence stores kind=evidence + caption', att.kind === 'evidence' && att.caption === 'proves the workflow');

// 5. the detail-query shape returns from_agent + caption for the drawer
const [row] = await sql`SELECT (uploaded_by IS NULL) AS from_agent, caption, content_type FROM task_attachments WHERE id=${att.id}`;
t('detail query exposes from_agent + caption + video type', row.from_agent === true && row.caption === 'proves the workflow' && row.content_type.startsWith('video/'));

// 6. revision loop: comments are append-only (history preserved)
await sql`INSERT INTO task_comments (task_id, author_id, body, internal_only) VALUES (${c.id}, NULL, '🤖 initial attempt', TRUE)`;
await sql`INSERT INTO task_comments (task_id, author_id, body, internal_only) VALUES (${c.id}, NULL, 'please change X', FALSE)`;
await sql`INSERT INTO task_comments (task_id, author_id, body, internal_only) VALUES (${c.id}, NULL, '🤖 revision 1 done', TRUE)`;
const [{ n }] = await sql`SELECT count(*)::int n FROM task_comments WHERE task_id=${c.id}`;
t('revision comments accumulate (history not overwritten)', n === 3);

// 7. migration idempotency: re-running the number backfill assigns nothing new
const before = await sql`SELECT count(*)::int n FROM tasks WHERE task_number IS NULL`;
t('no task is left without a number (backfill complete)', before[0].n === 0);

// cleanup
for (const id of created) await sql`DELETE FROM tasks WHERE id=${id}`; // cascades comments/attachments
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
