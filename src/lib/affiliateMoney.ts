/** Round a percentage commission to the nearest penny, with exact half-pennies rounded upward. */
export function commissionPence(productPaidPence: number, commissionBps = 500): number {
  if (!Number.isInteger(productPaidPence) || productPaidPence < 0) throw new Error('Product amount must be whole pence.');
  if (!Number.isInteger(commissionBps) || commissionBps < 0) throw new Error('Commission rate must be basis points.');
  return Math.floor((productPaidPence * commissionBps + 5000) / 10000);
}

/** Only complete pounds can be withdrawn or converted. Pence remain in the balance. */
export function wholePoundsAvailable(balancePence: number): number {
  return Math.max(0, Math.floor(balancePence / 100) * 100);
}

export function poundsToWholePence(value: unknown): number | null {
  const pounds = Number(value);
  if (!Number.isInteger(pounds) || pounds <= 0) return null;
  return pounds * 100;
}

export function affiliateProductPaidPence(subtotalAfterSale: number, affiliateDiscountAmount: number): number {
  return Math.max(0, Math.round((subtotalAfterSale - affiliateDiscountAmount) * 100));
}
