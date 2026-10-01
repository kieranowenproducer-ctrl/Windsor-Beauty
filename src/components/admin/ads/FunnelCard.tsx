'use client';

import type { AdRow } from '@/lib/ads/meta';
import type { FunnelRow } from '@/lib/ads/store';
import { adDisplayName, type CreativeLink } from '@/lib/ads/labels';
import { count, moneyFromMinor } from './shared';

// What happened after the click (ADSLAB item 7): the one that answers "243
// clicks and no orders, why?". Two rows of steps for each campaign tag. The
// first row is Meta's count (clicks, link clicks, people who landed by Meta's
// reckoning). The second is our own records: addresses that arrived on a
// tagged link, then how many of them opened a product page, the basket, the
// checkout, and ordered. The two rows never match exactly and the card says
// why, so nobody chases a difference that is just two ways of counting.

interface Props {
  ads: AdRow[];
  funnel: FunnelRow[];
  links: Record<string, CreativeLink>;
  currency: string;
  periodLabel: string;
}

interface Step { label: string; value: number; hint?: string }

function StepRow({ title, source, steps, tone }: { title: string; source: string; steps: Step[]; tone: 'meta' | 'ours' }) {
  const first = steps[0]?.value ?? 0;
  return (
    <div data-testid={`funnel-${tone}`}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-[10px] tracking-[0.18em] uppercase text-stone-500">{title}</span>
        <span className={`text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full ${tone === 'meta' ? 'bg-stone-100 text-stone-700' : 'bg-gold-50 text-gold-700'}`}>{source}</span>
      </div>
      <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const share = first > 0 ? s.value / first : 0;
          const prev = i > 0 ? steps[i - 1].value : null;
          const drop = prev && prev > 0 ? Math.round((1 - s.value / prev) * 100) : null;
          return (
            <li key={s.label} className="min-w-0" data-step={s.label} data-value={s.value}>
              <div className="h-1.5 bg-stone-100 mb-1.5">
                <div className={`h-full ${tone === 'meta' ? 'bg-stone-400' : 'bg-gold-700'}`} style={{ width: `${Math.max(s.value > 0 ? 3 : 0, share * 100)}%` }} />
              </div>
              <div className="text-base font-semibold text-stone-800 leading-none">{count(s.value)}</div>
              <div className="text-[10px] text-stone-500 leading-tight mt-1">{s.label}</div>
              {s.hint && <div className="text-[10px] text-stone-500 leading-tight">{s.hint}</div>}
              {drop !== null && drop > 0 && s.value < (prev ?? 0) && (
                <div className="text-[10px] text-stone-500 mt-0.5">{drop}% fewer</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function FunnelCard({ ads, funnel, links, currency, periodLabel }: Props) {
  // One block per campaign tag that has either Meta clicks or tagged arrivals.
  const byCampaign = new Map<string, { names: string[]; clicks: number; linkClicks: number; landed: number }>();
  for (const a of ads) {
    const cur = byCampaign.get(a.campaignId) ?? { names: [], clicks: 0, linkClicks: 0, landed: 0 };
    cur.names.push(adDisplayName(links[a.id], a.name));
    cur.clicks += a.clicks;
    cur.linkClicks += a.linkClicks;
    cur.landed += a.landingPageViews;
    byCampaign.set(a.campaignId, cur);
  }
  const ours = new Map(funnel.map((f) => [f.utm_campaign, f]));
  const ids = Array.from(new Set([...Array.from(byCampaign.keys()), ...funnel.map((f) => f.utm_campaign)]))
    .filter((id) => (byCampaign.get(id)?.clicks ?? 0) > 0 || (ours.get(id)?.people ?? 0) > 0)
    .sort((x, y) => ((byCampaign.get(y)?.clicks ?? 0) + (ours.get(y)?.people ?? 0)) - ((byCampaign.get(x)?.clicks ?? 0) + (ours.get(x)?.people ?? 0)));

  return (
    <section data-testid="funnel" className="bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)] p-6 sm:p-7 mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-stone-800">What happened after the click</h2>
        <div className="text-[11px] text-stone-500">{periodLabel}</div>
      </div>
      <p className="text-[11px] text-stone-500 mb-5">
        Meta counts clicks on the ad. Our own records count the households that actually arrived on a tagged link and what they did in the week after.
        The two never match exactly: some clicks never load the page, in-app browsers block our visit note, and one household counts once however many people live in it.
      </p>

      {ids.length === 0 ? (
        <p className="text-xs text-stone-500 py-2" data-testid="funnel-empty">
          Nothing to trace yet. Once an ad with the link tags set brings people in, each step fills in here.
        </p>
      ) : ids.map((id) => {
        const meta = byCampaign.get(id);
        const f = ours.get(id);
        const title = meta?.names.length ? meta.names.join(' + ') : `Link tag ${id}`;
        return (
          <div key={id} className="border-t border-stone-100 pt-4 mt-4 first:border-t-0 first:pt-0 first:mt-0" data-testid="funnel-block" data-campaign={id}>
            <h3 className="text-xs font-semibold text-stone-800 mb-3">{title}</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {meta ? (
                <StepRow title="On Meta" source="from Meta" tone="meta" steps={[
                  { label: 'Clicks on the ad', value: meta.clicks },
                  { label: 'Clicks that left for the site', value: meta.linkClicks },
                  { label: "Landed, by Meta's count", value: meta.landed },
                ]} />
              ) : (
                <p className="text-[11px] text-stone-500">This tag is not one of the ads in this ad account, so Meta has no figures for it here.</p>
              )}
              {f ? (
                <StepRow title="On our site" source="from our own records" tone="ours" steps={[
                  { label: 'Arrived', value: f.people, hint: `${count(f.landed)} tagged landings` },
                  { label: 'Opened a product page', value: f.product_people },
                  { label: 'Opened the basket', value: f.basket_people },
                  { label: 'Started checkout', value: f.checkout_people },
                  { label: 'Ordered', value: f.orders, hint: f.orders > 0 ? moneyFromMinor(f.revenue_minor, currency) : undefined },
                ]} />
              ) : (
                <p className="text-[11px] text-stone-500" data-testid="funnel-no-tags">
                  No tagged arrivals in our records for this campaign. The link tags in the box below have to be set on the campaign for this side to fill in.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
