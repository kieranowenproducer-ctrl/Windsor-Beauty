import { Resend } from 'resend';
import type { EmailFilingHints } from './fileUnderCustomer';

/**
 * THE ONE PLACE THIS SITE SENDS AN EMAIL (task b8fc05c1).
 *
 * All site email goes through this one sender. Customer emails are not copied
 * to a staff mailbox. A caller that genuinely needs a staff copy must provide
 * that copy explicitly in `bcc`.
 *
 * `npm run check:email-archive` fails the build if any file other than this one
 * calls Resend's send directly, so a new email cannot quietly skip the copy.
 *
 * The API key is a parameter because paypalInstructionsEmail.ts sends from a
 * separately verified domain on RESEND_API_KEY_PAYPAL. Passing the wrong key
 * there would stop that email dead.
 */
export interface SendEmailPayload {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string | Buffer }[];
  tags?: { name: string; value: string }[];
  scheduledAt?: string;
}

export interface SendEmailOptions {
  /** Defaults to RESEND_API_KEY. Pass RESEND_API_KEY_PAYPAL for that sender. */
  apiKey?: string;
  /**
   * Post to Kieran and the team rather than to a customer: a stock alert, a sentinel report, a
   * task notification, the admin copy of an order. Internal post is not filed under a customer.
   */
  internal?: boolean;
  /**
   * What to file the copy under (task ce308493). Every customer email is saved against the
   * customer from here, so a new email is archived by existing rather than by remembering.
   *
   * Optional throughout: with nothing supplied the copy is still taken and matched to the customer
   * by their address. Supplying `orderRef` is what lets the orders screen open the email it sent,
   * and `emailType` is what makes the history readable instead of a list of subject lines.
   */
  filing?: EmailFilingHints;
  /**
   * Passed to Resend so a retried send of the same message is delivered once, even when the first
   * attempt reached Resend but its answer was lost on the way back.
   */
  idempotencyKey?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id: string | null;
  error: string | null;
}

export async function sendEmail(
  payload: SendEmailPayload,
  options: SendEmailOptions = {},
): Promise<SendEmailResult> {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, id: null, error: 'No Resend API key configured.' };

  /* The plain-text half goes out exactly as the caller wrote it. Nothing is appended. */
  const text = payload.text;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      ...payload,
      ...(text === undefined ? {} : { text }),
    } as Parameters<Resend['emails']['send']>[0],
    options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined);

    if (error) {
      console.error('[email/send] Resend error:', error);
      return { ok: false, id: null, error: error.message ?? 'Resend refused the message.' };
    }
    /* THE COPY. After the send, never in front of it, and never awaited: a customer waiting on a
     * password reset does not care that the filing cabinet is jammed, and must not wait for it
     * either. Internal post is skipped, because a stock alert is not a customer's correspondence. */
    if (!options.internal) {
      /* AWAITED, not fired and forgotten. The first version of this did not wait, on the reasoning
       * that a customer should never be held up by the filing cabinet. That was wrong in the one
       * environment that matters: this runs on Vercel, where the function is frozen the moment the
       * response goes back, so the copy was being killed before it was written and NOTHING was
       * saved. Found by sending a real email on a preview and looking for the row, not by reading
       * the code, which looked perfectly correct.
       *
       * The cost is one insert, tens of milliseconds, on an operation that has just spent far
       * longer talking to the email provider. The protection that actually mattered is the
       * try/catch below, and that is still here: a failure to save the copy still cannot fail the
       * send, and the email has already gone by the time any of this runs. */
      await (async () => {
        try {
          /* Loaded here rather than at the top, so that even FINDING the filing code cannot affect
           * a send. The type above is erased at compile time, so this file still sends email with
           * no runtime dependency on the database at all. */
          const { fileEmailUnderCustomer } = await import('./fileUnderCustomer');
          await fileEmailUnderCustomer({
            to: payload.to,
            from: payload.from,
            subject: payload.subject,
            html: payload.html,
            text,
            providerId: data?.id ?? null,
            hints: options.filing,
          });
        } catch {
          // The email has gone. This is only the copy.
        }
      })();
    }

    return { ok: true, id: data?.id ?? null, error: null };
  } catch (err) {
    console.error('[email/send] send threw:', err);
    return { ok: false, id: null, error: err instanceof Error ? err.message : 'Send failed.' };
  }
}
