import { NextResponse } from 'next/server';
import { ensureSchema, isDbConfigured } from '@/lib/db';
import {
  listResearchQuestionAuditPage,
  type ResearchQuestionView,
} from '@/lib/db/researchQuestions';

export const dynamic = 'force-dynamic';

// Admin gating is handled by src/proxy.ts, which covers every /api/admin
// route. No cookie check is repeated here, matching the other admin endpoints.
const VIEWS = new Set<ResearchQuestionView>([
  'all', 'members', 'staff', 'today', 'week', 'attention', 'unanswered', 'terms-review', 'errors',
]);

function readParams(request: Request) {
  const url = new URL(request.url);
  const requestedView = url.searchParams.get('view') as ResearchQuestionView | null;
  const requestedCustomer = Number(url.searchParams.get('customer'));
  const requestedPage = Number(url.searchParams.get('page'));
  return {
    view: requestedView && VIEWS.has(requestedView) ? requestedView : 'all' as ResearchQuestionView,
    search: url.searchParams.get('q') ?? '',
    compound: url.searchParams.get('compound') ?? '',
    customerId: Number.isInteger(requestedCustomer) && requestedCustomer > 0 ? requestedCustomer : null,
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    pageSize: 100,
  };
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  try {
    return NextResponse.json(await listResearchQuestionAuditPage(readParams(request)));
  } catch {
    // Same self-healing pattern as /api/admin/member-logins: the first call after
    // this feature ships runs before the table exists, so create it and retry
    // once rather than making anyone run a migration by hand.
    try {
      await ensureSchema();
      return NextResponse.json(await listResearchQuestionAuditPage(readParams(request)));
    } catch (err) {
      console.error('[admin/research-questions] GET failed after ensureSchema:', err);
      return NextResponse.json({ error: 'Could not load the research questions.' }, { status: 500 });
    }
  }
}
