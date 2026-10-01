'use client';

import FunnelCard from '@/components/admin/ads/FunnelCard';
import BreakEvenCard from '@/components/admin/ads/BreakEvenCard';
import LandingCard from '@/components/admin/ads/LandingCard';
import VisitorSwitch from '@/components/admin/ads/VisitorSwitch';
import Waiting from '@/components/admin/ads/Waiting';
import { RANGE_LABELS, useAds } from '@/components/admin/ads/AdsData';

// After the click: what people did on the site, whether it pays for itself,
// and which page each ad sent people to.
//
// The switch at the top decides whose visits these three cards count. It sits
// here rather than in the ads header because it changes nothing on the other
// tabs: money spent, clicks and the A-versus-B verdict are Meta's own figures
// and every sale counts towards them whoever placed it.

export default function AfterTheClickPage() {
  const { ready, data, ads, links, currency, range, pageNames } = useAds();
  if (!ready || !data) return <Waiting />;
  const periodLabel = RANGE_LABELS[range];
  const landing = data.landing ?? { tagged: [], pages: [], scope: 'all' as const, totalLandings: 0, memberLandings: 0 };
  return (
    <div data-testid="page-after-the-click">
      <VisitorSwitch memberLandings={landing.memberLandings} totalLandings={landing.totalLandings} />
      <FunnelCard ads={ads} funnel={data.funnel ?? []} links={links} currency={currency} periodLabel={periodLabel} />
      <BreakEvenCard ads={ads} funnel={data.funnel ?? []} orders={data.orders} links={links} currency={currency} periodLabel={periodLabel} />
      <LandingCard ads={ads} report={landing} links={links} names={pageNames} periodLabel={periodLabel} />
    </div>
  );
}
