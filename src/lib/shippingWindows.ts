// How long delivery takes, in one place.
//
// The figures were already written out three times: on the shipping page, in the admin editor's
// fallback copy in `policyDefaults.ts`, and again on the checkout page. That is fine for three
// pages a person edits together and looks at afterwards. It stopped being fine when the concierge
// started quoting them, because the concierge is read by a customer who has no way to check, and
// a number that has drifted from the policy page is a promise the policy does not make.
//
// So the CONCIERGE quotes from here, and `npm run check:shipping-windows` proves the pages still
// agree with it. That is the cheap version of a single source: the pages keep their own prose,
// which is what makes them readable, and drift is loud rather than silent.
//
// If a window changes, change it here first, then the three pages, then re-ingest the knowledge
// base so the model path answers with the new figure too. The check will tell you which of those
// you forgot.

export const UK_DELIVERY = {
  carrier: 'Royal Mail Tracked',
  pricePence: 1000,
  /** Exactly as it is printed on the shipping page. The wording is part of the promise. */
  window: '2 to 4 working days',
} as const;

export const INTERNATIONAL_DELIVERY = {
  carrier: 'Royal Mail International Tracked',
  pricePence: 4000,
  window: '7 to 14 working days',
} as const;

/** How long before a parcel is handed to the carrier at all. */
export const DISPATCH_WINDOW = 'one to two working days';

/**
 * The standard timing, in one sentence a customer can act on.
 *
 * Both halves, because "2 to 4 working days" on its own is the commonest way an estimate turns
 * into a complaint: the customer counts from when they paid, and the shipping page counts from
 * dispatch. Saying both is the difference between an estimate and an argument.
 */
export function standardDeliverySentence(): string {
  return `UK delivery (${UK_DELIVERY.carrier}) is typically ${UK_DELIVERY.window} from dispatch, `
    + `and orders are usually dispatched within ${DISPATCH_WINDOW} of payment being confirmed.`;
}
