import { NextResponse } from 'next/server';
import { isDbConfigured, unsubscribeMarketingContactByToken } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public, token-based opt-out — linked from every marketing email footer.
// No sign-in required so recipients can unsubscribe in one click.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'This link is temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }

  // Token comes from the JSON body (the /unsubscribe page flow) OR the query
  // string (email-client one-click List-Unsubscribe, where the POST body is the
  // literal "List-Unsubscribe=One-Click" rather than JSON — so json() fails and
  // we fall back to the query token).
  const queryToken = new URL(request.url).searchParams.get('token');
  const body = await request.json().catch(() => null);
  const token = (typeof body?.token === 'string' ? body.token.trim() : '') || (queryToken ? queryToken.trim() : '');

  if (!token) {
    return NextResponse.json({ error: 'Missing unsubscribe token.' }, { status: 400 });
  }

  const contact = await unsubscribeMarketingContactByToken(token);
  if (!contact) {
    return NextResponse.json({ error: 'This unsubscribe link is invalid or has expired.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, email: contact.email });
}
