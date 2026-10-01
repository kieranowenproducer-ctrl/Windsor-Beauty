import { NextResponse } from 'next/server';
import { getShippingSettings, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public — lets the checkout page show the same shipping rates the server
// will actually charge (see resolveServerItemPrice / place-order/route.ts),
// instead of separately hardcoded values that could drift out of sync.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ukStandardRate: 10, internationalRate: 40, internationalEnabled: true });
  }

  try {
    const settings = await getShippingSettings();
    return NextResponse.json({
      ukStandardRate: settings.uk_standard_rate_pence / 100,
      internationalRate: settings.international_rate_pence / 100,
      internationalEnabled: settings.international_enabled,
      freeShippingThreshold: settings.free_shipping_threshold_pence > 0
        ? settings.free_shipping_threshold_pence / 100
        : null,
    });
  } catch {
    return NextResponse.json({ ukStandardRate: 10, internationalRate: 40, internationalEnabled: true, freeShippingThreshold: null });
  }
}
