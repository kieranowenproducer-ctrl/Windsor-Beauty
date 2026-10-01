import { requireDb } from './client';
// Extracted verbatim from db.ts on 2026-08-11 (Phase 2 of "thin it out").
// Everything here is re-exported from '@/lib/db', so no call site changed.

// ─── Shipping settings (global Royal Mail defaults) ────────────────────────

export interface ShippingSettingsRow {
  id: number;
  default_item_weight_grams: number;
  packaging_weight_grams: number;
  safety_margin_grams: number;
  default_package_format: string;
  default_service: string;
  international_enabled: boolean;
  default_origin_country: string;
  /** Server-authoritative checkout shipping cost for the "UK Delivery" option, in pence. */
  uk_standard_rate_pence: number;
  /** Server-authoritative checkout shipping cost for the "International Delivery" option, in pence. */
  international_rate_pence: number;
  /** Free shipping when UK subtotal meets or exceeds this amount (pence). 0 = disabled. */
  free_shipping_threshold_pence: number;
  updated_at: string;
}

// Single-row table — inserts the default row on first read so the admin page
// always has something to display/edit.
export async function getShippingSettings(): Promise<ShippingSettingsRow> {
  const db = requireDb();
  const rows = await db`
    INSERT INTO shipping_settings (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
    RETURNING *
  `;
  if (rows[0]) return rows[0] as ShippingSettingsRow;
  const existing = await db`SELECT * FROM shipping_settings WHERE id = 1 LIMIT 1`;
  return existing[0] as ShippingSettingsRow;
}

export async function updateShippingSettings(params: {
  defaultItemWeightGrams: number;
  packagingWeightGrams: number;
  safetyMarginGrams: number;
  defaultPackageFormat: string;
  defaultService: string;
  internationalEnabled: boolean;
  defaultOriginCountry: string;
  ukStandardRatePence: number;
  internationalRatePence: number;
  freeShippingThresholdPence: number;
}): Promise<ShippingSettingsRow> {
  const db = requireDb();
  const rows = await db`
    INSERT INTO shipping_settings (
      id, default_item_weight_grams, packaging_weight_grams, safety_margin_grams,
      default_package_format, default_service, international_enabled, default_origin_country,
      uk_standard_rate_pence, international_rate_pence, free_shipping_threshold_pence, updated_at
    )
    VALUES (
      1, ${params.defaultItemWeightGrams}, ${params.packagingWeightGrams}, ${params.safetyMarginGrams},
      ${params.defaultPackageFormat}, ${params.defaultService}, ${params.internationalEnabled},
      ${params.defaultOriginCountry}, ${params.ukStandardRatePence}, ${params.internationalRatePence},
      ${params.freeShippingThresholdPence}, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      default_item_weight_grams = ${params.defaultItemWeightGrams},
      packaging_weight_grams = ${params.packagingWeightGrams},
      safety_margin_grams = ${params.safetyMarginGrams},
      default_package_format = ${params.defaultPackageFormat},
      default_service = ${params.defaultService},
      international_enabled = ${params.internationalEnabled},
      default_origin_country = ${params.defaultOriginCountry},
      uk_standard_rate_pence = ${params.ukStandardRatePence},
      international_rate_pence = ${params.internationalRatePence},
      free_shipping_threshold_pence = ${params.freeShippingThresholdPence},
      updated_at = now()
    RETURNING *
  `;
  return rows[0] as ShippingSettingsRow;
}
