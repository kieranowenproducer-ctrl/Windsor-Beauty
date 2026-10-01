// Parcel weight/format/customs calculation shared by order placement (snapshot
// weights at order time) and the Royal Mail label-creation route (build the
// shipment payload from those snapshots + global settings).

import { PRODUCTS, mergeProducts, type Product, type ProductShipping, type PackageFormat, type ShippingService } from '@/data/products';
import { listCustomProducts, type OrderItemRecord, type ShippingSettingsRow } from './db';
import type { ShipmentContentItem } from './royalMail';
import { outboundItemName, outboundSku, logGenericNameAudit, type GenericNameAudit } from './genericNames';

// Royal Mail v1 API per-package ceiling.
export const MAX_PARCEL_WEIGHT_GRAMS = 30000;

// Relative size ranking used to pick the largest package format required by
// any item in the order (or the global default, whichever is bigger).
// 'parcel' is the generic/unspecified-size value in Royal Mail's API schema
// (distinct from the size-tiered formats) — it must NOT outrank largeParcel
// here, or every order with no specific per-product format override (the
// common case) gets bucketed as the biggest possible parcel size. Royal
// Mail's own account UI maps that generic value to its largest "Large
// Parcel" category, which then only offers Parcelforce services and
// excludes the standard Tracked 24/48 services entirely — exactly the
// "have to manually pick format and service every time" symptom this rank
// caused. Ranked alongside smallParcel instead, since that's the realistic
// size for an unspecified item. 'documents' keeps its own special-purpose
// top rank — it's a different (non-size) classification, not implicated in
// the same bug.
const FORMAT_RANK: Record<PackageFormat, number> = {
  letter: 0,
  largeLetter: 1,
  smallParcel: 2,
  parcel: 2,
  mediumParcel: 3,
  largeParcel: 4,
  documents: 5,
};

// Loads the full product catalogue (static + admin overrides), keyed by slug,
// for resolving per-product shipping data.
export async function getProductsBySlug(): Promise<Map<string, Product>> {
  const overrides = await listCustomProducts();
  const merged = mergeProducts(PRODUCTS, overrides);
  return new Map(merged.map((p) => [p.slug, p]));
}

export interface ItemForWeighing {
  slug?: string;
  variant?: string;
  quantity: number;
}

// Resolves the effective shipping data for an item: a per-variant override
// (matched by dosage label) takes precedence over the product-level shipping
// block, which in turn falls back to global shipping settings.
function resolveItemShipping(
  item: { slug?: string; variant?: string },
  productsBySlug: Map<string, Product>
): ProductShipping | undefined {
  const product = item.slug ? productsBySlug.get(item.slug) : undefined;
  const variant = product?.variants.find((v) => v.dosage === item.variant);
  return variant?.shipping ?? product?.shipping;
}

// Looks up the per-unit weight/dimensions for an item — from the variant's or
// product's `shipping` data if present, otherwise the global default item weight.
export function snapshotItemShipping(
  item: ItemForWeighing,
  productsBySlug: Map<string, Product>,
  settings: ShippingSettingsRow
): { weightGrams: number; lengthMm?: number; widthMm?: number; heightMm?: number } {
  const shipping = resolveItemShipping(item, productsBySlug);
  return {
    weightGrams: shipping?.weightGrams ?? settings.default_item_weight_grams,
    ...(shipping?.lengthMm !== undefined ? { lengthMm: shipping.lengthMm } : {}),
    ...(shipping?.widthMm !== undefined ? { widthMm: shipping.widthMm } : {}),
    ...(shipping?.heightMm !== undefined ? { heightMm: shipping.heightMm } : {}),
  };
}

export interface ParcelCalculation {
  /** Sum of (item weight x quantity) across all items, in grams — packaging/margin not included. */
  itemsWeightGrams: number;
  /** Packaging allowance from shipping settings, in grams. */
  packagingWeightGrams: number;
  /** Safety margin from shipping settings, in grams. */
  safetyMarginGrams: number;
  /** itemsWeightGrams + packagingWeightGrams + safetyMarginGrams, capped at the Royal Mail per-package maximum. */
  totalWeightGrams: number;
  packageFormat: PackageFormat;
  /** False if any item in the order is marked as not eligible for international shipping. */
  internationalEligible: boolean;
}

