'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { answerQuestion, applyAnswerLayout, COMPOUNDS, isApprovedCitationUrl, searchCompounds } from '@/lib/concierge/research/chat-engine.mjs';
import { validatePearlSourceUrl } from '@/lib/concierge/research/source-safety.mjs';
import { uploadTaskMedia } from '@/components/admin/tasks/uploadMedia';
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, fmtBytes } from '@/lib/tasks/media';
import { useConfirm } from '@/components/admin/ConfirmProvider';

/* 'history' stays a real section but is reachable from the Overview link
   rather than the nav (audit fix 5: fewer sections, same information). */
type Section = 'overview' | 'test' | 'proposals' | 'tests' | 'terminology' | 'layouts' | 'reads' | 'dosages' | 'tasks' | 'history';
type Notice = { tone: 'success' | 'warning' | 'error'; text: string } | null;

interface AnswerSource { label?: string; detail?: string; url?: string }
interface PearlAnswer {
  kind?: string;
  title?: string;
  summary?: string;
  compounds?: string[];
  bullets?: string[];
  sections?: Array<{ title: string; items: string[] }>;
  dose?: Array<{
    label: string;
    value: string;
    source?: { label: string; detail?: string; url: string; linkable?: boolean } | null;
  }>;
  comparison?: Array<{ name: string; purpose?: string; evidence?: string; halfLife?: string; status?: string }>;
  sources?: AnswerSource[];
  suggestions?: Array<{ slug?: string; label?: string }>;
  followUps?: string[];
  needsLanguageReview?: boolean;
  interpretation?: {
    status?: string;
    method?: string;
    confidence?: string;
    matchedText?: string;
    disclosure?: string;
    expandedTerms?: string[];
  } | null;
  diagnostic?: {
    version?: string;
    match?: string;
    productSlug?: string;
    entityIds?: string[];
    sourceIds?: string[];
    validation?: { valid?: boolean; numericRows?: number; errors?: string[] } | null;
  } | null;
}

function AdminDoseRows({ answer }: { answer: PearlAnswer }) {
  if (!answer.dose?.length) return null;
  return <ul className="mt-4 space-y-3 pl-5">
    {answer.dose.map((item, index) => <li key={`${item.label}-${index}`} className="list-disc text-sm leading-6 text-stone-800 marker:text-gold-700">
      <strong>{item.label}:</strong> {item.value}
      {item.source && <span className="mt-1 block text-[11px] leading-5 text-stone-500">
        Source: {item.source.url
          ? <a href={item.source.url} target="_blank" rel="noreferrer" className="font-semibold text-gold-800 underline underline-offset-2">{item.source.label}</a>
          : <span className="font-semibold text-stone-700">{item.source.label}</span>}
        {item.source.detail ? ` · ${item.source.detail}` : ''}
      </span>}
    </li>)}
  </ul>;
}

interface QuestionRow {
  id: number;
  question: string;
  answer_title: string | null;
  answer_summary: string | null;
  answer_json: PearlAnswer | null;
  customer_name: string | null;
  is_staff: boolean;
  created_at: string;
  review_status?: 'unreviewed' | 'good' | 'needs_improvement';
  review_note?: string | null;
}

/* The dashboard sends the full database row (SELECT *), and Approve/Reject
   needs it: the update API requires the whole record, so every column that
   round-trips through approval is typed here. */
interface TermRow {
  id: number;
  term: string;
  kind: string;
  canonical_slug: string | null;
  display_name?: string | null;
  aliases?: string[];
  misspellings?: string[];
  related_slugs?: string[];
  categories?: string[];
  component_slugs?: string[];
  ambiguous_with?: string[];
  source_urls?: unknown;
  confidence?: string;
  auto_resolve?: boolean;
  notes?: string | null;
  last_verified?: string | null;
  review_status: string;
  enabled: boolean;
  updated_at: string;
}

interface SourceRow {
  id: string | number;
  name: string;
  url: string;
  notes?: string | null;
  status: string;
  mappedPages?: number;
  task_id?: string | null;
  sourceType?: 'library' | 'submitted';
  /* Worked out on every load by matching the address against the built
     library, rather than read from the row. A source that has been read in
     stops claiming it is waiting even if nobody ticked it off. */
  inLibrary?: boolean;
  submitted_by?: string | null;
  created_at?: string;
}

interface TopicRow {
  id: string;
  name: string;
  bodySystems: string[];
  conditions: string[];
  layTerms: string[];
}

interface TaskRow {
  id: string;
  task_number: number | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  company: string;
  created_at: string;
  latest_agent_note: string | null;
}

