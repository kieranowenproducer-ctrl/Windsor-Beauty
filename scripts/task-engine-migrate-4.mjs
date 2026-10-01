// Task engine migration 004 (idempotent): per-attachment caption, so each
// piece of evidence (screenshot or screen recording) can carry a short written
// explanation of what it proves, shown next to the file in the review drawer.
// Run: node scripts/task-engine-migrate-4.mjs
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = env.match(/^TASKS_DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) { console.error('TASKS_DATABASE_URL missing'); process.exit(1); }
const sql = neon(url);

await sql`ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS caption TEXT`;

const [{ n }] = await sql`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='task_attachments' AND column_name='caption'`;
console.log(`Migration 004 complete. task_attachments.caption ${n ? 'present' : 'MISSING'}.`);
