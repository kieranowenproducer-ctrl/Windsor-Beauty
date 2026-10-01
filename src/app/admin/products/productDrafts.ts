import { htmlToMarkdownLite } from '@/lib/markdownLite';
import { EMPTY_VARIANT_DRAFT, type VariantDraft } from '@/components/admin/VariantEditor';
import { EMPTY_SHIPPING_DRAFT, type ShippingDraft } from '@/components/admin/ShippingFields';
import { isUntouchedStandardTestRow, isUntouchedStandardSummaryRow } from '@/lib/certificateStandards';
import type {
  ProductCertificate,
  CertificateTestRow,
  CertificateInfoRow,
  ProductInfoSection,
  ProductInfoMode,
  Category,
  AvailabilityStatus,
} from '@/data/products';

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// The admin auth middleware returns a bare 401 with no body context when the
// session cookie has expired — surfacing that raw "Unauthorized" string left
// the admin with no idea what to do. This turns it into an actionable message.
export const SESSION_EXPIRED_MESSAGE = 'Your admin session has expired. Please log in again in another tab, then retry — your changes here are preserved.';

export interface AddProductForm {
  name: string;
  slug: string;
  categories: Category[];
  purity: string;
  badge: string;
  brand: string;
  keywordsInput: string;
  availability: AvailabilityStatus;
  shortDescription: string;
  fullDescription: string;
  isPlaceholder: boolean;
  newIn: boolean;
  variants: VariantDraft[];
  image?: string;
  shipping: ShippingDraft;
}

export const EMPTY_ADD_FORM: AddProductForm = {
  name: '',
  slug: '',
  categories: [],
  purity: '',
  badge: '',
  brand: '',
  keywordsInput: '',
  availability: 'available',
  shortDescription: '',
  fullDescription: '',
  isPlaceholder: false,
  newIn: false,
  variants: [{ ...EMPTY_VARIANT_DRAFT }],
  shipping: EMPTY_SHIPPING_DRAFT,
};

// String-only mirror of ProductCertificate for controlled form inputs —
// converted back to a ProductCertificate (with undefined for blank optional
// fields) when saving.
export interface CertificateDraft {
  enabled: boolean;
  mode: 'template' | 'external';
  certificateId: string;
  productName: string;
  casNumber: string;
  pubchemCid: string;
  molecularFormula: string;
  molecularWeight: string;
  storage: string;
  testRows: CertificateTestRow[];
  caution: string;
  image?: string;
  externalImages: string[];
  verificationSummary: CertificateInfoRow[];
  analyticalResults: CertificateInfoRow[];
}

export const EMPTY_CERTIFICATE_DRAFT: CertificateDraft = {
  enabled: false,
  mode: 'template',
  certificateId: '',
  productName: '',
  casNumber: '',
  pubchemCid: '',
  molecularFormula: '',
  molecularWeight: '',
  storage: '',
  testRows: [],
  caution: '',
  image: undefined,
  externalImages: [],
  verificationSummary: [],
  analyticalResults: [],
};

export function certificateToDraft(certificate: ProductCertificate | undefined): CertificateDraft {
  if (!certificate) return { ...EMPTY_CERTIFICATE_DRAFT, testRows: [], externalImages: [], verificationSummary: [], analyticalResults: [] };
  return {
    enabled: certificate.enabled,
    mode: certificate.mode ?? 'template',
    certificateId: certificate.certificateId,
    productName: certificate.productName ?? '',
    casNumber: certificate.casNumber ?? '',
    pubchemCid: certificate.pubchemCid ?? '',
    molecularFormula: certificate.molecularFormula ?? '',
    molecularWeight: certificate.molecularWeight ?? '',
    storage: certificate.storage ?? '',
    testRows: certificate.testRows.map(row => ({ ...row })),
    caution: certificate.caution ?? '',
    image: certificate.image,
    externalImages: certificate.externalImages ? [...certificate.externalImages] : [],
    verificationSummary: certificate.verificationSummary ? certificate.verificationSummary.map(row => ({ ...row })) : [],
    analyticalResults: certificate.analyticalResults ? certificate.analyticalResults.map(row => ({ ...row })) : [],
  };
}

