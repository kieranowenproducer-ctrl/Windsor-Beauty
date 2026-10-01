'use client';

import NewAdBox from '@/components/admin/ads/NewAdBox';
import ComparePicker from '@/components/admin/ads/ComparePicker';
import VerdictStrip from '@/components/admin/ads/VerdictStrip';
import AdCards from '@/components/admin/ads/AdCards';
import Waiting from '@/components/admin/ads/Waiting';
import { useAds } from '@/components/admin/ads/AdsData';

// Compare: make a new ad (in Meta), tick the ads to compare, read the
// verdict, then see the ticked ads side by side.

export default function ComparePage() {
  const { ready, ads, links, till, currency, accountIds, updateLink, openInAdsManager } = useAds();
  if (!ready) return <Waiting />;
  return (
    <div data-testid="page-compare">
      <NewAdBox />
      <ComparePicker ads={ads} links={links} currency={currency} accountIds={accountIds} onSaved={updateLink} />
      <VerdictStrip ads={ads} links={links} till={till} currency={currency} />
      <AdCards
        ads={ads}
        links={links}
        till={till}
        currency={currency}
        accountIds={accountIds}
        show="chosen"
        onLabelSaved={updateLink}
        onOpen={(adId) => openInAdsManager('ads', adId)}
      />
    </div>
  );
}
