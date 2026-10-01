// Keeping a record of PEARL questions. The legacy route name remains compatible.
//
// PEARL answers inside the member's own browser: it imports the
// answering engine straight into the bundle and never asks a server anything.
// That means nothing anywhere knew a question had been asked. This route is the
// ONLY server contact that desk has, and all it does is write the record down.
//
// It does NOT answer anything and it does NOT touch the answering engine. The
// answer has already been produced and shown by the time this is called; the body
// carries a copy of it purely so the record is complete.
//
// Signed-in only, exactly like /api/account/concierge: a member with a customer
// session, or Windsor Glow staff signed in to the admin panel. Anonymous callers
// are refused, so this cannot be used as an open write endpoint.

import { NextResponse } from 'next/server';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { conciergeAvailableTo, isSignedInAdmin, CONCIERGE_NOT_AVAILABLE } from '@/lib/concierge/availability';
import { recordResearchQuestion, type ResearchAnswerRecord } from '@/lib/db/researchQuestions';
import { isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export async function POST(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  const admin = isSignedInAdmin(request);
  if (!customer && !admin) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  }

  /* The same gate the research desk itself is behind. Without it, any signed-in
     member could post rows straight into an admin audit table without ever being
     able to open the desk, which is exactly the kind of abuse of our own systems
     we are trying to be able to see. */
  if (!conciergeAvailableTo(customer?.email ?? null, { isAdmin: admin })) {
    return NextResponse.json({ error: CONCIERGE_NOT_AVAILABLE }, { status: 403 });
  }

  /* Nothing to write to. Answered as a success on purpose: the member has their
     answer already, and a failure here is our problem, not something to put in
     front of them. */
  if (!isDbConfigured()) return NextResponse.json({ ok: true });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const question = asString(payload.question);
  if (!question || !question.trim()) {
    return NextResponse.json({ error: 'Nothing to record.' }, { status: 400 });
  }

  const rawAnswer = (payload.answer ?? {}) as Record<string, unknown>;
  const answer: ResearchAnswerRecord = {
    kind: asString(rawAnswer.kind),
    title: asString(rawAnswer.title),
    summary: asString(rawAnswer.summary),
    compounds: Array.isArray(rawAnswer.compounds)
      ? (rawAnswer.compounds.filter((c) => typeof c === 'string') as string[])
      : [],
    raw: payload.answer ?? null,
  };

  const name = customer
    ? [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() || null
    : null;

  /* Awaited so a genuine database fault is visible in the server log rather than
     silently dropped, but the function itself never throws, and the browser does
     not wait for this response before showing the answer. */
  await recordResearchQuestion({
    customerId: customer?.id ?? null,
    name,
    email: customer?.email ?? null,
    isStaff: !customer && admin,
    question,
    answer,
    request,
  });

  return NextResponse.json({ ok: true });
}
