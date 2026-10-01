import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { pearlActor, recordPearlChange, reviewPearlQuestion } from '@/lib/db/pearlAdmin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = Number(body.questionId);
  const status = body.status === 'good' || body.status === 'needs_improvement' ? body.status : null;
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  if (!Number.isInteger(id) || id < 1 || !status) {
    return NextResponse.json({ error: 'Choose a valid question and review result.' }, { status: 400 });
  }
  if (status === 'needs_improvement' && !note) {
    return NextResponse.json({ error: 'Add a short note explaining what Pearl should improve.' }, { status: 400 });
  }

  try {
    const actor = await pearlActor();
    const question = await reviewPearlQuestion({ id, status, note, actor });
    if (!question) return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
    await recordPearlChange({
      changeType: status === 'good' ? 'answer_approved' : 'answer_flagged',
      entityType: 'question',
      entityId: id,
      summary: status === 'good' ? 'Marked a Pearl answer as good.' : 'Flagged a Pearl answer for improvement.',
      detail: { question: String(question.question || '').slice(0, 500), note },
      actor,
    });
    return NextResponse.json({ question });
  } catch (error) {
    console.error('[admin/pearl/feedback] POST failed:', error);
    return NextResponse.json({ error: 'Could not save this review.' }, { status: 500 });
  }
}
