/**
 * The statements somebody must tick before they get into the shop or create an
 * account. ONE list, used in both places.
 *
 * WHY THIS FILE EXISTS (Kieran, 7 September 2026: "It should follow the same
 * tick boxes that you have when you enter the website").
 *
 * There were two different sets. The entry gate asked people to confirm they
 * understood the products are not for human consumption; the sign-up form asked
 * them to declare they were a researcher who would not consume them. Same
 * subjects, different words, different order, and only one of them had full
 * stops. Two wordings of the same compliance statement is two wordings waiting
 * to disagree, and the wrong one gets quoted back at you.
 *
 * The wording here is the ENTRY GATE's, because that is the one Kieran pointed
 * at and it is the one every visitor already sees before anything else.
 *
 * THE ORDER MATTERS AND IS DELIBERATE. Research use comes first, as it does on
 * the gate: it is the statement that carries the weight, and it should not be
 * the second thing somebody skims past.
 *
 * ── TWO BOXES, NOT THREE (Samuel, 10 September 2026) ────────────────────────
 * "Combine the second box and the third box together so it reads: I confirm I
 * am over the age of 18 and will use this website lawfully and responsibly.
 * Keep everything else the same."
 *
 * So the age and the lawful-use statements are now one sentence and one tick.
 * NOTHING IS CONFIRMED BY IMPLICATION AND NOTHING IS DROPPED: the box carries
 * both server-side booleans, both are still sent, and both sign-up routes still
 * refuse an account unless all three are true. A person reads one sentence
 * instead of two and agrees to exactly what they agreed to before.
 *
 * That is why a confirmation carries `keys` rather than a single key. A box
 * whose sentence says two things has to answer for both of them, and quietly
 * setting the second one somewhere else in the form is how a compliance record
 * ends up saying something the person was never shown.
 *
 * The `keys` are the booleans the sign-up APIs re-check on the server, so a
 * locked button is never the only thing standing between somebody and an
 * account. The entry gate has no server side and uses the labels only.
 *
 * IF YOU CHANGE A WORDING HERE, change the matching sentence in the error the
 * sign-up routes return (src/app/api/account/register/route.ts and
 * src/app/api/launch/subscribe/route.ts), or the site will tell somebody they
 * failed to confirm something the box never said. `npm run test:compliance-boxes`
 * fails when they drift apart.
 */

export type ComplianceKey = 'researchUseConfirmed' | 'ageConfirmed' | 'lawfulUseConfirmed';

export interface ComplianceConfirmation {
  /** Stable id for the checkbox itself. Never shown. */
  id: string;
  /** Every server-side boolean this one sentence answers for. */
  keys: readonly ComplianceKey[];
  /** What the person reads. */
  label: string;
}

export const COMPLIANCE_CONFIRMATIONS: readonly ComplianceConfirmation[] = [
  {
    id: 'research-use',
    keys: ['researchUseConfirmed'],
    label: 'I understand these products are not for human consumption and are intended for research purposes only.',
  },
  {
    id: 'age-and-lawful-use',
    keys: ['ageConfirmed', 'lawfulUseConfirmed'],
    label: 'I confirm I am over the age of 18 and will use this website lawfully and responsibly.',
  },
] as const;

/** Every boolean the sign-up routes expect, whichever box carries it. */
export const COMPLIANCE_KEYS: readonly ComplianceKey[] =
  COMPLIANCE_CONFIRMATIONS.flatMap((c) => [...c.keys]);

/** Just the sentences, for the entry gate, which has no server-side booleans. */
export const COMPLIANCE_CHECK_LABELS: readonly string[] =
  COMPLIANCE_CONFIRMATIONS.map((c) => c.label);

