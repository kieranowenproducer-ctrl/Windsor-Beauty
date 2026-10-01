import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { createPearlTestCase, pearlActor, recordPearlChange } from '@/lib/db/pearlAdmin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const expectedOutcome = typeof body.expectedOutcome === 'string' ? body.expectedOutcome.trim() : '';
  const sourceQuestionId = Number(body.sourceQuestionId) || null;
  if (!question || !expectedOutcome) {
    return NextResponse.json({ error: 'Add the question and what Pearl should get right.' }, { status: 400 });
  }
  try {
    const actor = await pearlActor();
    const testCase = await createPearlTestCase({ question, expectedOutcome, sourceQuestionId, actor });
    if (!testCase) throw new Error('The insert returned no row.'); // only possible for stamped proposal inserts, which this route never makes
    await recordPearlChange({
      changeType: 'test_case_created', entityType: 'test_case', entityId: testCase.id,
      summary: 'Added a Pearl saved test.', actor,
      detail: { question: question.slice(0, 500), expectedOutcome: expectedOutcome.slice(0, 500) },
    });
    return NextResponse.json({ testCase });
  } catch (error) {
    console.error('[admin/pearl/test-cases] POST failed:', error);
    return NextResponse.json({ error: 'Could not save this test.' }, { status: 500 });
  }
}
