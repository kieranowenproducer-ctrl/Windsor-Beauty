// One-time (idempotent) setup for the shared Task Engine database.
// Creates a SEPARATE `taskengine` database in the same Neon project as the
// site DB (no contact with live tables), creates the schema, seeds the
// Windsor Glow workspace, and appends TASKS_DATABASE_URL to .env.local.
//
// Run locally:  node scripts/task-engine-setup.mjs [--member "Name <email>"]
// Never prints connection strings or secrets.

import { neon } from '@neondatabase/serverless';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const envPath = new URL('../.env.local', import.meta.url);
const parse = (p) => {
  if (!existsSync(p)) return {};
  return Object.fromEntries(
    readFileSync(p, 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
  );
};
// DATABASE_URL lives in .env.production.local (vercel env pull); .env.local wins if both
const env = { ...parse(new URL('../.env.production.local', import.meta.url)), ...parse(envPath) };

const siteUrl = env.NEON_ADMIN_URL || env.DATABASE_URL;
if (!siteUrl) { console.error('DATABASE_URL not found in .env.local or .env.production.local'); process.exit(1); }

const u = new URL(siteUrl);
const TASK_DB = 'taskengine';
const tasksUrl = (() => { const t = new URL(siteUrl); t.pathname = `/${TASK_DB}`; return t.toString(); })();

// 1. Create the database if missing (connect to the existing db to issue it)
const root = neon(siteUrl);
const exists = await root`SELECT 1 FROM pg_database WHERE datname = ${TASK_DB}`;
if (exists.length === 0) {
  await root.query(`CREATE DATABASE ${TASK_DB}`);
  console.log(`created database "${TASK_DB}" in the same Neon project`);
} else {
  console.log(`database "${TASK_DB}" already exists`);
}

// 2. Schema (idempotent)
const sql = neon(tasksUrl);
const ddl = [
  `CREATE TABLE IF NOT EXISTS task_users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
     is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS workspaces (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, accent TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS workspace_members (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
     user_id UUID NOT NULL REFERENCES task_users(id) ON DELETE CASCADE,
     role TEXT NOT NULL CHECK (role IN ('workspace_admin','staff','client')),
     notify_email TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (workspace_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS projects (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
     name TEXT NOT NULL, description TEXT,
     archived BOOLEAN NOT NULL DEFAULT FALSE, sort_order INT NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS project_access (
     project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
     PRIMARY KEY (project_id, member_id))`,
  `CREATE TABLE IF NOT EXISTS tasks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
     project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     title TEXT NOT NULL, description TEXT,
     status TEXT NOT NULL DEFAULT 'todo'
       CHECK (status IN ('todo','analysing','in_progress','ready_for_review','needs_review','needs_kieran','waiting_client','failed','done','approved','deploying','deploy_failed')),
     priority TEXT NOT NULL DEFAULT 'medium'
       CHECK (priority IN ('low','medium','high','urgent')),
     due_date DATE, start_date DATE,
     assignee_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
     created_by UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
     completed_at TIMESTAMPTZ, completed_by UUID REFERENCES workspace_members(id),
     approved_at TIMESTAMPTZ, approved_by UUID REFERENCES workspace_members(id),
     recurrence_rule TEXT,
     sort_order INT NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_ws_status ON tasks(workspace_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(workspace_id, due_date)`,
  `CREATE TABLE IF NOT EXISTS task_subtasks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     title TEXT NOT NULL, done BOOLEAN NOT NULL DEFAULT FALSE,
     sort_order INT NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS task_comments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     author_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
     body TEXT NOT NULL, internal_only BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS task_attachments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     filename TEXT NOT NULL, url TEXT NOT NULL, size_bytes INT,
     uploaded_by UUID REFERENCES workspace_members(id),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS task_activity_log (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     workspace_id UUID NOT NULL, task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
     actor_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
     action TEXT NOT NULL, detail JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_activity_task ON task_activity_log(task_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS task_notifications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     workspace_id UUID NOT NULL, task_id UUID,
     event TEXT NOT NULL, recipient TEXT NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
     provider_id TEXT, error TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS notification_preferences (
     member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
     event_key TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
     PRIMARY KEY (member_id, event_key))`,
  `CREATE TABLE IF NOT EXISTS workspace_email_settings (
     workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
     from_name TEXT NOT NULL, from_email TEXT NOT NULL, reply_to TEXT,
     resend_key_env_name TEXT NOT NULL DEFAULT 'RESEND_API_KEY',
     template_overrides JSONB)`,
];
for (const stmt of ddl) await sql.query(stmt);
console.log('schema ready (14 objects, idempotent)');

// 3. Seed Windsor Glow workspace + owner + email settings
const [ws] = await sql`
  INSERT INTO workspaces (slug, name, accent) VALUES ('windsor-glow', 'Windsor Glow', '#b45309')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
const [owner] = await sql`
  INSERT INTO task_users (email, name, is_super_admin)
  VALUES ('kieranowenproducer@gmail.com', 'Kieran', TRUE)
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
await sql`
  INSERT INTO workspace_members (workspace_id, user_id, role, notify_email)
  VALUES (${ws.id}, ${owner.id}, 'workspace_admin', 'kieranowenproducer@gmail.com')
  ON CONFLICT (workspace_id, user_id) DO NOTHING`;
await sql`
  INSERT INTO workspace_email_settings (workspace_id, from_name, from_email, resend_key_env_name)
  VALUES (${ws.id}, 'Windsor Glow Tasks', 'tasks@windsorglow.com', 'RESEND_API_KEY')
  ON CONFLICT (workspace_id) DO NOTHING`;

// Optional teammate: node scripts/task-engine-setup.mjs --member "Name <email@x.com>"
const mi = process.argv.indexOf('--member');
if (mi > -1 && process.argv[mi + 1]) {
  const m = process.argv[mi + 1].match(/^(.+?)\s*<(.+)>$/);
  if (m) {
    const [u2] = await sql`INSERT INTO task_users (email, name) VALUES (${m[2].trim()}, ${m[1].trim()})
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
    await sql`INSERT INTO workspace_members (workspace_id, user_id, role, notify_email)
      VALUES (${ws.id}, ${u2.id}, 'staff', ${m[2].trim()}) ON CONFLICT (workspace_id, user_id) DO NOTHING`;
    console.log(`member added: ${m[1].trim()}`);
  }
}
console.log('seeded: workspace windsor-glow, owner Kieran, email settings (tasks@windsorglow.com)');

// 4. Ensure TASKS_DATABASE_URL in .env.local (never printed)
const envRaw = readFileSync(envPath, 'utf8');
if (!envRaw.includes('TASKS_DATABASE_URL=')) {
  writeFileSync(envPath, envRaw.replace(/\n?$/, '\n') + `TASKS_DATABASE_URL=${tasksUrl}\n`);
  console.log('TASKS_DATABASE_URL appended to .env.local');
} else console.log('TASKS_DATABASE_URL already present');
console.log('DONE');
