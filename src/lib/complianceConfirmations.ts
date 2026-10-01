/**
 * What somebody confirms before they open an account or pay. ONE file, so the sign-up form, the
 * checkout and the server routes can never show or check different wording.
 *
 * Windsor Beauty is an ordinary skincare shop, so there is exactly one thing to confirm in each
 * place: that the customer has read and accepts the Terms and Conditions and the Privacy Policy.
 * There is no age gate and no entry gate.
 *
 * The `keys` are the booleans the sign-up APIs re-check on the server, so a locked button is never
 * the only thing standing between somebody and an account.
 *
 * IF YOU CHANGE A WORDING HERE, the error sentences below are built to match it. Keep them in step.
 * `npm run test:compliance-boxes` fails when they drift apart.
 */

export type ComplianceKey = 'termsAccepted';

/** A page the sentence refers to, drawn as its own link so reading never toggles the tick. */
export interface ConfirmationLink {
  text: string;
  href: string;
}

export interface ComplianceConfirmation {
  /** Stable id for the checkbox itself. Never shown. */
  id: string;
  /** Every server-side boolean this one sentence answers for. */
  keys: readonly ComplianceKey[];
  /** What the person reads. */
  label: string;
  /** The documents the sentence names. */
  links: readonly ConfirmationLink[];
}

const TERMS_AND_PRIVACY_LINKS: readonly ConfirmationLink[] = [
  { text: 'Terms and Conditions', href: '/terms' },
  { text: 'Privacy Policy', href: '/privacy' },
];

export const COMPLIANCE_CONFIRMATIONS: readonly ComplianceConfirmation[] = [
  {
    id: 'terms-and-privacy',
    keys: ['termsAccepted'],
    label: 'I have read and accept the Windsor Beauty Terms and Conditions and Privacy Policy.',
    links: TERMS_AND_PRIVACY_LINKS,
  },
];

/** Every boolean the sign-up routes expect, whichever box carries it. */
export const COMPLIANCE_KEYS: readonly ComplianceKey[] =
  COMPLIANCE_CONFIRMATIONS.flatMap((c) => [...c.keys]);

/** Just the sentences. */
export const COMPLIANCE_CHECK_LABELS: readonly string[] =
  COMPLIANCE_CONFIRMATIONS.map((c) => c.label);

/* ── The one thing somebody ticks before they pay ──────────────────────────────────────────── */

export interface CheckoutConfirmation {
  /** Stable id for the checkbox, and the field name stored on the order. */
  id: 'terms';
  label: string;
  /** The documents the sentence names, each drawn as its own link under the box. */
  links: readonly ConfirmationLink[];
}

export const CHECKOUT_CONFIRMATIONS: readonly CheckoutConfirmation[] = [
  {
    id: 'terms',
    label: 'I have read and accept the Windsor Beauty Terms and Conditions and Privacy Policy.',
    links: TERMS_AND_PRIVACY_LINKS,
  },
];

/** Shown under the Pay button while the box is still empty. */
export const CHECKOUT_CONFIRMATIONS_ERROR =
  'Please confirm you have read and accept the Terms and Conditions and Privacy Policy before paying.';

/**
 * What is kept on the order, so the question can be answered months later.
 *
 * THE SENTENCES ARE STORED, NOT JUST THE TICK. A boolean records that somebody ticked something;
 * it does not record WHAT. Wording changes, and the moment it does, every older order would
 * silently read as though that customer agreed to today's sentence rather than the one that was
 * actually on their screen.
 */
export interface CheckoutConfirmationRecord {
  terms: boolean;
  /** The exact wording shown at the time, one entry per box, in the order they appeared. */
  statements: string[];
  /** When they ticked, in ISO form. */
  confirmedAt: string;
  /** Only present on records written before the shop had a single confirmation. Never written now. */
  researchUse?: boolean;
}

/** True only when this is a complete record with the Terms genuinely accepted. */
export function isConfirmedAtCheckout(record: unknown): record is CheckoutConfirmationRecord {
  const r = record as CheckoutConfirmationRecord | null;
  return Boolean(
    r && typeof r === 'object'
    && r.terms === true
    && Array.isArray(r.statements) && r.statements.length > 0,
  );
}

/** The record to store for somebody who has ticked the box now. */
export function checkoutConfirmationRecord(): CheckoutConfirmationRecord {
  return {
    terms: true,
    statements: CHECKOUT_CONFIRMATIONS.map((c) => c.label),
    confirmedAt: new Date().toISOString(),
  };
}

/** The one sentence both sign-up routes use when the box was not ticked. */
export const COMPLIANCE_CONFIRMATIONS_ERROR =
  'Please confirm you have read and accept the Terms and Conditions and Privacy Policy to create your account.';
