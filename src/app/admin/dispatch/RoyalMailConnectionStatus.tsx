'use client';

import { formatDate, type RoyalMailStats } from './dispatchTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  royalMailConfigured: boolean;
  royalMailLiveMode: boolean;
  royalMailStats: RoyalMailStats | null;
  syncNow: () => void;
  syncingNow: boolean;
  syncNowResult: { checked: number; dispatched: number } | null;
}

export default function RoyalMailConnectionStatus({
  royalMailConfigured, royalMailLiveMode, royalMailStats,
  syncNow, syncingNow, syncNowResult,
}: Props) {
  return (
    <>
            {/* Connection status — replaces the old alarming "sandbox/live" red
                banner with a calmer always-visible summary, plus the last
                success/failure so a problem is visible without opening an
                order. */}
            {royalMailConfigured && (
              <div className="border border-stone-200 bg-white px-5 py-4 mb-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Connected</p>
                    <p className="text-xs font-semibold text-green-600">Yes</p>
                  </div>
                  <div>
                    <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Mode</p>
                    <p className={`text-xs font-semibold ${royalMailLiveMode ? 'text-gold-700' : 'text-stone-600'}`}>
                      {royalMailLiveMode ? 'Live' : 'Test'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Last Label Created</p>
                    <p className="text-xs text-stone-600">
                      {royalMailStats?.lastLabelCreatedAt ? formatDate(royalMailStats.lastLabelCreatedAt) : 'None yet'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Last API Error</p>
                    <p className="text-xs text-stone-600">
                      {royalMailStats?.lastErrorAt ? formatDate(royalMailStats.lastErrorAt) : 'None'}
                    </p>
                  </div>
                </div>
                {royalMailStats?.lastErrorMessage && (
                  <p className="text-[10px] text-red-500 leading-relaxed mt-3 pt-3 border-t border-stone-100">
                    {royalMailStats.lastErrorOrderNumber && (
                      <span className="font-mono text-stone-500">{royalMailStats.lastErrorOrderNumber}: </span>
                    )}
                    {royalMailStats.lastErrorMessage}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={syncNow}
                    disabled={syncingNow}
                    className="text-[10px] tracking-[0.15em] uppercase font-semibold text-gold-700 hover:text-gold-700 transition-colors disabled:opacity-50"
                  >
                    {syncingNow ? 'Syncing…' : 'Sync Now'}
                  </button>
                  <p className="text-[10px] text-stone-400">
                    Retries every order awaiting a label/tracking number immediately, instead of waiting for the once-daily automatic sync.
                  </p>
                  {syncNowResult && (
                    <p className="text-[10px] text-stone-500">
                      Checked {syncNowResult.checked}, dispatched {syncNowResult.dispatched}.
                    </p>
                  )}
                </div>
                {royalMailLiveMode && (
                  <p className="text-[10px] text-stone-400 leading-relaxed mt-3 pt-3 border-t border-stone-100">
                    Connected to Royal Mail&apos;s live system — clicking &quot;Create Label&quot; below creates a
                    real shipment and may incur a real postage charge on your Royal Mail account. Double-check the
                    order details first.
                  </p>
                )}
              </div>
            )}
    </>
  );
}
