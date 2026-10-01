import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  createQrCampaign,
  listQrCampaigns,
  listQrCampaignStatsAll,
  ensureSchema,
  isDbConfigured,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchCampaignsAndStats() {
  const [campaigns, statsArr] = await Promise.all([listQrCampaigns(), listQrCampaignStatsAll()]);
  return { campaigns, stats: Object.fromEntries(statsArr.map(s => [s.campaign_id, s])) };
}

export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ campaigns: [], stats: {} });

  try {
    return NextResponse.json(await fetchCampaignsAndStats());
  } catch {
    // Tables don't exist yet — run schema setup and retry once
    try {
      await ensureSchema();
      return NextResponse.json(await fetchCampaignsAndStats());
    } catch (e) {
      console.error('[qr-campaigns] GET failed after ensureSchema:', e);
      return NextResponse.json({ campaigns: [], stats: {} });
    }
  }
}

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });

  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const destinationUrl = typeof body.destinationUrl === 'string' ? body.destinationUrl.trim() : '';
    if (!name || !destinationUrl) {
      return NextResponse.json({ error: 'Campaign name and destination are required.' }, { status: 400 });
    }

    // Auto-setup schema on first use so campaigns can be created without a manual db/setup step
    const existing = await listQrCampaigns().catch(async () => {
      await ensureSchema();
      return listQrCampaigns();
    });

    const usedSlugs = new Set(existing.map(c => c.slug));
    const baseSlug = slugify(name) || 'campaign';
    let slug = baseSlug;
    if (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const campaign = await createQrCampaign({
      name,
      slug,
      status: body.status ?? 'active',
      partnerName: body.partnerName ?? null,
      campaignType: body.campaignType ?? null,
      destinationUrl,
      discountCode: body.discountCode ?? null,
      notes: body.notes ?? null,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      bespokeTitle: typeof body.bespokeTitle === 'string' ? body.bespokeTitle.trim() || null : null,
    });

    if (!campaign) return NextResponse.json({ error: 'Could not create campaign.' }, { status: 500 });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (e) {
    console.error('[qr-campaigns] POST failed:', e);
    return NextResponse.json(
      { error: 'Server error creating campaign. Please try again.' },
      { status: 500 }
    );
  }
}
