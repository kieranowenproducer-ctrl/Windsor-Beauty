// Task Engine database client. This is a SEPARATE database (taskengine) from the
// live site DB — one shared task database serving every business workspace, with
// this app pinned to the windsor-glow workspace (see workspace.ts). Reusable: the
// whole src/lib/tasks + /admin/tasks + /api/admin/tasks set is the drop-in module.
import { neon } from '@neondatabase/serverless';

let client: ReturnType<typeof neon> | null = null;

export function tasksConfigured(): boolean {
  return Boolean(process.env.TASKS_DATABASE_URL);
}

export function tsql() {
  if (!client) {
    const url = process.env.TASKS_DATABASE_URL;
    if (!url) throw new Error('TASKS_DATABASE_URL is not configured');
    client = neon(url, { fetchOptions: { cache: 'no-store' } });
  }
  return client;
}

// This app's fixed workspace — the only hardcoded business coupling in the module.
export const WORKSPACE_SLUG = 'windsor-glow';

// 'todo' and 'done' are the human-facing states. The middle states are set by
// the automation agent (analysing -> in_progress -> ready_for_review, or
// needs_kieran / failed). 'needs_review' and 'waiting_client' are kept from the
// original schema. All are a superset — the DB constraint was widened to match
// (scripts/task-automation-schema.mjs).
export const TASK_STATUSES = [
  'todo', 'analysing', 'in_progress', 'ready_for_review',
  'needs_review', 'needs_kieran', 'waiting_client', 'failed', 'done',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  analysing: 'Analysing',
  in_progress: 'In Progress',
  ready_for_review: 'Ready for Review',
  needs_review: 'Needs Review',
  needs_kieran: 'Needs Kieran',
  waiting_client: 'Waiting on Client',
  failed: 'Failed',
  done: 'Done',
};

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Member {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: 'workspace_admin' | 'staff' | 'client';
}

export async function getWorkspace(): Promise<{ id: string; name: string } | null> {
  const rows = await tsql()`SELECT id, name FROM workspaces WHERE slug = ${WORKSPACE_SLUG}` as { id: string; name: string }[];
  return rows[0] ?? null;
}

export async function listMembers(workspaceId: string): Promise<Member[]> {
  return await tsql()`
    SELECT m.id, m.user_id, u.name, u.email, m.role
    FROM workspace_members m JOIN task_users u ON u.id = m.user_id
    WHERE m.workspace_id = ${workspaceId} ORDER BY u.name` as Member[];
}

export interface Company { id: string; name: string }

/** The company lists (projects). First one (by sort_order) is the default. */
export async function listCompanies(workspaceId: string): Promise<Company[]> {
  return await tsql()`
    SELECT id, name FROM projects
    WHERE workspace_id = ${workspaceId} AND archived = FALSE
    ORDER BY sort_order, created_at` as Company[];
}

export async function getTaskSetting(workspaceId: string, key: string): Promise<string | null> {
  const rows = await tsql()`
    SELECT value FROM task_settings WHERE workspace_id = ${workspaceId} AND key = ${key}` as { value: string }[];
  return rows[0]?.value ?? null;
}

export async function setTaskSetting(workspaceId: string, key: string, value: string): Promise<void> {
  await tsql()`
    INSERT INTO task_settings (workspace_id, key, value) VALUES (${workspaceId}, ${key}, ${value})
    ON CONFLICT (workspace_id, key) DO UPDATE SET value = EXCLUDED.value`;
}

export async function logActivity(
  workspaceId: string,
  taskId: string | null,
  actorId: string | null,
  action: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  await tsql()`
    INSERT INTO task_activity_log (workspace_id, task_id, actor_id, action, detail)
    VALUES (${workspaceId}, ${taskId}, ${actorId}, ${action}, ${detail ? JSON.stringify(detail) : null})`;
}
