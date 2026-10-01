import { NextResponse } from 'next/server';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { conciergeAvailableTo, isSignedInAdmin, CONCIERGE_NOT_AVAILABLE } from '@/lib/concierge/availability';
import { recordPearlAi } from '@/lib/costs/record';
import { pearlAiBudgetStop } from '@/lib/pearl/ai-spend';
import { answerQuestion, COMPOUNDS, RESEARCH_SOURCES } from '@/lib/concierge/research/chat-engine.mjs';
import { GOAL_GUIDANCE, GOAL_GUIDANCE_BY_ID } from '@/lib/concierge/research/goal-guidance.mjs';
import { RESEARCH_PROFILES } from '@/lib/concierge/research/evidence.generated.mjs';
import { RESEARCH_ARTICLES } from '@/lib/concierge/research/article-library.generated.mjs';
import { answerPearlConversation, interpretAudienceBenefitQuestion, protectedConversationRoute, PEARL_CONVERSATION_MODEL, type PearlConversationTurn, type PearlEvidenceItem } from '@/lib/concierge/research/conversation-ai';
import { interpretPearlQuestion, type PearlCandidate } from '@/lib/concierge/research/ai-interpreter';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

type ClientAnswer = { kind?: unknown; title?: unknown; keyPoint?: unknown; summary?: unknown; compounds?: unknown; topicIds?: unknown };
type ClientTurn = { role?: unknown; text?: unknown; answer?: ClientAnswer };

