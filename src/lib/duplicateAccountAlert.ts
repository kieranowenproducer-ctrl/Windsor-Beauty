import { findDuplicateSignals, type DuplicateFinding } from '@/lib/db/duplicateAccounts';
import { logAutomationFailure } from '@/lib/db';
import { sendAutomationAlertEmail } from '@/lib/automationAlertEmail';

// What happens when a new sign-up looks like somebody who already has an account (task c76f31fb).
//
// Kieran, 16 September 2026: "it should be automatically generated when a new sign is done by a new
// customers. Only if there is an issue of someone suspected of this activity, this must be showing
// in red on dashboard and email to sales@windsorbeauty.co.uk."
//
// So: a red row on the dashboard, and one email. Both use what the shop already has rather than a
// new warning system nobody has learned yet. The red row is an ordinary Problem row in Latest
// Activity, which Kieran can already tick off or bin, and the email is the same alerts@ to sales@
// note the shop already sends when something needs a person.
//
// IT DOES NOT BLOCK, REFUSE OR DELAY THE SIGN-UP. It runs after the account exists, it is never
// waited on, and it swallows its own failures. Someone creating an account must never be held up,
// and must certainly never be turned away, by a check that is only ever a suggestion to go and
// look. Kieran parked automatic blocking in August and that decision stands.

export const DUPLICATE_ACCOUNT_CATEGORY = 'duplicate_account_suspected';

/**
 * Raise the warning for one finding. Separated from the detection so the wording can be tested
 * without a database and without sending anything.
 */
export async function raiseDuplicateAccountWarning(finding: DuplicateFinding): Promise<void> {
  // The red row first. If the email fails, the warning is still on the dashboard, which is the
  // half that cannot be missed.
  await logAutomationFailure(DUPLICATE_ACCOUNT_CATEGORY, finding.summary, {
    detail: [
      `New account: ${finding.email}${finding.name ? ` (${finding.name})` : ''}`,
      finding.sameAddress.length
        ? `Same address as: ${finding.sameAddress.map(a => `${a.email}${a.name ? ` (${a.name})` : ''}`).join(', ')}`
        : null,
      finding.sameConnection.length
        ? `Same internet connection as: ${finding.sameConnection.map(a => `${a.email}${a.name ? ` (${a.name})` : ''}`).join(', ')}`
        : null,
      'Nobody has been blocked or refused. This is for a person to look at and decide.',
    ].filter(Boolean).join('\n'),
  });

  await sendAutomationAlertEmail({
    category: DUPLICATE_ACCOUNT_CATEGORY,
    message: finding.summary,
    subject: finding.email,
    whatToDo:
      'Nobody has been blocked and nothing has been refused. Open Customers in the admin panel and '
      + 'decide whether this is the same person twice or simply a household. If it is the same person, '
      + 'mark the older welcome code as used so the second one cannot be spent.',
  });
}

/**
 * The whole automatic rule, for one brand new customer. Safe to call and forget.
 *
 * Returns the finding when one was raised, so a test can prove it fired, and null the rest of the
 * time, which is almost always.
 */
export async function checkNewCustomerForDuplicates(customerId: number): Promise<DuplicateFinding | null> {
  try {
    const finding = await findDuplicateSignals(customerId);
    if (!finding) return null;
    await raiseDuplicateAccountWarning(finding);
    return finding;
  } catch {
    // Never rethrow. This runs off the back of somebody signing up.
    return null;
  }
}
