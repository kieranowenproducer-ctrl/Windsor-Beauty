'use client';

// Task detail: edit fields, change company, assign teammates, photo/video
// attachments (view, play, download, add, delete-with-confirm), comment,
// complete. Videos on completed tasks show their auto-removal date.

import { useCallback, useEffect, useState } from 'react';
import { useViewportOwner } from '@/components/viewportOwner';
import { PRIORITY_LABEL, companyText, type Member, type Company } from './TasksApp';
import { uploadTaskMedia } from './uploadMedia';
import { fmtBytes, isVideoType } from '@/lib/tasks/media';
import VoiceInput from '@/components/admin/VoiceInput';
import { useConfirm } from '@/components/admin/ConfirmProvider';

interface Attachment {
  id: string; filename: string; url: string; size_bytes: number | null;
  content_type: string | null; expires_at: string | null;
  removed_at: string | null; removed_note: string | null;
  from_agent?: boolean; caption?: string | null; kind?: string | null;
}
interface AgentRun {
  id: string; status: string; plan_md: string | null; report_md: string | null;
  verify_md: string | null; model: string | null; created_at: string;
}
interface Detail {
  task: {
    id: string; task_number: number | null; title: string; description: string | null; status: string;
    agent_state: string | null;
    priority: string; due_date: string | null; created_at: string;
    completed_at: string | null; archived_at: string | null; project_id: string; company: string;
  };
  assignees: { id: string; name: string }[];
  attachments: Attachment[];
  comments: { id: string; body: string; created_at: string; author_name: string | null }[];
  activity: { action: string; detail: Record<string, unknown> | null; created_at: string; actor_name: string | null }[];
  runs?: AgentRun[];
  retentionDays: number;
}

// Agent-authored comments (🤖 reports, 🧾 evidence, ✅/🚀/⚠️ system notes) are grouped
// into a collapsed log so the conversation stays human-readable (audit M1).
const isAgentComment = (body: string) => /^(🤖|🧾|✅|🚀|⚠️)/.test(body);

