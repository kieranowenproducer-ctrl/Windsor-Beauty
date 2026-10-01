import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import {
  listPearlTestCases,
  pearlActor,
  recordPearlChange,
  updatePearlTestCaseResult,
  withPearlSchema,
} from '@/lib/db/pearlAdmin';
import { listApprovedPearlTerminology } from '@/lib/db/pearlTerminology';
import { answerQuestion } from '@/lib/concierge/research/chat-engine.mjs';
import { runSavedTest } from '@/lib/concierge/research/test-snapshot.mjs';

export const dynamic = 'force-dynamic';

/**
 * Run every active saved test and store the result.
 *
 * A test is not marked against its free-text expectation. The first run
 * records the answer as the accepted picture; later runs report whether the
 * answer still matches it. The approved administrator wording is loaded first,
 * so a test sees exactly the PEARL a member gets.
 */
export async function POST() {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  try {
    const [tests, overrides] = await withPearlSchema(() => Promise.all([
      listPearlTestCases(200),
      listApprovedPearlTerminology().catch(() => []),
    ]));
    const active = tests.filter((test) => test.status === 'active');
    const checkedAt = new Date().toISOString();
    const results = [];

    for (const test of active) {
      const answer = answerQuestion(test.question, [], { overrides });
      const outcome = runSavedTest({ storedText: test.last_result, answer, checkedAt });
      await updatePearlTestCaseResult(test.id, JSON.stringify(outcome.storedResult));
      results.push({
        id: test.id,
        question: test.question,
        state: outcome.state,
        differences: outcome.differences,
        title: outcome.storedResult.snapshot.title,
      });
    }

    const counts = {
      pass: results.filter((row) => row.state === 'pass').length,
      changed: results.filter((row) => row.state === 'changed').length,
      recorded: results.filter((row) => row.state === 'recorded').length,
    };
    const actor = await pearlActor();
    await recordPearlChange({
      changeType: 'tests_run',
      entityType: 'test_case',
      summary: `Ran ${results.length} Pearl test${results.length === 1 ? '' : 's'}: ${counts.pass} unchanged, ${counts.changed} changed, ${counts.recorded} newly recorded.`,
      detail: { counts, changed: results.filter((row) => row.state === 'changed').map((row) => row.question).slice(0, 20) },
      actor,
    });
    return NextResponse.json({ results, counts, checkedAt });
  } catch (error) {
    console.error('[admin/pearl/test-cases/run] POST failed:', error);
    return NextResponse.json({ error: 'Could not run the saved tests.' }, { status: 500 });
  }
}
