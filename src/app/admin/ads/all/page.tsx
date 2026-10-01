'use client';

import AdCards from '@/components/admin/ads/AdCards';
import { AccountStrip, OtherTaggedLinks } from '@/components/admin/ads/CampaignsTable';
import Waiting from '@/components/admin/ads/Waiting';
import { useAds } from '@/components/admin/ads/AdsData';

// All ads: every ad the account has run, previous ones included, then any
// other tagged links, then which account this is. The campaigns table went
// (audit item 11): each boosted post is its own campaign, so it repeated the cards.

export default function AllAdsPage() {
  const { ready, allAds, links, till, currency, accountIds, updateLink, setAdHidden, openInAdsManager } = useAds();
  if (!ready) return <Waiting />;
  return (
    <div data-testid="page-all">
      <AdCards
        ads={allAds}
        links={links}
        till={till}
        currency={currency}
        accountIds={accountIds}
        show="all"
        onLabelSaved={updateLink}
        onHiddenSaved={setAdHidden}
        onOpen={(adId) => openInAdsManager('ads', adId)}
      />
      <OtherTaggedLinks />
      <AccountStrip />
    </div>
  );
}
