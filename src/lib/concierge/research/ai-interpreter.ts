/**
 * PEARL's optional language interpreter.
 *
 * This module never answers a research question. It may only select IDs from
 * a caller-supplied, server-approved shortlist. The deterministic PEARL engine
 * remains responsible for safety gates, facts, wording and the final answer.
 */

export const PEARL_INTERPRETER_MODEL = 'gpt-5.6-luna' as const;

export type PearlCandidate = {
  id: string;
  label: string;
  description: string;
  sourceIds: string[];
};

export type PearlInterpretation = {
  intent: 'goal' | 'product' | 'general_research' | 'unknown';
  goalIds: string[];
  productIds: string[];
  sourceIds: string[];
  confidence: number;
  needsClarification: boolean;
  clarification: string;
};

export type PearlInterpretationResult = {
  interpretation: PearlInterpretation | null;
  route: 'ai' | 'deterministic';
  reason: string;
  audit: {
    model: typeof PEARL_INTERPRETER_MODEL;
    promptVersion: 'pearl-interpreter-v1';
    attempts: number;
    inputCharacters: number;
    candidateCounts: { goals: number; products: number; sources: number };
    usage: { input_tokens: number; output_tokens: number };
  };
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const EMERGENCY = /\b(?:overdose|overdosed|took too much|cannot breathe|can't breathe|trouble breathing|chest pain|unconscious|seizure|anaphylaxis|allergic reaction|passed out|vomiting blood)\b/i;
const PROCEDURE = /\b(?:how|where)\b.{0,40}\b(?:inject|reconstitute|mix|administer)|\b(?:injection site|syringe|bacteriostatic water)\b/i;
const DOSAGE = /\b(?:dose|doses|dosage|amount|how much|protocol|regimen|schedule|cycle|mg|mcg|micrograms?|milligrams?|units?)\b/i;

export function protectedPearlRoute(question: string): 'emergency' | 'procedure' | 'dosage' | null {
  if (EMERGENCY.test(question)) return 'emergency';
  if (PROCEDURE.test(question)) return 'procedure';
  if (DOSAGE.test(question)) return 'dosage';
  return null;
}

/** Remove identity, contact, payment and secret-shaped text before any API call. */
export function redactPearlQuestion(value: string): string {
  return String(value ?? '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b(?:\+?44\s?\d|0\d)(?:[\s()-]*\d){8,10}\b/g, '[phone removed]')
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, '[card number removed]')
    .replace(/\b(?:sk|pk|rk)[-_][A-Za-z0-9-_]{10,}\b/g, '[key removed]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, '[token removed]')
    .replace(/\b(password|passcode|pin|cvv|cvc)\b(?:\s+(?:is|=|:))?\s*\S+/gi, '$1 [removed]')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4})\b/g, '[date removed]')
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, '[postcode removed]')
    .trim()
    .slice(0, 500);
}

function cleanCandidates(items: PearlCandidate[], allowedIds: ReadonlySet<string>, limit: number): PearlCandidate[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!allowedIds.has(item.id) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, limit).map((item) => ({
    id: item.id,
    label: item.label.slice(0, 100),
    description: item.description.slice(0, 240),
    sourceIds: Array.from(new Set(item.sourceIds)).slice(0, 12),
  }));
}

function schemaFor(goals: string[], products: string[], sources: string[]) {
  const idArray = (ids: string[], maxItems: number) => ({
    type: 'array', maxItems, items: ids.length ? { type: 'string', enum: ids } : { type: 'string', enum: ['__none__'] },
  });
  return {
    type: 'object', additionalProperties: false,
    required: ['intent', 'goalIds', 'productIds', 'sourceIds', 'confidence', 'needsClarification', 'clarification'],
    properties: {
      intent: { type: 'string', enum: ['goal', 'product', 'general_research', 'unknown'] },
      goalIds: idArray(goals, 3),
      productIds: idArray(products, 3),
      sourceIds: idArray(sources, 12),
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      needsClarification: { type: 'boolean' },
      clarification: { type: 'string', maxLength: 160 },
    },
  };
}

function validIds(values: unknown, allowed: ReadonlySet<string>, max: number): values is string[] {
  return Array.isArray(values) && values.length <= max
    && values.every((value) => typeof value === 'string' && allowed.has(value));
}

