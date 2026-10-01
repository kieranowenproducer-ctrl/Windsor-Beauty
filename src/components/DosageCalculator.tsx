'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import type { BlendPreset } from '@/lib/blend';
import BlendBreakdown from './BlendBreakdown';
import { convertMass, useCalculatorFigures, type FiguresControl, type MassUnit } from './calculatorFigures';
// One proven reconstitution sum, shared with the V3 pen calculator, so the two can never drift
// apart and so it can be tested without a browser (task e1f77268).
import { syringeResults } from './calculatorDraw';

type DoseUnit = MassUnit;
type SyringeValue = '0.3' | '0.5' | '1.0';
type FrequencyValue = 'daily' | 'eod' | 'twice-weekly' | 'weekly' | 'custom';

const SYRINGES: { value: SyringeValue; label: string; maxUnits: number; majorStep: number }[] = [
  { value: '0.3', label: '0.3 mL', maxUnits: 30, majorStep: 5 },
  { value: '0.5', label: '0.5 mL', maxUnits: 50, majorStep: 10 },
  { value: '1.0', label: '1.0 mL', maxUnits: 100, majorStep: 10 },
];

const PEPTIDE_PRESETS = ['5', '10', '15'];
const WATER_PRESETS = ['1', '2', '3', '5'];
// 3mL, not 2mL (Kieran, 10 September 2026). It is what his own pens are reconstituted with, so the
// figure the calculator recommends and the figure the pen drop-down fills in are now the same one.
// Every volume is still offered and still typeable; this only moves which one is marked.
const RECOMMENDED_WATER = '3';
const DOSE_PRESETS_MCG = ['50', '100', '250', '500'];
const DOSE_PRESETS_MG = ['0.05', '0.1', '0.25', '0.5'];
// IU doses are small whole-ish numbers: a growth hormone vial is commonly 2 IU a day (task e1f77268).
const DOSE_PRESETS_IU = ['1', '2', '3', '4'];
// And IU vials are sold by the vial, not the milligram: 10 IU and 15 IU are the usual sizes.
const PEPTIDE_PRESETS_IU = ['10', '15', '36'];

const FREQUENCIES: { value: FrequencyValue; label: string; perWeek: number | null }[] = [
  { value: 'daily', label: 'Once Daily', perWeek: 7 },
  { value: 'eod', label: 'Every Other Day', perWeek: 3.5 },
  { value: 'twice-weekly', label: 'Twice Weekly', perWeek: 2 },
  { value: 'weekly', label: 'Once Weekly', perWeek: 1 },
  { value: 'custom', label: 'Custom', perWeek: null },
];


