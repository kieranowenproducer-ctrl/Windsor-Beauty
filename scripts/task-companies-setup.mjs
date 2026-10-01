// Idempotent upgrade for the Task Engine: companies + media retention.
// - Seeds the three company lists (Windsor Glow / AI Idiots / Social Media Engine)
//   as projects in the windsor-glow workspace
// - Moves any tasks still in the hidden "General" project to Windsor Glow and
//   archives General
// - Adds media columns to task_attachments (content type, retention/removal)
// - Creates task_settings and seeds video_retention_days=30
//
// Run locally: node scripts/task-companies-setup.mjs

import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'node:fs';

const parse = (p) => {
  if (!existsSync(p)) return {};
  return Object.fromEntries(
    readFileSync(p, 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
  );
};
const env = {
  ...parse(new URL('../.env.production.local', import.meta.url)),
  ...parse(new URL('../.env.local', import.meta.url)),
};
if (!env.TASKS_DATABASE_URL) { console.error('TASKS_DATABASE_URL not found'); process.exit(1); }
const sql = neon(env.TASKS_DATABASE_URL);

const [ws] = await sql`SELECT id FROM workspaces WHERE slug = 'windsor-glow'`;
if (!ws) { console.error('windsor-glow workspace missing — run task-engine-setup.mjs first'); process.exit(1); }

// 1. Schema additions (idempotent)
const ddl = [
  `ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS content_type TEXT`,
  `ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`,
  `ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ`,
  `ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS removed_note TEXT`,
  `ALTER TABLE task_attachments ALTER COLUMN size_bytes TYPE BIGINT`,
  `CREATE TABLE IF NOT EXISTS task_settings (
     workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
     key TEXT NOT NULL, value TEXT NOT NULL,
     PRIMARY KEY (workspace_id, key))`,
];
for (const stmt of ddl) await sql.query(stmt);
console.log('schema additions applied');

// 2. Company lists
const COMPANIES = ['Windsor Glow', 'AI Idiots', 'Social Media Engine'];
const ids = {};
for (let i = 0; i < COMPANIES.length; i++) {
  const existing = await sql`
    SELECT id FROM projects WHERE workspace_id = ${ws.id} AND name = ${COMPANIES[i]}`;
  if (existing[0]) {
    ids[COMPANIES[i]] = existing[0].id;
    await sql`UPDATE projects SET sort_order = ${i}, archived = FALSE WHERE id = ${existing[0].id}`;
  } else {
    const [row] = await sql`
      INSERT INTO projects (workspace_id, name, description, sort_order)
      VALUES (${ws.id}, ${COMPANIES[i]}, 'Company list', ${i}) RETURNING id`;
    ids[COMPANIES[i]] = row.id;
  }
}
console.log('companies ready:', COMPANIES.join(' / '));

// 3. Any project that is NOT one of the three companies (the old hidden
//    "General", the early "Website fixes" scaffold, anything else) gets its
//    tasks moved to Windsor Glow and is archived — the company list is canonical.
const strays = await sql`
  SELECT id, name FROM projects
  WHERE workspace_id = ${ws.id} AND archived = FALSE
    AND name <> ALL(${COMPANIES})`;
for (const stray of strays) {
  const moved = await sql`
    UPDATE tasks SET project_id = ${ids['Windsor Glow']} WHERE project_id = ${stray.id} RETURNING id`;
  await sql`UPDATE projects SET archived = TRUE, sort_order = 99 WHERE id = ${stray.id}`;
  console.log(`archived stray project "${stray.name}" (${moved.length} task(s) moved to Windsor Glow)`);
}
if (strays.length === 0) console.log('no stray projects (nothing to move)');

// 4. Default retention setting
await sql`
  INSERT INTO task_settings (workspace_id, key, value)
  VALUES (${ws.id}, 'video_retention_days', '30')
  ON CONFLICT (workspace_id, key) DO NOTHING`;
console.log('video_retention_days setting present');
console.log('DONE');
