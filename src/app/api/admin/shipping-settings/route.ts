import { NextResponse } from 'next/server';
import { getShippingSettings, isDbConfigured, updateShippingSettings } from '@/lib/db';
import { PACKAGE_FORMATS, SHIPPING_SERVICES } from '@/data/products';
import { isRoyalMailConfigured } from '@/lib/royalMail';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  try {
    const settings = await getShippingSettings();
    return NextResponse.json({
      settings: {
        defaultItemWeightGrams: settings.default_item_weight_grams,
        packagingWeightGrams: settings.packaging_weight_grams,
        safetyMarginGrams: settings.safety_margin_grams,
        defaultPackageFormat: settings.default_package_format,
        defaultService: settings.default_service,
        internationalEnabled: settings.international_enabled,
        defaultOriginCountry: settings.default_origin_country,
        ukStandardRate: settings.uk_standard_rate_pence / 100,
        internationalRate: settings.international_rate_pence / 100,
        freeShippingThreshold: settings.free_shipping_threshold_pence > 0
          ? settings.free_shipping_threshold_pence / 100
          : 0,
        updatedAt: settings.updated_at,
      },
      royalMailConfigured: isRoyalMailConfigured(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load shipping settings.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const defaultItemWeightGrams = Number(body.defaultItemWeightGrams);
  const packagingWeightGrams = Number(body.packagingWeightGrams);
  const safetyMarginGrams = Number(body.safetyMarginGrams);
  const defaultPackageFormat = String(body.defaultPackageFormat ?? '');
  const defaultService = String(body.defaultService ?? '');
  const internationalEnabled = body.internationalEnabled === true;
  const defaultOriginCountry = String(body.defaultOriginCountry ?? '').trim().toUpperCase();
  const ukStandardRate = Number(body.ukStandardRate);
  const internationalRate = Number(body.internationalRate);
  const freeShippingThreshold = Number(body.freeShippingThreshold ?? 0);

  if (
    !Number.isFinite(defaultItemWeightGrams) || defaultItemWeightGrams < 1 ||
    !Number.isFinite(packagingWeightGrams) || packagingWeightGrams < 0 ||
    !Number.isFinite(safetyMarginGrams) || safetyMarginGrams < 0
  ) {
    return NextResponse.json({ error: 'Weights must be positive numbers (grams).' }, { status: 400 });
  }
  if (!(PACKAGE_FORMATS as readonly string[]).includes(defaultPackageFormat)) {
    return NextResponse.json({ error: 'Invalid default package format.' }, { status: 400 });
  }
  if (!(SHIPPING_SERVICES as readonly string[]).includes(defaultService)) {
    return NextResponse.json({ error: 'Invalid default service.' }, { status: 400 });
  }
  if (!/^[A-Z]{2,3}$/.test(defaultOriginCountry)) {
    return NextResponse.json({ error: 'Default origin country must be a 2-3 letter country code (e.g. GB).' }, { status: 400 });
  }
  if (!Number.isFinite(ukStandardRate) || ukStandardRate < 0 || !Number.isFinite(internationalRate) || internationalRate < 0) {
    return NextResponse.json({ error: 'Shipping rates must be positive numbers (pounds).' }, { status: 400 });
  }

  try {
    const settings = await updateShippingSettings({
      defaultItemWeightGrams: Math.round(defaultItemWeightGrams),
      packagingWeightGrams: Math.round(packagingWeightGrams),
      safetyMarginGrams: Math.round(safetyMarginGrams),
      defaultPackageFormat,
      defaultService,
      internationalEnabled,
      defaultOriginCountry,
      ukStandardRatePence: Math.round(ukStandardRate * 100),
      internationalRatePence: Math.round(internationalRate * 100),
      freeShippingThresholdPence: Number.isFinite(freeShippingThreshold) && freeShippingThreshold >= 0
        ? Math.round(freeShippingThreshold * 100)
        : 0,
    });
    return NextResponse.json({
      settings: {
        defaultItemWeightGrams: settings.default_item_weight_grams,
        packagingWeightGrams: settings.packaging_weight_grams,
        safetyMarginGrams: settings.safety_margin_grams,
        defaultPackageFormat: settings.default_package_format,
        defaultService: settings.default_service,
        internationalEnabled: settings.international_enabled,
        defaultOriginCountry: settings.default_origin_country,
        ukStandardRate: settings.uk_standard_rate_pence / 100,
        internationalRate: settings.international_rate_pence / 100,
        freeShippingThreshold: settings.free_shipping_threshold_pence > 0
          ? settings.free_shipping_threshold_pence / 100
          : 0,
        updatedAt: settings.updated_at,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save shipping settings.' },
      { status: 500 }
    );
  }
}
