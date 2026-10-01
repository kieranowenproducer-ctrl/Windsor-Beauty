// Windsor Glow's binding to the one AI cost ledger.
//
// The ledger itself lives in `ledger.ts` beside this file and is a byte-for-byte copy of the one
// in the social engine. `npm run check:costs` compares them, so the two cannot drift the way the
// two pricing tables drifted before anyone noticed they disagreed about Sonnet 5.
//
// WHY THIS APP WRITES TO ANOTHER APP'S DATABASE.
//
// Windsor Glow's shop lives in one Neon database, the concierge's conversations in a second, and
// the social engine's in a third. Kieran asked for ONE figure for what a month of AI costs, and
// Postgres cannot answer a question across three databases. The options were a fourth database, a
// nightly reconciliation, or one of the three holding the ledger and the others writing to it.
// The third is the only one with no job to keep two copies agreeing, so the ledger lives in
// `socialengine`, next to the dashboard that reads it, and this file opens a second connection.
//
// TWO RULES THAT MAKE THAT SAFE, AND BOTH MATTER MORE THAN THE CONNECTION ITSELF.
//
//   1. A LEDGER FAILURE NEVER FAILS A CUSTOMER'S TURN. Everything here swallows its errors and
//      complains to the log. A customer asking about their order must not see an error because a
//      bookkeeping row would not write in a database they have never heard of.
//   2. NO CUSTOMER IS EVER NAMED. The actor is the literal word "customer" and the link is a
//      conversation id. The cost dashboard has no business knowing who was asking, only that a
//      conversation happened and what it came to.
import { neon } from '@neondatabase/serverless';
import { chargeSpent, type Charge, type Area, type Operation } from './ledger';
import { priceTokens, priceEmbedding, priceTranscription, type TokenUsage } from './pricing';

export type { Area, Operation };

/**
 * The brand every Windsor Glow charge is filed against.
 *
 * The ledger is keyed by brand because the social engine can hold several. There is one here and
 * it is the same Windsor Glow row the engine uses, so a month reads as one business rather than
 * two halves that have to be added up by hand.
 */
const WG_BRAND_ENV = 'AI_COSTS_BRAND_ID';

let cachedSql: ReturnType<typeof neon> | null = null;

/**
 * The ledger connection, or null when it is not configured.
 *
 * Null rather than throwing, so an environment without the variable set (a preview deployment, a
 * local checkout, a colleague running the shop without the engine) still serves customers
 * perfectly. It simply records nothing, and says so once in the log rather than on every turn.
 */
function ledgerSql(): ReturnType<typeof neon> | null {
  if (cachedSql) return cachedSql;
  const url = process.env.AI_COSTS_DATABASE_URL;
  if (!url) return null;
  cachedSql = neon(url);
  return cachedSql;
}

/** Whether spending from this app is being written down at all. Shown on the admin screen. */
export function costLedgerConfigured(): boolean {
  return Boolean(process.env.AI_COSTS_DATABASE_URL && process.env[WG_BRAND_ENV]);
}

let warned = false;

/**
 * Write one charge. Never throws, never blocks, never names a customer.
 *
 * Deliberately fire-and-forget from the caller's point of view: the concierge awaits it because
 * the request is about to end anyway and an unawaited promise in a serverless function is a
 * promise that may never run, but nothing downstream branches on the result.
 */
async function record(entry: Omit<Charge, 'brandId'>): Promise<void> {
  const sql = ledgerSql();
  const brandId = process.env[WG_BRAND_ENV];
  if (!sql || !brandId) {
    if (!warned) {
      warned = true;
      console.warn('[costs] AI spending from this app is NOT being recorded: set '
        + `AI_COSTS_DATABASE_URL and ${WG_BRAND_ENV}.`);
    }
    return;
  }
  try {
    await chargeSpent(sql as never, { ...entry, brandId });
  } catch (error) {
    // chargeSpent already swallows its own errors; this catches a connection that will not open.
    console.error(`[costs] could not reach the ledger: ${(error as Error).message}`);
  }
}

/* ── What this app actually spends on ─────────────────────────────────────── */

/**
 * One model turn in a customer conversation.
 *
 * `silent` is set on every one of these and it is the whole reason the flag exists: the cost
 * notification is driven by charges nobody has been shown, and a customer must never be shown
 * one. Marking it seen at the moment it is written means it can never appear in anybody's
 * notification queue, including an administrator's.
 */
export async function recordConciergeTurn(input: {
  model: string;
  usage: TokenUsage;
  conversationId: string | null;
  /** Which surface: the signed-in account concierge or the public storefront widget. */
  surface: 'account' | 'widget';
  status?: 'ok' | 'failed';
  error?: string | null;
}): Promise<number> {
  const priced = priceTokens(input.model, input.usage);
  await record({
    area: 'ai_concierge',
    operation: 'concierge_reply',
    provider: 'anthropic',
    model: input.model,
    actor: 'customer',
    actorKind: 'customer',
    conversationId: input.conversationId,
    pence: priced.pence,
    usd: priced.usd,
    fxRate: priced.fxRate,
    units: { ...input.usage, surface: input.surface },
    status: input.status ?? 'ok',
    error: input.error ?? null,
    silent: true,
  });
  return priced.pence;
}

/**
 * Turning a question into a vector so the knowledge base can be searched.
 *
 * Every concierge turn that reaches the model does this first, and until now it was priced at
 * nothing anywhere. It is genuinely tiny, a few hundredths of a penny, and that is exactly why it
 * went unrecorded for so long. "Too small to bother with" is how the other five unmetered paths
 * got that way.
 */
