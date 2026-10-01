// Validation of everything an admin can type into the product editor. Lifted
// verbatim out of products.ts on 2026-08-11 and re-exported from
// '@/data/products', so no importing file changed.
import { roundMoney } from '@/lib/money';
import { sanitizeRichTextHtml } from '@/lib/richText';
import {
  PACKAGE_FORMATS,
  CUSTOMS_CATEGORIES,
  SHIPPING_SERVICES,
  AVAILABILITY_STATUSES,
  SPEC_ROW_KEYS,
  PRODUCT_INFO_MODES,
  CERTIFICATE_FILLER_STATUSES,
} from './productModel';
import type {
  ProductVariant,
  Category,
  PackageFormat,
  CustomsCategory,
  ShippingService,
  ProductShipping,
  AvailabilityStatus,
  SpecRowKey,
  Product,
  ProductInfoMode,
  ProductInfoSection,
  CertificateTestRow,
  CertificateInfoRow,
  ProductCertificate,
  CertificateFillerStatus,
} from './productModel';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_VARIANT_PRICE = 100000;
const MAX_PARCEL_WEIGHT_GRAMS = 30000; // Royal Mail v1 API per-package ceiling

// Parses the optional admin-submitted shipping block. Returns undefined if
// absent/empty, null if present but malformed (caller should reject the save).
export function parseShippingInput(value: unknown): ProductShipping | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const shipping: ProductShipping = {};

  const numberFields: (keyof ProductShipping)[] = ['weightGrams', 'lengthMm', 'widthMm', 'heightMm'];
  for (const field of numberFields) {
    const raw = v[field];
    if (raw === undefined || raw === null || raw === '') continue;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) return null;
    if (field === 'weightGrams' && num > MAX_PARCEL_WEIGHT_GRAMS) return null;
    (shipping[field] as number) = Math.round(num);
  }

  if (v.packageFormat !== undefined && v.packageFormat !== '') {
    if (typeof v.packageFormat !== 'string' || !(PACKAGE_FORMATS as readonly string[]).includes(v.packageFormat)) return null;
    shipping.packageFormat = v.packageFormat as PackageFormat;
  }

  if (v.defaultService !== undefined && v.defaultService !== '') {
    if (typeof v.defaultService !== 'string' || !(SHIPPING_SERVICES as readonly string[]).includes(v.defaultService)) return null;
    shipping.defaultService = v.defaultService as ShippingService;
  }

  if (v.customsCategory !== undefined && v.customsCategory !== '') {
    if (typeof v.customsCategory !== 'string' || !(CUSTOMS_CATEGORIES as readonly string[]).includes(v.customsCategory)) return null;
    shipping.customsCategory = v.customsCategory as CustomsCategory;
  }

  const stringFields: (keyof ProductShipping)[] = ['customsDescription', 'customsCode', 'originCountryCode'];
  for (const field of stringFields) {
    const raw = v[field];
    if (typeof raw === 'string' && raw.trim()) {
      (shipping[field] as string) = raw.trim();
    }
  }

  if (typeof v.internationalEligible === 'boolean') {
    shipping.internationalEligible = v.internationalEligible;
  }

  return Object.keys(shipping).length > 0 ? shipping : undefined;
}

const MAX_CERTIFICATE_FIELD_LENGTH = 1000;
const MAX_CERTIFICATE_TEST_ROWS = 20;
const MAX_CERTIFICATE_IMAGES = 12;
const MAX_CERTIFICATE_INFO_ROWS = 20;
const CERTIFICATE_STRING_FIELDS: (keyof ProductCertificate)[] = [
  'certificateId', 'productName', 'casNumber', 'pubchemCid', 'molecularFormula',
  'molecularWeight', 'storage', 'caution', 'image',
];

