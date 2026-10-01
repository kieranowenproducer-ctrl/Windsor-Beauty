'use client';

// Advanced blend breakdown (task 6bf5aee8).
//
// A blend holds more than one peptide in one vial or pen, so a dose delivers
// each component in proportion to its share. This panel takes the doses the
// calculator has already worked out and splits them, which is why it can serve
// both the syringe calculator and the pen calculator without either of them
// changing how they calculate anything.
//
// Optional and closed by default: nobody calculating a single-peptide product
// should have to look at it.

import { useMemo, useState } from 'react';
import {
  BLEND_PRESETS,
  blendMismatch,
  blendTotalMg,
  formatAmount,
  splitDose,
  usableComponents,
  type BlendComponent,
  type BlendPreset,
} from '@/lib/blend';

// Back to the 5 the brief asked for. It was raised to 10 only to fit HHB Hair
// Nails' nine ingredients, and HHB is no longer listed, so the reason is gone.
// The largest remaining blend is Klow with four.
const MAX_COMPONENTS = 5;

export interface BlendDose {
  /** What this dose is, e.g. "Per click" or "Your dose". */
  label: string;
  /** Total blended powder delivered, in mg. */
  mg: number;
}

interface Props {
  /** Vial or pen total in mg, used only to sanity-check the entered split. */
  vialMg: number | null;
  /** The doses to break down. Empty means the calculator has nothing yet. */
  doses: BlendDose[];
  /** Hidden entirely when the product is dosed in true IU (a single compound). */
  available?: boolean;
  /**
   * Lets a chosen preset fill the calculator's vial amount in one tap.
   * Without it, picking Klow 80mg on the standard calculator leaves the vial
   * field empty (its buttons only offer 5, 10 and 15mg), so the breakdown sits
   * there saying "fill in the calculator above" and reads as broken.
   */
  onUseVialMg?: (mg: number) => void;
  /**
   * The blends to offer. Defaults to the curated list so the checkout pop-up, which has no
   * catalogue loaded, behaves exactly as before. The calculator page passes the curated list
   * PLUS everything the shop is selling, so a blend cannot be missing from it (Kieran, video:
   * "all the blends should be there... if we add any more blends your calculator should
   * automatically know").
   */
  presets?: BlendPreset[];
}

const blankRow = (): BlendComponent => ({ name: '', mg: NaN });

