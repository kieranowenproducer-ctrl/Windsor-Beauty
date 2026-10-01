'use client';

// IU + V3-pen calculator. Standard reconstitution maths (verified against the
// common online peptide calculators): concentration = amount / water,
// draw = dose / concentration, U-100 units = draw mL x 100, pen clicks =
// draw mL / (mL per click). Works for products dosed in mg, in mcg, or in true
// International Units (HGH etc.). The pen's mL-per-click is a user-set field
// (it varies by pen model), never hardcoded.
//
// Micrograms (task bf5c5dbb). The vial and the dose are entered in whatever
// unit is printed on each, which is rarely the same one: a 10mg vial dosed at
// 250mcg is the ordinary case. So both amounts are converted to a single base
// unit before any arithmetic happens, and only the display converts back. That
// keeps one maths path for every combination instead of a branch per pairing,
// which is where a unit bug in a dosing tool would hide.

import { useMemo, useState } from 'react';
import type { BlendPreset } from '@/lib/blend';
import BlendBreakdown from './BlendBreakdown';
import { useCalculatorFigures, type FiguresControl, type MassUnit, type VialUnit } from './calculatorFigures';
import { calculateDraw } from './calculatorDraw';

type Device = 'syringe' | 'pen';

const WATER_PRESETS = ['1', '2', '3', '5'];
const CLICK_OPTIONS: { value: string; label: string }[] = [
  { value: '0.005', label: '0.005 mL' },
  { value: '0.01', label: '0.01 mL' },
  { value: '0.02', label: '0.02 mL' },
];

const MCG_PER_MG = 1000;

/** Into the base unit: mg for a mass product, IU for an IU product. */
const toBase = (amount: number, unit: VialUnit) => (unit === 'mcg' ? amount / MCG_PER_MG : amount);
/** Back out of the base unit, for display only. */
const fromBase = (amount: number, unit: VialUnit) => (unit === 'mcg' ? amount * MCG_PER_MG : amount);

const fmt = (n: number, dp = 2) => {
  const r = Number(n.toFixed(dp));
  return Number.isInteger(r) ? r.toFixed(0) : String(r);
};

// A concentration can be 5 mg/mL or 5000 mcg/mL or 0.005 mg/mL depending on the
// unit it is read in, so a fixed 2 decimal places would round the small end to
// nothing. Precision follows the magnitude instead.
const fmtConc = (n: number) => {
  if (!Number.isFinite(n)) return '0';
  if (n >= 100) return fmt(n, 0);
  if (n >= 10) return fmt(n, 1);
  if (n >= 1) return fmt(n, 2);
  if (n >= 0.1) return fmt(n, 3);
  return fmt(n, 4);
};

const UNIT_LABEL: Record<VialUnit, string> = { mg: 'mg', mcg: 'mcg', iu: 'IU' };
const VIAL_PLACEHOLDER: Record<VialUnit, string> = { mg: 'e.g. 10', mcg: 'e.g. 10000', iu: 'e.g. 100' };
const DOSE_PLACEHOLDER: Record<VialUnit, string> = { mg: 'e.g. 2', mcg: 'e.g. 250', iu: 'e.g. 2' };

interface PenIuCalculatorProps {
  /** Figures shared with the standard calculator on the calculator page (task 7b82f6b3). Absent, the calculator keeps its own. */
  figures?: FiguresControl;
  /** The device, when the page above chooses it (the V3 pen tab sets it to the pen). */
  device?: Device;
  onDeviceChange?: (device: Device) => void;
  /** The syringe side already chose its device and true-IU product unit. */
  fixedDevice?: boolean;
  iuOnly?: boolean;
  /** The blends to offer in the breakdown panel. Defaults to the curated list; the calculator
   *  page passes the curated list plus everything the shop sells (Kieran, video). */
  blendPresets?: BlendPreset[];
}

