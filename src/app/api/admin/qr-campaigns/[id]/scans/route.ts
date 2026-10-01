import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resetQrCampaignScans, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });

  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid ID.' }, { status: 400 });

  try {
    const deleted = await resetQrCampaignScans(id);
    return NextResponse.json({ success: true, deleted });
  } catch (e) {
    console.error('[qr-campaigns/id/scans] DELETE failed:', e);
    return NextResponse.json({ error: 'Server error resetting scans.' }, { status: 500 });
  }
}
