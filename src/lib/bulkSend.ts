import { reportAutomationFailure } from '@/lib/automationFailure';

/**
 * Sending the same message to a lot of people, without hurting anybody.
 *
 * The marketing loops used to be `for (const to of recipients) await send(to)`. Three problems
 * lived in that line:
 *
 *  1. No pacing. Resend rate-limits, so a fast loop starts collecting 429s partway down the list.
 *     Those came back as plain failures, which looked like bad addresses rather than the send
 *     going too fast.
 *  2. No retry. A single blip meant that person simply never got it.
 *  3. Worst of all, no record until the very end. If the function timed out at 300 seconds the
 *     campaign row was never written, so nobody knew who had already received it. The natural
 *     reaction is to press Send again, and everybody in the first part of the list gets it twice.
 *
 * This paces the send, retries once, and reports progress as it goes so the caller can persist it
 * even if the run is cut short.
 */

/** ~5 sends a second. Comfortably inside Resend's limits without making a 500-person send crawl. */
const GAP_MS = 200;
const RETRY_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface BulkSendResult {
  sent: string[];
  failed: string[];
  /** True if the run stopped early because it was running out of time. */
  stoppedEarly: boolean;
}

export interface BulkSendOptions {
  /** Stop and return cleanly once this many milliseconds have passed. */
  budgetMs?: number;
  /** Category used if the run has to report a failure. */
  category?: string;
  /** Human label for the campaign, used in any failure report. */
  label?: string;
  /**
   * What the person reading the failure report should actually do. The default advice is
   * written for a marketing campaign; a caller whose failures heal themselves (a daily cron
   * that re-tries tomorrow) should say so here, or somebody will go looking for a button.
   */
  whatToDo?: string;
}

/**
 * @param recipients addresses, already deduplicated by the caller
 * @param sendOne    sends to one address and resolves true only on success
 */
export async function bulkSend(
  recipients: string[],
  sendOne: (to: string) => Promise<boolean>,
  options: BulkSendOptions = {}
): Promise<BulkSendResult> {
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? 240_000;

  const sent: string[] = [];
  const failed: string[] = [];
  let stoppedEarly = false;

  for (let i = 0; i < recipients.length; i += 1) {
    if (Date.now() - startedAt > budgetMs) {
      stoppedEarly = true;
      break;
    }

    const to = recipients[i];
    let ok = false;
    try {
      ok = await sendOne(to);
    } catch {
      ok = false;
    }

    if (!ok) {
      await delay(RETRY_DELAY_MS);
      try {
        ok = await sendOne(to);
      } catch {
        ok = false;
      }
    }

    if (ok) sent.push(to);
    else failed.push(to);

    if (i < recipients.length - 1) await delay(GAP_MS);
  }

  if (failed.length > 0 || stoppedEarly) {
    await reportAutomationFailure(
      options.category ?? 'customer_email',
      stoppedEarly
        ? `${options.label ?? 'A bulk email'} ran out of time after ${sent.length} of ${recipients.length} recipients. The remaining ${recipients.length - sent.length - failed.length} were not sent to.`
        : `${options.label ?? 'A bulk email'} failed for ${failed.length} of ${recipients.length} recipients.`,
      {
        alertAdmin: true,
        detail: failed.slice(0, 50).join(', '),
        whatToDo: options.whatToDo ?? (stoppedEarly
          ? 'Check the send history for who already received it before sending again, or the first part of the list will get it twice.'
          : 'Check the addresses listed. If they look fine, the problem is more likely the sending domain than the recipients.'),
      }
    );
  }

  return { sent, failed, stoppedEarly };
}
