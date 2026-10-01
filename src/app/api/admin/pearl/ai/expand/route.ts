import { NextResponse } from 'next/server';
import { pearlActor } from '@/lib/db/pearlAdmin';
import { pearlAiConfigured, pearlAiJson, PEARL_AI_MODEL } from '@/lib/pearl/ai';
import { recordPearlAi } from '@/lib/costs/record';
import { pearlAiBudgetStop } from '@/lib/pearl/ai-spend';
import { COMPOUNDS } from '@/lib/concierge/research/chat-engine.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * AI place 2 of 3 (Pearl plan Stage D step 10): suggest other wordings a
 * member might use for a question — abbreviations, misspellings, alternative
 * names — mapped ONLY to compounds that already exist in the approved
 * library. Suggestions are just suggestions: each one still has to be filed
 * as a proposal and approved before Pearl learns it. A suggestion naming a
 * compound that does not exist is dropped by the guard.
 */

type Suggestion = { term: string; kind: string; compoundSlug: string; reason: string };

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'kind', 'compoundSlug', 'reason'],
        properties: {
          term: { type: 'string', description: 'The wording a member might actually type.' },
          kind: { type: 'string', enum: ['abbreviation', 'misspelling', 'alias'] },
          compoundSlug: { type: 'string', description: 'The slug of the EXISTING approved compound this wording means. Must come from the supplied catalogue.' },
          reason: { type: 'string', description: 'One plain sentence on why members would use this wording.' },
        },
      },
    },
  },
};

export async function POST(request: Request) {
  if (!pearlAiConfigured()) return NextResponse.json({ error: 'The AI key is not set up in this environment.' }, { status: 503 });
  let body: { question?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 }); }
  const question = String(body.question || '').trim().slice(0, 300);
  if (!question) return NextResponse.json({ error: 'Pass the question to expand.' }, { status: 400 });

  const catalogue = (COMPOUNDS as Array<{ slug: string; name: string }>).map((compound) => `${compound.slug} (${compound.name})`);
  const validSlugs = new Set((COMPOUNDS as Array<{ slug: string }>).map((compound) => compound.slug));
  const actor = await pearlActor();
  try {
    const stop = await pearlAiBudgetStop();
    if (stop) return stop;

    const call = await pearlAiJson<{ suggestions: Suggestion[] }>({
      system: 'You suggest alternative wordings members might use when asking a research assistant about '
        + 'peptide compounds. Suggest ONLY wordings that map to compounds in the supplied catalogue. Never '
        + 'invent a compound, never map a wording to a compound you are unsure about. Few good suggestions '
        + 'beat many weak ones; an empty list is a valid answer.',
      user: `The question a member asked: "${question}"\n\nApproved compound catalogue (slug and name):\n${catalogue.join('\n')}`,
      schema: SCHEMA,
      maxTokens: 4_000,
      effort: 'low',
    }).catch(async (aiError: unknown) => {
      console.error('[admin/pearl/ai/expand] the model call threw:', aiError);
      await recordPearlAi({
        operation: 'interpretation', context: 'pearl_expand', model: PEARL_AI_MODEL,
        usage: { input_tokens: 0, output_tokens: 0 }, who: actor, status: 'failed',
        error: (aiError instanceof Error ? aiError.message : 'the call failed before it completed').slice(0, 300),
      });
      return null;
    });
    if (!call) return NextResponse.json({ error: 'The AI call failed before it completed. Nothing was saved.' }, { status: 502 });
    await recordPearlAi({
      operation: 'interpretation', context: 'pearl_expand', model: PEARL_AI_MODEL,
      usage: call.usage, who: actor, status: call.result ? 'ok' : 'failed',
      error: call.refused ? 'refused' : call.result ? null : 'unparseable',
    });
    if (!call.result) return NextResponse.json({ error: 'No suggestions came back in a readable shape.' }, { status: 502 });

    const kept = call.result.suggestions.filter((suggestion) =>
      suggestion.term?.trim() && validSlugs.has(suggestion.compoundSlug) && ['abbreviation', 'misspelling', 'alias'].includes(suggestion.kind));
    const dropped = call.result.suggestions.length - kept.length;
    return NextResponse.json({ ok: true, suggestions: kept.slice(0, 8), dropped });
  } catch (error) {
    console.error('[admin/pearl/ai/expand] POST failed:', error);
    return NextResponse.json({ error: 'The suggestions could not be completed.' }, { status: 500 });
  }
}
