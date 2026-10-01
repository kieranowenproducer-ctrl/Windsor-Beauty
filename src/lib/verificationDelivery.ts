import { reportAutomationFailure } from '@/lib/automationFailure';
import { sendVerifyEmail } from '@/lib/verifyEmailEmail';

/**
 * Every verification email the site sends goes through here.
 *
 * Before this existed, /api/account/register did `.catch(() => false)` and
 * threw the answer away: if the send failed, nothing was written down, nobody
 * was told, and the first anyone knew was the customer phoning up to say their
 * code never arrived (task 34cf57c9, Adonis Doria, 2 August 2026). One send,
 * one silent failure, one lost customer.
 *
 * So: try twice, and if it still will not go, say so out loud — to the System
 * Health page, and to the ops inbox.
 */

/** A momentary Resend blip is usually over in under a second. */
const RETRY_DELAY_MS = 1200;

/** Where the send came from, so System Health says which one broke. */
export type VerificationSendSource =
  | 'registration'
  | 'customer_resend'
  | 'admin_resend'
  | 'daily_reminder'
  | 'coming_soon_signup';

const SOURCE_LABELS: Record<VerificationSendSource, string> = {
  registration: 'when they created their account',
  customer_resend: 'when they asked for it again from their account page',
  admin_resend: 'when it was resent from the admin panel',
  daily_reminder: 'as the automatic daily reminder',
  coming_soon_signup: 'when they signed up from the coming-soon page',
};

export interface DeliverVerificationEmailParams {
  to: string;
  customerName: string;
  verifyUrl: string;
  source: VerificationSendSource;
  variant?: 'initial' | 'reminder';
  /**
   * Alert the ops inbox if it fails. On by default, because a customer not
   * getting this email is exactly the thing that needs a person. The bulk
   * admin resend turns it off and reports once for the whole run instead of
   * once per customer.
   */
  alertAdmin?: boolean;
  /** Admin resends only. See the note on VerifyEmailParams.discountCode. */
  discountCode?: string | null;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Returns true only if the email was genuinely accepted for delivery.
 * Never throws — a caller's flow (registering an account) must not fail
 * because an email did not go.
 */
export async function deliverVerificationEmail(
  params: DeliverVerificationEmailParams
): Promise<boolean> {
  const { to, customerName, verifyUrl, source, variant } = params;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const sent = await sendVerifyEmail({ to, customerName, verifyUrl, variant, discountCode: params.discountCode ?? null });
      if (sent) return true;
      lastError = 'Resend did not accept the message.';
    } catch (err) {
      lastError = err;
    }
    if (attempt === 1) await delay(RETRY_DELAY_MS);
  }

  await reportAutomationFailure(
    'verification_email',
    `Could not send the verification email to ${to} ${SOURCE_LABELS[source]}. They cannot verify their address or get their member discount until it goes.`,
    {
      subject: to,
      detail: lastError,
      alertAdmin: params.alertAdmin !== false,
      whatToDo:
        'Press the Resend button next to their name on System Health. If it keeps failing, their email provider is rejecting our mail, so take the order and give them a 10% code by hand.',
    }
  );

  return false;
}
