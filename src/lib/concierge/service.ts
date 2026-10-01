// The website's client for the hosted concierge service (Stage 5 of the
// assistant merge, 2026-08-03).
//
// The engine used to run inside this app, three times over: the platform's
// copy, the public widget's copy and the account concierge's copy, kept in
// step by hand. Now ONE codebase — the ai-support-agent service — answers
// every surface, and this file is all that is left here: authenticate the
// caller, pass the turn across, and put the reported charges on the cost
// ledger. A fix to the assistant lands once, in the service, and reaches both
// surfaces on its next deploy.
//
// WHY THE LEDGER WRITES STAY HERE. The one ai_costs ledger is this app's
// discipline, byte-checked against the social engine's copy by check:costs.
// The service reports what each turn consumed (per model, plus embedding
// tokens); this app records it, so the accounting rules live in exactly one
// audited place and the service never needs the ledger's credentials.

import { recordConciergeTurn, recordEmbedding } from '../costs/record';

export interface ServiceCharge {
  model: string;
  tokens: { in: number; out: number; cached: number };
}

/**
 * Where a restricted question is sent instead of being answered.
 *
 * Windsor Glow runs PEARL separately for dosage and detailed research
 * questions (Kieran's instruction, 2026-08-05). When the service redirects one,
 * it returns this object and the chat surfaces draw an Open PEARL
 * button from it. Null on every ordinary reply, which means no button.
 *
 * The URL is decided in ONE place, the service's tenant config, and never
 * assembled here. That is deliberate: a hard-coded copy in the website would be
 * a second source of truth, and the day PEARL moves it would become
 * a dead link nobody noticed.
 */
export interface ResearchChatTarget {
  url: string;
  label: string;
}

export interface ServiceReply {
  ok: boolean;
  conversationId: string | null;
  answer: string;
  escalate: boolean;
  confidence: string | null;
  researchChat: ResearchChatTarget | null;
  citations: { title?: string; label?: string; url: string; kind?: string; direct?: boolean }[];
  intent: string | null;
  route: string;
  toolsUsed: string[];
  checkedLiveData: boolean;
  limited: string | null;
  retryAfterSeconds: number | null;
  model: string | null;
  charges: ServiceCharge[];
  embeddingTokens: number;
  costUsd: number;
}

export function conciergeServiceConfigured(): boolean {
  return Boolean(process.env.CONCIERGE_SERVICE_URL && process.env.CONCIERGE_SERVICE_SECRET);
}

export class ConciergeServiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * One concierge turn, answered by the hosted service.
 *
 * The service enforces everything the in-app engines used to (compliance,
 * escalation, the governor, redaction, persistence); this caller's only
 * responsibilities are the session check it already did and the ledger write
 * afterwards.
 */
export async function askConciergeService(body: {
  surface: 'public' | 'account';
  channel: 'web' | 'account';
  message: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  conversationId: string | null;
  actor: string;
  session?: { customerId: number; email: string; firstName: string | null };
  orderCount?: number;
}): Promise<ServiceReply> {
  const url = process.env.CONCIERGE_SERVICE_URL as string;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.CONCIERGE_SERVICE_SECRET}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ tenant: 'windsor-glow', ...body }),
      signal: controller.signal,
      cache: 'no-store',
    });
    const d = (await r.json().catch(() => null)) as ServiceReply | { error?: string } | null;
    if (!r.ok || !d || (d as ServiceReply).ok !== true) {
      throw new ConciergeServiceError(r.status, (d as { error?: string })?.error ?? `service ${r.status}`);
    }
    return d as ServiceReply;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Put what the service reports this turn consumed on the one cost ledger.
 * Never throws and never blocks the reply: a bookkeeping failure must not
 * cost a customer their answer.
 */
export async function recordServiceCharges(
  reply: Pick<ServiceReply, 'charges' | 'embeddingTokens' | 'conversationId'>,
  surface: 'account' | 'widget',
): Promise<void> {
  try {
    for (const c of reply.charges ?? []) {
      if (!c?.model) continue;
      await recordConciergeTurn({
        model: c.model,
        usage: {
          input_tokens: c.tokens?.in ?? 0,
          output_tokens: c.tokens?.out ?? 0,
          cache_read_input_tokens: c.tokens?.cached ?? 0,
        },
        conversationId: reply.conversationId ?? null,
        surface,
      });
    }
    if ((reply.embeddingTokens ?? 0) > 0) {
      await recordEmbedding({
        model: 'text-embedding-3-small',
        tokens: reply.embeddingTokens,
        conversationId: reply.conversationId ?? null,
      });
    }
  } catch (err) {
    console.error('[concierge/service] ledger write failed:', err instanceof Error ? err.message : err);
  }
}
