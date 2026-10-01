import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  listQrCampaignMembers,
  listQrCampaignGuestBuyers,
  ensureSchema,
  isDbConfigured,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ members: [], guests: [] });
  }

  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid ID.' }, { status: 400 });

  async function fetchPeople() {
    const [members, guests] = await Promise.all([
      listQrCampaignMembers(id),
      listQrCampaignGuestBuyers(id),
    ]);
    return { members, guests };
  }

  try {
    return NextResponse.json(await fetchPeople());
  } catch {
    try {
      await ensureSchema();
      return NextResponse.json(await fetchPeople());
    } catch (e) {
      console.error('[qr-campaigns/customers] GET failed:', e);
      return NextResponse.json({ members: [], guests: [] });
    }
  }
}
