// GET: the team's tasks (todo + done, with assignees and images).
// POST: create a task — multi-assign, image attachments, team notifications.
import { NextRequest, NextResponse } from 'next/server';
import { tsql, getWorkspace, logActivity, listMembers, listCompanies, TASK_PRIORITIES, type TaskPriority } from '@/lib/tasks/db';
import { getMember } from '@/lib/tasks/identity';
import { notify } from '@/lib/tasks/notify';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ws = await getWorkspace();
  if (!ws) return NextResponse.json({ tasks: [] });
  const search = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const tasks = await tsql()`
    SELECT t.id, t.task_number, t.title, t.description, t.status, t.task_type, t.priority, t.due_date,
           t.created_at, t.completed_at, t.archived_at, t.project_id,
           p.name AS company,
           cu.name AS created_by_name,
           du.name AS completed_by_name,
           COALESCE((
             SELECT json_agg(json_build_object('id', m.id, 'name', u.name))
             FROM task_assignees ta
             JOIN workspace_members m ON m.id = ta.member_id
             JOIN task_users u ON u.id = m.user_id
             WHERE ta.task_id = t.id
           ), '[]'::json) AS assignees,
           COALESCE((
             SELECT json_agg(json_build_object('url', a.url, 'filename', a.filename, 'content_type', a.content_type))
             FROM task_attachments a WHERE a.task_id = t.id AND a.removed_at IS NULL
           ), '[]'::json) AS images,
           (SELECT COUNT(*)::int FROM task_comments c WHERE c.task_id = t.id) AS comment_count,
           -- The latest note from the agent (author_id IS NULL) — shown on the
           -- card for Needs Attention / review tasks so the reviewer can read
           -- the question and respond without opening the task.
           (SELECT c.body FROM task_comments c WHERE c.task_id = t.id AND c.author_id IS NULL ORDER BY c.created_at DESC LIMIT 1) AS latest_agent_note
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN workspace_members cm ON cm.id = t.created_by
    LEFT JOIN task_users cu ON cu.id = cm.user_id
    LEFT JOIN workspace_members dm ON dm.id = t.completed_by
    LEFT JOIN task_users du ON du.id = dm.user_id
    WHERE t.workspace_id = ${ws.id}
      AND (${search} = '' OR t.title ILIKE ${'%' + search + '%'})
    ORDER BY (t.status = 'done'), t.due_date NULLS LAST, t.created_at DESC`;
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const [ws, me] = await Promise.all([getWorkspace(), getMember()]);
  if (!ws || !me) return NextResponse.json({ error: 'Pick who you are first' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'A task title is required' }, { status: 400 });
  const priority: TaskPriority = TASK_PRIORITIES.includes(b.priority) ? b.priority : 'medium';
  const assigneeIds: string[] = Array.isArray(b.assigneeIds) ? b.assigneeIds : [];
  const images: { url: string; filename?: string; size?: number; contentType?: string }[] = Array.isArray(b.images) ? b.images : [];

  // Company = project. Validate the selection; fall back to the first company
  // (Windsor Glow, by sort_order) so a task can never be created without one.
  const companies = await listCompanies(ws.id);
  if (companies.length === 0) return NextResponse.json({ error: 'No company lists set up — run task-companies-setup' }, { status: 500 });
  const company = companies.find((c) => c.id === b.companyId) ?? companies[0];

  // Draw the next permanent task number from the per-workspace counter, where
  // next_number = "the next number to assign". Seed it if this workspace has no
  // counter yet, then atomically increment and return the PRE-increment value
  // (race-safe: two concurrent creates can never draw the same number, and the
  // unique (workspace_id, task_number) index is the final backstop).
  await tsql()`
    INSERT INTO task_counters (workspace_id, next_number)
    VALUES (${ws.id}, (SELECT COALESCE(MAX(task_number), 0) + 1 FROM tasks WHERE workspace_id = ${ws.id}))
    ON CONFLICT (workspace_id) DO NOTHING`;
  const [counter] = await tsql()`
    UPDATE task_counters SET next_number = next_number + 1
    WHERE workspace_id = ${ws.id}
    RETURNING next_number - 1 AS assigned` as { assigned: number }[];
  const taskNumber = counter.assigned;

  const [task] = await tsql()`
    INSERT INTO tasks (workspace_id, project_id, task_number, title, description, status, priority, due_date, created_by)
    VALUES (${ws.id}, ${company.id}, ${taskNumber}, ${title}, ${String(b.description ?? '').trim() || null}, 'todo',
            ${priority}, ${b.dueDate || null}, ${me.id})
    RETURNING id, task_number, title, status, due_date` as { id: string; task_number: number; title: string; status: 'todo' | 'done'; due_date: string | null }[];

  for (const memberId of assigneeIds) {
    await tsql()`INSERT INTO task_assignees (task_id, member_id) VALUES (${task.id}, ${memberId}) ON CONFLICT DO NOTHING`;
  }
  for (const img of images) {
    if (typeof img?.url !== 'string' || !/^https?:\/\//.test(img.url)) continue;
    await tsql()`
      INSERT INTO task_attachments (task_id, filename, url, size_bytes, content_type, uploaded_by)
      VALUES (${task.id}, ${img.filename ?? 'file'}, ${img.url}, ${img.size ?? null}, ${img.contentType ?? null}, ${me.id})`;
    // Close the upload ledger entry for this file (see upload/route.ts).
    await tsql()`UPDATE upload_attempts SET completed_at = now()
      WHERE completed_at IS NULL AND strpos(${img.url}, split_part(pathname, '.', 1)) > 0`.catch(() => {});
  }
  await logActivity(ws.id, task.id, me.id, 'task_created', { title, assignees: assigneeIds.length, images: images.length });

  const members = await listMembers(ws.id);
  // One email per creation, to the whole team; assignees are named in the
  // detail line instead of getting a separate second email.
  const assigneeNames = members.filter((m) => assigneeIds.includes(m.id)).map((m) => m.name);
  const description = String(b.description ?? '').trim().slice(0, 140);
  const detailParts = [
    assigneeNames.length > 0 ? `Assigned to: ${assigneeNames.join(', ')}` : '',
    description,
  ].filter(Boolean);
  void notify({
    workspaceId: ws.id, workspaceName: ws.name, company: company.name, event: 'task_created',
    task, actor: me, members,
    detail: detailParts.join(' | ').slice(0, 200) || undefined,
  });
  return NextResponse.json({ ok: true, id: task.id });
}
