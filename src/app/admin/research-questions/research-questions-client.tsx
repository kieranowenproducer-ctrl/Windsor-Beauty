'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type View = 'all' | 'members' | 'staff' | 'today' | 'week' | 'attention' | 'unanswered' | 'terms-review' | 'errors';

interface QuestionRow {
  id: number;
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  is_staff: boolean;
  question: string;
  answer_kind: string | null;
  answer_title: string | null;
  answer_summary: string | null;
  answer_json: unknown;
  compounds: string[] | null;
  created_at: string;
}

interface Stats {
  total: number;
  members: number;
  today: number;
  week: number;
  unanswered: number;
  termsReview: number;
  attention: number;
  errors: number;
}

interface MemberSummary {
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  question_count: number;
  last_asked: string;
}

interface CountSummary { label: string; count: number }

interface ApiData {
  questions: QuestionRow[];
  total: number;
  stats: Stats;
  members: MemberSummary[];
  topCompounds: CountSummary[];
  languageGaps: CountSummary[];
}

interface Source { label?: string; detail?: string; url?: string }
interface Suggestion { label?: string; slug?: string }
interface Interpretation {
  status?: string;
  type?: string;
  method?: string;
  confidence?: string;
  matchedText?: string;
  disclosure?: string;
  expandedTerms?: string[];
  suggestions?: Suggestion[];
  blendId?: string | null;
}

interface AnswerDetails {
  bullets: string[];
  sources: Source[];
  followUps: string[];
  suggestions: Suggestion[];
  interpretation: Interpretation | null;
  needsLanguageReview: boolean;
}

const EMPTY_STATS: Stats = { total: 0, members: 0, today: 0, week: 0, unanswered: 0, termsReview: 0, errors: 0, attention: 0 };

const KIND_LABELS: Record<string, string> = {
  dose: 'Source range', evidence: 'Research evidence', safety: 'Safety notes',
  mechanism: 'How it works', overview: 'Compound overview', comparison: 'Comparison',
  topic: 'Research category', clarify: 'Asked for clarity', 'no-match': 'Could not understand',
  boundary: 'Declined, out of bounds', emergency: 'Emergency, sent to help',
  'terminology-feedback': 'Terminology feedback',
};

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function answerDetails(value: unknown): AnswerDetails {
  if (!value || typeof value !== 'object') {
    return { bullets: [], sources: [], followUps: [], suggestions: [], interpretation: null, needsLanguageReview: false };
  }
  const raw = value as Record<string, unknown>;
  const sources = Array.isArray(raw.sources) ? raw.sources.filter((item): item is Source => Boolean(item) && typeof item === 'object') : [];
  const suggestions = Array.isArray(raw.suggestions) ? raw.suggestions.filter((item): item is Suggestion => Boolean(item) && typeof item === 'object') : [];
  const interpretation = raw.interpretation && typeof raw.interpretation === 'object' ? raw.interpretation as Interpretation : null;
  return {
    bullets: stringArray(raw.bullets), sources, suggestions,
    followUps: stringArray(raw.followUps), interpretation,
    needsLanguageReview: raw.needsLanguageReview === true,
  };
}

function labelForView(view: View) {
  return ({ all: 'All questions', members: 'Member questions', staff: 'Staff questions', today: 'Questions today', week: 'Questions in the last 7 days', attention: 'Answers to inspect: unclear wording or a clarifying answer', unanswered: 'Questions PEARL could not understand', 'terms-review': 'Terminology to review', errors: 'Records with missing answer details' })[view];
}

