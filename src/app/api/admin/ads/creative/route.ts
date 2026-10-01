import { NextRequest, NextResponse } from 'next/server';
import { getCreativeLinks, setCreativeLink } from '@/lib/ads/store';

// POST { adId, adName, label, note, slot }: what a person calls a Meta ad.
// label = which film it used, note = what it is testing, slot = its letter
// (A to E) in the current comparison. All three empty removes the row. The
// answer carries every ad's labels after the save, because giving one ad a
// letter can take it off another. The pages, the chart legend, the weekly
// email and the adviser all read these back.
// Admin access is enforced by proxy.ts.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { adId?: unknown; adName?: unknown; label?: unknown; note?: unknown; slot?: unknown }
    | null;
  const adId = typeof body?.adId === 'string' ? body.adId.trim() : '';
  const label = typeof body?.label === 'string' ? body.label : '';
  const note = typeof body?.note === 'string' ? body.note : '';
  const slotRaw = typeof body?.slot === 'string' ? body.slot.trim().toUpperCase() : '';
  if (!adId || adId.length > 100 || label.length > 200 || note.length > 200) {
    return NextResponse.json({ error: 'A valid ad, and a note and label under 200 letters each, are needed.' }, { status: 400 });
  }
  if (slotRaw && !/^[A-E]$/.test(slotRaw)) {
    return NextResponse.json({ error: 'The letter can only be A to E.' }, { status: 400 });
  }
  try {
    await setCreativeLink(adId, typeof body?.adName === 'string' ? body.adName.slice(0, 300) : null, { label, note, slot: slotRaw || null });
    const links = await getCreativeLinks().catch(() => null);
    return NextResponse.json({ ok: true, links });
  } catch {
    return NextResponse.json({ error: 'The note could not be saved.' }, { status: 500 });
  }
}
