'use client';

import type { AdRow } from '@/lib/ads/meta';
import type { LandingReport } from '@/lib/ads/store';
import { adDisplayName, type CreativeLink } from '@/lib/ads/labels';
import { describePage } from '@/lib/ads/pageNames';
import { count } from './shared';

// Which page each ad sent people to, and whether that page is any good
// (ADSLAB item 9). Meta does not expose the link behind a boosted Instagram
// post, only what the button says, so the landing page comes from our own
// records of tagged arrivals, joined to how that page performs for everyone.
//
// Rewritten 5 Sept 2026 on Kieran's instruction: the table used to print raw
// web addresses ("/account/verify-email"), which is not something you can read
// at a glance when you are deciding where to spend money. Every row now leads
// with the name a person would use for the page, keeps the address underneath
// in small type so a row stays traceable, and says in words what each column
// counts, because "went on to a product" means opened a product page, not
// bought one, and nothing on screen used to say so.

interface Props {
  ads: AdRow[];
  report: LandingReport;
  links: Record<string, CreativeLink>;
  names: Record<string, string>;
  periodLabel: string;
}

const COLUMNS: { key: string; head: string; hint: string }[] = [
  { key: 'page', head: 'Page they arrived on', hint: 'the first page of their visit' },
  { key: 'landings', head: 'Arrivals', hint: 'times this was the first page' },
  { key: 'people', head: 'Households', hint: 'different addresses behind them' },
  { key: 'product', head: 'Then opened a product', hint: 'looked, did not necessarily buy' },
  { key: 'order', head: 'Ordered within a week', hint: 'a real order was placed' },
];

export default function LandingCard({ ads, report, links, names, periodLabel }: Props) {
  const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : 'n/a');
  const name = (path: string) => describePage(path, names);
  const filtered = report.scope === 'new';

  return (
    <section data-testid="landing" className="bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)] p-6 sm:p-7 mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-stone-800">Which page each ad sent people to</h2>
        <div className="text-[11px] text-stone-500">{periodLabel}</div>
      </div>
      <p className="text-[11px] text-stone-500 mb-5">
        Meta only tells us what the button says. Where people actually landed comes from our own records, and only for ads whose link carries the tags.
        The second table shows how each landing page does for everyone who arrives on it, from any source, so a weak page shows as weak.
      </p>

      <div className="space-y-3 mb-6">
        {ads.filter((a) => a.spendMinor > 0 || a.running).map((a) => {
          const tagged = report.tagged.filter((t) => t.utm_campaign === a.campaignId);
          const toInstagram = /instagram profile/i.test(a.callToAction ?? '');
          return (
            <div key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs" data-testid="landing-ad" data-ad-id={a.id}>
              <span className="font-semibold text-stone-800">{adDisplayName(links[a.id], a.name)}</span>
              {a.callToAction && <span className="text-stone-500">button says &quot;{a.callToAction}&quot;</span>}
              {toInstagram ? (
                <span className="text-stone-500" data-testid="landing-instagram">sends people to the Instagram profile, not the site</span>
              ) : tagged.length > 0 ? (
                <span className="text-stone-600" data-testid="landing-paths">
                  landed on {tagged.map((t, i) => (
                    <span key={t.path}>
                      {i > 0 ? ', ' : ''}<span className="font-semibold">{name(t.path).title}</span> ({count(t.people)} {t.people === 1 ? 'household' : 'households'})
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-stone-500" data-testid="landing-unknown">
                  no tags on this ad&apos;s link, so where its {count(a.linkClicks)} link clicks landed is not in our records
                  {a.landingPageViews > 0 ? ` (Meta counted ${count(a.landingPageViews)} landings)` : ''}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <h3 className="text-xs font-semibold text-stone-800 mb-1">How each landing page does, for everyone</h3>
      <p className="text-[11px] text-stone-500 mb-3" data-testid="landing-legend">
        One row for each page somebody arrived on first. <span className="text-stone-600 font-medium">Then opened a product</span> means they went on to look
        at a product page within a week of arriving, which is interest, not a sale.{' '}
        <span className="text-stone-600 font-medium">Ordered within a week</span> is a real order.
      </p>

      {report.pages.length === 0 ? (
        <p className="text-xs text-stone-500 py-2">No arrivals recorded in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="landing-pages">
            <thead>
              <tr className="border-b border-stone-100">
                {COLUMNS.map((c) => (
                  <th key={c.key} className="text-left py-2 pr-3 align-bottom">
                    <span className="block text-[10px] tracking-[0.18em] uppercase text-stone-500">{c.head}</span>
                    <span className="block text-[10px] font-normal normal-case tracking-normal text-stone-500 mt-0.5">{c.hint}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.pages.map((p) => {
                const usedByAd = report.tagged.some((t) => t.path === p.path && ads.some((a) => a.campaignId === t.utm_campaign));
                const page = name(p.path);
                return (
                  <tr key={p.path} className={`border-b border-stone-50 ${usedByAd ? 'bg-gold-50/40' : ''}`} data-path={p.path}>
                    <td className="py-2 pr-3">
                      <span className="block text-xs text-stone-700">
                        {page.title}
                        {usedByAd && <span className="ml-2 text-[10px] tracking-wider uppercase text-gold-700">an ad lands here</span>}
                      </span>
                      <span className="block text-[10px] text-stone-500 mt-0.5">{page.address}</span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-stone-500 align-top">{count(p.landings)}</td>
                    <td className="py-2 pr-3 text-xs text-stone-500 align-top">{count(p.people)}</td>
                    <td className="py-2 pr-3 text-xs text-stone-500 align-top">{count(p.product_people)} <span className="text-stone-500">({pct(p.product_people, p.people)})</span></td>
                    <td className="py-2 pr-3 text-xs text-stone-500 align-top">{count(p.order_people)} <span className="text-stone-500">({pct(p.order_people, p.people)})</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-stone-500 mt-3" data-testid="landing-footnote">
        A household is an internet address, not a person, so two people in one house count once.
        {filtered
          ? ` People who already had an account when they arrived are left out: ${count(report.memberLandings)} of ${count(report.totalLandings)} arrivals in this period.`
          : ` Everybody is counted here, existing members included: ${count(report.memberLandings)} of ${count(report.totalLandings)} arrivals already had an account.`}
      </p>
    </section>
  );
}