// Parses the optional admin-submitted product certificate block. Returns
// undefined if absent, null if present but malformed (caller should reject
// the save). All text fields are typed by the admin from the real document.
// Nothing here is auto-generated.
export function parseCertificateInput(value: unknown): ProductCertificate | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;

  const fields: Partial<Record<keyof ProductCertificate, string>> = {};
  for (const field of CERTIFICATE_STRING_FIELDS) {
    const raw = v[field];
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_CERTIFICATE_FIELD_LENGTH) return null;
    fields[field] = trimmed;
  }

  const testRows: CertificateTestRow[] = [];
  if (Array.isArray(v.testRows)) {
    if (v.testRows.length > MAX_CERTIFICATE_TEST_ROWS) return null;
    for (const entry of v.testRows) {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const test = typeof e.test === 'string' ? e.test.trim() : '';
      const specification = typeof e.specification === 'string' ? e.specification.trim() : '';
      const result = typeof e.result === 'string' ? e.result.trim() : '';
      if (!test && !specification && !result) continue;
      if (
        test.length > MAX_CERTIFICATE_FIELD_LENGTH ||
        specification.length > MAX_CERTIFICATE_FIELD_LENGTH ||
        result.length > MAX_CERTIFICATE_FIELD_LENGTH
      ) return null;
      testRows.push({ test, specification, result });
    }
  } else if (v.testRows !== undefined) {
    return null;
  }

  function parseInfoRows(raw: unknown): CertificateInfoRow[] | null {
    const rows: CertificateInfoRow[] = [];
    if (!Array.isArray(raw)) return raw !== undefined ? null : rows;
    if (raw.length > MAX_CERTIFICATE_INFO_ROWS) return null;
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const label = typeof e.label === 'string' ? e.label.trim() : '';
      const rowValue = typeof e.value === 'string' ? e.value.trim() : '';
      if (!label && !rowValue) continue;
      if (label.length > MAX_CERTIFICATE_FIELD_LENGTH || rowValue.length > MAX_CERTIFICATE_FIELD_LENGTH) return null;
      rows.push({ label, value: rowValue });
    }
    return rows;
  }

  const verificationSummary = parseInfoRows(v.verificationSummary);
  if (verificationSummary === null) return null;
  const analyticalResults = parseInfoRows(v.analyticalResults);
  if (analyticalResults === null) return null;

  let mode: 'template' | 'external' = 'template';
  if (v.mode === 'external') mode = 'external';
  else if (v.mode !== undefined && v.mode !== 'template') return null;

  const externalImages: string[] = [];
  if (Array.isArray(v.externalImages)) {
    if (v.externalImages.length > MAX_CERTIFICATE_IMAGES) return null;
    for (const entry of v.externalImages) {
      if (typeof entry !== 'string') return null;
      const trimmed = entry.trim();
      if (!trimmed) continue;
      if (trimmed.length > MAX_CERTIFICATE_FIELD_LENGTH) return null;
      externalImages.push(trimmed);
    }
  } else if (v.externalImages !== undefined) {
    return null;
  }

  const enabled = v.enabled === true;
  if (enabled && mode === 'template' && !fields.certificateId) return null;
  if (enabled && mode === 'external' && externalImages.length === 0) return null;

  // Optional Certificate Filler workflow status (see ProductCertificate.fillerStatus).
  let fillerStatus: CertificateFillerStatus | undefined;
  if (v.fillerStatus !== undefined && v.fillerStatus !== null && v.fillerStatus !== '') {
    if (typeof v.fillerStatus !== 'string' || !(CERTIFICATE_FILLER_STATUSES as readonly string[]).includes(v.fillerStatus)) return null;
    fillerStatus = v.fillerStatus as CertificateFillerStatus;
  }

  return {
    enabled,
    certificateId: fields.certificateId ?? '',
    productName: fields.productName,
    casNumber: fields.casNumber,
    pubchemCid: fields.pubchemCid,
    molecularFormula: fields.molecularFormula,
    molecularWeight: fields.molecularWeight,
    storage: fields.storage,
    testRows,
    caution: fields.caution,
    image: fields.image,
    mode: mode === 'external' ? 'external' : undefined,
    externalImages: externalImages.length > 0 ? externalImages : undefined,
    verificationSummary: verificationSummary.length > 0 ? verificationSummary : undefined,
    analyticalResults: analyticalResults.length > 0 ? analyticalResults : undefined,
    fillerStatus,
  };
}

