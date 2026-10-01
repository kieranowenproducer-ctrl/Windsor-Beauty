'use client';

import { useState } from 'react';
import type { SliceRow } from './AdsData';
import { GOLD, count, moneyFromMinor } from './shared';

// Breakdown card: horizontal share bars, flippable between money spent and views.

export default function BreakdownCard({ title, hint, rows, currency }: {
  title: string; hint: string; rows: SliceRow[]; currency: string;
}) {
  const hasSpend = rows.some((r) => r.spendMinor > 0);
  const hasViews = rows.some((r) => r.impressions > 0);
  const [mode, setMode] = useState<'spend' | 'views' | null>(null);
  const active: 'spend' | 'views' = mode ?? (hasSpend ? 'spend' : 'views');

  const valueOf = (r: SliceRow) => (active === 'spend' ? r.spendMinor : r.impressions);
  const top = [...rows].sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 6);
  const max = Math.max(1, ...top.map(valueOf));

  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-xs font-semibold text-stone-800">{title}</h3>
        {hasSpend && hasViews && (
          <div className="flex items-center gap-1">
            {(['spend', 'views'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`text-[10px] tracking-[0.14em] uppercase px-3 py-2 border rounded-md transition-colors ${
                  active === m
                    ? 'bg-gold-700 text-white border-gold-500'
                    : 'border-stone-200 text-stone-500 hover:border-gold-300 hover:text-gold-700'
                }`}
              >
                {m === 'spend' ? 'Spent' : 'Views'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="text-[11px] text-stone-500 mb-4">{hint}</div>
      {top.every((r) => valueOf(r) === 0) || top.length === 0 ? (
        <p className="text-xs text-stone-500 py-4">No data yet for this period.</p>
      ) : (
        <div className="space-y-3">
          {top.map((r) => (
            <div key={r.label}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs text-stone-700">{r.label}</span>
                <span className="text-xs font-semibold text-stone-600">
                  {active === 'spend' ? moneyFromMinor(r.spendMinor, currency) : `${count(r.impressions)} views`}
                </span>
              </div>
              <div className="h-1.5 bg-stone-100 rounded-full">
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, (valueOf(r) / max) * 100)}%`, backgroundColor: GOLD }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
