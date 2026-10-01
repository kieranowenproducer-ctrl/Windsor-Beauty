// The product shape: its types, its fixed lists, and the small pure helpers
// that read a product. Lifted verbatim out of products.ts on 2026-08-11 so
// that file is the catalogue and nothing else. Re-exported from
// '@/data/products', so no importing file changed.

export interface ProductVariant {
  dosage: string;
  price: number;
  /** Defaults to true when absent. Disabled variants are hidden from the storefront. */
  enabled?: boolean;
  /** Per-variant shipping override. Falls back to product.shipping, then global shipping settings, when absent. */
  shipping?: ProductShipping;
  /** Per-variant product photo. Falls back to product.image, then /images/products/{slug}.jpg, when absent. */
  image?: string;
  /**
   * Per-dosage Certificate of Analysis. A COA is per product PER dosage — each
   * dosage is a separate batch with its own lab report. When set, this is the
   * certificate for THIS dosage; when absent, the product-level
   * `product.certificate` is used as the fallback (so existing single-certificate
   * products keep working unchanged). Use `certificateForDosage()` to resolve it.
   */
  certificate?: ProductCertificate;
}

// Variants the storefront should offer. Falls back to all variants if every
// one has been disabled, so a product never silently disappears.
export function activeVariants(product: Product): ProductVariant[] {
  const active = product.variants.filter(v => v.enabled !== false);
  const sorted = sortVariantsByStrength(active);
  return sorted.length > 0 ? sorted : sortVariantsByStrength(product.variants);
}

// Orders variants lowest-strength-first (e.g. 5mg before 10mg, 30mg before
// 60mg) using the numeric amount in each dosage label, not alphabetical
// order — so "10mg" sorts after "5mg" rather than before it.
export function sortVariantsByStrength(variants: ProductVariant[]): ProductVariant[] {
  return [...variants].sort((a, b) => parseFloat(a.dosage) - parseFloat(b.dosage));
}

// Resolve the Certificate of Analysis for a specific dosage (Option A). A COA is
// per product per dosage: prefer the certificate stored on that dosage's variant,
// and fall back to the product-level certificate when the variant has none — so a
// product that has only ever had one shared certificate keeps showing it on every
// dosage exactly as before, and a product with per-dosage COAs shows the right one.
export function certificateForDosage(product: Product, dosage?: string): ProductCertificate | undefined {
  if (dosage) {
    const variant = product.variants.find(v => v.dosage === dosage);
    if (variant?.certificate) return variant.certificate;
  }
  return product.certificate;
}

// True when this product keeps a distinct certificate on at least one dosage —
// i.e. it uses the per-dosage model rather than a single shared certificate.
export function hasPerDosageCertificates(product: Product): boolean {
  return product.variants.some(v => Boolean(v.certificate));
}

// The thumbnail shown on shop/category cards before a customer clicks in.
// For multi-dosage products with per-variant photos (e.g. pre-dosed pens),
// shows the largest-dosage variant's image — the more premium option —
// rather than always defaulting to the product image or first variant.
export function cardImage(product: Product): string | undefined {
  const withImages = activeVariants(product).filter(v => v.image);
  if (withImages.length === 0) return product.image;
  return withImages.reduce((largest, v) =>
    parseFloat(v.dosage) > parseFloat(largest.dosage) ? v : largest
  ).image;
}

// Catalogue categories, in the order they should appear across the shop, header
// navigation, and admin panel. Products may belong to any combination of these.
export const ALL_CATEGORIES = [
  'Fat Loss',
  'Hormone / Reproductive',
  'Brain / Mood / Cognitive',
  'Tanning',
  'Beauty / Healing / Repair / Recovery',
  'Muscle / Growth',
  'Immune System',
  'Cardiovascular',
  'Sleep & Relaxation',
  'Sexual Health & Libido',
  'Pens',
  'BAC Water',
  'Peptides',
] as const;
// The initial seed list for category_settings — the admin panel can create,
// rename, reorder, and delete categories at runtime, so this is no longer the
// exhaustive set. A category is just a string.
export type Category = string;

