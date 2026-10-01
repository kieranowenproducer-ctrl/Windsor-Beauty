import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { listResearchQuestionAuditPage } from '@/lib/db/researchQuestions';
import { listApprovedPearlTerminology, listPearlTerminology } from '@/lib/db/pearlTerminology';
import { countWaitingPearlProposals, listApprovedPearlCitationRecords, listApprovedPearlLayoutRecords, listPearlHistory, listPearlSources, listPearlTestCases, withPearlSchema } from '@/lib/db/pearlAdmin';
import { listPearlTasks } from '@/lib/pearl/taskBridge';
import {
  COMPOUNDS,
  CURATED_TERMINOLOGY,
  PEARL_BLEND_MAPPINGS,
  RESEARCH_AUDIT,
  RESEARCH_SOURCES,
} from '@/lib/concierge/research/chat-engine.mjs';
import { CONCEPT_METADATA } from '@/lib/concierge/research/research-intelligence.mjs';
import { PRODUCTS } from '@/data/products';
import { pearlRecognitionCoverage } from '@/lib/concierge/research/terminology.mjs';

export const dynamic = 'force-dynamic';

function humanise(value: string) {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** example.com, www dropped, so two spellings of one site match each other. */
function hostKey(url: string): string {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export async function GET() {
  const audit = RESEARCH_AUDIT as Record<string, unknown>;
  const auditSources = new Map(
    (Array.isArray(audit.sources) ? audit.sources : []).map((item: Record<string, unknown>) => [String(item.sourceId), item]),
  );
  const approvedSources = (RESEARCH_SOURCES as Array<Record<string, unknown>>).map((source) => {
    const detail = auditSources.get(String(source.id)) || {};
    return {
      id: `library-${String(source.id)}`,
      name: String(source.name || source.id),
      url: String(source.url || ''),
      notes: String(source.role || ''),
      status: String(source.status || detail.accessStatus || 'added'),
      mappedPages: Number(detail.mappedPages || 0),
      submitted_by: 'Reviewed library',
      created_at: String(audit.generatedAt || ''),
      sourceType: 'library',
    };
  });

  const topics = (CONCEPT_METADATA as Array<Record<string, unknown>>).map((concept) => ({
    id: String(concept.id),
    name: humanise(String(concept.id)),
    bodySystems: Array.isArray(concept.bodySystems) ? concept.bodySystems : [],
    conditions: Array.isArray(concept.conditions) ? concept.conditions : [],
    layTerms: Array.isArray(concept.layTerms) ? concept.layTerms : [],
  }));

  let questions = null;
  let terminology: unknown[] = [];
  /* The approved wording AND approved citation corrections in the exact
     runtime shape the member desk loads, so the Test & Improve bench answers
     with the same Pearl a member gets. */
  let terminologyRuntime: unknown[] = [];
  let submittedSources: unknown[] = [];
  let history: unknown[] = [];
  let testCases: unknown[] = [];
  let proposalsWaiting = 0;
  if (isDbConfigured()) {
    // 30 recent questions, not 100: the panel shows six and opens the rest
    // through the full audit page, so shipping 100 full answers was pure weight.
    let approvedTerms: unknown[] = [];
    let citationRecords: unknown[] = [];
    let layoutRecords: unknown[] = [];
    [questions, terminology, approvedTerms, citationRecords, layoutRecords, submittedSources, history, testCases, proposalsWaiting] = await withPearlSchema(() => Promise.all([
        listResearchQuestionAuditPage({ pageSize: 30 }),
        listPearlTerminology(),
        listApprovedPearlTerminology(),
        listApprovedPearlCitationRecords(),
        listApprovedPearlLayoutRecords(),
        listPearlSources(),
        listPearlHistory(),
        listPearlTestCases(),
        countWaitingPearlProposals(),
      ]));
    terminologyRuntime = [...approvedTerms, ...citationRecords, ...layoutRecords];
  }

  const tasks = await listPearlTasks().catch(() => []);
  const questionStats = questions?.stats || {
    total: 0, members: 0, today: 0, week: 0, unanswered: 0, termsReview: 0, errors: 0, attention: 0,
  };
  const terminologyRows = terminology as Array<{ review_status?: string; enabled?: boolean }>;
  const historyRows = history as Array<{ change_type?: string }>;
  const testRows = testCases as Array<{ status?: string }>;
  const catalogueKeywords = new Set(
    PRODUCTS.flatMap((product) => product.keywords || []).map((keyword) => keyword.trim().toLowerCase()),
  );
  const recognitionCoverage = pearlRecognitionCoverage(COMPOUNDS as Array<{ name: string }>);

  /* A submitted source and the built library were two lists that never spoke to
     each other. Nothing in the app ever moved a submitted row on, so three
     sources that had been read into the library weeks earlier still sat on this
     screen saying they were waiting. The row's stored status is therefore not
     the last word: if the site is in the library, it is in the library, and the
     screen now works that out every time it loads rather than depending on
     somebody having remembered to tick it off. */
  const libraryHosts = new Map(
    (RESEARCH_SOURCES as Array<Record<string, unknown>>)
      .map((source) => [hostKey(String(source.url || '')), source] as const)
      .filter(([host]) => host),
  );
  const submittedWithLibraryState = (submittedSources as Array<Record<string, unknown>>).map((row) => {
    const match = libraryHosts.get(hostKey(String(row.url || '')));
    if (!match) return row;
    const detail = auditSources.get(String(match.id)) || {};
    return {
      ...row,
      status: 'added',
      inLibrary: true,
      mappedPages: Number(detail.mappedPages || 0),
    };
  });

  return NextResponse.json({
    library: {
      compounds: (COMPOUNDS as unknown[]).length,
      profiles: Number(audit.uniqueCompounds || 0),
      mappedPages: Number(audit.mappedPages || 0),
      sources: (RESEARCH_SOURCES as unknown[]).length,
      topics: topics.length,
      blends: (PEARL_BLEND_MAPPINGS as unknown[]).length,
      generatedAt: String(audit.generatedAt || ''),
    },
    stats: {
      ...questionStats,
      terminologyBuiltIn: (CURATED_TERMINOLOGY as unknown[]).length + (PEARL_BLEND_MAPPINGS as unknown[]).length,
      terminologyActive: terminologyRows.filter((row) => row.review_status === 'approved' && row.enabled).length,
      terminologyWaiting: terminologyRows.filter((row) => row.review_status === 'review').length,
      openTasks: tasks.filter((task) => task.status !== 'done').length,
      // Sources that are accepted but not yet read into the library. Anything
      // already in the library is not waiting for anything.
      sourcesWaiting: submittedWithLibraryState.filter((source) => !source.inLibrary && source.status !== 'rejected' && source.status !== 'disabled').length,
      proposalsWaiting,
    },
    questions: questions?.questions || [],
    topCompounds: questions?.topCompounds || [],
    languageGaps: questions?.languageGaps || [],
    terminology,
    terminologyRuntime,
    sources: [...submittedWithLibraryState, ...approvedSources],
    topics,
    tasks,
    history,
    testCases,
    recognitionHealth: {
      productsProtected: PRODUCTS.length,
      catalogueKeywords: catalogueKeywords.size,
      researchRecords: recognitionCoverage.researchRecords,
      shortPrefixes: recognitionCoverage.shortPrefixes,
      spellingChecks: recognitionCoverage.spellingChecks,
      activeSavedTests: testRows.filter((row) => row.status === 'active').length,
      rejectedSuggestions: historyRows.filter((row) => row.change_type === 'suggestion_rejected').length,
      unresolvedWording: Number(questionStats.attention || 0),
    },
  });
}
