/**
 * How an order came to be attached to the account it is attached to (task e0858a61).
 *
 * An order carrying a customer_id has never proved the person was signed in. Checkout attaches an
 * order to an account in TWO different ways — from a live session, or by matching the email the
 * person typed to an existing customer — and once the order was saved those two looked identical.
 * That is exactly the question nobody could answer about order WB-63U39T.
 *
 * Deliberately its own file with no imports at all. It is one decision, it is the difference
 * between "this member ordered" and "somebody typed this member's email address", and it is worth
 * being able to run on its own and prove. See scripts/check-account-link.mjs.
 */

export type OrderAccountLink =
  /** A valid session existed at checkout. The account is proven. */
  | 'signed_in'
  /** No session; the typed email matched an existing account, so the order was linked to it. */
  | 'email_match'
  /** No session and no matching account. */
  | 'guest'
  /** Raised by us from the invoice system, not by a customer at checkout. */
  | 'admin_created'
  /** Placed before this was captured. NOT a guess — it means we do not know. */
  | 'not_recorded';

/**
 * @param signedInCustomerId the account proven by the session cookie, or null
 * @param linkedCustomerId   the account the order will be attached to, session or email match
 */
export function resolveAccountLink(
  signedInCustomerId: number | null | undefined,
  linkedCustomerId: number | null | undefined,
): OrderAccountLink {
  if (signedInCustomerId != null) return 'signed_in';
  if (linkedCustomerId != null) return 'email_match';
  return 'guest';
}

/** Written for the person reading the Orders screen, not for a developer. */
export const ACCOUNT_LINK_LABELS: Record<OrderAccountLink, string> = {
  signed_in:     'Signed in when they ordered',
  email_match:   'Not signed in, matched to this member by their email address',
  guest:         'Guest order, no member account',
  admin_created: 'Created by us from an invoice',
  not_recorded:  'Not recorded (placed before we started keeping this)',
};
