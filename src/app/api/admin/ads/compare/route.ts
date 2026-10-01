import { NextRequest, NextResponse } from 'next/server';
import { fetchAdSeries, isMetaAdsConfigured, type CompareRange } from '@/lib/ads/meta';
import { campaignTillBuckets } from '@/lib/ads/store';

// The two-ad comparison chart's own read (ADSLAB item 3). Per-ad figures in
// hourly or daily buckets over a short window, joined to orders from our own
// records in the same buckets. Kept apart from the main page read so a range
// change on the chart does not re-fetch the whole page. Admin access is
// enforced by proxy.ts. Read-only against Meta.

export const dynamic = 'force-dynamic';

const RANGES: CompareRange[] = ['today', '24h', '3d', '7d', 'all'];

export async function GET(request: NextRequest) {
  if (!isMetaAdsConfigured()) {
    return NextResponse.json({ configured: false, error: 'The Meta connection is not set up.' }, { status: 400 });
  }
  const raw = request.nextUrl.searchParams.get('range') ?? '7d';
  const range = (RANGES as string[]).includes(raw) ? (raw as CompareRange) : '7d';

  try {
    const series = await fetchAdSeries(range);
    // Orders from our own till, bucketed the same way, keyed by campaign tag.
    const orders = await campaignTillBuckets(series.since, series.granularity).catch(() => []);
    const ordersByBucket = new Map<string, Map<string, number>>();
    for (const o of orders) {
      const byCampaign = ordersByBucket.get(o.bucket) ?? new Map<string, number>();
      byCampaign.set(o.utm_campaign, (byCampaign.get(o.utm_campaign) ?? 0) + o.orders);
      ordersByBucket.set(o.bucket, byCampaign);
    }
    const campaignOf = new Map(series.ads.map((a) => [a.id, a.campaignId]));
    for (const p of series.points) {
      const byCampaign = ordersByBucket.get(p.key);
      for (const [adId, cell] of Object.entries(p.byAd)) {
        cell.orders = byCampaign?.get(campaignOf.get(adId) ?? '') ?? 0;
      }
    }
    return NextResponse.json({ configured: true, range, fetchedAt: new Date().toISOString(), ...series });
  } catch (e) {
    return NextResponse.json(
      { configured: true, range, error: e instanceof Error ? e.message : 'Meta could not be read.' },
      { status: 502 },
    );
  }
}