// Royal Mail Click & Drop package format identifiers (lowercase, per the v1 API).
export const PACKAGE_FORMATS = [
  'letter', 'largeLetter', 'smallParcel', 'mediumParcel', 'largeParcel', 'parcel', 'documents',
] as const;
export type PackageFormat = typeof PACKAGE_FORMATS[number];

// Royal Mail customs declaration categories (CN22/CN23, international only).
export const CUSTOMS_CATEGORIES = [
  'none', 'gift', 'commercialSample', 'documents', 'other',
  'returnedGoods', 'commercialSaleOfGoods', 'eCommerceSaleOfGoods',
] as const;
export type CustomsCategory = typeof CUSTOMS_CATEGORIES[number];

// Shipping services offered at checkout / used for Royal Mail label creation.
export const SHIPPING_SERVICES = ['uk-standard', 'uk-express', 'international'] as const;
export type ShippingService = typeof SHIPPING_SERVICES[number];

// Per-product shipping data used to calculate Royal Mail parcel weight/format
// and (for international orders) populate customs declarations. All fields
// are optional — missing values fall back to the global shipping settings.
export interface ProductShipping {
  /** Weight of one unit of this product (the item itself, not packaging), in grams. */
  weightGrams?: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  /** Royal Mail package format for a parcel containing this product. */
  packageFormat?: PackageFormat;
  /** Default Royal Mail service to preselect when shipping orders containing this product. */
  defaultService?: ShippingService;
  /** Customs description for CN22/CN23 (international shipments). */
  customsDescription?: string;
  /** Commodity / HS code for customs declarations. */
  customsCode?: string;
  /** ISO country code this product originates from, for customs declarations. */
  originCountryCode?: string;
  customsCategory?: CustomsCategory;
  /** False disables international label creation for orders containing this product. */
  internationalEligible?: boolean;
}

// Admin-controlled availability status, independent of the numeric stock
// count. "available" (the default when absent) follows normal stock rules;
// "out_of_stock" and "coming_soon" both block ordering without touching the
// stock number underneath. See effectiveAvailability/isOrderable below.
export const AVAILABILITY_STATUSES = ['available', 'out_of_stock', 'coming_soon'] as const;
export type AvailabilityStatus = typeof AVAILABILITY_STATUSES[number];

// The Form/Storage/Usage/CoA rows of the product specs block, each of which
// can be individually hidden via Product.hiddenSpecs. Purity is not included
// here — it's a required core field and always shown.
export const SPEC_ROW_KEYS = ['form', 'storage', 'usage', 'coa'] as const;
export type SpecRowKey = typeof SPEC_ROW_KEYS[number];

