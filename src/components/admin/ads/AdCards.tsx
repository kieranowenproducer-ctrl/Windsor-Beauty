'use client';

import { useState } from 'react';
import type { AdRow } from '@/lib/ads/meta';
import type { CampaignTillRow } from '@/lib/ads/store';
import { adDisplayName, type CreativeLink } from '@/lib/ads/labels';
import {
  MEASURES, MIN_CLICKS_TO_COMPARE, MIN_VIEWS_TO_COMPARE, enoughToCompare, formatMeasure, pickChosen, winnerOf,
} from '@/lib/ads/compare';
import AdLabelEditor from './AdLabelEditor';
import { formatDate, metaAccountLabel } from './shared';

// One card per ad, built for several side by side (ADSLAB item 2). Spend,
// cost per click, click rate and comments lead each card; the other ten
// figures fold behind "More figures" so a card is short (audit item 10). The
// winner on each measure gets a small gold mark only when every compared ad
// has a believable sample (see src/lib/ads/compare.ts).

interface Props {
  ads: AdRow[];
  links: Record<string, CreativeLink>;
  /** Our own till, by campaign id. */
  till: Map<string, CampaignTillRow>;
  currency: string;
  accountIds: string[];
  onLabelSaved: (adId: string, link: CreativeLink, all?: Record<string, CreativeLink>) => void;
  onHiddenSaved?: (adId: string, adName: string, hidden: boolean) => Promise<string | null>;
  onOpen: (adId: string) => void;
  /** 'chosen' shows only the ads ticked for comparison (the Compare page); 'all' shows every ad. */
  show?: 'all' | 'chosen';
}

const STATUS_CLASSES: Record<string, string> = {
  Running: 'bg-green-50 text-green-700',
  Finished: 'bg-stone-100 text-stone-600',
  Paused: 'bg-yellow-50 text-yellow-700',
  'Rejected by Meta': 'bg-red-50 text-red-700',
  'Flagged by Meta': 'bg-red-50 text-red-700',
};

const LINK_BUTTON = 'text-[10px] tracking-[0.14em] uppercase px-3 py-2 rounded-md border transition-colors';

