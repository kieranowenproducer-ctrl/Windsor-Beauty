// Public chat endpoint for the AI support widget.
//
// Since Stage 5 of the assistant merge (2026-08-03) this is a thin front door:
// it decides whether the widget is open (a server decision, never a UI one),
// names the anonymous caller for the governor, and passes the turn to the
// hosted concierge service — the ONE codebase that answers every surface.
// Compliance, escalation, redaction, rate limits, spending ceilings and
// conversation logging all happen in the service; the ledger write for what
// the turn cost happens here, in the app that owns the ledger.
import { NextResponse } from 'next/server';
import { ipActor } from '@/lib/concierge/governor';
import { publicWidgetOpen, CONCIERGE_NOT_AVAILABLE } from '@/lib/concierge/availability';
import {
  askConciergeService, recordServiceCharges, conciergeServiceConfigured, ConciergeServiceError,
} from '@/lib/concierge/service';
import { pearlHandoffTarget } from '@/lib/concierge/pearl-handoff.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  /* THE FRONT DOOR, and it is checked before anything else costs anything.
   * An endpoint nobody can see is still an endpoint anybody can call.
   * Refusing here, on the server, is what makes "the widget is off" true
   * rather than merely invisible. */
  if (!publicWidgetOpen()) {
    return NextResponse.json({ error: CONCIERGE_NOT_AVAILABLE }, { status: 403 });
  }
  if (!conciergeServiceConfigured()) {
    return NextResponse.json({ error: 'Support assistant is not configured yet.' }, { status: 503 });
  }

  const b = await request.json().catch(() => ({}));
  const message = String(b.message ?? '').slice(0, 2000).trim();
  if (!message) return NextResponse.json({ error: 'Empty message' }, { status: 400 });
  const history = Array.isArray(b.history)
    ? b.history.slice(-8).map((h: { role?: unknown; content?: unknown }) => ({
        role: h.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: String(h.content ?? '').slice(0, 4000),
      }))
    : [];

  // Anonymous callers are keyed by a hash of their IP; the raw address is
  // never stored. The service enforces the limits against this name.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const actor = await ipActor(ip);

  try {
    const r = await askConciergeService({
      surface: 'public',
      channel: 'web',
      message,
      history,
      conversationId: typeof b.conversationId === 'string' ? b.conversationId : null,
      actor,
    });

    // The accounting, in the app that owns the ledger, from the vendor token
    // counts the service reported.
    await recordServiceCharges(r, 'widget');

    const res = NextResponse.json({
      ok: true,
      conversationId: r.conversationId,
      answer: r.answer,
      escalate: r.escalate,
      confidence: r.confidence,
      citations: r.citations,
      // { url, label } when the service redirected a dosage or research
      // question to the separate PEARL library. The widget draws its button
      // from this and nothing else.
      researchChat: pearlHandoffTarget(message, r.researchChat),
    });
    if (r.retryAfterSeconds) res.headers.set('Retry-After', String(r.retryAfterSeconds));
    return res;
  } catch (err) {
    if (err instanceof ConciergeServiceError && err.status === 429) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    console.error('[support/chat]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Sorry, something went wrong. Please try again or email us.' }, { status: 500 });
  }
}