export interface Product {
  id: string;
  name: string;
  slug: string;
  /** All catalogue categories this product belongs to. categories[0] is treated as the primary label. */
  /** Optional — products can have zero categories (won't appear under any category filter, but still shows under "All"). */
  categories: Category[];
  /** Optional — omitted entirely from the storefront when blank. */
  shortDescription?: string;
  /** Optional — omitted entirely from the storefront when blank. */
  fullDescription?: string;
  /** When 'html', fullDescription is sanitized rich text (legacy Tiptap editor) and renders via RichTextContent. When 'markdown', fullDescription is plain lite-markdown source text (see src/lib/markdownLite.ts) rendered via markdownLiteToHtml + RichTextContent. Defaults to plain text. */
  fullDescriptionFormat?: 'text' | 'html' | 'markdown';
  /** Optional — the "Purity" badge/spec row is omitted entirely when blank. */
  purity?: string;
  variants: ProductVariant[];
  badge?: string;
  inStock?: boolean;
  /** Marks a placeholder listing awaiting final copy, pricing and photography from the client */
  isPlaceholder?: boolean;
  /** Full URL to an uploaded product photo (Vercel Blob). When absent, the storefront falls back to /images/products/{slug}.jpg */
  image?: string;
  /** Weight, dimensions, package format and customs data used for Royal Mail label creation. Optional — falls back to global shipping settings when absent. */
  shipping?: ProductShipping;
  /** Brand or pen name shown on the product's packaging, used for display and search. */
  brand?: string;
  /**
   * The bland description sent to third parties (Royal Mail shipment contents,
   * Fena payment line items) INSTEAD of `name` — real product names must never
   * reach their systems or logs. See src/lib/genericNames.ts.
   * Optional: when absent it falls back to a category mapping, then to a generic
   * default. It NEVER falls back to the real name. Does NOT affect customs
   * fields (see `shipping.customsDescription`), which must stay accurate.
   */
  genericName?: string;
  /** Extra search terms (aliases, misspellings, related names) — not shown on the storefront, only matched by shop search. */
  keywords?: string[];
  /** Admin-set availability override. Defaults to "available" when absent. */
  availability?: AvailabilityStatus;
  /** Admin-toggled flag shown as a "New In" badge and surfaced in the homepage carousel. */
  newIn?: boolean;
  /** Per-product override for the "Form" row in the product specs block. Falls back to DEFAULT_PRODUCT_SPECS.form when absent. */
  form?: string;
  /** Per-product override for the "Storage" row in the product specs block. Falls back to DEFAULT_PRODUCT_SPECS.storage when absent. */
  storage?: string;
  /** Per-product override for the "Usage" row in the product specs block. Falls back to DEFAULT_PRODUCT_SPECS.usage when absent. */
  usage?: string;
  /** Per-product override for the "CoA" row in the product specs block. Falls back to DEFAULT_PRODUCT_SPECS.coa when absent. */
  coa?: string;
  /** Which rows of the "Product specs" block to omit entirely on this product's page (e.g. ["coa"] to remove the CoA row). */
  hiddenSpecs?: SpecRowKey[];
  /** Admin-editable Certificate of Analysis, shown via a "Show Certificate" button on the product page when enabled. */
  certificate?: ProductCertificate;
  /** Controls the "Storage Instructions" button/popup on the product page. Defaults to the site-wide default content when absent or mode is 'global'. */
  storageInstructions?: ProductInfoSection;
}

// Shared "global default / custom override / hidden" control for reusable
// product information blocks (currently Storage Instructions). 'global'
// (the default when mode is absent) uses the site-wide default content
// edited in the admin Product Defaults panel; 'custom' uses this product's
// own `content`; 'hidden' removes the section/button for this product only.
export const PRODUCT_INFO_MODES = ['global', 'custom', 'hidden'] as const;
export type ProductInfoMode = typeof PRODUCT_INFO_MODES[number];

export interface ProductInfoSection {
  mode?: ProductInfoMode;
  /** Used when mode === 'custom'. Sanitized rich text HTML when format is 'html' (or absent, for rows saved before the lite-markdown editor existed); plain lite-markdown source text (see src/lib/markdownLite.ts) when format is 'markdown'. */
  content?: string;
  /** Defaults to 'html' when absent — preserves rows saved before the lite-markdown editor existed. */
  format?: 'html' | 'markdown';
}

// A single row in the certificate's test results table (e.g. Appearance,
// Purity (HPLC), TFA Content).
export interface CertificateTestRow {
  test: string;
  specification: string;
  result: string;
}

// A single label/value row for the Verification Summary and Analytical
// Results sections — generic rather than typed per-field, so any
// certificate can carry whatever metadata its lab report actually includes
// (e.g. Issue Date, Batch/Lot, Instrument, Main Peak) without the schema
// needing to anticipate every possible field name in advance.
export interface CertificateInfoRow {
  label: string;
  value: string;
}

