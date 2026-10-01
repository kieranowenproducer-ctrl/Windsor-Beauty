import { NextResponse } from 'next/server';
import { getSiteContent, isDbConfigured, upsertSiteContent } from '@/lib/db';
import { parseUpsellSettings } from '@/lib/upsells';

export const dynamic = 'force-dynamic';

// Master on/off switch. Import summary fields are written exclusively by the
// import route, never touched here, so saving this can never clobber the
// last-import record.
export async function PATCH(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Expected "enabled" (boolean).' }, { status: 400 });
  }

  try {
    const row = await getSiteContent('upsell-settings');
    const current = parseUpsellSettings(row?.body);
    const next = { ...current, enabled: body.enabled };
    await upsertSiteContent('upsell-settings', null, JSON.stringify(next), null, 'text');
    return NextResponse.json({ settings: next });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update upsell settings.' },
      { status: 500 }
    );
  }
}
