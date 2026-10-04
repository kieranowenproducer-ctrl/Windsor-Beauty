import { listRecentAutomationFailures } from '@/lib/db';
import { reportAutomationFailure } from '@/lib/automationFailure';
import { stillHeldAfterRecheck } from '@/lib/db/openingOfferProtection';

// When a paused welcome offer actually stops somebody buying something (task 22d79f3b).
//
// Kieran, 18 September 2026: "these need fixing". The second of the two was that nobody was told.
// Haydee Rivera had £160 in her basket, was shown "please contact Windsor Beauty", and had to write
// in to find out why her code would not work. She is the one who bothered. The ones who do not
// bother simply leave, and a stopped sale leaves no trace at all.
//
// So the moment a pause refuses a code, it becomes a red row on the dashboard and an email to
// sales@windsorbeauty.co.uk, using the same two routes everything else here uses: the row can be ticked
// off or binned like any other, and the alert carries the existing mute so a customer pressing
// Apply four times cannot send four emails.

export const BLOCKED_OFFER_CATEGORY = 'welcome_offer_blocked';

/**
 * What the customer is told. Deliberately no longer asks them to chase us, because we now tell
 * ourselves, and never mentions the other account: saying "somebody else at your address has an
 * account" would hand one customer another customer's business.
 */
export const BLOCKED_OFFER_CUSTOMER_MESSAGE =
  'We need to check this code before it can be used. We have been told and will be in touch by email, '
  + 'so there is nothing you need to do. If you would rather not wait, email sales@windsorbeauty.is.';

/** How long one customer's blocked code counts as already reported. */
const REPEAT_WINDOW_HOURS = 6;

/**
 * Has this customer's blocked code already been raised recently?
 *
 * Matches on the email inside the message, which is there by construction above. A failure to read
 * the list answers false, so the worst case is a duplicate row rather than a silence: being told
 * twice is a nuisance, and not being told at all is the fault this whole file exists to fix.
 */
async function recentlyRaisedFor(email: string): Promise<boolean> {
  try {
    const cutoff = Date.now() - REPEAT_WINDOW_HOURS * 60 * 60 * 1000;
    const rows = await listRecentAutomationFailures(60);
    return rows.some((row) =>
      row.category === BLOCKED_OFFER_CATEGORY
      && new Date(row.created_at).getTime() >= cutoff
      && row.message.toLowerCase().includes(email.toLowerCase()));
  } catch {
    return false;
  }
}

/**
 * Decide whether a paused customer is really still paused, and shout about it if they are.
 *
 * The re-check comes first on purpose. A pause whose reason has gone should quietly clear and let
 * the customer through, with nobody told anything, because nothing went wrong. Only a pause that
 * survives being looked at again is worth a person's attention.
 *
 * Returns true when the code must be refused.
 */
export async function refuseHeldWelcomeOffer(params: {
  customerId: number;
  email: string;
  name?: string | null;
  code: string;
  /** Where it happened, so the alert says whether a sale was actually in progress. */
  stage: 'basket' | 'checkout';
}): Promise<boolean> {
  const stillHeld = await stillHeldAfterRecheck(params.customerId);
  if (!stillHeld) return false;

  const who = params.name ? `${params.name} (${params.email})` : params.email;
  const where = params.stage === 'checkout'
    ? 'while they were placing the order'
    : 'when they applied it to their basket';
  const message = `${who} could not use their welcome code ${params.code} ${where}. Their offer is paused for a staff check.`;

  // ONE ROW PER CUSTOMER, not one per press. Somebody who cannot get their code to work presses
  // Apply again, and again, and then tries the checkout: without this that is five identical red
  // rows about one person, and a dashboard nobody reads. The alert email has its own six-hour mute
  // already; this is the row's equivalent.
  const alreadyRaised = await recentlyRaisedFor(params.email);
  if (alreadyRaised) return true;

  await reportAutomationFailure(BLOCKED_OFFER_CATEGORY, message, {
    alertAdmin: true,
    detail: [
      `Customer: ${params.email}`,
      `Code: ${params.code}`,
      `Stopped at: ${params.stage === 'checkout' ? 'the payment step' : 'the basket'}`,
      'They have been told we will come back to them, so they are waiting on us.',
    ].join('\n'),
    whatToDo:
      'They are waiting on us: the shop told them we would be in touch. Open Customers in the admin '
      + 'panel, find them, and press Allow offer if it is genuine. If it is not, leave it paused and '
      + 'nothing more needs doing.',
  });

  return true;
}
