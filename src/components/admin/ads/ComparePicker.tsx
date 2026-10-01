'use client';

import { useState } from 'react';
import type { AdRow } from '@/lib/ads/meta';
import { MAX_COMPARED, SLOTS, adDisplayName, type CreativeLink, type Slot } from '@/lib/ads/labels';
import { count, metaAccountLabel, moneyFromMinor } from './shared';

// Tick the ads to compare, up to five (Kieran, 4 Sept 2026: "if I have five
// ads running on the go ... it should be multiple I'm allowed to choose").
// A ticked ad gets the lowest free letter, A to E, and keeps it until it is
// unticked; the graph, the cards and the verdict follow the ticks. Ads appear
// in this list on their own once they exist in Meta Ads Manager. Each row is
// one big tap target (audit item 6).

interface Props {
  ads: AdRow[];
  links: Record<string, CreativeLink>;
  currency: string;
  accountIds: string[];
  onSaved: (adId: string, link: CreativeLink, all?: Record<string, CreativeLink>) => void;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

export default function ComparePicker({ ads, links, currency, accountIds, onSaved }: Props) {
  const [state, setState] = useState<SaveState>('idle');
  const ticked = ads.filter((a) => links[a.id]?.slot);
  const taken = new Set(ticked.map((a) => links[a.id]?.slot as Slot));
  const full = ticked.length >= MAX_COMPARED;

  async function save(ad: AdRow, slot: Slot | null) {
    setState('saving');
    try {
      const link = links[ad.id];
      const body = { adId: ad.id, adName: ad.name, slot: slot ?? '', note: link?.note ?? '', label: link?.label ?? '' };
      const res = await fetch('/api/admin/ads/creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const answer = (await res.json().catch(() => ({}))) as { links?: Record<string, CreativeLink> | null };
      if (res.ok) {
        onSaved(ad.id, { adName: ad.name, slot, note: body.note, label: body.label }, answer.links ?? undefined);
        setState('saved');
      } else {
        setState('failed');
      }
    } catch {
      setState('failed');
    }
  }

  function toggle(ad: AdRow) {
    const current = links[ad.id]?.slot ?? null;
    if (current) return void save(ad, null);
    const free = SLOTS.find((s) => !taken.has(s)) ?? null;
    if (!free) return;
    void save(ad, free);
  }

  return (
    <section
      data-testid="compare-picker"
      className="bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)] p-5 sm:p-6 mb-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-stone-800">Tick the ads to compare</h2>
        <span className="text-[11px] min-w-[7rem] text-right" data-testid="compare-picker-state" data-state={state}>
          {state === 'saving' && <span className="text-stone-500">saving...</span>}
          {state === 'saved' && <span className="text-gold-700">saved</span>}
          {state === 'failed' && <span className="text-red-600">not saved, try again</span>}
        </span>
      </div>
      <p className="text-[11px] text-stone-500 mb-2">
        Up to {MAX_COMPARED} at once. Each ticked ad gets a letter, A to E, in the order you tick. The verdict and the cards below,
        and the graph on the Dashboard, follow your ticks. Every ad in your Meta account is listed here on its own; nothing to add by hand.
      </p>
      {ticked.length === 0 && ads.length > 0 && (
        <p className="text-[11px] text-stone-700 mb-2" data-testid="nothing-ticked">
          Nothing ticked yet. Until you tick, every page compares the two biggest spenders.
        </p>
      )}
      {ads.length === 0 ? (
        <p className="text-xs text-stone-500 py-2">No ads in the account yet. Make one in Meta Ads Manager and it appears here.</p>
      ) : (
        <ul className="divide-y divide-stone-100" data-testid="compare-list">
          {ads.map((ad) => {
            const slot = links[ad.id]?.slot ?? null;
            const shown = adDisplayName(links[ad.id], ad.name);
            const disabled = state === 'saving' || (!slot && full);
            return (
              <li key={ad.id} data-testid="compare-row" data-ad-id={ad.id} data-slot={slot ?? ''}>
                <label className={`flex items-center gap-3 min-h-[48px] py-2 -mx-2 px-2 rounded-lg transition-colors ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-stone-50'}`}>
                  <input
                    type="checkbox"
                    aria-label={`Compare ${shown}`}
                    checked={Boolean(slot)}
                    disabled={disabled}
                    onChange={() => toggle(ad)}
                    className="w-5 h-5 accent-[#8B6914] shrink-0"
                  />
                  <span className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-md text-[11px] tracking-wider font-bold ${slot ? 'bg-gold-700 text-white' : 'bg-stone-100 text-stone-300'}`} data-testid="compare-letter">
                    {slot ?? ''}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-stone-800 truncate">{shown}</span>
                    {shown !== ad.name && <span className="block text-[11px] text-stone-500 truncate">{ad.name}</span>}
                    <span className="block text-[10px] font-semibold text-gold-700" data-testid="compare-account">
                      {metaAccountLabel(ad.accountId, accountIds)}
                    </span>
                    {ad.websiteTracking === false && (
                      <span className="block text-[10px] font-semibold text-red-700">Website tracking tag missing</span>
                    )}
                  </span>
                  <span className={`text-[10px] tracking-wider uppercase px-2 py-1 rounded-full shrink-0 ${
                    ad.status === 'Running' ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-600'
                  }`}>{ad.status}</span>
                  <span className="text-[11px] text-stone-500 shrink-0 w-28 text-right hidden sm:block">
                    {moneyFromMinor(ad.spendMinor, currency)}, {count(ad.clicks)} clicks
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {full && <p className="text-[11px] text-stone-500 mt-3">Five is the most at once. Untick one to tick another.</p>}
    </section>
  );
}
