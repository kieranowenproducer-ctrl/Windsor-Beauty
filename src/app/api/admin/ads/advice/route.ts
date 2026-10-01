import { NextResponse } from 'next/server';
import { fetchAdsDashboard, fetchDeliveryIssues, isMetaAdsConfigured } from '@/lib/ads/meta';
import { campaignTill, getCreativeLinks, readSliceHistory } from '@/lib/ads/store';
import { adsAiConfigured, computeSignals, writeAdvice } from '@/lib/ads/adviser';
import { compareChosen, pickChosen, verdictAdFrom } from '@/lib/ads/compare';
import { adDisplayName, type CreativeLink } from '@/lib/ads/labels';

// POST: write fresh advice now, on a person's click. The weekly email writes
// its own on Mondays; this exists so the button on the Ad Results page works.
// Admin access is enforced by proxy.ts. Spending is capped by the adviser.

export const dynamic = 'force-dynamic';

export async function POST() {
  if (!isMetaAdsConfigured()) {
    return NextResponse.json({ advice: null, reason: 'The Meta connection is not set up.' }, { status: 400 });
  }

  try {
    const [dash, issues, slices, till, links] = await Promise.all([
      fetchAdsDashboard('28d'),
      fetchDeliveryIssues().catch(() => []),
      readSliceHistory(28),
      campaignTill(28),
      getCreativeLinks().catch((): Record<string, CreativeLink> => ({})),
    ]);

    const tillByCampaign = new Map(till.map((t) => [t.utm_campaign, t]));
    const { chosen } = pickChosen(dash.ads, (id) => links[id]?.slot);
    const toVerdict = (ad: typeof dash.ads[number]) =>
      verdictAdFrom(ad, adDisplayName(links[ad.id], ad.name), tillByCampaign.get(ad.campaignId)?.orders ?? 0);
    const verdict = dash.ads.length > 0 ? compareChosen(chosen.map(toVerdict), dash.account.currency) : null;

    const signals = computeSignals({
      daily: dash.daily,
      slices,
      campaigns: dash.campaigns,
      till,
      deliveryIssues: issues,
      currency: dash.account.currency,
      verdict,
    });

    if (!adsAiConfigured()) {
      return NextResponse.json({
        signals,
        advice: null,
        reason: 'The AI key is not set on this site, so written advice is unavailable. The signals are computed without AI.',
      });
    }

    const result = await writeAdvice(signals, 'the last 28 days');
    return NextResponse.json({ signals, ...result });
  } catch (e) {
    return NextResponse.json(
      { advice: null, reason: e instanceof Error ? e.message : 'The adviser could not run.' },
      { status: 502 },
    );
  }
}
