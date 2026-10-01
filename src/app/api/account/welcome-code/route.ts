import { NextResponse } from 'next/server';
import { findUnusedWelcomeCodeForEmail, isDbConfigured } from '@/lib/db';
import { resolveCustomerFromRequest } from '@/lib/auth';

/**
 * Tells the basket about the signed-in member's own unused welcome code.
 *
 * Added 18 September 2026. A member's code was only ever in their welcome email and on their
 * account page. Maria Findrihan signed up, was issued a working 10% code, and checked out at full
 * price eight minutes later. The basket now offers it to her instead of waiting to be asked.
 *
 * It answers about the person holding the session and nobody else, it only ever returns a code that
 * is still unused, and it never explains itself: if anything at all goes wrong it simply says there
 * is no code, because a broken side panel must not stop somebody buying something.
 */
export async function GET(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ code: null });
  try {
    const customer = await resolveCustomerFromRequest(request);
    if (!customer) return NextResponse.json({ code: null });
    const code = await findUnusedWelcomeCodeForEmail(customer.email);
    return NextResponse.json({ code: code ?? null, percentage: code ? 10 : null });
  } catch {
    return NextResponse.json({ code: null });
  }
}