function nonEmptyInfoRows(rows: CertificateInfoRow[]): CertificateInfoRow[] | undefined {
  const cleaned = rows
    .filter(row => !isUntouchedStandardSummaryRow(row))
    .map(row => ({ label: row.label.trim(), value: row.value.trim() }))
    .filter(row => row.label || row.value);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function certificateDraftToPayload(draft: CertificateDraft): ProductCertificate {
  return {
    enabled: draft.enabled,
    mode: draft.mode === 'external' ? 'external' : undefined,
    certificateId: draft.certificateId.trim(),
    productName: draft.productName.trim() || undefined,
    casNumber: draft.casNumber.trim() || undefined,
    pubchemCid: draft.pubchemCid.trim() || undefined,
    molecularFormula: draft.molecularFormula.trim() || undefined,
    molecularWeight: draft.molecularWeight.trim() || undefined,
    storage: draft.storage.trim() || undefined,
    // The standard rows (Appearance / Purity / Content, and Batch / Test Date
    // in the summary) are shown on every certificate in the editor whether the
    // product has them or not, so the same four never have to be typed out
    // again. A row nobody has actually filled in is dropped here rather than
    // saved: otherwise every product would gain rows that print blank on the
    // customer's certificate, and a dosage with no certificate of its own
    // would stop falling back to the shared one.
    testRows: draft.testRows
      .filter(row => !isUntouchedStandardTestRow(row))
      .map(row => ({ test: row.test.trim(), specification: row.specification.trim(), result: row.result.trim() }))
      .filter(row => row.test || row.specification || row.result),
    caution: draft.caution.trim() || undefined,
    image: draft.image,
    externalImages: draft.externalImages.length > 0 ? draft.externalImages : undefined,
    verificationSummary: nonEmptyInfoRows(draft.verificationSummary),
    analyticalResults: nonEmptyInfoRows(draft.analyticalResults),
  };
}

// A per-dosage certificate is only worth storing when it actually carries content.
// An empty draft (no id, no test rows, no uploaded pages) means "this dosage has no
// certificate of its own" — we store undefined so it falls back to the shared
// product-level certificate rather than persisting a hollow record.
export function certificatePayloadHasContent(cert: ProductCertificate): boolean {
  return Boolean(
    cert.certificateId || cert.testRows.length > 0 || cert.image || (cert.externalImages?.length ?? 0) > 0
  );
}

// String-only mirror of ProductInfoSection for controlled form inputs.
// `mode` defaults to 'global' (use the site-wide default from Product
// Defaults) when the product has no override saved.
// `content` is always lite-markdown source text in this draft — the editor
// only ever shows/edits markdown, regardless of what format the saved
// ProductInfoSection was in (see storageInstructionsToDraft's conversion).
export interface ProductInfoDraft {
  mode: ProductInfoMode;
  content: string;
}

export const EMPTY_STORAGE_INSTRUCTIONS_DRAFT: ProductInfoDraft = {
  mode: 'global',
  content: '',
};

export function storageInstructionsToDraft(section: ProductInfoSection | undefined): ProductInfoDraft {
  if (!section) return { ...EMPTY_STORAGE_INSTRUCTIONS_DRAFT };
  const rawContent = section.content ?? '';
  // One-time, display-only conversion for legacy/absent format (real HTML,
  // saved before the lite-markdown editor existed) — same pattern as the
  // Site Content/About editors. Already-'markdown' content is used as-is.
  const content = section.format === 'markdown' ? rawContent : htmlToMarkdownLite(rawContent);
  return {
    mode: section.mode ?? 'global',
    content,
  };
}

export function storageInstructionsDraftToPayload(draft: ProductInfoDraft): ProductInfoSection | undefined {
  if (draft.mode === 'hidden') return { mode: 'hidden' };
  if (draft.mode === 'custom') return draft.content.trim() ? { mode: 'custom', content: draft.content, format: 'markdown' } : undefined;
  return undefined;
}

export function parseKeywordsInput(value: string): string[] | undefined {
  const list = value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

export function toggleCategoryIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(c => c !== value) : [...list, value];
}