function parseOutput(body: unknown): unknown {
  const response = body as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (typeof response?.output_text === 'string') return JSON.parse(response.output_text);
  const text = response?.output?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === 'output_text')?.text;
  if (!text) throw new Error('missing structured output');
  return JSON.parse(text);
}

export async function interpretPearlQuestion(input: {
  question: string;
  goals: PearlCandidate[];
  products: PearlCandidate[];
  sources: PearlCandidate[];
  allowedGoalIds: ReadonlySet<string>;
  allowedProductIds: ReadonlySet<string>;
  allowedSourceIds: ReadonlySet<string>;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}): Promise<PearlInterpretationResult> {
  const protectedRoute = protectedPearlRoute(input.question);
  const cleanQuestion = redactPearlQuestion(input.question);
  const goals = cleanCandidates(input.goals, input.allowedGoalIds, 40);
  // The current approved library has 264 entries. Keep the whole catalogue in
  // scope so uncommon plain-English goals are not silently excluded by order.
  const products = cleanCandidates(input.products, input.allowedProductIds, 350);
  const sources = cleanCandidates(input.sources, input.allowedSourceIds, 40);
  const audit = {
    model: PEARL_INTERPRETER_MODEL,
    promptVersion: 'pearl-interpreter-v1' as const,
    attempts: 0,
    inputCharacters: cleanQuestion.length,
    candidateCounts: { goals: goals.length, products: products.length, sources: sources.length },
    usage: { input_tokens: 0, output_tokens: 0 },
  };
  if (protectedRoute) return { interpretation: null, route: 'deterministic', reason: `protected_${protectedRoute}`, audit };
  if (!cleanQuestion || !input.apiKey || (!goals.length && !products.length)) {
    return { interpretation: null, route: 'deterministic', reason: 'not_configured_or_no_candidates', audit };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const goalIds = goals.map((item) => item.id);
  const productIds = products.map((item) => item.id);
  const sourceIds = sources.map((item) => item.id);
  const body = {
    model: PEARL_INTERPRETER_MODEL,
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: 350,
    instructions: 'Interpret language only. Select only IDs supplied in the approved candidates. Never add medical facts, doses, procedures, products or sources. Return at most three closest research matches. If the meaning is unclear, select nothing and ask one short clarification question.',
    input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ question: cleanQuestion, approvedCandidates: { goals, products, sources } }) }] }],
    text: { format: { type: 'json_schema', name: 'pearl_interpretation', strict: true, schema: schemaFor(goalIds, productIds, sourceIds) }, verbosity: 'low' },
  };

  let lastReason = 'api_failed';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    audit.attempts = attempt;
    try {
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(250, Math.min(input.timeoutMs ?? 2_500, 10_000))),
      });
      if (!response.ok) {
        lastReason = `api_${response.status}`;
        if (attempt === 1 && (response.status === 429 || response.status >= 500)) continue;
        break;
      }
      const responseBody = await response.json() as { usage?: { input_tokens?: number; output_tokens?: number } };
      audit.usage = {
        input_tokens: Number(responseBody.usage?.input_tokens) || 0,
        output_tokens: Number(responseBody.usage?.output_tokens) || 0,
      };
      const parsed = parseOutput(responseBody) as Partial<PearlInterpretation>;
      if (!validIds(parsed.goalIds, input.allowedGoalIds, 3)
        || !validIds(parsed.productIds, input.allowedProductIds, 3)
        || !validIds(parsed.sourceIds, input.allowedSourceIds, 12)
        || !['goal', 'product', 'general_research', 'unknown'].includes(String(parsed.intent))
        || typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1
        || typeof parsed.needsClarification !== 'boolean' || typeof parsed.clarification !== 'string') {
        return { interpretation: null, route: 'deterministic', reason: 'invalid_or_unapproved_output', audit };
      }
      return { interpretation: parsed as PearlInterpretation, route: 'ai', reason: 'ok', audit };
    } catch (error) {
      lastReason = error instanceof SyntaxError ? 'unparseable_output' : 'timeout_or_network_error';
      if (attempt === 1 && !(error instanceof SyntaxError)) continue;
      break;
    }
  }
  return { interpretation: null, route: 'deterministic', reason: lastReason, audit };
}
