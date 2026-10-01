import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { getCustomerEmail, deleteCustomerEmail } from '@/lib/db/customerEmails';

// One saved email: read it, or remove it (task ce308493).
//
// GET is what "show me the email you sent to the customer" opens. It hands back the formatted
// version so what appears on screen is the email as they received it, not a stripped-down shadow
// of it.
//
// DELETE is what Kieran asked for on 19 September: "There must also be an option to delete or edit
// saved emails too." It removes the saved copy and nothing else. There is no PUT: a sent email is
// the record of what a customer was actually sent, and one that can be rewritten afterwards stops
// being evidence of anything. Reusing the wording is done by opening a copy in the composer.
//
// Everything under /api/admin is already behind the admin session cookie in src/proxy.ts.

export const dynamic = 'force-dynamic';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not connected.' }, { status: 503 });
  const { id: raw } = await props.params;
  const id = parseId(raw);
  if (!id) return NextResponse.json({ error: 'That is not an email we can look up.' }, { status: 400 });

  try {
    const email = await getCustomerEmail(id);
    if (!email) return NextResponse.json({ error: 'That email is no longer saved.' }, { status: 404 });
    return NextResponse.json({ email });
  } catch {
    return NextResponse.json({ error: 'The email could not be opened. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not connected.' }, { status: 503 });
  const { id: raw } = await props.params;
  const id = parseId(raw);
  if (!id) return NextResponse.json({ error: 'That is not an email we can look up.' }, { status: 400 });

  try {
    const removed = await deleteCustomerEmail(id);
    if (!removed) return NextResponse.json({ error: 'That email had already gone.' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: 'The email could not be deleted. Please try again.' }, { status: 500 });
  }
}