function AdCardView({ ad, link, till, currency, accountIds, quiet, isCompared, shared, winners, onLabelSaved, onHiddenSaved, onOpen }: {
  ad: AdRow;
  link: CreativeLink | undefined;
  till: CampaignTillRow | undefined;
  currency: string;
  accountIds: string[];
  quiet: boolean;
  isCompared: boolean;
  shared: boolean;
  winners: Map<string, string | null>;
  onLabelSaved: Props['onLabelSaved'];
  onHiddenSaved?: Props['onHiddenSaved'];
  onOpen: Props['onOpen'];
}) {
  const [more, setMore] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');
  const shown = adDisplayName(link, ad.name);
  const lead = MEASURES.filter((m) => m.lead);
  const others = MEASURES.filter((m) => !m.lead);
  const mark = (key: string) => isCompared && winners.get(key) === ad.id;
  const aheadHidden = others.filter((m) => mark(m.key)).length;
  const rankings = [
    ad.rankings.quality && `quality ${ad.rankings.quality.toLowerCase()}`,
    ad.rankings.engagement && `engagement ${ad.rankings.engagement.toLowerCase()}`,
    ad.rankings.conversion && `conversions ${ad.rankings.conversion.toLowerCase()}`,
  ].filter(Boolean) as string[];

  return (
    <article
      data-testid="ad-card"
      data-ad-id={ad.id}
      data-running={ad.running}
      className={`bg-white border rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)] p-5 sm:p-6 flex flex-col gap-4 ${quiet ? 'border-stone-200 opacity-80' : 'border-stone-200'}`}
    >
      <header className="flex items-start gap-3">
        {ad.thumbnailUrl ? (
          // Meta's own short-lived CDN thumbnail of the creative; next/image
          // cannot be told the hostname in advance because it varies by region.
          // eslint-disable-next-line @next/next/no-img-element -- Meta CDN hostnames vary by region, so next/image cannot allow-list them safely.
          <img src={ad.thumbnailUrl} alt="" width={48} height={48} className="w-12 h-12 object-cover bg-stone-100 rounded-lg shrink-0" />
        ) : (
          <div className="w-12 h-12 bg-stone-100 rounded-lg shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-stone-800 leading-snug" data-testid="ad-card-name">{shown}</h3>
            <span className={`text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full ${STATUS_CLASSES[ad.status] ?? 'bg-stone-50 text-stone-500'}`} data-testid="ad-card-status">
              {ad.status}
            </span>
            {link?.slot && isCompared && (
              <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full bg-gold-50 text-gold-700">Ad {link.slot}</span>
            )}
          </div>
          {shown !== ad.name && (
            <div className="text-[11px] text-stone-500 truncate" title="The name Meta gave this ad" data-testid="ad-card-meta-name">{ad.name}</div>
          )}
          <div className="text-[10px] font-semibold text-gold-700 mt-1" data-testid="ad-card-account">
            {metaAccountLabel(ad.accountId, accountIds)}
          </div>
          {ad.websiteTracking === false && (
            <div className="text-[10px] font-semibold text-red-700 mt-1" data-testid="ad-card-tracking-warning">
              Website tracking tag missing
            </div>
          )}
          <div className="text-[11px] text-stone-500 mt-0.5" data-testid="ad-card-schedule">
            {ad.campaignName}
            {ad.startsOn && ad.endsOn
              ? `, ${ad.status === 'Finished' ? 'ran' : 'runs'} ${formatDate(ad.startsOn)} to ${formatDate(ad.endsOn)}`
              : ad.startsOn ? `, since ${formatDate(ad.startsOn)}` : ad.createdOn ? `, made ${formatDate(ad.createdOn)}` : ''}
            {ad.budget ? `, ${ad.budget}` : ''}
          </div>
        </div>
      </header>

      {(ad.targeting || ad.callToAction) && (
        <p className="text-[11px] text-stone-600 leading-relaxed" data-testid="ad-card-targeting">
          {ad.callToAction ? `Button: ${ad.callToAction}. ` : ''}{ad.targeting ?? ''}
        </p>
      )}

      {ad.websiteTracking === false && (
        <p className="text-[11px] text-red-700 leading-relaxed">
          Meta results are still counted. Website visits and orders cannot be tied to this advert until its URL parameters include the campaign tracking line.
        </p>
      )}

      <AdLabelEditor adId={ad.id} adName={ad.name} initial={link} layout="card" onSaved={(l, all) => onLabelSaved(ad.id, l, all)} />

      <div className="grid grid-cols-2 gap-3">
        {lead.map((m) => {
          const v = m.value(ad, till);
          const ahead = mark(m.key);
          return (
            <div key={m.key} className={`p-3 border rounded-xl ${ahead ? 'border-gold-400 bg-gold-50/50' : 'border-stone-100 bg-stone-50/60'}`} data-measure={m.key} data-ahead={ahead}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] tracking-[0.14em] uppercase text-stone-500">{m.label}</span>
                {ahead && <span className="text-[10px] tracking-[0.14em] uppercase text-gold-700" data-testid="ahead">&#9679; ahead</span>}
              </div>
              <div className="text-xl font-semibold text-stone-800 mt-1">{formatMeasure(m, v, currency)}</div>
              <div className="text-[11px] text-stone-500">{m.hint}</div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setMore((o) => !o)}
        aria-expanded={more}
        data-testid="more-figures"
        className={`${LINK_BUTTON} self-start border-stone-200 text-stone-600 hover:border-gold-300 hover:text-gold-700`}
      >
        {more ? 'Fewer figures' : `More figures${aheadHidden > 0 ? ` (ahead on ${aheadHidden} more)` : ''}`}
      </button>

      {more && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5" data-testid="more-figures-list">
          {others.map((m) => {
            const v = m.value(ad, till);
            const ahead = mark(m.key);
            return (
              <div key={m.key} className="flex items-baseline justify-between gap-2 border-b border-stone-50 pb-1" data-measure={m.key} data-ahead={ahead}>
                <dt className="text-[11px] text-stone-600 truncate" title={m.hint}>
                  {m.label}{m.source === 'ours' ? <span className="text-stone-400"> (ours)</span> : null}
                </dt>
                <dd className={`text-[11px] font-semibold shrink-0 ${ahead ? 'text-gold-700' : 'text-stone-700'}`}>
                  {ahead && <span aria-label="ahead" className="mr-1" data-testid="ahead">&#9679;</span>}
                  {formatMeasure(m, v, currency)}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {more && shared && (
        <p className="text-[11px] text-stone-500">
          Orders and sales are counted by campaign tag, and this campaign holds more than one ad, so those two figures are shared between them.
        </p>
      )}

      {more && (
        <p className="text-[11px] text-stone-500" data-testid="ad-card-rankings">
          {rankings.length > 0
            ? `Meta ranks this ad against similar ones: ${rankings.join(', ')}.`
            : 'Meta has not ranked this ad against similar ones yet. It does that once an ad has had enough views.'}
        </p>
      )}

      <footer className="flex flex-wrap items-center gap-2 mt-auto pt-1">
        <button onClick={() => onOpen(ad.id)} className={`${LINK_BUTTON} border-gold-500 text-gold-700 hover:bg-gold-700 hover:text-white`}>
          Open in Ads Manager &#8599;
        </button>
        {ad.instagramUrl && (
          <a href={ad.instagramUrl} target="_blank" rel="noopener noreferrer" className={`${LINK_BUTTON} border-stone-200 text-stone-600 hover:border-gold-300 hover:text-gold-700`}>
            See the post &#8599;
          </a>
        )}
        {onHiddenSaved && (
          <button
            type="button"
            disabled={moving}
            onClick={async () => {
              setMoving(true);
              setMoveError('');
              const error = await onHiddenSaved(ad.id, ad.name, !link?.hidden);
              if (error) setMoveError(error);
              setMoving(false);
            }}
            className={`${LINK_BUTTON} border-stone-200 text-stone-600 hover:border-stone-400 hover:text-stone-800 disabled:opacity-50`}
          >
            {moving ? 'Moving…' : link?.hidden ? 'Restore to panel' : 'Hide from panel'}
          </button>
        )}
      </footer>
      {moveError && <p role="alert" className="text-[11px] text-red-700">{moveError}</p>}
    </article>
  );
}

export default function AdCards({ ads, links, till, currency, accountIds, onLabelSaved, onHiddenSaved, onOpen, show = 'all' }: Props) {
  const running = ads.filter((a) => a.running && !links[a.id]?.hidden);
  const past = ads.filter((a) => !a.running && !links[a.id]?.hidden);
  const hidden = ads.filter((a) => links[a.id]?.hidden);
  const tillFor = (ad: AdRow) => till.get(ad.campaignId);

  // The ads being judged against each other: the ticked ones, otherwise
  // everything that is running.
  const slotted = ads.filter((a) => links[a.id]?.slot && !links[a.id]?.hidden);
  const chosenPick = show === 'chosen' ? pickChosen(ads, (id) => links[id]?.slot) : null;
  const chosenAds = chosenPick ? chosenPick.chosen : null;
  const compared = chosenAds ?? (slotted.length >= 2 ? slotted : running);
  const fair = enoughToCompare(compared);
  const winners = new Map<string, string | null>();
  if (fair) for (const m of MEASURES) winners.set(m.key, winnerOf(m, compared, tillFor));

  const adsPerCampaign = new Map<string, number>();
  for (const a of ads) adsPerCampaign.set(a.campaignId, (adsPerCampaign.get(a.campaignId) ?? 0) + 1);

  let compareNote: string;
  if (compared.length < 2) {
    compareNote = chosenAds
      ? 'Tick a second ad in the list above to compare.'
      : running.length === 1
        ? 'One ad is running. Winners are marked once two ads run side by side.'
        : 'Nothing is running right now.';
  } else if (!fair) {
    compareNote = `No winner is marked yet: each ad needs at least ${MIN_CLICKS_TO_COMPARE} clicks and ${MIN_VIEWS_TO_COMPARE} views before a comparison is believable.`;
  } else {
    compareNote = 'A gold mark shows which ad is ahead on that measure. Cheapest wins on costs, highest on everything else. Too close to call goes unmarked.';
  }

  const card = (ad: AdRow, quiet: boolean) => (
    <AdCardView
      key={ad.id}
      ad={ad}
      link={links[ad.id]}
      till={tillFor(ad)}
      currency={currency}
      accountIds={accountIds}
      quiet={quiet}
      isCompared={compared.some((c) => c.id === ad.id)}
      shared={(adsPerCampaign.get(ad.campaignId) ?? 1) > 1}
      winners={winners}
      onLabelSaved={onLabelSaved}
      onHiddenSaved={onHiddenSaved}
      onOpen={onOpen}
    />
  );

  return (
    <section data-testid="ad-cards" className="mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-stone-800">{chosenAds ? 'The ads you are comparing' : 'Current live ads'}</h2>
        <div className="text-[11px] text-stone-500">Figures for the chosen period. Orders and sales come from our own records.</div>
      </div>
      <p className="text-[11px] text-stone-600 mb-3" data-testid="compare-note">{compareNote}</p>
      {ads.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <p className="text-xs text-stone-500">No ads in this ad account yet.</p>
        </div>
      ) : chosenAds ? (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${chosenAds.length > 2 ? 'xl:grid-cols-3' : ''}`} data-testid="chosen-cards">
          {chosenAds.map((a) => card(a, false))}
        </div>
      ) : (
        <>
          {running.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="running-cards">
              {running.map((a) => card(a, false))}
            </div>
          )}
          {(past.length > 0 || hidden.length > 0) && (
            <details className="mt-6 rounded-2xl border border-stone-200 bg-white" data-testid="past-ads">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-xs font-semibold text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">
                <span>Past and hidden ads</span>
                <span className="font-normal text-stone-500">{past.length + hidden.length}</span>
              </summary>
              <div className="border-t border-stone-100 p-4 sm:p-5">
                <p className="mb-4 text-[11px] text-stone-500">These stay in Meta and keep their history. Restore a hidden advert whenever you need it.</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="quiet-cards">
                  {[...past, ...hidden].map((a) => card(a, true))}
                </div>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
