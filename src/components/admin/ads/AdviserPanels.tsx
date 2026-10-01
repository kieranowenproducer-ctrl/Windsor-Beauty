'use client';

import { useAds } from './AdsData';
import { formatDate } from './shared';

// The adviser: what the numbers say (arithmetic, no AI) and what to try next
// (AI, pennies, capped), plus the one-off link tags that join ads to our till.

const CARD = 'bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)] p-5 sm:p-6';

export function AdviserPanels() {
  const { loading, signals, advice, writing, writeFreshAdvice } = useAds();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8" data-testid="adviser-panels">
      <div className={CARD}>
        <h2 className="text-sm font-semibold text-stone-800 mb-1">What the numbers say</h2>
        <div className="text-[11px] text-stone-500 mb-4">Computed from the data, no AI involved</div>
        {loading ? (
          <p className="text-xs text-stone-500">Loading...</p>
        ) : signals.length === 0 ? (
          <p className="text-xs text-stone-500 py-2">Nothing to say yet. Signals appear once ads have run.</p>
        ) : (
          <ul className="space-y-2.5">
            {signals.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                  s.kind === 'warning' ? 'bg-red-400' : s.kind === 'fact' ? 'bg-gold-700' : 'bg-stone-300'
                }`} />
                <span className="text-xs text-stone-600">
                  {s.text}
                  {!s.solid && <span className="text-stone-500"> (early days)</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={CARD}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="text-sm font-semibold text-stone-800">Worth trying next</h2>
          <button
            onClick={writeFreshAdvice}
            disabled={writing}
            className="text-[10px] tracking-[0.14em] uppercase px-3 py-2 rounded-md border border-gold-500 text-gold-700 hover:bg-gold-700 hover:text-white transition-colors disabled:opacity-50"
          >
            {writing ? 'Writing...' : 'Write fresh advice'}
          </button>
        </div>
        <div className="text-[11px] text-stone-500 mb-4">
          Written by AI from the signals, costs about a penny, capped daily. It never touches the ads itself.
        </div>
        {advice.text ? (
          <>
            <p className="text-xs text-stone-600 whitespace-pre-line">{advice.text}</p>
            {advice.when && <p className="text-[10px] text-stone-500 mt-2">Written {formatDate(advice.when)}</p>}
          </>
        ) : (
          <p className="text-xs text-stone-500 py-2">
            No advice written yet. It writes itself each Monday once ads are running, or press the button.
          </p>
        )}
        {advice.note && <p className="text-[11px] text-red-600 mt-2">{advice.note}</p>}
      </div>
    </div>
  );
}
