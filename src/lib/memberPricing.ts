import { sumMoney } from './money';

// Members-only pricing (task 458c9aff, rollout per Kieran's review).
// The prices already on the site are treated as the MEMBER prices; visitors
// who are not logged in see a non-member price inflated by the markup below,
// next to a strong invitation to join free / log in.
//
// Every non-member price is rounded UP to the nearest five pounds. The same
// calculation is used in the shop and in the server-side checkout price check.

// Set so members save AT LEAST 20% OFF the non-member price (the claim on the
// product page). A +20% markup (x1.2) only gives ~16.7% off; to actually be 20%
// off, the non-member price must be member / 0.8 = member x 1.25. With the
// round-UP below the saving is always >= 20% (exactly 20% when member x1.25
// lands on a multiple of 5, more otherwise).
export const NON_MEMBER_MARKUP = 1.25; // members save at least 20% off the non-member price

export function memberPricingEnabled(_slug: string): boolean {
  return true; // all products (was a single-slug trial)
}

// Non-member price from a member (current) price: +25%, then rounded UP to
// the nearest five pounds so shelf prices read clean (e.g. 85 -> 106.25 -> 110),
// which also guarantees members save at least 20% off the shown non-member price.
export function nonMemberPrice(memberPrice: number): number {
  return Math.ceil((memberPrice * NON_MEMBER_MARKUP) / 5) * 5;
}

/** The catalogue stores the member price. This is the one calculation shared
 * by the customer interface and the server-side order check. */
export function priceForCustomer(memberPrice: number, isMember: boolean): number {
  return isMember ? memberPrice : nonMemberPrice(memberPrice);
}

/** How much less a member pays for these basket lines than a non-member:
 * the member price difference only, before promotions, codes or delivery.
 * The same difference appears in the member offer pop-up. */
export function memberSavingFor(items: ReadonlyArray<{ price: number; quantity: number }>): number {
  return sumMoney(items.map(item => (nonMemberPrice(item.price) - item.price) * item.quantity));
}
