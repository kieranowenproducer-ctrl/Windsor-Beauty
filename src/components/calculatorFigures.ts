'use client';

// The figures both calculators share, kept in one place so that switching
// between the syringe and the V3 pen, or between the two calculators, never
// empties a box (task 7b82f6b3). Kieran's words: "whatever I've put in should
// stay", and a figure typed on the syringe side "should transfer across".
//
// Changing a unit KEEPS the figure; only the unit label changes. The old rule
// cleared the box so that 10 typed as milligrams could never be silently
// re-read as 10 micrograms. His video showed what that cost: 250 typed, the
// unit switched from mg to mcg (because 250 mcg was what he meant), and the
// box went blank. Somebody who types a number and then picks its unit is
// telling the calculator which unit the number is in, so the number stays.
// Every result line restates the dose with its unit, so a mismatch is visible.

import { useState } from 'react';

export type MassUnit = 'mg' | 'mcg';
export type VialUnit = MassUnit | 'iu';

export interface CalculatorFigures {
  /** Amount of peptide in the vial, in `vialUnit`. */
  vialAmount: string;
  vialUnit: VialUnit;
  /** Bacteriostatic water added, in mL. */
  waterMl: string;
  /** Dose per injection, in `doseUnit` (or in IU when the vial is measured in IU). */
  desiredDose: string;
  doseUnit: MassUnit;
}

export const EMPTY_FIGURES: CalculatorFigures = {
  vialAmount: '',
  vialUnit: 'mg',
  waterMl: '',
  desiredDose: '',
  doseUnit: 'mcg',
};

const MCG_PER_MG = 1000;

/** Writes a number the way a person would type it: no floating-point noise, no trailing zeros. */
export function tidyNumber(n: number): string {
  if (!Number.isFinite(n)) return '';
  const rounded = Number(n.toPrecision(12));
  if (Math.abs(rounded) >= 1e-6 || rounded === 0) return String(rounded);
  // Below a millionth JavaScript switches to exponent form, which nobody types.
  return rounded.toFixed(12).replace(/0+$/, '');
}

/**
 * The same amount in the other mass unit. 250 mcg becomes 0.25 mg; 0.25 mg
 * becomes 250 mcg. Anything that is not a number is left alone.
 */
export function convertMass(value: string, from: MassUnit, to: MassUnit): string {
  if (from === to) return value;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return value;
  return tidyNumber(from === 'mg' ? n * MCG_PER_MG : n / MCG_PER_MG);
}

export type FiguresPatch = Partial<CalculatorFigures>;

export interface FiguresControl {
  figures: CalculatorFigures;
  onChange: (patch: FiguresPatch) => void;
}

/**
 * Shared figures when a parent supplies them (the calculator page, where the
 * two calculators sit side by side), private ones otherwise (the pop-up
 * calculator on the checkout page stands alone).
 */
export function useCalculatorFigures(control?: FiguresControl): [CalculatorFigures, (patch: FiguresPatch) => void] {
  const [local, setLocal] = useState<CalculatorFigures>(EMPTY_FIGURES);
  if (control) return [control.figures, control.onChange];
  return [local, (patch) => setLocal((current) => ({ ...current, ...patch }))];
}
