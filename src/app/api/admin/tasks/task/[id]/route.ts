// GET: full task detail (company, assignees, attachments, comments, activity).
// PATCH actions: complete | reopen | comment | add_attachment | remove_attachment
//                | update (fields + assignees + company)
import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { tsql, getWorkspace, logActivity, listMembers, listCompanies, getTaskSetting, TASK_PRIORITIES } from '@/lib/tasks/db';
import { getMember } from '@/lib/tasks/identity';
import { notify } from '@/lib/tasks/notify';
import { cleanupExpiredTaskMedia, retentionDaysFrom } from '@/lib/tasks/cleanup';

export const dynamic = 'force-dynamic';

async function loadTask(wsId: string, id: string) {
  const rows = await tsql()`
    SELECT t.*, p.name AS company FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.id = ${id} AND t.workspace_id = ${wsId}` as (Record<string, unknown> & {
      id: string; title: string; status: 'todo' | 'done'; due_date: string | null;
      project_id: string; company: string;
    })[];
  return rows[0];
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const ws = await getWorkspace();
  if (!ws) return NextResponse.json({ error: 'Not set up' }, { status: 400 });
  const task = await loadTask(ws.id, params.id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [assignees, attachments, comments, activity, retention, runs] = await Promise.all([
    tsql()`SELECT m.id, u.name FROM task_assignees ta
           JOIN workspace_members m ON m.id = ta.member_id
           JOIN task_users u ON u.id = m.user_id WHERE ta.task_id = ${params.id}`,
    tsql()`SELECT id, filename, url, size_bytes, content_type, expires_at, removed_at, removed_note, caption, kind,
           (uploaded_by IS NULL) AS from_agent
           FROM task_attachments WHERE task_id = ${params.id} ORDER BY created_at`,
    tsql()`
      SELECT c.id, c.body, c.created_at, u.name AS author_name
      FROM task_comments c
      LEFT JOIN workspace_members m ON m.id = c.author_id
      LEFT JOIN task_users u ON u.id = m.user_id
      WHERE c.task_id = ${params.id} ORDER BY c.created_at`,
    tsql()`
      SELECT a.action, a.detail, a.created_at, u.name AS actor_name
      FROM task_activity_log a
      LEFT JOIN workspace_members m ON m.id = a.actor_id
      LEFT JOIN task_users u ON u.id = m.user_id
      WHERE a.task_id = ${params.id} ORDER BY a.created_at DESC LIMIT 30`,
    getTaskSetting(ws.id, 'video_retention_days'),
    // Agent Panel data (audit M1): the structured briefs/reports the agent persists.
    tsql()`SELECT id, status, plan_md, report_md, verify_md, model, created_at
           FROM agent_runs WHERE task_id = ${params.id} ORDER BY created_at ASC`.catch(() => []),
  ]);
  return NextResponse.json({
    task, assignees, attachments, comments, activity, runs,
    retentionDays: retentionDaysFrom(retention as string | null),
  });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [ws, me] = await Promise.all([getWorkspace(), getMember()]);
  if (!ws || !me) return NextResponse.json({ error: 'Pick who you are first' }, { status: 401 });
  const task = await loadTask(ws.id, params.id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const members = await listMembers(ws.id);
  const fire = (event: 'task_completed' | 'task_updated' | 'task_assigned' | 'comment_added', detail?: string, onlyMemberIds?: string[], company?: string) =>
    void notify({
      workspaceId: ws.id, workspaceName: ws.name, company: company ?? task.company, event,
      task: { id: task.id, task_number: (task.task_number as number | null) ?? null, title: task.title, status: event === 'task_completed' ? 'done' : task.status, due_date: task.due_date },
      actor: me, members, detail, onlyMemberIds,
    });

  switch (b.action) {
    case 'complete': {
      if (task.status === 'done') return NextResponse.json({ ok: true });
      // State coherence: a human ticking a task done clears any agent claim on it —
      // status and agent_state must never contradict (audit C1; live data once held
      // done + needs_kieran simultaneously).
      await tsql()`
        UPDATE tasks SET status = 'done', agent_state = NULL, agent_locked_at = NULL,
          completed_at = NOW(), completed_by = ${me.id}, updated_at = NOW()
        WHERE id = ${task.id}`;
      // Videos on completed tasks get an expiry date (space management); photos
      // and text history are kept. Reopening clears it. Zero days = expire now,
      // which the cleanup below acts on immediately.
      // retentionDaysFrom, never `|| DEFAULT` — see its comment: a stored 0 is
      // falsy, so the old read turned "delete immediately" into "keep a month".
      const days = retentionDaysFrom(await getTaskSetting(ws.id, 'video_retention_days'));
      await tsql()`
        UPDATE task_attachments
        SET expires_at = NOW() + make_interval(days => ${days})
        WHERE task_id = ${task.id} AND removed_at IS NULL AND content_type LIKE 'video/%'`;
      // Delete straight away rather than waiting for the nightly sweep. Failure
      // here must never block completing a task — the daily cron retries.
      void cleanupExpiredTaskMedia().catch(() => {});
      await logActivity(ws.id, task.id, me.id, 'task_completed', {});
      fire('task_completed');
      return NextResponse.json({ ok: true });
    }
    case 'reopen': {
      // Coherence: reopening resets the agent lifecycle too — the agent sees it as new work.
      await tsql()`
        UPDATE tasks SET status = 'todo', agent_state = 'new', agent_locked_at = NULL,
          completed_at = NULL, completed_by = NULL, updated_at = NOW()
        WHERE id = ${task.id}`;
      await tsql()`
        UPDATE task_attachments SET expires_at = NULL
        WHERE task_id = ${task.id} AND removed_at IS NULL`;
      await logActivity(ws.id, task.id, me.id, 'task_reopened', {});
      fire('task_updated', 'Task moved back to the To Do list');
      return NextResponse.json({ ok: true });
    }
    case 'comment': {
      const body = String(b.body ?? '').trim();
      if (!body) return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
      await tsql()`INSERT INTO task_comments (task_id, author_id, body) VALUES (${task.id}, ${me.id}, ${body})`;
      await logActivity(ws.id, task.id, me.id, 'comment_added', {});
      fire('comment_added', body.slice(0, 140));
      return NextResponse.json({ ok: true });
    }
    // ---- Review actions (the PR/QA panel on an agent-completed task) ----
    case 'approve': {
      // Human signed off an agent-completed task. v3 Stage 3: approval is NOT
      // completion — the task now enters the deploy pipeline (approved →
      // deploying → verified → done). The shipper marks it done only after the
      // production deployment is confirmed; no-code deliverables complete
      // within a minute. completed_by is recorded now so the approval is owned.
      await tsql()`
        UPDATE tasks SET status = 'approved', completed_by = ${me.id},
          agent_state = 'approved', agent_locked_at = NULL, updated_at = NOW()
        WHERE id = ${task.id}`;
      await logActivity(ws.id, task.id, me.id, 'task_approved', {});
      fire('task_completed', 'Approved — deploying');
      return NextResponse.json({ ok: true });
    }
    case 'archive': {
      // "Save this info and archive it" (task 12881e9c). For a task whose
      // ANSWER is the deliverable — research, a strategy, a recommendation —
      // there is nothing to put live, so Approve is the wrong button: it hands
      // the task to the shipper to deploy work that does not exist. This keeps
      // everything and files it away instead.
      //
      // agent_state is cleared so the agent never picks it up again, and no
      // deploy is started.
      await tsql()`
        UPDATE tasks SET status = 'done', archived_at = NOW(),
          agent_state = NULL, agent_locked_at = NULL,
          completed_at = COALESCE(completed_at, NOW()), completed_by = ${me.id}, updated_at = NOW()
        WHERE id = ${task.id}`;
      // Deliberately the OPPOSITE of `complete` above, which puts an expiry
      // date on a finished task's videos. The whole point of archiving is to
      // come back and read it later, so anything already counting down is
      // reset to keep.
      await tsql()`
        UPDATE task_attachments SET expires_at = NULL
        WHERE task_id = ${task.id} AND removed_at IS NULL`;
      await logActivity(ws.id, task.id, me.id, 'task_archived', {});
      fire('task_updated', 'Saved to the archive');
      return NextResponse.json({ ok: true });
    }
    case 'unarchive': {
      // Out of the archive and back onto the review pile it came from, so
      // archiving something by mistake costs nothing.
      await tsql()`
        UPDATE tasks SET archived_at = NULL, status = 'ready_for_review',
          completed_at = NULL, completed_by = NULL, updated_at = NOW()
        WHERE id = ${task.id}`;
      await logActivity(ws.id, task.id, me.id, 'task_unarchived', {});
      fire('task_updated', 'Taken out of the archive');
      return NextResponse.json({ ok: true });
    }
    case 'retry_deploy': {
      // A deploy_failed task: hand it back to the shipper's re-verify loop.
      // If the failure was a reverted build, re-checking will confirm the old
      // SHA failed and return it to deploy_failed — the real fix path is
      // "Respond & try again" (agent re-works the change).
      await tsql()`
        UPDATE tasks SET status = 'deploying', agent_state = 'verify_pending', updated_at = NOW()
        WHERE id = ${task.id}`;
      await logActivity(ws.id, task.id, me.id, 'deploy_retry', {});
      fire('task_updated', 'Re-checking deployment');
      return NextResponse.json({ ok: true });
    }
    case 'request_changes': {
      const note = String(b.body ?? '').trim();
      if (!note) return NextResponse.json({ error: 'Please say what needs changing' }, { status: 400 });
      // The agent picks up 'revision_requested' tasks and re-works them, reading
      // this feedback (a normal, non-agent comment) as the instructions to address.
      await tsql()`INSERT INTO task_comments (task_id, author_id, body, internal_only)
        VALUES (${task.id}, ${me.id}, ${'Changes requested: ' + note}, TRUE)`;
      await tsql()`
        UPDATE tasks SET status = 'in_progress', agent_state = 'revision_requested',
          agent_locked_at = NULL, updated_at = NOW()
        WHERE id = ${task.id}`;
      await logActivity(ws.id, task.id, me.id, 'changes_requested', { note: note.slice(0, 140) });
      fire('task_updated', 'Changes requested');
      return NextResponse.json({ ok: true });
    }
    case 'reject': {
      const note = String(b.body ?? '').trim();
      // Not wanted: park it with the humans. The agent ignores 'rejected' state,
      // so it will not auto-touch this task again.
      await tsql()`INSERT INTO task_comments (task_id, author_id, body, internal_only)
        VALUES (${task.id}, ${me.id}, ${'Rejected' + (note ? ': ' + note : '')}, TRUE)`;
      await tsql()`
        UPDATE tasks SET status = 'todo', agent_state = 'rejected', agent_locked_at = NULL, updated_at = NOW()
        WHERE id = ${task.id}`;
      await logActivity(ws.id, task.id, me.id, 'task_rejected', { note: note.slice(0, 140) });
      fire('task_updated', 'Rejected');
      return NextResponse.json({ ok: true });
    }
    case 'clear': {
      // Permanently remove a task (the Delete / Clear button): the task, its
      // comments, subtasks, activity and attachment rows go via FK cascade;
      // attachment files are deleted from Blob first so no orphaned storage is
      // left behind. Works on ANY task, including an active To Do task created
      // by mistake — the UI's "this cannot be undone" confirm is the safeguard.
      const files = await tsql()`
        SELECT url FROM task_attachments WHERE task_id = ${task.id} AND removed_at IS NULL` as { url: string }[];
      // Guard: a delivered item with evidence (screenshots / screen recordings)
      // is exactly the record a reviewer needs. Refuse to delete it unless the
      // caller explicitly forces it — this stops "Clear all completed" from
      // silently wiping the proof of finished work.
      if (files.length > 0 && b.force !== true) {
        return NextResponse.json({ error: 'has_evidence', evidenceCount: files.length }, { status: 409 });
      }
      if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
        for (const f of files) {
          await del(f.url).catch(() => {}); // a failed file delete must not block the clear
        }
      }
      await tsql()`DELETE FROM tasks WHERE id = ${task.id}`;
      return NextResponse.json({ ok: true });
    }
    case 'add_attachment': {
      const url = String(b.url ?? '');
      if (!/^https?:\/\//.test(url)) return NextResponse.json({ error: 'Invalid file URL' }, { status: 400 });
      await tsql()`
        INSERT INTO task_attachments (task_id, filename, url, size_bytes, content_type, uploaded_by)
        VALUES (${task.id}, ${String(b.filename ?? 'file')}, ${url}, ${Number(b.size) || null}, ${String(b.contentType ?? '') || null}, ${me.id})`;
      await tsql()`UPDATE upload_attempts SET completed_at = now()
        WHERE completed_at IS NULL AND strpos(${String(b.url)}, split_part(pathname, '.', 1)) > 0`.catch(() => {});
      await logActivity(ws.id, task.id, me.id, 'attachment_added', { filename: b.filename });
      return NextResponse.json({ ok: true });
    }
    case 'remove_attachment': {
      const rows = await tsql()`
        SELECT id, url, filename, size_bytes FROM task_attachments
        WHERE id = ${String(b.attachmentId ?? '')} AND task_id = ${task.id} AND removed_at IS NULL` as
        { id: string; url: string; filename: string; size_bytes: number | null }[];
      const att = rows[0];
      if (!att) return NextResponse.json({ error: 'File not found (already removed?)' }, { status: 404 });
      try {
        if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) await del(att.url);
      } catch {
        // Blob delete failing must not strand the record; the row is still
        // marked removed and the cleanup pass will not retry a marked row.
      }
      await tsql()`
        UPDATE task_attachments
        SET removed_at = NOW(), expires_at = NULL,
            removed_note = ${`Deleted by ${me.name}`}
        WHERE id = ${att.id}`;
      await logActivity(ws.id, task.id, me.id, 'attachment_removed', { filename: att.filename });
      return NextResponse.json({ ok: true });
    }
    default: {
      // Field updates: title, description, priority, due date, assignees, company
      const updates: Record<string, unknown> = {};
      if (typeof b.title === 'string' && b.title.trim()) updates.title = b.title.trim();
      if (typeof b.description === 'string') updates.description = b.description.trim() || null;
      if (TASK_PRIORITIES.includes(b.priority)) updates.priority = b.priority;
      if ('dueDate' in b) updates.due_date = b.dueDate || null;
      let newCompany: { id: string; name: string } | null = null;
      if (typeof b.companyId === 'string' && b.companyId !== task.project_id) {
        const companies = await listCompanies(ws.id);
        newCompany = companies.find((c) => c.id === b.companyId) ?? null;
        if (!newCompany) return NextResponse.json({ error: 'Unknown company' }, { status: 400 });
      }
      const hasAssignees = Array.isArray(b.assigneeIds);
      if (Object.keys(updates).length === 0 && !hasAssignees && !newCompany) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
      }
      if (Object.keys(updates).length > 0 || newCompany) {
        await tsql()`
          UPDATE tasks SET
            title = ${(updates.title as string) ?? task.title},
            description = ${'description' in updates ? (updates.description as string | null) : (task.description as string | null)},
            priority = ${(updates.priority as string) ?? (task.priority as string)},
            due_date = ${'due_date' in updates ? (updates.due_date as string | null) : task.due_date},
            project_id = ${newCompany ? newCompany.id : task.project_id},
            updated_at = NOW()
          WHERE id = ${task.id}`;
      }
      let assigneesChanged = false;
      let assigneeNames: string[] = [];
      if (hasAssignees) {
        const current = await tsql()`SELECT member_id FROM task_assignees WHERE task_id = ${task.id}` as { member_id: string }[];
        const currentIds = current.map((r) => r.member_id).sort();
        const nextIds = Array.from(new Set(b.assigneeIds as string[])).sort();
        assigneesChanged = currentIds.join(',') !== nextIds.join(',');
        await tsql()`DELETE FROM task_assignees WHERE task_id = ${task.id}`;
        for (const memberId of nextIds) {
          await tsql()`INSERT INTO task_assignees (task_id, member_id) VALUES (${task.id}, ${memberId}) ON CONFLICT DO NOTHING`;
        }
        assigneeNames = members.filter((m) => nextIds.includes(m.id)).map((m) => m.name);
      }
      await logActivity(ws.id, task.id, me.id, 'task_updated', { ...updates, ...(newCompany ? { company: newCompany.name } : {}) });
      // One email per change, to the whole team. Assignment changes (adds AND
      // removals) win the headline; other field edits ride along in the detail.
      const fieldNotes = [
        Object.keys(updates).length > 0 ? `${Object.keys(updates).join(', ')} changed` : '',
        newCompany ? `Moved to ${newCompany.name}` : '',
      ].filter(Boolean).join(' | ');
      const emailCompany = newCompany?.name ?? task.company;
      if (assigneesChanged) {
        const who = assigneeNames.length > 0 ? `Now assigned to: ${assigneeNames.join(', ')}` : 'No one is assigned now';
        fire('task_assigned', fieldNotes ? `${who} | ${fieldNotes}` : who, undefined, emailCompany);
      } else if (fieldNotes) {
        fire('task_updated', fieldNotes, undefined, emailCompany);
      }
      return NextResponse.json({ ok: true });
    }
  }
}