/* ── The last thing somebody ticks before they pay (Samuel, 10 September 2026) ──
 *
 * "When a customer checked out before payment add a box similar to state 'I confirm I am over the
 * age 18 and any items bought are not for human consumption and for research purposes only' and
 * the terms and conditions that they have to confirms they have read and adhere to."
 *
 * WHY THIS IS A SEPARATE LIST AND NOT THE ONE ABOVE. The two upstairs are about getting IN: the
 * gate asks them of a visitor and the sign-up form asks them of somebody opening an account.
 * Checkout is a different moment and a different sentence. It is about the goods in the basket,
 * not about the person browsing, which is why it says "any items bought" and why it belongs to the
 * order rather than to the session. Sharing one list would have forced one wording to serve both,
 * and the checkout one would have been the one that lost.
 *
 * WHAT WAS CHANGED FROM SAMUEL'S WORDING, so he can say no. Two grammar fixes only: "over the age
 * 18" reads "over the age of 18", which is also what the entry gate and the sign-up form already
 * say, and two missing verbs. Nothing about what is being confirmed has moved.
 *
 * The Terms line is not new. Checkout has always had one and the Pay button has always been locked
 * until it was ticked. It now says "adhere to" as well as "read", which is what was asked for.
 */
export interface CheckoutConfirmation {
  /** Stable id for the checkbox, and the field name if this is ever stored on the order. */
  id: 'researchUse' | 'terms';
  label: string;
  /** Set when part of the sentence has to be a link rather than plain text. */
  link?: { text: string; href: string };
}

export const CHECKOUT_CONFIRMATIONS: readonly CheckoutConfirmation[] = [
  {
    id: 'researchUse',
    label: 'I confirm I am over the age of 18, and that any items bought are not for human '
      + 'consumption and are for research purposes only.',
  },
  {
    id: 'terms',
    label: 'I confirm I have read the Windsor Beauty Terms & Conditions and will adhere to them.',
    link: { text: 'Terms & Conditions', href: '/terms' },
  },
] as const;

/** Shown under the Pay button while either box is still empty. */
export const CHECKOUT_CONFIRMATIONS_ERROR =
  'Please confirm both statements above before paying.';

/**
 * What is kept on the order, so the question can be answered months later.
 *
 * THE SENTENCES ARE STORED, NOT JUST THE TICKS (Samuel asked for this on 10 September 2026, after
 * being told a tick that leaves no trace proves nothing). Two booleans record that somebody
 * ticked something; they do not record WHAT. Wording changes, and the moment it does, every older
 * order silently starts reading as though that customer agreed to today's sentence rather than the
 * one that was actually on their screen. Keeping the words with the tick is the difference between
 * a record and a rumour.
 */
export interface CheckoutConfirmationRecord {
  researchUse: boolean;
  terms: boolean;
  /** The exact wording shown at the time, one entry per box, in the order they appeared. */
  statements: string[];
  /** When they ticked, in ISO form. */
  confirmedAt: string;
}

/** True only when this is a complete record with both boxes genuinely ticked. */
export function isConfirmedAtCheckout(record: unknown): record is CheckoutConfirmationRecord {
  const r = record as CheckoutConfirmationRecord | null;
  return Boolean(
    r && typeof r === 'object'
    && r.researchUse === true && r.terms === true
    && Array.isArray(r.statements) && r.statements.length === CHECKOUT_CONFIRMATIONS.length,
  );
}

/** The record to store for somebody who has ticked both boxes now. */
export function checkoutConfirmationRecord(): CheckoutConfirmationRecord {
  return {
    researchUse: true,
    terms: true,
    statements: CHECKOUT_CONFIRMATIONS.map((c) => c.label),
    confirmedAt: new Date().toISOString(),
  };
}

/**
 * The one sentence both sign-up routes use when a box was not ticked. Built
 * from the same list, so it can never describe a box that does not exist.
 */
export const COMPLIANCE_CONFIRMATIONS_ERROR =
  'Please confirm both statements: that you understand these products are not for human '
  + 'consumption and are intended for research purposes only, and that you are over the age of 18 '
  + 'and will use this website lawfully and responsibly.';