const clean = (value: unknown, limit: number) => String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
const normal = (value: unknown) => clean(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const unique = <T,>(items: T[]) => Array.from(new Set(items));
const sourceById = new Map((RESEARCH_SOURCES as Array<{ id: string; name: string; url: string; role?: string }>).map((source) => [source.id, source]));
const profiles = RESEARCH_PROFILES as Array<{ key: string; name: string; claims?: Array<{ sourceId?: string; summary?: string; mechanism?: string; evidence?: string; limitations?: string[]; passages?: Array<{ heading?: string; text?: string }> }> }>;
const articles = RESEARCH_ARTICLES as Array<{ sourceId?: string; title?: string; summary?: string; limitations?: string[]; productKeys?: string[]; passages?: Array<{ heading?: string; text?: string }> }>;
const compoundList = COMPOUNDS as Array<{ slug: string; name: string }>;
const compoundBySlug = new Map(compoundList.map((compound) => [compound.slug, compound]));
const compoundByName = new Map(compoundList.map((compound) => [normal(compound.name), compound]));
const goalSlugAliases = new Map([
  ['b7-33', 'relaxin'], ['dsip-5mg', 'dsip'], ['nad-1000mg', 'nad'],
  ['l-carnitine-5000mg', 'lcarnitine'], ['hgh191aa', 'hgh-191aa'],
  ['n-acetyl-semax-amidate', 'nasemaxamidate'], ['ll-37', 'll37'],
  ['cjc-1295', 'cjc-1295-no-dac'],
]);

function productForSlug(slug: string) {
  return compoundBySlug.get(slug) || compoundBySlug.get(goalSlugAliases.get(slug) || '');
}

function productForName(name: string) {
  const wanted = normal(name);
  const exact = compoundByName.get(wanted);
  if (exact) return exact;
  return compoundList.filter((compound) => {
    const candidate = normal(compound.name);
    return candidate.includes(wanted) || wanted.includes(candidate);
  }).sort((a, b) => normal(b.name).length - normal(a.name).length)[0];
}

function sanitiseTurns(raw: unknown): { modelTurns: PearlConversationTurn[]; recentAnswer: ClientAnswer | null } {
  const turns = Array.isArray(raw) ? raw.slice(-20) as ClientTurn[] : [];
  let recentAnswer: ClientAnswer | null = null;
  const modelTurns = turns.flatMap<PearlConversationTurn>((turn) => {
    if (turn.role === 'user') {
      const text = clean(turn.text, 500);
      return text ? [{ role: 'user', text, productIds: [], goalIds: [] }] : [];
    }
    if (turn.role !== 'assistant' || !turn.answer) return [];
    const productIds = (Array.isArray(turn.answer.compounds) ? turn.answer.compounds : [])
      .map((name) => productForName(clean(name, 100))?.slug).filter((id): id is string => Boolean(id)).slice(0, 3);
    const goalIds = (Array.isArray(turn.answer.topicIds) ? turn.answer.topicIds : [])
      .map((id) => clean(id, 80)).filter((id) => GOAL_GUIDANCE_BY_ID.has(id)).slice(0, 3);
    recentAnswer = turn.answer;
    const text = clean([turn.answer.title, turn.answer.keyPoint, turn.answer.summary].filter(Boolean).join(' '), 700);
    return [{ role: 'assistant', text, productIds, goalIds }];
  });
  return { modelTurns, recentAnswer };
}

function evidenceFor(productIds: string[], goalIds: string[], question: string): PearlEvidenceItem[] {
  const questionTerms = new Set(terms(question));
  return unique(productIds).flatMap((productId) => {
    const profile = profiles.find((item) => item.key === productId);
    if (!profile) return [];
    // Do not silently stop at the first three sources. The AI receives every
    // relevant supplied-source record, with the request-level cap enforced in
    // conversation-ai.ts so the packet stays bounded.
    const profileEvidence = (profile.claims || []).filter((claim) => claim.sourceId && sourceById.has(claim.sourceId)).map((claim) => {
      const rankedPassages = (claim.passages || []).map((passage) => {
        const value = [passage.heading, passage.text].filter(Boolean).join(' ');
        const haystack = normal(value);
        return { value, score: Array.from(questionTerms).filter((term) => haystack.includes(term)).length };
      }).sort((left, right) => right.score - left.score).slice(0, 3).map((item) => item.value);
      return {
        sourceId: claim.sourceId as string,
        productId,
        goalIds,
        summary: clean([claim.summary, claim.mechanism, claim.evidence, ...rankedPassages].filter(Boolean).join(' '), 700),
        limitations: clean((claim.limitations || []).join(' '), 400),
      };
    });
    const articleEvidence = articles.filter((article) => article.sourceId && sourceById.has(article.sourceId) && article.productKeys?.includes(productId)).map((article) => {
      const rankedPassages = (article.passages || []).map((passage) => {
        const value = [passage.heading, passage.text].filter(Boolean).join(' ');
        const haystack = normal(value);
        return { value, score: Array.from(questionTerms).filter((term) => haystack.includes(term)).length };
      }).sort((left, right) => right.score - left.score).slice(0, 3).map((item) => item.value);
      return {
        sourceId: article.sourceId as string,
        productId,
        goalIds,
        summary: clean([article.title, article.summary, ...rankedPassages].filter(Boolean).join(' '), 700),
        limitations: clean((article.limitations || []).join(' '), 400),
      };
    }).filter((item) => item.summary);
    return [...profileEvidence, ...articleEvidence];
  }).filter((item) => item.summary);
}

function terms(value: string) {
  return normal(value).split(' ').filter((term) => term.length > 2);
}

/* Search every approved profile before allowing a no-evidence fallback. This
   complements the exact catalogue resolver and the AI language interpreter. */
function libraryMatches(query: string, maximum = 8): string[] {
  const queryTerms = new Set(terms(query));
  if (!queryTerms.size) return [];
  return profiles.map((profile) => {
    const haystack = normal([
      profile.name,
      ...(profile.claims || []).flatMap((claim) => [
        claim.summary,
        claim.mechanism,
        claim.evidence,
        ...(claim.limitations || []),
        ...(claim.passages || []).flatMap((passage) => [passage.heading, passage.text]),
      ]),
    ].join(' '));
    const hits = Array.from(queryTerms).filter((term) => haystack.includes(term));
    const exactName = haystack.startsWith(normal(profile.name)) && normal(query).includes(normal(profile.name));
    return { id: profile.key, score: hits.length / queryTerms.size + (exactName ? 2 : 0) };
  }).filter((item) => item.score >= 0.34 && compoundBySlug.has(item.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, maximum)
    .map((item) => item.id);
}

function renderAiAnswer(result: NonNullable<Awaited<ReturnType<typeof answerPearlConversation>>['answer']>, goalIds: string[], question: string) {
  const products = result.matches.map((match) => compoundBySlug.get(match.productId)).filter(Boolean) as Array<{ slug: string; name: string }>;
  const sources = result.sourceIds.map((id) => sourceById.get(id)).filter(Boolean).map((source) => ({
    label: source!.name, detail: source!.role || 'Approved PEARL source', url: source!.url,
    linkable: /^https:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov|clinicaltrials\.gov|www\.accessdata\.fda\.gov|dailymed\.nlm\.nih\.gov)\//i.test(source!.url),
  }));
  const asksForPersonalChoice = /\b(?:should i|should we|best for me|recommend for me|what (?:should|would) (?:i|someone|a man|a woman)|for (?:men|women|males|females))\b/i.test(question);
  return {
    kind: result.matches.length ? 'recommendation' : 'evidence',
    title: result.title,
    keyPoint: asksForPersonalChoice
      ? `I cannot decide what is suitable for a particular person. ${result.summary}`
      : result.summary,
    summary: 'This explanation uses only the approved PEARL evidence shown in the sources below.',
    sections: result.matches.length ? [{
      title: result.matches.length === 1 ? 'Why this matches' : 'Why these match',
      items: result.matches.map((match) => `${compoundBySlug.get(match.productId)?.name}: ${match.explanation}`),
    }] : [],
    bullets: [], compounds: products.map((product) => product.name), topicIds: goalIds,
    sources, followUps: result.followUp ? [result.followUp] : [],
  };
}

function fallback(answer: unknown, reason: string, started: number) {
  return NextResponse.json({ ok: true, route: 'fallback', reason, answer, audit: { elapsedMs: Date.now() - started, tokenCount: 0 } });
}

export async function POST(request: Request) {
  const started = Date.now();
  const customer = await resolveCustomerFromRequest(request);
  const admin = isSignedInAdmin(request);
  if (!customer && !admin) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!conciergeAvailableTo(customer?.email ?? null, { isAdmin: admin })) return NextResponse.json({ error: CONCIERGE_NOT_AVAILABLE }, { status: 403 });
  if (!admin) return NextResponse.json({ error: 'Conversational PEARL is currently in administrator testing.' }, { status: 403 });
  if (process.env.PEARL_CONVERSATION_ENABLED === 'off') return NextResponse.json({ error: 'Conversational PEARL is temporarily switched off.' }, { status: 503 });

  const body = await request.json().catch(() => null) as { question?: unknown; turns?: unknown } | null;
  const question = clean(body?.question, 500);
  if (!question) return NextResponse.json({ error: 'Ask PEARL a question.' }, { status: 400 });
  const researchQuestion = interpretAudienceBenefitQuestion(question);
  const { modelTurns, recentAnswer } = sanitiseTurns(body?.turns);
  const userTurnCount = modelTurns.filter((turn) => turn.role === 'user').length;
  if (userTurnCount >= 10) return NextResponse.json({ error: 'This PEARL conversation has reached ten questions. Please clear it and start a new conversation.' }, { status: 409 });
  const priorNames = modelTurns.filter((turn) => turn.role === 'assistant').at(-1)?.productIds
    .map((id) => compoundBySlug.get(id)?.name).filter((name): name is string => Boolean(name)) || [];
  const previousAnswer = recentAnswer ? {
    kind: clean(recentAnswer.kind, 40), title: clean(recentAnswer.title, 180),
    compounds: priorNames, topicIds: (modelTurns.filter((turn) => turn.role === 'assistant').at(-1)?.goalIds || []),
  } : null;
  const deterministic = answerQuestion(researchQuestion, priorNames, { adminPreview: true, previousAnswer });
  if (protectedConversationRoute(question) || ['dose', 'emergency', 'boundary'].includes(deterministic.kind)) {
    return fallback(deterministic, `protected_${protectedConversationRoute(question) || deterministic.kind}`, started);
  }
  if (!process.env.OPENAI_API_KEY) return fallback(deterministic, 'openai_not_configured', started);
  const spendingStop = await pearlAiBudgetStop();
  if (spendingStop) return fallback(deterministic, 'daily_spending_stop', started);

  let goalIds: string[] = unique<string>([...(deterministic.topicIds || []), ...modelTurns.filter((turn) => turn.role === 'assistant').at(-1)?.goalIds || []])
    .filter((id: string) => GOAL_GUIDANCE_BY_ID.has(id)).slice(0, 3);
  let productIds: string[] = unique<string>((deterministic.compounds || []).map((name: string) => productForName(name)?.slug).filter((id: string | undefined): id is string => Boolean(id)));
  if (!productIds.length && goalIds.length) productIds = unique(goalIds.flatMap((id) => GOAL_GUIDANCE_BY_ID.get(id)?.shortlist || []).map((pick) => productForSlug(pick.slug)?.slug).filter((id): id is string => Boolean(id)));

  const recentContext = modelTurns.slice(-20).map((turn) => `${turn.role}: ${turn.text}`).join('\n');
  const interpretationQuery = `Current question: ${researchQuestion}\nRecent conversation:\n${recentContext}`;
  const lexicalIds = libraryMatches(researchQuestion);
  const goals: PearlCandidate[] = GOAL_GUIDANCE.map((goal) => ({ id: goal.id, label: goal.label, description: goal.intentPhrases.join(', '), sourceIds: [] }));
  const products: PearlCandidate[] = compoundList.map((compound) => ({
    id: compound.slug, label: compound.name,
    description: clean((profiles.find((item) => item.key === compound.slug)?.claims || []).slice(0, 3).map((claim) => [claim.summary, claim.mechanism].filter(Boolean).join(' ')).join(' '), 600),
    sourceIds: [],
  }));
  const interpreted = await interpretPearlQuestion({
    question: interpretationQuery, goals, products, sources: [],
    allowedGoalIds: new Set(goals.map((item) => item.id)), allowedProductIds: new Set(products.map((item) => item.id)), allowedSourceIds: new Set(),
    apiKey: process.env.OPENAI_API_KEY, timeoutMs: Number(process.env.PEARL_CONVERSATION_TIMEOUT_MS || 3_000),
  });
  goalIds = unique([...goalIds, ...(interpreted.interpretation?.goalIds || [])]).slice(0, 3);
  const interpretedGoalProducts = goalIds.flatMap((id) => GOAL_GUIDANCE_BY_ID.get(id)?.shortlist || [])
    .map((pick) => productForSlug(pick.slug)?.slug).filter((id): id is string => Boolean(id));
  productIds = unique([...productIds, ...interpretedGoalProducts, ...(interpreted.interpretation?.productIds || []), ...lexicalIds]).slice(0, 8);

  const evidence = evidenceFor(productIds, goalIds, researchQuestion);
  if (!evidence.length) return fallback(deterministic, 'no_approved_evidence', started);
  const result = await answerPearlConversation({
    question: researchQuestion, priorTurns: modelTurns, evidence,
    allowedProductIds: new Set(compoundList.map((item) => item.slug)),
    allowedGoalIds: new Set(GOAL_GUIDANCE.map((item) => item.id)),
    allowedSourceIds: new Set(sourceById.keys()), apiKey: process.env.OPENAI_API_KEY,
    timeoutMs: Number(process.env.PEARL_CONVERSATION_TIMEOUT_MS || 3_000),
  });
  await recordPearlAi({
    operation: 'interpretation', context: 'pearl_conversation', model: PEARL_CONVERSATION_MODEL,
    provider: 'openai', usage: result.audit.usage, who: 'admin', status: result.route === 'ai' ? 'ok' : 'failed', error: result.route === 'ai' ? null : result.reason,
  });
  if (result.route !== 'ai' || !result.answer) return fallback(deterministic, result.reason, started);
  return NextResponse.json({
    ok: true, route: 'ai', reason: result.reason, answer: renderAiAnswer(result.answer, goalIds, question),
    audit: { elapsedMs: Date.now() - started, tokenCount: result.audit.usage.input_tokens + result.audit.usage.output_tokens },
  });
}
