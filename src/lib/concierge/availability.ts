// Who is allowed to use the concierge in the customer account area.
//
// WHY THIS EXISTS. On 2026-08-02 the account concierge went live by accident: a commit that was
// deliberately not pushed was carried to production by another process's push. It worked, and
// every boundary held, but Kieran had not chosen the moment. He then asked for it to come back
// off the customer side until he has tested it more.
//
// So availability is now a decision this file makes, rather than a consequence of whether the
// code happens to be deployed. The default is OFF. If the setting is missing, mistyped, or
// removed, customers do not see it: the safe direction, and the opposite of how it got live.
//
// THIS IS NOT THE KILL SWITCH. `CONCIERGE_ENABLED=off` in governor.ts stops the assistant
// answering anybody, staff included, and tells them so. This decides something narrower and more
// useful: whether ORDINARY CUSTOMERS can reach it at all, while leaving a way in for testing.
// The two are independent and both are checked.

/**
 * Is the concierge open to customers generally?
 *
 * Defaults to OFF. Set `CONCIERGE_ACCOUNT_LIVE=on` to open it to everyone.
 */
export function conciergeOpenToCustomers(): boolean {
  return (process.env.CONCIERGE_ACCOUNT_LIVE ?? 'off').trim().toLowerCase() === 'on';
}

/**
 * The accounts that may use it while it is closed to everyone else.
 *
 * `CONCIERGE_TEST_ACCOUNTS` is a comma separated list of email addresses. This is what makes
 * "not live yet" different from "switched off": Kieran can keep testing against his own account,
 * with real orders and the real knowledge base, without a customer being able to find it.
 *
 * Compared case insensitively and trimmed, because an email typed into a settings box will
 * eventually have a capital letter or a trailing space in it.
 */
export function isConciergeTester(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.CONCIERGE_TEST_ACCOUNTS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/** The admin panel's session cookie. Set only by the admin login routes. */
const ADMIN_SESSION_COOKIE = 'wg_admin_session';

/**
 * Is this request carrying a real, signed-in admin session?
 *
 * Windsor Glow's own staff need to reach the assistant while it is closed, to test it and to see
 * what a customer will see, and they should not have to get their address added to a list first.
 * Being signed in to the admin panel is enough.
 *
 * This reads the SAME cookie the middleware guards /admin with, and compares it to the SAME
 * secret, for the same reason it gives: the value has to equal the real token, never merely
 * "a cookie is present". The presentational `wg_ui_session=staff` hint cookie is deliberately NOT
 * used here. It is readable and writable by the browser, so anybody could set it and let
 * themselves in. Fail closed when the token is not configured, so a missing setting keeps people
 * out rather than making everyone an admin.
 */
export function isSignedInAdmin(request: Request): boolean {
  const expected = (process.env.ADMIN_SESSION_TOKEN ?? '').trim();
  if (!expected) return false;

  const header = request.headers.get('cookie');
  if (!header) return false;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== ADMIN_SESSION_COOKIE) continue;
    return decodeURIComponent(part.slice(eq + 1).trim()) === expected;
  }
  return false;
}

/**
 * May THIS person use it right now? The single question every surface asks.
 *
 * Three ways through: it is open to everyone, the person is signed in as an admin, or their
 * address is on the tester list. Pass `isAdmin` from `isSignedInAdmin(request)` wherever the
 * request is to hand; leaving it out keeps the old customer-only behaviour.
 *
 * WHAT THIS DOES NOT DO. Every surface that asks this question resolves a CUSTOMER session first
 * and answers 401 without one, because the assistant's order tools are scoped to the orders that
 * session owns. So an admin signed in to the admin panel ALONE still sees the sign-in invitation.
 * What changed is that an admin who is also signed in to a customer account no longer needs their
 * address adding to CONCIERGE_TEST_ACCOUNTS. Opening it to an admin with no customer identity
 * would mean deciding what the order tools scope to, which is a separate decision and a real
 * boundary, not a line in this file.
 */
export function conciergeAvailableTo(
  email: string | null | undefined,
  opts?: { isAdmin?: boolean },
): boolean {
  return conciergeOpenToCustomers() || opts?.isAdmin === true || isConciergeTester(email);
}

/** The same question, asked straight from a request. What every route should use. */
export function conciergeAvailableToRequest(
  request: Request,
  email: string | null | undefined,
): boolean {
  return conciergeAvailableTo(email, { isAdmin: isSignedInAdmin(request) });
}

/**
 * Is the PUBLIC storefront widget open?
 *
 * WHY THIS EXISTS, found by the 2026-08-02 audit, and it is the same mistake as the one above in
 * a different place. `NEXT_PUBLIC_SUPPORT_WIDGET` decided whether the floating chat bubble was
 * DRAWN, and nothing decided whether its endpoint would ANSWER. So with the widget switched off
 * and no way for a customer to see it, `POST /api/support/chat` was still replying to anyone on
 * the internet who knew the address, on Windsor Glow's own API keys. That was proven against the
 * live site, not inferred: an anonymous request with no cookies got a real answer back.
 *
 * The lesson from the account concierge applies exactly: whether a thing is reachable has to be a
 * decision the server makes, not a side effect of whether the interface happens to render it. One
 * flag now governs both, so the bubble and the endpoint can never disagree about being open.
 *
 * Defaults to CLOSED, in the same direction and for the same reason.
 */
export function publicWidgetOpen(): boolean {
  return (process.env.NEXT_PUBLIC_SUPPORT_WIDGET ?? 'off').trim().toLowerCase() === 'on';
}

/**
 * What a customer is told if they reach it anyway, by typing the address or following an old link.
 *
 * Says nothing about a launch date, because none has been promised, and points at the contact
 * page so the visit is not wasted.
 */
export const CONCIERGE_NOT_AVAILABLE =
  'The assistant is not open yet. Our team is here in the meantime, and the contact page is the '
  + 'quickest way to reach a person.';
