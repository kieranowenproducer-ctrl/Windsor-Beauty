import { countRecentAutomationFailuresInCategory, logAutomationFailure } from '@/lib/db';
import { sendAutomationAlertEmail } from '@/lib/automationAlertEmail';

/**
 * How long one category stays muted after an alert has gone out. A genuinely
 * broken integration fails repeatedly; the first email is the useful one and
 * the next forty are why people stop reading alerts.
 */
const ALERT_MUTE_HOURS = 6;

export interface ReportFailureOptions {
  /** Order number, when the failure belongs to one. Shown on System Health. */
  orderNumber?: string | null;
  /** Anything worth keeping for diagnosis — an Error, an object, a string. */
  detail?: unknown;
  /** Who or what it happened to, in the alert email: a customer email address. */
  subject?: string | null;
  /** One sentence telling the reader what to do about it. */
  whatToDo?: string | null;
  /**
   * Email the ops inbox as well as recording it. Off by default: the System
   * Health page is the record of everything, and an alert is for the things
   * that need a person today.
   */
  alertAdmin?: boolean;
}

/**
 * Record an automation failure, and optionally tell someone about it.
 *
 * This is the front door for "something the website does on its own went
 * wrong". It wraps logAutomationFailure (the durable record behind the admin
 * System Health page and its sidebar badge) and adds the alert email, so any
 * future failure gets the whole treatment by passing one flag rather than by
 * rebuilding the plumbing.
 *
 * Like logAutomationFailure, it never throws: reporting a failure must never
 * become a second failure that takes down the flow it is reporting on.
 */
export async function reportAutomationFailure(
  category: string,
  message: string,
  options?: ReportFailureOptions
): Promise<void> {
  // Decide the mute BEFORE writing, or this failure would mute itself.
  let shouldAlert = options?.alertAdmin === true;
  if (shouldAlert) {
    try {
      const recent = await countRecentAutomationFailuresInCategory(category, ALERT_MUTE_HOURS);
      if (recent > 0) shouldAlert = false;
    } catch {
      // If the mute check itself fails, err towards being told. A duplicate
      // alert is a nuisance; a silent failure is the bug this task exists for.
    }
  }

  await logAutomationFailure(category, message, {
    orderNumber: options?.orderNumber ?? null,
    detail: options?.detail,
  });

  if (!shouldAlert) return;

  const detail = options?.detail === undefined
    ? null
    : typeof options.detail === 'string'
      ? options.detail
      : options.detail instanceof Error
        ? options.detail.message
        : JSON.stringify(options.detail);

  await sendAutomationAlertEmail({
    category,
    message,
    subject: options?.subject ?? options?.orderNumber ?? null,
    detail,
    whatToDo: options?.whatToDo ?? null,
  }).catch(() => false);
}
