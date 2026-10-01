'use client';

// The calculator page offers two tools: the standard mg/mcg calculator for an
// insulin syringe, and the IU / V3-pen calculator for products dosed in
// International Units or drawn with a click pen.
//
// The choice sits at the top, and the figures live HERE rather than inside
// each calculator (task 7b82f6b3). Before this, each tool kept its own
// numbers, so pressing the other tab threw away everything typed. Now one set
// of figures feeds both, and a dose typed for the syringe is still there when
// the V3 pen is chosen, and the other way round.

import { useState } from 'react';
import DosageCalculator from './DosageCalculator';
import PenIuCalculator from './PenIuCalculator';
import { EMPTY_FIGURES, type CalculatorFigures, type FiguresPatch } from './calculatorFigures';
import { PEN_WATER_ML, type PenPreset } from '@/lib/penPresets';
import { BLEND_PRESETS, type BlendPreset } from '@/lib/blend';

type Tab = 'syringe' | 'pen';

export default function CalculatorTabs({ pens = [], blendPresets = BLEND_PRESETS }: { pens?: PenPreset[]; blendPresets?: BlendPreset[] }) {
  const [tab, setTab] = useState<Tab>('syringe');
  const [figures, setFigures] = useState<CalculatorFigures>(EMPTY_FIGURES);
  // Which pen was picked, so the drop-down still shows it. Not a source of truth for anything:
  // the figures are, and they stay editable after a pick.
  const [pickedPen, setPickedPen] = useState('');
  // The syringe side can use either mass or true product IU. The pen side
  // retains its own device picker for people who move between devices.
  const [penDevice, setPenDevice] = useState<'syringe' | 'pen'>('pen');

  const control = {
    figures,
    onChange: (patch: FiguresPatch) => setFigures((current) => ({ ...current, ...patch })),
  };

  const btn = (active: boolean) =>
    `rounded-lg px-5 py-2.5 text-xs font-semibold tracking-wide transition-colors ${
      active ? 'bg-gold-700 text-white' : 'bg-white text-stone-500 border border-stone-200 hover:border-gold-300'
    }`;

  /**
   * Picking a pen fills the two figures that are already known about it (task b0f86954).
   *
   * It fills, it does not lock: every box stays typeable afterwards, which is what Kieran asked
   * for ("A customer can ever use a custom number"). The dose is deliberately left alone, because
   * that is the one figure the pen cannot tell us.
   */
  const choosePen = (id: string) => {
    setPickedPen(id);
    const pen = pens.find((p) => p.id === id);
    if (!pen) return;
    setFigures((current) => ({
      ...current,
      waterMl: PEN_WATER_ML,
      // A pen whose strength could not be read fills the water only, rather than a made-up amount.
      ...(pen.amount ? { vialAmount: pen.amount, vialUnit: pen.unit } : {}),
    }));
  };

  const chosen = pens.find((p) => p.id === pickedPen) ?? null;

  /* THE SYRINGE SIDE NOW TAKES IU ITSELF (task e1f77268). Kieran: "Dosage Calculator for syringes
     needs iu also as an option. Just like the v3 as hgh and other peptides needs dosages in IU not
     mg." There used to be a second question here, "How is the product amount measured?", which
     swapped the syringe calculator out for the pen one in IU mode. Two things were wrong with it:
     the IU version had no syringe ruler, no duration and no syringe-size picker, and pressing it
     EMPTIED the amount and the dose. The unit now sits inside the calculator, next to the amount it
     applies to, and nothing typed is thrown away when it changes. */

  /* The pen picker lives on the V3 PEN SIDE ONLY, under the two buttons (Kieran, video, after the
     first version shipped: "insulin is selected as default and it says please choose a pen to fill
     for me. This shouldn't be part of it, this should only appear when we have a pen... this should
     be placed underneath here"). It sat above the buttons before, so the page opened on the syringe
     with a pen question at the top of it, which is nobody's first question. */
  const penPicker = pens.length === 0 ? null : (
    <div className="mb-6 border border-gold-200 bg-gold-50/40 px-4 py-4 sm:px-5">
      <label htmlFor="pen-preset" className="block text-[9px] tracking-[0.2em] uppercase text-gold-700 mb-2">
        Using one of our pens?
      </label>
      <select
        id="pen-preset"
        value={pickedPen}
        onChange={(e) => choosePen(e.target.value)}
        className="w-full border border-stone-200 focus:border-gold-400 outline-none bg-white px-3 py-2.5 text-sm text-stone-700"
      >
        <option value="">Choose a pen to fill it in for me</option>
        {pens.map((pen) => (
          <option key={pen.id} value={pen.id}>{pen.label}</option>
        ))}
      </select>
      <p className="mt-2 text-[11px] text-stone-500 leading-relaxed">
        {chosen
          ? chosen.amount
            ? `Filled in: ${chosen.amount}${chosen.unit === 'iu' ? ' IU' : chosen.unit} of peptide and ${PEN_WATER_ML}mL of bacteriostatic water. Change either one if yours differs, then enter your dose below.`
            : `Filled in ${PEN_WATER_ML}mL of bacteriostatic water. This pen does not list a strength, so type the amount of peptide yourself.`
          : `Picking a pen fills in the peptide it holds and ${PEN_WATER_ML}mL of bacteriostatic water. You can still type your own figures instead.`}
      </p>
    </div>
  );

  return (
    <div>
      <p className="mb-2 text-center text-[9px] tracking-[0.2em] uppercase text-stone-500">
        How will you measure the dose?
      </p>
      <div className="mb-2 flex justify-center gap-2">
        <button type="button" aria-pressed={tab === 'syringe'} className={btn(tab === 'syringe')} onClick={() => setTab('syringe')}>
          Insulin syringe
          <span className="block text-[10px] font-normal tracking-wider mt-0.5">mg / mcg / IU</span>
        </button>
        <button
          type="button"
          aria-pressed={tab === 'pen'}
          className={btn(tab === 'pen')}
          onClick={() => {
            setTab('pen');
            setPenDevice('pen');
          }}
        >
          V3 pen
          <span className="block text-[10px] font-normal tracking-wider mt-0.5">or IU products</span>
        </button>
      </div>
      <p className="mb-6 text-center text-[11px] text-stone-500">Everything you type stays put. Switching device, or switching a unit, never empties a box. Units are never converted between mass and IU, because that factor is different for every product.</p>
      {tab === 'syringe' ? (
        <DosageCalculator figures={control} blendPresets={blendPresets} />
      ) : (
        <>
          {penPicker}
          <PenIuCalculator figures={control} device={penDevice} onDeviceChange={setPenDevice} blendPresets={blendPresets} />
        </>
      )}
    </div>
  );
}