export default function BlendBreakdown({ vialMg, doses, available = true, onUseVialMg, presets = BLEND_PRESETS }: Props) {
  const [open, setOpen] = useState(false);
  const [presetId, setPresetId] = useState('custom');
  const [rows, setRows] = useState<BlendComponent[]>([blankRow(), blankRow()]);

  const components = useMemo(() => usableComponents(rows), [rows]);
  const total = blendTotalMg(rows);
  const mismatch = useMemo(() => blendMismatch(rows, vialMg ?? NaN), [rows, vialMg]);

  if (!available) return null;

  function applyPreset(id: string) {
    setPresetId(id);
    if (id === 'custom') { setRows([blankRow(), blankRow()]); return; }
    const preset = presets.find((p) => p.id === id);
    if (preset) setRows(preset.components.map((c) => ({ ...c })));
  }

  function updateRow(i: number, patch: Partial<BlendComponent>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setPresetId('custom');
  }

  const inputCls =
    'w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-sm text-stone-700 bg-white transition-colors rounded-lg';
  const activePreset = presets.find((p) => p.id === presetId);

  return (
    <div className="mt-6 border-t border-stone-100 pt-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <span>
          <span className="block text-sm font-semibold text-stone-700">Advanced: blend breakdown</span>
          <span className="block text-[11px] text-stone-500 leading-relaxed">
            For products holding more than one peptide, work out how much of each one a dose delivers.
          </span>
        </span>
        <span className="ml-4 shrink-0 text-gold-700 text-xs font-semibold">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="blend-preset" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">Blend</label>
            <select id="blend-preset" value={presetId} onChange={(e) => applyPreset(e.target.value)} className={inputCls}>
              <option value="custom">Enter the blend myself</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            {activePreset && (
              <p className="mt-1.5 text-[10px] leading-relaxed">
                <span
                  className={`inline-block mr-1.5 px-1.5 py-0.5 rounded text-[9px] tracking-[0.1em] uppercase font-semibold ${
                    activePreset.confidence === 'published'
                      ? 'bg-stone-100 text-stone-500'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {activePreset.confidence === 'published' ? 'Published split' : 'Inferred, verify'}
                </span>
                <span className="text-stone-500">{activePreset.source}</span>
              </p>
            )}

            {activePreset && onUseVialMg && vialMg !== activePreset.totalMg && (
              <button
                type="button"
                onClick={() => onUseVialMg(activePreset.totalMg)}
                className="mt-2 text-[10px] tracking-[0.15em] uppercase border border-gold-300 text-gold-700 px-3 py-2 rounded-lg hover:bg-gold-50 transition-colors"
              >
                Set the amount above to {activePreset.totalMg} mg
              </button>
            )}
            <p className="mt-1.5 text-[10px] text-stone-500 leading-relaxed">
              Presets load into the fields below so you can correct them. Always check the amounts against
              the product label or its certificate of analysis before relying on any figure.
            </p>
          </div>

          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_auto] gap-2 items-center">
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                  placeholder={i === 0 ? 'e.g. GHK-Cu' : 'Peptide name'}
                  className={inputCls}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={Number.isFinite(row.mg) ? row.mg : ''}
                  onChange={(e) => updateRow(i, { mg: e.target.value === '' ? NaN : parseFloat(e.target.value) })}
                  placeholder="mg"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => { setRows((prev) => prev.filter((_, idx) => idx !== i)); setPresetId('custom'); }}
                  disabled={rows.length <= 1}
                  className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed px-1"
                  aria-label={`Remove component ${i + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
            {rows.length < MAX_COMPONENTS && (
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, blankRow()])}
                className="text-[10px] tracking-[0.2em] uppercase border border-gold-300 text-gold-700 px-4 py-2 rounded-lg hover:bg-gold-50 transition-colors"
              >
                + Add component
              </button>
            )}
            <p className="text-[10px] text-stone-500">
              Up to {MAX_COMPONENTS} components. Blend total: <strong className="text-stone-600">{total > 0 ? `${Number(total.toFixed(3))} mg` : 'not set'}</strong>
            </p>
          </div>

          {mismatch && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
              The components add up to {Number(mismatch.totalMg.toFixed(3))} mg, but the vial amount above is{' '}
              {Number(mismatch.vialMg.toFixed(3))} mg. Check the figures, because every result below is worked
              out from the split you have entered.
            </p>
          )}

          {components.length === 0 ? (
            <p className="text-[11px] text-stone-500">Enter at least one component with an amount to see the breakdown.</p>
          ) : doses.length === 0 ? (
            <p className="text-[11px] text-stone-500">Fill in the calculator above and the breakdown will appear here.</p>
          ) : (
            <div className="space-y-4">
              {doses.map((dose) => {
                const shares = splitDose(dose.mg, rows);
                if (!shares.length) return null;
                return (
                  <div key={dose.label} className="border border-stone-200 rounded-xl overflow-hidden">
                    <div className="bg-stone-50 px-4 py-2 border-b border-stone-200 flex items-baseline justify-between">
                      <span className="text-[10px] tracking-[0.18em] uppercase text-stone-500 font-semibold">{dose.label}</span>
                      <span className="text-[11px] text-stone-500">{formatAmount(dose.mg)} of blend</span>
                    </div>
                    <table className="w-full">
                      <tbody>
                        {shares.map((s) => (
                          <tr key={s.name} className="border-b border-stone-100 last:border-0">
                            <td className="px-4 py-2 text-sm text-stone-700">{s.name}</td>
                            <td className="px-4 py-2 text-[11px] text-stone-500 text-right whitespace-nowrap">
                              {(s.fraction * 100).toFixed(1)}%
                            </td>
                            <td className="px-4 py-2 text-sm font-semibold text-stone-800 text-right whitespace-nowrap">
                              {formatAmount(s.doseMg)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-stone-500 leading-relaxed">
            Supplied strictly for research purposes. These figures are arithmetic based on the blend you
            entered and do not constitute guidance of any kind.
          </p>
        </div>
      )}
    </div>
  );
}