const ACTION_TEXT: Record<string, string> = {
  task_created: 'created the task', task_updated: 'updated the task', task_assigned: 'assigned the task',
  task_completed: 'completed the task', task_reopened: 'moved it back to To Do', comment_added: 'commented',
  attachment_added: 'added a file', attachment_removed: 'deleted a file', attachment_expired: 'a video was removed after the retention period',
};
const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function TaskDrawer({ taskId, members, companies, onClose }: {
  taskId: string; members: Member[]; companies: Company[]; onClose: () => void;
}) {
  const confirm = useConfirm();
  const [d, setD] = useState<Detail | null>(null);
  const [comment, setComment] = useState('');
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [error, setError] = useState('');
  const [reviewMode, setReviewMode] = useState<'idle' | 'changes' | 'reject'>('idle');
  const [reviewNote, setReviewNote] = useState('');
  const [respondOpen, setRespondOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/tasks/task/${taskId}`);
    if (r.ok) setD(await r.json());
  }, [taskId]);
  useEffect(() => { void load(); }, [load]);

  // Lock the page behind the drawer while it is open. Without this, iOS Safari
  // scrolls the board underneath instead of the drawer's own content, so the
  // drawer appears to "stick" and refuses to scroll. Same fix as CartDrawer:
  // pin the body (preserving its scroll position) and restore it on close.
  // Through the shared counter, which puts the board back instantly. Doing it
  // here restored the scroll position with a plain window.scrollTo, and
  // globals.css sets `html { scroll-behavior: smooth }`, so closing the drawer
  // made the whole board visibly scroll itself back up. Same fault the shop's
  // basket drawer had. See src/components/viewportOwner.ts.
  useViewportOwner(true, 'task-drawer', { lockScroll: true });

  const patch = async (body: Record<string, unknown>) => {
    setError('');
    const r = await fetch(`/api/admin/tasks/task/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'Something went wrong'); return false; }
    await load(); return true;
  };

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setError('');
    // Per-file isolation (v3 Stage 4): one failed file must not stop the others
    // or wedge the task — each failure is reported specifically and the rest
    // continue uploading.
    const failures: string[] = [];
    for (const file of Array.from(list)) {
      try {
        setProgress({ name: file.name, pct: 0 });
        const up = await uploadTaskMedia(file, (pct) => setProgress({ name: file.name, pct }));
        await patch({ action: 'add_attachment', url: up.url, filename: up.filename, size: up.size, contentType: up.contentType });
      } catch (err) {
        failures.push(err instanceof Error ? err.message : `Could not upload ${file.name}`);
      }
    }
    if (failures.length) setError(failures.join(' · '));
    setProgress(null);
  };

  const removeFile = async (att: Attachment) => {
    const what = isVideoType(att.content_type) ? 'video' : 'photo';
    if (!(await confirm({
      title: `Permanently delete this ${what}?`,
      body: `${att.filename}\n\nThe file cannot be recovered. A note that it existed stays on the task.`,
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'Keep it',
      tone: 'danger',
    }))) return;
    await patch({ action: 'remove_attachment', attachmentId: att.id });
  };

  if (!d) return (
    <div className="fixed inset-0 z-50 bg-stone-900/40" onClick={onClose}>
      <div className="ml-auto h-full w-full max-w-lg bg-white p-8 text-sm text-stone-400">Loading task...</div>
    </div>
  );
  const t = d.task;
  const field = 'rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-amber-600';
  const assignedIds = d.assignees.map((a) => a.id);
  const live = d.attachments.filter((a) => !a.removed_at);
  const removed = d.attachments.filter((a) => a.removed_at);
  const evidence = live.filter((a) => a.from_agent && !isVideoType(a.content_type));
  const photos = live.filter((a) => !a.from_agent && !isVideoType(a.content_type));
  const videos = live.filter((a) => isVideoType(a.content_type));
  const humanComments = d.comments.filter((c) => !isAgentComment(c.body));
  const agentComments = d.comments.filter((c) => isAgentComment(c.body));
  const runs = d.runs ?? [];
  const latestBrief = [...runs].reverse().find((r) => r.status === 'briefed' && r.plan_md);
  const latestReport = [...runs].reverse().find((r) => r.report_md);

  // Revision journey (the "back and forth" ribbon): how many times this task was
  // sent back for changes, and where it is now. 'changes_requested' is logged
  // once per round in task_activity_log.
  const revisions = d.activity.filter((a) => a.action === 'changes_requested').length;
  const isApproved = ['approved', 'deploying'].includes(t.status) || (t.status === 'done' && d.activity.some((a) => a.action === 'task_approved'));
  const isDeployed = t.status === 'done' && d.activity.some((a) => a.action === 'task_approved');
  const stageNow =
    isDeployed ? { label: 'Deployed', cls: 'bg-emerald-600 text-white' }
    : isApproved ? { label: 'Approved', cls: 'bg-emerald-500 text-white' }
    : t.status === 'ready_for_review' || t.status === 'needs_review' ? { label: 'Ready for review', cls: 'bg-amber-500 text-white' }
    : t.agent_state === 'revision_requested' ? { label: 'Revising', cls: 'bg-amber-500 text-white' }
    : ['needs_kieran', 'deploy_failed'].includes(t.status) ? { label: 'Needs attention', cls: 'bg-red-500 text-white' }
    : t.status === 'in_progress' || t.agent_state === 'executing' ? { label: 'In progress', cls: 'bg-indigo-500 text-white' }
    : t.status === 'done' ? { label: 'Done', cls: 'bg-stone-500 text-white' }
    : { label: 'To do', cls: 'bg-stone-400 text-white' };
  // The ordered journey: Submitted -> (Revision 1 -> Revision 2 -> ...) -> now.
  const journey: { label: string; cls: string }[] = [
    { label: 'Submitted', cls: 'bg-stone-800 text-white' },
    ...Array.from({ length: revisions }, (_, i) => ({ label: `Revision ${i + 1}`, cls: 'bg-amber-400 text-white' })),
    stageNow,
  ];
  const showRibbon = revisions > 0 || stageNow.label !== 'To do';

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40" onClick={onClose}>
      <aside className="ml-auto flex h-full w-full max-w-lg flex-col overflow-y-auto overscroll-contain bg-white shadow-2xl [-webkit-overflow-scrolling:touch]" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-stone-100 px-6 py-4">
          {/* Back navigation — visible even when the drawer is opened straight
              from an email link (it covers the sidebar), so there's always a
              clear way back to the task list and the admin dashboard. */}
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100">
              <span aria-hidden className="text-base leading-none">←</span> Back to tasks
            </button>
            <a href="/admin/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50">
              Dashboard
            </a>
          </div>
          <div className="flex items-center gap-2">
            {t.task_number != null && (
              <span className="rounded-md bg-stone-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white" title="Permanent task number">Task #{t.task_number}</span>
            )}
            <p className={`text-[11px] font-extrabold uppercase tracking-[0.14em] ${companyText(t.company)}`}>{t.company}</p>
          </div>
          <div className="mt-1 flex items-start justify-between gap-3">
            <input defaultValue={t.title} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.title) void patch({ title: v }); }}
              className="w-full border-0 p-0 text-lg font-semibold text-stone-900 outline-none focus:ring-0" />
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-stone-400 hover:bg-stone-100" aria-label="Close">✕</button>
          </div>

          {/* Revision ribbon: the back-and-forth journey at a glance, so it's
              obvious how many rounds it took to get right. */}
          {showRibbon && (
            <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                {revisions === 0 ? 'Progress' : `Progress · ${revisions} round${revisions > 1 ? 's' : ''} of changes`}
              </p>
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
                {journey.map((s, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-stone-300" aria-hidden="true">›</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.cls} ${i === journey.length - 1 ? 'ring-2 ring-offset-1 ring-stone-300' : ''}`}>{s.label}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3">
            {t.archived_at ? (
              /* Filed away on purpose. Everything below this panel is exactly as
                 it was; nothing was deployed and nothing was deleted. */
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-xs font-semibold text-indigo-900">
                  Saved to the archive{t.archived_at ? ` on ${fmt(t.archived_at)}` : ''}
                </p>
                <p className="mt-0.5 text-[11px] text-indigo-800">
                  Kept for reference, not put live. The report, the comments and the photographs
                  below are all still here.
                </p>
                <button type="button" onClick={() => void patch({ action: 'unarchive' })}
                  className="mt-2.5 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
                  Take out of the archive
                </button>
              </div>
            ) : t.status === 'ready_for_review' ? (
              /* The agent finished and is waiting for a human to sign off. */
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-900">The agent completed this and is waiting for your review</p>
                <p className="mt-0.5 text-[11px] text-emerald-800">Read the completion report and evidence below, then choose. Requesting changes sends it straight back to the agent to revise.</p>
                {reviewMode === 'idle' ? (
                  <>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button type="button" onClick={async () => { if (await patch({ action: 'approve' })) onClose(); }}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Approve</button>
                    {/* For a task whose ANSWER was the job (task 12881e9c). Approve
                        would hand it to the shipper and deploy work that does not
                        exist; this keeps the whole thing and files it instead. */}
                    <button type="button" onClick={async () => { if (await patch({ action: 'archive' })) onClose(); }}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">Save and archive</button>
                    <button type="button" onClick={() => { setReviewMode('changes'); setReviewNote(''); }}
                      className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">Request changes</button>
                    <button type="button" onClick={() => { setReviewMode('reject'); setReviewNote(''); }}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100">Reject</button>
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-emerald-800">
                    <b>Approve</b> puts the work live. <b>Save and archive</b> is for when the answer
                    itself was the job and there is nothing to put live: everything below is kept and
                    filed under Archive, where you can read it again whenever you like.
                  </p>
                  </>
                ) : (
                  <div className="mt-2.5">
                    <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3}
                      placeholder={reviewMode === 'changes' ? 'What needs changing? Be specific. The agent reads this and revises.' : 'Reason (optional)'}
                      className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-600" />
                    <div className="mt-2 flex items-center gap-2">
                      <VoiceInput context="task" onText={(t) => setReviewNote((v) => (v ? v + ' ' + t : t))} />
                      <button type="button" disabled={reviewMode === 'changes' && !reviewNote.trim()}
                        onClick={async () => { const act = reviewMode === 'changes' ? 'request_changes' : 'reject'; if (await patch({ action: act, body: reviewNote })) onClose(); }}
                        className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                        {reviewMode === 'changes' ? 'Send back for changes' : 'Confirm reject'}
                      </button>
                      <button type="button" onClick={() => setReviewMode('idle')} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-500">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ) : t.status === 'done' ? (
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Done{t.completed_at ? ` · ${fmt(t.completed_at)}` : ''}
                </span>
                <button type="button" onClick={() => void patch({ action: 'reopen' })}
                  className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-400">
                  Move back to To Do
                </button>
                {/* Also offered after the fact, for information tasks that were
                    finished before the archive existed (task 12881e9c). */}
                <button type="button" onClick={async () => { if (await patch({ action: 'archive' })) onClose(); }}
                  className="rounded-xl border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:border-indigo-400">
                  Save to the archive
                </button>
              </div>
            ) : t.status === 'todo' ? (
              <button type="button" onClick={async () => { if (await patch({ action: 'complete' })) onClose(); }}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                Mark as done
              </button>
            ) : (t.status === 'approved' || t.status === 'deploying') ? (
              /* v3: approval starts the deploy pipeline; done only after live verify. */
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  {t.status === 'approved' ? 'Approved — deploying automatically' : 'Deploying — verifying the live site'}
                </span>
              </div>
            ) : t.status === 'deploy_failed' ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-semibold text-red-900">The deployment failed</p>
                <p className="mt-0.5 text-[11px] text-red-800">See the agent log below for the diagnostic. If the build was reverted, use Respond &amp; try again so the agent fixes and re-attempts; if it just timed out, re-check.</p>
                {respondOpen ? (
                  <div className="mt-2.5">
                    <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} autoFocus
                      placeholder="Tell the agent what to do differently (it re-attempts the task with this)."
                      className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm outline-none focus:border-red-500" />
                    <div className="mt-2 flex items-center gap-2">
                      <VoiceInput context="task" onText={(t) => setReviewNote((v) => (v ? v + ' ' + t : t))} />
                      <button type="button" disabled={!reviewNote.trim()}
                        onClick={async () => { if (await patch({ action: 'request_changes', body: reviewNote })) onClose(); }}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40">Send &amp; try again</button>
                      <button type="button" onClick={() => setRespondOpen(false)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setRespondOpen(true); setReviewNote(''); }}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">Respond &amp; try again</button>
                    <button type="button" onClick={async () => { if (await patch({ action: 'retry_deploy' })) onClose(); }}
                      className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100">Re-check deployment</button>
                  </div>
                )}
              </div>
            ) : (t.status === 'needs_kieran' || t.agent_state === 'failed') ? (
              /* The agent asked a question / hit a blocker / proposed an alternative.
                 Let the reviewer ANSWER and send it straight back for another attempt —
                 not just "Mark as done" (v3 Stage 2). Reuses the proven request_changes
                 flow: the answer is saved and the task reopens as revision_requested. */
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900">The agent needs your input to finish this</p>
                <p className="mt-0.5 text-[11px] text-amber-800">Read what it tried and what it needs in the agent log below, then answer here and it will try again with your reply. Or mark it done / reject if nothing more is needed.</p>
                {respondOpen ? (
                  <div className="mt-2.5">
                    <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} autoFocus
                      placeholder="Answer the agent's question or tell it how to proceed (e.g. 'use the 50mg version', 'try the alternative you suggested', 'Windsor Glow brand'). It reopens the task and attempts it again with this."
                      className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:border-amber-600" />
                    <div className="mt-2 flex items-center gap-2">
                      <VoiceInput context="task" onText={(t) => setReviewNote((v) => (v ? v + ' ' + t : t))} />
                      <button type="button" disabled={!reviewNote.trim()}
                        onClick={async () => { if (await patch({ action: 'request_changes', body: reviewNote })) onClose(); }}
                        className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-40">
                        Send &amp; try again
                      </button>
                      <button type="button" onClick={() => setRespondOpen(false)} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs text-amber-700">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setRespondOpen(true); setReviewNote(''); }}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">Respond &amp; try again</button>
                    <button type="button" onClick={async () => { if (await patch({ action: 'complete' })) onClose(); }}
                      className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100">Mark as done</button>
                    <button type="button" onClick={async () => { if (await patch({ action: 'reject' })) onClose(); }}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100">Reject</button>
                  </div>
                )}
              </div>
            ) : (
              /* in_progress / analysing / revising etc. */
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                  {t.agent_state === 'revision_requested' ? 'Agent revising' : t.status.replace(/_/g, ' ')}
                </span>
                <button type="button" onClick={async () => { if (await patch({ action: 'complete' })) onClose(); }}
                  className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-400">
                  Mark as done
                </button>
              </div>
            )}
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex-1 space-y-5 px-6 py-5">
          {/* AGENT PANEL (audit M1): the structured brief/report/evidence, so the reviewer
              never has to dig through raw comments to understand what the agent did. */}
          {(latestBrief || latestReport || evidence.length > 0) && (
            <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/40">
              <p className="border-b border-indigo-100 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                Agent panel
              </p>
              <div className="space-y-2 p-3">
                {latestBrief && (
                  <details className="rounded-xl border border-stone-200 bg-white">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-stone-800">
                      What the agent understood &amp; planned <span className="font-normal text-stone-400">· {fmt(latestBrief.created_at)}</span>
                    </summary>
                    <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap border-t border-stone-100 px-3 py-2 font-sans text-xs leading-relaxed text-stone-700">{latestBrief.plan_md}</pre>
                  </details>
                )}
                {latestReport && (
                  <details open={t.status === 'ready_for_review'} className="rounded-xl border border-stone-200 bg-white">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-stone-800">
                      Completion report <span className="font-normal text-stone-400">· {fmt(latestReport.created_at)}</span>
                    </summary>
                    <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap border-t border-stone-100 px-3 py-2 font-sans text-xs leading-relaxed text-stone-700">{latestReport.report_md}</pre>
                    {latestReport.verify_md && (
                      <p className="border-t border-stone-100 px-3 py-2 text-[11px] text-stone-500">Verified: {latestReport.verify_md}</p>
                    )}
                  </details>
                )}
                {evidence.length > 0 && (
                  <div>
                    <p className="px-1 text-[11px] font-semibold text-stone-600">Evidence ({evidence.length})</p>
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      {evidence.map((img) => (
                        <a key={img.id} href={img.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-stone-200 bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element -- task evidence uploaded to blob storage, of unknown dimensions, in an admin-only drawer where page speed is not the concern. */}
                          <img src={img.url} alt={img.filename} className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                          {img.caption
                            ? <p className="px-2 py-1 text-[10px] leading-snug text-stone-600">{img.caption}</p>
                            : <p className="truncate px-2 py-1 text-[10px] text-stone-500">{img.filename}</p>}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-stone-500">Company
              <select value={t.project_id} onChange={(e) => void patch({ companyId: e.target.value })} className={`${field} mt-1 block w-full font-medium`}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-stone-500">Priority
              <select defaultValue={t.priority} onChange={(e) => void patch({ priority: e.target.value })} className={`${field} mt-1 block w-full`}>
                {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-stone-500">Due date
              <input type="date" defaultValue={t.due_date?.slice(0, 10) ?? ''} onChange={(e) => void patch({ dueDate: e.target.value || null })} className={`${field} mt-1 block w-full`} />
            </label>
          </div>

          <div>
            <p className="text-[11px] text-stone-500">Assigned to</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {members.map((m) => (
                <button key={m.id} type="button"
                  onClick={() => void patch({ assigneeIds: assignedIds.includes(m.id) ? assignedIds.filter((x) => x !== m.id) : [...assignedIds, m.id] })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    assignedIds.includes(m.id) ? 'border-amber-600 bg-amber-50 text-amber-800' : 'border-stone-200 text-stone-500 hover:border-stone-400'}`}>
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-[11px] text-stone-500">Details
            <textarea defaultValue={t.description ?? ''} rows={3} placeholder="Add details"
              onBlur={(e) => { if ((e.target.value.trim() || null) !== (t.description ?? null)) void patch({ description: e.target.value }); }}
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-600" />
          </label>

          {/* FILES */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Photos & videos</p>

            {photos.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {photos.map((img) => (
                  <div key={img.id} className="group overflow-hidden rounded-xl border border-stone-200">
                    <a href={img.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- task photos uploaded to blob storage, of unknown dimensions, in an admin-only drawer where page speed is not the concern. */}
                      <img src={img.url} alt={img.filename} className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    </a>
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[10px] text-stone-500">
                      <a href={img.url} download={img.filename} className="truncate hover:text-stone-800 hover:underline">{img.filename}</a>
                      <button type="button" onClick={() => void removeFile(img)} className="shrink-0 font-medium text-red-500 hover:text-red-700">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {videos.length > 0 && (
              <div className="mt-2 space-y-2">
                {videos.map((v) => (
                  <div key={v.id} className={`overflow-hidden rounded-xl border ${v.from_agent ? 'border-emerald-200' : 'border-stone-200'}`}>
                    {v.from_agent && (
                      <p className="bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">🎬 Screen recording — evidence</p>
                    )}
                    { }
                    <video src={v.url} controls preload="metadata" playsInline className="max-h-64 w-full bg-stone-950" />
                    {v.caption && <p className="border-t border-stone-100 px-3 py-2 text-xs text-stone-700">{v.caption}</p>}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] text-stone-500">
                      <span className="min-w-0 truncate">{v.filename}{v.size_bytes ? ` · ${fmtBytes(v.size_bytes)}` : ''}</span>
                      <span className="flex shrink-0 items-center gap-3">
                        <a href={v.url} download={v.filename} className="font-medium text-stone-600 hover:underline">Download</a>
                        <button type="button" onClick={() => void removeFile(v)} className="font-medium text-red-500 hover:text-red-700">Delete</button>
                      </span>
                    </div>
                    {v.expires_at && !v.removed_at && (
                      <p className="border-t border-amber-100 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
                        This video will be removed on {fmtDate(v.expires_at)} to free up space (task completed; videos are kept {d.retentionDays} days).
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {removed.length > 0 && (
              <div className="mt-2 space-y-1">
                {removed.map((r) => (
                  <p key={r.id} className="rounded-lg bg-stone-50 px-3 py-1.5 text-[11px] text-stone-400">
                    {r.filename}{r.size_bytes ? ` (${fmtBytes(r.size_bytes)})` : ''} — {r.removed_note ?? 'removed'}
                    {r.removed_at ? ` · ${fmtDate(r.removed_at)}` : ''}
                  </p>
                ))}
              </div>
            )}

            <label className="mt-2 flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-stone-300 px-3 py-2.5 text-xs text-stone-500 hover:border-amber-600">
              <span>{progress ? `Uploading ${progress.name}... ${progress.pct}%` : 'Add photos (10MB) or videos (200MB)'}</span>
              <span className="rounded-lg bg-stone-900 px-2.5 py-1 text-[11px] font-semibold text-white">Browse</span>
              <input type="file" accept="image/*,video/mp4,video/quicktime,video/webm,video/*" multiple className="hidden"
                onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
            </label>
            {progress && (
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-amber-600 transition-all duration-200" style={{ width: `${progress.pct}%` }} />
              </div>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Comments</p>
            <div className="mt-2 space-y-2">
              {humanComments.map((c) => (
                <div key={c.id} className="rounded-xl bg-stone-100 px-3 py-2">
                  <p className="text-[11px] text-stone-500">
                    <span className="font-medium text-stone-700">{c.author_name ?? 'Unknown'}</span> · {fmt(c.created_at)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">{c.body}</p>
                </div>
              ))}
              {humanComments.length === 0 && agentComments.length === 0 && <p className="text-xs text-stone-400">No comments yet.</p>}
              {agentComments.length > 0 && (
                <details className="rounded-xl border border-stone-200">
                  <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-stone-500 hover:text-stone-700">
                    Agent activity log ({agentComments.length}) — full reports, diffs and system notes
                  </summary>
                  <div className="space-y-2 border-t border-stone-100 p-2">
                    {agentComments.map((c) => (
                      <div key={c.id} className="rounded-lg bg-stone-50 px-3 py-2">
                        <p className="text-[10px] text-stone-400">Agent · {fmt(c.created_at)}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-stone-700">{c.body}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <div className="mt-2 flex items-end gap-2">
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Write a comment"
                className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-600" />
              <div className="flex flex-col items-end gap-1.5">
                <VoiceInput context="task" onText={(t) => setComment((c) => (c ? c + ' ' + t : t))} />
                <button type="button" disabled={!comment.trim()}
                  onClick={async () => { if (await patch({ action: 'comment', body: comment })) setComment(''); }}
                  className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
                  Send
                </button>
              </div>
            </div>
          </div>

          <div className="pb-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Activity</p>
            <div className="mt-2 space-y-1.5">
              {d.activity.map((a, i) => (
                <p key={i} className="text-[11px] text-stone-500">
                  <span className="font-medium text-stone-700">{a.actor_name ?? 'System'}</span>{' '}
                  {ACTION_TEXT[a.action] ?? a.action}
                  <span className="text-stone-400"> · {fmt(a.created_at)}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
