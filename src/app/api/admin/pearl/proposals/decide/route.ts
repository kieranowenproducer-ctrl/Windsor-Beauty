import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { requireDb } from '@/lib/db/client';
import { approvePearlLayoutText, createPearlCitationOverride, createPearlTestCase, pearlActor, recordPearlChange, withPearlSchema } from '@/lib/db/pearlAdmin';
import { createPearlTask } from '@/lib/pearl/taskBridge';
import { createPearlTerminology } from '@/lib/db/pearlTerminology';
import { cleanPearlTerminologyInput } from '@/lib/concierge/research/terminology-admin';
import { COMPOUNDS, isApprovedCitationUrl } from '@/lib/concierge/research/chat-engine.mjs';

export const dynamic = 'force-dynamic';

/**
 * Approve or reject a Pearl proposal (Pearl plan Stage D step 8).
 *
 * Approval is the moment a proposal becomes real. For a terminology rule or
 * an answer correction, approving writes the wording rule (already approved
 * and active, because the approval just happened here) AND its saved test in
 * the same action — the "correct a weak answer writes a rule and a test
 * together" promise. AI drafts (extractions, summaries) are knowledge for a
 * person; approving records the verdict without touching the evidence, which
 * only the reviewed build pipeline may change.
 *
 * Rejection changes nothing and keeps the record.
 */

type RulePayload = {
  kind?: string;
  term?: string;
  canonicalSlug?: string | null;
  displayName?: string | null;
  ambiguousWith?: string[];
  categories?: string[];
  notes?: string | null;
};

type CitationPayload = {
  compoundSlug?: string;
  action?: string;
  url?: string;
  label?: string | null;
  detail?: string | null;
  reason?: string | null;
};

type SourceWorkPayload = { sourceId?: string | number; name?: string; url?: string; reason?: string | null };
type BoostPayload = { pageId?: number; passageText?: string; heading?: string | null; url?: string; sourceName?: string; note?: string | null };
type TopicPayload = { name?: string; note?: string | null };
type LayoutTextPayload = { layoutId?: number; blockId?: string; heading?: string | null; text?: string };

