import { NextResponse } from 'next/server';
import { ensureSchema, isDbConfigured } from '@/lib/db';
import { getResearchQuestionById } from '@/lib/db/researchQuestions';

export const dynamic = 'force-dynamic';

async function load(id: number) {
  const question = await getResearchQuestionById(id);
  if (!question) return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
  return NextResponse.json({ question });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: 'Invalid question.' }, { status: 400 });
  }

  try {
    return await load(id);
  } catch {
    try {
      await ensureSchema();
      return await load(id);
    } catch (error) {
      console.error('[admin/research-questions/id] GET failed after ensureSchema:', error);
      return NextResponse.json({ error: 'Could not load this question.' }, { status: 500 });
    }
  }
}
