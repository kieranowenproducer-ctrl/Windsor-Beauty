/**
 * The one place that decides whether a string is worth trying to email.
 *
 * This existed twice before, as a private EMAIL_RE inside the marketing send
 * route and again inside the launch announce route, and in both files it
 * guarded only the "type in your own addresses" path. The "send to the whole
 * list" path used the stored list exactly as it stood, so anything that ever
 * got saved as an address was handed to Resend forever.
 *
 * That is not hypothetical: a checkout test on 2026-06-21 saved a contact whose
 * email was the literal text "hhh". Every campaign to the full list failed for
 * it, and each failure lit the red "something went wrong" banner on the admin
 * dashboard, for a record that was never a person.
 *
 * The pattern is deliberately unchanged from the two copies it replaces, so the
 * paths that were already validated behave exactly as they did.
 */
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The longest address any mail server is required to accept. */
const MAX_EMAIL_LENGTH = 254;

/**
 * True when this is worth handing to the email provider.
 *
 * Deliberately shape-only. It cannot know whether a well-formed address is a
 * real inbox, and it must not try: refusing a real customer's unusual address
 * is a worse outcome than one bounce.
 */
export function isSendableEmailAddress(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH) return false;
  return EMAIL_PATTERN.test(trimmed);
}

/**
 * Splits a list into the addresses worth sending to and the ones that cannot be
 * delivered, so a caller can report the second group instead of discovering it
 * as a failure after the send.
 */
export function partitionSendableAddresses<T>(
  items: T[],
  addressOf: (item: T) => string
): { sendable: T[]; unsendable: string[] } {
  const sendable: T[] = [];
  const unsendable: string[] = [];
  for (const item of items) {
    if (isSendableEmailAddress(addressOf(item))) sendable.push(item);
    else unsendable.push(String(addressOf(item) ?? '').trim() || '(blank)');
  }
  return { sendable, unsendable };
}
