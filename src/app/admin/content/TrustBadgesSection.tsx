'use client';

import type { TrustBadge } from '@/lib/trustBadges';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  trustBadges: TrustBadge[];
  updateTrustBadge: (index: number, patch: Partial<TrustBadge>) => void;
  handleSaveTrustBadges: () => void;
  handleResetTrustBadges: () => void;
  trustBadgesSaving: boolean;
  trustBadgesMessage: string;
  trustBadgesOverridden: boolean;
}

export default function TrustBadgesSection({
  trustBadges, updateTrustBadge, handleSaveTrustBadges, handleResetTrustBadges,
  trustBadgesSaving, trustBadgesMessage, trustBadgesOverridden,
}: Props) {
  return (
    <>
            {/* Homepage trust badges */}
            <div id="section-trust-badges" className="bg-white border border-stone-200 p-6">
              <h2 className="text-sm font-semibold text-stone-800 mb-1">Trust Badges</h2>
              <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                Edit the four trust badges shown on the homepage. Each one has a short title and a
                line underneath. Changes appear on the live site as soon as they&apos;re saved.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {trustBadges.map((badge, i) => (
                  <div key={i} className="border border-stone-100 p-3 space-y-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Heading</span>
                      <input
                        type="text"
                        value={badge.title}
                        onChange={(e) => updateTrustBadge(i, { title: e.target.value })}
                        className="border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Description</span>
                      <input
                        type="text"
                        value={badge.subtitle}
                        onChange={(e) => updateTrustBadge(i, { subtitle: e.target.value })}
                        className="border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                      />
                    </label>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleSaveTrustBadges}
                  disabled={trustBadgesSaving}
                  className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
                >
                  {trustBadgesSaving ? 'Saving…' : 'Save Trust Badges'}
                </button>
                {trustBadgesOverridden && (
                  <button
                    onClick={handleResetTrustBadges}
                    disabled={trustBadgesSaving}
                    className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    Reset to Default
                  </button>
                )}
                {trustBadgesMessage && (
                  <p className="text-xs text-stone-500">{trustBadgesMessage}</p>
                )}
              </div>
            </div>
    </>
  );
}
