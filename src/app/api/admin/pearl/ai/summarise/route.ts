import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { pearlActor, withPearlSchema } from '@/lib/db/pearlAdmin';
import { pearlAiConfigured, pearlAiJson, PEARL_AI_MODEL } from '@/lib/pearl/ai';
import { citedSentences } from '@/lib/pearl/ai-guards.mjs';
import { recordPearlAi } from '@/lib/costs/record';
import { pearlAiBudgetStop } from '@/lib/pearl/ai-spend';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * AI place 3 of 3 (Pearl plan Stage D step 10): summarise ONLY the retrieved
 * passages the admin is looking at. Every sentence of the summary must cite
 * one of those passages as [n]; a single uncited sentence rejects the whole
 * summary in code, because a sentence without a source is a sentence the AI
 * supplied — exactly what it is never allowed to do. Admin bench only.
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'summary'],
  properties: {
    found: { type: 'boolean', description: 'false when the passages do not actually answer the question.' },
    summary: { type: 'string', description: 'The summary. EVERY sentence must end with at least one [n] citation naming the passage it comes from. Empty when found is false.' },
  },
};

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  if (!pearlAiConfigured()) return NextResponse.json({ error: 'The AI key is not set up in this environment.' }, { status: 503 });
  let body: { question?: string; passageIds?: number[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 }); }
  const question = String(body.question || '').trim().slice(0, 300);
  const passageIds = (body.passageIds || []).filter((id) => Number.isInteger(id)).slice(0, 8);
  if (!question || !passageIds.length) return NextResponse.json({ error: 'Pass the question and the passage ids.' }, { status: 400 });

  const db = requireDb();
  const actor = await pearlActor();
  try {
    const passages = await withPearlSchema(() => db`
      SELECT p.id, p.heading, p.passage_text, g.url, g.title, g.source_id
      FROM pearl_source_passages p
      JOIN pearl_source_pages g ON g.id = p.page_id
      WHERE p.id = ANY(${passageIds})
    `) as Array<{ id: number; heading: string | null; passage_text: string; url: string; title: string | null }>;
    if (!passages.length) return NextResponse.json({ error: 'None of those passages exist.' }, { status: 404 });
    const ordered = passageIds.map((id) => passages.find((passage) => passage.id === id)).filter(Boolean) as typeof passages;

    const numbered = ordered.map((passage, index) =>
      `[${index + 1}] From ${passage.title || passage.url}${passage.heading ? ` — ${passage.heading}` : ''}:\n${passage.passage_text}`).join('\n\n');
    const stop = await pearlAiBudgetStop();
    if (stop) return stop;

    const call = await pearlAiJson<{ found: boolean; summary: string }>({
      system: 'You summarise ONLY the numbered passages you are given. Every sentence must end with at '
        + 'least one citation like [1] or [2] naming the passage it comes from. Do not use any knowledge '
        + 'of your own — if the passages do not answer the question, set found to false and leave the '
        + 'summary empty. That honest nothing is the correct answer.',
      user: `Question: ${question}\n\nPassages:\n${numbered}`,
      schema: SCHEMA,
      maxTokens: 3_000,
    }).catch(async (aiError: unknown) => {
      console.error('[admin/pearl/ai/summarise] the model call threw:', aiError);
      await recordPearlAi({
        operation: 'distillation', context: 'pearl_summarise', model: PEARL_AI_MODEL,
        usage: { input_tokens: 0, output_tokens: 0 }, who: actor, status: 'failed',
        error: (aiError instanceof Error ? aiError.message : 'the call failed before it completed').slice(0, 300),
      });
      return null;
    });
    if (!call) return NextResponse.json({ error: 'The AI call failed before it completed. Nothing was saved.' }, { status: 502 });
    await recordPearlAi({
      operation: 'distillation', context: 'pearl_summarise', model: PEARL_AI_MODEL,
      usage: call.usage, who: actor, status: call.result ? 'ok' : 'failed',
      error: call.refused ? 'refused' : call.result ? null : 'unparseable',
    });
    if (!call.result) return NextResponse.json({ error: 'The summary did not come back in a readable shape.' }, { status: 502 });
    if (!call.result.found || !call.result.summary.trim()) {
      return NextResponse.json({ ok: true, found: false, message: 'The stored passages do not answer this question. Saying so beats filling the gap.' });
    }

    const check = citedSentences(call.result.summary, ordered.length) as { ok: boolean; failures: string[] };
    if (!check.ok) {
      return NextResponse.json({
        error: `The summary was rejected: ${check.failures.length} sentence${check.failures.length === 1 ? '' : 's'} carried no citation, and an uncited sentence is not allowed to be shown.`,
      }, { status: 422 });
    }
    return NextResponse.json({
      ok: true, found: true, summary: call.result.summary,
      passages: ordered.map((passage, index) => ({ number: index + 1, title: passage.title || passage.url, url: passage.url })),
    });
  } catch (error) {
    console.error('[admin/pearl/ai/summarise] POST failed:', error);
    return NextResponse.json({ error: 'The summary could not be completed.' }, { status: 500 });
  }
}
