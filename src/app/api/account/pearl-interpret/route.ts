import { NextResponse } from 'next/server';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { conciergeAvailableTo, isSignedInAdmin, CONCIERGE_NOT_AVAILABLE } from '@/lib/concierge/availability';
import { pearlAiBudgetStop } from '@/lib/pearl/ai-spend';
import { answerQuestion, COMPOUNDS, RESEARCH_SOURCES } from '@/lib/concierge/research/chat-engine.mjs';
import { GOAL_GUIDANCE } from '@/lib/concierge/research/goal-guidance.mjs';
import { RESEARCH_PROFILES } from '@/lib/concierge/research/evidence.generated.mjs';
import { interpretPearlQuestion, type PearlCandidate } from '@/lib/concierge/research/ai-interpreter';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Stable, reviewable goal vocabulary. AI can select these IDs, never create one.
const GOALS: PearlCandidate[] = GOAL_GUIDANCE.map((goal) => ({
  id: goal.id,
  label: goal.label,
  description: goal.intentPhrases.join(', '),
  sourceIds: [],
}));

function on(name: string, defaultValue = false): boolean {
  return (process.env[name] ?? (defaultValue ? 'on' : 'off')).trim().toLowerCase() === 'on';
}

function fallback(reason: string, status = 200) {
  return NextResponse.json({ ok: true, route: 'deterministic', interpretation: null, reason }, { status });
}

export async function POST(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  const admin = isSignedInAdmin(request);
  if (!customer && !admin) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!conciergeAvailableTo(customer?.email ?? null, { isAdmin: admin })) {
    return NextResponse.json({ error: CONCIERGE_NOT_AVAILABLE }, { status: 403 });
  }
  if (!admin) return fallback('admin_preview_only');
  if (!on('PEARL_INTERPRETER_ENABLED', true)) return fallback('kill_switch_off');
  if (!on('PEARL_INTERPRETER_PAID_CALLS', true)) return fallback('paid_calls_off');
  if (!process.env.OPENAI_API_KEY) return fallback('openai_not_configured');

  const spendingStop = await pearlAiBudgetStop();
  if (spendingStop) return fallback('daily_spending_stop');

  const payload = await request.json().catch(() => null) as { question?: unknown } | null;
  const question = typeof payload?.question === 'string' ? payload.question.trim().slice(0, 500) : '';
  if (!question) return NextResponse.json({ error: 'Ask PEARL a question.' }, { status: 400 });

  const profileByKey = new Map((RESEARCH_PROFILES as Array<{ key: string; claims?: Array<{ sourceId?: string }> }>).map((profile) => [profile.key, profile]));
  const products: PearlCandidate[] = (COMPOUNDS as Array<{ slug: string; name: string; tagline?: string; category?: string }>).map((compound) => ({
    id: compound.slug,
    label: compound.name,
    description: [compound.category, compound.tagline].filter(Boolean).join(': '),
    sourceIds: Array.from(new Set((profileByKey.get(compound.slug)?.claims ?? []).map((claim) => claim.sourceId).filter((id): id is string => Boolean(id)))),
  }));
  const sources: PearlCandidate[] = (RESEARCH_SOURCES as Array<{ id: string; name: string; role?: string }>).map((source) => ({
    id: source.id, label: source.name, description: source.role ?? '', sourceIds: [source.id],
  }));

  const result = await interpretPearlQuestion({
    question, goals: GOALS, products, sources,
    allowedGoalIds: new Set(GOALS.map((item) => item.id)),
    allowedProductIds: new Set(products.map((item) => item.id)),
    allowedSourceIds: new Set(sources.map((item) => item.id)),
    apiKey: process.env.OPENAI_API_KEY,
    timeoutMs: Number(process.env.PEARL_INTERPRETER_TIMEOUT_MS) || 2_500,
  });

  // Metadata deliberately contains no question, identity, prompt or model output.
  console.info('[pearl/interpreter]', JSON.stringify({ ...result.audit, route: result.route, reason: result.reason }));
  let answer = null;
  if (result.route === 'ai' && result.interpretation && !result.interpretation.needsClarification) {
    const selectedProduct = result.interpretation.productIds[0];
    const selected = products.find((item) => item.id === selectedProduct);
    answer = result.interpretation.goalIds.length
      ? answerQuestion(question, [], { adminPreview: true, interpretedGoalIds: result.interpretation.goalIds })
      : selected
        ? answerQuestion(`Tell me about ${selected.label}`, [], { adminPreview: true })
        : null;
  }
  return NextResponse.json({ ok: true, ...result, answer });
}
