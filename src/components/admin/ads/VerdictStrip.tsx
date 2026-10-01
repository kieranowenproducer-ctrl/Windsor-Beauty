'use client';

import Link from 'next/link';
import type { AdRow } from '@/lib/ads/meta';
import type { CampaignTillRow } from '@/lib/ads/store';
import { adDisplayName, type CreativeLink } from '@/lib/ads/labels';
import { compareChosen, pickChosen, verdictAdFrom } from '@/lib/ads/compare';

// "Has one ad beaten the other?" in one plain sentence (ADSLAB item 13),
// shown above the cards so the answer is the first thing after the money.
// The same sentence goes into the signals, the adviser's prompt and the Monday
// email, all from compareChosen() so they can never disagree.

interface Props {
  ads: AdRow[];
  links: Record<string, CreativeLink>;
  till: Map<string, CampaignTillRow>;
  currency: string;
  /** On the Dashboard: one short line pointing at the Compare page when nothing is ticked. */
  hint?: boolean;
}

export default function VerdictStrip({ ads, links, till, currency, hint }: Props) {
  if (ads.length === 0) return null;
  const { chosen, bySlot } = pickChosen(ads, (id) => links[id]?.slot);
  const toVerdict = (ad: AdRow) => verdictAdFrom(ad, adDisplayName(links[ad.id], ad.name), till.get(ad.campaignId)?.orders ?? 0);
  const verdict = compareChosen(chosen.map(toVerdict), currency);
  return (
    <section
      data-testid="verdict"
      data-solid={verdict.solid}
      data-winner={verdict.winnerId ?? ''}
      className={`border-l-4 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)] p-5 sm:p-6 mb-8 ${verdict.winnerId ? 'bg-gold-50 border-l-gold-500 border border-gold-200' : 'bg-white border-l-stone-300 border border-stone-200'}`}
    >
      <h2 className="text-sm font-semibold text-stone-800 mb-1.5">Has one ad beaten the other?</h2>
      <p className="text-sm text-stone-800 leading-relaxed" data-testid="verdict-text">{verdict.text}</p>
      {(bySlot || hint || !verdict.solid) && (
        <p className="text-[11px] text-stone-500 mt-2" data-testid="verdict-note">
          {bySlot
            ? `Comparing the ${chosen.length} ${chosen.length === 1 ? 'ad' : 'ads'} you ticked.`
            : hint
              ? <>Nothing ticked yet, so this compares the two biggest spenders. Tick ads on the <Link href="/admin/ads/compare" className="text-gold-700 hover:underline">Compare</Link> page to choose.</>
              : null}
          {verdict.solid ? '' : ' Marked early until every ad has enough clicks.'}
        </p>
      )}
    </section>
  );
}
