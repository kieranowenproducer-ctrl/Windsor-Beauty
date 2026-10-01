import {
  getWorkspace,
  listCompanies,
  listMembers,
  logActivity,
  tasksConfigured,
  tsql,
  type TaskPriority,
} from '@/lib/tasks/db';
import { getMember } from '@/lib/tasks/identity';
import { notify } from '@/lib/tasks/notify';

export interface PearlTaskRow {
  id: string;
  task_number: number | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
  company: string;
  latest_agent_note: string | null;
}

export async function listPearlTasks(limit = 50): Promise<PearlTaskRow[]> {
  if (!tasksConfigured()) return [];
  const workspace = await getWorkspace();
  if (!workspace) return [];
  return await tsql()`
    SELECT t.id, t.task_number, t.title, t.description, t.status, t.priority,
           t.created_at, p.name AS company,
           (SELECT c.body FROM task_comments c WHERE c.task_id = t.id AND c.author_id IS NULL
            ORDER BY c.created_at DESC LIMIT 1) AS latest_agent_note
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.workspace_id = ${workspace.id}
      AND (t.task_type = 'pearl' OR t.title ILIKE 'PEARL:%')
    ORDER BY (t.status = 'done'), t.created_at DESC
    LIMIT ${limit}
  ` as PearlTaskRow[];
}

export async function createPearlTask(params: {
  title: string;
  description: string;
  priority?: TaskPriority;
}) {
  if (!tasksConfigured()) throw new Error('The task system is not connected.');
  const [workspace, member] = await Promise.all([getWorkspace(), getMember()]);
  if (!workspace || !member) throw new Error('Choose who you are in Tasks before creating a PEARL task.');
  const companies = await listCompanies(workspace.id);
  const company = companies.find((item) => item.name === 'Windsor Glow') || companies[0];
  if (!company) throw new Error('No Windsor Glow task list is set up.');

  await tsql()`
    INSERT INTO task_counters (workspace_id, next_number)
    VALUES (${workspace.id}, (SELECT COALESCE(MAX(task_number), 0) + 1 FROM tasks WHERE workspace_id = ${workspace.id}))
    ON CONFLICT (workspace_id) DO NOTHING
  `;
  const [counter] = await tsql()`
    UPDATE task_counters SET next_number = next_number + 1
    WHERE workspace_id = ${workspace.id}
    RETURNING next_number - 1 AS assigned
  ` as { assigned: number }[];
  const title = `PEARL: ${params.title.trim()}`.slice(0, 240);
  const [task] = await tsql()`
    INSERT INTO tasks
      (workspace_id, project_id, task_number, title, description, task_type, status, priority, created_by)
    VALUES
      (${workspace.id}, ${company.id}, ${counter.assigned}, ${title}, ${params.description.trim() || null},
       'pearl', 'todo', ${params.priority || 'medium'}, ${member.id})
    RETURNING id, task_number, title, status, due_date
  ` as Array<{ id: string; task_number: number; title: string; status: 'todo'; due_date: string | null }>;

  await logActivity(workspace.id, task.id, member.id, 'task_created', { title, taskType: 'pearl' });
  const members = await listMembers(workspace.id);
  void notify({
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    company: company.name,
    event: 'task_created',
    task,
    actor: member,
    members,
    detail: params.description.slice(0, 200) || undefined,
  });
  return task;
}
