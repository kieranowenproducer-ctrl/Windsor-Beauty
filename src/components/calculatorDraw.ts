export interface DrawResult {
  concentration: number;
  drawMl: number;
  syringeMarks: number;
  totalDoses: number;
}

/** Amount and dose must already use the same unit: mg or true product IU. */
export function calculateDraw(amount: number, waterMl: number, dose: number): DrawResult | null {
  if (![amount, waterMl, dose].every((value) => Number.isFinite(value) && value > 0)) return null;
  const concentration = amount / waterMl;
  const drawMl = dose / concentration;
  // U-100 markings encode volume, regardless of whether the product uses IU or mg.
  return {
    concentration,
    drawMl,
    syringeMarks: drawMl * 100,
    totalDoses: Math.floor(amount / dose),
  };
}

/**
 * The syringe calculator's results, in the vial's own unit (task e1f77268).
 *
 * `unit` is the unit the DOSE was typed in. 'mcg' is the only one that needs scaling, and only
 * against a vial measured by mass; an IU dose is already in the vial's unit.
 *
 * NOTHING HERE CONVERTS BETWEEN MASS AND IU, and nothing ever should. International Units measure
 * biological activity, not weight, and the factor between the two is different for every compound
 * (growth hormone is roughly 3 IU to the milligram; the next product is not). A single number baked
 * into a calculator would be right once and quietly wrong after that. It is also unnecessary: the
 * reconstitution sum is proportional, so it gives the right answer in whichever unit it is fed, as
 * long as the vial and the dose are in the same one.
 */
export function syringeResults(
  vialBase: number,
  waterMl: number,
  desiredDose: number,
  unit: 'mg' | 'mcg' | 'iu',
): SyringeResult | null {
  const desiredBase = unit === 'mcg' ? desiredDose / 1000 : desiredDose;
  const draw = calculateDraw(vialBase, waterMl, desiredBase);
  if (!draw) return null;
  return {
    concPerMl: draw.concentration,
    // Micrograms of an IU product is not a thing, so that line is left off rather than filled in.
    concMcgPerMl: unit === 'iu' ? null : draw.concentration * 1000,
    drawMl: draw.drawMl,
    drawUnits: draw.syringeMarks, // U-100: 100 marks = 1 mL
    totalDoses: draw.totalDoses,
  };
}

export interface SyringeResult {
  /** Base units per mL: mg/mL for a mass vial, IU/mL for an IU vial. */
  concPerMl: number;
  /** Only for a mass vial. Null for IU. */
  concMcgPerMl: number | null;
  drawMl: number;
  drawUnits: number;
  totalDoses: number;
}
