import type { PackageFormat } from './products';

// Category-level shipping weight/format defaults for Royal Mail labels, used
// by the "Apply category defaults" button on the bulk shipping weights admin
// page. Deliberately empty: nobody has weighed the packaged skincare products
// yet, and a guessed weight would end up on a real postage label. Add one row
// per category (for example Serums) once real packaged weights are known.
export const CATEGORY_SHIPPING_DEFAULTS: Record<string, { weightGrams: number; packageFormat: PackageFormat }> = {};

// Per-size overrides where the size materially changes the default weight,
// as product slug -> size label -> weight. Empty for the same reason as above.
export const VARIANT_SHIPPING_OVERRIDES: Record<string, Record<string, { weightGrams: number }>> = {};
