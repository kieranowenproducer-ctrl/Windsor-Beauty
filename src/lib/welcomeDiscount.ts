// Who may spend a WGLOW10 welcome code, in one place (task c76f31fb).
//
// The 10% welcome code is meant to be once per customer, ever. Two faults meant it was not, and
// neither of them needed the second account Kieran was asking about when they were found:
//
//   1. A USED CODE STILL WORKED. The code was correctly marked 'used' when it was spent, but the
//      price at order placement was worked out from a lookup that ignored the status. So the same
//      code took 10% off every order that customer ever placed. The status-agnostic lookup was
//      right once: until 1 August 2026 the BROWSER burned the code before redirecting to the
//      payment provider, so by the time the order was placed it already said 'used'. That caller
//      was deleted and the burn moved into the order request itself, after pricing, which left the
//      lookup permanently looking the other way.
//
//   2. A CODE WAS NOT TIED TO ITS OWNER. Nothing checked that the code belonged to the account
//      spending it, so any signed-in member could type in somebody else's WGLOW10-XXXXXX. The same
//      fault was found in /api/discount-redeem in the 29 July 2026 audit and fixed by deleting that
//      route; the check itself was never added to the paths that survived.
//
// Both the basket preview and the order itself ask this function, so they cannot drift apart and
// tell the customer two different stories. It is a pure function of the code row and the email, so
// it is tested without a database.

export interface WelcomeCodeRow {
  email: string;
  status: 'active' | 'used';
}

export type WelcomeCodeRefusal = 'already-used' | 'not-signed-in' | 'belongs-to-someone-else';

export interface WelcomeCodeDecision {
  allowed: boolean;
  reason: WelcomeCodeRefusal | null;
  /** What to tell the customer. Never mentions whose code it is. */
  message: string | null;
}

const ALLOWED: WelcomeCodeDecision = { allowed: true, reason: null, message: null };

/** Emails are compared with the spacing and capitals ignored, the way every other check here does. */
function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * May this signed-in customer spend this welcome code?
 *
 * `customerEmail` is null for someone not signed in. Welcome codes have always required an account;
 * this simply gives that its own answer rather than letting it fall through to a vaguer one.
 */
export function canSpendWelcomeCode(
  code: WelcomeCodeRow,
  customerEmail: string | null
): WelcomeCodeDecision {
  if (!customerEmail) {
    return {
      allowed: false,
      reason: 'not-signed-in',
      message: 'Please log in or create an account to use discount codes.',
    };
  }
  if (!sameEmail(code.email, customerEmail)) {
    // Deliberately does not say who it belongs to. Telling one customer another customer's email
    // address would be a worse fault than the one this fixes.
    return {
      allowed: false,
      reason: 'belongs-to-someone-else',
      message: 'That code was issued to a different account. Please use the code sent to your own email address.',
    };
  }
  if (code.status !== 'active') {
    return {
      allowed: false,
      reason: 'already-used',
      message: 'That code has already been used. The welcome discount is one per customer.',
    };
  }
  return ALLOWED;
}