export default function PenIuCalculator({ figures: control, device: controlledDevice, onDeviceChange, fixedDevice = false, iuOnly = false, blendPresets }: PenIuCalculatorProps) {
  const [figures, patch] = useCalculatorFigures(control);
  const { vialUnit, doseUnit, vialAmount, waterMl, desiredDose } = figures;
  const setVialAmount = (value: string) => patch({ vialAmount: value });
  const setWaterMl = (value: string) => patch({ waterMl: value });
  const setDesiredDose = (value: string) => patch({ desiredDose: value });
  const [localDevice, setLocalDevice] = useState<Device>('syringe');
  const device = controlledDevice ?? localDevice;
  const setDevice = (next: Device) => {
    setLocalDevice(next);
    onDeviceChange?.(next);
  };
  const [mlPerClick, setMlPerClick] = useState('0.01');

  const isIu = vialUnit === 'iu';
  // A mass product's dose carries its own unit, because the vial and the dose
  // are rarely labelled in the same one. An IU product has no second unit.
  const doseDisplayUnit: VialUnit = isIu ? 'iu' : doseUnit;
  const vialBase = toBase(parseFloat(vialAmount), vialUnit);
  const doseBase = toBase(parseFloat(desiredDose), doseDisplayUnit);

  const result = useMemo(
    () => calculateDraw(vialBase, parseFloat(waterMl), doseBase),
    [vialBase, waterMl, doseBase],
  );
  const clicks = result ? result.drawMl / parseFloat(mlPerClick) : null;
  const doseLabel = UNIT_LABEL[doseDisplayUnit];
  // The concentration is shown in the unit the dose is being thought about in,
  // with the other mass unit underneath it so neither has to be worked out.
  const otherMassUnit: MassUnit = doseUnit === 'mcg' ? 'mg' : 'mcg';

  // Changing a unit KEEPS the number and changes the label (task 7b82f6b3,
  // see calculatorFigures.ts). It used to clear the box, and Kieran's video
  // shows what that cost: 250 typed, the unit switched to mcg because 250 mcg
  // was what he meant, and the box went blank.
  function changeVialUnit(next: VialUnit) {
    if (next === vialUnit) return;
    patch({ vialUnit: next });
  }

  function changeDoseUnit(next: MassUnit) {
    if (next === doseUnit) return;
    patch({ doseUnit: next });
  }

  // Blend breakdown (task 6bf5aee8). A click always delivers the same volume,
  // so its mg content follows from the concentration alone and does not depend
  // on the desired dose. Only meaningful when the vial is measured in mg: a
  // vial measured in true IU is a single compound.
  const blendDoses = useMemo(() => {
    if (isIu || !result) return [];
    const out: { label: string; mg: number }[] = [];
    if (device === 'pen') {
      const perClick = parseFloat(mlPerClick) * result.concentration;
      if (Number.isFinite(perClick) && perClick > 0) {
        out.push({ label: 'Per click', mg: perClick });
        out.push({ label: 'Per 10 clicks', mg: perClick * 10 });
      }
    } else {
      const perUnit = 0.01 * result.concentration; // one U-100 syringe unit = 0.01 mL
      if (Number.isFinite(perUnit) && perUnit > 0) {
        out.push({ label: 'Per syringe unit', mg: perUnit });
        out.push({ label: 'Per 10 units', mg: perUnit * 10 });
      }
    }
    // Already in milligrams, whichever unit it was typed in.
    if (Number.isFinite(doseBase) && doseBase > 0) out.push({ label: 'Your dose', mg: doseBase });
    return out;
  }, [isIu, result, device, mlPerClick, doseBase]);

  const seg = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-xs font-semibold tracking-wide transition-colors ${
      active ? 'bg-gold-700 text-white' : 'bg-white text-stone-500 border border-stone-200 hover:border-gold-300'
    }`;
  const inputCls =
    'w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-gold-500';
  const label = 'block text-[10px] tracking-[0.14em] uppercase text-stone-500 mb-2';

  return (
    <div className="border border-gold-100 bg-white p-5 sm:p-7">
      <div className="mb-6 flex items-center gap-2">
        <span className="text-lg" aria-hidden>&#129514;</span>
        <h2 className="font-serif text-2xl text-stone-800 tracking-wide">{iuOnly ? 'Product IU on a U-100 syringe' : 'IU and V3-Pen Calculator'}</h2>
      </div>

      {/* Device: first, because it is the choice the person made at the top of the page (task 7b82f6b3) */}
      {!fixedDevice && <div className="mb-5">
        <span className={label}>How are you measuring the dose?</span>
        <div className="flex gap-2">
          <button type="button" className={seg(device === 'syringe')} onClick={() => setDevice('syringe')}>U-100 insulin syringe</button>
          <button type="button" className={seg(device === 'pen')} onClick={() => setDevice('pen')}>V3 dosing pen</button>
        </div>
        {device === 'pen' && (
          <div className="mt-3 rounded-lg border border-stone-100 bg-stone-50 p-3">
            <span className={label}>Volume per click on your pen</span>
            <div className="flex gap-2">
              {CLICK_OPTIONS.map((o) => (
                <button key={o.value} type="button" onClick={() => setMlPerClick(o.value)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    mlPerClick === o.value ? 'bg-gold-700 text-white' : 'bg-white text-stone-500 border border-stone-200'}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
              Pen click volumes vary by model, so confirm yours with the manufacturer before dosing. 0.01 mL per
              click is the most common. Note: a &ldquo;60 click&rdquo; pen means a maximum single dose of about 60
              units (0.6 mL) on the dial, which is not the same as the cartridge capacity.
            </p>
          </div>
        )}
      </div>}

      {/* Vial unit */}
      <div className="mb-5">
        <span className={label}>How is your product measured?</span>
        {/* Three across, each with its abbreviation beneath, because
            "International Units" cannot fit on one line in a third of a phone
            screen. Same two-line treatment the standard tab gives its syringe
            sizes. */}
        {!iuOnly && <div className="grid grid-cols-3 gap-2">
          <button type="button" className={seg(vialUnit === 'mg')} onClick={() => changeVialUnit('mg')}>
            Milligrams
            <span className="block text-[10px] font-normal tracking-wider mt-0.5">mg</span>
          </button>
          <button type="button" className={seg(vialUnit === 'mcg')} onClick={() => changeVialUnit('mcg')}>
            Micrograms
            <span className="block text-[10px] font-normal tracking-wider mt-0.5">mcg</span>
          </button>
          <button type="button" className={seg(isIu)} onClick={() => changeVialUnit('iu')}>
            Intl. Units
            <span className="block text-[10px] font-normal tracking-wider mt-0.5">IU</span>
          </button>
        </div>}
        {isIu && (
          <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
            Product IU means the International Units of biological activity stated on the product. U-100 syringe
            marks measure volume: 100 syringe units = 1 mL. They are not product IU. Use the IU amount stated
            for this product; the calculator does not assume an IU-to-mg conversion.
          </p>
        )}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div>
          <span className={label}>Peptide in the vial</span>
          <div className="relative">
            <input inputMode="decimal" value={vialAmount} onChange={(e) => setVialAmount(e.target.value)}
              placeholder={VIAL_PLACEHOLDER[vialUnit]} className={inputCls} aria-label={`Peptide in the vial in ${UNIT_LABEL[vialUnit]}`} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-500">
              {UNIT_LABEL[vialUnit]}
            </span>
          </div>
        </div>
        <div>
          <span className={label}>Desired dose per injection</span>
          {/* The dose carries its own unit selector, the same control the
              standard tab uses, because a vial in mg is routinely dosed in mcg. */}
          <div className="relative flex gap-2">
            <input inputMode="decimal" value={desiredDose} onChange={(e) => setDesiredDose(e.target.value)}
              placeholder={DOSE_PLACEHOLDER[doseDisplayUnit]} className={`${inputCls} flex-1`}
              aria-label={`Desired dose per injection in ${doseLabel}`} />
            {isIu ? (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-500">IU</span>
            ) : (
              <select value={doseUnit} onChange={(e) => changeDoseUnit(e.target.value as MassUnit)}
                aria-label="Dose unit"
                className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-2.5 text-xs text-stone-500 outline-none transition-colors hover:border-gold-300 focus:border-gold-500">
                <option value="mcg">mcg</option>
                <option value="mg">mg</option>
              </select>
            )}
          </div>
          {!isIu && (
            <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
              1 mg is 1,000 mcg. Enter each figure in the unit printed on it and the calculator converts between them.
            </p>
          )}
        </div>
        <div>
          <span className={label}>Bacteriostatic water</span>
          <div className="relative">
            <input inputMode="decimal" value={waterMl} onChange={(e) => setWaterMl(e.target.value)}
              placeholder="e.g. 3" className={inputCls} aria-label="Bacteriostatic water in mL" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-500">mL</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {WATER_PRESETS.map((w) => (
              <button key={w} type="button" onClick={() => setWaterMl(w)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  waterMl === w ? 'bg-gold-100 text-gold-700' : 'bg-stone-50 text-stone-500 hover:bg-stone-100'}`}>
                {w} mL
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {result ? (
        <div className="rounded-xl border border-gold-200 bg-gold-50 p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] tracking-[0.12em] uppercase text-gold-700 mb-1">Concentration</p>
              <p className="font-serif text-xl text-stone-800">{fmtConc(fromBase(result.concentration, doseDisplayUnit))}</p>
              <p className="text-[11px] text-stone-500">{doseLabel}/mL</p>
              {!isIu && (
                <p className="text-[11px] text-stone-500">
                  {fmtConc(fromBase(result.concentration, otherMassUnit))} {otherMassUnit}/mL
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] tracking-[0.12em] uppercase text-gold-700 mb-1">Draw volume</p>
              <p className="font-serif text-xl text-stone-800">{fmt(result.drawMl, 3)}</p>
              <p className="text-[11px] text-stone-500">mL</p>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.12em] uppercase font-semibold text-gold-700 mb-1">
                {device === 'pen' ? 'Pen clicks' : 'U-100 syringe marks'}
              </p>
              <p className="leading-none">
                <span className="inline-block rounded-md bg-gold-200/60 px-2 py-0.5 font-serif text-2xl font-bold text-gold-800">
                  {device === 'pen' ? fmt(clicks ?? 0, 1) : fmt(result.syringeMarks, 1)}
                </span>
              </p>
              <p className="text-[11px] text-gold-700 mt-1">{device === 'pen' ? 'clicks' : 'marks (U-100 volume scale)'}</p>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.12em] uppercase text-gold-700 mb-1">Doses per vial</p>
              <p className="font-serif text-xl text-stone-800">{result.totalDoses}</p>
              <p className="text-[11px] text-stone-500">full doses</p>
            </div>
          </div>
          <p className="mt-4 border-t border-gold-200 pt-3 text-[11px] leading-relaxed text-stone-500">
            Draw {fmt(result.drawMl, 3)} mL for each {fmt(parseFloat(desiredDose), 2)} {doseLabel} dose
            {device === 'pen'
              ? <> (<strong className="font-semibold text-gold-800">{fmt(clicks ?? 0, 1)} clicks</strong> at {mlPerClick} mL per click).</>
              : <> (<strong className="font-semibold text-gold-800">{fmt(result.syringeMarks, 1)} U-100 marks</strong> on the syringe).</>}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-5 text-center text-sm text-stone-500">
          Enter your peptide amount, desired dose and water volume to see the result.
        </div>
      )}

      <BlendBreakdown
        presets={blendPresets}
        vialMg={isIu ? null : vialBase || null}
        doses={blendDoses}
        available={!isIu}
        onUseVialMg={(mg) => {
          // The presets are published in milligrams, so put the field in
          // milligrams rather than dropping an mg figure into an mcg box.
          patch({ vialUnit: 'mg', vialAmount: String(mg) });
        }}
      />

      <p className="mt-4 text-[11px] leading-relaxed text-stone-500">
        For research reference only. These are estimates. Always verify every calculation and your pen or syringe
        markings independently before use. This tool does not provide medical advice.
      </p>
    </div>
  );
}