// Admin-entered Certificate of Analysis data for a single product. All
// fields are filled in manually by the admin from real batch/lab data —
// nothing here is auto-generated.
export interface ProductCertificate {
  /** Shows the "Show Certificate" button on the product page when true. */
  enabled: boolean;
  /** Batch/certificate reference code, e.g. "WG-AM191". */
  certificateId: string;
  /** Defaults to the product's name when absent. */
  productName?: string;
  casNumber?: string;
  pubchemCid?: string;
  molecularFormula?: string;
  molecularWeight?: string;
  /** Defaults to the product's storage spec when absent. */
  storage?: string;
  testRows: CertificateTestRow[];
  /** Defaults to DEFAULT_CERTIFICATE_CAUTION when absent. */
  caution?: string;
  /** Full URL to an uploaded certificate photo (Vercel Blob). Falls back to the product's main image when absent. */
  image?: string;
  /** 'template' (default, omitted) generates the certificate from the fields above. 'external' instead displays the uploaded page images below, in order, leaving every field above unused. */
  mode?: 'template' | 'external';
  /** Ordered Blob URLs for admin-uploaded certificate page images (e.g. a supplier-branded PDF exported as one image per page). Only used when mode is 'external'. */
  externalImages?: string[];
  /** Optional extra section for mass-spec/lab-verification style certificates — e.g. Issue Date, Batch/Lot, Sample, Customer, Instrument. Rendered as its own labelled block between Product Specifications and Test Results, omitted entirely when empty. */
  verificationSummary?: CertificateInfoRow[];
  /** Optional extra section alongside or instead of testRows, for analytical-report fields that don't fit the test/specification/result shape — e.g. Main Peak, Total Peaks, MS Verification, Detection wavelength. Omitted entirely when empty. */
  analyticalResults?: CertificateInfoRow[];
  /**
   * Workflow status set by an admin in the temporary "Certificate Filler" tool
   * (src/app/admin/certificate-filler/). It records whether a human has checked
   * and finished this certificate — separate from `enabled` (show-on-site) and
   * from the auto-derived "how full are the fields" state. Purely internal: the
   * storefront CertificateModal never reads or renders it. Safe to leave in place
   * or drop when the Certificate Filler feature is removed.
   */
  fillerStatus?: CertificateFillerStatus;
}

// Manual completion states an admin can set per certificate in the Certificate
// Filler. Absent = no manual state yet (the tool auto-derives not-started /
// in-progress / missing-info from the field contents instead).
export const CERTIFICATE_FILLER_STATUSES = ['in_progress', 'needs_review', 'complete', 'blocked'] as const;
export type CertificateFillerStatus = typeof CERTIFICATE_FILLER_STATUSES[number];

// Default research-use caution shown on the certificate when no per-product
// override is set, consistent with the disclaimer on the product page.
export const DEFAULT_CERTIFICATE_CAUTION =
  'All compounds sold by Windsor Glow are strictly intended for in vitro scientific research and laboratory use by qualified professionals. They are not approved for therapeutic, diagnostic, or any other use in humans or animals.';

// Built-in fallback content for the "Storage Instructions" popup, used when
// no admin override exists in the database yet (e.g. before the global
// default has been saved for the first time, or when running without a
// database configured). Admin-edited content (global or per-product) takes
// precedence over this.
export const DEFAULT_STORAGE_INSTRUCTIONS_HTML = `<p>Store unopened products refrigerated at 2-8&deg;C for short and medium-term storage. For long-term storage (beyond 60 days), keep at -20&deg;C or colder.</p><p>Protect from direct light and avoid temperatures above 25&deg;C. Products supplied as lyophilised powder in sealed vials are stable at room temperature for short periods (sufficient for tracked shipping) without compromising integrity. On receipt, transfer to refrigerated storage immediately.</p><p>Pre-mixed pen products should be kept refrigerated at 2-8&deg;C at all times after receipt. Do not freeze pen-format products, as freezing compromises the pre-mixed solution.</p>`;

