import type { PackageFormat } from './products';

// Category-level shipping weight/format defaults for Royal Mail labels, used
// by the "Apply category defaults" button on the bulk shipping weights admin
// page. These are reasonable estimates (2ml glass vial + box for peptides,
// pre-filled injector pen, bottled bacteriostatic water): Kieran should
// spot-check against real packaged weights once applied.
export const CATEGORY_SHIPPING_DEFAULTS: Record<string, { weightGrams: number; packageFormat: PackageFormat }> = {
  Peptides: { weightGrams: 25, packageFormat: 'largeLetter' },
  Pens: { weightGrams: 150, packageFormat: 'parcel' },
  'BAC Water': { weightGrams: 60, packageFormat: 'largeLetter' },
};

// Per-variant overrides where dosage materially changes the default weight.
export const VARIANT_SHIPPING_OVERRIDES: Record<string, Record<string, { weightGrams: number }>> = {
  'bac-water': {
    '10ml': { weightGrams: 50 },
    '30ml': { weightGrams: 90 },
  },
};
