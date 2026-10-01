import { NextResponse } from 'next/server';
import { deleteMarketingContact, isDbConfigured, listMarketingContacts, setMarketingConsentByEmail } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Manual unsubscribe from the admin contacts table — { consent: false }.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid contact id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.consent !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const contacts = await listMarketingContacts();
  const contact = contacts.find(c => c.id === id);
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });
  }

  await setMarketingConsentByEmail(contact.email, body.consent);
  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid contact id.' }, { status: 400 });
  }

  const deleted = await deleteMarketingContact(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
