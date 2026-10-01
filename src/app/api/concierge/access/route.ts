// May the person looking at /concierge see the AI Assistance, and what should
// it call them?
//
// WHY THIS IS ITS OWN ROUTE. The page used to ask /api/account/me, which answers
// a much bigger question: it returns the customer record, their orders and their
// spend, and it refuses anybody without a customer session. That was fine while
// only customers could use the assistant. Now Windsor Glow's own staff can too,
// and they may have no customer account at all, so the page needs an endpoint
// that answers only what the page actually asks.
//
// Deliberately NOT done by loosening /api/account/me: the account page and the
// signed-in check both read it, and "signed in" would have quietly started
// meaning "or is an admin" in two places that mean the customer.
//
// Nothing here decides anything the chat endpoint does not decide again for
// itself. This is what the page draws; /api/account/concierge is the gate that
// holds.

import { NextResponse } from 'next/server';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { conciergeAvailableTo, isSignedInAdmin } from '@/lib/concierge/availability';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  const admin = isSignedInAdmin(request);

  if (!customer && !admin) {
    return NextResponse.json({ signedIn: false, available: false, firstName: null, staff: false });
  }

  return NextResponse.json({
    signedIn: true,
    available: conciergeAvailableTo(customer?.email ?? null, { isAdmin: admin }),
    firstName: customer?.first_name ?? null,
    // Lets the page say "you are here as a member of staff" rather than greeting
    // an admin with no account as though their orders are about to be looked up.
    staff: Boolean(admin && !customer),
  });
}