interface TestCaseRow {
  id: number;
  question: string;
  expected_outcome: string;
  status: 'draft' | 'active' | 'retired';
  /* JSON from the shared snapshot module: the accepted picture of the answer,
     and whether the last run still matched it. */
  last_result: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface HistoryRow {
  id: string | number;
  change_type: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  actor: string | null;
  created_at: string;
}

interface RecognitionHealth {
  productsProtected: number;
  catalogueKeywords: number;
  researchRecords: number;
  shortPrefixes: number;
  spellingChecks: number;
  activeSavedTests: number;
  rejectedSuggestions: number;
  unresolvedWording: number;
}

interface DashboardData {
  library: {
    compounds: number;
    profiles: number;
    mappedPages: number;
    sources: number;
    topics: number;
    blends: number;
    generatedAt: string;
  };
  stats: {
    total: number;
    members: number;
    today: number;
    week: number;
    unanswered: number;
    termsReview: number;
    errors: number;
    attention: number;
    terminologyBuiltIn: number;
    terminologyActive: number;
    terminologyWaiting: number;
    openTasks: number;
    sourcesWaiting: number;
    proposalsWaiting: number;
  };
  questions: QuestionRow[];
  topCompounds: Array<{ label: string; count: number }>;
  languageGaps: Array<{ label: string; count: number }>;
  terminology: TermRow[];
  /* Approved wording in the runtime shape the member desk loads. Passed to
     answerQuestion so the test bench answers with the member's Pearl. */
  terminologyRuntime: unknown[];
  sources: SourceRow[];
  topics: TopicRow[];
  tasks: TaskRow[];
  history: HistoryRow[];
  testCases: TestCaseRow[];
  recognitionHealth: RecognitionHealth;
}

const NAV: Array<{ id: Section; label: string; helper: string; icon: IconName }> = [
  { id: 'overview', label: 'Overview', helper: 'What needs attention', icon: 'pulse' },
  { id: 'test', label: 'Test & Improve', helper: 'Ask, inspect and correct', icon: 'test' },
  { id: 'proposals', label: 'Proposals', helper: 'Approve before anything changes', icon: 'scale' },
  { id: 'tests', label: 'Saved Tests', helper: 'Prove answers stay fixed', icon: 'shield' },
  { id: 'terminology', label: 'Terminology', helper: 'Names and spellings', icon: 'type' },
  { id: 'layouts', label: 'Answer Layouts', helper: 'Arrange how answers read', icon: 'map' },
  { id: 'reads', label: 'What Pearl Reads', helper: 'Sources, stored pages and topics', icon: 'book' },
  /* Every product on sale against what Pearl holds on its dose, plus which water it needs
     (Kieran, 10 September 2026). Sits under Pearl rather than with the shop screens because it
     is a report on what Pearl knows, not on what is in stock. */
  { id: 'dosages', label: 'Pearl Dosages', helper: 'Dose, sources and water, per product', icon: 'scale' },
  { id: 'tasks', label: 'Pearl Tasks', helper: 'Work for the task agent', icon: 'task' },
];
const VALID_SECTIONS = new Set<Section>([...NAV.map((item) => item.id), 'history']);

const MOCK_TOPICS: TopicRow[] = [
  { id: 'muscle-growth', name: 'Muscle Growth', bodySystems: ['musculoskeletal', 'endocrine'], conditions: ['muscle wasting', 'sarcopenia'], layTerms: ['build muscle', 'gain size', 'get stronger'] },
  { id: 'healing', name: 'Healing', bodySystems: ['musculoskeletal', 'skin'], conditions: ['wound', 'tendon injury'], layTerms: ['heal faster', 'repair tissue', 'injury recovery'] },
  { id: 'sleep', name: 'Sleep', bodySystems: ['neurological', 'circadian'], conditions: ['insomnia', 'circadian rhythm disorder'], layTerms: ['sleep better', 'deep sleep', 'stay asleep'] },
  { id: 'weight-loss', name: 'Weight Loss', bodySystems: ['metabolic', 'endocrine'], conditions: ['obesity', 'overweight'], layTerms: ['lose weight', 'reduce appetite', 'feel full'] },
  { id: 'energy', name: 'Energy', bodySystems: ['mitochondrial', 'metabolic'], conditions: ['fatigue', 'mitochondrial dysfunction'], layTerms: ['more energy', 'poor stamina', 'always tired'] },
  { id: 'mental-health', name: 'Mental Health', bodySystems: ['neurological', 'psychiatric'], conditions: ['anxiety', 'depression'], layTerms: ['mental wellbeing', 'feel calmer', 'low mood'] },
  { id: 'inflammation', name: 'Inflammation', bodySystems: ['immune', 'musculoskeletal'], conditions: ['inflammatory response'], layTerms: ['reduce inflammation', 'inflammation research'] },
  { id: 'cognition', name: 'Cognition', bodySystems: ['neurological'], conditions: ['cognitive impairment'], layTerms: ['memory', 'focus', 'brain research'] },
];

function mockData(): DashboardData {
  const sample = answerQuestion('What does BPC-157 research focus on?', [], { adminPreview: true }) as PearlAnswer;
  const glutathione = answerQuestion('What is glutathione?', [], { adminPreview: true }) as PearlAnswer;
  return {
    library: { compounds: 265, profiles: 232, mappedPages: 2936, sources: 11, topics: 40, blends: 11, generatedAt: '2026-08-13T20:23:25.393Z' },
    stats: { total: 100, members: 0, today: 6, week: 28, unanswered: 8, termsReview: 37, errors: 0, attention: 9, terminologyBuiltIn: 16, terminologyActive: 0, terminologyWaiting: 2, openTasks: 2, sourcesWaiting: 1, proposalsWaiting: 1 },
    questions: [
      { id: 101, question: 'What does BPC-157 research focus on?', answer_title: sample.title || null, answer_summary: sample.summary || null, answer_json: sample, customer_name: 'Staff test', is_staff: true, created_at: '2026-08-16T09:42:00Z', review_status: 'unreviewed' },
      { id: 100, question: 'What is glutathione?', answer_title: glutathione.title || null, answer_summary: glutathione.summary || null, answer_json: glutathione, customer_name: 'Staff test', is_staff: true, created_at: '2026-08-16T08:15:00Z', review_status: 'needs_improvement', review_note: 'Separate the general concept from the IV formulation.' },
      { id: 99, question: 'What is RETA?', answer_title: 'Retatrutide research overview', answer_summary: 'PEARL connected RETA to Retatrutide and showed the approved research summary.', answer_json: answerQuestion('What is RETA?', [], { adminPreview: true }) as PearlAnswer, customer_name: 'Staff test', is_staff: true, created_at: '2026-08-15T16:20:00Z', review_status: 'good' },
    ],
    topCompounds: [{ label: 'BPC-157', count: 12 }, { label: 'Retatrutide', count: 9 }, { label: 'GHK-Cu', count: 7 }],
    terminologyRuntime: [],
    languageGaps: [{ label: 'What is glutathione?', count: 2 }, { label: 'Tell me about cagri', count: 1 }],
    terminology: [
      { id: 2, term: 'Ipa', kind: 'abbreviation', canonical_slug: 'ipamorelin', aliases: [], misspellings: [], related_slugs: [], categories: [], component_slugs: [], ambiguous_with: [], confidence: 'medium', auto_resolve: false, review_status: 'review', enabled: true, updated_at: '2026-08-14T15:00:00Z' },
      { id: 1, term: 'Cagri', kind: 'abbreviation', canonical_slug: 'cagrilintide', aliases: [], misspellings: [], related_slugs: [], categories: [], component_slugs: [], ambiguous_with: [], confidence: 'medium', auto_resolve: false, review_status: 'review', enabled: true, updated_at: '2026-08-14T14:30:00Z' },
    ],
    sources: [
      { id: 'library-peptide-reference', name: 'PeptideRef Clinical Reference', url: 'https://jmitsuominor-ux.github.io/peptide-reference/', notes: 'Original Pearl baseline reference library', status: 'baseline-imported', mappedPages: 1, sourceType: 'library', submitted_by: 'Reviewed library' },
      { id: 'library-pepcodex', name: 'PepCodex', url: 'https://www.pepcodex.com/', notes: 'Evidence-graded research dossier library', status: 'added', mappedPages: 1084, sourceType: 'library', submitted_by: 'Reviewed library' },
      { id: 'library-peptidehub', name: 'Peptide Hub', url: 'https://peptidehub.bio/', notes: 'Protocol-focused educational database', status: 'added', mappedPages: 201, sourceType: 'library', submitted_by: 'Reviewed library' },
      { id: 8, name: 'Candidate glutathione review', url: 'https://pubmed.ncbi.nlm.nih.gov/', notes: 'Check terminology and formulation distinction.', status: 'accepted', task_id: 'preview-task-1', sourceType: 'submitted', submitted_by: 'Kieran', created_at: '2026-08-16T09:00:00Z' },
    ],
    topics: MOCK_TOPICS,
    tasks: [
      { id: 'preview-task-1', task_number: 184, title: 'PEARL: Review glutathione concept and formulations', description: 'Check the general concept, L-Glutathione and IV formulation before proposing a safe mapping.', status: 'todo', priority: 'high', company: 'Windsor Glow', created_at: '2026-08-16T09:05:00Z', latest_agent_note: null },
      { id: 'preview-task-2', task_number: 181, title: 'PEARL: Review new source and citations', description: 'Inspect the submitted source without importing claims automatically.', status: 'ready_for_review', priority: 'medium', company: 'Windsor Glow', created_at: '2026-08-15T12:10:00Z', latest_agent_note: 'Source reviewed. Three citations need a final human check.' },
    ],
    history: [
      { id: 1, change_type: 'answer_approved', entity_type: 'question', entity_id: '99', summary: 'Marked the RETA answer as good.', actor: 'Kieran', created_at: '2026-08-16T10:05:00Z' },
      { id: 2, change_type: 'source_submitted', entity_type: 'source', entity_id: '8', summary: 'Submitted “Candidate glutathione review” for source review.', actor: 'Kieran', created_at: '2026-08-16T09:00:00Z' },
      { id: 3, change_type: 'terminology_created', entity_type: 'terminology', entity_id: '2', summary: 'Added “Ipa” for review.', actor: 'Kieran', created_at: '2026-08-14T15:00:00Z' },
    ],
    recognitionHealth: { productsProtected: 61, catalogueKeywords: 294, researchRecords: 300, shortPrefixes: 808, spellingChecks: 1094, activeSavedTests: 2, rejectedSuggestions: 0, unresolvedWording: 2 },
    testCases: [
      { id: 2, question: 'What dose of BPC-157 should I take for my shoulder?', expected_outcome: 'Pearl must refuse personal dosing advice and explain that it only describes published references.', status: 'active', last_result: JSON.stringify({ state: 'pass', checkedAt: '2026-08-16T09:30:00Z', snapshot: { title: 'I cannot advise what you should take or how to administer it' } }), created_by: 'Kieran', created_at: '2026-08-15T10:00:00Z', updated_at: '2026-08-16T09:30:00Z' },
      { id: 1, question: 'What is RETA?', expected_outcome: 'Pearl should connect RETA to Retatrutide and show the approved research overview.', status: 'active', last_result: null, created_by: 'Kieran', created_at: '2026-08-15T09:00:00Z', updated_at: '2026-08-15T09:00:00Z' },
    ],
  };
}

const EMPTY_DATA: DashboardData = {
  library: { compounds: 0, profiles: 0, mappedPages: 0, sources: 0, topics: 0, blends: 0, generatedAt: '' },
  stats: { total: 0, members: 0, today: 0, week: 0, unanswered: 0, termsReview: 0, errors: 0, attention: 0, terminologyBuiltIn: 0, terminologyActive: 0, terminologyWaiting: 0, openTasks: 0, sourcesWaiting: 0, proposalsWaiting: 0 },
    questions: [], topCompounds: [], languageGaps: [], terminology: [], terminologyRuntime: [], sources: [], topics: [], tasks: [], history: [], testCases: [],
    recognitionHealth: { productsProtected: 61, catalogueKeywords: 294, researchRecords: 0, shortPrefixes: 0, spellingChecks: 0, activeSavedTests: 0, rejectedSuggestions: 0, unresolvedWording: 0 },
};
const inputClass = 'min-h-11 w-full border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:border-gold-600 focus:ring-2 focus:ring-gold-200';
const goldButton = 'inline-flex min-h-11 items-center justify-center gap-2 bg-gold-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40';
const secondaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:border-gold-500 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40';

export default function PearlControlCentre({ previewMode = false }: { previewMode?: boolean }) {
  /* The audit page can hand a question straight to the test bench:
     /admin/pearl?ask=<question>&qid=<saved row id>. */
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const initialAsk = useMemo(() => {
    const asked = searchParams?.get('ask')?.trim();
    if (!asked) return null;
    const id = Number(searchParams?.get('qid'));
    return { question: asked, id: Number.isInteger(id) && id > 0 ? id : null };
  }, [searchParams]);
  const requestedSection = searchParams?.get('section');
  const urlSection: Section = requestedSection && VALID_SECTIONS.has(requestedSection as Section) ? requestedSection as Section : 'overview';
  const [section, setSection] = useState<Section>(() => initialAsk ? 'test' : urlSection);
  const [data, setData] = useState<DashboardData>(() => previewMode ? mockData() : EMPTY_DATA);
  const [loading, setLoading] = useState(!previewMode);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    setSection(initialAsk ? 'test' : urlSection);
  }, [initialAsk, urlSection]);

  useEffect(() => {
    if (previewMode) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    fetch('/api/admin/pearl/dashboard', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load Pearl.');
        return payload as DashboardData;
      })
      .then((payload) => { if (!controller.signal.aborted) setData(payload); })
      .catch((error: Error) => { if (error.name !== 'AbortError') setLoadError(error.message || 'Could not load Pearl.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [previewMode]);

  /* Success and warning notices dismiss themselves; errors stay until the
     admin closes them. The pending timer is cleared first so an earlier
     notice's countdown can never wipe a later one off the screen. */
  function showNotice(next: Notice) {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = null;
    setNotice(next);
    if (next && next.tone !== 'error') {
      noticeTimer.current = window.setTimeout(() => setNotice(null), 4200);
    }
  }

  function move(next: Section) {
    setSection(next);
    const params = new URLSearchParams(searchParams?.toString());
    params.set('section', next);
    if (next !== 'test') {
      params.delete('ask');
      params.delete('qid');
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  return (
    <div className="flex min-h-full flex-col overflow-x-clip bg-[#f6f5f2] lg:flex-row">
      <AdminSidebar previewMode={previewMode} />
      <main id="pearl-workspace" className="min-w-0 flex-1 overflow-x-clip">
        {previewMode && (
          <div className="sticky top-0 z-30 flex min-h-11 items-center justify-center gap-2 border-b border-gold-300 bg-[#fff8df] px-4 py-2 text-center text-xs font-semibold text-stone-800">
            <Icon name="eye" className="h-4 w-4 text-gold-800" />
            Preview mode · Nothing you press here changes live Pearl
          </div>
        )}

        <div className="mx-auto max-w-[1480px] p-4 sm:p-6 lg:p-8">
          <header className="border-b border-stone-300 pb-6">
            <h1 className="text-3xl font-semibold leading-none tracking-[-0.025em] text-stone-950 sm:text-5xl">
              <span className="font-serif font-semibold text-gold-800">PEARL</span> Dashboard
            </h1>
          </header>

          <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
            <div className="min-w-0 xl:hidden">
              <label htmlFor="pearl-section" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600">Pearl workspace</label>
              <div className="relative">
                <select id="pearl-section" value={section} onChange={(event) => { const picked = NAV.find((item) => item.id === event.target.value); if (picked) move(picked.id); else if (event.target.value === 'history') move('history'); }} className={`${inputClass} appearance-none bg-white pr-10 font-semibold`}>
                  {NAV.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  {section === 'history' && <option value="history">Change History</option>}
                </select>
                <Icon name="arrow" className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 rotate-90 text-gold-800" />
              </div>
              <p className="mt-2 text-xs leading-5 text-stone-600">{NAV.find((item) => item.id === section)?.helper || 'Who changed what'}</p>
            </div>

            <nav aria-label="PEARL Dashboard sections" style={{ top: 'calc(var(--site-header-stack-height, 0px) + 1.5rem)' }} className="hidden self-start border border-stone-200 bg-white xl:sticky xl:block">
              <div className="border-b border-stone-200 bg-stone-950 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-200">Pearl workspace</div>
              {NAV.map((item) => (
                <button key={item.id} type="button" onClick={() => move(item.id)} aria-current={section === item.id ? 'page' : undefined}
                  className={`grid w-full min-w-0 grid-cols-[1.75rem_1fr] gap-2 border-b border-stone-100 px-3 py-3.5 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500 ${section === item.id ? 'bg-gold-50 text-stone-950' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-950'}`}>
                  <Icon name={item.icon} className={section === item.id ? 'h-4 w-4 text-gold-800' : 'h-4 w-4 text-stone-600'} />
                  <span><span className="block text-xs font-semibold">{item.label}</span><span className="mt-0.5 block text-[10px] leading-4 text-stone-600">{item.helper}</span></span>
                </button>
              ))}
            </nav>

            <div className="min-w-0">
              {notice && <NoticeBar notice={notice} onDismiss={() => showNotice(null)} />}
              {loadError && <NoticeBar notice={{ tone: 'error', text: loadError }} onDismiss={() => setLoadError('')} />}
              {loading ? <LoadingState /> : (
                <>
                  {section === 'overview' && <Overview data={data} move={move} />}
                  {section === 'test' && <TestAndImprove data={data} setData={setData} previewMode={previewMode} showNotice={showNotice} move={move} initialAsk={initialAsk} />}
                  {section === 'proposals' && <Proposals data={data} setData={setData} previewMode={previewMode} showNotice={showNotice} />}
                  {section === 'tests' && <SavedTests data={data} setData={setData} previewMode={previewMode} showNotice={showNotice} />}
                  {section === 'terminology' && <Terminology data={data} setData={setData} previewMode={previewMode} showNotice={showNotice} />}
                  {section === 'layouts' && <AnswerLayouts setData={setData} previewMode={previewMode} showNotice={showNotice} />}
                  {section === 'reads' && <WhatPearlReads data={data} setData={setData} previewMode={previewMode} showNotice={showNotice} />}
                  {section === 'dosages' && <PearlDosages />}
                  {section === 'tasks' && <Tasks data={data} setData={setData} previewMode={previewMode} showNotice={showNotice} />}
                  {section === 'history' && <History data={data} move={move} />}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Overview({ data, move }: { data: DashboardData; move: (section: Section) => void }) {
  /* Each answer Pearl did not fully understand, counted once. Opens the audit
     page filtered to exactly the questions this number counted. */
  const attention: Array<{ label: string; value: number; note: string; tone: string; section?: Section; href?: string }> = [
    { label: 'Answers to inspect', value: data.stats.attention, note: 'Unknown or unclear wording', href: '/admin/research-questions?view=attention', tone: 'amber' },
    { label: 'Waiting for approval', value: data.stats.proposalsWaiting + data.stats.terminologyWaiting, note: 'Approve or reject on Proposals', section: 'proposals', tone: 'blue' },
    { label: 'Sources to read in', value: data.stats.sourcesWaiting, note: 'Added, not yet in Pearl', section: 'reads', tone: 'stone' },
    { label: 'Open Pearl tasks', value: data.stats.openTasks, note: 'In the shared task list', section: 'tasks', tone: 'green' },
  ];
  const tileClass = 'group block min-h-36 bg-white p-5 text-left hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500';
  const tileBody = (item: typeof attention[number]) => (
    <>
      <span className={`inline-flex h-2 w-2 rounded-full ${item.tone === 'amber' ? 'bg-amber-500' : item.tone === 'blue' ? 'bg-sky-500' : item.tone === 'green' ? 'bg-emerald-500' : 'bg-stone-400'}`} />
      <strong className="mt-4 block text-3xl font-semibold tabular-nums text-stone-950">{item.value}</strong>
      <span className="mt-1 block text-xs font-semibold text-stone-800">{item.label}</span>
      <span className="mt-2 flex items-center justify-between text-[11px] text-stone-600">{item.note}<Icon name="arrow" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span>
    </>
  );
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Today" title="What needs your attention" text="The small queue first. Pearl keeps answering from the approved library while these items wait." />
      <section aria-label="Pearl attention summary" className="grid gap-px border border-stone-200 bg-stone-200 sm:grid-cols-2 xl:grid-cols-4">
        {attention.map((item) => item.href
          ? <Link key={item.label} href={item.href} className={tileClass}>{tileBody(item)}</Link>
          : <button type="button" key={item.label} onClick={() => move(item.section!)} className={`${tileClass} w-full`}>{tileBody(item)}</button>,
        )}
      </section>

      <section className="border border-stone-200 bg-white">
        <div className="border-b border-stone-200 p-5"><h2 className="text-base font-semibold text-stone-950">Name recognition health</h2><p className="mt-1 text-xs leading-5 text-stone-500">The safety nets that catch abbreviations, phone typing and wrong suggestions.</p></div>
        <div className="grid grid-cols-2 gap-px bg-stone-200 sm:grid-cols-4">
          {[
            ['Products protected', data.recognitionHealth.productsProtected],
            ['Keywords covered', data.recognitionHealth.catalogueKeywords],
            ['Research records', data.recognitionHealth.researchRecords],
            ['Short forms checked', data.recognitionHealth.shortPrefixes],
            ['Spelling checks', data.recognitionHealth.spellingChecks],
            ['Active saved tests', data.recognitionHealth.activeSavedTests],
            ['Suggestions rejected', data.recognitionHealth.rejectedSuggestions],
            ['Wording to review', data.recognitionHealth.unresolvedWording],
          ].map(([label, value]) => <div key={String(label)} className="bg-white p-4"><strong className="block text-xl font-semibold tabular-nums text-stone-950">{Number(value).toLocaleString('en-GB')}</strong><span className="mt-1 block text-[10px] uppercase tracking-[0.12em] text-stone-600">{label}</span></div>)}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <section className="border border-stone-200 bg-white">
          <div className="border-b border-stone-200 p-5"><h2 className="text-base font-semibold text-stone-950">How an improvement moves safely</h2><p className="mt-1 text-xs leading-5 text-stone-500">Small language fixes can be reviewed here. Research changes become tasks.</p></div>
          <div className="grid gap-px bg-stone-200 sm:grid-cols-4">
            {[
              ['1', 'Test', 'Ask Pearl the exact question.'],
              ['2', 'Inspect', 'See the match, confidence and sources.'],
              ['3', 'Correct', 'Add wording or describe the research gap.'],
              ['4', 'Verify', 'Keep a test so the answer stays fixed.'],
            ].map(([number, title, text]) => <div key={number} className="bg-white p-4"><span className="font-serif text-2xl text-gold-700">{number}</span><h3 className="mt-3 text-xs font-semibold text-stone-900">{title}</h3><p className="mt-1 text-[11px] leading-5 text-stone-500">{text}</p></div>)}
          </div>
        </section>
        <section className="border border-stone-200 bg-stone-950 p-5 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-300">Safety lock</p>
          <h2 className="mt-3 font-serif text-2xl font-semibold">Pearl never learns from a link by itself.</h2>
          <p className="mt-3 text-sm leading-6 text-stone-300">A new source waits for review, creates a task and stays outside the approved answer library until its evidence has been checked.</p>
          <button type="button" onClick={() => move('reads')} className="mt-5 inline-flex min-h-11 items-center gap-2 border border-stone-600 px-4 text-xs font-semibold text-white hover:border-gold-300">See source controls <Icon name="arrow" /></button>
        </section>
      </div>

      <section className="border border-stone-200 bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-200 p-5"><div><h2 className="text-base font-semibold text-stone-950">Approved knowledge library</h2><p className="mt-1 text-xs text-stone-500">The current source-controlled research Pearl can use.</p></div><p className="text-[10px] text-stone-600">Last rebuilt {formatDate(data.library.generatedAt, false)}</p></div>
        <div className="grid grid-cols-2 gap-px bg-stone-200 sm:grid-cols-3 xl:grid-cols-6">
          {[
            ['Compounds', data.library.compounds], ['Research profiles', data.library.profiles], ['Pages read', data.library.mappedPages], ['Sources', data.library.sources], ['Topics', data.library.topics], ['Blends', data.library.blends],
          ].map(([label, value]) => <div key={String(label)} className="bg-white p-4"><strong className="block text-xl font-semibold tabular-nums text-stone-950">{Number(value).toLocaleString('en-GB')}</strong><span className="mt-1 block text-[10px] uppercase tracking-[0.12em] text-stone-600">{label}</span></div>)}
        </div>
      </section>

      <div className="text-right">
        <button type="button" onClick={() => move('history')} className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-stone-600 underline hover:text-stone-900"><Icon name="history" className="h-3.5 w-3.5" />Change history: who changed what, and when</button>
      </div>
    </div>
  );
}

interface BenchPassage { id: number; page_id: number; heading: string | null; passage_text: string; url: string; title: string | null; sourceName: string; boosted?: boolean }

/* Everyday words that are part of asking, not part of a compound's name.
   Used only to show which words found nothing; never used for answering. */
const INSPECTION_STOP_WORDS = new Set(['what', 'when', 'where', 'which', 'does', 'have', 'with', 'about', 'should', 'take', 'this', 'that', 'from', 'list', 'listed', 'research', 'researched', 'pearl', 'tell', 'much', 'many', 'your', 'there', 'their', 'after', 'before', 'risk', 'risks', 'dose', 'dosage', 'doses', 'half', 'life', 'work', 'works', 'focus', 'safe', 'safety', 'numbers', 'sources', 'source', 'peptide', 'peptides', 'compare', 'compared', 'between', 'evidence', 'studies', 'study']);

function TestAndImprove({ data, setData, previewMode, showNotice, move, initialAsk }: { data: DashboardData; setData: React.Dispatch<React.SetStateAction<DashboardData>>; previewMode: boolean; showNotice: (notice: Notice) => void; move: (section: Section) => void; initialAsk?: { question: string; id: number | null } | null }) {
  /* When the audit page hands a question over, open its saved answer if it is
     in the loaded set, otherwise run the same wording as a fresh test. The
     dashboard data is already loaded by the time this section renders. */
  const handedRow = initialAsk?.id ? data.questions.find((row) => row.id === initialAsk.id) : undefined;
  /* Starts empty unless the audit page handed a question over. It used to open
     pre-filled with one example question, so the screen always appeared to be
     stuck on BPC-157: you had to select the text and delete it before asking
     anything, and leaving the screen and coming back put it straight back.
     Empty also lets the field's own placeholder do its job, and the engine
     already answers an empty question with "Ask PEARL a research question",
     which is exactly the right thing to show before anyone has asked. */
  const [question, setQuestion] = useState(initialAsk?.question || '');
  /* Always pass the approved administrator wording, exactly as the member desk
     does. Without it this bench tested a different Pearl from the one members
     use, and a working improvement looked broken here. */
  const [answer, setAnswer] = useState<PearlAnswer>(() => handedRow?.answer_json || answerQuestion(question, [], { overrides: data.terminologyRuntime, adminPreview: true }) as PearlAnswer);
  const [selectedId, setSelectedId] = useState<number | null>(handedRow?.id ?? null);
  const [note, setNote] = useState(handedRow?.review_note || '');
  const [showCorrection, setShowCorrection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [acceptingSuggestion, setAcceptingSuggestion] = useState<string | null>(null);
  const [passages, setPassages] = useState<BenchPassage[]>([]);
  const [passagesChecked, setPassagesChecked] = useState(false);
  const [proposal, setProposal] = useState({ kind: 'abbreviation', term: '', target: '', includeTest: true });
  const [proposing, setProposing] = useState(false);
  const compounds = useMemo(() => [...(COMPOUNDS as Array<{ slug: string; name: string }>)]
    .sort((left, right) => left.name.localeCompare(right.name, 'en-GB')), []);

  /* Audit fix 3: report a wrong or missing source link on any tested answer.
     Files a citation_correction proposal; approving it writes the runtime
     override the engine applies at answer time — no rebuild, no deploy. */
  const [citationOpen, setCitationOpen] = useState(false);
  const [citation, setCitation] = useState({ action: 'remove' as 'remove' | 'add', url: '', label: '', reason: '' });
  const [citationFiling, setCitationFiling] = useState(false);
  const answerCompoundSlug = useMemo(() => {
    const name = answer.compounds?.[0];
    if (!name) return null;
    return compounds.find((compound) => compound.name.toLowerCase() === name.toLowerCase())?.slug || null;
  }, [answer, compounds]);

  async function fileCitation() {
    if (!answerCompoundSlug) return;
    const compoundLabel = compoundName(answerCompoundSlug);
    const url = citation.url.trim();
    if (!url) { showNotice({ tone: 'warning', text: citation.action === 'remove' ? 'Pick which shown link is wrong.' : 'Give the link that should be added.' }); return; }
    if (citation.action === 'add' && !isApprovedCitationUrl(url)) {
      showNotice({ tone: 'warning', text: 'Links can only be added from trusted research sites or the approved source library.' });
      return;
    }
    setCitationFiling(true);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/proposals', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'citation_correction',
            title: citation.action === 'remove' ? `Remove a wrong source link from ${compoundLabel} answers` : `Add a missing source link to ${compoundLabel} answers`,
            summary: citation.reason.trim() || undefined,
            sourceQuestionId: selectedId || undefined,
            before: { 'Question tested': question, 'Today': citation.action === 'remove' ? `The answer shows this link: ${url}` : 'The answer does not show this link' },
            after: { 'After approval': citation.action === 'remove' ? `${compoundLabel} answers stop showing that link` : `${compoundLabel} answers also show ${url}` },
            payload: { citation: { compoundSlug: answerCompoundSlug, action: citation.action, url, label: citation.label.trim() || null, reason: citation.reason.trim() || null } },
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not file the source report.');
      }
      showNotice({ tone: 'success', text: previewMode ? 'Preview report shown on this screen only.' : 'Source report filed as a proposal. Approve it on the Proposals screen to make it real.' });
      setCitation({ action: 'remove', url: '', label: '', reason: '' });
      setCitationOpen(false);
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not file the source report.' }); }
    finally { setCitationFiling(false); }
  }

  /* Improve button d8c: mark a stored passage as important. Files a
     passage_boost proposal; approval writes the boost row and from then on
     the passage is shown first whenever it matches a question. */
  const [boostFiling, setBoostFiling] = useState<number | null>(null);
  async function fileBoost(passage: BenchPassage) {
    setBoostFiling(passage.id);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/proposals', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'passage_boost',
            title: `Show a ${passage.sourceName} passage first${passage.heading ? ` (${passage.heading})` : ''}`,
            summary: `Marked as important while testing: ${question}`,
            before: { 'Today': 'The passage ranks purely by how well its text matches' },
            after: { 'After approval': 'This passage is shown first whenever it matches a question' },
            payload: { boost: { pageId: passage.page_id, passageText: passage.passage_text, heading: passage.heading, url: passage.url, sourceName: passage.sourceName, note: `Marked important while testing: ${question}` } },
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not file the request.');
      }
      showNotice({ tone: 'success', text: previewMode ? 'Preview request shown on this screen only.' : 'Filed as a proposal. Approve it on the Proposals screen to make it real.' });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not file the request.' }); }
    finally { setBoostFiling(null); }
  }

  /* Stage D step 7, admin first: search the stored full text of the approved
     source pages for this question. Shown UNDER the template answer, never
     inside it, and members do not see it until the switch is turned on. */
  async function loadPassages(asked: string) {
    if (previewMode) { setPassages([]); setPassagesChecked(true); return; }
    try {
      const response = await fetch(`/api/admin/pearl/passages?q=${encodeURIComponent(asked)}`, { cache: 'no-store' });
      const payload = await response.json();
      setPassages(response.ok ? payload.passages || [] : []);
    } catch { setPassages([]); }
    finally { setPassagesChecked(true); }
  }

  /* Stage D step 8: what Pearl searched for and what it found, so a weak
     answer can be traced to the exact word that matched nothing. */
  const inspection = useMemo(() => {
    try {
      const found = (searchCompounds(question) as Array<{ name: string; slug: string; evidenceScore?: number }>).slice(0, 5);
      const matchedText = found.map((compound) => compound.name.toLowerCase()).join(' ');
      const missed = Array.from(new Set(question.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
        .filter((word) => word.length >= 4 && !INSPECTION_STOP_WORDS.has(word) && !matchedText.includes(word)))).slice(0, 6);
      return { found, missed };
    } catch { return { found: [], missed: [] }; }
  }, [question]);

  useEffect(() => {
    // Only when the screen opens with a question already in it (handed over by
    // the audit page). With an empty box there is nothing to search for, and
    // passagesChecked stays false so the passage panel simply waits.
    if (question.trim()) void loadPassages(question);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount; the loader is a stable local helper, not a dependency
  }, []);

  function runTest(event?: React.FormEvent) {
    event?.preventDefault();
    setSelectedId(null);
    setAnswer(answerQuestion(question, [], { overrides: data.terminologyRuntime, adminPreview: true }) as PearlAnswer);
    setNote('');
    setShowCorrection(false);
    setCitationOpen(false);
    setCitation({ action: 'remove', url: '', label: '', reason: '' });
    setWider(null);
    void loadPassages(question);
  }

  async function acceptSuggestedTerm(suggestion: { slug?: string; label?: string }) {
    const label = String(suggestion.label || '').trim();
    const slug = String(suggestion.slug || '').trim();
    if (!label || !slug || acceptingSuggestion) return;
    const originalQuestion = question.trim();
    const matched = String(answer.interpretation?.matchedText || '').trim();
    const escaped = matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const correctedQuestion = matched && new RegExp(escaped, 'i').test(originalQuestion)
      ? originalQuestion.replace(new RegExp(escaped, 'i'), label)
      : `${originalQuestion} ${label}`.trim();
    const correctedAnswer = answerQuestion(correctedQuestion, [], { overrides: data.terminologyRuntime, adminPreview: true }) as PearlAnswer;
    const oneClearCorrection = (answer.suggestions || []).length === 1;
    const reviewedCorrection = new Set(['tesamol', 'tesamo', 'fox dri']).has(matched.toLowerCase());
    const needsLearningProposal = oneClearCorrection && !reviewedCorrection;

    setAcceptingSuggestion(slug);
    setQuestion(correctedQuestion);
    setAnswer(correctedAnswer);
    setSelectedId(null);
    setNote('');
    setShowCorrection(false);
    setWider(null);
    void loadPassages(correctedQuestion);

    try {
      if (!previewMode && needsLearningProposal) {
        const kind = answer.interpretation?.method === 'fuzzy' ? 'misspelling' : 'alias';
        const dedupeKey = `${kind}:${matched.toLowerCase()}:${slug}`;
        const response = await fetch('/api/admin/pearl/proposals', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'answer_correction',
            dedupeKey,
            title: `Teach Pearl that “${matched || originalQuestion}” means ${label}`,
            summary: 'Confirmed from the Test & Improve correction button.',
            sourceQuestionId: selectedId || undefined,
            before: { 'Question tested': originalQuestion, 'Pearl today': answer.title || 'No direct answer' },
            after: { 'After approval': `The original wording resolves to ${label}, while keeping the question's intent` },
            payload: {
              dedupeKey,
              confirmationCount: 1,
              rule: { kind, term: matched || originalQuestion, canonicalSlug: slug, notes: 'Confirmed through Test & Improve.' },
              test: { question: originalQuestion, expectedOutcome: `This question must resolve to ${label} and preserve its requested answer type.` },
            },
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'The correction worked, but its learning proposal could not be saved.');
        showNotice({ tone: 'success', text: payload.repeated
          ? `Using ${label}. This wording was confirmed again on its existing proposal.`
          : `Using ${label}. A saved test and wording proposal are ready for review.` });
      } else {
        showNotice({ tone: 'success', text: oneClearCorrection
          ? reviewedCorrection
            ? `Using ${label}. This wording is already in Pearl's reviewed terminology.`
            : `Using ${label}. Preview mode did not save a wording proposal.`
          : `Using ${label}. PEARL kept the original wording as a choice because it can mean more than one thing.` });
      }
    } catch (error) {
      showNotice({ tone: 'warning', text: error instanceof Error ? error.message : 'The corrected answer worked, but the learning record could not be saved.' });
    } finally {
      setAcceptingSuggestion(null);
    }
  }

  async function rejectSuggestedTerms() {
    const rejected = (answer.suggestions || []).map((item) => item.label || item.slug || '').filter(Boolean);
    try {
      if (!previewMode && rejected.length) {
        const response = await fetch('/api/admin/pearl/rejections', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, matchedText: answer.interpretation?.matchedText || '', suggestions: rejected }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'The rejection could not be recorded.');
      }
      showNotice({ tone: 'warning', text: previewMode ? 'Preview only. Pearl has not learned a wrong match.' : 'The suggestions were rejected and recorded for review. Pearl has not learned a wrong match.' });
    } catch (error) {
      showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The rejection could not be recorded.' });
      return;
    }
    setAnswer({
      kind: 'clarify',
      title: 'Please give Pearl a little more detail',
      summary: 'Check the spelling, enter the full compound name, or name the exact formulation you mean.',
      compounds: [], bullets: [], suggestions: [], sources: [],
      interpretation: { ...answer.interpretation, status: 'unknown', method: 'rejected-suggestion' },
    });
  }

  function openSaved(row: QuestionRow) {
    setQuestion(row.question);
    setSelectedId(row.id);
    setAnswer(row.answer_json || { title: row.answer_title || '', summary: row.answer_summary || '' });
    setNote(row.review_note || '');
    setShowCorrection(row.review_status === 'needs_improvement');
    setCitationOpen(false);
    setCitation({ action: 'remove', url: '', label: '', reason: '' });
    setWider(null);
    void loadPassages(row.question);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function propose() {
    const term = proposal.term.trim();
    const target = compounds.find((compound) => compound.name === proposal.target || compound.slug === proposal.target);
    if (!term || !target) { showNotice({ tone: 'warning', text: 'Give the wording and pick which approved compound it should mean.' }); return; }
    setProposing(true);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/proposals', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'answer_correction',
            title: `Teach Pearl that “${term}” means ${target.name}`,
            summary: note.trim() || undefined,
            sourceQuestionId: selectedId || undefined,
            before: { 'Question tested': question, 'Pearl today': answer.title || 'No answer title' },
            after: { 'After approval': `“${term}” resolves to ${target.name}${proposal.includeTest ? ', and a saved test keeps the corrected answer fixed' : ''}` },
            payload: {
              rule: { kind: proposal.kind, term, canonicalSlug: target.slug, notes: note.trim() || null },
              ...(proposal.includeTest ? { test: { question, expectedOutcome: note.trim() || `After the “${term}” rule is approved, this question must resolve to ${target.name}.` } } : {}),
            },
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not file the proposal.');
      }
      showNotice({ tone: 'success', text: previewMode ? 'Preview proposal shown on this screen only.' : 'Proposal filed. Approve it on the Proposals screen to make it real.' });
      setProposal({ kind: 'abbreviation', term: '', target: '', includeTest: true });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not file the proposal.' }); }
    finally { setProposing(false); }
  }

  /* Step 10, AI place 2: wording suggestions. Each one still has to be filed
     as a proposal and approved — a suggestion by itself changes nothing. */
  const [aiSuggestions, setAiSuggestions] = useState<Array<{ term: string; kind: string; compoundSlug: string; reason: string }>>([]);
  const [aiExpanding, setAiExpanding] = useState(false);

  async function suggestWordings() {
    if (previewMode) { showNotice({ tone: 'success', text: 'Preview only. On the live dashboard this asks the AI for wording ideas.' }); return; }
    setAiExpanding(true);
    try {
      const response = await fetch('/api/admin/pearl/ai/expand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The suggestions could not be completed.');
      setAiSuggestions(payload.suggestions || []);
      if (!(payload.suggestions || []).length) showNotice({ tone: 'warning', text: 'The AI had no safe suggestions for this wording. An honest nothing beats a guess.' });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The suggestions could not be completed.' }); }
    finally { setAiExpanding(false); }
  }

  async function fileSuggestion(suggestion: { term: string; kind: string; compoundSlug: string; reason: string }) {
    const target = compounds.find((compound) => compound.slug === suggestion.compoundSlug);
    if (!target) return;
    try {
      const response = await fetch('/api/admin/pearl/proposals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'terminology_rule',
          title: `Teach Pearl that “${suggestion.term}” means ${target.name}`,
          summary: `AI-suggested wording: ${suggestion.reason}`,
          before: { 'Pearl today': `“${suggestion.term}” is not understood directly` },
          after: { 'After approval': `“${suggestion.term}” resolves to ${target.name}, with a saved test` },
          payload: {
            rule: { kind: suggestion.kind, term: suggestion.term, canonicalSlug: suggestion.compoundSlug, notes: `AI-suggested: ${suggestion.reason}` },
            test: { question: `What is ${suggestion.term}?`, expectedOutcome: `After approval, “${suggestion.term}” must resolve to ${target.name}.` },
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not file the proposal.');
      setAiSuggestions((current) => current.filter((item) => item.term !== suggestion.term));
      showNotice({ tone: 'success', text: `Filed “${suggestion.term}” as a proposal. Approve it on the Proposals screen.` });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not file the proposal.' }); }
  }

  /* Search-time query expansion (d10b): ask the AI for other wordings the
     approved sources might use, then search the stored text AGAIN with them.
     The wordings are used only to search; they never teach Pearl anything
     and never touch an answer. Admin bench only. */
  const [wider, setWider] = useState<Array<{ term: string; passages: BenchPassage[] }> | null>(null);
  const [widening, setWidening] = useState(false);

  async function widenSearch() {
    if (previewMode) { showNotice({ tone: 'success', text: 'Preview only. On the live dashboard this searches again with AI-suggested wordings.' }); return; }
    setWidening(true);
    setWider(null);
    try {
      const response = await fetch('/api/admin/pearl/ai/expand-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The wider search could not be completed.');
      const terms: string[] = (payload.terms || []).slice(0, 3);
      if (!terms.length) { setWider([]); return; }
      const seen = new Set(passages.map((passage) => passage.id));
      const groups: Array<{ term: string; passages: BenchPassage[] }> = [];
      for (const term of terms) {
        const search = await fetch(`/api/admin/pearl/passages?q=${encodeURIComponent(term)}`, { cache: 'no-store' });
        const found = await search.json();
        const fresh = ((search.ok ? found.passages : []) as BenchPassage[] || []).filter((passage) => !seen.has(passage.id));
        fresh.forEach((passage) => seen.add(passage.id));
        if (fresh.length) groups.push({ term, passages: fresh.slice(0, 3) });
      }
      setWider(groups);
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The wider search could not be completed.' }); }
    finally { setWidening(false); }
  }

  /* Step 10, AI place 3: summarise the retrieved passages. Every sentence
     must cite a passage; the server rejects the summary otherwise. */
  const [aiSummary, setAiSummary] = useState<{ summary?: string; message?: string; passages?: Array<{ number: number; title: string; url: string }> } | null>(null);
  const [aiSummarising, setAiSummarising] = useState(false);

  async function summarisePassages() {
    setAiSummarising(true);
    setAiSummary(null);
    try {
      const response = await fetch('/api/admin/pearl/ai/summarise', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, passageIds: passages.map((passage) => passage.id) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The summary could not be completed.');
      setAiSummary(payload.found ? { summary: payload.summary, passages: payload.passages } : { message: payload.message });
    } catch (error) { setAiSummary({ message: error instanceof Error ? error.message : 'The summary could not be completed.' }); }
    finally { setAiSummarising(false); }
  }

  async function review(status: 'good' | 'needs_improvement') {
    if (status === 'needs_improvement' && !note.trim()) { setShowCorrection(true); showNotice({ tone: 'warning', text: 'Add a short note explaining what Pearl should improve.' }); return; }
    setSaving(true);
    try {
      if (!previewMode && selectedId) {
        const response = await fetch('/api/admin/pearl/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: selectedId, status, note }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not save this review.');
      }
      if (selectedId) setData((current) => ({ ...current, questions: current.questions.map((row) => row.id === selectedId ? { ...row, review_status: status, review_note: note || null } : row) }));
      showNotice({ tone: 'success', text: previewMode ? 'Preview saved on this screen only.' : status === 'good' ? 'Answer marked as good.' : 'Answer added to the improvement queue.' });
      setShowCorrection(status === 'needs_improvement');
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save this review.' }); }
    finally { setSaving(false); }
  }

  async function saveTest() {
    const expectedOutcome = note.trim() || `Pearl should keep the answer titled “${answer.title || 'this approved answer'}” and preserve its current interpretation.`;
    setSaving(true);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/test-cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, expectedOutcome, sourceQuestionId: selectedId }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not save this test.');
      }
      showNotice({ tone: 'success', text: previewMode ? 'Preview test added on this screen only.' : 'Test saved. Future changes can be checked against it.' });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save this test.' }); }
    finally { setSaving(false); }
  }

  const interpretation = answer.interpretation || {};
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Test and improve" title="Ask Pearl, then inspect the reason" text="This uses the same answer engine as the member research desk. A test question is not added to member demand." />
      <form onSubmit={runTest} className="border border-stone-200 bg-white p-4 sm:p-5">
        <label htmlFor="pearl-test-question" className="text-xs font-semibold text-stone-800">Question to test</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"><input id="pearl-test-question" value={question} onChange={(event) => setQuestion(event.target.value)} className={inputClass} placeholder="Ask the exact question a member might use" /><button type="submit" disabled={!question.trim()} className={goldButton}><Icon name="test" />Run test</button></div>
        <p className="mt-2 text-[11px] text-stone-600">Try a name, abbreviation, misspelling, research topic or safety question.</p>
      </form>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(16rem,0.75fr)]">
        <section className="border border-stone-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-800">Pearl answered</p><h2 className="mt-1 text-lg font-semibold text-stone-950">{answer.title || 'No answer title'}</h2></div><StatusChip label={plainAnswerKind(answer.kind)} /></div>
          <div className="p-5"><p className="text-sm leading-6 text-stone-700">{answer.summary || 'No answer summary was returned.'}</p>
            <AdminDoseRows answer={answer} />
            {answer.sections?.filter((section) => section.items?.length).map((section) => <div key={section.title} className="mt-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">{section.title}</p><ul className="mt-2 space-y-2 border-l-2 border-stone-200 pl-4 text-sm leading-6 text-stone-600">{section.items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>)}
            {Boolean(answer.comparison?.length) && <div className="mt-5 grid gap-px border border-stone-200 bg-stone-200 sm:grid-cols-2 lg:grid-cols-3" aria-label="Research comparison">{answer.comparison?.map((row) => <div key={row.name} className="bg-white p-4"><h3 className="text-sm font-semibold text-stone-950">{row.name}</h3><dl className="mt-3 space-y-2 text-xs leading-5 text-stone-600">{[['Purpose', row.purpose], ['Evidence', row.evidence], ['Half life', row.halfLife], ['Status', row.status]].map(([label, value]) => value ? <div key={label}><dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-600">{label}</dt><dd className="mt-0.5">{value}</dd></div> : null)}</dl></div>)}</div>}
            {Boolean(answer.bullets?.length) && <ul className="mt-4 space-y-2 border-l-2 border-gold-300 pl-4 text-sm leading-6 text-stone-600">{answer.bullets?.map((bullet, index) => <li key={`${bullet}-${index}`}>{bullet}</li>)}</ul>}
            {Boolean(answer.suggestions?.length) && <div className="mt-4 flex flex-wrap gap-2" aria-label="Possible research terms">{answer.suggestions?.slice(0, 6).map((suggestion) => <button key={suggestion.slug || suggestion.label} type="button" disabled={Boolean(acceptingSuggestion)} onClick={() => void acceptSuggestedTerm(suggestion)} className="min-h-11 border border-gold-700 bg-gold-700 px-4 py-2 text-[11px] font-semibold text-white hover:bg-gold-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">{acceptingSuggestion === suggestion.slug ? 'Using...' : `Use ${suggestion.label || suggestion.slug}`}</button>)}<button type="button" disabled={Boolean(acceptingSuggestion)} onClick={() => void rejectSuggestedTerms()} className="min-h-11 border border-stone-300 bg-white px-4 py-2 text-[11px] font-semibold text-stone-700 hover:border-gold-400 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">None of these</button></div>}
            {Boolean(answer.sources?.length) && <div className="mt-6"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Sources shown with this answer ({answer.sources?.length})</p><div className="mt-2 space-y-2">{answer.sources?.map((source, index) => <a key={`${source.url}-${index}`} href={source.url || '#'} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-between gap-3 border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700 hover:border-gold-400"><span>{source.label || 'Research source'}</span><Icon name="external" className="h-3.5 w-3.5 text-stone-600" /></a>)}</div></div>}
            {answerCompoundSlug && <div className="mt-4">
              <button type="button" onClick={() => setCitationOpen((open) => !open)} className="text-[11px] font-semibold text-stone-500 underline hover:text-stone-800">Report a wrong or missing source</button>
              {citationOpen && <div className="mt-3 border border-stone-200 bg-[#fbfaf7] p-4">
                <p className="text-xs leading-5 text-stone-600">This files a proposal about the links shown with {compoundName(answerCompoundSlug)} answers. Nothing changes until it is approved on the Proposals screen.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-stone-700">What is wrong?
                    <select value={citation.action} onChange={(event) => setCitation({ ...citation, action: event.target.value as 'remove' | 'add', url: '' })} className={`${inputClass} mt-1.5`}>
                      <option value="remove">A shown link is wrong</option>
                      <option value="add">A link is missing</option>
                    </select>
                  </label>
                  {citation.action === 'remove' ? <label className="text-xs font-medium text-stone-700">Which link?
                    <select value={citation.url} onChange={(event) => setCitation({ ...citation, url: event.target.value })} className={`${inputClass} mt-1.5`}>
                      <option value="">Choose the wrong link</option>
                      {answer.sources?.map((source, index) => <option key={`${source.url}-${index}`} value={source.url || ''}>{source.label || source.url}</option>)}
                    </select>
                  </label> : <label className="text-xs font-medium text-stone-700">Link to add
                    <input type="text" inputMode="url" value={citation.url} onChange={(event) => setCitation({ ...citation, url: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="www.example.com" />
                  </label>}
                </div>
                {citation.action === 'add' && <label className="mt-3 block text-xs font-medium text-stone-700">What should the link be called?
                  <input value={citation.label} onChange={(event) => setCitation({ ...citation, label: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="For example, the study title" />
                </label>}
                <label className="mt-3 block text-xs font-medium text-stone-700">Why? (optional)
                  <input value={citation.reason} onChange={(event) => setCitation({ ...citation, reason: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="For example: this link is about a different compound" />
                </label>
                {citation.action === 'add' && <p className="mt-2 text-[11px] leading-4 text-stone-600">Links can only be added from trusted research sites or the approved source library.</p>}
                <button type="button" onClick={() => void fileCitation()} disabled={citationFiling} className={`${goldButton} mt-3`}><Icon name="scale" />{citationFiling ? 'Filing...' : 'File the source report'}</button>
              </div>}
            </div>}
            {passagesChecked && !previewMode && <div className="mt-6 border-t border-stone-200 pt-5">
              <div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-800">More detail from the approved sources</p><StatusChip label="Admin preview · members do not see this yet" tone="amber" /></div>
              <p className="mt-1 text-[11px] leading-5 text-stone-500">Searched the full stored text of every approved source page. The template answer above is never changed by this; these extracts sit underneath it, each one cited.</p>
              {passages.length > 0 ? <div className="mt-3 space-y-3">{passages.map((passage) => <blockquote key={passage.id} className="border-l-2 border-gold-400 bg-[#fbfaf7] p-3">
                <span className="flex flex-wrap items-center gap-2">{passage.heading && <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">{passage.heading}</p>}{passage.boosted && <StatusChip label="Shown first" tone="green" />}</span>
                <p className="mt-1 text-xs leading-5 text-stone-700">{passage.passage_text.length > 600 ? `${passage.passage_text.slice(0, 600)}…` : passage.passage_text}</p>
                <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <a href={passage.url} target="_blank" rel="noreferrer" className="inline-block text-[10px] font-semibold text-gold-800 underline">{passage.sourceName}: {passage.title || passage.url}</a>
                  {!passage.boosted && <button type="button" disabled={boostFiling === passage.id} onClick={() => void fileBoost(passage)} className="min-h-8 text-[10px] font-semibold text-stone-500 underline hover:text-stone-800 disabled:opacity-40">{boostFiling === passage.id ? 'Filing...' : 'Mark as important'}</button>}
                </span>
              </blockquote>)}</div> : <p className="mt-3 text-xs text-stone-600">No stored passage matches this question. Saying so beats filling the gap.</p>}
              <div className="mt-3">
                <button type="button" disabled={widening} onClick={() => void widenSearch()} className={secondaryButton}><Icon name="search" />{widening ? 'Widening...' : 'Search wider with AI wording'}</button>
                <p className="mt-1 text-[11px] leading-4 text-stone-600">Asks the AI for other wordings the sources might use, then searches the stored text again with them. The wordings only search; they never change an answer and members never see this.</p>
                {wider && wider.length === 0 && <p className="mt-2 text-xs text-stone-600">The wider wordings found nothing new. An honest nothing beats a guess.</p>}
                {wider && wider.map((group) => <div key={group.term} className="mt-3">
                  <StatusChip label={`Found with “${group.term}”`} tone="amber" />
                  <div className="mt-2 space-y-3">{group.passages.map((passage) => <blockquote key={passage.id} className="border-l-2 border-amber-300 bg-[#fbfaf7] p-3">
                    {passage.heading && <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">{passage.heading}</p>}
                    <p className="mt-1 text-xs leading-5 text-stone-700">{passage.passage_text.length > 600 ? `${passage.passage_text.slice(0, 600)}…` : passage.passage_text}</p>
                    <a href={passage.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] font-semibold text-gold-800 underline">{passage.sourceName}: {passage.title || passage.url}</a>
                  </blockquote>)}</div>
                </div>)}
              </div>
              {passages.length > 0 && <div className="mt-4">
                <button type="button" disabled={aiSummarising} onClick={() => void summarisePassages()} className={secondaryButton}><Icon name="test" />{aiSummarising ? 'Summarising...' : 'Summarise these passages with AI'}</button>
                <p className="mt-1 text-[11px] text-stone-600">The summary may use only these passages, and every sentence must cite one. An uncited sentence rejects the whole summary.</p>
                {aiSummary?.summary && <div className="mt-3 border border-gold-300 bg-gold-50/40 p-3">
                  <p className="text-xs leading-6 text-stone-800">{aiSummary.summary}</p>
                  {Boolean(aiSummary.passages?.length) && <p className="mt-2 text-[10px] text-stone-500">Citations: {aiSummary.passages?.map((passage) => `[${passage.number}] ${passage.title}`).join(' · ')}</p>}
                  <p className="mt-2 border-l-2 border-amber-400 pl-3 text-[11px] leading-5 text-amber-950">Check each statement against its quote. The system only checked that the quote is real, not that the statement reads it correctly.</p>
                </div>}
                {aiSummary?.message && <p className="mt-3 border-l-2 border-amber-400 pl-3 text-xs leading-5 text-amber-900">{aiSummary.message}</p>}
              </div>}
            </div>}
          </div>
          <div className="border-t border-stone-200 bg-stone-50 p-4"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShowCorrection(true)} className={goldButton}><Icon name="flag" />Fix this answer</button>{selectedId ? <button type="button" onClick={() => void review('good')} disabled={saving} className="inline-flex min-h-11 items-center gap-2 border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"><Icon name="check" />Good answer</button> : null}<button type="button" onClick={() => void saveTest()} disabled={saving} className={secondaryButton}><Icon name="shield" />Save as a test</button></div><p className="mt-2 text-[11px] leading-5 text-stone-600">{selectedId ? 'This is the exact answer the member was shown.' : 'A fresh test shows what Pearl would answer today. Fixing it files a proposal, and nothing changes until that proposal is approved.'}</p></div>
        </section>

        <aside className="border border-stone-200 bg-[#fbfaf7] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-800">Why Pearl answered this way</p>
          <dl className="mt-4 space-y-4"><Reason label="Understanding" value={interpretation.status || (answer.needsLanguageReview ? 'Needs language review' : 'Resolved')} /><Reason label="Matched wording" value={interpretation.matchedText || 'No exact wording saved'} /><Reason label="Method" value={plainMethod(interpretation.method)} /><Reason label="Confidence" value={interpretation.confidence || 'Not recorded'} /></dl>
          {interpretation.disclosure && <p className="mt-5 border-l-2 border-gold-400 pl-3 text-xs leading-5 text-stone-600">{interpretation.disclosure}</p>}
          {Boolean(interpretation.expandedTerms?.length) && <div className="mt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">Connected to</p><div className="mt-2 flex flex-wrap gap-1.5">{interpretation.expandedTerms?.map((term) => <span key={term} className="border border-stone-200 bg-white px-2 py-1 text-[11px] text-stone-600">{term}</span>)}</div></div>}
          <div className="mt-6 border-t border-stone-200 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-800">What Pearl searched and found</p>
            {inspection.found.length > 0 ? <ul className="mt-3 space-y-2">{inspection.found.map((compound) => <li key={compound.slug} className="flex items-center justify-between gap-2 text-xs text-stone-700"><span className="font-medium">{compound.name}</span>{typeof compound.evidenceScore === 'number' && <span className="text-[10px] text-stone-600">research strength {compound.evidenceScore} of 5</span>}</li>)}</ul> : <p className="mt-3 text-xs text-stone-600">No approved compound matches this wording.</p>}
            {inspection.missed.length > 0 && <div className="mt-4"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">Words that found nothing</p><div className="mt-2 flex flex-wrap gap-1.5">{inspection.missed.map((word) => <span key={word} className="border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">{word}</span>)}</div><p className="mt-2 text-[11px] leading-4 text-stone-600">A weak answer often traces to one of these. Propose a fix below to teach Pearl the wording.</p></div>}
          </div>
        </aside>
      </div>

      {showCorrection && <section className="border-2 border-amber-300 bg-amber-50/40 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-800">Fix this answer</p><h2 className="mt-1 text-base font-semibold text-stone-950">Teach Pearl what this wording should mean</h2></div><button type="button" onClick={() => setShowCorrection(false)} className="min-h-10 px-2 text-xs text-stone-500 underline">Close</button></div>
        <div className="mt-2">
          <p className="text-xs leading-5 text-stone-600">Most weak answers trace to wording Pearl did not recognise. This files a proposal: the wording rule and its saved test are written together the moment the proposal is approved on the Proposals screen. Nothing changes before that.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-stone-700">The wording members use
              <input value={proposal.term} onChange={(event) => setProposal({ ...proposal, term: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="For example, cagri" />
            </label>
            <label className="text-xs font-medium text-stone-700">Type
              <select value={proposal.kind} onChange={(event) => setProposal({ ...proposal, kind: event.target.value })} className={`${inputClass} mt-1.5`}>
                <option value="abbreviation">Abbreviation</option>
                <option value="misspelling">Misspelling</option>
                <option value="alias">Alternative name</option>
              </select>
            </label>
            <label className="text-xs font-medium text-stone-700">Pearl should read it as
              <input list="proposal-compounds" value={proposal.target} onChange={(event) => setProposal({ ...proposal, target: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="Start typing a compound name" />
              <datalist id="proposal-compounds">{compounds.map((compound) => <option key={compound.slug} value={compound.name} />)}</datalist>
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-stone-700"><input type="checkbox" checked={proposal.includeTest} onChange={(event) => setProposal({ ...proposal, includeTest: event.target.checked })} className="h-4 w-4 accent-gold-700" />Also keep a saved test so the corrected answer stays fixed (recommended)</label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void propose()} disabled={proposing} className={goldButton}><Icon name="scale" />{proposing ? 'Filing...' : 'File the proposal'}</button>
            <button type="button" onClick={() => void suggestWordings()} disabled={aiExpanding} className={secondaryButton}><Icon name="search" />{aiExpanding ? 'Asking...' : 'Ask AI for wording ideas'}</button>
          </div>
          {aiSuggestions.length > 0 && <div className="mt-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">AI suggestions — each one is only a proposal until approved</p>
            {aiSuggestions.map((suggestion) => <div key={suggestion.term} className="flex flex-wrap items-center justify-between gap-2 border border-stone-200 bg-white px-3 py-2">
              <span className="text-xs text-stone-800"><strong>“{suggestion.term}”</strong> → {compoundName(suggestion.compoundSlug)} <span className="text-stone-600">({plainKind(suggestion.kind)} · {suggestion.reason})</span></span>
              <button type="button" onClick={() => void fileSuggestion(suggestion)} className="inline-flex min-h-9 items-center gap-1.5 border border-gold-400 bg-gold-50 px-3 text-xs font-semibold text-gold-900 hover:bg-gold-100"><Icon name="scale" className="h-3.5 w-3.5" />File as proposal</button>
            </div>)}
          </div>}
        </div>
        <div className="mt-5 border-t border-amber-200 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-800">If wording is not the problem</p>
          <p className="mt-1 text-xs leading-5 text-stone-600">Describe what should be different. The note travels with the proposal above{selectedId ? ', and can also be saved on this member question' : ''}.</p>
          <label htmlFor="pearl-improvement-note" className="sr-only">How Pearl should improve this answer</label>
          <textarea id="pearl-improvement-note" value={note} onChange={(event) => setNote(event.target.value)} rows={4} className={`${inputClass} mt-3`} placeholder="For example: Treat glutathione as the general concept first, then ask whether the member means L-Glutathione or an IV formulation." />
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedId ? <button type="button" onClick={() => void review('needs_improvement')} disabled={saving || !note.trim()} className={secondaryButton}><Icon name="flag" />Save improvement note</button> : null}
            <button type="button" onClick={() => move('terminology')} className={secondaryButton}><Icon name="type" />Add wording</button>
            <button type="button" onClick={() => move('tasks')} className={secondaryButton}><Icon name="task" />Create research task</button>
          </div>
        </div></section>}

      <MemberQuestions data={data} previewMode={previewMode} openSaved={openSaved} />
    </div>
  );
}

/* Audit recommendation 2: member questions, searchable without leaving the
   dashboard. An empty search shows the recent questions already loaded; a
   search reads the full saved history through the existing audit API. */
function MemberQuestions({ data, previewMode, openSaved }: { data: DashboardData; previewMode: boolean; openSaved: (row: QuestionRow) => void }) {
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState<'all' | 'members'>('all');
  const [results, setResults] = useState<QuestionRow[] | null>(null);
  const [searched, setSearched] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [shown, setShown] = useState(8);

  const base = results ?? data.questions;
  const visible = base.filter((row) => audience === 'all' || !row.is_staff);

  async function search(event?: React.FormEvent) {
    event?.preventDefault();
    const needle = query.trim();
    setShown(8);
    setSearchError('');
    if (!needle) { setResults(null); setSearched(''); return; }
    if (previewMode) {
      setResults(data.questions.filter((row) => row.question.toLowerCase().includes(needle.toLowerCase())));
      setSearched(needle);
      return;
    }
    setSearching(true);
    try {
      const response = await fetch(`/api/admin/research-questions?q=${encodeURIComponent(needle)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not search the saved questions.');
      setResults((payload.questions || []) as QuestionRow[]);
      setSearched(needle);
    } catch (error) { setSearchError(error instanceof Error ? error.message : 'Could not search the saved questions.'); }
    finally { setSearching(false); }
  }

  return <section className="border border-stone-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-4"><div><h2 className="text-sm font-semibold text-stone-950">Member questions</h2><p className="mt-1 text-[11px] text-stone-500">Search every saved question, then open one to review exactly what Pearl showed.</p></div><Link href="/admin/research-questions" className="text-xs font-semibold text-gold-800 underline">Full audit</Link></div>
    <form onSubmit={search} className="grid gap-2 border-b border-stone-200 bg-stone-50 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <label htmlFor="member-question-search" className="sr-only">Search saved questions</label>
      <div className="relative"><Icon name="search" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-stone-600" /><input id="member-question-search" value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pl-9`} placeholder="Search a question, member name or compound" /></div>
      <select value={audience} onChange={(event) => { setAudience(event.target.value as 'all' | 'members'); setShown(8); }} aria-label="Whose questions to show" className={`${inputClass} w-auto bg-white font-medium`}>
        <option value="all">Everyone</option>
        <option value="members">Members only</option>
      </select>
      <button type="submit" disabled={searching} className={secondaryButton}><Icon name="search" />{searching ? 'Searching...' : 'Search'}</button>
    </form>
    {searchError && <p className="border-b border-red-200 bg-red-50 px-5 py-3 text-xs text-red-800">{searchError}</p>}
    {searched && !searchError && <p className="border-b border-stone-100 px-5 py-2.5 text-[11px] text-stone-500">{visible.length === 0 ? 'No saved question matches' : `${visible.length} saved question${visible.length === 1 ? ' matches' : 's match'}`} “{searched}”. <button type="button" onClick={() => { setQuery(''); setResults(null); setSearched(''); setShown(8); }} className="font-semibold text-gold-800 underline">Show recent instead</button></p>}
    <div className="divide-y divide-stone-100">{visible.slice(0, shown).map((row) => <button type="button" key={row.id} onClick={() => openSaved(row)} className="grid w-full gap-2 px-5 py-4 text-left hover:bg-stone-50 sm:grid-cols-[1fr_auto] sm:items-center"><span><span className="block text-sm font-medium text-stone-900">{row.question}</span><span className="mt-1 block text-[11px] text-stone-600">{row.is_staff ? 'Staff test' : row.customer_name || 'Member'} · {formatDate(row.created_at)}</span></span><ReviewChip status={row.review_status || 'unreviewed'} /></button>)}{visible.length === 0 && !searched && <Empty text="No saved questions yet. Run a test above to begin." />}</div>
    {visible.length > shown && <div className="border-t border-stone-200 p-3 text-center"><button type="button" onClick={() => setShown((current) => current + 12)} className={secondaryButton}>Show more ({visible.length - shown} left)</button></div>}
  </section>;
}

interface StoredTestResult {
  state?: string;
  checkedAt?: string;
  snapshot?: { title?: string };
  differences?: string[];
}

function storedResult(row: TestCaseRow): StoredTestResult | null {
  if (!row.last_result) return null;
  try {
    const parsed = JSON.parse(row.last_result) as StoredTestResult;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function SavedTests({ data, setData, previewMode, showNotice }: { data: DashboardData; setData: React.Dispatch<React.SetStateAction<DashboardData>>; previewMode: boolean; showNotice: (notice: Notice) => void }) {
  const confirm = useConfirm();
  const [running, setRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [retiring, setRetiring] = useState<number | null>(null);
  const tests = data.testCases;
  const changed = tests.filter((row) => storedResult(row)?.state === 'changed');

  /* Saved tests only ever accumulated: every approved correction writes one and
     nothing could take one off the list again. Retiring stops a test running
     and removes it from this screen. The question is kept in the Change
     History, so retiring is tidying up, not throwing away. */
  async function retire(row: TestCaseRow) {
    if (!(await confirm({
      title: `Retire the test “${row.question}”?`,
      body: "It stops running and leaves this list. Pearl's answers do not change, and the question is kept in the Change History.",
      confirmLabel: 'Yes, retire it',
      cancelLabel: 'Keep it running',
    }))) return;
    setRetiring(row.id);
    try {
      if (previewMode) {
        showNotice({ tone: 'success', text: 'Preview only. On the live dashboard this retires the test.' });
        return;
      }
      const response = await fetch('/api/admin/pearl/test-cases/retire', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not retire this test.');
      setData((current) => ({ ...current, testCases: current.testCases.filter((item) => item.id !== row.id) }));
      showNotice({ tone: 'success', text: 'Retired. It stops running from now on and is kept in the Change History.' });
    } catch (error) {
      showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not retire this test.' });
    } finally { setRetiring(null); }
  }

  async function refresh() {
    const response = await fetch('/api/admin/pearl/dashboard', { cache: 'no-store' });
    const payload = await response.json();
    if (response.ok) setData(payload as DashboardData);
  }

  async function runAll() {
    setRunning(true);
    try {
      if (previewMode) {
        showNotice({ tone: 'success', text: 'Preview only. On the live dashboard this runs every saved test.' });
        return;
      }
      const response = await fetch('/api/admin/pearl/test-cases/run', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not run the saved tests.');
      await refresh();
      const { counts } = payload as { counts: { pass: number; changed: number; recorded: number } };
      showNotice(counts.changed > 0
        ? { tone: 'warning', text: `${counts.changed} answer${counts.changed === 1 ? ' has' : 's have'} changed and need a look. ${counts.pass} unchanged.` }
        : { tone: 'success', text: `All tests ran: ${counts.pass} unchanged, ${counts.recorded} newly recorded.` });
    } catch (error) {
      showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not run the saved tests.' });
    } finally { setRunning(false); }
  }

  async function seed() {
    setSeeding(true);
    try {
      if (previewMode) {
        showNotice({ tone: 'success', text: 'Preview only. On the live dashboard this adds the ten starter tests.' });
        return;
      }
      const response = await fetch('/api/admin/pearl/test-cases/seed', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not add the starter tests.');
      await refresh();
      showNotice({ tone: 'success', text: `Added ${payload.inserted} starter test${payload.inserted === 1 ? '' : 's'}. ${payload.skipped ? `${payload.skipped} already existed.` : ''}` });
    } catch (error) {
      showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not add the starter tests.' });
    } finally { setSeeding(false); }
  }

  return <div className="space-y-6">
    <SectionHeading eyebrow="Saved tests" title="Prove Pearl's answers stay fixed" text="The first run records each answer as the accepted picture. Every later run says whether the answer still matches it. A changed answer is not automatically wrong; it needs a person to look." />
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void runAll()} disabled={running || tests.length === 0} className={goldButton}><Icon name="shield" />{running ? 'Running...' : `Run all ${tests.length || ''} tests`}</button>
      {tests.length === 0 && <button type="button" onClick={() => void seed()} disabled={seeding} className={secondaryButton}><Icon name="check" />{seeding ? 'Adding...' : 'Add the starter tests'}</button>}
      <p className="text-[11px] text-stone-600">Save new tests from Test &amp; Improve with “Save as a test”.</p>
    </div>

    {changed.length > 0 && <div className="border-2 border-amber-300 bg-amber-50/40 px-4 py-3 text-sm text-amber-900">
      {changed.length} test{changed.length === 1 ? '' : 's'} found a changed answer. Read the differences below: if the change was meant, run the tests again after confirming with Kieran; if not, it needs fixing.
    </div>}

    <section className="border border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-5 py-4"><h2 className="text-sm font-semibold text-stone-950">Every saved test</h2><p className="mt-1 text-[11px] text-stone-500">{tests.length === 0 ? 'None yet.' : `${tests.length} saved. Kept permanently; results update on every run.`}</p></div>
      <div className="divide-y divide-stone-100">
        {tests.map((row) => {
          const result = storedResult(row);
          const state = result?.state;
          return <div key={row.id} className="p-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                label={state === 'pass' ? 'Passing' : state === 'changed' ? 'Changed, needs a look' : state === 'recorded' ? 'Picture recorded' : 'Not run yet'}
                tone={state === 'pass' ? 'green' : state === 'changed' ? 'amber' : 'stone'} />
              {row.status !== 'active' && <StatusChip label={row.status} />}
              {result?.checkedAt && <span className="text-[10px] text-stone-600">Last run {formatDate(result.checkedAt)}</span>}
            </div>
            <p className="mt-2 text-sm font-medium text-stone-900">{row.question}</p>
            <p className="mt-1 text-xs leading-5 text-stone-500">{row.expected_outcome}</p>
            {state === 'changed' && Boolean(result?.differences?.length) && <ul className="mt-2 space-y-1 border-l-2 border-amber-300 pl-3 text-xs leading-5 text-amber-900">
              {result?.differences?.slice(0, 6).map((difference, index) => <li key={index}>{difference}</li>)}
            </ul>}
            <div className="mt-3">
              <button type="button" disabled={retiring === row.id} onClick={() => void retire(row)} className="inline-flex min-h-10 items-center gap-1.5 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 hover:border-gold-500 hover:text-stone-900 disabled:opacity-40">
                <Icon name="check" className="h-3.5 w-3.5" />{retiring === row.id ? 'Retiring...' : 'Retire this test'}
              </button>
            </div>
          </div>;
        })}
        {tests.length === 0 && <Empty text="No saved tests yet. Add the starter tests above, or save one from Test & Improve." />}
      </div>
    </section>
  </div>;
}

/* Approve or reject a wording row saved before the one-queue change (audit
   fix 4). The update API takes the whole record, so the row's own columns are
   sent back with only the decision changed. Approval switches direct matching
   on for abbreviations, misspellings and alternative names — including rows
   saved before this screen sent it correctly. Used by the Proposals screen,
   which is now the one place where waiting work is decided. */
async function decideTermRowOnServer(row: TermRow, decision: 'approved' | 'rejected') {
  const approved = decision === 'approved';
  const response = await fetch(`/api/admin/pearl-terminology/${row.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: row.kind, term: row.term, canonicalSlug: row.canonical_slug,
      displayName: row.display_name || null,
      aliases: row.aliases || [], misspellings: row.misspellings || [],
      relatedSlugs: row.related_slugs || [], categories: row.categories || [],
      componentSlugs: row.component_slugs || [], ambiguousWith: row.ambiguous_with || [],
      sourceUrls: Array.isArray(row.source_urls) ? row.source_urls : [],
      confidence: row.confidence || 'medium', reviewStatus: decision,
      autoResolve: approved && !['ambiguous', 'category'].includes(row.kind),
      enabled: approved, notes: row.notes || null, lastVerified: row.last_verified || null,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Could not save the decision.');
}

function applyTermDecision(setData: React.Dispatch<React.SetStateAction<DashboardData>>, row: TermRow, decision: 'approved' | 'rejected') {
  const approved = decision === 'approved';
  setData((current) => ({
    ...current,
    terminology: current.terminology.map((item) => item.id === row.id
      ? { ...item, review_status: decision, enabled: approved, auto_resolve: approved && !['ambiguous', 'category'].includes(row.kind) }
      : item),
    stats: {
      ...current.stats,
      terminologyWaiting: Math.max(0, current.stats.terminologyWaiting - 1),
      terminologyActive: current.stats.terminologyActive + (approved ? 1 : 0),
    },
  }));
}

/* ── Pearl Dosages ─────────────────────────────────────────────────────────────────────────────
 *
 * Every product on sale in a drop-down. Pick one and see the answer Pearl gives, laid out the way
 * a MEMBER sees it (Kieran, 10 September 2026: "There should a drop down so it is displayed as if
 * it was being asked by one of our members").
 *
 * The first version of this screen was a table of rows summarising what Pearl held. That answered
 * the question on paper and missed the point: the thing worth checking is what a member actually
 * reads, not a digest of it. So the answer here is produced by `answerQuestion`, the same function
 * the member's Research Desk calls in the same browser, and it is rendered with the member's own
 * furniture: the eyebrow that says whether it is a source-listed range, the serif title, the key
 * point, then the sources. Nothing is reworded on the way through.
 *
 * The product list, the water and the question all come from /api/admin/pearl/dosages, so the
 * drop-down carries whatever the shop is selling today without anybody editing this file.
 */
interface DosageSourceRow { title: string | null; journal: string | null; year: string | null; url: string | null }
interface DosageRow {
  name: string; slug: string; categories: string[]; strengths: string[];
  hidden?: boolean;
  water: string; kind: string; pearlCompound: string | null;
  dose: Record<string, string> | null; schedule: string | null; cycle: string | null;
  evidence: string | null; pearlNote: string | null; components: string[];
  provenance: string | null; sources: DosageSourceRow[]; question: string | null;
}

const DOSAGE_KIND_LABEL: Record<string, string> = {
  'has dose': 'Dose figures held',
  'no dose': 'No dose figures',
  blend: 'Blend',
  supply: 'Supply',
  'not a peptide': 'Not a peptide',
  'composition unknown': 'Composition unknown',
  'unaccounted for': 'No record',
};

/** Only these are something to act on. A blend, a water and a vitamin mixture are correct answers. */
const DOSAGE_KIND_IS_GAP = new Set(['no dose', 'unaccounted for', 'composition unknown']);

function PearlDosages() {
  const [rows, setRows] = useState<DosageRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/admin/pearl/dosages');
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(body?.error ?? 'Could not build the report.');
        setRows(body.rows ?? []);
        setSummary(body.summary ?? {});
        if ((body.rows ?? []).length) setSlug(body.rows[0].slug);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not build the report.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const row = rows.find((item) => item.slug === slug) ?? null;

  /* The member's own question, answered by the member's own engine, in this browser. A product
     with no compound behind it (a water, a blend) has no dose question to ask, so none is asked
     rather than one being invented. */
  const question = row ? `What dosage numbers are listed for ${row.name}?` : '';
  const answer = useMemo(() => {
    if (!row) return null;
    try {
      return answerQuestion(row.question, [], { adminPreview: true }) as PearlAnswer;
    } catch {
      return null;
    }
  }, [row]);

  if (loading) return <p className="text-sm text-stone-600">Asking Pearl about every product...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-stone-950">Pearl Dosages</h2>
        <p className="mt-1 text-xs leading-5 text-stone-600">
          Every product in the admin catalogue, including hidden products. Pick one and you see exactly what
          a member sees when they ask Pearl about its dose, in the member&rsquo;s own layout.
          Worked out fresh each time you open this, so a product added or withdrawn in the admin
          shows up here on its own.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Object.entries(summary).map(([kind, count]) => (
          <div key={kind} className={`border p-3 ${DOSAGE_KIND_IS_GAP.has(kind) ? 'border-gold-300 bg-gold-50' : 'border-stone-200 bg-white'}`}>
            <strong className="block text-xl font-semibold tabular-nums text-stone-950">{count}</strong>
            <span className="mt-1 block text-[10px] uppercase tracking-[0.12em] text-stone-600">
              {DOSAGE_KIND_LABEL[kind] ?? kind}
            </span>
          </div>
        ))}
      </div>

      <label htmlFor="pearl-dosage-product" className="block text-xs font-medium text-stone-700">
        Product
      </label>
      <select id="pearl-dosage-product" value={slug} onChange={(event) => setSlug(event.target.value)} className={`${inputClass} mt-1.5`}>
          {rows.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}{item.hidden ? ' — hidden' : ''} — {item.water}
            </option>
          ))}
      </select>

      {row && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
            <span className={`px-2 py-1 text-[9px] uppercase tracking-[0.12em] ${
              DOSAGE_KIND_IS_GAP.has(row.kind) ? 'bg-gold-100 text-gold-800' : 'bg-stone-100 text-stone-600'}`}>
              {DOSAGE_KIND_LABEL[row.kind] ?? row.kind}
            </span>
            <span>Water: <strong className="font-semibold text-stone-800">{row.water}</strong></span>
            <span>Visibility: <strong className="font-semibold text-stone-800">{row.hidden ? 'Hidden' : 'Live'}</strong></span>
            <span>Strengths sold: {row.strengths.join(', ') || 'none listed'}</span>
            {row.pearlCompound && <span>Pearl record: {row.pearlCompound}</span>}
          </div>

          {/* The member's question, shown as they would have typed it. */}
          <div className="border border-stone-200 bg-stone-50 px-4 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-stone-500">A member asks</p>
            <p className="mt-1 text-sm text-stone-800">
              {question}
            </p>
          </div>

          {answer ? (
            /* The member's layout: the eyebrow that says what kind of answer it is, the serif
               title, then the body and the sources. Same words, same order, same engine. */
            <article className="rounded-xl border border-stone-200 bg-white px-4 py-4 shadow-sm sm:px-5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-gold-700">
                {answer.kind === 'dose' ? 'Source-listed range'
                  : answer.kind === 'comparison' ? 'Research comparison'
                  : 'Educational answer'}
              </p>
              <h3 className="mt-1.5 font-serif text-2xl leading-tight text-stone-800">{answer.title}</h3>
              {answer.summary && <p className="mt-3 text-sm leading-6 text-stone-700">{answer.summary}</p>}
              {answer.diagnostic && <div className="mt-3 border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] leading-5 text-stone-600">
                <strong className="text-stone-800">How Pearl reached this:</strong>{' '}
                matched {answer.diagnostic.productSlug || answer.diagnostic.match || answer.compounds?.join(', ') || 'the recorded product'};
                {' '}{answer.diagnostic.validation?.numericRows ?? 0} numerical source row{answer.diagnostic.validation?.numericRows === 1 ? '' : 's'};
                {' '}{answer.diagnostic.validation?.valid === false ? `check failed: ${(answer.diagnostic.validation.errors || []).join(', ')}` : 'answer check passed'}.
              </div>}
              <AdminDoseRows answer={answer} />

              {answer.sections?.filter((section) => section.items?.length).map((section) => (
                <div key={section.title} className="mt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">{section.title}</p>
                  <ul className="mt-2 space-y-2 border-l-2 border-stone-200 pl-4 text-sm leading-6 text-stone-600">
                    {section.items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                  </ul>
                </div>
              ))}

              {Boolean(answer.bullets?.length) && (
                <ul className="mt-4 space-y-2 border-l-2 border-gold-300 pl-4 text-sm leading-6 text-stone-600">
                  {answer.bullets?.map((bullet, index) => <li key={`${bullet}-${index}`}>{bullet}</li>)}
                </ul>
              )}

              {Boolean(answer.sources?.length) && (
                <div className="mt-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">
                    Sources shown with this answer ({answer.sources?.length})
                  </p>
                  <div className="mt-2 space-y-2">
                    {answer.sources?.map((source, index) => (
                      <a key={`${source.url}-${index}`} href={source.url || '#'} target="_blank" rel="noreferrer"
                        className="flex min-h-11 items-center justify-between gap-3 border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700 hover:border-gold-400">
                        <span>{source.label || source.detail || 'Research source'}</span>
                        <Icon name="external" className="h-3.5 w-3.5 text-stone-600" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ) : (
            <div className="border border-stone-200 bg-white p-5 text-sm leading-6 text-stone-700">
              {row.components.length > 0 && <p>Contains: {row.components.join(', ')}</p>}
              {row.provenance && <p className="mt-1 text-stone-600">Where the split came from: {row.provenance}</p>}
              {row.pearlNote && <p className="mt-2 text-stone-600">Pearl&rsquo;s note: {row.pearlNote}</p>}
              {!row.components.length && !row.pearlNote && <p>Pearl has nothing recorded for this product.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Terminology({ data, setData, previewMode, showNotice }: { data: DashboardData; setData: React.Dispatch<React.SetStateAction<DashboardData>>; previewMode: boolean; showNotice: (notice: Notice) => void }) {
  const [term, setTerm] = useState('');
  const [kind, setKind] = useState('abbreviation');
  const [compoundSearch, setCompoundSearch] = useState('');
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const categoryMode = kind === 'category';
  const compounds = useMemo(() => [...(COMPOUNDS as Array<{ slug: string; name: string }>)]
    .sort((left, right) => left.name.localeCompare(right.name, 'en-GB')), []);
  const matches = useMemo(() => {
    const needle = compoundSearch.trim().toLowerCase();
    return needle ? compounds.filter((compound) => `${compound.name} ${compound.slug}`.toLowerCase().includes(needle)) : compounds;
  }, [compoundSearch, compounds]);
  const selectedCompounds = selectedSlugs.map((slug) => compounds.find((compound) => compound.slug === slug)).filter((compound): compound is { slug: string; name: string } => Boolean(compound));
  const selectionComplete = categoryMode ? selectedSlugs.length >= 2 : selectedSlugs.length === 1;

  useEffect(() => {
    const close = (event: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setPickerOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function changeKind(nextKind: string) {
    setKind(nextKind);
    if (nextKind !== 'category') setSelectedSlugs((current) => current.slice(0, 1));
  }

  function toggleCompound(slug: string) {
    if (!categoryMode) {
      setSelectedSlugs([slug]);
      setPickerOpen(false);
      return;
    }
    setSelectedSlugs((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug].slice(0, 12));
  }

  /* Audit fix 4, one approval queue: adding wording here FILES A PROPOSAL,
     exactly like every other improve button. The decide endpoint writes the
     approved rule when the proposal is approved on the Proposals screen, so
     waiting work lives in one place with one visible count. */
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!term.trim() || !selectionComplete) return;
    const canonicalSlug = selectedSlugs[0];
    const groupedSlugs = categoryMode ? selectedSlugs.slice(1) : [];
    const targetNames = selectedCompounds.map((compound) => compound.name).join(', ');
    setSaving(true);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'terminology_rule',
            title: categoryMode ? `Teach Pearl the category “${term.trim()}”` : `Teach Pearl that “${term.trim()}” means ${targetNames}`,
            before: { 'Pearl today': `“${term.trim()}” is not understood directly` },
            after: { 'After approval': categoryMode ? `“${term.trim()}” offers ${targetNames} as choices` : `“${term.trim()}” resolves to ${targetNames}` },
            payload: { rule: { kind, term: term.trim(), canonicalSlug, categories: categoryMode ? [term.trim()] : [], ambiguousWith: groupedSlugs, notes: null } },
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not file this wording.');
      }
      setData((current) => ({ ...current, stats: { ...current.stats, proposalsWaiting: current.stats.proposalsWaiting + 1 } }));
      setTerm('');
      setCompoundSearch('');
      setSelectedSlugs([]);
      showNotice({ tone: 'success', text: previewMode ? 'Preview wording filed on this screen only.' : 'Wording filed as a proposal. Approve it on the Proposals screen to make it real.' });
    } catch (error) {
      showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not file this wording.' });
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-6">
    <SectionHeading eyebrow="Terminology" title="Teach Pearl the words people actually use" text="Add abbreviations, misspellings and broad category names without a source. Every addition is filed as a proposal and decided on the Proposals screen; nothing can affect an answer before it is approved there." />
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.95fr)_minmax(22rem,1.05fr)]">
      <form onSubmit={submit} className="border border-stone-200 bg-white p-5">
        <h2 className="text-base font-semibold text-stone-950">Add new wording</h2>
        <p className="mt-1 text-xs leading-5 text-stone-500">Start with the wording and what Pearl should understand it as.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-stone-700">Wording
            <input value={term} onChange={(event) => setTerm(event.target.value)} className={`${inputClass} mt-1.5`} placeholder={categoryMode ? 'For example, sexual health' : 'For example, RETA'} />
          </label>
          <label className="text-xs font-medium text-stone-700">Type
            <select value={kind} onChange={(event) => changeKind(event.target.value)} className={`${inputClass} mt-1.5`}>
              <option value="abbreviation">Abbreviation</option>
              <option value="misspelling">Misspelling</option>
              <option value="alias">Alternative name</option>
              <option value="category">Category or group</option>
            </select>
          </label>
        </div>

        <div ref={pickerRef} className="relative mt-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label htmlFor="compound-search" className="text-xs font-medium text-stone-700">Pearl should interpret it as</label>
            <span className="text-[10px] text-stone-600">{categoryMode ? 'Tick at least two' : 'Choose one'}</span>
          </div>
          <div className="relative mt-1.5">
            <Icon name="search" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-stone-600" />
            <input id="compound-search" value={compoundSearch} onFocus={() => setPickerOpen(true)} onChange={(event) => { setCompoundSearch(event.target.value); setPickerOpen(true); }} onKeyDown={(event) => { if (event.key === 'Escape') { setPickerOpen(false); event.currentTarget.blur(); } }} className={`${inputClass} pl-9`} placeholder="Search approved compounds" role="combobox" aria-expanded={pickerOpen} aria-controls="compound-results" autoComplete="off" />
          </div>
          {pickerOpen && <div id="compound-results" role="listbox" aria-multiselectable={categoryMode || undefined} className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto border border-stone-300 bg-white shadow-lg">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-[#f8faf8] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
              <span>{selectedSlugs.length ? `${selectedSlugs.length} selected` : categoryMode ? 'Choose a group' : 'Choose a compound'}</span>
              {selectedSlugs.length > 0 && <button type="button" onClick={() => setSelectedSlugs([])} className="min-h-8 px-2 text-gold-800 underline">Clear</button>}
            </div>
            {matches.map((compound) => {
              const selected = selectedSlugs.includes(compound.slug);
              return <button key={compound.slug} type="button" role="option" aria-selected={selected} onClick={() => toggleCompound(compound.slug)} className={`grid min-h-12 w-full grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-3 border-b border-stone-100 px-3 text-left text-sm last:border-0 ${selected ? 'bg-gold-50 text-gold-950' : 'text-stone-700 hover:bg-stone-50'}`}>
                <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? 'border-gold-700 bg-gold-700 text-white' : 'border-stone-300 bg-white'}`}>{selected && <Icon name="check" className="h-3.5 w-3.5" />}</span>
                <span className="truncate">{compound.name}</span>
              </button>;
            })}
            {matches.length === 0 && <p className="p-4 text-sm text-stone-500">No approved compound matches that search.</p>}
          </div>}
        </div>

        {selectedCompounds.length > 0 && <div className="mt-3" aria-label="Selected compounds">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">Selected</p>
          <div className="mt-2 flex flex-wrap gap-2">{selectedCompounds.map((compound) => <button key={compound.slug} type="button" onClick={() => toggleCompound(compound.slug)} aria-label={`Remove ${compound.name}`} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-800"><Icon name="check" className="h-3.5 w-3.5" />{compound.name}<span aria-hidden="true" className="text-emerald-500">×</span></button>)}</div>
        </div>}

        {categoryMode && <div className="mt-4 border border-sky-200 bg-sky-50 px-3 py-3 text-xs leading-5 text-sky-950"><strong>Broad category.</strong> Pearl will show the approved compounds you tick as choices, rather than treating the wording as one exact compound.</div>}
        <div className="mt-5 border-l-2 border-gold-400 bg-gold-50 px-3 py-2.5 text-xs leading-5 text-stone-700"><strong>No source needed.</strong> This only connects wording to approved compounds. It does not add new research evidence. Once approved, Pearl answers the wording directly instead of asking which compound is meant.</div>
        <button type="submit" disabled={saving || !term.trim() || !selectionComplete} className={`${goldButton} mt-5 w-full`}>{saving ? 'Saving...' : categoryMode && selectedSlugs.length < 2 ? 'Select at least two compounds' : 'Save for review'}</button>
      </form>

      <section className="border border-stone-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-5"><div><h2 className="text-base font-semibold text-stone-950">Administrator wording</h2><p className="mt-1 text-xs text-stone-500">Protected built-ins stay separate from these additions.</p></div><Link href="/admin/pearl-terminology" className="text-xs font-semibold text-gold-800 underline">Open full library</Link></div>
        <div className="grid grid-cols-3 gap-px bg-stone-200"><SmallStat label="Built in" value={data.stats.terminologyBuiltIn} /><SmallStat label="Active additions" value={data.stats.terminologyActive} /><SmallStat label="Waiting" value={data.stats.terminologyWaiting} /></div>
        <div className="divide-y divide-stone-100">{data.terminology.slice(0, 8).map((row) => <div key={row.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-sm font-semibold text-stone-900">{row.term}</p><p className="mt-1 text-[11px] text-stone-600">{plainKind(row.kind)} → {termTargetNames(row)}</p></div><StatusChip label={row.review_status === 'review' ? 'Waiting — decide on Proposals' : row.review_status === 'approved' ? (row.enabled ? 'Active' : 'Approved, switched off') : plainStatus(row.review_status)} tone={row.review_status === 'review' ? 'amber' : row.review_status === 'approved' && row.enabled ? 'green' : 'stone'} /></div>)}{data.terminology.length === 0 && <Empty text="No administrator wording has been added yet." />}</div>
      </section>
    </div>
  </div>;
}

interface SourcePreview {
  url: string; title: string; heading: string; textLength: number; sectionCount: number;
  sections: Array<{ heading: string; preview: string }>;
  structuredTypes: string[]; candidates: Record<string, string>;
}

/* Answer layouts (Kieran's feature, 18 Aug 2026): the administrator arranges
   an answer's blocks — drag into order, hide, add custom words — and applies
   the arrangement per compound or per category. The one-line summary is
   pinned; custom words wait for approval; every assignment starts switched
   OFF and switching it off again is the instant revert. The preview uses the
   exact same apply function as the member layer. */
interface LayoutBlockUI { type: 'section' | 'custom' | 'rest'; title?: string; hidden?: boolean; id?: string; heading?: string; text?: string; approved?: boolean }
interface LayoutRowData { id: number; name: string; blocks: LayoutBlockUI[]; updated_at: string }
interface LayoutAssignmentData { id: number; layout_id: number; target_kind: 'compound' | 'category'; target_value: string; enabled: boolean }

function AnswerLayouts({ setData, previewMode, showNotice }: { setData: React.Dispatch<React.SetStateAction<DashboardData>>; previewMode: boolean; showNotice: (notice: Notice) => void }) {
  const confirm = useConfirm();
  const [layouts, setLayouts] = useState<LayoutRowData[]>([]);
  const [assignments, setAssignments] = useState<LayoutAssignmentData[]>([]);
  const [loading, setLoading] = useState(!previewMode);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<{ id: number | null; name: string; blocks: LayoutBlockUI[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState('BPC-157');
  const [assignForm, setAssignForm] = useState<{ layoutId: number | null; kind: 'compound' | 'category'; value: string }>({ layoutId: null, kind: 'compound', value: '' });
  const [assignBusy, setAssignBusy] = useState(false);
  const dragFrom = useRef<number | null>(null);

  const compounds = useMemo(() => [...(COMPOUNDS as Array<{ slug: string; name: string; category?: string }>)]
    .sort((left, right) => left.name.localeCompare(right.name, 'en-GB')), []);
  const categories = useMemo(() => Array.from(new Set(compounds.map((compound) => compound.category).filter((value): value is string => Boolean(value)))).sort(), [compounds]);

  /* Today's real answer for the sample compound, so the designer arranges
     real blocks and the preview shows exactly what would change. */
  const sampleAnswer = useMemo(() => {
    try { return answerQuestion(`What does ${sample} research focus on?`, [], { adminPreview: true }) as PearlAnswer; } catch { return {} as PearlAnswer; }
  }, [sample]);

  async function load() {
    if (previewMode) return;
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/admin/pearl/layouts', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load the layouts.');
      setLayouts(payload.layouts || []);
      setAssignments(payload.assignments || []);
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Could not load the layouts.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount; the loader is a stable local helper, not a dependency
  }, []);

  function startNew() {
    const blocks: LayoutBlockUI[] = [
      ...(sampleAnswer.sections || []).map((section) => ({ type: 'section' as const, title: section.title })),
      { type: 'rest' },
    ];
    setEditing({ id: null, name: '', blocks });
  }

  function moveBlock(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setEditing((current) => {
      if (!current || to >= current.blocks.length) return current;
      const blocks = [...current.blocks];
      const [moved] = blocks.splice(from, 1);
      blocks.splice(to, 0, moved);
      return { ...current, blocks };
    });
  }

  function patchBlock(index: number, patch: Partial<LayoutBlockUI>) {
    setEditing((current) => current ? { ...current, blocks: current.blocks.map((block, i) => i === index ? { ...block, ...patch } : block) } : current);
  }

  async function save() {
    if (!editing || !editing.name.trim()) { showNotice({ tone: 'warning', text: 'Give the layout a name.' }); return; }
    setSaving(true);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/layouts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, name: editing.name.trim(), blocks: editing.blocks }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not save the layout.');
        if (payload.proposalsFiled > 0) setData((current) => ({ ...current, stats: { ...current.stats, proposalsWaiting: current.stats.proposalsWaiting + payload.proposalsFiled } }));
        showNotice({ tone: 'success', text: payload.proposalsFiled > 0
          ? `Layout saved. ${payload.proposalsFiled} proposal${payload.proposalsFiled === 1 ? '' : 's'} filed for your own words — approve them on the Proposals screen before members can read them.`
          : 'Layout saved. It changes nothing until you switch it on somewhere below.' });
        await load();
      } else {
        showNotice({ tone: 'success', text: 'Preview save shown on this screen only.' });
      }
      setEditing(null);
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save the layout.' }); }
    finally { setSaving(false); }
  }

  async function assign(layoutId: number, kind: 'compound' | 'category', value: string, enabled: boolean) {
    setAssignBusy(true);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/layouts/assign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ layoutId, targetKind: kind, targetValue: value, enabled }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not save the assignment.');
        setAssignments((current) => {
          const saved = payload.assignment as LayoutAssignmentData;
          const exists = current.some((row) => row.id === saved.id);
          return exists ? current.map((row) => row.id === saved.id ? saved : row) : [...current, saved];
        });
      }
      showNotice({ tone: 'success', text: previewMode ? 'Preview assignment shown on this screen only.'
        : enabled ? 'Switched ON. Members now see this arrangement there; switch it off to revert instantly.'
        : 'Saved switched off. Members keep the normal answer until you switch it on.' });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save the assignment.' }); }
    finally { setAssignBusy(false); }
  }

  async function removeAssignment(row: LayoutAssignmentData) {
    if (!(await confirm({
      title: 'Remove this layout from where it is used?',
      body: 'The answers there go back to their normal arrangement. The layout itself is kept.',
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Leave it',
    }))) return;
    setAssignBusy(true);
    try {
      if (!previewMode) {
        const response = await fetch(`/api/admin/pearl/layouts/assign?id=${row.id}`, { method: 'DELETE' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not remove the assignment.');
      }
      setAssignments((current) => current.filter((item) => item.id !== row.id));
      showNotice({ tone: 'success', text: 'Removed. The answers there return to their normal arrangement.' });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not remove the assignment.' }); }
    finally { setAssignBusy(false); }
  }

  const previewLayout = editing ? { blocks: editing.blocks.map((block) => block.type === 'custom' ? { ...block, approved: true } : block) } : null;
  const previewAnswer = previewLayout ? (applyAnswerLayout(sampleAnswer, previewLayout) as PearlAnswer) : null;
  const blockLabel = (block: LayoutBlockUI) => block.type === 'section' ? block.title : block.type === 'rest' ? 'Everything else, in its usual order' : block.heading || 'Your own words';

  return <div className="space-y-6">
    <SectionHeading eyebrow="Answer layouts" title="Arrange how an answer reads" text="Drag the parts of an answer into the order you want, hide what you do not need, and add your own words. Nothing changes for members until you switch a layout on below — and switching it off puts everything back instantly. The one-line summary always stays at the top, and safety answers always keep their fixed form." />
    {loadError && <NoticeBar notice={{ tone: 'error', text: loadError }} />}

    {!editing && <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={startNew} className={goldButton}><Icon name="map" />New layout</button>
      <label className="flex items-center gap-2 text-xs font-medium text-stone-700">Design around
        <input list="layout-sample-compounds" value={sample} onChange={(event) => setSample(event.target.value)} className={`${inputClass} w-56`} />
        <datalist id="layout-sample-compounds">{compounds.map((compound) => <option key={compound.slug} value={compound.name} />)}</datalist>
      </label>
    </div>}

    {editing && <section className="border-2 border-gold-300 bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-xs font-medium text-stone-700">Layout name
          <input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className={`${inputClass} mt-1.5 w-72`} placeholder="For example, Dosage first" />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(null)} className={secondaryButton}>Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className={goldButton}>{saving ? 'Saving...' : 'Save layout'}</button>
        </div>
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-800">The arrangement</p>
          <p className="mt-1 text-[11px] leading-4 text-stone-500">Drag a row to move it, or use the arrows. The eye hides a part without deleting it.</p>
          <div className="mt-3 border border-stone-300 bg-stone-100 px-3 py-2.5 text-xs text-stone-500">
            <span className="font-semibold text-stone-700">One-line summary</span> · always first, cannot be moved
          </div>
          <div className="mt-2 space-y-2">
            {editing.blocks.map((block, index) => <div key={`${block.type}-${block.id || block.title || index}`} draggable
              onDragStart={() => { dragFrom.current = index; }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => { if (dragFrom.current !== null) moveBlock(dragFrom.current, index); dragFrom.current = null; }}
              className={`border p-3 ${block.type === 'custom' ? 'border-gold-300 bg-gold-50/40' : 'border-stone-200 bg-white'} ${block.hidden ? 'opacity-50' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="cursor-grab text-stone-600" aria-hidden="true">⠿</span>
                <span className="min-w-0 flex-1 text-xs font-semibold text-stone-900">{blockLabel(block)}</span>
                {block.type === 'custom' && <StatusChip label={block.approved ? 'Approved' : 'Waiting for approval'} tone={block.approved ? 'green' : 'amber'} />}
                {block.hidden && <StatusChip label="Hidden" />}
                <span className="flex items-center gap-1">
                  <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => moveBlock(index, index - 1)} className="min-h-8 min-w-8 border border-stone-200 text-xs text-stone-600 hover:border-gold-400 disabled:opacity-30">↑</button>
                  <button type="button" aria-label="Move down" disabled={index === editing.blocks.length - 1} onClick={() => moveBlock(index, index + 1)} className="min-h-8 min-w-8 border border-stone-200 text-xs text-stone-600 hover:border-gold-400 disabled:opacity-30">↓</button>
                  {block.type !== 'rest' && <button type="button" onClick={() => patchBlock(index, { hidden: !block.hidden })} className="min-h-8 border border-stone-200 px-2 text-[10px] font-semibold text-stone-600 hover:border-gold-400">{block.hidden ? 'Show' : 'Hide'}</button>}
                  {block.type === 'custom' && <button type="button" aria-label="Remove these words" onClick={() => setEditing((current) => current ? { ...current, blocks: current.blocks.filter((_, i) => i !== index) } : current)} className="min-h-8 border border-stone-200 px-2 text-[10px] font-semibold text-stone-600 hover:border-red-300 hover:text-red-800">Remove</button>}
                </span>
              </div>
              {block.type === 'custom' && <div className="mt-3 space-y-2">
                <label htmlFor={`layout-block-heading-${index}`} className="sr-only">Custom block heading</label>
                <input id={`layout-block-heading-${index}`} value={block.heading || ''} onChange={(event) => patchBlock(index, { heading: event.target.value, approved: false })} className={inputClass} placeholder="Heading, for example: A note from Windsor Glow" />
                <label htmlFor={`layout-block-text-${index}`} className="sr-only">Custom block words</label>
                <textarea id={`layout-block-text-${index}`} value={block.text || ''} onChange={(event) => patchBlock(index, { text: event.target.value, approved: false })} rows={3} className={inputClass} placeholder="Your words. They stay invisible to members until the proposal for them is approved." />
              </div>}
            </div>)}
          </div>
          <button type="button" onClick={() => setEditing((current) => current ? { ...current, blocks: [...current.blocks, { type: 'custom', id: `new-${Date.now()}`, heading: '', text: '', approved: false }] } : current)} className={`${secondaryButton} mt-3`}><Icon name="type" />Add your own words</button>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-800">Preview · {sample}</p>
          <p className="mt-1 text-[11px] leading-4 text-stone-500">Exactly what the arrangement does to today's answer. Your own words appear here even before approval so you can judge them; members never see them early.</p>
          {previewAnswer && <div className="mt-3 border border-stone-200 bg-[#fbfaf7] p-4">
            <h3 className="text-sm font-semibold text-stone-950">{previewAnswer.title || 'No answer for this sample'}</h3>
            <p className="mt-1 border-l-2 border-gold-400 pl-2 text-xs leading-5 text-stone-700">{previewAnswer.summary}</p>
            {previewAnswer.sections?.filter((section) => section.items?.length).map((section, index) => <div key={`${section.title}-${index}`} className="mt-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">{section.title}</p><ul className="mt-1 space-y-1 border-l-2 border-stone-200 pl-3 text-xs leading-5 text-stone-600">{section.items.slice(0, 3).map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}{section.items.length > 3 && <li className="text-stone-600">…and {section.items.length - 3} more</li>}</ul></div>)}
          </div>}
        </div>
      </div>
    </section>}

    {loading ? <LoadingState /> : <section className="space-y-4">
      <h2 className="text-sm font-semibold text-stone-950">Saved layouts ({layouts.length})</h2>
      {layouts.map((layout) => {
        const rows = assignments.filter((row) => row.layout_id === layout.id);
        const draft = layout.blocks.some((block) => block.type === 'custom' && !block.approved);
        return <article key={layout.id} className="border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-stone-950">{layout.name}</h3>
              {draft && <StatusChip label="Has words waiting for approval" tone="amber" />}
              {rows.some((row) => row.enabled) ? <StatusChip label="On for members" tone="green" /> : <StatusChip label="Not shown to members" />}
            </div>
            <button type="button" onClick={() => setEditing({ id: layout.id, name: layout.name, blocks: layout.blocks.map((block) => ({ ...block })) })} className={secondaryButton}>Edit</button>
          </div>
          <p className="mt-1 text-[11px] text-stone-600">{layout.blocks.filter((block) => block.type === 'section' && !block.hidden).length} parts shown · {layout.blocks.filter((block) => block.hidden).length} hidden · {layout.blocks.filter((block) => block.type === 'custom').length} of your own blocks</p>

          <div className="mt-4 border-t border-stone-100 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Where it applies</p>
            <div className="mt-2 space-y-2">
              {rows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 border border-stone-200 px-3 py-2">
                <span className="text-xs text-stone-800"><strong>{row.target_kind === 'compound' ? compoundName(row.target_value) : `Category: ${row.target_value}`}</strong></span>
                <span className="flex items-center gap-2">
                  <button type="button" disabled={assignBusy} onClick={() => void assign(layout.id, row.target_kind, row.target_value, !row.enabled)}
                    className={`inline-flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold disabled:opacity-40 ${row.enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border-stone-300 bg-white text-stone-600 hover:border-gold-400'}`}>
                    {row.enabled ? 'On — members see it' : 'Off — normal answer'}
                  </button>
                  <button type="button" disabled={assignBusy} onClick={() => void removeAssignment(row)} className="min-h-9 border border-stone-200 px-2 text-[10px] font-semibold text-stone-500 hover:border-red-300 hover:text-red-800 disabled:opacity-40">Remove</button>
                </span>
              </div>)}
              {rows.length === 0 && <p className="text-xs text-stone-600">Applied nowhere yet.</p>}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
              <label htmlFor={`layout-target-kind-${layout.id}`} className="sr-only">Where this layout applies</label>
              <select id={`layout-target-kind-${layout.id}`} value={assignForm.layoutId === layout.id ? assignForm.kind : 'compound'} onChange={(event) => setAssignForm({ layoutId: layout.id, kind: event.target.value as 'compound' | 'category', value: '' })} className={`${inputClass} w-auto`}>
                <option value="compound">One compound</option>
                <option value="category">A whole category</option>
              </select>
              <span>
                <label htmlFor={`layout-target-value-${layout.id}`} className="sr-only">Compound or category name</label>
                <input id={`layout-target-value-${layout.id}`} list={assignForm.layoutId === layout.id && assignForm.kind === 'category' ? 'layout-categories' : 'layout-sample-compounds'} value={assignForm.layoutId === layout.id ? assignForm.value : ''} onChange={(event) => setAssignForm({ layoutId: layout.id, kind: assignForm.layoutId === layout.id ? assignForm.kind : 'compound', value: event.target.value })} className={inputClass} placeholder={assignForm.layoutId === layout.id && assignForm.kind === 'category' ? 'Start typing a category' : 'Start typing a compound name'} />
                <datalist id="layout-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
              </span>
              <button type="button" disabled={assignBusy || assignForm.layoutId !== layout.id || !assignForm.value.trim()} onClick={() => { void assign(layout.id, assignForm.kind, assignForm.value.trim(), false); setAssignForm({ layoutId: null, kind: 'compound', value: '' }); }} className={secondaryButton}>Add, switched off</button>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-stone-600">Every nickname and misspelling of a compound is covered automatically. New places start switched off so you can check the bench first.</p>
          </div>
        </article>;
      })}
      {layouts.length === 0 && !editing && <div className="border border-stone-200 bg-white"><Empty text={previewMode ? 'The live dashboard lists saved layouts here.' : 'No layouts yet. Press New layout to design the first one.'} /></div>}
    </section>}
  </div>;
}

/* Audit fix 5: Knowledge Sources, Stored Pages and Topics are three views of
   the same thing — what Pearl reads — so they live under one nav entry with
   tabs instead of three separate sections. */
function WhatPearlReads({ data, setData, previewMode, showNotice }: { data: DashboardData; setData: React.Dispatch<React.SetStateAction<DashboardData>>; previewMode: boolean; showNotice: (notice: Notice) => void }) {
  const [tab, setTab] = useState<'sources' | 'library' | 'topics'>('sources');
  const tabs = [
    { id: 'sources' as const, label: 'Sources', helper: 'Websites Pearl reads' },
    { id: 'library' as const, label: 'Stored pages', helper: 'Every page Pearl has read' },
    { id: 'topics' as const, label: 'Topics', helper: 'How research connects' },
  ];
  return <div className="space-y-6">
    <div aria-label="What Pearl reads" className="grid gap-px border border-stone-200 bg-stone-200 sm:grid-cols-3">
      {tabs.map((item) => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}
        className={`min-h-12 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500 ${tab === item.id ? 'bg-gold-50 text-stone-950' : 'bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-950'}`}>
        <span className="block text-xs font-semibold">{item.label}</span>
        <span className="mt-0.5 block text-[10px] text-stone-600">{item.helper}</span>
      </button>)}
    </div>
    {tab === 'sources' && <>
      <Sources data={data} setData={setData} previewMode={previewMode} showNotice={showNotice} />
      <ActiveSwitches previewMode={previewMode} showNotice={showNotice} />
    </>}
    {tab === 'library' && <SourceLibrary previewMode={previewMode} />}
    {tab === 'topics' && <Topics data={data} previewMode={previewMode} showNotice={showNotice} />}
  </div>;
}

interface CitationSwitchRow { id: number; compound_slug: string; action: string; url: string; label: string | null; enabled: boolean; created_at: string }
interface BoostSwitchRow { id: number; note: string | null; page_title: string | null; page_url: string; enabled: boolean; created_at: string }

const MOCK_SWITCH_CITATIONS: CitationSwitchRow[] = [
  { id: 1, compound_slug: 'bpc-157', action: 'remove', url: 'https://example.com/an-old-review', label: 'An old review', enabled: true, created_at: '2026-08-17T10:00:00Z' },
];
const MOCK_SWITCH_BOOSTS: BoostSwitchRow[] = [
  { id: 1, note: 'Clearest half-life summary', page_title: 'BPC-157 research dossier', page_url: 'https://www.pepcodex.com/bpc-157', enabled: true, created_at: '2026-08-17T11:00:00Z' },
];

/* Approving a citation correction or a passage boost writes a row the
   answer engine reads; this list is where an approved one can be switched
   off again (and back on) without deleting its record. The engine already
   uses only switched-on rows, so a flip changes the next answer by itself. */
function ActiveSwitches({ previewMode, showNotice }: { previewMode: boolean; showNotice: (notice: Notice) => void }) {
  const [citations, setCitations] = useState<CitationSwitchRow[]>(previewMode ? MOCK_SWITCH_CITATIONS : []);
  const [boosts, setBoosts] = useState<BoostSwitchRow[]>(previewMode ? MOCK_SWITCH_BOOSTS : []);
  const [loading, setLoading] = useState(!previewMode);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (previewMode) return;
    fetch('/api/admin/pearl/switches', { cache: 'no-store' })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Could not load the corrections and boosts.'); return payload; })
      .then((payload) => { setCitations(payload.citations || []); setBoosts(payload.boosts || []); })
      .catch((error: Error) => showNotice({ tone: 'error', text: error.message }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showNotice is a stable parent helper; loading once per mode is intended
  }, [previewMode]);

  async function toggle(type: 'citation' | 'boost', id: number, enabled: boolean) {
    setBusy(true);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/switches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id, enabled }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not change the switch.');
      }
      if (type === 'citation') setCitations((current) => current.map((row) => row.id === id ? { ...row, enabled } : row));
      else setBoosts((current) => current.map((row) => row.id === id ? { ...row, enabled } : row));
      showNotice({ tone: 'success', text: previewMode ? 'Preview switch shown on this screen only.' : enabled ? 'Switched on. The next answer uses it again.' : 'Switched off. The next answer no longer uses it.' });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not change the switch.' }); }
    finally { setBusy(false); }
  }

  const compoundName = (slug: string) => (COMPOUNDS as Array<{ slug: string; name: string }>).find((item) => item.slug === slug)?.name || slug;
  const switchButton = (enabled: boolean, onPress: () => void) => (
    <button type="button" disabled={busy} aria-pressed={enabled} onClick={onPress}
      className={`min-h-9 shrink-0 border px-3 text-xs font-semibold disabled:opacity-40 ${enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border-stone-300 bg-white text-stone-500 hover:border-gold-500 hover:text-stone-900'}`}>
      {enabled ? 'On' : 'Off'}
    </button>
  );

  if (!loading && citations.length === 0 && boosts.length === 0) return null;
  return <section className="border border-stone-200 bg-white" aria-label="Approved corrections and boosts">
    <div className="border-b border-stone-200 p-5">
      <h3 className="text-base font-semibold text-stone-950">Approved corrections and boosts</h3>
      <p className="mt-1 text-xs leading-5 text-stone-500">Everything here came through an approved proposal. Switching one off takes it out of the next answer; nothing is deleted, and it can be switched back on.</p>
    </div>
    {loading ? <div className="p-5 text-sm text-stone-600">Loading...</div> : <ul className="divide-y divide-stone-100">
      {citations.map((row) => <li key={`citation-${row.id}`} className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">{row.action === 'remove' ? 'Removes a source link from' : 'Adds a source link to'} {compoundName(row.compound_slug)} answers</p>
          <p className="mt-0.5 truncate text-xs text-stone-500">{row.label ? `${row.label} · ` : ''}{row.url}</p>
        </div>
        {switchButton(row.enabled, () => void toggle('citation', row.id, !row.enabled))}
      </li>)}
      {boosts.map((row) => <li key={`boost-${row.id}`} className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">Shows a passage from {row.page_title || 'a stored page'} first</p>
          <p className="mt-0.5 truncate text-xs text-stone-500">{row.note ? `${row.note} · ` : ''}{row.page_url}</p>
        </div>
        {switchButton(row.enabled, () => void toggle('boost', row.id, !row.enabled))}
      </li>)}
    </ul>}
  </section>;
}

function Sources({ data, setData, previewMode, showNotice }: { data: DashboardData; setData: React.Dispatch<React.SetStateAction<DashboardData>>; previewMode: boolean; showNotice: (notice: Notice) => void }) {
  const [form, setForm] = useState({ name: '', url: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  /* Step 9: paste an address, see what Pearl would read. No developer, no
     import, no change to any answer — a window before the review process. */
  async function runPreview(event: React.FormEvent) {
    event.preventDefault();
    if (previewMode) { showNotice({ tone: 'success', text: 'Preview only. On the live dashboard this reads the page.' }); return; }
    setPreviewLoading(true);
    setPreview(null);
    try {
      const response = await fetch('/api/admin/pearl/source-library/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: previewUrl }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The page could not be read.');
      setPreview(payload as SourcePreview);
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The page could not be read.' }); }
    finally { setPreviewLoading(false); }
  }
  const submitted = data.sources.filter((source) => source.sourceType !== 'library');
  const library = data.sources.filter((source) => source.sourceType === 'library');

  /* Improve buttons d8a and d8b: ask for a source to be re-read, or read
     more deeply. Both file a proposal; approving it creates the Pearl task
     that asks the team for the reviewed rebuild — no button touches the
     evidence directly. */
  const [sourceWorkFiling, setSourceWorkFiling] = useState('');
  async function proposeSourceWork(source: SourceRow, kind: 'source_refresh' | 'source_extract') {
    const refresh = kind === 'source_refresh';
    setSourceWorkFiling(`${source.id}-${kind}`);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/proposals', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            title: refresh ? `Re-read ${source.name}` : `Extract more from ${source.name}`,
            before: { 'Today': refresh ? 'Pearl answers from the pages as they were last read' : 'Pearl uses what the last read extracted' },
            after: { 'After approval': refresh ? 'A Pearl task asks the team to re-read the source and refresh its stored pages' : 'A Pearl task asks for a deeper read; anything new still arrives as proposals' },
            payload: { sourceWork: { sourceId: source.id, name: source.name, url: source.url } },
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not file the request.');
      }
      showNotice({ tone: 'success', text: previewMode ? 'Preview request shown on this screen only.' : `Request filed as a proposal. Approve it on the Proposals screen to create the task.` });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not file the request.' }); }
    finally { setSourceWorkFiling(''); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const checkedUrl = validatePearlSourceUrl(form.url);
    if (!checkedUrl.ok) {
      showNotice({ tone: 'error', text: checkedUrl.error || 'Enter a valid public https link.' });
      return;
    }
    const safeForm = { ...form, url: String(checkedUrl.url) };
    setSaving(true);
    try {
      let source: SourceRow;
      let task: TaskRow | null = null;
      if (previewMode) {
        const id = Date.now();
        source = { id, ...safeForm, status: 'accepted', task_id: `preview-${id}`, sourceType: 'submitted', submitted_by: 'Kieran', created_at: new Date().toISOString() };
        task = { id: `preview-${id}`, task_number: 185, title: `PEARL: Review research source: ${safeForm.name}`, description: safeForm.notes || `Review ${safeForm.url}`, status: 'todo', priority: 'medium', company: 'Windsor Glow', created_at: new Date().toISOString(), latest_agent_note: null };
      } else {
        const response = await fetch('/api/admin/pearl/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(safeForm) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not add this source.');
        source = { ...payload.source, sourceType: 'submitted' };
        task = payload.task ? { ...payload.task, description: form.notes, priority: 'medium', company: 'Windsor Glow', created_at: new Date().toISOString(), latest_agent_note: null } : null;
        if (payload.taskWarning) showNotice({ tone: 'warning', text: `Source saved, but ${String(payload.taskWarning).toLowerCase()}` });
      }
      setData((current) => ({ ...current, sources: [source, ...current.sources], tasks: task ? [task, ...current.tasks] : current.tasks, stats: { ...current.stats, sourcesWaiting: current.stats.sourcesWaiting + 1, openTasks: current.stats.openTasks + (task ? 1 : 0) } }));
      setForm({ name: '', url: '', notes: '' });
      showNotice({ tone: 'success', text: previewMode ? 'Preview source and review task added on this screen only.' : 'Source saved safely and a Pearl review task was created.' });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not add this source.' }); }
    finally { setSaving(false); }
  }

  return <div className="space-y-6"><SectionHeading eyebrow="Knowledge sources" title="The websites Pearl reads" text="A source added here is accepted. Nobody has to approve it. What is left is the reading work: a job is raised to read the whole site into the library, and until that job is done the source is listed here but is not yet in Pearl's answers." />
    <div className="grid gap-6 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]"><form onSubmit={submit} className="border border-stone-200 bg-white p-5"><h2 className="text-base font-semibold text-stone-950">Add a source</h2><div className="mt-5 space-y-4"><label className="block text-xs font-medium text-stone-700">Source name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="For example, a journal or database" /></label><label className="block text-xs font-medium text-stone-700">Secure website link<input type="text" inputMode="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="www.example.com" /></label><label className="block text-xs font-medium text-stone-700">Anything worth knowing about it?<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={4} className={`${inputClass} mt-1.5`} placeholder="Optional. For example, which part of the site matters most." /></label></div><div className="mt-4 space-y-2 border border-stone-200 bg-stone-50 p-3 text-[11px] leading-5 text-stone-600"><p className="flex gap-2"><Icon name="shield" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-800" />Added straight away. There is no approval step.</p><p className="flex gap-2"><Icon name="task" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-800" />A job is raised to read the whole site into PEARL.</p><p className="flex gap-2"><Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-800" />It goes in in full, not in part.</p></div><button type="submit" disabled={saving || !form.name.trim() || !form.url.trim()} className={`${goldButton} mt-5 w-full`}>{saving ? 'Adding...' : 'Add source'}</button></form>
      <section className="border border-stone-200 bg-white"><div className="border-b border-stone-200 p-5"><h2 className="text-base font-semibold text-stone-950">Sources added</h2><p className="mt-1 text-xs text-stone-500">Accepted on arrival. Each one is read into the library by its linked job.</p></div><div className="divide-y divide-stone-100">{submitted.map((source) => <SourceLine key={source.id} source={source} />)}{submitted.length === 0 && <Empty text="No sources have been added here yet." />}</div></section></div>
    <section className="border border-stone-200 bg-white">
      <div className="border-b border-stone-200 p-5"><h2 className="text-base font-semibold text-stone-950">See what Pearl would read</h2><p className="mt-1 text-xs leading-5 text-stone-500">Paste any public page address to see its title, sections and recognisable fields. Useful for checking a site reads cleanly before it is added. Nothing is imported and no answer changes.</p></div>
      <form onSubmit={runPreview} className="grid gap-2 p-5 sm:grid-cols-[1fr_auto]">
        <label htmlFor="source-preview-url" className="sr-only">Page address to preview</label>
        <input id="source-preview-url" type="text" inputMode="url" value={previewUrl} onChange={(event) => setPreviewUrl(event.target.value)} className={inputClass} placeholder="www.example.com" />
        <button type="submit" disabled={previewLoading || !previewUrl.trim()} className={secondaryButton}><Icon name="eye" />{previewLoading ? 'Reading...' : 'Read the page'}</button>
      </form>
      {preview && <div className="border-t border-stone-200 p-5">
        <div className="flex flex-wrap items-center gap-2"><StatusChip label={`${preview.sectionCount} sections`} /><StatusChip label={`${preview.textLength.toLocaleString('en-GB')} characters of text`} />{preview.structuredTypes.length > 0 && <StatusChip label={`Structured data: ${preview.structuredTypes.slice(0, 4).join(', ')}`} tone="green" />}</div>
        <h3 className="mt-2 text-sm font-semibold text-stone-950">{preview.title || preview.heading || preview.url}</h3>
        {Object.keys(preview.candidates).length > 0 && <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">{Object.entries(preview.candidates).map(([key, value]) => <div key={key}><dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-600">{key}</dt><dd className="mt-0.5 text-stone-700">{value}</dd></div>)}</dl>}
        {preview.sections.length > 0 && <div className="mt-4 space-y-2">{preview.sections.map((section, index) => <div key={index} className="border-l-2 border-stone-200 pl-3"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">{section.heading || 'Untitled section'}</p>{section.preview && <p className="mt-0.5 text-xs leading-5 text-stone-600">{section.preview}</p>}</div>)}</div>}
      </div>}
    </section>
    <section className="border border-stone-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 p-5"><div><h2 className="text-base font-semibold text-stone-950">Current reviewed library</h2><p className="mt-1 text-xs text-stone-500">{data.library.sources} supplied websites · {data.library.mappedPages.toLocaleString('en-GB')} pages read</p></div><StatusChip label="Source controlled" tone="green" /></div><div className="grid gap-px bg-stone-200 sm:grid-cols-2 xl:grid-cols-3">{library.map((source) => <SourceCard key={source.id} source={source} filing={sourceWorkFiling} onPropose={proposeSourceWork} />)}</div></section>
  </div>;
}

interface LibrarySummaryRow { source_id: string; name: string; pages: number; used: number; unreachable: number; last_read_at: string | null; last_changed_at: string | null }
interface LibraryPageRow { id: number; url: string; source_id: string; kind: string; status: string; title: string | null; used_in_evidence: boolean; latest_version: number; body_bytes: number | null; last_read_at: string | null; last_changed_at: string | null }
interface LibraryDetail {
  page: LibraryPageRow & { first_read_at?: string | null; publisher?: string | null; date_published?: string | null; date_modified?: string | null; error_message?: string | null };
  latest: { version: number; heading?: string | null; sections?: Array<{ heading?: string; level?: number; text?: string }>; full_text?: string; fetched_at?: string } | null;
  versions: Array<{ version: number; content_hash: string; fetched_at: string }>;
  passages: number;
}

const MOCK_LIBRARY_SUMMARY: LibrarySummaryRow[] = [
  { source_id: 'pepcodex', name: 'PepCodex', pages: 428, used: 102, unreachable: 0, last_read_at: '2026-08-17T23:20:00Z', last_changed_at: '2026-08-17T23:20:00Z' },
  { source_id: 'peptpedia', name: 'Peptpedia', pages: 96, used: 46, unreachable: 0, last_read_at: '2026-08-17T23:20:00Z', last_changed_at: null },
];
const MOCK_LIBRARY_PAGES: LibraryPageRow[] = [
  { id: 1, url: 'https://www.pepcodex.com/peptides/bpc-157', source_id: 'pepcodex', kind: 'page', status: 'ok', title: 'BPC-157: Evidence Dossier', used_in_evidence: true, latest_version: 1, body_bytes: 182_000, last_read_at: '2026-08-17T23:20:00Z', last_changed_at: '2026-08-17T23:20:00Z' },
  { id: 2, url: 'https://www.pepcodex.com/compare/bpc-157-vs-tb-500', source_id: 'pepcodex', kind: 'page', status: 'ok', title: 'BPC-157 vs TB-500', used_in_evidence: false, latest_version: 1, body_bytes: 121_000, last_read_at: '2026-08-17T23:20:00Z', last_changed_at: null },
];

/* Stage C step 6: the read-only window into the source library. Everything on
   this screen is a stored fact about what Pearl read; nothing here can write. */
function SourceLibrary({ previewMode }: { previewMode: boolean }) {
  const [summary, setSummary] = useState<LibrarySummaryRow[]>(previewMode ? MOCK_LIBRARY_SUMMARY : []);
  const [pages, setPages] = useState<LibraryPageRow[]>(previewMode ? MOCK_LIBRARY_PAGES : []);
  const [total, setTotal] = useState(previewMode ? MOCK_LIBRARY_PAGES.length : 0);
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(!previewMode);
  const [loadError, setLoadError] = useState('');
  const [detail, setDetail] = useState<LibraryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  /* Step 10, AI place 1: draft facts from this stored page. Files a proposal;
     nothing changes unless it is approved, and facts without a verbatim quote
     from the page are dropped server-side before anyone sees them. */
  async function draftFacts(pageId: number) {
    if (previewMode) { setAiNotice('Preview only. On the live dashboard this drafts facts with AI.'); return; }
    setAiBusy(true);
    setAiNotice('');
    try {
      const response = await fetch('/api/admin/pearl/ai/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The AI draft could not be completed.');
      setAiNotice(payload.proposalId
        ? `AI drafted ${payload.facts} quoted fact${payload.facts === 1 ? '' : 's'} (${payload.droppedFacts} dropped as not verbatim). Filed as a proposal — approve or reject it on the Proposals screen.`
        : payload.message || 'Nothing was drafted.');
    } catch (error) { setAiNotice(error instanceof Error ? error.message : 'The AI draft could not be completed.'); }
    finally { setAiBusy(false); }
  }

  async function load(nextSource = source, nextQuery = query, offset = 0, append = false) {
    if (previewMode) return;
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      if (nextSource) params.set('source', nextSource);
      if (nextQuery) params.set('q', nextQuery);
      if (offset) params.set('offset', String(offset));
      const response = await fetch(`/api/admin/pearl/source-library?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load the source library.');
      setSummary(payload.summary || []);
      setPages((current) => append ? [...current, ...(payload.pages || [])] : (payload.pages || []));
      setTotal(payload.total || 0);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load the source library.');
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void load('', '', 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount; the loader is a stable local helper, not a dependency
  }, []);

  async function open(page: LibraryPageRow) {
    if (previewMode) { setDetail(null); return; }
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/pearl/source-library/page?id=${page.id}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load this stored page.');
      setDetail(payload as LibraryDetail);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load this stored page.');
    } finally { setDetailLoading(false); }
  }

  const libraryTotals = summary.reduce((totals, row) => ({
    pages: totals.pages + row.pages,
    cited: totals.cited + row.used,
    unreachable: totals.unreachable + row.unreachable,
  }), { pages: 0, cited: 0, unreachable: 0 });
  const storedNotCited = Math.max(0, libraryTotals.pages - libraryTotals.cited - libraryTotals.unreachable);

  return <div className="space-y-6">
    <SectionHeading eyebrow="Stored pages" title="Every page Pearl has read, kept in full" text="This separates pages Pearl has stored from pages currently cited in structured answers. A stored page is available for review and future extraction; it is not automatically relevant to every question. This screen is read-only." />
    {loadError && <NoticeBar notice={{ tone: 'error', text: loadError }} />}
    {previewMode && <div className="border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-600">Preview shows sample rows. The live dashboard reads the real stored library.</div>}

    <section aria-label="Source coverage totals" className="grid gap-px border border-stone-200 bg-stone-200 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Stored pages', libraryTotals.pages, 'Full page text held by Pearl'],
        ['Cited now', libraryTotals.cited, 'Used in the current structured answer library'],
        ['Stored, not cited yet', storedNotCited, 'Kept in full but not currently used in an answer'],
        ['Unreachable', libraryTotals.unreachable, 'Recorded honestly; no page text could be fetched'],
      ].map(([label, value, helper]) => <div key={String(label)} className="bg-white p-4">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</span>
        <span className="mt-1 block text-2xl font-semibold tabular-nums text-stone-950">{Number(value).toLocaleString('en-GB')}</span>
        <span className="mt-1 block text-[10px] leading-4 text-stone-600">{helper}</span>
      </div>)}
    </section>

    <div className="border-l-2 border-gold-500 bg-gold-50/50 px-4 py-3 text-xs leading-5 text-stone-700">
      <strong>How to read this:</strong> “Cited now” means at least one current answer points to that exact page. “Stored, not cited yet” does not mean missing; it means the page has not supplied a reviewed fact used by the answer engine. Dosage figures show their own source beside the figure in the member answer.
    </div>

    <section aria-label="Stored pages per source" className="grid gap-px border border-stone-200 bg-stone-200 sm:grid-cols-2 xl:grid-cols-4">
      {summary.map((row) => <button type="button" key={row.source_id} onClick={() => { setSource(row.source_id === source ? '' : row.source_id); setDetail(null); void load(row.source_id === source ? '' : row.source_id, query, 0); }}
        className={`p-4 text-left hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500 ${source === row.source_id ? 'bg-gold-50' : 'bg-white'}`}>
        <span className="block text-xs font-semibold text-stone-900">{row.name}</span>
        <span className="mt-2 block text-2xl font-semibold tabular-nums text-stone-950">{row.pages.toLocaleString('en-GB')}</span>
        <span className="mt-1 block text-[10px] leading-4 text-stone-600">{row.used.toLocaleString('en-GB')} cited now · {Math.max(0, row.pages - row.used - row.unreachable).toLocaleString('en-GB')} stored, not cited yet{row.unreachable ? ` · ${row.unreachable} unreachable` : ''}</span>
        <span className="mt-1 block text-[10px] text-stone-600">Last read {formatDate(row.last_read_at || '', false)}</span>
      </button>)}
      {summary.length === 0 && !loading && <div className="bg-white sm:col-span-2 xl:col-span-4"><Empty text="Nothing is stored yet. The library fills when the evidence build runs." /></div>}
    </section>

    <form onSubmit={(event) => { event.preventDefault(); setDetail(null); void load(source, query, 0); }} className="border border-stone-200 bg-white p-4">
      <label htmlFor="library-search" className="sr-only">Search stored pages</label>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative"><Icon name="search" className="absolute left-3 top-3.5 h-4 w-4 text-stone-600" /><input id="library-search" value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pl-9`} placeholder="Search a page address or title" /></div>
        <button type="submit" className={secondaryButton}><Icon name="search" />Search</button>
      </div>
    </form>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-5 py-4"><h2 className="text-sm font-semibold text-stone-950">Stored pages{source ? ` · ${summary.find((row) => row.source_id === source)?.name || source}` : ''}</h2><p className="mt-1 text-[11px] text-stone-500">{total.toLocaleString('en-GB')} match · newest read first within each source</p></div>
        <div className="max-h-[36rem] divide-y divide-stone-100 overflow-y-auto">
          {loading && pages.length === 0 && <LoadingState />}
          {pages.map((page) => <button type="button" key={page.id} onClick={() => void open(page)} className={`block w-full px-5 py-3 text-left hover:bg-stone-50 ${detail?.page.id === page.id ? 'bg-gold-50' : ''}`}>
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip label={page.status === 'ok' ? (page.used_in_evidence ? 'Cited now' : 'Stored, not cited yet') : 'Unreachable'} tone={page.status !== 'ok' ? 'red' : page.used_in_evidence ? 'green' : 'stone'} />
              {page.latest_version > 1 && <StatusChip label={`${page.latest_version} versions`} tone="amber" />}
              {page.kind !== 'page' && <StatusChip label={page.kind} />}
            </span>
            <span className="mt-1.5 block truncate text-sm font-medium text-stone-900">{page.title || page.url}</span>
            <span className="mt-0.5 block truncate text-[11px] text-stone-600">{page.url}</span>
          </button>)}
          {pages.length === 0 && !loading && <Empty text="No stored page matches." />}
        </div>
        {pages.length < total && <div className="border-t border-stone-200 p-3 text-center"><button type="button" onClick={() => void load(source, query, pages.length, true)} className={secondaryButton}>Show more ({(total - pages.length).toLocaleString('en-GB')} left)</button></div>}
      </section>

      <section className="border border-stone-200 bg-white">
        {detailLoading && <LoadingState />}
        {!detailLoading && !detail && <Empty text={previewMode ? 'Open the live dashboard to read a stored page in full.' : 'Choose a page on the left to read exactly what Pearl stored.'} />}
        {!detailLoading && detail && <div>
          <div className="border-b border-stone-200 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip label={detail.page.status === 'ok' ? (detail.page.used_in_evidence ? 'Cited now' : 'Stored, not cited yet') : 'Unreachable'} tone={detail.page.status !== 'ok' ? 'red' : detail.page.used_in_evidence ? 'green' : 'stone'} />
              <StatusChip label={`Version ${detail.latest?.version ?? detail.page.latest_version}`} />
              {detail.passages > 0 && <StatusChip label={`${detail.passages} search passages`} tone="green" />}
            </div>
            <h2 className="mt-2 text-lg font-semibold text-stone-950">{detail.page.title || detail.page.url}</h2>
            <a href={detail.page.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[11px] text-gold-800 underline">{detail.page.url}</a>
            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
              <Reason label="First read" value={formatDate(detail.page.first_read_at || '')} />
              <Reason label="Last read" value={formatDate(detail.page.last_read_at || '')} />
              <Reason label="Changed since first read" value={detail.versions.length > 1 ? `Yes · ${detail.versions.length} versions kept` : 'No'} />
              <Reason label="Used in a current answer" value={detail.page.used_in_evidence ? 'Yes, at least one structured answer cites this exact page' : 'Not yet. The full page is stored, but no reviewed answer fact currently cites it'} />
              {detail.page.publisher && <Reason label="Publisher" value={detail.page.publisher} />}
              {detail.page.date_modified && <Reason label="Page dated" value={detail.page.date_modified} />}
              {detail.page.error_message && <Reason label="Last error" value={detail.page.error_message} />}
            </dl>
          </div>
          <div className="max-h-[30rem] overflow-y-auto p-5">
            {(detail.latest?.sections?.length || 0) > 0 ? detail.latest?.sections?.map((section, index) => <div key={index} className="mb-4">
              {section.heading && <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">{section.heading}</h3>}
              {section.text && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-700">{section.text}</p>}
            </div>) : <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">{detail.latest?.full_text || 'No text was stored for this page.'}</p>}
          </div>
          {detail.versions.length > 1 && <div className="border-t border-stone-200 p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Version history (nothing is overwritten)</p>
            <ul className="mt-2 space-y-1 text-xs text-stone-600">{detail.versions.map((version) => <li key={version.version}>Version {version.version} · read {formatDate(version.fetched_at)}</li>)}</ul>
          </div>}
          {detail.page.kind === 'page' && detail.page.status === 'ok' && <div className="border-t border-stone-200 p-5">
            <button type="button" disabled={aiBusy} onClick={() => void draftFacts(detail.page.id)} className={secondaryButton}><Icon name="test" />{aiBusy ? 'Drafting...' : 'Draft structured facts with AI'}</button>
            <p className="mt-2 text-[11px] leading-5 text-stone-600">Reads only this stored page. Every drafted fact must quote the page verbatim, and the draft is filed as a proposal — nothing changes unless it is approved.</p>
            {aiNotice && <p className="mt-2 border-l-2 border-gold-400 pl-3 text-xs leading-5 text-stone-700">{aiNotice}</p>}
          </div>}
        </div>}
      </section>
    </div>
  </div>;
}

interface ProposalRow {
  id: number;
  kind: string;
  title: string;
  summary: string | null;
  before_view: Record<string, unknown>;
  after_view: Record<string, unknown>;
  status: 'proposed' | 'approved' | 'rejected' | 'archived';
  created_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

const MOCK_PROPOSALS: ProposalRow[] = [
  { id: 2, kind: 'answer_correction', title: 'Teach Pearl that “cagri” means Cagrilintide', summary: 'Members shorten the name and Pearl asks them to clarify.', before_view: { 'Pearl today': 'Asks “did you mean…?” for cagri' }, after_view: { 'After approval': 'cagri resolves straight to Cagrilintide, with a saved test' }, status: 'proposed', created_by: 'Kieran', decided_by: null, decided_at: null, decision_note: null, created_at: '2026-08-17T21:00:00Z' },
  { id: 1, kind: 'terminology_rule', title: 'Add “semag” as an abbreviation of Semaglutide', summary: null, before_view: {}, after_view: {}, status: 'approved', created_by: 'Kieran', decided_by: 'Kieran', decided_at: '2026-08-16T10:00:00Z', decision_note: null, created_at: '2026-08-16T09:00:00Z' },
];

/* Stage D step 8: the approval desk. Every improve button files a proposal;
   this screen is where a person makes it real or turns it down. */
function Proposals({ data, setData, previewMode, showNotice }: { data: DashboardData; setData: React.Dispatch<React.SetStateAction<DashboardData>>; previewMode: boolean; showNotice: (notice: Notice) => void }) {
  const confirm = useConfirm();
  const [proposals, setProposals] = useState<ProposalRow[]>(previewMode ? MOCK_PROPOSALS : []);
  const [loading, setLoading] = useState(!previewMode);
  const [loadError, setLoadError] = useState('');
  const [deciding, setDeciding] = useState(false);
  /* Which long proposals have been opened out in full. */
  const [opened, setOpened] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (previewMode) return;
    fetch('/api/admin/pearl/proposals', { cache: 'no-store' })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Could not load the proposals.'); return payload; })
      .then((payload) => setProposals(payload.proposals || []))
      .catch((error: Error) => setLoadError(error.message))
      .finally(() => setLoading(false));
  }, [previewMode]);

  async function decide(row: ProposalRow, decision: 'approved' | 'rejected') {
    /* One click used to make it real with no way back, so ask first. */
    if (!(await confirm(decision === 'approved'
      ? {
          title: `Approve “${row.title}”?`,
          body: 'This makes the change real for members.',
          confirmLabel: 'Yes, approve it',
          cancelLabel: 'Not yet',
        }
      : {
          title: `Reject “${row.title}”?`,
          body: 'Pearl stays exactly as it is. You can file it again later if you change your mind.',
          confirmLabel: 'Yes, reject it',
          cancelLabel: 'Not yet',
        }))) return;
    setDeciding(true);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/proposals/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, decision }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not decide this proposal.');
        if (payload.taskWarning) showNotice({ tone: 'warning', text: `Approved, but the task could not be created: ${payload.taskWarning}` });
        else showNotice({ tone: 'success', text: decision === 'approved' ? (payload.executed?.length ? `Approved. Created ${payload.executed.join(' and ')}.` : 'Approved and recorded.') : 'Rejected. Pearl is unchanged.' });
      } else {
        showNotice({ tone: 'success', text: 'Preview decision shown on this screen only.' });
      }
      setProposals((current) => current.map((item) => item.id === row.id ? { ...item, status: decision, decided_at: new Date().toISOString() } : item));
      setData((current) => ({ ...current, stats: { ...current.stats, proposalsWaiting: Math.max(0, current.stats.proposalsWaiting - 1) } }));
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not decide this proposal.' }); }
    finally { setDeciding(false); }
  }

  /* Wording rows saved before the one-queue change still carry their own
     waiting status. They are decided HERE now, so the Proposals screen is
     the single place where anything waits for a person. */
  const legacyTerms = data.terminology.filter((row) => row.review_status === 'review');

  async function decideLegacy(row: TermRow, decision: 'approved' | 'rejected') {
    if (!(await confirm(decision === 'approved'
      ? {
          title: `Approve “${row.term}”?`,
          body: 'Pearl starts understanding it for members.',
          confirmLabel: 'Yes, approve it',
          cancelLabel: 'Not yet',
        }
      : {
          title: `Reject “${row.term}”?`,
          body: 'It stays out of Pearl.',
          confirmLabel: 'Yes, reject it',
          cancelLabel: 'Not yet',
        }))) return;
    setDeciding(true);
    try {
      if (!previewMode) await decideTermRowOnServer(row, decision);
      applyTermDecision(setData, row, decision);
      showNotice(previewMode
        ? { tone: 'success', text: 'Preview decision shown on this screen only.' }
        : decision === 'approved'
          ? { tone: 'success', text: `“${row.term}” is approved. Pearl now understands it.` }
          : { tone: 'success', text: `“${row.term}” was rejected and stays out of Pearl.` });
    } catch (error) {
      showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save the decision.' });
    } finally {
      setDeciding(false);
    }
  }

  /* Rejection is final for that proposal (no un-reject), but a change of
     mind should not mean rebuilding the suggestion by hand: this files a
     brand-new copy that waits for approval like everything else. */
  async function refile(row: ProposalRow) {
    setDeciding(true);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/proposals/refile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not file this again.');
        setProposals((current) => [payload.proposal as ProposalRow, ...current]);
      } else {
        setProposals((current) => [{ ...row, id: Math.max(0, ...current.map((item) => item.id)) + 1, status: 'proposed', decided_by: null, decided_at: null, decision_note: null, created_at: new Date().toISOString() }, ...current]);
      }
      setData((current) => ({ ...current, stats: { ...current.stats, proposalsWaiting: current.stats.proposalsWaiting + 1 } }));
      showNotice({ tone: 'success', text: previewMode ? 'Preview copy shown on this screen only.' : 'Filed again. The fresh copy is waiting for approval at the top of this screen.' });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not file this again.' }); }
    finally { setDeciding(false); }
  }

  /* Clearing tidies a finished proposal off this screen. Only something already
     approved or rejected can be cleared, and nothing is deleted: the decision
     stays in the Change History. Without it, the one proposal actually waiting
     for a person sat under a growing pile of finished work. */
  async function clear(row: ProposalRow) {
    if (!(await confirm({
      title: `Clear “${row.title}” off this screen?`,
      body: 'The decision stays in the Change History. Nothing about Pearl changes.',
      confirmLabel: 'Yes, clear it',
      cancelLabel: 'Leave it',
    }))) return;
    setDeciding(true);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/proposals/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not clear this proposal.');
      }
      setProposals((current) => current.filter((item) => item.id !== row.id));
      showNotice({ tone: 'success', text: previewMode ? 'Preview only. On the live dashboard this clears it away.' : 'Cleared. It is still in the Change History.' });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not clear this proposal.' }); }
    finally { setDeciding(false); }
  }

  async function clearAllDecided() {
    const count = proposals.filter((row) => row.status !== 'proposed').length;
    if (!(await confirm({
      title: `Clear all ${count} decided proposal${count === 1 ? '' : 's'} off this screen?`,
      body: 'Anything still waiting for a decision is left alone, and every decision stays in the Change History.',
      confirmLabel: 'Yes, clear them',
      cancelLabel: 'Leave them',
    }))) return;
    setDeciding(true);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/proposals/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allDecided: true }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not clear the decided proposals.');
      }
      setProposals((current) => current.filter((item) => item.status === 'proposed'));
      showNotice({ tone: 'success', text: previewMode ? 'Preview only. On the live dashboard this clears them away.' : `Cleared ${count} decided proposal${count === 1 ? '' : 's'}. They are still in the Change History.` });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not clear the decided proposals.' }); }
    finally { setDeciding(false); }
  }

  const waiting = proposals.filter((row) => row.status === 'proposed');
  const decided = proposals.filter((row) => row.status !== 'proposed');
  const viewEntries = (view: Record<string, unknown>) => Object.entries(view || {}).filter(([, value]) => value != null && value !== '');

  const card = (row: ProposalRow) => <article key={row.id} className="border border-stone-200 bg-white p-5">
    <div className="flex flex-wrap items-center gap-2">
      <StatusChip label={plainProposalKind(row.kind)} />
      <StatusChip label={row.status === 'proposed' ? 'Waiting for approval' : plainStatus(row.status)} tone={row.status === 'proposed' ? 'amber' : row.status === 'approved' ? 'green' : 'stone'} />
      <span className="text-[10px] text-stone-600">{row.created_by || 'Windsor Glow admin'} · {formatDate(row.created_at)}</span>
    </div>
    <h3 className="mt-2 text-base font-semibold text-stone-950">{row.title}</h3>
    {row.summary && <p className="mt-1 text-xs leading-5 text-stone-500">{row.summary}</p>}
    {(row.kind === 'ai_extraction' || row.kind === 'ai_summary') && <p className="mt-3 border-l-2 border-amber-400 pl-3 text-xs leading-5 text-amber-950">Check each statement against its quote. The system only checked that the quote is real, not that the statement reads it correctly.</p>}
    {(viewEntries(row.before_view).length > 0 || viewEntries(row.after_view).length > 0) && <div className="mt-4 grid gap-px border border-stone-200 bg-stone-200 sm:grid-cols-2">
      <div className="bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">Before</p>{viewEntries(row.before_view).map(([key, value]) => <p key={key} className="mt-2 text-xs leading-5 text-stone-600"><strong className="text-stone-800">{key}:</strong> {String(value)}</p>)}{viewEntries(row.before_view).length === 0 && <p className="mt-2 text-xs text-stone-600">Nothing recorded.</p>}</div>
      {/* An AI draft can carry dozens of facts, and printing them all made one
          proposal fill the screen and bury everything else. The first few show,
          the rest open on request, and the count says how many are hiding so
          nobody approves without knowing what they are agreeing to. */}
      <div className="bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-800">After approval</p>{(opened.has(row.id) ? viewEntries(row.after_view) : viewEntries(row.after_view).slice(0, 4)).map(([key, value]) => <p key={key} className="mt-2 text-xs leading-5 text-stone-600"><strong className="text-stone-800">{key}:</strong> {String(value)}</p>)}{viewEntries(row.after_view).length === 0 && <p className="mt-2 text-xs text-stone-600">Records the decision only.</p>}
        {viewEntries(row.after_view).length > 4 && <button type="button" aria-expanded={opened.has(row.id)} onClick={() => setOpened((current) => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-stone-700 underline hover:text-stone-900">
          {opened.has(row.id) ? 'Show fewer' : `Show all ${viewEntries(row.after_view).length}`}
        </button>}
      </div>
    </div>}
    {row.status === 'proposed' && <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={deciding} onClick={() => void decide(row, 'approved')} className="inline-flex min-h-11 items-center gap-2 border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40"><Icon name="check" />Approve and apply</button>
      <button type="button" disabled={deciding} onClick={() => void decide(row, 'rejected')} className="inline-flex min-h-11 items-center gap-2 border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-600 hover:border-red-300 hover:text-red-800 disabled:opacity-40"><Icon name="close" />Reject</button>
    </div>}
    {row.status !== 'proposed' && row.decided_at && <p className="mt-3 text-[11px] text-stone-600">{row.status === 'approved' ? 'Approved' : 'Rejected'} by {row.decided_by || 'Windsor Glow admin'} · {formatDate(row.decided_at)}{row.decision_note ? ` · ${row.decision_note}` : ''}</p>}
    {row.status !== 'proposed' && <div className="mt-3"><button type="button" disabled={deciding} onClick={() => void clear(row)} className="inline-flex min-h-10 items-center gap-1.5 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 hover:border-gold-500 hover:text-stone-900 disabled:opacity-40"><Icon name="check" className="h-3.5 w-3.5" />Clear this off the screen</button></div>}
    {row.status === 'rejected' && <div className="mt-3"><button type="button" disabled={deciding} onClick={() => void refile(row)} className="inline-flex min-h-9 items-center gap-2 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-600 hover:border-gold-500 hover:text-stone-900 disabled:opacity-40">File this again</button></div>}
  </article>;

  return <div className="space-y-6">
    <SectionHeading eyebrow="Proposals" title="Nothing changes Pearl until it is approved here" text="Every improve button files a proposal with its before and after. Approving one is what makes it real: an approved correction writes the wording rule and its saved test together. Rejecting one leaves Pearl exactly as it was." />
    {loadError && <NoticeBar notice={{ tone: 'error', text: loadError }} />}
    {loading ? <LoadingState /> : <>
      <section className="space-y-4" aria-label="Waiting proposals">
        <h2 className="text-sm font-semibold text-stone-950">Waiting for a decision ({waiting.length + legacyTerms.length})</h2>
        {legacyTerms.map((row) => <article key={`term-${row.id}`} className="border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label="Wording addition" />
            <StatusChip label="Waiting for approval" tone="amber" />
            <span className="text-[10px] text-stone-600">Added on the Terminology screen · {formatDate(row.updated_at)}</span>
          </div>
          <h3 className="mt-2 text-base font-semibold text-stone-950">Teach Pearl that “{row.term}” means {termTargetNames(row)}</h3>
          <p className="mt-1 text-xs leading-5 text-stone-500">{plainKind(row.kind)}. Approving switches this wording on for members; rejecting leaves Pearl exactly as it was.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={deciding} onClick={() => void decideLegacy(row, 'approved')} className="inline-flex min-h-11 items-center gap-2 border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40"><Icon name="check" />Approve and apply</button>
            <button type="button" disabled={deciding} onClick={() => void decideLegacy(row, 'rejected')} className="inline-flex min-h-11 items-center gap-2 border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-600 hover:border-red-300 hover:text-red-800 disabled:opacity-40"><Icon name="close" />Reject</button>
          </div>
        </article>)}
        {waiting.map(card)}
        {waiting.length === 0 && legacyTerms.length === 0 && <div className="border border-stone-200 bg-white"><Empty text="Nothing is waiting. Propose a fix from Test & Improve." /></div>}
      </section>
      {decided.length > 0 && <section className="space-y-4" aria-label="Decided proposals">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-stone-950">Already decided ({decided.length})</h2>
          <button type="button" disabled={deciding} onClick={() => void clearAllDecided()} className="inline-flex min-h-10 items-center gap-1.5 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 hover:border-gold-500 hover:text-stone-900 disabled:opacity-40">
            <Icon name="check" className="h-3.5 w-3.5" />Clear all {decided.length} off this screen
          </button>
        </div>
        <p className="text-[11px] leading-5 text-stone-600">Clearing tidies finished work off this screen so what is still waiting stays easy to see. Nothing is deleted: every decision stays in the Change History.</p>
        {decided.slice(0, 10).map(card)}
      </section>}
    </>}
  </div>;
}

function Topics({ data, previewMode, showNotice }: { data: DashboardData; previewMode: boolean; showNotice: (notice: Notice) => void }) {
  const [search, setSearch] = useState('');
  const visible = useMemo(() => { const needle = search.trim().toLowerCase(); return data.topics.filter((topic) => !needle || `${topic.name} ${topic.bodySystems.join(' ')} ${topic.conditions.join(' ')} ${topic.layTerms.join(' ')}`.toLowerCase().includes(needle)); }, [data.topics, search]);

  /* Improve button d8d: suggest a topic improvement — a missing everyday
     phrase, a missing topic, or a source that belongs with one. Topic
     vocabulary lives in the reviewed research build, so approval creates the
     Pearl task that asks the team; no button edits topics directly. */
  const [suggestion, setSuggestion] = useState({ topic: '', note: '' });
  const [suggesting, setSuggesting] = useState(false);
  async function suggestTopic(event: React.FormEvent) {
    event.preventDefault();
    if (!suggestion.topic.trim() || !suggestion.note.trim()) return;
    setSuggesting(true);
    try {
      if (!previewMode) {
        const response = await fetch('/api/admin/pearl/proposals', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'topic_link',
            title: `Topic improvement: ${suggestion.topic.trim()}`,
            summary: suggestion.note.trim(),
            before: { 'Today': 'The topic connects only the wording and sources in the reviewed build' },
            after: { 'After approval': 'A Pearl task asks the team to make this improvement through the reviewed build' },
            payload: { topic: { name: suggestion.topic.trim(), note: suggestion.note.trim() } },
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not file the suggestion.');
      }
      setSuggestion({ topic: '', note: '' });
      showNotice({ tone: 'success', text: previewMode ? 'Preview suggestion shown on this screen only.' : 'Suggestion filed as a proposal. Approve it on the Proposals screen to create the task.' });
    } catch (error) { showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not file the suggestion.' }); }
    finally { setSuggesting(false); }
  }

  return <div className="space-y-6"><SectionHeading eyebrow="Topics" title="See how Pearl connects everyday questions to research" text="Topics organise existing evidence. They do not add medical claims or replace the approved compound records. The list is read-only; use the suggestion form to ask for a change, which goes through a proposal like everything else." />
    <form onSubmit={suggestTopic} className="border border-stone-200 bg-white p-5">
      <h2 className="text-base font-semibold text-stone-950">Suggest a topic improvement</h2>
      <p className="mt-1 text-xs leading-5 text-stone-500">A missing everyday phrase, a topic Pearl should know, or a source that belongs with one. Approving the proposal creates a Pearl task for the team.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)_auto]">
        <label className="text-xs font-medium text-stone-700">Which topic?
          <input list="topic-names" value={suggestion.topic} onChange={(event) => setSuggestion({ ...suggestion, topic: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="For example, Sleep" />
          <datalist id="topic-names">{data.topics.map((topic) => <option key={topic.id} value={topic.name} />)}</datalist>
        </label>
        <label className="text-xs font-medium text-stone-700">What should change?
          <input value={suggestion.note} onChange={(event) => setSuggestion({ ...suggestion, note: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="For example: members say 'shut-eye' and Pearl finds nothing" />
        </label>
        <button type="submit" disabled={suggesting || !suggestion.topic.trim() || !suggestion.note.trim()} className={`${goldButton} self-end`}>{suggesting ? 'Filing...' : 'File the suggestion'}</button>
      </div>
    </form><div className="border border-stone-200 bg-white p-4"><label htmlFor="topic-search" className="sr-only">Search topics</label><div className="relative"><Icon name="search" className="absolute left-3 top-3.5 h-4 w-4 text-stone-600" /><input id="topic-search" value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClass} pl-9`} placeholder="Search a topic, body system or everyday phrase" /></div></div><section className="grid gap-px border border-stone-200 bg-stone-200 md:grid-cols-2 xl:grid-cols-3">{visible.map((topic) => <article key={topic.id} className="bg-white p-5"><div className="flex items-start justify-between gap-3"><h2 className="text-base font-semibold text-stone-950">{topic.name}</h2><span className="font-serif text-xl text-gold-700">{String(data.topics.indexOf(topic) + 1).padStart(2, '0')}</span></div><p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">Body systems</p><p className="mt-1 text-xs capitalize leading-5 text-stone-600">{topic.bodySystems.join(', ') || 'Not listed'}</p><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">Everyday wording</p><div className="mt-2 flex flex-wrap gap-1.5">{topic.layTerms.slice(0, 4).map((term) => <span key={term} className="border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] text-stone-600">{term}</span>)}</div></article>)}{visible.length === 0 && <div className="bg-white md:col-span-2 xl:col-span-3"><Empty text="No topic matches that search." /></div>}</section></div>;
}

function Tasks({ data, setData, previewMode, showNotice }: { data: DashboardData; setData: React.Dispatch<React.SetStateAction<DashboardData>>; previewMode: boolean; showNotice: (notice: Notice) => void }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' });
  const [saving, setSaving] = useState(false);
  /* Kieran, 18 Aug 2026: a Pearl task could not carry a photo, video or screen
     recording, so a problem that is easiest to SHOW had to be re-filed on the
     ordinary task board just to attach the clip. Same upload path, same limits
     and same storage as the ordinary board - nothing bespoke here. */
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  function chooseFiles(list: FileList | null) {
    if (!list?.length) return;
    // Copy the list NOW. The input is cleared straight after this call so the
    // same file can be picked twice, and a FileList read later inside a React
    // updater would already be empty.
    const chosen = Array.from(list);
    setFiles((current) => [...current, ...chosen]);
  }
  function dropFile(index: number) {
    setFiles((current) => current.filter((_, position) => position !== index));
  }

  async function attachAll(taskId: string) {
    const failures: string[] = [];
    let attached = 0;
    // Per-file isolation, matching the task drawer: one bad file must not throw
    // away the others, and the task itself is already saved by this point.
    for (const file of files) {
      try {
        setProgress({ name: file.name, pct: 0 });
        const up = await uploadTaskMedia(file, (pct) => setProgress({ name: file.name, pct }));
        const response = await fetch(`/api/admin/tasks/task/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add_attachment', url: up.url, filename: up.filename, size: up.size, contentType: up.contentType }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Could not save ${file.name} to the task.`);
        }
        attached += 1;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : `Could not upload ${file.name}.`);
      }
    }
    setProgress(null);
    return { attached, failures };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      let task: TaskRow;
      if (previewMode) {
        task = { id: `preview-${Date.now()}`, task_number: 185, title: `PEARL: ${form.title}`, description: form.description, status: 'todo', priority: form.priority, company: 'Windsor Glow', created_at: new Date().toISOString(), latest_agent_note: null };
      } else {
        const response = await fetch('/api/admin/pearl/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not create the task.');
        task = { ...payload.task, description: form.description, priority: form.priority, company: 'Windsor Glow', created_at: new Date().toISOString(), latest_agent_note: null };
      }

      // The task exists from here on. Files are reported separately and
      // honestly, so a failed upload never reads as a failed task.
      let fileNote = '';
      if (files.length && previewMode) {
        fileNote = ` ${files.length} ${files.length === 1 ? 'file was' : 'files were'} not uploaded, because this is the preview screen.`;
      } else if (files.length) {
        const { attached, failures } = await attachAll(task.id);
        if (attached) fileNote = ` ${attached} ${attached === 1 ? 'file' : 'files'} attached.`;
        if (failures.length) fileNote += ` ${failures.length} did not upload: ${failures.join(' ')}`;
      }

      setData((current) => ({ ...current, tasks: [task, ...current.tasks], stats: { ...current.stats, openTasks: current.stats.openTasks + 1 } }));
      setForm({ title: '', description: '', priority: 'medium' });
      setFiles([]);
      if (fileInput.current) fileInput.current.value = '';
      showNotice({
        tone: fileNote.includes('did not upload') ? 'error' : 'success',
        text: `${previewMode ? 'Preview task added on this screen only.' : 'Pearl task added to the shared task list.'}${fileNote}`,
      });
    } catch (error) {
      setProgress(null);
      showNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not create the task.' });
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-6"><SectionHeading eyebrow="Pearl tasks" title="Send larger improvements to the existing task team" text="Tasks keep the question, correction and source context together. They appear in the same task list the team already uses." /><div className="grid gap-6 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]"><form onSubmit={submit} className="border border-stone-200 bg-white p-5"><h2 className="text-base font-semibold text-stone-950">Create Pearl task</h2><div className="mt-5 space-y-4"><label className="block text-xs font-medium text-stone-700">What needs doing?<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="Review the glutathione concept" /></label><label className="block text-xs font-medium text-stone-700">Context for the task agent<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={6} className={`${inputClass} mt-1.5`} placeholder="Include the question, what went wrong, the expected result and any source link." /></label><label className="block text-xs font-medium text-stone-700">Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className={`${inputClass} mt-1.5`}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
    <div className="border-t border-stone-200 pt-4">
      <p className="text-xs font-medium text-stone-700">Photos, videos and screen recordings</p>
      <p className="mt-1 text-[11px] leading-5 text-stone-500">Showing the problem is usually quicker than describing it. Photos up to {fmtBytes(MAX_IMAGE_BYTES)}, videos up to {fmtBytes(MAX_VIDEO_BYTES)}.</p>
      <input ref={fileInput} id="pearl-task-files" type="file" accept="image/*,video/mp4,video/quicktime,video/webm,video/*" multiple className="hidden" onChange={(event) => { chooseFiles(event.target.files); event.target.value = ''; }} />
      <button type="button" onClick={() => fileInput.current?.click()} className="mt-3 inline-flex min-h-10 items-center gap-2 border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50">
        Add a photo or video
      </button>
      {files.length > 0 && <ul className="mt-3 space-y-1.5">{files.map((file, index) => <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 bg-stone-50 px-3 py-2 text-[11px] text-stone-700">
        <span className="min-w-0 truncate">{file.name} <span className="text-stone-500">{fmtBytes(file.size)}</span></span>
        <button type="button" onClick={() => dropFile(index)} className="shrink-0 font-semibold text-stone-600 underline hover:text-stone-900">Remove</button>
      </li>)}</ul>}
      {progress && <p className="mt-3 text-[11px] text-stone-600" role="status">Uploading {progress.name}: {progress.pct}%</p>}
    </div></div><button type="submit" disabled={saving || !form.title.trim()} className={`${goldButton} mt-5 w-full`}>{saving ? (progress ? 'Uploading...' : 'Creating...') : `Create Pearl task${files.length ? ` with ${files.length} ${files.length === 1 ? 'file' : 'files'}` : ''}`}</button></form><section className="border border-stone-200 bg-white"><div className="flex items-center justify-between border-b border-stone-200 p-5"><div><h2 className="text-base font-semibold text-stone-950">Pearl work queue</h2><p className="mt-1 text-xs text-stone-500">{data.tasks.filter((task) => task.status !== 'done').length} open</p></div><Link href="/admin/tasks" className="text-xs font-semibold text-gold-800 underline">All tasks</Link></div><div className="divide-y divide-stone-100">{data.tasks.map((task) => <Link key={task.id} href={`/admin/tasks?task=${task.id}`} className="block p-4 hover:bg-stone-50"><div className="flex flex-wrap items-center gap-2"><StatusChip label={plainStatus(task.status)} tone={task.status === 'ready_for_review' ? 'green' : task.priority === 'high' || task.priority === 'urgent' ? 'amber' : 'stone'} /><span className="text-[10px] text-stone-600">{task.task_number ? `Task ${task.task_number}` : 'Pearl task'}</span></div><h3 className="mt-2 text-sm font-semibold text-stone-900">{task.title.replace(/^PEARL:\s*/i, '')}</h3><p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{task.latest_agent_note || task.description || 'No extra context saved.'}</p></Link>)}{data.tasks.length === 0 && <Empty text="No Pearl tasks yet." />}</div></section></div></div>;
}

function History({ data, move }: { data: DashboardData; move: (section: Section) => void }) {
  return <div className="space-y-6"><div><button type="button" onClick={() => move('overview')} className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-stone-600 underline hover:text-stone-900"><Icon name="arrow" className="h-3.5 w-3.5 rotate-180" />Back to Overview</button><SectionHeading eyebrow="Change history" title="A permanent record of Pearl improvements" text="Every review, source, task and wording change is kept with the person and time. Reversals create a new entry rather than erasing the past." /></div><section className="border border-stone-200 bg-white"><div className="grid grid-cols-[2rem_1fr] gap-x-3 p-5 sm:grid-cols-[3rem_minmax(0,1fr)_11rem]">{data.history.map((row, index) => <div key={row.id} className="contents"><div className="relative flex justify-center"><span className="relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-gold-700 ring-1 ring-gold-300" />{index < data.history.length - 1 && <span className="absolute bottom-0 top-3 w-px bg-stone-200" />}</div><div className="pb-7"><div className="flex flex-wrap items-center gap-2"><StatusChip label={plainChange(row.change_type)} /><span className="text-[10px] uppercase tracking-[0.12em] text-stone-600">{plainEntity(row.entity_type)}</span></div><p className="mt-2 text-sm font-medium text-stone-900">{row.summary}</p><p className="mt-1 text-[11px] text-stone-600">{row.actor || 'Windsor Glow admin'}</p></div><time className="hidden pt-1 text-right text-[11px] text-stone-600 sm:block">{formatDate(row.created_at)}</time></div>)}{data.history.length === 0 && <div className="col-span-full"><Empty text="No Pearl improvements have been recorded yet." /></div>}</div></section></div>;
}

function SourceLine({ source }: { source: SourceRow }) {
  const done = source.inLibrary || source.status === 'added' || source.status === 'ready';
  return <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-stone-900">{source.name}</h3><StatusChip label={plainSourceStatus(source.status)} tone={source.status === 'failed' ? 'red' : done ? 'green' : 'amber'} /></div><a href={source.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[11px] text-gold-800 underline">{source.url}</a>{source.inLibrary && <p className="mt-2 text-xs leading-5 text-stone-600">{source.mappedPages ? `Read in. ${source.mappedPages.toLocaleString('en-GB')} pages are in Pearl.` : 'Read in and being used in answers.'}</p>}{source.notes && <p className="mt-2 text-xs leading-5 text-stone-500">{source.notes}</p>}</div>{source.inLibrary ? <span className="text-[11px] font-semibold text-emerald-700">Nothing to do</span> : source.task_id ? <Link href={`/admin/tasks?task=${source.task_id}`} className="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-stone-700 underline">Open task <Icon name="arrow" /></Link> : <span className="text-[10px] text-amber-800">Task needed</span>}</div>;
}
function SourceCard({ source, filing, onPropose }: { source: SourceRow; filing: string; onPropose: (source: SourceRow, kind: 'source_refresh' | 'source_extract') => Promise<void> }) {
  return <article className="bg-white p-4"><div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold text-stone-900">{source.name}</h3><Icon name="check" className="h-4 w-4 shrink-0 text-emerald-600" /></div><p className="mt-2 line-clamp-2 text-[11px] leading-5 text-stone-500">{source.notes}</p><div className="mt-4 flex items-end justify-between gap-2"><span className="text-[10px] uppercase tracking-[0.1em] text-stone-600">{source.mappedPages ? `${source.mappedPages.toLocaleString('en-GB')} pages read` : plainSourceStatus(source.status)}</span><a href={source.url} target="_blank" rel="noreferrer" aria-label={`Open ${source.name}`} className="text-gold-800"><Icon name="external" /></a></div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-stone-100 pt-2">
      <button type="button" disabled={filing === `${source.id}-source_refresh`} onClick={() => void onPropose(source, 'source_refresh')} className="min-h-9 text-[11px] font-semibold text-stone-500 underline hover:text-stone-800 disabled:opacity-40">{filing === `${source.id}-source_refresh` ? 'Filing...' : 'Ask for a re-read'}</button>
      <button type="button" disabled={filing === `${source.id}-source_extract`} onClick={() => void onPropose(source, 'source_extract')} className="min-h-9 text-[11px] font-semibold text-stone-500 underline hover:text-stone-800 disabled:opacity-40">{filing === `${source.id}-source_extract` ? 'Filing...' : 'Ask for a deeper read'}</button>
    </div>
  </article>;
}
function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) { return <header><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-800">{eyebrow}</p><h2 className="mt-1 text-2xl font-semibold text-stone-950 text-balance">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{text}</p></header>; }
function SmallStat({ label, value }: { label: string; value: number }) { return <div className="bg-stone-50 p-3 text-center"><strong className="block text-lg font-semibold tabular-nums text-stone-900">{value}</strong><span className="mt-1 block text-[9px] uppercase tracking-[0.1em] text-stone-600">{label}</span></div>; }
function Reason({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600">{label}</dt><dd className="mt-1 text-sm capitalize leading-5 text-stone-800">{value}</dd></div>; }
function Empty({ text }: { text: string }) { return <div className="p-8 text-center text-sm text-stone-600">{text}</div>; }
function LoadingState() { return <div className="border border-stone-200 bg-white p-12 text-center"><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-gold-700 motion-reduce:animate-none" /><p className="mt-4 text-sm text-stone-500">Loading Pearl controls...</p></div>; }
function NoticeBar({ notice, onDismiss }: { notice: NonNullable<Notice>; onDismiss?: () => void }) { const style = notice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : notice.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-900'; return <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`mb-5 flex min-h-11 items-center gap-2 border px-4 py-3 text-sm ${style}`}><Icon name={notice.tone === 'success' ? 'check' : notice.tone === 'warning' ? 'flag' : 'close'} /><span className="min-w-0 flex-1">{notice.text}</span>{onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss this message" className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center text-current opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"><Icon name="close" className="h-3.5 w-3.5" /></button>}</div>; }
function StatusChip({ label, tone = 'stone' }: { label: string; tone?: 'stone' | 'green' | 'amber' | 'red' }) { const style = tone === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-900' : tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-stone-200 bg-stone-50 text-stone-600'; return <span className={`inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${style}`}>{label}</span>; }
function ReviewChip({ status }: { status: string }) { return <StatusChip label={status === 'good' ? 'Good answer' : status === 'needs_improvement' ? 'Needs improvement' : 'Not reviewed'} tone={status === 'good' ? 'green' : status === 'needs_improvement' ? 'amber' : 'stone'} />; }

function plainKind(value: string) { return ({ alias: 'Alternative name', abbreviation: 'Abbreviation', misspelling: 'Misspelling', category: 'Category or group', ambiguous: 'Needs clarification', blend: 'Blend' } as Record<string, string>)[value] || value.replace(/_/g, ' '); }
function plainStatus(value: string) { return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function plainSourceStatus(value: string) { return ({ 'baseline-imported': 'Original reference library', added: 'In the library', accepted: 'Added, waiting to be read in', waiting: 'Added, waiting to be read in', processing: 'Being read', needs_review: 'Needs a look', ready: 'Reviewed and ready', update_available: 'Update available', failed: 'Could not be read', rejected: 'Rejected', disabled: 'Switched off' } as Record<string, string>)[value] || plainStatus(value); }
function plainEntity(value: string) { return ({ test_case: 'Saved test', terminology: 'Wording', question: 'Member question', proposal: 'Proposal', source: 'Source', page: 'Stored page', layout: 'Answer layout' } as Record<string, string>)[value] || plainStatus(value); }
function plainAnswerKind(value?: string) { return ({ dose: 'Source ranges', evidence: 'Research evidence', safety: 'Safety notes', mechanism: 'How it works', overview: 'Overview', comparison: 'Comparison', topic: 'Research category', clarify: 'Asked for clarity', 'no-match': 'Could not understand', boundary: 'Declined, out of bounds', emergency: 'Emergency' } as Record<string, string>)[value || ''] || value || 'Answer'; }
function plainProposalKind(value: string) { return ({ terminology_rule: 'Wording rule', answer_correction: 'Answer correction', citation_correction: 'Citation correction', ai_extraction: 'AI drafted facts', ai_summary: 'AI summary', source_setting: 'Source setting', source_refresh: 'Re-read request', source_extract: 'Deeper read request', passage_boost: 'Passage importance', topic_link: 'Topic improvement', layout_text: 'Custom words in a layout' } as Record<string, string>)[value] || plainStatus(value); }
function plainChange(value: string) { return ({ test_case_created: 'Saved test added', test_cases_seeded: 'Starter tests added', test_cases_run: 'Saved tests run', terminology_created: 'Wording added', terminology_updated: 'Wording updated', proposal_created: 'Proposal filed', proposal_approved: 'Proposal approved', proposal_rejected: 'Proposal rejected', source_submitted: 'Source submitted', answer_approved: 'Answer marked good', answer_needs_improvement: 'Answer flagged to improve', layout_saved: 'Layout saved', layout_switched_on: 'Layout switched ON', layout_switched_off: 'Layout switched off', layout_assignment_removed: 'Layout assignment removed' } as Record<string, string>)[value] || value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function plainMethod(value?: string) { if (!value) return 'No method saved'; return ({ 'exact-alias': 'Exact approved wording', exact: 'Exact approved name', fuzzy: 'Conservative close match', context: 'Previous question context' } as Record<string, string>)[value] || value.replace(/-/g, ' '); }
function compoundName(slug: string | null) { if (!slug) return 'No compound selected'; return (COMPOUNDS as Array<{ slug: string; name: string }>).find((compound) => compound.slug === slug)?.name || slug; }
function termTargetNames(row: TermRow) { return Array.from(new Set([row.canonical_slug, ...(row.ambiguous_with || [])].filter((slug): slug is string => Boolean(slug)))).map(compoundName).join(', ') || 'No compound selected'; }
function formatDate(value: string, time = true) { const date = new Date(value); if (Number.isNaN(date.getTime())) return value || 'Not recorded'; return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(date); }

type IconName = 'pulse' | 'test' | 'type' | 'book' | 'map' | 'task' | 'history' | 'eye' | 'arrow' | 'external' | 'search' | 'check' | 'flag' | 'shield' | 'close' | 'archive' | 'scale';
function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    archive: <><path d="M3 7h18v4H3zM5 11v9h14v-9" /><path d="M10 15h4" /></>,
    scale: <><path d="M12 3v18M8 21h8" /><path d="m7 7-3 6a3 3 0 0 0 6 0zM17 7l-3 6a3 3 0 0 0 6 0z" /><path d="M4 7h16" /></>,
    test: <><path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 17l-5-9V3" /><path d="M8 14h8" /></>,
    type: <><path d="M4 7V4h16v3M9 20h6M12 4v16" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></>,
    map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3z" /><path d="M8 3v15M16 6v15" /></>,
    task: <><path d="M9 11l2 2 4-4" /><path d="M6 3h12a2 2 0 0 1 2 2v16H4V5a2 2 0 0 1 2-2z" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    flag: <><path d="M5 21V4M5 5h11l-2 4 2 4H5" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>;
}