const MAX_PRODUCT_INFO_CONTENT_LENGTH = 5000;

// Parses an optional admin-submitted ProductInfoSection (used for Storage
// Instructions and any future reusable global/override blocks). Returns
// undefined if absent/empty, null if present but malformed (caller should
// reject the save).
export function parseProductInfoSectionInput(value: unknown): ProductInfoSection | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;

  let mode: ProductInfoMode | undefined;
  if (typeof v.mode === 'string' && v.mode) {
    if (!(PRODUCT_INFO_MODES as readonly string[]).includes(v.mode)) return null;
    mode = v.mode === 'global' ? undefined : (v.mode as ProductInfoMode);
  } else if (v.mode !== undefined && v.mode !== null) {
    return null;
  }

  let format: 'html' | 'markdown' | undefined;
  if (typeof v.format === 'string' && v.format) {
    if (v.format !== 'html' && v.format !== 'markdown') return null;
    format = v.format === 'markdown' ? 'markdown' : undefined;
  } else if (v.format !== undefined && v.format !== null) {
    return null;
  }

  let content: string | undefined;
  if (v.content !== undefined && v.content !== null) {
    if (typeof v.content !== 'string') return null;
    // 'markdown' content is plain lite-markdown source text, not HTML — it's
    // sanitized at render time (markdownLiteToHtml escapes first), not here.
    // Legacy/absent format is real HTML, sanitized on save as before.
    const trimmed = format === 'markdown' ? v.content.trim() : sanitizeRichTextHtml(v.content.trim());
    if (trimmed.length > MAX_PRODUCT_INFO_CONTENT_LENGTH) return null;
    content = trimmed || undefined;
  }

  if (mode === 'custom' && !content) return null;
  if (!mode && !content) return undefined;

  return { mode, content, format: content ? format : undefined };
}

