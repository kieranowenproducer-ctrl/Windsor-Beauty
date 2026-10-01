// Centralised money helpers. All monetary arithmetic should go through these
// functions so the whole site rounds the same way.
//
// Plain `Math.round(amount * 100) / 100` looks correct but fails on values
// that sit exactly on a half-penny boundary, because the multiplication
// itself introduces floating-point error: `1.005 * 100 === 100.49999999999999`,
// so `Math.round` rounds it DOWN to 100p (£1.00) instead of 101p (£1.01).
// The same happens for 0.145, 2.675, 9.995, etc: all realistic results of
// "price * percentage / 100" discount calculations.
//
// The fix is to let `toFixed(2)` normalise the multiplied value first (it
// correctly recovers 100.5 from 100.49999999999999) before rounding to a
// whole integer. Every helper below funnels through `toPence`, so a single
// fix here corrects every total, discount, and fee across the site.

// Converts a pounds amount to whole pence, rounded to the nearest penny.
export function toPence(amount: number): number {
  return Math.round(Number((amount * 100).toFixed(2)));
}

// Converts whole pence back to a pounds amount.
export function fromPence(pence: number): number {
  return pence / 100;
}

// Rounds a pounds amount to the nearest penny. Use this anywhere a monetary
// value is produced by arithmetic, before it's stored, displayed, or fed
// into a further calculation.
export function roundMoney(amount: number): number {
  return fromPence(toPence(amount));
}

// Formats a pounds amount for display as "10,629.51" (no currency symbol).
// Rounds defensively in case an unrounded value is passed in, and uses the
// same UK thousands separators everywhere it is shown.
export function formatMoney(amount: number): string {
  return roundMoney(amount).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Formats a whole-number count as "10,629".
export function formatWholeNumber(value: number): string {
  return value.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

// Sums pounds amounts via integer pence so rounding error can't accumulate
// across many additions/subtractions.
export function sumMoney(amounts: number[]): number {
  return fromPence(amounts.reduce((total, amount) => total + toPence(amount), 0));
}

// Returns `percent`% of `amount`, rounded to the nearest penny.
export function percentOf(amount: number, percent: number): number {
  return fromPence(Math.round((toPence(amount) * percent) / 100));
}
