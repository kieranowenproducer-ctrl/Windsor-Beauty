import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getQrCampaignBySlug, recordCampaignScan } from '@/lib/db';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const { slug } = params;

  let destinationUrl = '/';

  try {
    const campaign = await getQrCampaignBySlug(slug);

    if (!campaign) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    destinationUrl = campaign.destination_url;

    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      null;
    const userAgent = request.headers.get('user-agent') ?? null;

    // Retrieve or mint the long-lived visitor UUID cookie.
    const existingVid = request.cookies.get('wb_vid')?.value ?? null;
    const wgVid = existingVid ?? randomUUID();
    const isNewVisitor = !existingVid;

    if (campaign.status !== 'archived') {
      await recordCampaignScan({
        campaignId: campaign.id,
        ipAddress,
        userAgent,
        wgVid,
        isNewVisitor,
      }).catch(() => {});
    }

    const response = NextResponse.redirect(destinationUrl);

    // 365-day attribution cookie — overwritten on every scan so the most recent
    // campaign gets credit. Long window reflects physical QR campaigns where
    // customers discover the brand once and return to reorder months later.
    if (campaign.status === 'active') {
      response.cookies.set('wb_ref', slug, {
        maxAge: 365 * 24 * 60 * 60,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
      });

      // Non-httpOnly session cookie so the client-side EntryGate can detect
      // which campaign this visit came from and show a bespoke landing poster
      // before the terms gate. No maxAge = session cookie, clears on browser close.
      response.cookies.set('wb_qr_campaign', slug, {
        path: '/',
        sameSite: 'lax',
      });
    }

    // 365-day visitor identity cookie — only set if it didn't already exist.
    if (isNewVisitor) {
      response.cookies.set('wb_vid', wgVid, {
        maxAge: 365 * 24 * 60 * 60,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
      });
    }

    return response;
  } catch {
    return NextResponse.redirect(new URL(destinationUrl, request.url));
  }
}