// Computes the "safe packaged" parcel weight and format for a set of order
// items, using each item's weight snapshot (if already stored on the order)
// or its current product shipping data (if not yet snapshotted, e.g. at
// order-placement time), plus the global packaging allowance + safety margin.
export function calculateParcel(
  items: (OrderItemRecord | ItemForWeighing)[],
  productsBySlug: Map<string, Product>,
  settings: ShippingSettingsRow
): ParcelCalculation {
  let itemsWeightGrams = 0;
  let formatRank = FORMAT_RANK[settings.default_package_format as PackageFormat] ?? FORMAT_RANK.parcel;
  let internationalEligible = true;

  for (const item of items) {
    const snapshot = 'weightGrams' in item && typeof item.weightGrams === 'number'
      ? { weightGrams: item.weightGrams }
      : snapshotItemShipping(item, productsBySlug, settings);
    itemsWeightGrams += snapshot.weightGrams * item.quantity;

    const shipping = resolveItemShipping(item, productsBySlug);
    const itemFormat = shipping?.packageFormat;
    if (itemFormat) {
      const rank = FORMAT_RANK[itemFormat] ?? FORMAT_RANK.parcel;
      if (rank > formatRank) formatRank = rank;
    }
    if (shipping?.internationalEligible === false) internationalEligible = false;
  }

  const packagingWeightGrams = settings.packaging_weight_grams;
  const safetyMarginGrams = settings.safety_margin_grams;
  const totalWeightGrams = Math.min(
    MAX_PARCEL_WEIGHT_GRAMS,
    Math.max(1, itemsWeightGrams + packagingWeightGrams + safetyMarginGrams)
  );

  const packageFormat = (Object.keys(FORMAT_RANK) as PackageFormat[]).find((f) => FORMAT_RANK[f] === formatRank) ?? 'parcel';

  return { itemsWeightGrams, packagingWeightGrams, safetyMarginGrams, totalWeightGrams, packageFormat, internationalEligible };
}

// Maps a checkout shipping label ("UK Delivery" / "International Delivery")
// to a shipping service tier. Used when a stored order doesn't have a
// per-product `defaultService` override to follow instead.
export function resolveServiceFromLabel(shippingLabel: string): ShippingService {
  return shippingLabel.toLowerCase().includes('international') ? 'international' : 'uk-standard';
}

// Picks the Royal Mail service tier for an order's label. International
// recipients always use the international service (when enabled). Otherwise,
// the first item with a product-level `defaultService` override wins;
// failing that, falls back to the checkout shipping option the customer chose.
export function resolveShipmentService(
  items: (OrderItemRecord | ItemForWeighing)[],
  shippingLabel: string,
  productsBySlug: Map<string, Product>,
  isInternational: boolean
): ShippingService {
  if (isInternational) return 'international';
  for (const item of items) {
    const shipping = resolveItemShipping(item, productsBySlug);
    const service = shipping?.defaultService;
    if (service && service !== 'international') return service;
  }
  return resolveServiceFromLabel(shippingLabel);
}

// Builds the Royal Mail `packages[].contents[]` entries for an order — one
// per line item, including customs data from the product catalogue (used
// only for international shipments, but harmless to include for UK ones).
//
// `name` carries a GENERIC description, never the real product name or dosage —
// see src/lib/genericNames.ts. The customs fields below are deliberately left
// alone: they are a separate field and must describe the goods accurately.
// Pass `orderReference` to record the substitutions in our internal audit log.
export function buildShipmentContents(
  items: OrderItemRecord[],
  productsBySlug: Map<string, Product>,
  settings: ShippingSettingsRow,
  orderReference?: string
): ShipmentContentItem[] {
  const audits: GenericNameAudit[] = [];

  const contents = items.map((item) => {
    const shipping = resolveItemShipping(item, productsBySlug);
    const unitWeightInGrams = item.weightGrams ?? shipping?.weightGrams ?? settings.default_item_weight_grams;
    // A missing slug is normal — bespoke invoice lines have no catalogue entry.
    // get(undefined) -> undefined -> the generic default. Exactly the intended
    // behaviour: an unrecognised line is the LAST thing we'd want to send by name.
    const { name, audit } = outboundItemName(item.slug ? productsBySlug.get(item.slug) : undefined, {
      slug: item.slug ?? '(bespoke/no-slug)',
      realName: `${item.name}${item.variant ? ` (${item.variant})` : ''}`,
      destination: 'royal-mail',
      // A trial product's own fixed reference, e.g. "Product 284" (task 9e2f4a11). Present only
      // on trial lines. Without it a trial line has nothing left to identify it by this point,
      // and every one of them shipped under the same "Cosmetic Item".
      fulfilmentRef: item.fulfilmentRef,
    });
    audits.push(audit);
    return {
      name,
      // NOT item.slug — the slug is the product name ("retatrutide"), which would
      // leak straight past the generic `name` above. See outboundSku().
      sku: outboundSku(item.slug),
      quantity: item.quantity,
      unitValue: item.price,
      unitWeightInGrams,
      customsDescription: shipping?.customsDescription,
      customsCode: shipping?.customsCode,
      originCountryCode: shipping?.originCountryCode ?? settings.default_origin_country,
      customsDeclarationCategory: shipping?.customsCategory,
    };
  });

  if (orderReference) logGenericNameAudit(orderReference, audits);
  return contents;
}
