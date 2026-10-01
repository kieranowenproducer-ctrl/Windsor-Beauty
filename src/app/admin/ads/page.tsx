'use client';

import FundsCard from '@/components/admin/ads/FundsCard';
import VerdictStrip from '@/components/admin/ads/VerdictStrip';
import HeadlineTiles from '@/components/admin/ads/HeadlineTiles';
import CompareChart from '@/components/admin/ads/CompareChart';
import { useAds } from '@/components/admin/ads/AdsData';

// The Dashboard: the money, the verdict, the big boxes, and the ads on one
// graph. One graph, not two: the day-by-day line moved to Who and when
// (audit item 16, 4 Sept 2026). Everything else has its own page in the bar.

export default function DashboardPage() {
  const { loading, ready, data, daily, currency, accountIds, ads, links, till, refreshKey } = useAds();

  return (
    <div data-testid="page-dashboard">
      {(loading || data?.funds) && (
        <FundsCard funds={data?.funds} daily={daily} ads={ads} currency={currency} loading={loading} />
      )}

      {ready && <VerdictStrip ads={ads} links={links} till={till} currency={currency} hint />}

      <HeadlineTiles />

      {ready && ads.length > 0 && (
        <CompareChart ads={ads} links={links} currency={currency} accountIds={accountIds} refreshKey={refreshKey} />
      )}

      <p className="text-[11px] text-stone-500 mb-8">
        Every figure is read live from Meta for the chosen period, so it matches what Ads Manager holds
        for both tracked ad accounts. A snapshot is saved every morning, a report is emailed every Monday, and
        problems (a rejected ad, a spend spike, a dead connection) are emailed the day they are found.
      </p>
    </div>
  );
}
