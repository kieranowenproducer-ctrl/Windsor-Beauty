// Task notifications via Resend, per-workspace sender settings.
// Fallback behaviour: if the workspace has no usable Resend key, or
// TASKS_EMAIL_DRY_RUN=1, nothing sends — the attempt is logged to
// task_notifications as 'skipped' and the app carries on. Emails never
// block or fail a task action (send errors are logged as 'failed').
import { tsql, STATUS_LABELS, type TaskStatus, type Member } from './db';
import { sendEmail } from '../email/send';

export type TaskEvent = 'task_created' | 'task_assigned' | 'task_completed' | 'task_updated' | 'comment_added';

const EVENT_HEADLINE: Record<TaskEvent, string> = {
  task_created: 'New task added',
  task_assigned: 'Task assigned',
  task_completed: 'Task completed',
  task_updated: 'Task updated',
  comment_added: 'New comment on a task',
};

interface NotifyInput {
  workspaceId: string;
  workspaceName: string;
  /** Which company the task belongs to (Windsor Glow / AI Idiots / Social Media Engine). */
  company?: string;
  event: TaskEvent;
  task: { id: string; task_number?: number | null; title: string; due_date: string | null; status: TaskStatus };
  actor: Member;
  members: Member[];
  /** Extra line, e.g. the comment text or the status transition. */
  detail?: string;
  /** Restrict recipients. Unused by default: the whole team is notified. */
  onlyMemberIds?: string[];
}

function emailHtml(i: NotifyInput, appUrl: string): string {
  const due = i.task.due_date ? new Date(i.task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const when = new Date().toLocaleString('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#78716c;font-size:13px">${label}</td><td style="padding:4px 0;color:#1c1917;font-size:13px">${value}</td></tr>`;
  return `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#78716c;margin:0 0 6px">Team tasks</p>
    <h2 style="font-size:18px;color:#1c1917;margin:0 0 10px">${EVENT_HEADLINE[i.event]}</h2>
    ${i.company ? `
    <p style="font-size:13px;color:#57534e;margin:0 0 2px">This task is for:</p>
    <p style="font-size:20px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#b45309;margin:0 0 14px">${escapeHtml(i.company)}</p>` : ''}
    <div style="border:1px solid #e7e5e4;border-radius:12px;padding:16px 18px;background:#fafaf9">
      <p style="font-size:15px;font-weight:600;color:#1c1917;margin:0 0 10px">${i.task.task_number != null ? `Task #${i.task.task_number} - ` : ''}${escapeHtml(i.task.title)}</p>
      <table style="border-collapse:collapse">
        ${row('Status', STATUS_LABELS[i.task.status])}
        ${due ? row('Due', due) : ''}
        ${row('By', escapeHtml(i.actor.name))}
        ${row('When', when)}
        ${i.detail ? row('Detail', escapeHtml(i.detail)) : ''}
      </table>
    </div>
    <a href="${appUrl}/admin/tasks?task=${i.task.id}"
       style="display:inline-block;margin-top:16px;background:#1c1917;color:#fafaf9;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:10px">
      Open task
    </a>
    <p style="font-size:11px;color:#a8a29e;margin-top:20px">Sent by the ${i.workspaceName} task system.</p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function logSend(workspaceId: string, taskId: string, event: string, recipient: string, status: 'sent' | 'failed' | 'skipped', providerId?: string, error?: string) {
  await tsql()`
    INSERT INTO task_notifications (workspace_id, task_id, event, recipient, status, provider_id, error)
    VALUES (${workspaceId}, ${taskId}, ${event}, ${recipient}, ${status}, ${providerId ?? null}, ${error ?? null})`.catch(() => {});
}

/** Fire-and-forget: never throws, never blocks a task action on email problems. */
export async function notify(i: NotifyInput): Promise<void> {
  try {
    // The WHOLE team gets every notification, including whoever made the change
    // (Kieran's rule 2026-07-06: both team inboxes must always be notified).
    const recipients = i.members.filter((m) =>
      m.email && (!i.onlyMemberIds || i.onlyMemberIds.includes(m.id)));
    if (recipients.length === 0) return;

    const settingsRows = await tsql()`
      SELECT from_name, from_email, reply_to, resend_key_env_name
      FROM workspace_email_settings WHERE workspace_id = ${i.workspaceId}` as
      { from_name: string; from_email: string; reply_to: string | null; resend_key_env_name: string }[];
    const settings = settingsRows[0];
    const apiKey = settings ? process.env[settings.resend_key_env_name] : undefined;
    const dryRun = process.env.TASKS_EMAIL_DRY_RUN === '1';

    if (!settings || !apiKey || dryRun) {
      for (const r of recipients) await logSend(i.workspaceId, i.task.id, i.event, r.email, 'skipped', undefined, dryRun ? 'dry run' : 'email not configured');
      return;
    }

    // NEXT_PUBLIC_SITE_URL can be unset OR empty ("") in the Vercel env, and an
    // empty string is falsy — so the old `|| 'http://localhost:3000'` fell through
    // to localhost in production, making task-notification email links show a
    // "can't connect to localhost" error on real devices. Never fall back to
    // localhost in production. (Root fix: set NEXT_PUBLIC_SITE_URL in Vercel.)
    const appUrl = process.env.NEXT_PUBLIC_SITE_URL
      || (process.env.NODE_ENV === 'production' ? 'https://www.windsorglow.com' : 'http://localhost:3000');
    const subject = `[${i.company ?? i.workspaceName}] ${EVENT_HEADLINE[i.event]}: ${i.task.task_number != null ? `Task #${i.task.task_number} - ` : ''}${i.task.title}`;
    const html = emailHtml(i, appUrl);

    for (const r of recipients) {
      try {
        // Each workspace sends on its own Resend key, so it is passed rather
        // than defaulted.
        const res = await sendEmail({
          from: `${settings.from_name} <${settings.from_email}>`,
          to: r.email,
          replyTo: settings.reply_to ?? undefined,
          subject,
          html,
        }, { apiKey, internal: true });
        await logSend(i.workspaceId, i.task.id, i.event, r.email, res.error ? 'failed' : 'sent', res.id ?? undefined, res.error ?? undefined);
      } catch (err) {
        await logSend(i.workspaceId, i.task.id, i.event, r.email, 'failed', undefined, String(err));
      }
    }
  } catch {
    // notifications must never break the task action itself
  }
}