// Plain-prose, lite-markdown-ready equivalent of the HTML default above —
// used only to pre-populate the admin's MarkdownLiteEditor textarea before
// any saved override has loaded (or exists). The public storefront fallback
// always stays on the HTML constant above; this one never needs to change.
export const DEFAULT_STORAGE_INSTRUCTIONS_MARKDOWN = `Store unopened products refrigerated at 2-8°C for short and medium-term storage. For long-term storage (beyond 60 days), keep at -20°C or colder.

Protect from direct light and avoid temperatures above 25°C. Products supplied as lyophilised powder in sealed vials are stable at room temperature for short periods (sufficient for tracked shipping) without compromising integrity. On receipt, transfer to refrigerated storage immediately.

Pre-mixed pen products should be kept refrigerated at 2-8°C at all times after receipt. Do not freeze pen-format products, as freezing compromises the pre-mixed solution.`;

// Fallback text for the product specs block (src/app/shop/[slug]/page.tsx)
// when a product has no per-product override for that row.
export const DEFAULT_PRODUCT_SPECS = {
  form: 'Lyophilised powder',
  storage: 'Store at -20°C. Protect from light.',
  usage: 'For research use only. Not for human consumption.',
  coa: 'Certificate of analysis included with every order.',
};

// The "Product specs" rows shown on a product page — purity always comes
// from the product itself, the rest fall back to DEFAULT_PRODUCT_SPECS
// unless an admin has set a per-product override.
export function productSpecs(product: Product): { label: string; value: string }[] {
  const hidden = product.hiddenSpecs ?? [];
  const rows: { key?: SpecRowKey; label: string; value: string }[] = [
    ...(product.purity ? [{ label: 'Purity', value: product.purity }] : []),
    { key: 'form', label: 'Form', value: product.form ?? DEFAULT_PRODUCT_SPECS.form },
    { key: 'storage', label: 'Storage', value: product.storage ?? DEFAULT_PRODUCT_SPECS.storage },
    { key: 'usage', label: 'Usage', value: product.usage ?? DEFAULT_PRODUCT_SPECS.usage },
    { key: 'coa', label: 'CoA', value: product.coa ?? DEFAULT_PRODUCT_SPECS.coa },
  ];
  return rows
    .filter((row) => !row.key || !hidden.includes(row.key))
    .map(({ label, value }) => ({ label, value }));
}

// Out-of-stock/coming-soon status takes precedence over the numeric stock
// count, but a zero stock count also counts as out of stock even when no
// status has been set — combines both signals into one source of truth for
// the storefront and checkout.
export function effectiveAvailability(product: Product, stock?: number): AvailabilityStatus {
  if (product.availability === 'coming_soon') return 'coming_soon';
  if (product.availability === 'out_of_stock') return 'out_of_stock';
  if (typeof stock === 'number' && stock <= 0) return 'out_of_stock';
  return 'available';
}

export function isOrderable(product: Product, stock?: number): boolean {
  return effectiveAvailability(product, stock) === 'available';
}

// ─── Per-dosage sold-out rules ─────────────────────────────────────────────
// Stock is counted per dosage, so "sold out" is a question about a strength,
// not about a product. These two are the single definition of that, shared by
// the product page and the product card: the opening dosage, the dosage chip,
// the Add button and the stamp across the photo all read from here, so none of
// them can tell a customer something another one denies.
//
// `variantStock` is one product's dosage -> quantity map (from
// getProductVariantStockMap). A dosage with no entry is untracked, which has
// always meant unlimited here, so a strength nobody has counted yet stays
// buyable rather than silently reading as gone.

export function dosageSoldOut(
  product: Product,
  variantStock: Record<string, number> | undefined,
  dosage: string,
): boolean {
  if (product.availability === 'coming_soon') return false;
  // An admin marking the whole product out of stock is a deliberate statement
  // about the product, and outranks any per-dosage number.
  if (product.availability === 'out_of_stock') return true;
  const quantity = variantStock?.[dosage];
  return typeof quantity === 'number' && quantity <= 0;
}

