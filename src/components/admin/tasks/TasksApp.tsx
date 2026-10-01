'use client';

// Team to-do list: a simple shared list for Kieran and colleagues.
// Two lists (To Do / Done), obvious tick-off, multi-assign, photo + video
// uploads, and a company on every task (Windsor Glow / AI Idiots / Social
// Media Engine) shown bold on the card and in every email.
// Reusable module: only the workspace pin in lib/tasks/db.ts is host-specific.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import TaskDrawer from './TaskDrawer';
import { uploadTaskMedia, type UploadedMedia } from './uploadMedia';
import VoiceInput from '@/components/admin/VoiceInput';
import { useConfirm } from '@/components/admin/ConfirmProvider';

export interface Member { id: string; name: string; email: string; role: string }
export interface Company { id: string; name: string; open_count?: number }
export interface TaskRow {
  id: string; task_number: number | null; title: string; description: string | null; status: string; task_type?: string | null;
  priority: string; due_date: string | null; created_at: string; completed_at: string | null;
  /** Set when the task was filed away to be read later. NULL for every ordinary task. */
  archived_at: string | null;
  project_id: string; company: string;
  created_by_name: string | null; completed_by_name: string | null;
  assignees: { id: string; name: string }[];
  images: { url: string; filename: string; content_type: string | null }[];
  comment_count: number;
  latest_agent_note: string | null;
}

export const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-stone-300', medium: 'bg-sky-400', high: 'bg-amber-500', urgent: 'bg-red-500',
};
export const PRIORITY_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };

// Automation statuses set by the task agent. Plain 'todo'/'done' show no badge.
export const STATUS_META: Record<string, { label: string; chip: string }> = {
  analysing:        { label: 'Analysing',         chip: 'border-sky-200 bg-sky-50 text-sky-700' },
  in_progress:      { label: 'In Progress',       chip: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  ready_for_review: { label: 'Ready for Review',  chip: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  needs_review:     { label: 'Needs Review',      chip: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  needs_kieran:     { label: 'Needs Attention',   chip: 'border-red-300 bg-red-50 text-red-700' },
  waiting_client:   { label: 'Waiting on Client', chip: 'border-stone-200 bg-stone-100 text-stone-600' },
  failed:           { label: 'Failed (technical)', chip: 'border-amber-300 bg-amber-50 text-amber-800' },
  // v3 deploy pipeline: approval is no longer the end — the task deploys and is
  // verified live before it becomes Done.
  approved:         { label: 'Approved — deploying soon', chip: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  deploying:        { label: 'Deploying',          chip: 'border-indigo-300 bg-indigo-50 text-indigo-700' },
  deploy_failed:    { label: 'Deploy failed',      chip: 'border-red-300 bg-red-50 text-red-700' },
};
// Left-edge accent for the two states that need a human's eyes.
const STATUS_ACCENT: Record<string, string> = {
  needs_kieran: 'border-stone-200 border-l-4 border-l-red-500',
  failed: 'border-stone-200 border-l-4 border-l-amber-500',
};

// Company tag colours — keyed by name so a future rename degrades gracefully.
const COMPANY_TEXT: Record<string, string> = {
  'Windsor Glow': 'text-amber-700', 'AI Idiots': 'text-violet-700', 'Social Media Engine': 'text-sky-700',
};
const COMPANY_CHIP: Record<string, string> = {
  'Windsor Glow': 'border-amber-200 bg-amber-50 text-amber-800',
  'AI Idiots': 'border-violet-200 bg-violet-50 text-violet-800',
  'Social Media Engine': 'border-sky-200 bg-sky-50 text-sky-800',
};
export const companyText = (name: string) => COMPANY_TEXT[name] ?? 'text-stone-500';
export const companyChip = (name: string) => COMPANY_CHIP[name] ?? 'border-stone-200 bg-stone-50 text-stone-600';

const todayISO = () => new Date().toISOString().slice(0, 10);
export const isOverdue = (t: TaskRow) => Boolean(t.due_date) && t.status !== 'done' && t.due_date!.slice(0, 10) < todayISO();
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const isVideo = (t?: string | null) => Boolean(t && t.startsWith('video/'));

// Turn an agent note (markdown + emoji labels) into clean, readable card text:
// drop the leading robot/emoji + ALL-CAPS status label, strip markdown emphasis,
// collapse blank lines, and cap the length so the card stays tidy.
function cleanNote(raw: string): string {
  let s = raw
    .replace(/^[^A-Za-z0-9\n]+/, '')                               // leading robot/emoji/symbols
    .replace(/^[A-Z][A-Z ]{3,}?\s*[—:-]\s*/, '')                    // leading ALL-CAPS status label up to its dash/colon
    .replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')   // bold/italic
    .replace(/`([^`]*)`/g, '$1')                                    // code ticks
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (s.length > 320) s = s.slice(0, 317).replace(/\s+\S*$/, '') + '…';
  return s;
}

export default function TasksApp() {
  const confirm = useConfirm();
  const params = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [me, setMe] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  // Board view: the live to-do list, or the "Delivered" showcase of finished
  // work with its evidence — so a reviewer can see completed deliverables
  // (screen recordings, screenshots) instead of them just being crossed off.
  const [view, setView] = useState<'active' | 'delivered' | 'archive'>('active');
  const [openTask, setOpenTask] = useState<string | null>(params.get('task'));
  const [showNew, setShowNew] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [justDone, setJustDone] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  const loadBootstrap = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/tasks/bootstrap');
      if (!r.ok) throw new Error(`The task service returned ${r.status}`);
      const d = await r.json();
      if (!d.configured) { setConfigured(false); setLoading(false); return; }
      setMembers(d.members); setMe(d.me); setCompanies(d.companies ?? []);
      setRetentionDays(d.retentionDays ?? 30);
      setLoading(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not reach the task service');
      setLoading(false);
    }
  }, []);
  const loadTasks = useCallback(async () => {
    const q = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
    const r = await fetch(`/api/admin/tasks/list${q}`);
    const d = await r.json();
    setTasks(d.tasks ?? []);
  }, [search]);
  useEffect(() => { void loadBootstrap(); }, [loadBootstrap]);
  useEffect(() => { if (me) void loadTasks(); }, [me, loadTasks]);

  const complete = async (t: TaskRow) => {
    setJustDone(t.id);
    await fetch(`/api/admin/tasks/task/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete' }),
    });
    setTimeout(() => { setJustDone(null); void loadTasks(); }, 450);
  };

  // Approving an agent-completed task marks it done AND flags it approved, so the
  // shipper picks it up (auto-ship when armed). Use this for ready_for_review, not
  // plain complete.
  const approve = async (t: TaskRow) => {
    setJustDone(t.id);
    await fetch(`/api/admin/tasks/task/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }),
    });
    setTimeout(() => { setJustDone(null); void loadTasks(); }, 450);
  };

  const clearTask = async (t: TaskRow) => {
    // Delivered work with evidence is the record a reviewer needs — deleting it
    // takes a stronger, explicit confirm (and forces past the server guard).
    const hasEvidence = t.images.length > 0;
    const msg = hasEvidence
      ? {
          title: `Delete "${t.title}" and its evidence?`,
          body: `It has ${t.images.length} piece${t.images.length > 1 ? 's' : ''} of evidence (screenshots or recordings) that a reviewer may still need.\n\nThis cannot be undone.`,
          confirmLabel: 'Yes, delete both',
          cancelLabel: 'Keep it',
          tone: 'danger' as const,
        }
      : {
          title: `Permanently clear "${t.title}"?`,
          body: 'The task and its comments and files are removed for good. This cannot be undone.',
          confirmLabel: 'Yes, clear it',
          cancelLabel: 'Keep it',
          tone: 'danger' as const,
        };
    if (!(await confirm(msg))) return;
    await fetch(`/api/admin/tasks/task/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear', force: hasEvidence }),
    });
    void loadTasks();
  };

  const clearAllDone = async () => {
    if (done.length === 0) return;
    // Sweep EVERY delivered item in the current view (it respects the company
    // filter). Items with evidence used to be silently skipped, which made the
    // button look broken once every delivered task carried proof — instead,
    // one explicit confirm now spells out how much evidence goes with them.
    const withEvidence = done.filter((t) => t.images.length > 0).length;
    const evidenceNote = withEvidence > 0
      ? `\n\n${withEvidence} of them ${withEvidence > 1 ? 'have' : 'has'} evidence attached (screenshots / recordings) — that is deleted too.`
      : '';
    if (!(await confirm({
      title: `Permanently clear all ${done.length} completed task${done.length > 1 ? 's' : ''} in this view?`,
      body: `They are removed for good, with their comments and files. Active tasks are not touched.${evidenceNote}`,
      confirmLabel: 'Yes, clear them',
      cancelLabel: 'Leave them',
      tone: 'danger',
    }))) return;
    let failed = 0;
    for (const t of done) {
      const res = await fetch(`/api/admin/tasks/task/${t.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear', force: true }),
      }).catch(() => null);
      if (!res || !res.ok) failed += 1;
    }
    if (failed > 0) window.alert(`${failed} task${failed > 1 ? 's' : ''} could not be cleared — try again, or clear ${failed > 1 ? 'them' : 'it'} individually.`);
    void loadTasks();
  };

  const visible = useMemo(
    () => companyFilter === 'all' ? tasks : tasks.filter((t) => t.project_id === companyFilter),
    [tasks, companyFilter]);
  // Active = everything not done (includes the agent's mid-flight states, so a
  // task never vanishes when the agent moves it to analysing / needs_kieran).
  // Anything filed to the archive is excluded from BOTH piles: it has been
  // dealt with, and it is not a delivery (task 12881e9c).
  const todo = useMemo(() => visible.filter((t) => t.status !== 'done' && !t.archived_at), [visible]);
  const done = useMemo(() => visible.filter((t) => t.status === 'done' && !t.archived_at), [visible]);
  const archived = useMemo(
    () => visible.filter((t) => t.archived_at)
      .sort((a, b) => (b.archived_at ?? '').localeCompare(a.archived_at ?? '')),
    [visible]);

  if (loading) return <p className="py-20 text-center text-sm text-stone-400">Loading tasks...</p>;
  if (loadError) return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center">
      <h1 className="text-lg font-semibold text-stone-900">The task system hit a problem</h1>
      <p className="mt-2 text-sm text-stone-500">{loadError}.</p>
      <button type="button" onClick={() => { setLoadError(''); setLoading(true); void loadBootstrap(); }}
        className="mt-4 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Try again</button>
    </div>
  );
  if (!configured) return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center">
      <h1 className="text-lg font-semibold text-stone-900">Task system not connected</h1>
      <p className="mt-2 text-sm text-stone-500">Set TASKS_DATABASE_URL and run the setup script.</p>
    </div>
  );
  if (!me) return <IdentityPicker members={members} onDone={loadBootstrap} />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-amber-700">Team tasks</p>
          <h1 className="mt-1 text-2xl font-semibold text-stone-900">To-do list</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-stone-400 sm:block">Working as {me.name}</span>
          <button type="button" onClick={() => setShowTeam(true)}
            className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 hover:border-stone-400">
            Team
          </button>
          <button type="button" onClick={() => setShowNew(true)}
            className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">
            New task
          </button>
        </div>
      </div>

      {/* Ops strip (audit M5): a one-line agent health readout for the admin. */}
      {me.role === 'workspace_admin' && (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-400">
          <span>Agent: <b className="text-indigo-600">{tasks.filter((x) => ['queued', 'executing', 'revision_requested'].includes(x.status)).length}</b> in flight</span>
          <span><b className="text-emerald-600">{tasks.filter((x) => ['ready_for_review', 'needs_review'].includes(x.status)).length}</b> awaiting review</span>
          <span><b className="text-indigo-500">{tasks.filter((x) => ['approved', 'deploying'].includes(x.status)).length}</b> deploying</span>
          <span><b className="text-red-600">{tasks.filter((x) => ['needs_kieran', 'deploy_failed'].includes(x.status)).length}</b> need attention</span>
          <span><b className="text-stone-500">{tasks.filter((x) => x.status === 'done').length}</b> done</span>
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks"
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-amber-600 sm:max-w-xs" />
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setCompanyFilter('all')}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              companyFilter === 'all' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400'}`}>
            All
          </button>
          {companies.map((c) => (
            <button key={c.id} type="button" onClick={() => setCompanyFilter(companyFilter === c.id ? 'all' : c.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                companyFilter === c.id ? companyChip(c.name) : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400'}`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Active list vs the Delivered showcase. Delivered gives the reviewer a
          permanent home for finished work + its evidence. */}
      <div className="mt-4 inline-flex rounded-full border border-stone-200 bg-white p-0.5">
        <button type="button" onClick={() => setView('active')}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${view === 'active' ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800'}`}>
          Active list <span className={view === 'active' ? 'text-white/70' : 'text-stone-400'}>{todo.length}</span>
        </button>
        <button type="button" onClick={() => setView('delivered')}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${view === 'delivered' ? 'bg-emerald-600 text-white' : 'text-stone-500 hover:text-stone-800'}`}>
          Delivered <span className={view === 'delivered' ? 'text-white/70' : 'text-stone-400'}>{done.length}</span>
        </button>
        {/* Answers worth keeping, filed rather than deployed (task 12881e9c). */}
        <button type="button" onClick={() => setView('archive')}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${view === 'archive' ? 'bg-indigo-600 text-white' : 'text-stone-500 hover:text-stone-800'}`}>
          Archive <span className={view === 'archive' ? 'text-white/70' : 'text-stone-400'}>{archived.length}</span>
        </button>
      </div>

      {/* How to write a good task — collapsible reference for the team. Stays
          folded away by default so it never gets in the way. */}
      <details className="group mt-4 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/50">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-amber-900 [&::-webkit-details-marker]:hidden">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          How to write a task that gets done well
          <span className="ml-auto text-xs font-normal text-amber-600 transition-transform group-open:rotate-180" aria-hidden>▾</span>
        </summary>
        <div className="border-t border-amber-200 px-4 py-4">
          <p className="mb-3 text-sm text-amber-800">The more you give, the better and faster the result. Thirty seconds here saves a lot of back and forth.</p>
          <ol className="space-y-2.5 text-sm text-amber-900/90">
            {[
              ['Say what you want in one line', 'even if you attach a photo. A photo on its own can be read the wrong way; a sentence removes the doubt.'],
              ['Attach the photo or video you mention', '. "As per the video" only works if the video is actually on the task.'],
              ['A screenshot of the problem beats a video', '. If you do record one, talk through what is wrong as you go, otherwise it tells us very little.'],
              ['For settings, give the exact details', '. Names, emails, prices, dates. Do not make the agent guess.'],
            ].map(([bold, rest], i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[11px] font-bold text-amber-800">{i + 1}</span>
                <span><strong className="font-semibold text-amber-900">{bold}</strong>{rest}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-red-200 bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500">Hard to action</p>
              <p className="mt-1 text-[13px] text-stone-500">&ldquo;Fix the products page, see photo&rdquo; (with no photo attached)</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Gets done well</p>
              <p className="mt-1 text-[13px] text-stone-600">&ldquo;On the admin products page, make live vs hidden items obvious at a glance. Screenshot attached.&rdquo;</p>
            </div>
          </div>
        </div>
      </details>

      {/* TO DO */}
      {view === 'active' && (
      <section className="mt-6">
        <h2 className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wider text-stone-500">
          To do <span className="text-stone-400">{todo.length}</span>
        </h2>
        <div className="mt-3 space-y-2">
          {todo.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
              <p className="text-sm font-medium text-stone-700">All clear</p>
              <p className="mt-1 text-sm text-stone-400">
                {companyFilter === 'all' ? 'Nothing on the list. Add a task to get the team moving.' : 'Nothing on the list for this company.'}
              </p>
            </div>
          )}
          {todo.map((t) => (
            <div key={t.id}
              className={`flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-sm transition-all duration-300 hover:border-amber-600/50 ${STATUS_ACCENT[t.status] ?? 'border-stone-200'} ${justDone === t.id ? 'opacity-30' : ''}`}>
              <button type="button" onClick={() => void complete(t)} aria-label={`Mark "${t.title}" as done`}
                className="group mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-stone-300 transition-colors hover:border-emerald-500 hover:bg-emerald-50">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-emerald-600 opacity-0 transition-opacity group-hover:opacity-100" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
              </button>
              <button type="button" onClick={() => setOpenTask(t.id)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-1.5">
                  {t.task_number != null && (
                    <span className="rounded-md bg-stone-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white" title="Permanent task number">#{t.task_number}</span>
                  )}
                  <p className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${companyText(t.company)}`}>{t.company}</p>
                  {STATUS_META[t.status] && (
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${STATUS_META[t.status].chip}`}>{STATUS_META[t.status].label}</span>
                  )}
                  {t.task_type && (
                    <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-stone-500">{t.task_type.replace(/-/g, ' ')}</span>
                  )}
                </div>
                <p className={`mt-0.5 text-sm font-medium text-stone-900 ${justDone === t.id ? 'line-through' : ''}`}>{t.title}</p>
                {/* When the agent needs a human decision, show its question
                    right on the card so the reviewer can read it and respond
                    confidently without opening the task. */}
                {t.latest_agent_note && ['needs_kieran', 'deploy_failed'].includes(t.status) && cleanNote(t.latest_agent_note) && (
                  <div className="mt-2 rounded-xl border border-red-200 bg-red-50/70 px-3 py-2 text-xs leading-relaxed text-red-900">
                    <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide opacity-70">The AI needs your answer</p>
                    <p className="whitespace-pre-wrap">{cleanNote(t.latest_agent_note)}</p>
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[t.priority]}`} />{PRIORITY_LABEL[t.priority]}
                  </span>
                  {t.due_date && (
                    <span className={isOverdue(t) ? 'font-semibold text-red-600' : ''}>
                      {isOverdue(t) ? 'Overdue, ' : 'Due '}{fmtDay(t.due_date)}
                    </span>
                  )}
                  {t.assignees.length > 0 && <span>{t.assignees.map((a) => a.name.split(' ')[0]).join(', ')}</span>}
                  {t.images.length > 0 && <span>{t.images.length} file{t.images.length > 1 ? 's' : ''}</span>}
                  {t.comment_count > 0 && <span>{t.comment_count} comment{t.comment_count > 1 ? 's' : ''}</span>}
                </div>
                {t.images.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    {t.images.slice(0, 4).map((img) => isVideo(img.content_type) ? (
                      <span key={img.url} className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200 bg-stone-900">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- a 40px thumbnail of an uploaded task image. next/image optimises nothing at this size and would need every blob host allow-listed.
                      <img key={img.url} src={img.url} alt="" className="h-10 w-10 rounded-lg border border-stone-100 object-cover" />
                    ))}
                  </div>
                )}
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1 self-start">
                {(t.status === 'ready_for_review' || t.status === 'needs_review') && (
                  <button type="button" onClick={() => void approve(t)}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">
                    Approve
                  </button>
                )}
                <button type="button" onClick={() => void clearTask(t)} aria-label={`Delete "${t.title}" permanently`}
                  className="rounded-lg border border-stone-200 px-2.5 py-1 text-[11px] font-medium text-stone-400 hover:border-red-300 hover:text-red-600">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* DELIVERED — a permanent home for finished work + its evidence, so a
          reviewer can open any item and see the screen recording / screenshots,
          rather than the work just being crossed off and swept away. */}
      {view === 'delivered' && (
      <section className="mt-6 pb-10">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wider text-emerald-700">
              Delivered <span className="text-emerald-500">{done.length}</span>
            </h2>
            <p className="mt-1 text-xs text-stone-400">Finished work. Open any item to see the screen recording and screenshots that prove it was done.</p>
          </div>
          {/* The same permanent deletion is called "Delete" on the active list above and
              used to be called "Clear" down here. One action, one word. */}
          {done.length > 0 && (
            <button type="button" onClick={() => void clearAllDone()}
              className="shrink-0 text-xs font-medium text-stone-400 underline-offset-2 hover:text-red-600 hover:underline">
              Delete all
            </button>
          )}
        </div>
        <div className="mt-4 space-y-2">
          {done.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
              <p className="text-sm font-medium text-stone-700">Nothing delivered yet</p>
              <p className="mt-1 text-sm text-stone-400">Completed work lands here with its evidence, so it can be reviewed anytime.</p>
            </div>
          )}
          {done.map((t) => (
            <div key={t.id}
              className="flex w-full items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 transition-colors hover:border-emerald-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
              </span>
              <button type="button" onClick={() => setOpenTask(t.id)} className="min-w-0 flex-1 text-left">
                <span className={`block text-[9px] font-extrabold uppercase tracking-[0.14em] ${companyText(t.company)} opacity-70`}>{t.company}</span>
                <span className="block truncate text-sm font-medium text-stone-700">{t.title}</span>
                <span className="block text-xs text-stone-400">
                  Delivered by {t.completed_by_name ?? 'the agent'}{t.completed_at ? ` · ${new Date(t.completed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
              </button>
              <button type="button" onClick={() => setOpenTask(t.id)}
                className="shrink-0 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:border-emerald-400">
                View evidence
              </button>
              <button type="button" onClick={() => void clearTask(t)} aria-label={`Delete "${t.title}" permanently`}
                className="shrink-0 rounded-lg border border-stone-200 px-2.5 py-1 text-[11px] font-medium text-stone-400 hover:border-red-300 hover:text-red-600">
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* ARCHIVE — answers kept on purpose (task 12881e9c). A task whose whole
          point was the information it produced has nothing to put live, so it is
          filed here instead of deployed. Open any one to read exactly what was
          said, with its comments, photographs and history intact. */}
      {view === 'archive' && (
      <section className="mt-6 pb-10">
        <div>
          <h2 className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wider text-indigo-700">
            Archive <span className="text-indigo-400">{archived.length}</span>
          </h2>
          <p className="mt-1 text-xs text-stone-400">
            Information you chose to keep rather than put live. Nothing here was deployed and
            nothing here has been deleted. Open any one to read it again.
          </p>
        </div>
        <div className="mt-4 space-y-2">
          {archived.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
              <p className="text-sm font-medium text-stone-700">Nothing archived yet</p>
              <p className="mt-1 text-sm text-stone-400">
                When the agent answers a question rather than changing the website, press
                &ldquo;Save and archive&rdquo; instead of Approve and it will be kept here.
              </p>
            </div>
          )}
          {archived.map((t) => (
            <div key={t.id}
              className="flex w-full items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 px-4 py-3 transition-colors hover:border-indigo-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8zM2 4h20v4H2zM10 12h4" /></svg>
              </span>
              <button type="button" onClick={() => setOpenTask(t.id)} className="min-w-0 flex-1 text-left">
                <span className={`block text-[9px] font-extrabold uppercase tracking-[0.14em] ${companyText(t.company)} opacity-70`}>{t.company}</span>
                <span className="block truncate text-sm font-medium text-stone-700">{t.title}</span>
                <span className="block text-xs text-stone-400">
                  Saved{t.archived_at ? ` ${new Date(t.archived_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
              </button>
              <button type="button" onClick={() => setOpenTask(t.id)}
                className="shrink-0 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:border-indigo-400">
                Read it
              </button>
            </div>
          ))}
        </div>
      </section>
      )}

      {showNew && <NewTaskModal members={members} me={me} companies={companies} existing={tasks} onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); void loadTasks(); }} />}
      {showTeam && <TeamModal members={members} retentionDays={retentionDays} onClose={() => setShowTeam(false)}
        onChanged={loadBootstrap} />}
      {openTask && <TaskDrawer taskId={openTask} members={members} companies={companies}
        onClose={() => { setOpenTask(null); void loadTasks(); }} />}
    </div>
  );
}

function IdentityPicker({ members, onDone }: { members: Member[]; onDone: () => void }) {
  const pick = async (memberId: string) => {
    const r = await fetch('/api/admin/tasks/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId }) });
    if (r.ok) onDone();
  };
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-stone-200 bg-white p-8">
      <h1 className="text-lg font-semibold text-stone-900">Who is working?</h1>
      <p className="mt-1 text-xs text-stone-500">Tasks, ticks and comments are recorded under your name on this device.</p>
      <div className="mt-5 space-y-2">
        {members.map((m) => (
          <button key={m.id} type="button" onClick={() => void pick(m.id)}
            className="flex w-full items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-left hover:border-amber-600">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">{m.name.slice(0, 1)}</span>
            <span><span className="block text-sm font-medium text-stone-900">{m.name}</span>
              <span className="block text-xs text-stone-400">{m.email}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TeamModal({ members, retentionDays, onClose, onChanged }: {
  members: Member[]; retentionDays: number; onClose: () => void; onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(String(retentionDays));
  const [savedDays, setSavedDays] = useState(false);
  const [error, setError] = useState('');
  const add = async () => {
    setError('');
    const r = await fetch('/api/admin/tasks/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_member', name, email }) });
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? 'Could not add'); return; }
    setName(''); setEmail(''); onChanged();
  };
  const saveDays = async () => {
    setError(''); setSavedDays(false);
    const r = await fetch('/api/admin/tasks/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_retention', days: Number(days) }) });
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? 'Could not save'); return; }
    setSavedDays(true); onChanged();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-stone-900/40 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-stone-900">Team members</h2>
        <p className="mt-1 text-xs text-stone-500">Everyone here can use the list. Their email receives task notifications.</p>
        <ul className="mt-4 space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-xl border border-stone-100 px-3 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-[11px] font-semibold text-white">{m.name.slice(0, 1)}</span>
              <span className="min-w-0"><span className="block truncate text-sm text-stone-800">{m.name}</span>
                <span className="block truncate text-xs text-stone-400">{m.email}</span></span>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-2 border-t border-stone-100 pt-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name"
            className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-600" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for notifications"
            className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-600" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-stone-500">Close</button>
            <button type="button" disabled={!name.trim() || !email.trim()} onClick={() => void add()}
              className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Add team member</button>
          </div>
        </div>
        <div className="mt-4 border-t border-stone-100 pt-4">
          <h3 className="text-sm font-semibold text-stone-900">Storage housekeeping</h3>
          <p className="mt-1 text-xs text-stone-500">
            When a task is completed, its videos are kept for this many days, then removed automatically to free space.
            Photos and the task history are always kept.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input type="number" min={1} max={365} value={days} onChange={(e) => { setDays(e.target.value); setSavedDays(false); }}
              className="w-24 rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-600" />
            <span className="text-xs text-stone-500">days</span>
            <button type="button" onClick={() => void saveDays()}
              className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 hover:border-stone-400">
              Save
            </button>
            {savedDays && <span className="text-xs font-medium text-emerald-600">Saved</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewTaskModal({ members, me, companies, existing = [], onClose, onCreated }: {
  members: Member[]; me: Member; companies: Company[]; existing?: TaskRow[]; onClose: () => void; onCreated: () => void;
}) {
  const [f, setF] = useState({ title: '', description: '', dueDate: '', priority: 'medium' });
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const uploadFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setError('');
    // Per-file isolation (v3 Stage 4): report each failure specifically, keep
    // uploading the rest.
    const failures: string[] = [];
    for (const file of Array.from(list)) {
      try {
        setProgress({ name: file.name, pct: 0 });
        const done = await uploadTaskMedia(file, (pct) => setProgress({ name: file.name, pct }));
        setMedia((prev) => [...prev, done]);
      } catch (err) {
        failures.push(err instanceof Error ? err.message : `Could not upload ${file.name}`);
      }
    }
    if (failures.length) setError(failures.join(' · '));
    setProgress(null);
  };
  const submit = async () => {
    setSaving(true); setError('');
    const r = await fetch('/api/admin/tasks/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, dueDate: f.dueDate || null, companyId, assigneeIds: assignees, images: media }),
    });
    const d = await r.json(); setSaving(false);
    if (!r.ok) { setError(d.error ?? 'Could not create task'); return; }
    onCreated();
  };
  const field = 'w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-amber-600';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-stone-900/40 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-stone-900">New task</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-stone-500">Company
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} mt-1 font-medium`}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <input autoFocus value={f.title} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} placeholder="What needs doing? *" className={field} />
          {/* Duplicate warning (audit M4): flag similar existing tasks before a twin is created. */}
          {(() => {
            const words = f.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
            if (words.length < 2) return null;
            const similar = existing.filter((t) => {
              const tw = t.title.toLowerCase();
              return words.filter((w) => tw.includes(w)).length >= Math.max(2, Math.ceil(words.length * 0.6));
            }).slice(0, 3);
            if (similar.length === 0) return null;
            return (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                <b>Similar task{similar.length > 1 ? 's' : ''} already exist{similar.length > 1 ? '' : 's'}:</b>
                {similar.map((s) => (
                  <span key={s.id} className="block truncate">
                    • {s.title} <span className="text-amber-600">({s.status === 'done' ? 'done' : s.status.replace(/_/g, ' ')})</span>
                  </span>
                ))}
                <span className="mt-0.5 block text-amber-700">If it is the same thing, add a comment to that task instead of creating a twin.</span>
              </div>
            );
          })()}
          <div>
            <textarea value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} rows={3}
              placeholder="Details (optional) — type or press the mic and just say it" className={field} />
            <div className="mt-1 flex justify-end">
              <VoiceInput context="task" onText={(t) => setF((p) => ({ ...p, description: p.description ? p.description + ' ' + t : t }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-stone-500">Due date (optional)
              <input type="date" value={f.dueDate} onChange={(e) => setF((p) => ({ ...p, dueDate: e.target.value }))} className={`${field} mt-1`} />
            </label>
            <label className="text-xs text-stone-500">Priority
              <select value={f.priority} onChange={(e) => setF((p) => ({ ...p, priority: e.target.value }))} className={`${field} mt-1`}>
                {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </label>
          </div>

          <div>
            <p className="text-xs text-stone-500">Assign to (optional)</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {members.map((m) => (
                <button key={m.id} type="button"
                  onClick={() => setAssignees((a) => a.includes(m.id) ? a.filter((x) => x !== m.id) : [...a, m.id])}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    assignees.includes(m.id) ? 'border-amber-600 bg-amber-50 text-amber-800' : 'border-stone-200 text-stone-500 hover:border-stone-400'}`}>
                  {m.name}{m.id === me.id ? ' (you)' : ''}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-500 hover:border-amber-600">
              <span>{progress ? `Uploading ${progress.name}... ${progress.pct}%` : 'Add photos (10MB) or videos (200MB, ~2 min)'}</span>
              <span className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white">Browse</span>
              <input type="file" accept="image/*,video/mp4,video/quicktime,video/webm,video/*" multiple className="hidden"
                onChange={(e) => { void uploadFiles(e.target.files); e.target.value = ''; }} />
            </label>
            {progress && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-amber-600 transition-all duration-200" style={{ width: `${progress.pct}%` }} />
              </div>
            )}
            {media.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {media.map((m) => (
                  <span key={m.url} className="relative">
                    {m.contentType.startsWith('video/') ? (
                      <span className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-stone-200 bg-stone-900 px-1">
                        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        <span className="w-full truncate text-center text-[8px] text-stone-300">{m.filename}</span>
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- a 64px preview of a file the user has just attached, before it has a permanent URL. next/image cannot handle that.
                      <img src={m.url} alt={m.filename} className="h-16 w-16 rounded-lg border border-stone-200 object-cover" />
                    )}
                    <button type="button" onClick={() => setMedia((prev) => prev.filter((x) => x.url !== m.url))}
                      aria-label="Remove file"
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-[10px] text-white">✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-stone-500">Cancel</button>
            <button type="button" disabled={saving || Boolean(progress) || !f.title.trim()} onClick={() => void submit()}
              className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {saving ? 'Adding...' : 'Add task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
