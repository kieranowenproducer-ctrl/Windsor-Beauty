/**
 * Optional conversational phrasing for PEARL after deterministic retrieval.
 *
 * This module has no search tools and cannot retrieve evidence. The server must
 * supply a compact, approved evidence packet. Protected intents bypass AI.
 */

export const PEARL_CONVERSATION_MODEL = 'gpt-5.6-luna' as const;
export const PEARL_CONVERSATION_PROMPT_VERSION = 'pearl-conversation-v3' as const;

export type PearlConversationTurn = {
  role: 'user' | 'assistant';
  text: string;
  productIds: string[];
  goalIds: string[];
};

export type PearlEvidenceItem = {
  sourceId: string;
  productId: string;
  goalIds: string[];
  summary: string;
  limitations: string;
};

export type PearlConversationAnswer = {
  title: string;
  summary: string;
  matches: Array<{ productId: string; explanation: string; sourceIds: string[] }>;
  sourceIds: string[];
  followUp: string;
};

export type PearlConversationResult = {
  answer: PearlConversationAnswer | null;
  route: 'ai' | 'deterministic';
  reason: string;
  audit: {
    model: typeof PEARL_CONVERSATION_MODEL;
    promptVersion: typeof PEARL_CONVERSATION_PROMPT_VERSION;
    attempts: number;
    questionCharacters: number;
    priorTurnCount: number;
    evidenceItemCount: number;
    usage: { input_tokens: number; output_tokens: number };
  };
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const EMERGENCY = /\b(?:overdose|overdosed|took too much|taken too much|cannot breathe|can't breathe|trouble breathing|chest pain|unconscious|seizure|anaphylaxis|allergic reaction|passed out|vomiting blood)\b/i;
const PROCEDURE = /\b(?:how|where)\b.{0,40}\b(?:inject|reconstitute|mix|administer)|\b(?:injection site|syringe|bacteriostatic water)\b/i;
const DOSE = /\b(?:dose|doses|dosage|amount|how much|protocol|regimen|schedule|cycle|mg|mcg|micrograms?|milligrams?|units?)\b/i;
const COMBINATION = /\b(?:stack|stacking|combine|combination|pair|together|same syringe|with each other)\b/i;

export function interpretAudienceBenefitQuestion(question: string): string {
  return String(question || '')
    .replace(/\bwho does (it|this|that) work for\b/gi, 'what does $1 do and what benefits is $1 researched for')
    .replace(/\bwho (?:is|would) (it|this|that) for\b/gi, 'what does $1 do and what benefits is $1 researched for')
    .replace(/\bwhat (?:kind|type) of (?:person|people) does (it|this|that) (?:work for|help)\b/gi, 'what does $1 do and what benefits is $1 researched for')
    .replace(/\bwho does ([a-z0-9+ -]{2,80}?) work for\b/gi, 'what does $1 do and what benefits is $1 researched for');
}

export function protectedConversationRoute(question: string): 'emergency' | 'procedure' | 'dose' | 'combination' | null {
  if (EMERGENCY.test(question)) return 'emergency';
  if (PROCEDURE.test(question)) return 'procedure';
  if (DOSE.test(question)) return 'dose';
  if (COMBINATION.test(question)) return 'combination';
  return null;
}

function redact(text: string, limit: number): string {
  return String(text ?? '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b(?:\+?44\s?\d|0\d)(?:[\s()-]*\d){8,10}\b/g, '[phone removed]')
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, '[card number removed]')
    .replace(/\b(?:sk|pk|rk)[-_][A-Za-z0-9-_]{10,}\b/g, '[key removed]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, '[token removed]')
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, '[postcode removed]')
    .trim().slice(0, limit);
}

function allowed(values: unknown, ids: ReadonlySet<string>, maximum: number): values is string[] {
  return Array.isArray(values) && values.length <= maximum
    && values.every((value) => typeof value === 'string' && ids.has(value));
}

function schema(productIds: string[], sourceIds: string[]) {
  const enumOrNone = (ids: string[]) => ({ type: 'string', enum: ids.length ? ids : ['__none__'] });
  return {
    type: 'object', additionalProperties: false,
    required: ['title', 'summary', 'matches', 'sourceIds', 'followUp'],
    properties: {
      title: { type: 'string', maxLength: 120 },
      summary: { type: 'string', maxLength: 420 },
      matches: {
        type: 'array', maxItems: 3,
        items: {
          type: 'object', additionalProperties: false,
          required: ['productId', 'explanation', 'sourceIds'],
          properties: {
            productId: enumOrNone(productIds),
            explanation: { type: 'string', maxLength: 220 },
            sourceIds: { type: 'array', minItems: 1, maxItems: 6, items: enumOrNone(sourceIds) },
          },
        },
      },
      sourceIds: { type: 'array', maxItems: 12, items: enumOrNone(sourceIds) },
      followUp: { type: 'string', maxLength: 120 },
    },
  };
}

function outputText(body: unknown): string {
  const response = body as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (typeof response?.output_text === 'string') return response.output_text;
  return response?.output?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === 'output_text')?.text ?? '';
}

export async function answerPearlConversation(input: {
  question: string;
  priorTurns: PearlConversationTurn[];
  evidence: PearlEvidenceItem[];
  allowedProductIds: ReadonlySet<string>;
  allowedGoalIds: ReadonlySet<string>;
  allowedSourceIds: ReadonlySet<string>;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}): Promise<PearlConversationResult> {
  const question = redact(interpretAudienceBenefitQuestion(input.question), 500);
  const evidence = input.evidence.filter((item) =>
    input.allowedProductIds.has(item.productId)
    && input.allowedSourceIds.has(item.sourceId)
    && item.goalIds.every((id) => input.allowedGoalIds.has(id)))
    .slice(0, 18)
    .map((item) => ({ ...item, summary: redact(item.summary, 700), limitations: redact(item.limitations, 400) }));
  const turns = input.priorTurns.slice(-20).map((turn) => ({
    role: turn.role,
    text: redact(turn.text, 240),
    productIds: turn.productIds.filter((id) => input.allowedProductIds.has(id)).slice(0, 3),
    goalIds: turn.goalIds.filter((id) => input.allowedGoalIds.has(id)).slice(0, 3),
  }));
  const audit = {
    model: PEARL_CONVERSATION_MODEL,
    promptVersion: PEARL_CONVERSATION_PROMPT_VERSION,
    attempts: 0,
    questionCharacters: question.length,
    priorTurnCount: turns.length,
    evidenceItemCount: evidence.length,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
  const protectedRoute = protectedConversationRoute(input.question);
  if (protectedRoute) return { answer: null, route: 'deterministic', reason: `protected_${protectedRoute}`, audit };
  if (!question || !input.apiKey || !evidence.length) {
    return { answer: null, route: 'deterministic', reason: 'not_configured_or_no_evidence', audit };
  }

  const productIds = Array.from(new Set(evidence.map((item) => item.productId)));
  const sourceIds = Array.from(new Set(evidence.map((item) => item.sourceId)));
  const sourcesByProduct = new Map(productIds.map((id) => [
    id,
    new Set(evidence.filter((item) => item.productId === id).map((item) => item.sourceId)),
  ]));
  const requestBody = {
    model: PEARL_CONVERSATION_MODEL,
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: 500,
    instructions: 'Answer only from the supplied PEARL evidence. Every supplied source is allowed, including commercial, community and tertiary sources. Source quality changes the disclosure and confidence, never whether the supplied fact may be used. Never invent a fact, product, source, dose, procedure, combination, personal recommendation or suitability judgement. Synthesise a direct answer in natural language instead of copying passages. Treat “who does it work for?”, “who is it for?” and equivalent general wording as a question about researched uses and potential benefits. Explain the kind of goal the research relates to, then state the evidence strength and limitations; do not turn it into personal suitability advice. Use the full conversation to resolve short follow-ups, corrections and pronouns. Consider every supplied evidence item before selecting one strongest match when clear, otherwise no more than three. Keep each explanation to one short sentence. For explicit questions about men, women, ages or study participants, report only population details explicitly present in the evidence and say when none are stated. State uncertainty found in limitations. Source IDs and product IDs must come from the evidence packet. If evidence does not answer the question, do not guess.',
    input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ question, priorTurns: turns, approvedEvidence: evidence }) }] }],
    text: { format: { type: 'json_schema', name: 'pearl_conversation_answer', strict: true, schema: schema(productIds, sourceIds) }, verbosity: 'low' },
  };

  const fetchImpl = input.fetchImpl ?? fetch;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    audit.attempts = attempt;
    try {
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(Math.max(250, Math.min(input.timeoutMs ?? 3_000, 10_000))),
      });
      if (!response.ok) {
        if (attempt === 1 && (response.status === 429 || response.status >= 500)) continue;
        return { answer: null, route: 'deterministic', reason: `api_${response.status}`, audit };
      }
      const raw = await response.json() as { usage?: { input_tokens?: number; output_tokens?: number } };
      audit.usage = { input_tokens: Number(raw.usage?.input_tokens) || 0, output_tokens: Number(raw.usage?.output_tokens) || 0 };
      const parsed = JSON.parse(outputText(raw)) as Partial<PearlConversationAnswer>;
      const matchesValid = Array.isArray(parsed.matches) && parsed.matches.length <= 3 && parsed.matches.every((match) =>
        match && input.allowedProductIds.has(match.productId) && productIds.includes(match.productId)
        && typeof match.explanation === 'string' && match.explanation.length <= 220
        && allowed(match.sourceIds, input.allowedSourceIds, 6)
        && match.sourceIds.every((id) => sourcesByProduct.get(match.productId)?.has(id)));
      if (typeof parsed.title !== 'string' || parsed.title.length > 120
        || typeof parsed.summary !== 'string' || parsed.summary.length > 420
        || typeof parsed.followUp !== 'string' || parsed.followUp.length > 120
        || !matchesValid || !allowed(parsed.sourceIds, input.allowedSourceIds, 12)
        || !parsed.sourceIds.every((id) => sourceIds.includes(id))) {
        return { answer: null, route: 'deterministic', reason: 'invalid_or_ungrounded_output', audit };
      }
      return { answer: parsed as PearlConversationAnswer, route: 'ai', reason: 'ok', audit };
    } catch (error) {
      if (attempt === 1 && !(error instanceof SyntaxError)) continue;
      return { answer: null, route: 'deterministic', reason: error instanceof SyntaxError ? 'unparseable_output' : 'timeout_or_network_error', audit };
    }
  }
  return { answer: null, route: 'deterministic', reason: 'api_failed', audit };
}
