// Filing a copy of every customer email under the customer (task ce308493).
//
// Kieran, 19 September 2026: "Copies of each email send must be saved under each Customer."
//
// WHY IT LIVES HERE AND NOT IN THE SENDERS. A copy was already being kept, but by hand: six of the
// shop's twenty-five or so emails called the recorder themselves and the other nineteen did not, so
// the verification email, the password reset, the membership welcome, the invoice, the marketing,
// the announcements, the back-in-stock note, the PEARL answers and the enquiry replies left no
// trace under anybody. Adding nineteen more calls would fix today and be wrong again the first time
// somebody adds email number twenty-six. sendEmail is the one door they all go through, so the copy
// is taken at the door.
//
// THREE RULES IT MUST NOT BREAK.
//
// 1. SAVING A COPY MUST NEVER STOP AN EMAIL. Everything here is wrapped and swallowed. A customer
//    waiting on a password reset does not care that the filing cabinet is jammed.
// 2. IT MUST NOT SLOW THE SEND DOWN. It runs after the send has already succeeded and its result is
//    not waited on.
// 3. STAFF POST IS NOT CUSTOMER POST. Anything sent with `internal` is a stock alert, a sentinel
//    report or a task notification going to our own inboxes. Filing "low stock" under a customer
//    would be both wrong and confusing, so internal post is skipped.

/** What a sender can tell us about an email, beyond the address it is going to. */
export interface EmailFilingHints {
  /** Skip filing entirely. For the rare send that is genuinely nobody's business. */
  skip?: boolean;
  /** When the sender already knows the customer, saving a lookup. */
  customerId?: number | null;
  /** The order this email is about, e.g. "WB-1042". Lets the orders screen find it. */
  orderRef?: string | null;
  /** What kind of email it is: 'dispatch', 'order_confirmation', 'verification'... */
  emailType?: string | null;
}

/**
 * The formatted half is capped so one runaway email cannot bloat the table. 256KB is far above any
 * real email the shop sends (the biggest today is 13KB of text) and far below anything that would
 * matter. A capped body is marked, so nobody reads a truncated email and thinks that is what went
 * out.
 */
export const MAX_STORED_BODY = 256 * 1024;

export function capBody(body: string | undefined | null): string | null {
  if (body === undefined || body === null) return null;
  if (body.length <= MAX_STORED_BODY) return body;
  return body.slice(0, MAX_STORED_BODY)
    + '\n<!-- Windsor Beauty: the rest of this email was too large to keep a copy of. -->';
}

/** Only ever the first recipient: one row per person, and the customer is the first name on it. */
export function primaryRecipient(to: string | string[]): string | null {
  const first = Array.isArray(to) ? to[0] : to;
  if (typeof first !== 'string') return null;
  // Senders write addresses both bare and as `Name <address>`.
  const angled = first.match(/<([^>]+)>/);
  const address = (angled ? angled[1] : first).trim().toLowerCase();
  return address.includes('@') ? address : null;
}

/**
 * Is this address one of ours rather than a customer's?
 *
 * A customer-facing email that happens to be addressed to sales@ is our own post, and filing it
 * under a "customer" called sales@windsorbeauty.co.uk would invent a person. `internal` already catches
 * most of it; this catches the rest, like the contact form's copy to ourselves.
 */
export function isOurOwnAddress(address: string): boolean {
  return /@windsorbeauty\.(?:co\.uk|is)$/i.test(address);
}

/**
 * File the copy. Never throws, never awaited by the caller.
 *
 * The database work is imported only when a copy is actually being taken, so the email sender does
 * not drag the database into every context that merely wants to send something.
 */
export async function fileEmailUnderCustomer(params: {
  to: string | string[];
  from: string;
  subject: string;
  html?: string;
  text?: string;
  providerId: string | null;
  hints?: EmailFilingHints;
}): Promise<void> {
  try {
    if (params.hints?.skip) return;
    const address = primaryRecipient(params.to);
    if (!address) return;
    if (isOurOwnAddress(address)) return;

    const { recordCustomerEmail } = await import('@/lib/db/customerEmails');
    const customerId = params.hints?.customerId ?? await resolveCustomerId(address);

    await recordCustomerEmail({
      direction: 'sent',
      customerId,
      email: address,
      ourAddress: params.from,
      subject: params.subject,
      // The text half is what the history list reads; the formatted half is what "show me the email
      // they got" opens.
      bodyText: capBody(params.text) ?? '',
      bodyHtml: capBody(params.html),
      providerId: params.providerId,
      orderRef: params.hints?.orderRef ?? null,
      emailType: params.hints?.emailType ?? null,
      // It left here successfully. The Resend webhook later updates this row to delivered, opened
      // or bounced, matched on the provider id above.
      deliveryStatus: 'sent',
    });
  } catch {
    // Deliberately silent. The email has already gone; this is only the copy.
  }
}

/**
 * Which customer this address belongs to, or null if nobody.
 *
 * Null is fine and common: someone can be emailed before they ever register. The row still carries
 * the address, and the profile matches on either, so the history appears under them the day they
 * sign up.
 */
async function resolveCustomerId(address: string): Promise<number | null> {
  try {
    const { findCustomerByEmail } = await import('@/lib/db');
    const customer = await findCustomerByEmail(address);
    return customer?.id ?? null;
  } catch {
    return null;
  }
}
