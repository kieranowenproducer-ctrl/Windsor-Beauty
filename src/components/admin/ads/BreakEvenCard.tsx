'use client';

import type { AdRow } from '@/lib/ads/meta';
import type { FunnelRow, OrderStats } from '@/lib/ads/store';
import { adDisplayName, type CreativeLink } from '@/lib/ads/labels';
import { count, moneyFromMinor } from './shared';

// Cost per visitor and break-even (ADSLAB item 8). Spend from Meta over the
// addresses that actually arrived from our own records gives the price of a
// visitor; the real average order from the orders table says how many orders
// per pound the ads need to pay for themselves, and how far off that is. When
// there are too few orders to average, the card says so instead of guessing.
// "Break even" here is before product costs, because the margin is not known
// to this page, and the card says that too.

interface Props {
  ads: AdRow[];
  funnel: FunnelRow[];
  orders: OrderStats | null | undefined;
  links: Record<string, CreativeLink>;
  currency: string;
  periodLabel: string;
}

export interface BreakEven {
  spendMinor: number;
  arrivals: number;
  costPerVisitorMinor: number | null;
  ordersGot: number;
  ordersNeeded: number | null;
  visitorsPerOrderNeeded: number | null;
}

export function breakEvenFor(spendMinor: number, arrivals: number, ordersGot: number, averageMinor: number | null): BreakEven {
  const costPerVisitorMinor = arrivals > 0 ? spendMinor / arrivals : null;
  const ordersNeeded = averageMinor && averageMinor > 0 ? spendMinor / averageMinor : null;
  const visitorsPerOrderNeeded = costPerVisitorMinor && averageMinor && costPerVisitorMinor > 0 ? averageMinor / costPerVisitorMinor : null;
  return { spendMinor, arrivals, costPerVisitorMinor, ordersGot, ordersNeeded, visitorsPerOrderNeeded };
}

function oneDecimal(n: number): string {
  return n < 10 ? n.toFixed(1) : count(Math.round(n));
}