export default function ResearchQuestionsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = (params.get('view') || 'all') as View;
  const query = params.get('q') || '';
  const compound = params.get('compound') || '';
  const customer = params.get('customer') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const selectedQuestion = Number(params.get('question')) || null;
  const panel = params.get('panel');

  const [data, setData] = useState<ApiData>({ questions: [], total: 0, stats: EMPTY_STATS, members: [], topCompounds: [], languageGaps: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState(query);

  const replaceParams = useCallback((changes: Record<string, string | null>, mode: 'push' | 'replace' = 'push') => {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    const href = `${pathname}${next.size ? `?${next.toString()}` : ''}`;
    mode === 'replace' ? router.replace(href) : router.push(href);
  }, [params, pathname, router]);

  useEffect(() => setSearchInput(query), [query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const request = new URLSearchParams();
    if (view !== 'all') request.set('view', view);
    if (query) request.set('q', query);
    if (compound) request.set('compound', compound);
    if (customer) request.set('customer', customer);
    if (page > 1) request.set('page', String(page));
    fetch(`/api/admin/research-questions?${request.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load PEARL Questions.');
        return payload as ApiData;
      })
      .then(setData)
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [view, query, compound, customer, page]);

  const cards = useMemo(() => [
    { label: 'Questions Asked', value: data.stats.total, changes: { view: 'all', panel: null } },
    { label: 'Members Asking', value: data.stats.members, changes: { view: 'members', panel: 'members' } },
    { label: 'Today', value: data.stats.today, changes: { view: 'today', panel: null } },
    { label: 'Last 7 Days', value: data.stats.week, changes: { view: 'week', panel: null } },
    { label: 'Questions to Teach', value: data.stats.unanswered, changes: { view: 'unanswered', panel: null } },
    { label: 'Terms to Review', value: data.stats.termsReview, changes: { view: 'terms-review', panel: null } },
  ], [data.stats]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    replaceParams({ q: searchInput.trim() || null, page: null, question: null, panel: null });
  }

  return (
    <main className="flex-1 overflow-clip p-5 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin/dashboard" className="mb-6 inline-flex min-h-11 items-center text-[10px] font-medium uppercase tracking-[0.16em] text-stone-500 hover:text-gold-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
          &larr; Dashboard
        </Link>

        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-700">PEARL audit trail</p>
            <h1 className="text-2xl font-semibold text-stone-900">PEARL Questions</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">Every saved question, the person who asked it and the exact answer PEARL gave. Times are UK time.</p>
          </div>
          <Link href="/admin/pearl-terminology" className="inline-flex min-h-11 items-center bg-gold-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
            Manage Terminology
          </Link>
        </div>

        <section aria-label="Question summaries" className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {cards.map((card) => {
            const active = (card.label === 'Members Asking' && panel === 'members') || (card.changes.view === view && !panel);
            return (
              <button key={card.label} type="button" onClick={() => replaceParams({ ...card.changes, q: null, page: null, question: null, customer: null, compound: null })} aria-pressed={active} className={`min-h-24 border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 ${active ? 'border-gold-500 bg-gold-50' : 'border-stone-200 bg-white hover:border-gold-300'}`}>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">{card.label}</span>
                <span className="mt-2 block text-2xl font-semibold tabular-nums text-stone-900">{loading ? '-' : card.value}</span>
                <span className="mt-1 block text-[10px] text-gold-700">Open list</span>
              </button>
            );
          })}
        </section>

        <div aria-live="polite" className="sr-only">{loading ? 'Loading questions' : `${data.total} questions shown by the current filters`}</div>
        {error && <div role="alert" className="mb-6 border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} <button type="button" onClick={() => window.location.reload()} className="ml-2 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">Try again</button></div>}

        {panel === 'members' ? (
          <MemberPanel members={data.members} onSelect={(id) => replaceParams({ panel: null, view: 'members', customer: id ? String(id) : null, page: null })} onClose={() => replaceParams({ panel: null })} />
        ) : (
          <>
            <Insights data={data} replaceParams={replaceParams} />

            <form onSubmit={submitSearch} role="search" className="mb-5 grid gap-3 border border-stone-200 bg-white p-4 md:grid-cols-[minmax(16rem,1fr)_auto_auto_auto]">
              <div>
                <label htmlFor="question-search" className="mb-1.5 block text-xs font-medium text-stone-700">Search questions, people, answers or compounds</label>
                <input id="question-search" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} autoComplete="off" placeholder="For example, BPC-157 or a member email" className="min-h-11 w-full border border-stone-300 px-3 text-base text-stone-800 outline-none placeholder:text-stone-400 focus:border-gold-500 focus:ring-2 focus:ring-gold-200 md:text-sm" />
              </div>
              <div>
                <label htmlFor="audience-filter" className="mb-1.5 block text-xs font-medium text-stone-700">People</label>
                <select id="audience-filter" value={view === 'members' || view === 'staff' ? view : 'all'} onChange={(event) => replaceParams({ view: event.target.value === 'all' ? null : event.target.value, page: null, customer: null, question: null })} className="min-h-11 w-full border border-stone-300 bg-white px-3 text-sm text-stone-700 outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-200">
                  <option value="all">Everyone</option><option value="members">Members only</option><option value="staff">Staff only</option>
                </select>
              </div>
              <div>
                <label htmlFor="question-status-filter" className="mb-1.5 block text-xs font-medium text-stone-700">Question status</label>
                <select id="question-status-filter" value={['today', 'week', 'attention', 'unanswered', 'terms-review', 'errors'].includes(view) ? view : 'all'} onChange={(event) => replaceParams({ view: event.target.value === 'all' ? null : event.target.value, page: null, customer: null, question: null })} className="min-h-11 w-full border border-stone-300 bg-white px-3 text-sm text-stone-700 outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-200">
                  <option value="all">All statuses</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 days</option>
                  <option value="unanswered">Could not understand</option>
                  <option value="attention">Answers to inspect</option>
                  <option value="terms-review">Terminology to review</option>
                  <option value="errors">Missing answer details</option>
                </select>
              </div>
              <button type="submit" className="min-h-11 self-end bg-stone-900 px-5 text-sm font-semibold text-white hover:bg-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400">Search</button>
              {(query || compound || customer || view !== 'all') && <button type="button" onClick={() => { setSearchInput(''); replaceParams({ q: null, compound: null, customer: null, view: null, page: null, question: null }); }} className="min-h-10 justify-self-start text-xs font-medium text-stone-500 underline hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 md:col-span-4">Clear all filters</button>}
            </form>

            <section aria-labelledby="question-list-title" className="border border-stone-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
                <h2 id="question-list-title" className="text-sm font-semibold text-stone-900">{labelForView(view)}</h2>
                <p className="text-xs tabular-nums text-stone-500">{loading ? 'Loading...' : `${data.total} matching`}</p>
              </div>
              <QuestionList rows={data.questions} loading={loading} onOpen={(id) => replaceParams({ question: String(id) })} />
            </section>

            <Pagination page={page} total={data.total} pageSize={100} onPage={(next) => replaceParams({ page: next > 1 ? String(next) : null, question: null })} />
          </>
        )}
      </div>

      {selectedQuestion && <QuestionDrawer id={selectedQuestion} onClose={() => replaceParams({ question: null }, 'replace')} />}
    </main>
  );
}

function Insights({ data, replaceParams }: { data: ApiData; replaceParams: (changes: Record<string, string | null>) => void }) {
  if (data.topCompounds.length === 0 && data.languageGaps.length === 0) return null;
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-2">
      {data.topCompounds.length > 0 && <section className="border border-stone-200 bg-white p-4"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Most asked about by members</h2><div className="mt-3 flex flex-wrap gap-2">{data.topCompounds.map((item) => <button key={item.label} type="button" onClick={() => replaceParams({ compound: item.label, view: 'members', page: null, question: null })} className="min-h-10 border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700 hover:border-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">{item.label} <span className="ml-2 tabular-nums text-stone-400">{item.count}</span></button>)}</div></section>}
      {data.languageGaps.length > 0 && <section className="border border-amber-200 bg-amber-50 p-4"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-900">Phrases PEARL could learn next</h2><p className="mt-1 text-xs leading-relaxed text-stone-600">These were not understood. Nothing is added automatically.</p><div className="mt-3 flex flex-wrap gap-2">{data.languageGaps.map((item) => <button key={item.label} type="button" onClick={() => replaceParams({ q: item.label, view: 'unanswered', page: null, question: null })} className="min-h-10 border border-amber-200 bg-white px-3 py-2 text-left text-xs text-stone-700 hover:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">{item.label} <span className="ml-2 tabular-nums text-amber-700">{item.count}</span></button>)}</div></section>}
    </div>
  );
}

function MemberPanel({ members, onSelect, onClose }: { members: MemberSummary[]; onSelect: (id: number | null) => void; onClose: () => void }) {
  return (
    <section className="border border-stone-200 bg-white" aria-labelledby="members-title">
      <div className="flex items-center justify-between border-b border-stone-200 p-4"><div><h2 id="members-title" className="font-semibold text-stone-900">Members Asking</h2><p className="mt-1 text-xs text-stone-500">One row per member. The number here matches the summary card.</p></div><button type="button" onClick={onClose} className="min-h-10 px-3 text-xs font-medium text-stone-600 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">Back to questions</button></div>
      {members.length === 0 ? <p className="p-8 text-center text-sm text-stone-500">No member questions have been saved yet.</p> : <ul className="divide-y divide-stone-100">{members.map((member, index) => <li key={`${member.customer_id ?? member.customer_email ?? 'unknown'}-${index}`} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="text-sm font-medium text-stone-900">{member.customer_name || 'Unknown member'}</p><p className="mt-1 break-all text-xs text-stone-500">{member.customer_email || 'No email saved'}</p></div><div className="text-xs text-stone-500"><span className="font-semibold tabular-nums text-stone-800">{member.question_count}</span> questions<br />Last asked {formatDate(member.last_asked)}</div><div className="flex gap-2">{member.customer_id && <Link href={`/admin/customers/${member.customer_id}`} className="inline-flex min-h-10 items-center border border-stone-200 px-3 text-xs text-stone-600 hover:border-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">Customer</Link>}<button type="button" onClick={() => onSelect(member.customer_id)} disabled={!member.customer_id} className="min-h-10 bg-stone-900 px-3 text-xs font-semibold text-white enabled:hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400">View questions</button></div></li>)}</ul>}
    </section>
  );
}

function QuestionList({ rows, loading, onOpen }: { rows: QuestionRow[]; loading: boolean; onOpen: (id: number) => void }) {
  if (loading) return <p className="p-10 text-center text-sm text-stone-500">Loading questions...</p>;
  if (rows.length === 0) return <p className="p-10 text-center text-sm text-stone-500">No questions match these filters.</p>;
  return <ul className="divide-y divide-stone-100">{rows.map((row) => {
    const details = answerDetails(row.answer_json);
    const status = details.needsLanguageReview ? 'Could not understand' : details.interpretation?.status === 'unknown' || details.interpretation?.status === 'ambiguous' ? 'Term needs review' : row.answer_title ? 'Answer saved' : 'Missing answer details';
    return <li key={row.id}><button type="button" onClick={() => onOpen(row.id)} className="grid min-h-24 w-full gap-3 p-4 text-left hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-300 md:grid-cols-[9rem_13rem_minmax(0,1fr)_9rem] md:items-start"><div className="text-xs text-stone-500">{formatDate(row.created_at)}</div><div className="min-w-0"><p className="truncate text-xs font-medium text-stone-800">{row.is_staff ? 'Windsor Glow staff' : row.customer_name || 'Deleted member'}</p><p className="truncate text-[11px] text-stone-400">{row.is_staff ? 'Admin panel' : row.customer_email || 'No email saved'}</p></div><div className="min-w-0"><p className="line-clamp-2 text-sm leading-relaxed text-stone-800">{row.question}</p>{row.compounds?.length ? <div className="mt-2 flex flex-wrap gap-1">{row.compounds.map((item) => <span key={item} className="bg-gold-50 px-2 py-0.5 text-[10px] text-gold-800">{item}</span>)}</div> : null}</div><div><span className={`inline-block px-2 py-1 text-[10px] font-medium ${status === 'Answer saved' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{status}</span><span className="mt-2 block text-[10px] text-gold-700">Open details</span></div></button></li>;
  })}</ul>;
}

function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return <nav aria-label="Question pages" className="mt-5 flex items-center justify-between"><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="min-h-11 border border-stone-300 bg-white px-4 text-sm text-stone-700 enabled:hover:border-gold-400 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">Previous</button><p className="text-xs tabular-nums text-stone-500">Page {page} of {pages}</p><button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="min-h-11 border border-stone-300 bg-white px-4 text-sm text-stone-700 enabled:hover:border-gold-400 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">Next</button></nav>;
}

function QuestionDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const [row, setRow] = useState<QuestionRow | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/research-questions/${id}`, { signal: controller.signal }).then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Could not load this question.'); return payload.question as QuestionRow; }).then(setRow).catch((reason: Error) => { if (reason.name !== 'AbortError') setError(reason.message); });
    return () => controller.abort();
  }, [id]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);
  const details = answerDetails(row?.answer_json);
  return <div className="fixed inset-0 z-50 flex justify-end"><button type="button" aria-label="Close question details" onClick={onClose} className="absolute inset-0 bg-stone-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white" /><aside role="dialog" aria-modal="true" aria-labelledby="question-detail-title" className="relative h-full w-full max-w-2xl overflow-y-auto bg-stone-50 p-5 shadow-2xl sm:p-7"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-700">Saved answer audit</p><h2 id="question-detail-title" className="mt-1 text-xl font-semibold text-stone-900">Question details</h2></div><button type="button" onClick={onClose} className="min-h-11 border border-stone-300 bg-white px-4 text-sm text-stone-700 hover:border-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">Close</button></div>{error ? <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : !row ? <p className="text-sm text-stone-500">Loading details...</p> : <div className="space-y-5"><section className="border border-stone-200 bg-white p-5"><p className="text-xs text-stone-500">{formatDate(row.created_at)} &bull; {row.is_staff ? 'Windsor Glow staff' : row.customer_name || 'Deleted member'}</p>{!row.is_staff && <p className="mt-1 break-all text-xs text-stone-400">{row.customer_email || 'No email saved'}</p>}<h3 className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Question asked</h3><p className="mt-2 text-base leading-relaxed text-stone-900">{row.question}</p><div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2"><Link href={`/admin/pearl?ask=${encodeURIComponent(row.question)}&qid=${row.id}`} className="inline-flex min-h-10 items-center text-xs font-semibold text-gold-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">Open in PEARL Dashboard</Link>{row.customer_id && <Link href={`/admin/customers/${row.customer_id}`} className="inline-flex min-h-10 items-center text-xs font-medium text-gold-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">Open customer record</Link>}</div></section><section className="border border-stone-200 bg-white p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Answer given</h3><span className={`px-2 py-1 text-[10px] font-medium ${row.answer_title && row.answer_summary ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{row.answer_title && row.answer_summary ? 'Answer completed' : 'Missing answer details'}</span>{row.answer_kind && <span className="bg-stone-100 px-2 py-1 text-[10px] text-stone-600">{KIND_LABELS[row.answer_kind] || row.answer_kind}</span>}</div><h4 className="mt-3 font-semibold text-stone-900">{row.answer_title || 'No answer title was saved'}</h4><p className="mt-2 text-sm leading-relaxed text-stone-600">{row.answer_summary || 'No answer summary was saved.'}</p>{details.bullets.length > 0 && <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-stone-600">{details.bullets.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}</section><AuditSection details={details} compounds={row.compounds || []} /><ListSection title="Follow-up questions offered" items={details.followUps} /><Sources sources={details.sources} /></div>}</aside></div>;
}

function AuditSection({ details, compounds }: { details: AnswerDetails; compounds: string[] }) {
  const interpretation = details.interpretation;
  const suggestions = [...details.suggestions, ...(interpretation?.suggestions || [])];
  return <section className="border border-stone-200 bg-white p-5"><h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">How PEARL understood it</h3>{details.needsLanguageReview && <p className="mt-3 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">PEARL marked this wording for staff review.</p>}<dl className="mt-4 grid gap-3 sm:grid-cols-2"><Detail label="Status" value={interpretation?.status || (details.needsLanguageReview ? 'Needs review' : 'No interpretation saved')} /><Detail label="Matched wording" value={interpretation?.matchedText || 'None saved'} /><Detail label="Method" value={interpretation?.method || 'None saved'} /><Detail label="Confidence" value={interpretation?.confidence || 'None saved'} /></dl>{interpretation?.disclosure && <p className="mt-4 border-l-2 border-gold-400 pl-3 text-sm leading-relaxed text-stone-600">{interpretation.disclosure}</p>}<ListPills title="Compounds detected" items={compounds} /><ListPills title="Expanded terms" items={interpretation?.expandedTerms || []} /><ListPills title="Suggestions offered" items={suggestions.map((item) => item.label || item.slug || '').filter(Boolean)} /></section>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">{label}</dt><dd className="mt-1 break-words text-sm capitalize text-stone-700">{value}</dd></div>; }
function ListPills({ title, items }: { title: string; items: string[] }) { if (!items.length) return null; return <div className="mt-4"><h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">{title}</h4><div className="mt-2 flex flex-wrap gap-1.5">{items.map((item, index) => <span key={`${item}-${index}`} className="bg-stone-100 px-2 py-1 text-xs text-stone-700">{item}</span>)}</div></div>; }
function ListSection({ title, items }: { title: string; items: string[] }) { if (!items.length) return null; return <section className="border border-stone-200 bg-white p-5"><h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">{title}</h3><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-stone-600">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol></section>; }
function Sources({ sources }: { sources: Source[] }) { if (!sources.length) return <section className="border border-stone-200 bg-white p-5"><h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Sources shown</h3><p className="mt-2 text-sm text-stone-500">No sources were saved with this answer.</p></section>; return <section className="border border-stone-200 bg-white p-5"><h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Sources shown</h3><ul className="mt-3 space-y-3">{sources.map((source, index) => <li key={`${source.url || source.label}-${index}`} className="border-l-2 border-gold-300 pl-3"><p className="text-sm font-medium text-stone-800">{source.label || 'Research source'}</p>{source.detail && <p className="mt-1 text-xs leading-relaxed text-stone-500">{source.detail}</p>}{source.url && <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-10 items-center break-all text-xs text-gold-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">Open source <span aria-hidden className="ml-1">&#8599;</span></a>}</li>)}</ul></section>; }
