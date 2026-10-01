import { NextRequest, NextResponse } from 'next/server';
import { fetchAdsDashboard, isMetaAdsConfigured, londonToday, type RangePreset } from '@/lib/ads/meta';
import { campaignTill, getCreativeLinks } from '@/lib/ads/store';
import { adDisplayName, type CreativeLink } from '@/lib/ads/labels';

// Download the current view as a spreadsheet (ADSLAB item 12). One CSV file
// with three sections: day by day, campaigns, and ads with the names Kieran
// gave them. Built here on the server from the same reads the page uses
// (fetchAdsDashboard, campaignTill, getCreativeLinks), so the file can never
// show different figures from the screen. Money is in pounds with two
// decimals; the file starts with a byte-order mark so Excel reads the £ signs.
// Admin access is enforced by proxy.ts. Read-only against Meta.

export const dynamic = 'force-dynamic';

const PRESETS: RangePreset[] = ['7d', '28d', '90d', 'all'];
const TILL_DAYS: Record<RangePreset, number> = { '7d': 7, '28d': 28, '90d': 90, all: 365 };
const RANGE_WORDS: Record<RangePreset, string> = { '7d': 'last 7 days', '28d': 'last 28 days', '90d': 'last 90 days', all: 'all time' };

function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(values: unknown[]): string {
  return values.map(cell).join(',');
}

const pounds = (minor: number) => (minor / 100).toFixed(2);
const perClick = (spendMinor: number, clicks: number) => (clicks > 0 ? (spendMinor / clicks / 100).toFixed(2) : '');
const rate = (clicks: number, impressions: number) => (impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '');

export async function GET(request: NextRequest) {
  if (!isMetaAdsConfigured()) {
    return NextResponse.json({ error: 'The Meta connection is not set up.' }, { status: 400 });
  }
  const raw = request.nextUrl.searchParams.get('range') ?? '28d';
  const preset = (PRESETS as string[]).includes(raw) ? (raw as RangePreset) : '28d';

  try {
    const [data, till, links] = await Promise.all([
      fetchAdsDashboard(preset),
      campaignTill(TILL_DAYS[preset]).catch(() => []),
      getCreativeLinks().catch((): Record<string, CreativeLink> => ({})),
    ]);
    const tillByCampaign = new Map(till.map((t) => [t.utm_campaign, t]));
    const today = londonToday();
    const lines: string[] = [];

    lines.push(row(['Windsor Glow ad results', RANGE_WORDS[preset], `downloaded ${today}`, `account ${data.account.name}`, `currency ${data.account.currency}`]));
    lines.push('');

    lines.push(row(['Day by day']));
    lines.push(row(['Date', 'Money spent', 'Times shown', 'People reached', 'Clicks', 'Cost per click', 'Click rate %', 'Video views', 'Purchases (Meta)', 'Purchase value (Meta)']));
    for (const d of data.daily) {
      lines.push(row([d.date, pounds(d.spendMinor), d.impressions, d.reach, d.clicks, perClick(d.spendMinor, d.clicks), rate(d.clicks, d.impressions), d.videoViews, d.purchases, pounds(d.purchaseValueMinor)]));
    }
    lines.push('');

    lines.push(row(['Campaigns']));
    lines.push(row(['Campaign', 'Meta account', 'Status', 'Objective', 'Started', 'Money spent', 'Times shown', 'People reached', 'Clicks', 'Cost per click', 'Visits (ours)', 'People (ours)', 'Orders (ours)', 'Sales (ours)', 'Meta campaign id']));
    for (const c of data.campaigns) {
      const t = tillByCampaign.get(c.id);
      lines.push(row([c.name, c.accountId, c.status, c.objective, c.startedOn ?? '', pounds(c.spendMinor), c.impressions, c.reach, c.clicks, perClick(c.spendMinor, c.clicks), t?.visits ?? 0, t?.people ?? 0, t?.orders ?? 0, pounds(t?.revenue_minor ?? 0), c.id]));
    }
    lines.push('');

    lines.push(row(['Ads']));
    lines.push(row(['What you call it', 'A or B', 'What it tests', 'Which film', 'Meta ad name', 'Campaign', 'Meta account', 'Website tracking', 'Status', 'Button', 'Targeting', 'Money spent', 'Times shown', 'People reached', 'Frequency', 'Clicks', 'Link clicks', 'Cost per click', 'Click rate %', 'Cost per 1,000 views', 'Comments', 'Engagement', 'Landed on the site (Meta)', 'Video views', 'Orders (ours)', 'Sales (ours)', 'Meta ad id']));
    for (const a of data.ads) {
      const link = links[a.id];
      const t = tillByCampaign.get(a.campaignId);
      lines.push(row([
        adDisplayName(link, a.name), link?.slot ?? '', link?.note ?? '', link?.label ?? '', a.name, a.campaignName, a.accountId,
        a.websiteTracking === true ? 'Ready' : a.websiteTracking === false ? 'Tag missing' : 'Not confirmed', a.status,
        a.callToAction ?? '', a.targeting ?? '', pounds(a.spendMinor), a.impressions, a.reach, a.frequency ? a.frequency.toFixed(2) : '',
        a.clicks, a.linkClicks, perClick(a.spendMinor, a.clicks), rate(a.clicks, a.impressions),
        a.impressions > 0 ? ((a.spendMinor / a.impressions) * 1000 / 100).toFixed(2) : '',
        a.comments, a.engagement, a.landingPageViews, a.videoViews, t?.orders ?? 0, pounds(t?.revenue_minor ?? 0), a.id,
      ]));
    }

    const body = '﻿' + lines.join('\r\n') + '\r\n';
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="windsor-glow-ads-${preset}-${today}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Meta could not be read.' },
      { status: 502 },
    );
  }
}
