import { listRecentAutomationFailures } from '@/lib/db';
import { reportAutomationFailure } from '@/lib/automationFailure';

// Every refused discount code now leaves a trace (Kieran, 18 September 2026).
//
// WHY THIS EXISTS. There were fourteen different ways the basket could refuse a code and only one
// of them told anybody: the paused welcome offer. The other thirteen happened in silence. A
// customer typed their code, was told no, and either paid full price or left, and the shop never
// knew. That is how a member checked out at full price with a working code in her hand on
// 18 September, and how another had to email sales@ to find out why hers would not work.
//
// So every refusal is written down now. Most are a row on the dashboard and nothing more, because
// most refusals are ordinary: somebody mistypes a code, or a code really has expired. A few mean WE
// broke something, and those also send the email, because a customer is standing at the payment
// step with a full basket.
//
// Nothing in here is allowed to throw. A fault in the reporting must never be the reason a customer
// cannot buy something, so every path swallows its own errors and lets the checkout carry on.

export const DISCOUNT_REFUSED_CATEGORY = 'discount_code_refused';
export const DISCOUNT_SYSTEM_FAILURE_CATEGORY = 'discount_code_system_failure';

/** How long one person's refused code counts as already reported. */
const REPEAT_WINDOW_HOURS = 6;

export type RefusalStage = 'basket' | 'checkout';

/**
 * Has this person's refused code already been raised recently?
 *
 * Somebody whose code will not work presses Apply again, and again, and then tries the checkout.
 * Without this guard that is five identical rows about one person and a dashboard nobody reads.
 * A failure to read the list answers false: being told twice is a nuisance, being told nothing is
 * the fault this file exists to fix.
 */
async function alreadyRaised(subject: string, code: string, category: string): Promise<boolean> {
  try {
    const cutoff = Date.now() - REPEAT_WINDOW_HOURS * 60 * 60 * 1000;
    const rows = await listRecentAutomationFailures(60);
    return rows.some((row) =>
      row.category === category
      && new Date(row.created_at).getTime() >= cutoff
      && row.message.toLowerCase().includes(subject.toLowerCase())
      && row.message.toUpperCase().includes(code.toUpperCase()));
  } catch {
    return false;
  }
}

export async function reportRefusedDiscount(params: {
  /** The signed-in customer, or null when a signed-out visitor tried a code. */
  email: string | null;
  name?: string | null;
  code: string;
  /** Plain English, as the shop would say it out loud. Never names another customer. */
  reason: string;
  stage: RefusalStage;
  /**
   * True when the refusal means something is wrong at our end rather than the customer simply
   * mistyping or a code genuinely being spent. Only these send the email as well as the row.
   */
  serious?: boolean;
}): Promise<void> {
  try {
    const code = params.code.trim();
    if (!code) return;
    const subject = params.email
      ? (params.name ? `${params.name} (${params.email})` : params.email)
      : 'A signed-out visitor';
    const key = params.email ?? 'signed-out visitor';
    const category = params.serious ? DISCOUNT_SYSTEM_FAILURE_CATEGORY : DISCOUNT_REFUSED_CATEGORY;
    if (await alreadyRaised(key, code, category)) return;

    const where = params.stage === 'checkout' ? 'at the payment step' : 'at the basket';
    await reportAutomationFailure(
      category,
      `${subject} could not use discount code ${code} ${where}: ${params.reason}`,
      {
        alertAdmin: params.serious === true,
        subject: params.email ?? undefined,
        detail: [
          `Code: ${code}`,
          `Where: ${params.stage === 'checkout' ? 'the payment step' : 'the basket'}`,
          `Reason: ${params.reason}`,
        ].join('\n'),
        whatToDo: params.serious
          ? 'This one is on us, not the customer. Check the code in Discount Codes, and contact them '
            + 'if they were charged full price.'
          : 'Usually nothing. This is here so you can see how often codes are being refused and why. '
            + 'If the same person keeps appearing, get in touch with them.',
      }
    );
  } catch {
    // Deliberately silent. Reporting a refusal must never become a reason a customer cannot buy.
  }
}