// True only when there is genuinely nothing left of this product to buy, in
// any strength. This is what the OUT OF STOCK stamp across the product
// photograph is allowed to speak for: one dosage running out says nothing
// about the photo, because the other strengths are still there.
export function allDosagesSoldOut(
  product: Product,
  variantStock: Record<string, number> | undefined,
): boolean {
  const variants = activeVariants(product);
  return variants.length > 0 && variants.every((v) => dosageSoldOut(product, variantStock, v.dosage));
}

// Flattened, lowercased text used for shop search — covers everything the
// brief asks for (name, brand, description, category, dosage, aliases)
// without the search filter needing to know the product shape.
export function searchableText(product: Product): string {
  return [
    product.name,
    product.brand,
    product.shortDescription,
    product.fullDescription,
    ...product.categories,
    ...(product.keywords ?? []),
    ...product.variants.map((v) => v.dosage),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

// Pens and vials have meaningfully different parcel weights/dimensions, so
// bulk shipping tools split products into these two physical formats. Read
// from the description/name rather than the "Pens" category tag, since that
// tag can be missed on a new listing — this stays correct even if it is.
const PEN_WORD_RE = /\bpens?\b/i;
export function detectProductFormat(product: Pick<Product, 'name' | 'shortDescription' | 'fullDescription'>): 'pen' | 'vial' {
  const text = `${product.name} ${product.shortDescription ?? ''} ${product.fullDescription ?? ''}`;
  return PEN_WORD_RE.test(text) ? 'pen' : 'vial';
}

// Pre multi-category rework, custom_products rows were saved with a single
// `category` ('Peptides' | 'Pens' | 'Bac Water') plus an optional peptide-only
// `subcategory`. Map those onto the new categories[] taxonomy so admin
// overrides saved before this change don't crash the storefront.
const LEGACY_CATEGORY_MAP: Record<string, Category> = {
  Peptides: 'Peptides',
  Pens: 'Pens',
  'Bac Water': 'BAC Water',
};
const LEGACY_SUBCATEGORY_MAP: Record<string, Category> = {
  'Fat Loss': 'Fat Loss',
  Performance: 'Muscle / Growth',
  Recovery: 'Beauty / Healing / Repair / Recovery',
  Wellness: 'Sleep & Relaxation',
  Research: 'Brain / Mood / Cognitive',
};

// Normalises a product loaded from the database, filling in `categories`
// from the legacy `category`/`subcategory` fields if it predates them.
function normalizeProduct(product: Product): Product {
  if (Array.isArray(product.categories) && product.categories.length > 0) return product;

  const legacy = product as unknown as { category?: string; subcategory?: string };
  const categories: Category[] = [];
  const primary = legacy.category ? LEGACY_CATEGORY_MAP[legacy.category] : undefined;
  categories.push(primary ?? 'Peptides');
  const secondary = legacy.subcategory ? LEGACY_SUBCATEGORY_MAP[legacy.subcategory] : undefined;
  if (secondary && !categories.includes(secondary)) categories.push(secondary);

  return { ...product, categories };
}

// Combines the static catalogue with admin-managed overrides from the database.
// A custom-product slug that matches a static one replaces it in place (an
// edited copy); any other slug is a brand new admin-created listing and is
// appended to the end. Pure function — safe to call from server or client.
export function mergeProducts(base: Product[], overrides: Record<string, Product>): Product[] {
  const normalized: Record<string, Product> = {};
  for (const [slug, product] of Object.entries(overrides)) {
    normalized[slug] = normalizeProduct(product);
  }
  const merged = base.map((product) => normalized[product.slug] ?? product);
  const additions = Object.values(normalized).filter(
    (product) => !base.some((existing) => existing.slug === product.slug)
  );
  return [...merged, ...additions];
}
