// Trial products never show their real name outside their admin inventory.
//
// Kieran, 9 September: "The invoice must not state what the product is called,
// it just must only state the price... if I choose 501, which is £45, and I give
// a discount of £3, it will show 'Product 1' on the invoice, £45, discount £3,
// total £42. I do not want the trial products to appear on any invoice
// whatsoever."
//
// Trial products are his separate testing inventory, kept away from the shop
// catalogue, and their names are internal shorthand. This uses each product's
// permanent Product code on every outward document, and leaves
// every price, discount and total exactly as it was.
//
// ONE function, used by every customer-facing surface, because "no invoice
// whatsoever" cannot be delivered by remembering to do it in five places:
//   - the emailed invoice          (src/lib/invoiceEmail.ts)
//   - the printed/PDF invoice      (api/admin/invoices/[id]/print)
//   - the public pay page          (api/invoices/[token])
//   - the order it becomes         (src/lib/invoiceFulfillment.ts)
//
// npm run check:trial-anonymity fails if a new outward surface renders line
// names without going through this first.

// Described by shape rather than by importing the invoice type, so this file
// stays out of the database layer and scripts/test-trial-anonymity.mjs can
// compile it on its own. Its one import is trialRoyalMailRef, which is pure
// arithmetic with no imports of its own, so that property still holds.
import { TRIAL_REF_SPAN, trialIdFromSlug, trialRoyalMailRef } from './trialRoyalMailRef';

export interface TrialAwareLine {
  type?: string;
  slug?: string;
  name: string;
  description?: string;
  batchCodes?: string[];
  /**
   * The neutral name this line ships under at Royal Mail, e.g. "Product 284"
   * Stable per trial product and snapshotted when the invoice is saved.
   */
  fulfilmentRef?: string;
}

/** A trial line is one the invoice builder marked when a trial product was picked. */
export function isTrialLine(item: Pick<TrialAwareLine, 'type' | 'slug'>): boolean {
  return item.type === 'trial' || (typeof item.slug === 'string' && item.slug.startsWith('trial:'));
}

/**
 * The same lines, with every trial line's real identity removed. The permanent
 * Product code is shared by the invoice, order, staff email and Royal Mail.
 *
 * The description goes too: it holds the dosage, which names the product just
 * as clearly as the name does. Batch codes go for the same reason. Quantity,
 * unit price, discount and line total are untouched, so every sum on the
 * invoice still adds up exactly as before.
 */
export function anonymiseTrialLines<T extends TrialAwareLine>(items: T[]): T[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    if (!isTrialLine(item)) return item;
    const trialId = trialIdFromSlug(item.slug);
    // New invoices carry the database-assigned permanent code as a snapshot.
    // Older lines retained only trial:id, whose established code is derived from
    // that id. A line with neither cannot safely leave the admin database.
    const validCode = (value: unknown): value is string =>
      typeof value === 'string' && /^Product [1-9]\d*$/.test(value.trim());
    const savedCode = validCode(item.fulfilmentRef) ? item.fulfilmentRef.trim()
      : trialId === null && validCode(item.name) ? item.name.trim() : null;
    // The old id-derived numbering covered only the original bounded space.
    // New products must carry the stored database code, or the arithmetic
    // would eventually reuse an old number.
    if (!savedCode && trialId !== null && trialId >= TRIAL_REF_SPAN) {
      throw new Error('Trial line is missing its database-assigned Product code. Correct it before sending.');
    }
    const code = savedCode ?? (trialId === null ? null : trialRoyalMailRef(trialId));
    if (!code) throw new Error('Trial line has no permanent Product code. Correct it before sending.');
    return {
      ...item,
      name: code,
      description: undefined,
      batchCodes: undefined,
      fulfilmentRef: code,
      // The slug carries "trial:12", which names the product to anyone who
      // looks at the page source or the order record the customer can see.
      slug: undefined,
    };
  });
}

/** True when an invoice has anything on it that must be anonymised. */
export function hasTrialLines(items: TrialAwareLine[]): boolean {
  return Array.isArray(items) && items.some(isTrialLine);
}
