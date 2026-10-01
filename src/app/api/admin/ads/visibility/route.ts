import { NextRequest, NextResponse } from 'next/server';
import { getCreativeLinks, setAdHidden } from '@/lib/ads/store';

export const dynamic = 'force-dynamic';

// This only changes the Windsor Glow panel. It never pauses, archives or
// deletes the advert in Meta Ads Manager.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { adId?: unknown; adName?: unknown; hidden?: unknown }
    | null;
  const adId = typeof body?.adId === 'string' ? body.adId.trim() : '';
  const adName = typeof body?.adName === 'string' ? body.adName.slice(0, 300) : null;
  if (!adId || adId.length > 100 || typeof body?.hidden !== 'boolean') {
    return NextResponse.json({ error: 'A valid advert and visibility choice are needed.' }, { status: 400 });
  }
  try {
    await setAdHidden(adId, adName, body.hidden);
    return NextResponse.json({ ok: true, links: await getCreativeLinks() });
  } catch {
    return NextResponse.json({ error: 'The advert could not be moved. Please try again.' }, { status: 500 });
  }
}
