import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { pearlActor, recordPearlChange, withPearlSchema } from '@/lib/db/pearlAdmin';
import { pearlAiConfigured, pearlAiJson, PEARL_AI_MODEL } from '@/lib/pearl/ai';
import { verbatimFacts } from '@/lib/pearl/ai-guards.mjs';
import { recordPearlAi } from '@/lib/costs/record';
import { pearlAiBudgetStop } from '@/lib/pearl/ai-spend';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * AI place 1 of 3 (Pearl plan Stage D step 10): draft structured facts from
 * ONE stored page. The draft is filed as a PROPOSAL — it never touches the
 * evidence, which only the reviewed build pipeline may change. Every drafted
 * fact must carry a verbatim quote from the stored text; facts whose quote is
 * not really in the page are dropped by the guard before anyone sees them.
 * Finding nothing is a valid, honest result.
 */

type DraftFact = { field: string; statement: string; quote: string };

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['facts'],
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'statement', 'quote'],
        properties: {
          field: { type: 'string', description: 'Which research field this belongs to: summary, evidence, mechanism, half-life, safety, limitation, protocol or reference.' },
          statement: { type: 'string', description: 'The fact, stated plainly, phrased only from the page.' },
          quote: { type: 'string', description: 'The exact sentence(s) from the page this fact comes from, copied verbatim.' },
        },
      },
    },
  },
};

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  if (!pearlAiConfigured()) return NextResponse.json({ error: 'The AI key is not set up in this environment.' }, { status: 503 });
  let body: { pageId?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 }); }
  const pageId = Number(body.pageId);
  if (!Number.isInteger(pageId) || pageId <= 0) return NextResponse.json({ error: 'Pass a stored page id.' }, { status: 400 });

  const db = requireDb();
  const actor = await pearlActor();
  try {
    const rows = await withPearlSchema(() => db`
      SELECT g.url, g.title, g.source_id, v.full_text
      FROM pearl_source_pages g
      JOIN pearl_source_page_versions v ON v.page_id = g.id AND v.version = g.latest_version
      WHERE g.id = ${pageId} AND g.archived_at IS NULL
    `) as Array<{ url: string; title: string | null; source_id: string; full_text: string }>;
    const page = rows[0];
    if (!page || !page.full_text) return NextResponse.json({ error: 'That stored page has no text to read.' }, { status: 404 });
    const text = page.full_text.slice(0, 60_000);

    const stop = await pearlAiBudgetStop();
    if (stop) return stop;

    /* A thrown call still lands in the ledger (Stage E): zero tokens, status
       failed, the reason kept — so the cost record is honest about attempts,
       not just completions. */
    const call = await pearlAiJson<{ facts: DraftFact[] }>({
      system: 'You draft structured research facts from ONE stored source page for a human reviewer. '
        + 'Use ONLY the supplied page text. Never add knowledge of your own, never complete a partial '
        + 'claim from memory, never guess a number. Every fact must carry the exact verbatim quote it '
        + 'comes from. If the page contains nothing clearly extractable, return an empty list — an '
        + 'honest nothing is the correct answer.',
      user: `Page: ${page.title || page.url}\nAddress: ${page.url}\n\nStored page text:\n${text}`,
      schema: SCHEMA,
      maxTokens: 8_000,
    }).catch(async (aiError: unknown) => {
      console.error('[admin/pearl/ai/extract] the model call threw:', aiError);
      await recordPearlAi({
        operation: 'distillation', context: 'pearl_extract', model: PEARL_AI_MODEL,
        usage: { input_tokens: 0, output_tokens: 0 }, who: actor, status: 'failed',
        error: (aiError instanceof Error ? aiError.message : 'the call failed before it completed').slice(0, 300),
      });
      return null;
    });
    if (!call) return NextResponse.json({ error: 'The AI call failed before it completed. Nothing was saved.' }, { status: 502 });
    await recordPearlAi({
      operation: 'distillation', context: 'pearl_extract', model: PEARL_AI_MODEL,
      usage: call.usage, who: actor, status: call.result ? 'ok' : 'failed',
      error: call.refused ? 'refused' : call.result ? null : 'unparseable',
    });
    if (call.refused) return NextResponse.json({ error: 'The model declined this page.' }, { status: 502 });
    if (!call.result) return NextResponse.json({ error: 'The draft did not come back in a readable shape. Nothing was saved.' }, { status: 502 });

    const { kept, dropped } = verbatimFacts(call.result.facts, page.full_text) as { kept: DraftFact[]; dropped: DraftFact[] };
    if (!kept.length) {
      return NextResponse.json({ ok: true, facts: 0, droppedFacts: dropped.length, message: 'Nothing survived the verbatim-quote check. Saying so beats filling the gap; no proposal was filed.' });
    }

    const inserted = await withPearlSchema(() => db`
      INSERT INTO pearl_proposals (kind, title, summary, before_view, after_view, payload, created_by)
      VALUES ('ai_extraction',
              ${`AI draft: ${kept.length} fact${kept.length === 1 ? '' : 's'} from ${page.title || page.url}`.slice(0, 300)},
              ${'Every fact carries a verbatim quote from the stored page. Approving records the review verdict; the evidence itself only changes through the reviewed build.'},
              ${JSON.stringify({ 'Read from': page.url, 'Quote check': `${kept.length} kept, ${dropped.length} dropped as not verbatim` })}::jsonb,
              ${JSON.stringify(Object.fromEntries(kept.slice(0, 12).map((fact, index) => [`${index + 1}. ${fact.field}`, `${fact.statement} — “${fact.quote.slice(0, 160)}”`])))}::jsonb,
              ${JSON.stringify({ pageId, facts: kept })}::jsonb,
              ${actor})
      RETURNING id
    `) as Array<{ id: number }>;
    await recordPearlChange({
      changeType: 'ai_extraction_drafted', entityType: 'proposal', entityId: inserted[0].id,
      summary: `AI drafted ${kept.length} quoted fact${kept.length === 1 ? '' : 's'} from ${page.url}; ${dropped.length} failed the verbatim check and were dropped. Waiting for review.`,
      actor, detail: { pageId, kept: kept.length, dropped: dropped.length },
    });
    return NextResponse.json({ ok: true, proposalId: inserted[0].id, facts: kept.length, droppedFacts: dropped.length });
  } catch (error) {
    console.error('[admin/pearl/ai/extract] POST failed:', error);
    return NextResponse.json({ error: 'The AI draft could not be completed.' }, { status: 500 });
  }
}
