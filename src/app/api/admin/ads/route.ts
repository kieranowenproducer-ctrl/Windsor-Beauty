import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAdFunds, fetchAdsDashboard, fetchDeliveryIssues, isMetaAdsConfigured,
  type AdFunds, type RangePreset,
} from '@/lib/ads/meta';
import {
  adFunnel, campaignTill, getCreativeLinks, landingReport, latestAdvice, orderStats, readSliceHistory,
  type VisitorScope,
} from '@/lib/ads/store';
import { resolvePageNames } from '@/lib/ads/pageLabels';
import { computeSignals } from '@/lib/ads/adviser';
import { compareChosen, pickChosen, verdictAdFrom } from '@/lib/ads/compare';
import { adDisplayName, type CreativeLink } from '@/lib/ads/labels';

// Admin access is enforced by proxy.ts for every /api/admin path, the same as
// the rest of the admin API. This route only reads from Meta and our own
// database; it writes nothing.

export const dynamic = 'force-dynamic';

const PRESETS: RangePreset[] = ['7d', '28d', '90d', 'all'];
const TILL_DAYS: Record<RangePreset, number> = { '7d': 7, '28d': 28, '90d': 90, all: 365 };

export async function GET(request: NextRequest) {
  if (!isMetaAdsConfigured()) {
    return NextResponse.json({
      configured: false,
      detail: 'META_SYSTEM_USER_TOKEN and at least one Meta ad account ID are not both set.',
    });
  }

  const raw = request.nextUrl.searchParams.get('range') ?? '28d';
  const preset = (PRESETS as string[]).includes(raw) ? (raw as RangePreset) : '28d';

  // Which visitors the after-the-click figures count (ADSLAB item 15). "new"
  // is the default because this is an advertising report: somebody who was
  // already signed in as a member when they arrived was not won by the ad.
  // "all" is one click away on the page and shows everybody.
  const visitorsRaw = request.nextUrl.searchParams.get('visitors') ?? 'new';
  const visitors: VisitorScope = visitorsRaw === 'all' ? 'all' : 'new';

  try {
    const [data, issues, slices, till, links, advice, funds, funnel, orders, landing] = await Promise.all([
      fetchAdsDashboard(preset),
      fetchDeliveryIssues().catch(() => []),
      readSliceHistory(TILL_DAYS[preset]).catch(() => []),
      campaignTill(TILL_DAYS[preset]).catch(() => []),
      getCreativeLinks().catch((): Record<string, CreativeLink> => ({})),
      latestAdvice().catch(() => null),
      // The funds card must never show a number it did not get: a failed read
      // arrives as a card that says so, and the rest of the page is unaffected.
      fetchAdFunds().catch((e): AdFunds => ({
        availableMinor: null, capMinor: null, spentMinor: null, prepay: false,
        displayString: null, displayMinor: null, disagreement: false,
        currency: '', fetchedAt: new Date().toISOString(),
        missing: e instanceof Error ? e.message : 'Meta could not be read.',
      })),
      adFunnel(TILL_DAYS[preset], visitors).catch(() => []),
      // The average order is taken over a year whatever the period, so a short
      // window with two orders in it does not set the break-even line.
      orderStats(365).catch(() => null),
      landingReport(TILL_DAYS[preset], visitors)
        .catch(() => ({ tagged: [], pages: [], scope: visitors, totalLandings: 0, memberLandings: 0 })),
    ]);

    // Plain-English names for the pages on screen, looked up once, only for the
    // addresses that actually appear. Never allowed to fail the whole read.
    const pageNames = await resolvePageNames([
      ...landing.pages.map((p) => p.path),
      ...landing.tagged.map((t) => t.path),
    ]).catch(() => ({}));

    // Has one ad beaten the other? Same pair and same words as the page.
    const tillByCampaign = new Map(till.map((t) => [t.utm_campaign, t]));
    const { chosen } = pickChosen(data.ads, (id) => links[id]?.slot);
    const toVerdict = (ad: typeof data.ads[number]) =>
      verdictAdFrom(ad, adDisplayName(links[ad.id], ad.name), tillByCampaign.get(ad.campaignId)?.orders ?? 0);
    const verdict = data.ads.length > 0 ? compareChosen(chosen.map(toVerdict), data.account.currency) : null;

    const signals = computeSignals({
      daily: data.daily,
      slices,
      campaigns: data.campaigns,
      till,
      deliveryIssues: issues,
      currency: data.account.currency,
      verdict,
    });

    return NextResponse.json({
      verdict,
      configured: true,
      range: preset,
      ...data,
      deliveryIssues: issues,
      till,
      creativeLinks: links,
      signals,
      latestAdvice: advice,
      funds,
      funnel,
      orders,
      landing,
      pageNames,
      visitors,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    // The message is shown on the admin page as-is: an expired token or a
    // permissions change should be readable there, not buried in server logs.
    return NextResponse.json(
      { configured: true, range: preset, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 502 },
    );
  }
}