function formatUnits(units: number): string {
  const rounded = Math.round(units * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

interface SmartSuggestion {
  waterMl: number;
  drawUnits: number;
}

// When the draw lands on an awkward decimal, scan nearby bacteriostatic water
// volumes for one that produces a cleaner syringe reading for the *same* final dose —
// this is the basis of the Smart Dosing Assistant "Pro Tip".
function findSmartSuggestion(peptideMg: number, desiredMg: number, currentWaterMl: number, currentDrawUnits: number): SmartSuggestion | null {
  if (!peptideMg || !desiredMg || !currentWaterMl || !currentDrawUnits) return null;

  const currentDeviation = Math.abs(currentDrawUnits - Math.round(currentDrawUnits));
  if (currentDeviation < 0.12) return null; // already reads cleanly enough — no tip needed

  let best: (SmartSuggestion & { deviation: number }) | null = null;
  for (let tenths = 10; tenths <= 50; tenths += 1) {
    const waterMl = tenths / 10;
    if (Math.abs(waterMl - currentWaterMl) < 0.05) continue;

    const drawUnits = (desiredMg * waterMl / peptideMg) * 100;
    if (drawUnits < 2 || drawUnits > 100) continue;

    const deviation = Math.abs(drawUnits - Math.round(drawUnits));
    if (deviation < 0.08 && (!best || deviation < best.deviation)) {
      best = { waterMl, drawUnits, deviation };
    }
  }

  return best ? { waterMl: best.waterMl, drawUnits: best.drawUnits } : null;
}

function formatDuration(totalDoses: number, perWeek: number | null): string | null {
  if (!perWeek || perWeek <= 0 || !totalDoses) return null;
  const days = (totalDoses / perWeek) * 7;
  if (days < 14) {
    const wholeDays = Math.max(1, Math.round(days));
    return `${wholeDays} day${wholeDays === 1 ? '' : 's'} of supply`;
  }
  const weeks = Math.round((days / 7) * 10) / 10;
  return `${Number.isInteger(weeks) ? weeks.toFixed(0) : weeks.toFixed(1)} weeks of supply`;
}

interface DosageCalculatorProps {
  compact?: boolean;
  /** Figures shared with the V3-pen calculator on the calculator page (task 7b82f6b3). Absent, the calculator keeps its own. */
  figures?: FiguresControl;
  /** The blends to offer in the breakdown panel. Defaults to the curated list; the calculator
   *  page passes the curated list plus everything the shop sells (Kieran, video). */
  blendPresets?: BlendPreset[];
}

export default function DosageCalculator({ compact = false, figures: control, blendPresets }: DosageCalculatorProps) {
  const [syringe, setSyringe] = useState<SyringeValue>('1.0');
  const [figures, patch] = useCalculatorFigures(control);
  // This calculator works in milligrams. A vial typed in micrograms on the pen
  // tab is shown here in milligrams; a vial measured in International Units has
  // no milligram figure, so that one box stays blank.
  // A vial measured in IU keeps its own unit; everything else is worked in milligrams, and a vial
  // typed in micrograms on the pen tab is shown here in milligrams (task e1f77268).
  const isIu = figures.vialUnit === 'iu';
  const peptideMg = isIu
    ? figures.vialAmount
    : figures.vialUnit === 'mg'
      ? figures.vialAmount
      : convertMass(figures.vialAmount, 'mcg', 'mg');
  const { waterMl, desiredDose, doseUnit } = figures;
  /** The unit the dose is actually in. An IU vial is dosed in IU, with no mass choice offered. */
  const effectiveDoseUnit: DoseUnit | 'iu' = isIu ? 'iu' : doseUnit;
  /** What to print after a number: "IU" for an IU vial, otherwise the chosen mass unit. */
  const doseLabel = isIu ? 'IU' : doseUnit;
  const setPeptideMg = (value: string) => patch({ vialAmount: value, vialUnit: isIu ? 'iu' : 'mg' });
  /**
   * Switching the vial between mass and IU.
   *
   * The number typed is kept, exactly as changing mg to mcg keeps it (see calculatorFigures.ts).
   * It is NOT converted, because there is no honest factor to convert it by. Somebody who types 10
   * and then picks IU is telling us the vial holds 10 IU.
   */
  const changeVialUnit = (next: 'mg' | 'iu') => patch({ vialUnit: next });
  const setWaterMl = (value: string) => patch({ waterMl: value });
  const setDesiredDose = (value: string) => patch({ desiredDose: value });
  // Changing the unit keeps the number and changes the label (see
  // calculatorFigures.ts): nothing typed is ever lost.
  const changeDoseUnit = (next: DoseUnit) => patch({ doseUnit: next });
  const [frequency, setFrequency] = useState<FrequencyValue>('daily');
  const [customPerWeek, setCustomPerWeek] = useState('');

  const syringeSpec = SYRINGES.find(s => s.value === syringe)!;

  const results = useMemo(
    () => syringeResults(parseFloat(peptideMg), parseFloat(waterMl), parseFloat(desiredDose), effectiveDoseUnit),
    [peptideMg, waterMl, desiredDose, effectiveDoseUnit]
  );

  const perWeek = useMemo(() => {
    if (frequency === 'custom') {
      const n = parseFloat(customPerWeek);
      return n > 0 ? n : null;
    }
    return FREQUENCIES.find(f => f.value === frequency)?.perWeek ?? null;
  }, [frequency, customPerWeek]);

  const duration = results ? formatDuration(results.totalDoses, perWeek) : null;

  // Blend breakdown (task 6bf5aee8): split the dose, and the volume a single
  // syringe unit carries, across the peptides in a blended vial.
  const blendDoses = useMemo(() => {
    // Blends are mass products and every figure below is milligrams, so an IU vial gets none of
    // this rather than a column of numbers in the wrong unit (task e1f77268).
    if (!results || isIu) return [];
    const out: { label: string; mg: number }[] = [];
    const perUnitMg = 0.01 * results.concPerMl; // one U-100 unit = 0.01 mL
    if (Number.isFinite(perUnitMg) && perUnitMg > 0) {
      out.push({ label: 'Per syringe unit', mg: perUnitMg });
      out.push({ label: 'Per 10 units', mg: perUnitMg * 10 });
    }
    const dose = parseFloat(desiredDose);
    if (Number.isFinite(dose) && dose > 0) {
      out.push({ label: 'Your dose', mg: doseUnit === 'mcg' ? dose / 1000 : dose });
    }
    return out;
  }, [results, desiredDose, doseUnit, isIu]);

  const suggestion = useMemo(() => {
    if (!results) return null;
    // Proportional, so it works in whichever unit the vial is in: it only ever compares one water
    // volume against another for the same dose, and never leaves that unit.
    const desiredBase = effectiveDoseUnit === 'mcg' ? parseFloat(desiredDose) / 1000 : parseFloat(desiredDose);
    return findSmartSuggestion(parseFloat(peptideMg), desiredBase, parseFloat(waterMl), results.drawUnits);
  }, [results, peptideMg, waterMl, desiredDose, effectiveDoseUnit]);

  const exceedsSyringe = results ? results.drawUnits > syringeSpec.maxUnits : false;

  function reset() {
    setSyringe('1.0');
    patch({ vialAmount: '', vialUnit: 'mg', waterMl: '', desiredDose: '', doseUnit: 'mcg' });
    setFrequency('daily');
    setCustomPerWeek('');
  }

  return (
    <div className={`grid grid-cols-1 ${compact ? '' : 'lg:grid-cols-2'} gap-6`}>

      {/* ---- INPUTS ---- */}
      <div className={`border border-gold-100 ${compact ? 'p-5 sm:p-6' : 'p-7 sm:p-9'}`}>
        <h2 className="text-[10px] tracking-[0.22em] uppercase text-stone-500 font-semibold mb-6">
          Input Values
        </h2>

        <div className="space-y-5">

          {/* Syringe size */}
          <div>
            <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-2">
              Syringe Size
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {SYRINGES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSyringe(s.value)}
                  className={`text-[9px] tracking-wider px-2 py-2.5 border transition-colors ${
                    syringe === s.value
                      ? 'bg-gold-700 text-white border-gold-500'
                      : 'border-stone-200 text-stone-500 hover:border-gold-300 hover:text-gold-800'
                  }`}
                >
                  {s.label}
                  <span className="block text-[7px] tracking-wider mt-0.5">{s.maxUnits} units</span>
                </button>
              ))}
            </div>
          </div>

          {/* Peptide amount */}
          <div>
            <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-2">
              Peptide Amount in Vial
            </label>
            <p className="text-[8px] tracking-[0.18em] uppercase text-stone-500 mb-1.5">Recommended Amounts</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(isIu ? PEPTIDE_PRESETS_IU : PEPTIDE_PRESETS).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPeptideMg(v)}
                  className={`text-[9px] tracking-wider px-3 py-1.5 border transition-colors ${
                    peptideMg === v
                      ? 'bg-gold-700 text-white border-gold-500'
                      : 'border-stone-200 text-stone-500 hover:border-gold-300 hover:text-gold-800'
                  }`}
                >
                  {v}{isIu ? 'IU' : 'mg'}
                </button>
              ))}
            </div>
            <p className="text-[8px] tracking-[0.18em] uppercase text-stone-500 mb-1.5">Custom Amount</p>
            <div className="flex gap-2">
              <input
                type="number"
                value={peptideMg}
                onChange={e => setPeptideMg(e.target.value)}
                placeholder="Enter a custom amount"
                min="0"
                step="0.1"
                className="flex-1 border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white"
              />
              {/* mg or IU (task e1f77268). HGH and some others are sold in International Units and
                  drawn with an ordinary insulin syringe, so this tab has to take them. Switching
                  keeps the number and changes only the unit: there is no honest factor between
                  mass and IU, it differs by compound, so nothing here converts. */}
              <select
                aria-label="Vial unit"
                value={isIu ? 'iu' : 'mg'}
                onChange={e => changeVialUnit(e.target.value as 'mg' | 'iu')}
                className="border border-stone-200 bg-stone-50 px-2 py-2.5 text-xs text-stone-500 outline-none cursor-pointer hover:border-gold-300 transition-colors shrink-0"
              >
                <option value="mg">mg</option>
                <option value="iu">IU</option>
              </select>
            </div>
          </div>

          {/* BAC water */}
          <div>
            <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-2">
              Bacteriostatic Water Added
            </label>
            <p className="text-[8px] tracking-[0.18em] uppercase text-stone-500 mb-1.5">Recommended Amounts</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {WATER_PRESETS.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setWaterMl(v)}
                  className={`relative text-[9px] tracking-wider px-3 py-1.5 border transition-colors ${
                    waterMl === v
                      ? 'bg-gold-700 text-white border-gold-500'
                      : 'border-stone-200 text-stone-500 hover:border-gold-300 hover:text-gold-800'
                  }`}
                >
                  {v}mL
                  {v === RECOMMENDED_WATER && (
                    <span className={`block text-[6px] tracking-wider mt-0.5 ${waterMl === v ? 'text-white/80' : 'text-gold-700'}`}>
                      Recommended
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-[8px] tracking-[0.18em] uppercase text-stone-500 mb-1.5">Custom Amount</p>
            <div className="flex gap-2">
              <input
                type="number"
                value={waterMl}
                onChange={e => setWaterMl(e.target.value)}
                placeholder="Enter a custom amount"
                min="0"
                step="0.1"
                className="flex-1 border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white"
              />
              <span className="border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs text-stone-500 flex items-center shrink-0">
                mL
              </span>
            </div>
            <p className="text-[10px] text-stone-500 leading-relaxed mt-2">
              3mL is the recommended standard starting point for most reconstitutions. It gives a forgiving,
              easy-to-read concentration for a typical insulin syringe, and it is what our own pens are
              reconstituted with.
            </p>
          </div>

          {/* Desired dose */}
          <div>
            <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-2">
              Desired Dose
            </label>
            <p className="text-[8px] tracking-[0.18em] uppercase text-stone-500 mb-1.5">Recommended Dosages</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(isIu ? DOSE_PRESETS_IU : doseUnit === 'mcg' ? DOSE_PRESETS_MCG : DOSE_PRESETS_MG).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDesiredDose(v)}
                  className={`text-[9px] tracking-wider px-3 py-1.5 border transition-colors ${
                    desiredDose === v
                      ? 'bg-gold-700 text-white border-gold-500'
                      : 'border-stone-200 text-stone-500 hover:border-gold-300 hover:text-gold-800'
                  }`}
                >
                  {v}{doseLabel}
                </button>
              ))}
            </div>
            <p className="text-[8px] tracking-[0.18em] uppercase text-stone-500 mb-1.5">Custom Amount</p>
            <div className="flex gap-2">
              <input
                type="number"
                value={desiredDose}
                onChange={e => setDesiredDose(e.target.value)}
                placeholder="Enter a custom amount"
                min="0"
                step="0.1"
                className="flex-1 border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white"
              />
              {/* An IU vial is dosed in IU and nothing else, so there is no unit to choose. The mass
                  choice is kept in state untouched, so switching the vial back to mg brings the
                  earlier mcg-or-mg choice back with it (task e1f77268). */}
              {isIu ? (
                <span className="border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs text-stone-500 flex items-center shrink-0">
                  IU
                </span>
              ) : (
                <select
                  aria-label="Dose unit"
                  value={doseUnit}
                  onChange={e => changeDoseUnit(e.target.value as DoseUnit)}
                  className="border border-stone-200 bg-stone-50 px-2 py-2.5 text-xs text-stone-500 outline-none cursor-pointer hover:border-gold-300 transition-colors"
                >
                  <option value="mcg">mcg</option>
                  <option value="mg">mg</option>
                </select>
              )}
            </div>
            <p className="text-[10px] text-stone-500 leading-relaxed mt-2">
              The syringe reading shown in your results is in U-100 syringe units, the same scale printed on
              standard insulin syringes. {isIu
                ? 'Those units are a mark on the barrel, not International Units, so 10 units on the syringe is not 10 IU of product. Your result gives both.'
                : 'Set the vial to IU for a product measured in International Units, such as growth hormone. Nothing is converted between mg and IU: the factor is different for every compound, so your certificate of analysis is the only place that figure can come from.'}
            </p>
          </div>

          {/* Usage frequency — drives the duration estimate */}
          <div>
            <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-2">
              Usage Frequency
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {FREQUENCIES.map(f => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFrequency(f.value)}
                  className={`text-[9px] tracking-wider px-3 py-1.5 border transition-colors ${
                    frequency === f.value
                      ? 'bg-gold-700 text-white border-gold-500'
                      : 'border-stone-200 text-stone-500 hover:border-gold-300 hover:text-gold-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {frequency === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={customPerWeek}
                  onChange={e => setCustomPerWeek(e.target.value)}
                  placeholder="e.g. 4"
                  min="0"
                  step="0.5"
                  className="w-24 border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-sm text-stone-700 bg-white"
                />
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">times per week</span>
              </div>
            )}
            <p className="text-[10px] text-stone-500 leading-relaxed mt-2">
              Used only to estimate how long your vial will last — it does not affect the draw calculation above.
            </p>
          </div>

          <button
            type="button"
            onClick={reset}
            className="w-full text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-800 border border-stone-200 hover:border-gold-300 py-2.5 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* ---- RESULTS ---- */}
      <div className={`border border-gold-100 bg-gold-50/40 ${compact ? 'p-5 sm:p-6' : 'p-7 sm:p-9'}`}>
        <h2 className="text-[10px] tracking-[0.22em] uppercase text-stone-500 font-semibold mb-6">
          Your Result
        </h2>

        {results ? (
          <>
            {/* Headline instruction */}
            <div className="text-center mb-7">
              <p className="font-serif text-3xl text-gold-700 font-semibold tracking-wide">
                Pull to {formatUnits(results.drawUnits)} units
              </p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mt-1.5">
                {results.drawMl.toFixed(3)} mL draw on a {syringeSpec.label} syringe
              </p>
              {exceedsSyringe && (
                <p className="text-[10px] text-red-500 mt-2 leading-relaxed">
                  This draw exceeds the capacity of your selected {syringeSpec.label} syringe.
                  Choose a larger syringe or review your inputs before drawing.
                </p>
              )}
            </div>

            {/* Visual syringe scale + zoomed swipeable close-up */}
            <div className="space-y-6 mb-7">
              <SyringeRuler
                targetUnits={results.drawUnits}
                maxUnits={syringeSpec.maxUnits}
                majorStep={syringeSpec.majorStep}
              />
              <ZoomedSyringeView
                targetUnits={results.drawUnits}
                maxUnits={syringeSpec.maxUnits}
                majorStep={syringeSpec.majorStep}
              />
            </div>

            <div className="space-y-4 border-t border-gold-200 pt-5">
              <ResultRow
                label="Exact Draw Volume"
                value={`${results.drawMl.toFixed(3)} mL`}
                sub={`(${formatUnits(results.drawUnits)} units on a U-100 syringe)`}
                highlight
              />
              <ResultRow
                label="Peptide Dose"
                value={desiredDose + ' ' + doseLabel}
              />
              <ResultRow
                label="Doses in This Vial"
                value={`${results.totalDoses} dose${results.totalDoses === 1 ? '' : 's'}`}
              />
              {duration && (
                <ResultRow
                  label="Estimated Duration"
                  value={duration}
                  sub={`at ${perWeek} dose${perWeek === 1 ? '' : 's'} per week`}
                  highlight
                />
              )}
              <ResultRow
                label="Concentration"
                value={isIu
                  ? `${results.concPerMl.toFixed(2)} IU/mL`
                  : `${(results.concMcgPerMl ?? 0).toFixed(0)} mcg/mL`}
                sub={isIu ? 'International Units per mL' : `(${results.concPerMl.toFixed(3)} mg/mL)`}
              />
            </div>

            {/* Smart Dosing Assistant */}
            {suggestion && (
              <div className="mt-6 border border-gold-300 bg-white px-5 py-4">
                <p className="text-[9px] tracking-[0.22em] uppercase text-gold-700 font-semibold mb-1.5">
                  Smart Dosing Assistant
                </p>
                <p className="text-xs text-stone-600 leading-relaxed">
                  <span className="font-semibold text-gold-700">Pro Tip:</span> using{' '}
                  <span className="font-semibold">{suggestion.waterMl}mL</span> of bacteriostatic water instead of{' '}
                  {waterMl}mL may give you an easier syringe measurement &mdash; pull to approximately{' '}
                  <span className="font-semibold">{formatUnits(suggestion.drawUnits)} units</span> &mdash; while keeping
                  the same final dose of {desiredDose}{doseLabel}.
                </p>
              </div>
            )}

            <p className="mt-5 text-[9px] text-stone-500 leading-relaxed border-t border-gold-200 pt-4">
              Based on a U-100 insulin syringe (100 units = 1 mL, 1 unit = 0.01 mL). Figures are estimates for
              reference only — verify all calculations independently before drawing.
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center text-center gap-5 py-10">
            <SyringeRuler targetUnits={0} maxUnits={syringeSpec.maxUnits} majorStep={syringeSpec.majorStep} muted />
            <p className="text-sm text-stone-500">Enter values to see your result</p>
          </div>
        )}

        {!isIu && (
          <BlendBreakdown vialMg={parseFloat(peptideMg) || null} doses={blendDoses} onUseVialMg={(mg) => patch({ vialAmount: String(mg), vialUnit: 'mg' })} presets={blendPresets} />
        )}
      </div>
    </div>
  );
}

function ResultRow({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[9px] tracking-[0.18em] uppercase text-stone-500 shrink-0 pt-0.5">
        {label}
      </span>
      <div className="text-right">
        <span className={`text-sm font-semibold ${highlight ? 'text-gold-700' : 'text-stone-600'}`}>
          {value}
        </span>
        {sub && (
          <div className="text-[9px] text-stone-500">{sub}</div>
        )}
      </div>
    </div>
  );
}

// Horizontal syringe scale spanning the full barrel — a highlighted band runs
// from zero to the exact draw mark, the same way the markings read on a real syringe.
function SyringeRuler({
  targetUnits,
  maxUnits,
  majorStep,
  muted = false,
}: {
  targetUnits: number;
  maxUnits: number;
  majorStep: number;
  muted?: boolean;
}) {
  const ticks: number[] = [];
  for (let u = 0; u <= maxUnits; u++) ticks.push(u);
  const fillPct = Math.min((targetUnits / maxUnits) * 100, 100);

  return (
    <div>
      <p className="text-[8px] tracking-[0.18em] uppercase text-stone-500 mb-3">
        Syringe Scale &mdash; {maxUnits} Unit Barrel
      </p>
      <div className="relative h-20 border border-gold-200 bg-white rounded-sm overflow-hidden">
        {/* Shared positioning frame — fill, ticks and the target marker all read off
            the same inset box so their percentages line up exactly. */}
        <div className="absolute inset-x-4 inset-y-0">
          <div
            className={`absolute inset-y-0 left-0 transition-all duration-500 ${muted ? 'bg-stone-100' : 'bg-gold-200/60'}`}
            style={{ width: `${fillPct}%` }}
          />
          <div className="absolute inset-0 flex items-end justify-between">
            {ticks.map(u => {
              const isMajor = u % majorStep === 0;
              return (
                <div key={u} className="flex flex-col items-center">
                  <div className={`w-px ${isMajor ? 'h-7 bg-stone-400' : 'h-3.5 bg-stone-300'}`} />
                  {isMajor && <span className="text-[7px] text-stone-500 mt-1">{u}</span>}
                </div>
              );
            })}
          </div>
          {!muted && targetUnits > 0 && (
            <div className="absolute inset-y-0 border-l-2 border-gold-500" style={{ left: `${fillPct}%` }}>
              <span className="absolute -top-0.5 left-1.5 text-[9px] font-bold text-gold-700 whitespace-nowrap bg-white/90 px-1 rounded-sm">
                {formatUnits(targetUnits)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Magnified, swipeable close-up of the scale immediately around the target draw mark —
// makes the exact line to pull to unmistakable, and lets researchers explore neighbouring
// marks by scrolling horizontally, just like zooming in on a real syringe barrel.
function ZoomedSyringeView({
  targetUnits,
  maxUnits,
  majorStep,
}: {
  targetUnits: number;
  maxUnits: number;
  majorStep: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const TICK_PX = 32;
  const ticks: number[] = [];
  for (let u = 0; u <= maxUnits; u++) ticks.push(u);
  const fillPx = Math.min(targetUnits, maxUnits) * TICK_PX;
  const trackWidth = (maxUnits + 1) * TICK_PX;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = Math.min(targetUnits, maxUnits) * TICK_PX;
    el.scrollTo({ left: Math.max(0, target - el.clientWidth / 2), behavior: 'smooth' });
  }, [targetUnits, maxUnits]);

  return (
    <div>
      <p className="text-[8px] tracking-[0.18em] uppercase text-stone-500 mb-3">Zoomed-In View</p>
      <div ref={scrollRef} className="relative h-24 border border-gold-200 bg-white rounded-sm overflow-x-auto">
        <div className="relative h-full" style={{ width: `${trackWidth}px` }}>
          <div className="absolute inset-y-0 left-0 bg-gold-200/60" style={{ width: `${fillPx}px` }} />
          {ticks.map(u => {
            const isMajor = u % majorStep === 0;
            return (
              <div
                key={u}
                className="absolute bottom-3 flex flex-col items-center"
                style={{ left: `${u * TICK_PX}px`, transform: 'translateX(-50%)' }}
              >
                <div className={`w-px ${isMajor ? 'h-9 bg-stone-400' : 'h-5 bg-stone-300'}`} />
                {isMajor && <span className="text-[8px] text-stone-500 mt-1 whitespace-nowrap">{u}</span>}
              </div>
            );
          })}
          {targetUnits > 0 && (
            <div className="absolute inset-y-0 border-l-2 border-gold-500" style={{ left: `${fillPx}px` }}>
              <span className="absolute top-1.5 left-1.5 text-[9px] font-bold text-gold-700 whitespace-nowrap bg-white/90 px-1 rounded-sm">
                Pull to {formatUnits(targetUnits)}
              </span>
            </div>
          )}
        </div>
      </div>
      <p className="flex items-center justify-center gap-2 text-[9px] tracking-[0.15em] uppercase text-stone-500 mt-2.5">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Swipe to Explore
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </p>
    </div>
  );
}
