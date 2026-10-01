'use client';

import type { VisitorScope } from '@/lib/ads/store';
import { useAds } from './AdsData';
import { count } from './shared';

// Whose visits the after-the-click figures count (ADSLAB item 15, asked for by
// Kieran on 5 Sept 2026).
//
// His reasoning, and it holds: almost nobody finds windsorglow.com by accident,
// so a stranger arriving is far more likely to have come from an ad than a
// member is, and existing members browsing the shop drown a small number of ad
// arrivals in noise.
//
// The one thing this switch is careful about is WHEN somebody counted as a
// member. It leaves out people who already had an account at the moment they
// arrived. It does not leave out somebody who arrived a stranger and signed up
// afterwards, because that person is the ad working, and dropping them would
// delete the only result worth paying for.

const OPTIONS: { value: VisitorScope; label: string; blurb: string }[] = [
  {
    value: 'new',
    label: 'People who were not members',
    blurb: 'Leaves out anybody who already had an account when they arrived. Somebody who signed up after arriving still counts.',
  },
  {
    value: 'all',
    label: 'Everybody',
    blurb: 'Counts every visit, existing members and returning customers included.',
  },
];

export default function VisitorSwitch({ memberLandings, totalLandings }: { memberLandings: number; totalLandings: number }) {
  const { visitors, setVisitors, loading } = useAds();
  const chosen = OPTIONS.find((o) => o.value === visitors) ?? OPTIONS[0];

  return (
    <section
      data-testid="visitor-switch"
      data-scope={visitors}
      className="bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)] p-5 sm:p-6 mb-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-stone-800">Who these three cards count</h2>
          <p className="text-[11px] text-stone-500 mt-1 max-w-xl">{chosen.blurb}</p>
        </div>
        <div className="flex rounded-lg border border-stone-200 overflow-hidden shrink-0" role="group" aria-label="Who these figures count">
          {OPTIONS.map((o) => {
            const active = o.value === visitors;
            return (
              <button
                key={o.value}
                type="button"
                data-testid={`visitor-${o.value}`}
                aria-pressed={active}
                disabled={loading}
                onClick={() => setVisitors(o.value)}
                className={`text-[10px] tracking-[0.14em] uppercase px-4 py-2.5 transition-colors disabled:opacity-60 ${
                  active ? 'bg-gold-700 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-stone-500 mt-3" data-testid="visitor-switch-note">
        {totalLandings > 0
          ? `${count(memberLandings)} of ${count(totalLandings)} arrivals in this period were people who already had an account.`
          : 'No arrivals recorded in this period yet.'}
        {' '}We have known who was signed in on arrival since 5 September 2026. Before that date, an arrival is only counted as a member
        if somebody at the same internet address had signed in or registered earlier, so the older figures leave out fewer members than the newer ones.
      </p>
    </section>
  );
}
