import { NextResponse } from 'next/server';
import { getSiteContent, isDbConfigured, listManualUpsellOverrides, listUpsellRules } from '@/lib/db';
import { parseUpsellSettings } from '@/lib/upsells';

export const dynamic = 'force-dynamic';

// Admin read endpoint — every CSV-imported rule, every manual per-product
// override, and the master enable/disable flag + last-import snapshot, for
// the /admin/upsells dashboard. Protected by proxy.ts (all of
// /api/admin/* requires a valid admin session).
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  try {
    const [rules, manualOverrides, settingsRow] = await Promise.all([
      listUpsellRules(),
      listManualUpsellOverrides(),
      getSiteContent('upsell-settings'),
    ]);
    return NextResponse.json({ rules, manualOverrides, settings: parseUpsellSettings(settingsRow?.body) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load upsell rules.' },
      { status: 500 }
    );
  }
}
