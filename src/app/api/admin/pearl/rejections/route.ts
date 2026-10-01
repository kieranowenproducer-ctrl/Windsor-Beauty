import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { pearlActor, recordPearlChange } from '@/lib/db/pearlAdmin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 2000) : '';
  const matchedText = typeof body.matchedText === 'string' ? body.matchedText.trim().slice(0, 300) : '';
  const suggestions = Array.isArray(body.suggestions)
    ? body.suggestions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
    : [];
  if (!question || !suggestions.length) {
    return NextResponse.json({ error: 'Give the tested question and rejected suggestions.' }, { status: 400 });
  }

  try {
    const actor = await pearlActor();
    await recordPearlChange({
      changeType: 'suggestion_rejected',
      entityType: 'terminology',
      summary: `Rejected ${suggestions.length === 1 ? `“${suggestions[0]}”` : `${suggestions.length} suggested terms`} for “${matchedText || question}”.`,
      detail: { question, matchedText, suggestions },
      actor,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[admin/pearl/rejections] POST failed:', error);
    return NextResponse.json({ error: 'The rejection could not be recorded.' }, { status: 500 });
  }
}
