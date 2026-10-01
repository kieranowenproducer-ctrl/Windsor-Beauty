import { NextResponse } from 'next/server';
import { pearlActor } from '@/lib/db/pearlAdmin';
import { pearlAiConfigured, pearlAiJson, PEARL_AI_MODEL } from '@/lib/pearl/ai';
import { recordPearlAi } from '@/lib/costs/record';
import { pearlAiBudgetStop } from '@/lib/pearl/ai-spend';
import { cleanSearchTerms } from '@/lib/pearl/ai-guards.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Search-time query expansion (Pearl plan d10b). When the stored-passage
 * search finds little, the AI suggests other wordings the approved source
 * text might use for the same subject — and those wordings are ONLY ever
 * used to search the stored, approved text again. Nothing here writes an
 * answer, teaches Pearl wording, or reaches members: the passage bench is
 * admin-only, and the persistent approved wording rules are untouched.
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['terms'],
  properties: {
    terms: {
      type: 'array',
      items: {
        type: 'string',
        description: 'A short alternative search wording (one to four plain words) the source text might use for the same subject.',
      },
    },
  },
};

export async function POST(request: Request) {
  if (!pearlAiConfigured()) return NextResponse.json({ error: 'The AI key is not set up in this environment.' }, { status: 503 });
  let body: { question?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 }); }
  const question = String(body.question || '').trim().slice(0, 300);
  if (!question) return NextResponse.json({ error: 'Pass the question to widen.' }, { status: 400 });

  const actor = await pearlActor();
  try {
    const stop = await pearlAiBudgetStop();
    if (stop) return stop;

    const call = await pearlAiJson<{ terms: string[] }>({
      system: 'You help search stored research text about peptide compounds. Given a question, suggest up to five '
        + 'short alternative wordings (one to four plain words each) that research writing might use for the same '
        + 'subject - synonyms, clinical terms, or everyday phrasings. Suggest only wordings for the subject that '
        + 'was asked about. Never suggest advice, doses, or new subjects. An empty list is a valid answer.',
      user: `The question: "${question}"`,
      schema: SCHEMA,
      maxTokens: 1_000,
      effort: 'low',
    }).catch(async (aiError: unknown) => {
      console.error('[admin/pearl/ai/expand-search] the model call threw:', aiError);
      await recordPearlAi({
        operation: 'interpretation', context: 'pearl_expand_search', model: PEARL_AI_MODEL,
        usage: { input_tokens: 0, output_tokens: 0 }, who: actor, status: 'failed',
        error: (aiError instanceof Error ? aiError.message : 'the call failed before it completed').slice(0, 300),
      });
      return null;
    });
    if (!call) return NextResponse.json({ error: 'The AI call failed before it completed. Nothing was saved.' }, { status: 502 });
    await recordPearlAi({
      operation: 'interpretation', context: 'pearl_expand_search', model: PEARL_AI_MODEL,
      usage: call.usage, who: actor, status: call.result ? 'ok' : 'failed',
      error: call.refused ? 'refused' : call.result ? null : 'unparseable',
    });
    if (!call.result) return NextResponse.json({ error: 'No wider wordings came back in a readable shape.' }, { status: 502 });

    const terms = cleanSearchTerms(call.result.terms, question, 5) as string[];
    return NextResponse.json({ ok: true, terms });
  } catch (error) {
    console.error('[admin/pearl/ai/expand-search] POST failed:', error);
    return NextResponse.json({ error: 'The wider search could not be completed.' }, { status: 500 });
  }
}
