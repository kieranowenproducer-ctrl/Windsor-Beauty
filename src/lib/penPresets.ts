import type { Product } from '@/data/products';

/**
 * The pens in the shop, ready to fill the calculator in (task b0f86954).
 *
 * WHY THIS EXISTS. Kieran: "You need to drop down for all my pens, which are in the shop... if
 * they choose from the drop-down, one of my pens, two of the available should be automatically be
 * inputted. One is the BAC water which will always be 3ml. And the other would be the amount
 * that's already in the pen." Both figures are already known the moment somebody says which pen
 * they have, and the calculator was making them type both.
 *
 * WHY IT READS THE LIVE CATALOGUE AND NOT A LIST WRITTEN HERE. The pens are maintained in the
 * admin, not in the code: the committed catalogue still carries "Glow Pen" with a variant called
 * "Standard" priced at zero, while the shop actually sells it at 70mg. A hand-written list here
 * would have been wrong the day it shipped and wrong again every time he adds a pen. This derives
 * the list from whatever the shop is selling, so adding, renaming or withdrawing a pen in the
 * admin changes the calculator with no code change.
 */

/** Always 3mL for a pen, stated by Kieran. Nothing in the catalogue records it. */
export const PEN_WATER_ML = '3';

export interface PenPreset {
  /** Unique per pen AND strength, because a pen sold in two strengths needs two entries. */
  id: string;
  /** What the customer picks, e.g. "Recovery Pen (Windsor Glow) BPC 157, TB500, KPV — 50mg". */
  label: string;
  /** The peptide already in the pen. Null when its strength cannot be read as a number. */
  amount: string | null;
  /** The unit that amount is in. The calculator understands all three. */
  unit: 'mg' | 'mcg' | 'iu';
}

/**
 * Read a pen's strength out of the words the admin typed in the variant.
 *
 * Handles "80mg", "200IU", "10ml"-style casing, and the two blends written as a split.
 *
 * THE BLEND RULE, AND WHY IT IS NOT A GUESS. Two pens state a split: "10/10mg" (BPC-157 and
 * TB-500) and "40/4mg" (Retatrutide and Cagrilintide). "The amount that's already in the pen"
 * could have meant one component or the whole. The site already answers this: the published blend
 * table in src/lib/blend.ts gives the 10/10 pen a total of 20mg and the 40/4 pen a total of 44mg,
 * both marked "published". Adding the parts up gives exactly those figures, so this follows the
 * table the site already stands behind rather than inventing a second opinion. penPresets.test.mjs
 * asserts the two never drift apart.
 */
export function readPenStrength(dosage: string): { amount: string; unit: 'mg' | 'mcg' | 'iu' } | null {
  const text = String(dosage ?? '').trim();
  if (!text) return null;

  const unitMatch = text.match(/(mcg|mg|iu)\s*$/i);
  if (!unitMatch) return null;
  const unit = unitMatch[1].toLowerCase() as 'mg' | 'mcg' | 'iu';

  // Every number in front of the unit. One for a plain strength, several for a split.
  const numbers = (text.slice(0, unitMatch.index).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (numbers.length === 0 || numbers.some((n) => !Number.isFinite(n))) return null;

  const total = numbers.reduce((sum, n) => sum + n, 0);
  if (total <= 0) return null;

  // toPrecision trims floating point noise from adding decimals (40 + 4.5).
  return { amount: String(Number(total.toPrecision(12))), unit };
}

/**
 * Every pen the shop is selling, one entry per strength.
 *
 * A variant marked `enabled: false` is left out: it is not for sale, so offering it would invite
 * somebody to reconstitute against a figure for a pen they cannot have bought here.
 */
export function penPresets(catalogue: Product[]): PenPreset[] {
  const out: PenPreset[] = [];

  for (const product of catalogue) {
    if (!Array.isArray(product.categories) || !product.categories.includes('Pens')) continue;

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const sellable = variants.filter((v) => v && v.enabled !== false);

    for (const variant of sellable) {
      const dosage = String(variant.dosage ?? '').trim();
      const strength = readPenStrength(dosage);
      out.push({
        id: `${product.slug}::${dosage || 'default'}`,
        // The strength is part of the name for a pen sold in more than one, and harmless
        // repetition when the name already carries it. A comma, not a dash: the house rule
        // bans em dashes in anything a person reads, and this is read from a drop-down.
        label: dosage ? `${product.name}, ${dosage}` : product.name,
        amount: strength ? strength.amount : null,
        unit: strength ? strength.unit : 'mg',
      });
    }
  }

  return out.sort((a, b) => a.label.localeCompare(b.label));
}
