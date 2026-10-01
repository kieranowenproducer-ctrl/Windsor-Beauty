// Optional reference details for the on-certificate editor
// (src/app/admin/certificate-filler/). A product listed here gets guidance text
// and suggested placeholder wording when staff type its certificate. It is
// used ONLY as a starting suggestion for blank boxes; it never overwrites
// anything already entered, and it never holds a batch number, a date or a
// result. Those come from the real certificate and are typed by hand.
//
// The table is deliberately EMPTY. This shop sells skincare, and no skincare
// product has reference details on file. Never fill it with guessed values:
// add an entry only when the owner supplies the real, published details for a
// product. Everything that reads this table copes with it being empty.

// The kinds are kept as they were so stored data and the editor's callers
// still compile. Nothing in the shop is currently assigned one.
export type CertRefKind =
  | 'peptide' | 'protein' | 'small-molecule' | 'copper-peptide'
  | 'blend' | 'water' | 'pen-external' | 'other';

export interface CertReference {
  kind: CertRefKind;
  cas?: string;
  formula?: string;
  mw?: string;
  cid?: string;
  storage?: string;
  /** Fields whose confirmed value is uncertain: left blank, hint shown as guidance. */
  verify?: Partial<Record<'cas' | 'formula' | 'mw' | 'cid', string>>;
  /** Extra guidance shown to the admin. */
  note?: string;
}

// The name is historic. It is the shop's ordinary storage line, the same
// wording as DEFAULT_PRODUCT_SPECS.storage in src/data/productModel.ts.
export const DEFAULT_STORAGE_LYO =
  'Store in a cool, dry place away from direct sunlight.';

// Keyed by product slug. Empty on purpose, see the note at the top.
export const CERT_REFERENCE: Record<string, CertReference> = {};

// Historic helper, kept so anything that calls it still compiles. No product
// in this shop is singled out by its slug, so the answer is always no.
export function isExternalPenSlug(slug: string): boolean {
  return slug in CERT_REFERENCE && CERT_REFERENCE[slug].kind === 'pen-external';
}

export function referenceFor(slug: string): CertReference | undefined {
  return CERT_REFERENCE[slug];
}

// Suggests a certificate number that is unique per size. Prefers an existing
// recognisable base and appends a size token so 30ml and 50ml differ; falls
// back to a code made from the slug when there is no base yet. Purely a
// suggestion: the admin can overwrite it, and uniqueness is checked live.
export function doseToken(dose: string): string {
  return dose.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'STD';
}
export function slugCode(slug: string): string {
  return slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}
export function suggestCertNumber(base: string | undefined, slug: string, dose: string): string {
  const token = doseToken(dose);
  if (base && base.trim()) {
    const b = base.trim();
    // do not append twice if the base already ends with this size token
    return b.toUpperCase().endsWith(token) ? b : `${b}-${token}`;
  }
  return `WB-${slugCode(slug)}-${token}`;
}
