import Anthropic from '@anthropic-ai/sdk';

/**
 * Pearl's one connection to the Claude API (Pearl plan Stage D step 10).
 *
 * AI is allowed into exactly three narrow places — page-to-facts drafting,
 * query expansion, and summarising retrieved passages — every one admin-only,
 * every one producing a draft or a proposal, never a change. The guards in
 * ./ai-guards.mjs enforce the boundary: AI organises, finds and phrases
 * approved material; it never supplies material of its own.
 *
 * Costs are written to the shared AI ledger on every call, success or not.
 */

export const PEARL_AI_MODEL = 'claude-opus-5';

export function pearlAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function pearlAiClient(): Anthropic {
  return new Anthropic();
}

/**
 * One structured call: ask for JSON matching a schema, refuse to guess.
 * Returns null (with a reason) when the model declines or the output does
 * not parse — an honest nothing rather than a filled gap.
 */
export async function pearlAiJson<T>(input: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
}): Promise<{ result: T | null; usage: { input_tokens: number; output_tokens: number }; refused: boolean }> {
  const client = pearlAiClient();
  const request = {
    model: PEARL_AI_MODEL,
    max_tokens: input.maxTokens ?? 8_000,
    system: input.system,
    output_config: {
      effort: input.effort ?? 'medium',
      format: { type: 'json_schema', schema: input.schema },
    },
    messages: [{ role: 'user' as const, content: input.user }],
  };
  const response = (await client.messages.create(
    request as unknown as Anthropic.MessageCreateParamsNonStreaming,
  )) as Anthropic.Message;
  const usage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  };
  if (response.stop_reason === 'refusal') return { result: null, usage, refused: true };
  const text = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')?.text || '';
  try {
    return { result: JSON.parse(text) as T, usage, refused: false };
  } catch {
    return { result: null, usage, refused: false };
  }
}
