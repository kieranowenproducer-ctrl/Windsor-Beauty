// The Royal Mail reference for a trial product (task 9e2f4a11).
//
// WHY THIS EXISTS
// Kieran: "Whenever a product is classed as a trial product, I do NOT want its normal Windsor Beauty
// product name being used as its Royal Mail product reference. Instead, each trial product should
// automatically be assigned a simple unique neutral name such as Product 37... That reference
// becomes permanently associated with that product."
//
// HOW IT REACHES ROYAL MAIL. A trial line arrives at the shipment builder with its name and slug
// already removed by anonymiseTrialLines. Its reference travels with it instead, and
// outboundItemName in src/lib/genericNames.ts sends that reference before anything else, so two
// trial dispatches can still be told apart.
//
// PERMANENT CODES NOW LIVE IN THE TRIAL TABLE
// The old derived reference is retained for historic Trial rows and orders.
// Existing rows were backfilled with their previous number, so Royal Mail's
// past Product labels remain stable. Newly created rows receive a unique
// increasing bigint code from PostgreSQL and must pass it as the second
// argument to trialRoyalMailRef. The reference is then snapshotted on the
// order line. A one-argument call is only a legacy fallback.
//
// WHY THESE NUMBERS
// `(id * STEP) % SPAN` is a bijection whenever STEP and SPAN share no factor, so two different
// trial products can never land on the same number. SPAN is 899 (29 x 31) and STEP is 137, a prime
// that divides neither. That gives 899 distinct references, from Product 10 to Product 908, which
// is far beyond any plausible number of trial products (there are 32). The numbers look arbitrary,
// which is what Kieran asked for: they reveal nothing about the product. The
// legacy formula cycles after 899 IDs. The persisted bigint sequence removes
// that limit for new rows. `assertNoCollisions` checks the legacy range only.

/** The historic formula's cycle length, retained for old rows and orders. */
export const TRIAL_REF_SPAN = 899;
const TRIAL_REF_STEP = 137;
/** Keeps the smallest reference at two digits, so nothing reads as "Product 0". */
const TRIAL_REF_OFFSET = 10;

/** The number alone, e.g. 284. */
export function trialRefNumber(trialId: number): number {
  const id = Math.floor(Number(trialId));
  if (!Number.isFinite(id) || id < 0) throw new Error(`trialRefNumber: not a trial id: ${trialId}`);
  return ((id * TRIAL_REF_STEP) % TRIAL_REF_SPAN) + TRIAL_REF_OFFSET;
}

/** The stored code wins for current rows; ID derivation is a historic fallback. */
export function trialRoyalMailRef(trialId: number, productCode?: string | number | bigint | null): string {
  if (productCode !== undefined && productCode !== null) {
    const code = String(productCode);
    if (!/^[1-9]\d*$/.test(code) || (typeof productCode === 'number' && !Number.isSafeInteger(productCode))) {
      throw new Error(`trialRoyalMailRef: invalid stored Product code: ${code}`);
    }
    return `Product ${code}`;
  }
  return `Product ${trialRefNumber(trialId)}`;
}

/**
 * The trial product id inside an invoice line's slug ("trial:8" -> 8).
 *
 * This is the ONLY place the id can still be read on the way out: anonymiseTrialLines drops the
 * slug immediately afterwards, on purpose, because "trial:8" names the product to anyone reading
 * the customer's own order page.
 */
export function trialIdFromSlug(slug: string | undefined | null): number | null {
  const match = /^trial:(\d+)$/.exec(String(slug ?? '').trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

/**
 * Proves the promise Kieran actually made: no two trial products share a reference.
 *
 * Exported so both the test suite and anything that wants to check a live id list can call it,
 * rather than each writing its own idea of what "unique" means.
 *
 * @returns the ids that clash, empty when every reference is distinct.
 */
export function assertNoCollisions(trialIds: readonly number[]): number[] {
  const seen = new Map<number, number>();
  const clashes: number[] = [];
  for (const id of trialIds) {
    const ref = trialRefNumber(id);
    const first = seen.get(ref);
    if (first !== undefined) clashes.push(first, id);
    else seen.set(ref, id);
  }
  return clashes;
}