export async function recordEmbedding(input: {
  model: string;
  tokens: number;
  conversationId: string | null;
}): Promise<number> {
  const priced = priceEmbedding(input.model, input.tokens);
  await record({
    area: 'ai_concierge',
    operation: 'embedding',
    provider: 'openai',
    model: input.model,
    actor: 'customer',
    actorKind: 'customer',
    conversationId: input.conversationId,
    pence: priced.pence,
    usd: priced.usd,
    fxRate: priced.fxRate,
    units: { tokens: input.tokens },
    // The published rate for this model has not been confirmed against OpenAI's page, unlike
    // every other figure in the pricing module, so the row says so rather than implying it was.
    isEstimate: !priced.confirmed,
    silent: true,
  });
  return priced.pence;
}

/**
 * Dictating into an admin field. Staff, not a customer, so this one is NOT silent.
 *
 * It is the cheapest thing in the ledger and it was the last completely unrecorded one: the admin
 * voice-to-text has been calling whisper-1 on every dictated note since it was built, at twice the
 * price of the transcription the studio uses, and no table anywhere had heard of it.
 */
/**
 * A customer dictating into the concierge. Silent for the same reason every
 * customer-facing charge is: a cost notification must never be driven by a
 * charge a customer produced. Priced at the studio's model rate
 * (gpt-4o-mini-transcribe), half of whisper-1.
 */
export async function recordCustomerTranscription(input: {
  seconds: number;
  conversationId?: string | null;
}): Promise<number> {
  const priced = priceTranscription('gpt-4o-mini-transcribe', input.seconds);
  await record({
    area: 'ai_concierge',
    operation: 'transcribe',
    provider: 'openai',
    model: 'gpt-4o-mini-transcribe',
    actor: 'customer',
    actorKind: 'customer',
    conversationId: input.conversationId ?? null,
    pence: priced.pence,
    usd: priced.usd,
    fxRate: priced.fxRate,
    units: { seconds: input.seconds },
    silent: true,
  });
  return priced.pence;
}

/**
 * A Pearl admin AI call (Pearl plan Stage D step 10): drafting facts from a
 * stored page, suggesting wordings, or summarising retrieved passages. Staff
 * pressed the button, so it is not silent. The ledger's operation names are a
 * frozen shared union, so the closest existing names are used and the exact
 * Pearl context travels in the units where the dashboard can read it.
 */
export async function recordPearlAi(input: {
  operation: 'distillation' | 'interpretation';
  context: 'pearl_extract' | 'pearl_expand' | 'pearl_expand_search' | 'pearl_summarise' | 'pearl_conversation';
  provider?: 'anthropic' | 'openai';
  model: string;
  usage: TokenUsage;
  who: string;
  status?: 'ok' | 'failed';
  error?: string | null;
}): Promise<number> {
  const priced = priceTokens(input.model, input.usage);
  await record({
    area: 'admin',
    operation: input.operation,
    provider: input.provider ?? 'anthropic',
    model: input.model,
    actor: input.who,
    actorKind: 'staff',
    pence: priced.pence,
    usd: priced.usd,
    fxRate: priced.fxRate,
    units: { ...input.usage, context: input.context },
    status: input.status ?? 'ok',
    error: input.error ?? null,
  });
  return priced.pence;
}

/** The most Pearl's AI buttons may spend in one day, in pence. Set with
 *  PEARL_AI_DAILY_CAP_PENCE; the default is 200 (£2 a day). Costs are
 *  pennies per click, so the cap is a runaway stop, not a working limit. */
export function pearlAiDailyCapPence(): number {
  const raw = Number(process.env.PEARL_AI_DAILY_CAP_PENCE);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 200;
}

/**
 * What Pearl's AI buttons have spent so far today (Pearl repairs Stage E),
 * read from the one ledger before each call. Null when the ledger is not
 * configured or unreachable, and the caller tells those two apart (see
 * lib/pearl/ai-spend.ts): not configured means spending is not written down
 * here by design, so the call goes ahead rather than blocking an admin's work
 * on missing bookkeeping; unreachable means the ceiling is broken rather than
 * switched off, so the call stops and says so.
 */
export async function pearlAiSpentTodayPence(): Promise<number | null> {
  const sql = ledgerSql();
  if (!sql) return null;
  try {
    const rows = await sql`
      SELECT coalesce(sum(cost_pence), 0)::float8 AS spent
      FROM ai_costs
      WHERE units->>'context' LIKE 'pearl%'
        AND created_at >= date_trunc('day', now())
    ` as Array<{ spent: number }>;
    return Math.round(rows[0]?.spent ?? 0);
  } catch (error) {
    console.error('[costs] could not read Pearl AI spend for the daily cap:', error);
    return null;
  }
}

export async function recordAdminTranscription(input: {
  seconds: number;
  who: string;
  context?: string;
}): Promise<number> {
  const priced = priceTranscription('whisper-1', input.seconds);
  await record({
    area: 'admin',
    operation: 'transcribe',
    provider: 'openai',
    model: 'whisper-1',
    actor: input.who,
    actorKind: 'staff',
    pence: priced.pence,
    usd: priced.usd,
    fxRate: priced.fxRate,
    units: { seconds: input.seconds, context: input.context ?? 'general' },
  });
  return priced.pence;
}
