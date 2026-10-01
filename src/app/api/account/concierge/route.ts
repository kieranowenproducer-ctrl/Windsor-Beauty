// The Account Concierge endpoint. Authenticated, session-scoped, metered.
//
// This is deliberately NOT /api/support/chat. That route is public and
// anonymous by design (it drives the storefront widget). This one refuses
// anybody without a valid customer session cookie, because every tool behind
// it reads the signed-in customer's own records.
//
// Since Stage 5 of the assistant merge (2026-08-03) the ENGINE lives in the
// hosted concierge service — one codebase for every surface. This route keeps
// the three things that genuinely belong to the website: the session cookie
// check (the identity boundary), the availability decision, and the cost
// ledger write. The verified identity is passed to the service, which scopes
// every tool to it exactly as the in-app engine did.
//
// POST   ask a question
// DELETE erase this customer's concierge history (a GDPR request they can
//        action themselves, no ticket required)

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { countPaidOrdersByCustomerId } from '@/lib/db';
import { LIMITS, customerActor, staffActor } from '@/lib/concierge/governor';
import { conciergeAvailableTo, isSignedInAdmin, CONCIERGE_NOT_AVAILABLE } from '@/lib/concierge/availability';
import {
  askConciergeService, recordServiceCharges, conciergeServiceConfigured, ConciergeServiceError,
} from '@/lib/concierge/service';
import { pearlHandoffTarget } from '@/lib/concierge/pearl-handoff.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TENANT = 'windsor-glow';

function db() {
  return neon(process.env.AISUPPORT_DATABASE_URL as string);
}

export async function POST(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  /* Windsor Glow's own staff can use the assistant without a customer account of their own, so
   * that anyone reviewing it can simply sign in to the admin panel and try it. See below for what
   * that does and does not give them. */
  const admin = isSignedInAdmin(request);
  if (!customer && !admin) {
    return NextResponse.json(
      { error: 'Please sign in to use the concierge.' },
      { status: 401 },
    );
  }

  /* NOT OPEN TO CUSTOMERS YET. Checked here, on the server, because this is the only gate that
   * matters: hiding the card and redirecting the page are conveniences a customer can walk past
   * by typing the address. Kieran's own account passes through it via CONCIERGE_TEST_ACCOUNTS,
   * and staff pass through it by being signed in to the admin panel. */
  if (!conciergeAvailableTo(customer?.email ?? null, { isAdmin: admin })) {
    return NextResponse.json({ error: CONCIERGE_NOT_AVAILABLE }, { status: 403 });
  }

  if (!conciergeServiceConfigured()) {
    return NextResponse.json(
      { error: 'The concierge is not configured yet.' },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const message = String((body as Record<string, unknown>).message ?? '').trim();
  if (!message) return NextResponse.json({ error: 'Empty message' }, { status: 400 });
  if (message.length > LIMITS.maxMessageChars) {
    return NextResponse.json(
      {
        error: `That message is longer than I can take in one go (${LIMITS.maxMessageChars} characters). Send me the important part and I will work from that.`,
      },
      { status: 413 },
    );
  }

  const rawHistory = Array.isArray((body as Record<string, unknown>).history)
    ? ((body as Record<string, unknown>).history as unknown[])
    : [];
  const history = rawHistory
    .slice(-LIMITS.maxHistoryTurns)
    .map((h) => {
      const item = h as { role?: unknown; content?: unknown };
      return {
        role: item.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: String(item.content ?? '').slice(0, 4000),
      };
    })
    .filter((h) => h.content);

  const conversationId: string | null =
    typeof (body as Record<string, unknown>).conversationId === 'string'
      ? ((body as Record<string, unknown>).conversationId as string)
      : null;

  try {
    // For the customer line in the prompt: has this person ordered before?
    // (The service checks conversation ownership itself, against the same
    // shared database this route always used.)
    const paidOrderCount = customer ? await countPaidOrdersByCustomerId(customer.id).catch(() => 0) : 0;

    /* A STAFF TURN CARRIES NO CUSTOMER IDENTITY, and that is the whole safety
     * property here. The service only switches on the account toolset when it
     * is handed a session with a real customer id and email; with none, it
     * answers as it does to a member of the public. So an admin without a
     * customer account gets the shop, the delivery promises, the policies and
     * the published guides, and the order-lookup tools are never even offered
     * to the model. There is no customer to scope them to, so there is nothing
     * to scope them wrongly to. Never invent a session here to fill the gap. */
    const r = await askConciergeService({
      surface: 'account',
      channel: 'account',
      message,
      history,
      conversationId,
      actor: customer ? customerActor(customer.id) : staffActor(),
      session: customer
        ? {
            customerId: customer.id,
            email: customer.email,
            firstName: customer.first_name ?? null,
          }
        : undefined,
      orderCount: customer ? paidOrderCount : undefined,
    });

    // The accounting, in the app that owns the ledger, from the vendor token
    // counts the service reported.
    await recordServiceCharges(r, 'account');

    // The hosted service is the first routing check. PEARL's own full
    // catalogue is the second, local safety net, so shorthand such as "reta"
    // cannot be missed merely because the service failed to attach a button.
    const researchChat = pearlHandoffTarget(message, r.researchChat);

    const res = NextResponse.json({
      ok: true,
      conversationId: r.conversationId,
      answer: r.answer,
      citations: r.citations,
      escalate: r.escalate,
      checkedLiveData: r.checkedLiveData,
      limited: r.limited ?? null,
      // { url, label } when the service redirected a dosage or research
      // question to PEARL, which on this page is the tab
      // sitting right next to this one.
      researchChat,
    });
    if (r.retryAfterSeconds) res.headers.set('Retry-After', String(r.retryAfterSeconds));
    return res;
  } catch (err) {
    if (err instanceof ConciergeServiceError && err.status === 429) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    console.error('[account/concierge]', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Sorry, something went wrong at our end. Please try again, or use the contact page to reach the team.' },
      { status: 500 },
    );
  }
}

/**
 * Erase this customer's concierge history. Deletes their messages and
 * conversations only. Support cases are NOT deleted: they are a record of a
 * request the business has to act on and may be legally obliged to keep, and
 * the customer is told that in the UI rather than being quietly surprised.
 */
export async function DELETE(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!process.env.AISUPPORT_DATABASE_URL) {
    return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  }
  const sql = db();
  try {
    const rows = (await sql`
      SELECT id FROM conversations
      WHERE tenant_id = ${TENANT} AND customer_id = ${customer.id}`) as { id: string }[];
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      await sql`DELETE FROM messages WHERE conversation_id = ANY(${ids}::uuid[])`;
      // Detach any case from the deleted conversation so the team keeps the
      // case but the transcript is gone.
      await sql`UPDATE support_cases SET conversation_id = NULL WHERE conversation_id = ANY(${ids}::uuid[])`;
      await sql`DELETE FROM conversations WHERE id = ANY(${ids}::uuid[])`;
    }
    return NextResponse.json({ ok: true, deletedConversations: rows.length });
  } catch (err) {
    console.error('[account/concierge DELETE]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not delete right now.' }, { status: 500 });
  }
}