export default function BreakEvenCard({ ads, funnel, orders, links, currency, periodLabel }: Props) {
  const byCampaign = new Map(funnel.map((f) => [f.utm_campaign, f]));
  const spend = ads.reduce((t, a) => t + a.spendMinor, 0);
  const tracked = new Set(ads.map((a) => a.campaignId));
  const arrivals = funnel.filter((f) => tracked.has(f.utm_campaign)).reduce((t, f) => t + f.people, 0);
  const got = funnel.filter((f) => tracked.has(f.utm_campaign)).reduce((t, f) => t + f.orders, 0);
  const avg = orders?.averageMinor ?? null;
  const be = breakEvenFor(spend, arrivals, got, avg);

  const perAd = ads
    .filter((a) => a.spendMinor > 0)
    .map((a) => {
      const f = byCampaign.get(a.campaignId);
      return { ad: a, name: adDisplayName(links[a.id], a.name), be: breakEvenFor(a.spendMinor, f?.people ?? 0, f?.orders ?? 0, avg) };
    });

  return (
    <section data-testid="break-even" className="bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)] p-6 sm:p-7 mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-stone-800">Is it paying for itself?</h2>
        <div className="text-[11px] text-stone-500">{periodLabel}</div>
      </div>
      <p className="text-[11px] text-stone-500 mb-5">
        Spend is Meta&apos;s figure. Visitors and orders are from our own records, counted by household. Break-even is before product costs.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="p-4 bg-stone-50/60 border border-stone-100 rounded-xl" data-testid="cost-per-visitor">
          <div className="text-[10px] tracking-[0.14em] uppercase text-stone-500">Cost per visitor</div>
          <div className="text-2xl font-semibold text-stone-800 mt-1">
            {be.costPerVisitorMinor === null ? 'n/a' : moneyFromMinor(Math.round(be.costPerVisitorMinor), currency)}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            {be.arrivals > 0
              ? `${moneyFromMinor(spend, currency)} brought ${count(be.arrivals)} ${be.arrivals === 1 ? 'household' : 'households'} to the site`
              : spend > 0
                ? 'No tagged arrivals in our records for this period, so it cannot be worked out. The link tags below need setting on the campaign.'
                : 'Nothing spent in this period.'}
          </div>
        </div>

        <div className="p-4 bg-stone-50/60 border border-stone-100 rounded-xl" data-testid="average-order">
          <div className="text-[10px] tracking-[0.14em] uppercase text-stone-500">Average order</div>
          <div className="text-2xl font-semibold text-stone-800 mt-1">
            {avg === null ? 'Not enough orders' : moneyFromMinor(avg, currency)}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            {orders
              ? avg === null
                ? `${count(orders.count)} paid ${orders.count === 1 ? 'order' : 'orders'} in the last ${orders.days} days; at least 5 are needed to average.`
                : `across ${count(orders.count)} paid orders in the last ${orders.days} days`
              : 'Order records unavailable.'}
          </div>
        </div>

        <div className={`p-4 border rounded-xl ${be.ordersNeeded !== null && be.ordersGot >= be.ordersNeeded && be.spendMinor > 0 ? 'bg-gold-50/60 border-gold-200' : 'bg-stone-50/60 border-stone-100'}`} data-testid="break-even-line">
          <div className="text-[10px] tracking-[0.14em] uppercase text-stone-500">Break-even</div>
          <div className="text-2xl font-semibold text-stone-800 mt-1">
            {be.ordersNeeded === null ? 'n/a' : `${oneDecimal(be.ordersNeeded)} ${be.ordersNeeded === 1 ? 'order' : 'orders'}`}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            {be.ordersNeeded === null
              ? 'Needs an average order to work out.'
              : `needed to cover ${moneyFromMinor(spend, currency)} of ads; ${count(be.ordersGot)} ${be.ordersGot === 1 ? 'has' : 'have'} come in`}
          </div>
        </div>
      </div>

      <p className="text-xs text-stone-700 leading-relaxed" data-testid="break-even-sentence">
        {avg === null
          ? 'Once there are at least 5 paid orders to average, this says how many orders the ads need to pay for themselves.'
          : be.arrivals === 0
            ? `At an average order of ${moneyFromMinor(avg, currency)}, the ads pay for themselves at one order for every ${moneyFromMinor(avg, currency)} spent. Without tagged arrivals there is no cost per visitor yet.`
            : `At an average order of ${moneyFromMinor(avg, currency)}, the ads pay for themselves at one order for every ${moneyFromMinor(avg, currency)} spent, `
              + `which at ${moneyFromMinor(Math.round(be.costPerVisitorMinor ?? 0), currency)} a visitor means about one in every ${count(Math.round(be.visitorsPerOrderNeeded ?? 0))} visitors ordering. `
              + (be.ordersGot === 0
                ? `So far ${count(be.arrivals)} have arrived and none has ordered. ${be.ordersNeeded !== null && be.ordersNeeded < 1 ? 'One order would put this ahead.' : ''}`
                : `So far ${count(be.arrivals)} have arrived and ${count(be.ordersGot)} ${be.ordersGot === 1 ? 'has' : 'have'} ordered, `
                  + (be.ordersNeeded !== null && be.ordersGot >= be.ordersNeeded ? 'which is ahead of break-even.' : `against the ${oneDecimal(be.ordersNeeded ?? 0)} needed.`))}
      </p>

      {perAd.length > 1 && (
        <table className="w-full mt-4" data-testid="break-even-per-ad">
          <thead>
            <tr className="border-b border-stone-100">
              {['Ad', 'Spent', 'Arrived (ours)', 'Cost per visitor', 'Orders needed', 'Orders (ours)'].map((h) => (
                <th key={h} className="text-left text-[10px] tracking-[0.18em] uppercase text-stone-500 py-2 pr-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {perAd.map(({ ad, name, be: b }) => (
              <tr key={ad.id} className="border-b border-stone-50">
                <td className="py-2 pr-3 text-xs text-stone-700">{name}</td>
                <td className="py-2 pr-3 text-xs text-stone-500">{moneyFromMinor(ad.spendMinor, currency)}</td>
                <td className="py-2 pr-3 text-xs text-stone-500">{b.arrivals > 0 ? count(b.arrivals) : 'no tags'}</td>
                <td className="py-2 pr-3 text-xs text-stone-500">{b.costPerVisitorMinor === null ? 'n/a' : moneyFromMinor(Math.round(b.costPerVisitorMinor), currency)}</td>
                <td className="py-2 pr-3 text-xs text-stone-500">{b.ordersNeeded === null ? 'n/a' : oneDecimal(b.ordersNeeded)}</td>
                <td className="py-2 pr-3 text-xs text-stone-500">{count(b.ordersGot)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