// Validates and normalises an admin-submitted product payload into a well-formed
// Product, or returns null if anything required is missing or malformed. Shared
// by the create and update admin routes so both enforce the same data shape.
export function parseProductInput(value: unknown): Product | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;

  const id = typeof v.id === 'string' ? v.id.trim() : '';
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  const slug = typeof v.slug === 'string' ? v.slug.trim().toLowerCase() : '';
  const shortDescription = typeof v.shortDescription === 'string' ? v.shortDescription.trim() : '';
  let fullDescription = typeof v.fullDescription === 'string' ? v.fullDescription.trim() : '';
  const purity = typeof v.purity === 'string' ? v.purity.trim() : '';
  const badge = typeof v.badge === 'string' && v.badge.trim() ? v.badge.trim() : undefined;
  const isPlaceholder = v.isPlaceholder === true ? true : undefined;
  const newIn = v.newIn === true ? true : undefined;
  const image = typeof v.image === 'string' && v.image.trim() ? v.image.trim() : undefined;
  const brand = typeof v.brand === 'string' && v.brand.trim() ? v.brand.trim() : undefined;
  // Must be carried through: this return is an explicit whitelist, so anything
  // missing here is silently dropped on every save. Without it, an admin edit
  // would strip the assigned shipping description and upsertCustomProduct would
  // hand out a fresh reserve name every time the product was touched — churning
  // the name Royal Mail sees and draining the 30-name pool within weeks.
  const genericName = typeof v.genericName === 'string' && v.genericName.trim() ? v.genericName.trim() : undefined;
  const form = typeof v.form === 'string' && v.form.trim() ? v.form.trim() : undefined;
  const storage = typeof v.storage === 'string' && v.storage.trim() ? v.storage.trim() : undefined;
  const usage = typeof v.usage === 'string' && v.usage.trim() ? v.usage.trim() : undefined;
  const coa = typeof v.coa === 'string' && v.coa.trim() ? v.coa.trim() : undefined;

  if (!id || !name) return null;
  if (!SLUG_PATTERN.test(slug)) return null;

  let fullDescriptionFormat: 'text' | 'html' | 'markdown' | undefined;
  if (typeof v.fullDescriptionFormat === 'string' && v.fullDescriptionFormat) {
    if (v.fullDescriptionFormat !== 'text' && v.fullDescriptionFormat !== 'html' && v.fullDescriptionFormat !== 'markdown') return null;
    fullDescriptionFormat = v.fullDescriptionFormat === 'text' ? undefined : v.fullDescriptionFormat;
  } else if (v.fullDescriptionFormat !== undefined && v.fullDescriptionFormat !== null) {
    return null;
  }
  if (fullDescriptionFormat === 'html') {
    fullDescription = sanitizeRichTextHtml(fullDescription);
  }
  // 'markdown' is plain lite-markdown source text, not HTML — sanitized at
  // render time (markdownLiteToHtml escapes first), not here, same as the
  // Site Content policy fields.

  let keywords: string[] | undefined;
  if (Array.isArray(v.keywords)) {
    const list: string[] = [];
    for (const entry of v.keywords) {
      if (typeof entry !== 'string') return null;
      const trimmed = entry.trim().toLowerCase();
      if (!trimmed || trimmed.length > 60) return null;
      list.push(trimmed);
    }
    keywords = list.length > 0 ? list : undefined;
  } else if (v.keywords !== undefined) {
    return null;
  }

  let availability: AvailabilityStatus | undefined;
  if (typeof v.availability === 'string' && v.availability) {
    if (!(AVAILABILITY_STATUSES as readonly string[]).includes(v.availability)) return null;
    availability = v.availability === 'available' ? undefined : (v.availability as AvailabilityStatus);
  } else if (v.availability !== undefined && v.availability !== null) {
    return null;
  }

  if (!Array.isArray(v.categories)) return null;
  const categories: Category[] = [];
  for (const entry of v.categories) {
    if (typeof entry !== 'string') return null;
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > 60) return null;
    categories.push(trimmed);
  }

  if (!Array.isArray(v.variants) || v.variants.length === 0) return null;
  const variants: ProductVariant[] = [];
  for (const entry of v.variants) {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    const dosage = typeof e.dosage === 'string' ? e.dosage.trim() : '';
    const price = Number(e.price);
    if (!dosage || !Number.isFinite(price) || price < 0 || price > MAX_VARIANT_PRICE) return null;
    const enabled = e.enabled !== false;
    const variantShipping = parseShippingInput(e.shipping);
    if (variantShipping === null) return null;
    const variantImage = typeof e.image === 'string' && e.image.trim() ? e.image.trim() : undefined;
    // Per-size certificate. null = malformed, so reject the product;
    // undefined = none set for this size (falls back to the product-level cert).
    const variantCertificate = parseCertificateInput(e.certificate);
    if (variantCertificate === null) return null;
    variants.push({ dosage, price: roundMoney(price), enabled, shipping: variantShipping, image: variantImage, certificate: variantCertificate });
  }

  let hiddenSpecs: SpecRowKey[] | undefined;
  if (Array.isArray(v.hiddenSpecs)) {
    const list: SpecRowKey[] = [];
    for (const entry of v.hiddenSpecs) {
      if (typeof entry !== 'string' || !(SPEC_ROW_KEYS as readonly string[]).includes(entry)) return null;
      if (!list.includes(entry as SpecRowKey)) list.push(entry as SpecRowKey);
    }
    hiddenSpecs = list.length > 0 ? list : undefined;
  } else if (v.hiddenSpecs !== undefined && v.hiddenSpecs !== null) {
    return null;
  }

  const shipping = parseShippingInput(v.shipping);
  if (shipping === null) return null;

  const certificate = parseCertificateInput(v.certificate);
  if (certificate === null) return null;

  const storageInstructions = parseProductInfoSectionInput(v.storageInstructions);
  if (storageInstructions === null) return null;

  return {
    id,
    name,
    slug,
    categories,
    shortDescription: shortDescription || undefined,
    fullDescription: fullDescription || undefined,
    fullDescriptionFormat,
    purity: purity || undefined,
    variants,
    badge,
    isPlaceholder,
    image,
    shipping,
    brand,
    genericName,
    keywords,
    availability,
    newIn,
    form,
    storage,
    usage,
    coa,
    hiddenSpecs,
    certificate,
    storageInstructions,
  };
}
