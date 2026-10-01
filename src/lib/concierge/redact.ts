// Data minimisation. Two jobs, both boring and both load-bearing:
//
//  1. redact()        strip secret-shaped strings out of anything before it is
//                     stored in the conversation log or sent to the model. A
//                     customer who pastes a card number should not leave it in
//                     our database, and the model has no use for it either.
//  2. redactForModel() decide what of a customer's record the model is allowed
//                     to see at all. The answer is: their first name and the
//                     shape of their orders. Not their address, not their
//                     phone, not their payment details, not another order's
//                     contents.
//
// Dependency-free on purpose so the test suite can load it under node.

const PATTERNS: Array<[RegExp, string]> = [
  // Card numbers: 13 to 19 digits, optionally spaced or hyphened in groups.
  // Checked before the generic long-digit rule so the label is accurate.
  [/\b(?:\d[ -]?){12,18}\d\b/g, '[card number removed]'],
  // API keys and tokens that a confused customer might paste from an email.
  [/\b(?:sk|pk|rk)[-_][A-Za-z0-9-_]{10,}/g, '[key removed]'],
  [/\bBearer\s+[A-Za-z0-9._-]{16,}/gi, '[token removed]'],
  // UK sort code.
  [/\b\d{2}-\d{2}-\d{2}\b/g, '[sort code removed]'],
  // "my password is hunter2" / "password: hunter2" / "pin 1234"
  [/\b(password|passcode|pin|cvv|cvc|security code)\b(\s+(is|=|:))?\s*\S+/gi, '$1 [removed]'],
  // Long unbroken digit runs that got past the card rule (account numbers).
  [/\b\d{9,}\b/g, '[number removed]'],
];

/** Strip secret-shaped strings. Safe to run on any customer text. */
export function redact(text: string): string {
  let out = text ?? '';
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

export interface CustomerForModel {
  firstName: string | null;
  orderCount: number;
}

/**
 * What the model is told about the signed-in customer. Deliberately tiny.
 *
 * The engine already knows who they are from the session cookie, so the model
 * does not need an identity to check against — it only needs enough to be
 * polite and to know whether this is somebody's first order. Everything else
 * (email, address, phone, spend) reaches the model only as the narrow output
 * of a tool the customer's question actually required.
 */
export function customerContextForModel(c: CustomerForModel): string {
  const name = c.firstName ? c.firstName.trim().slice(0, 40) : null;
  const parts = [
    'The customer is signed in to their Windsor Glow account.',
    name ? `Their first name is ${name}.` : 'Their name is not on file.',
    c.orderCount === 0
      ? 'They have not placed an order yet.'
      : `They have ${c.orderCount} order${c.orderCount === 1 ? '' : 's'} with us.`,
    'You already know who they are, so never ask them to prove their identity and never ask for an order number just to look something up.',
  ];
  return parts.join(' ');
}

/**
 * Address handling. The model never receives a delivery address: it has no
 * question it could answer better for having one, and it is the single most
 * sensitive field on the order. This returns a town-and-postcode-district
 * summary for the rare case where a customer asks "which address is this
 * going to" and needs to recognise it without it being read back in full.
 */
export function redactForModel(address: { line1?: string; city?: string; postcode?: string } | string | null): string {
  if (!address) return 'no delivery address on file';
  if (typeof address === 'string') {
    // Stored as a single formatted string on WG orders. Keep the last two
    // comma-separated parts at most (usually town + postcode) and mask the
    // second half of the postcode.
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
    const tail = parts.slice(-2).join(', ');
    return maskPostcode(tail) || 'address on file';
  }
  const tail = [address.city, address.postcode].filter(Boolean).join(', ');
  return maskPostcode(tail) || 'address on file';
}

function maskPostcode(s: string): string {
  // "SL4 1AA" -> "SL4 ***". Enough to recognise, not enough to deliver to.
  return s.replace(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/gi, '$1 ***');
}
