import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  getQrCampaignById,
  getQrCampaignStats,
  updateQrCampaign,
  deleteQrCampaign,
  ensureSchema,
  isDbConfigured,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });

  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid ID.' }, { status: 400 });

  try {
    const [campaign, stats] = await Promise.all([getQrCampaignById(id), getQrCampaignStats(id)]);
    if (!campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    return NextResponse.json({ campaign, stats });
  } catch {
    try {
      await ensureSchema();
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    } catch (e) {
      console.error('[qr-campaigns/id] GET failed:', e);
      return NextResponse.json({ error: 'Server error.' }, { status: 500 });
    }
  }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });

  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid ID.' }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const destinationUrl = typeof body.destinationUrl === 'string' ? body.destinationUrl.trim() : '';
  if (!name || !destinationUrl) {
    return NextResponse.json({ error: 'Name and destination URL are required.' }, { status: 400 });
  }

  try {
    const campaign = await updateQrCampaign(id, {
      name,
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

    if (!campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    return NextResponse.json({ campaign });
  } catch (e) {
    console.error('[qr-campaigns/id] PUT failed:', e);
    return NextResponse.json({ error: 'Server error updating campaign.' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });

  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid ID.' }, { status: 400 });

  try {
    const deleted = await deleteQrCampaign(id);
    if (!deleted) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[qr-campaigns/id] DELETE failed:', e);
    return NextResponse.json({ error: 'Server error deleting campaign.' }, { status: 500 });
  }
}