type ProposalRow = {
  id: number;
  kind: string;
  title: string;
  status: string;
  payload: {
    rule?: RulePayload;
    test?: { question?: string; expectedOutcome?: string };
    citation?: CitationPayload;
    sourceWork?: SourceWorkPayload;
    boost?: BoostPayload;
    topic?: TopicPayload;
    layoutText?: LayoutTextPayload;
  } | null;
  source_question_id: number | null;
};

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  let body: { id?: number; decision?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const id = Number(body.id);
  const decision = body.decision === 'approved' ? 'approved' : body.decision === 'rejected' ? 'rejected' : null;
  if (!Number.isInteger(id) || !decision) return NextResponse.json({ error: 'Pass a proposal id and a decision.' }, { status: 400 });

  const db = requireDb();
  try {
    const actor = await pearlActor();
    /* Claim first (Pearl repairs Stage D). The decision is written in the
       same statement that checks the proposal is still waiting, so when two
       tabs or two admins press at once exactly one wins; the other gets an
       honest "already decided" instead of the writes running twice. */
    const claimed = await withPearlSchema(() => db`
      UPDATE pearl_proposals SET
        status = ${decision}, decided_by = ${actor}, decided_at = now(),
        decision_note = ${String(body.note || '').slice(0, 2000) || null}, updated_at = now()
      WHERE id = ${id} AND status = 'proposed'
      RETURNING *
    `) as ProposalRow[];
    const proposal = claimed[0];
    if (!proposal) {
      const existing = await withPearlSchema(() => db`SELECT status FROM pearl_proposals WHERE id = ${id}`) as Array<{ status: string }>;
      if (!existing[0]) return NextResponse.json({ error: 'No proposal has that id.' }, { status: 404 });
      return NextResponse.json({ error: 'This proposal has already been decided.' }, { status: 409 });
    }

    /* If anything below fails, the claim is handed back so the proposal
       returns to the waiting list with the real reason on screen. The
       proposal-id stamps make the retry safe: any step that already ran
       finds its earlier work instead of duplicating it. */
    const handBack = async (status: number, message: string) => {
      /* The hand-back is itself a database write, so it can fail too. If it
         does, the proposal is still stamped as decided while the work did
         not finish, and saying "it is back in the waiting list" would be a
         lie. Say what actually happened instead. */
      try {
        await withPearlSchema(() => db`
          UPDATE pearl_proposals SET status = 'proposed', decided_by = NULL, decided_at = NULL, decision_note = NULL, updated_at = now()
          WHERE id = ${id}
        `);
      } catch (restoreError) {
        console.error('[admin/pearl/proposals/decide] could not hand the proposal back:', restoreError);
        return NextResponse.json({
          error: `${message} It could not be returned to the waiting list either, so it still reads as decided. Open the Proposals screen and check this one before deciding it again.`,
        }, { status: 500 });
      }
      return NextResponse.json({ error: message }, { status });
    };

    const executed: string[] = [];
    let taskWarning: string | null = null;
    if (decision === 'approved') try {
      const rule = proposal.payload?.rule;
      if (rule?.term && ['terminology_rule', 'answer_correction'].includes(proposal.kind)) {
        const parsed = cleanPearlTerminologyInput({
          kind: rule.kind || 'alias',
          term: rule.term,
          canonicalSlug: rule.canonicalSlug || null,
          displayName: rule.displayName || null,
          aliases: [], misspellings: [], relatedSlugs: [], componentSlugs: [],
          categories: rule.categories || [],
          ambiguousWith: rule.ambiguousWith || [],
          sourceUrls: [], confidence: 'medium',
          reviewStatus: 'approved',
          autoResolve: !['ambiguous', 'category'].includes(rule.kind || 'alias'),
          enabled: true,
          notes: rule.notes || `Approved through proposal ${proposal.id}.`,
          lastVerified: null,
        });
        if (!parsed.input) return await handBack(400, `The proposed rule is not valid: ${parsed.error}`);
        const record = await withPearlSchema(() => createPearlTerminology(parsed.input!, actor, proposal.id));
        executed.push(`wording rule “${(record ?? parsed.input!).term}”`);
      }
      /* Approving a citation correction writes the override row the answer
         engine reads at answer time. "remove" needs no URL check (it can only
         take a link away); "add" is held to the same whitelist the engine
         enforces, so an unapproved host cannot reach an answer even here. */
      const citation = proposal.payload?.citation;
      if (proposal.kind === 'citation_correction' && citation?.url && citation.compoundSlug) {
        const action = citation.action === 'add' ? 'add' : citation.action === 'remove' ? 'remove' : null;
        const compound = (COMPOUNDS as Array<{ slug: string; name: string }>).find((item) => item.slug === citation.compoundSlug);
        if (!action || !compound) {
          return await handBack(400, 'The proposed citation correction is not valid.');
        }
        if (action === 'add' && !isApprovedCitationUrl(citation.url)) {
          return await handBack(400, 'Links can only be added from trusted research sites or the approved source library.');
        }
        await createPearlCitationOverride({
          compoundSlug: compound.slug,
          action,
          url: String(citation.url),
          label: citation.label || null,
          detail: citation.detail || null,
          reason: citation.reason || null,
          proposalId: proposal.id,
          actor,
        });
        executed.push(`citation correction for ${compound.name} (${action === 'remove' ? 'link removed' : 'link added'})`);
      }
      /* Improve button d8c: an approved boost makes this passage rank first
         whenever it matches a question. Keyed by the passage's text hash, so
         if the source text later changes the boost honestly lapses. */
      const boost = proposal.payload?.boost;
      if (proposal.kind === 'passage_boost' && boost?.pageId && boost.passageText) {
        const db2 = requireDb();
        await withPearlSchema(() => db2`
          INSERT INTO pearl_passage_boosts (page_id, passage_hash, note, proposal_id, created_by)
          VALUES (${boost.pageId}, md5(${boost.passageText}), ${boost.note || null}, ${proposal.id}, ${actor})
          ON CONFLICT (page_id, passage_hash) DO UPDATE SET enabled = TRUE, note = EXCLUDED.note
        `);
        executed.push('a search boost for the passage');
      }

      /* Custom words in an answer layout. The words must still match what
         was proposed - if the layout was edited since, nothing is approved
         and the screen says so, rather than approving different words. */
      const layoutText = proposal.payload?.layoutText;
      if (proposal.kind === 'layout_text' && layoutText?.layoutId && layoutText.blockId) {
        const approvedWords = await approvePearlLayoutText(
          Number(layoutText.layoutId),
          String(layoutText.blockId),
          String(layoutText.text ?? ''),
        );
        if (!approvedWords) {
          return await handBack(409, 'The layout has changed since these words were proposed, so nothing was approved. Save the layout again to file a fresh proposal.');
        }
        executed.push('the custom words in the layout');
      }

      const test = proposal.payload?.test;
      if (test?.question) {
        await createPearlTestCase({
          question: test.question,
          expectedOutcome: test.expectedOutcome || `Approved through proposal ${proposal.id}: the corrected answer must hold.`,
          sourceQuestionId: proposal.source_question_id,
          proposalId: proposal.id,
          actor,
        });
        executed.push(`saved test “${test.question.slice(0, 80)}”`);
      }

      /* Improve buttons d8a, d8b and d8d: re-reading a source, extracting
         more from it, and topic improvements all need the reviewed evidence
         build, which no button may run. Approval creates the Pearl task that
         asks the team for exactly that work — the documented safety model:
         wording fixes execute here, research changes become tasks.

         These two run LAST, and that position is load-bearing. Every write
         above is stamped with the proposal id, so a retried approval finds
         its earlier work instead of repeating it. A Pearl task cannot be
         stamped that way: it lives in the separate task database and its
         failure is deliberately non-fatal. While task creation sat in the
         middle, a later step failing handed the proposal back with a task
         already made, and pressing Approve again made a second one - which
         the message on screen promises will not happen. Last means nothing
         can fail after a task is created, so the promise is now true. */
      const sourceWork = proposal.payload?.sourceWork;
      if (['source_refresh', 'source_extract'].includes(proposal.kind) && sourceWork?.name) {
        const refresh = proposal.kind === 'source_refresh';
        try {
          const task = await createPearlTask({
            title: `${refresh ? 'Re-read' : 'Extract more from'} ${sourceWork.name}`,
            description: `${refresh
              ? `Re-read ${sourceWork.name} (${sourceWork.url || 'no address recorded'}) and refresh its stored pages through the reviewed evidence build.`
              : `Read ${sourceWork.name} (${sourceWork.url || 'no address recorded'}) more deeply and draft anything new as proposals. Nothing may reach an answer without approval.`}${sourceWork.reason ? ` Reason given: ${sourceWork.reason}` : ''} Approved through proposal ${proposal.id}.`,
            priority: 'medium',
          });
          executed.push(`the Pearl task “${task.title.replace(/^PEARL:\s*/, '')}”`);
        } catch (taskError) {
          taskWarning = taskError instanceof Error ? taskError.message : 'The Pearl task could not be created.';
        }
      }

      const topic = proposal.payload?.topic;
      if (proposal.kind === 'topic_link' && topic?.name) {
        try {
          const task = await createPearlTask({
            title: `Topic improvement: ${topic.name}`,
            description: `${topic.note || 'Improve how Pearl connects this topic to the approved research.'} Topic vocabulary lives in the reviewed research build, so this needs the team. Approved through proposal ${proposal.id}.`,
            priority: 'medium',
          });
          executed.push(`the Pearl task “${task.title.replace(/^PEARL:\s*/, '')}”`);
        } catch (taskError) {
          taskWarning = taskError instanceof Error ? taskError.message : 'The Pearl task could not be created.';
        }
      }
    } catch (stepError) {
      console.error('[admin/pearl/proposals/decide] approval step failed:', stepError);
      const reason = stepError instanceof Error ? stepError.message : 'an unexpected error';
      return await handBack(500, `The approval did not finish: ${reason}. The proposal is back in the waiting list, and pressing Approve again is safe — nothing already created will be duplicated.`);
    }

    await recordPearlChange({
      changeType: decision === 'approved' ? 'proposal_approved' : 'proposal_rejected',
      entityType: 'proposal',
      entityId: id,
      summary: decision === 'approved'
        ? `Approved “${proposal.title}”${executed.length ? ` and created ${executed.join(' and ')}` : ''}.`
        : `Rejected “${proposal.title}”. Pearl is unchanged.`,
      actor,
      detail: { kind: proposal.kind, executed },
    });
    return NextResponse.json({ ok: true, executed, taskWarning });
  } catch (error) {
    console.error('[admin/pearl/proposals/decide] POST failed:', error);
    return NextResponse.json({ error: 'Could not decide this proposal.' }, { status: 500 });
  }
}
