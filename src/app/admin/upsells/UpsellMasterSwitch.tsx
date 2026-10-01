'use client';

import type { UpsellSettings } from './upsellTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  settings: UpsellSettings;
  toggleEnabled: () => void;
  togglingEnabled: boolean;
}

export default function UpsellMasterSwitch({ settings, toggleEnabled, togglingEnabled }: Props) {
  return (
    <>
          {/* Master switch */}
          <div className="bg-white border border-stone-200 p-6 mb-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-stone-800 mb-1">Upsell System {settings.enabled ? 'On' : 'Off'}</h2>
                <p className="text-xs text-stone-400 leading-relaxed max-w-md">
                  When off, the basket behaves exactly as it does today — no recommendations are fetched or
                  shown anywhere, and nothing else on the site is affected. This applies to both CSV-imported
                  and manually-set upsells.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.enabled}
                onClick={toggleEnabled}
                disabled={togglingEnabled}
                className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${
                  settings.enabled ? 'bg-gold-700' : 'bg-stone-200'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    settings.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
    </>
  );
}
