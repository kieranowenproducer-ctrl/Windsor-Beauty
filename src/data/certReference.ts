// Objective reference data for the temporary Certificate Filler
// (src/app/admin/certificate-filler/). This is PUBLISHED chemistry only — CAS
// number, molecular formula, molecular weight, PubChem CID, and a sensible
// default storage line. It is used ONLY to pre-fill BLANK identity fields as a
// starting suggestion; it never overwrites data already entered, and it never
// contains a measured/batch value (purity result, content, batch/lot, test
// date) — those are the lab's, entered by hand.
//
// `verify` holds fields where a single confirmed value could not be pinned down
// reliably (form-dependent salts, PEG conjugates, large proteins, disputed
// CIDs). Those fields are left BLANK in the tool and the hint is shown as
// guidance so the admin enters the confirmed value from the real COA/PubChem.
//
// To remove the whole Certificate Filler feature: delete this file,
// src/app/admin/certificate-filler/, and the sidebar link (search "Certificate Filler").

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
  /** Extra guidance shown to the admin (blend composition, protein note, source). */
  note?: string;
}

export const DEFAULT_STORAGE_LYO =
  'Store lyophilised powder at -20°C, protected from light, for long-term storage; 2-8°C for short-term. Once reconstituted, store at 2-8°C and use within weeks.';

// Keyed by product slug. Only products that need help (missing / shared / to
// confirm) are listed — products whose certificate is already complete load
// their own stored data and need no reference here.
export const CERT_REFERENCE: Record<string, CertReference> = {
  // ── single peptides, objective data well-established (still "confirm before printing") ──
  'ara-290': { kind: 'peptide', cas: '1208243-50-8', formula: 'C51H84N16O21', mw: '1257.4 g/mol', cid: '91810664', storage: DEFAULT_STORAGE_LYO },
  'ghrp-2': { kind: 'peptide', cas: '158861-67-7', formula: 'C45H55N9O6', mw: '817.99 g/mol', cid: '6918245', storage: DEFAULT_STORAGE_LYO },
  'ghrp-6': { kind: 'peptide', cas: '87616-84-0', formula: 'C46H56N12O6', mw: '872.0 g/mol', cid: '4345065', storage: DEFAULT_STORAGE_LYO },
  'hexarelin': { kind: 'peptide', cas: '140703-51-1', formula: 'C47H58N12O6', mw: '887.04 g/mol', cid: '6918297', storage: DEFAULT_STORAGE_LYO },
  'ipamorelin': { kind: 'peptide', cas: '170851-70-4', formula: 'C38H49N9O5', mw: '711.85 g/mol', cid: '9831659', storage: DEFAULT_STORAGE_LYO },
  'melanotan-i': { kind: 'peptide', cas: '75921-69-6', formula: 'C78H111N21O19', mw: '1646.9 g/mol', cid: '16197727', storage: DEFAULT_STORAGE_LYO },
  'sermorelin': { kind: 'peptide', cas: '86168-78-7', formula: 'C149H246N44O42S', mw: '3357.9 g/mol', cid: '16132413', storage: DEFAULT_STORAGE_LYO },
  'semaglutide': { kind: 'peptide', cas: '910463-68-2', formula: 'C187H291N45O59', mw: '4113.58 g/mol', cid: '56843331', storage: DEFAULT_STORAGE_LYO },
  'gonadorelin': { kind: 'peptide', cas: '33515-09-2', formula: 'C55H75N17O13', mw: '1182.31 g/mol', cid: '638793', storage: DEFAULT_STORAGE_LYO },
  'triptorelin': { kind: 'peptide', cas: '57773-63-4', formula: 'C64H82N18O13', mw: '1311.45 g/mol', cid: '25074470', storage: DEFAULT_STORAGE_LYO },
  'thymosin-alpha-1': { kind: 'peptide', cas: '62304-98-7', formula: 'C129H215N33O55', mw: '3108.29 g/mol', cid: '16130571', storage: DEFAULT_STORAGE_LYO },
  'kisspeptin-54': { kind: 'peptide', cas: '374675-21-5', storage: DEFAULT_STORAGE_LYO,
    verify: { formula: 'Long 54-aa peptide — confirm exact formula from your COA (values differ by salt form)', mw: '≈ 5857 g/mol — confirm', cid: 'No stable PubChem CID under this name — confirm or leave blank' } },

  // ── objective data with a real caveat: confirm the exact form ──
  'b7-33': { kind: 'peptide', cas: '1818415-56-3', formula: 'C131H229N41O36S', mw: '2986.58 g/mol', storage: DEFAULT_STORAGE_LYO,
    verify: { cid: 'Confirm the PubChem CID before printing (vendor-cited CIDs vary)' } },
  'ahk-cu': { kind: 'copper-peptide', cas: '682809-81-0', cid: '168431292', storage: DEFAULT_STORAGE_LYO,
    verify: { formula: 'Copper complex — formula depends on salt/hydration form; confirm from your COA', mw: 'Form-dependent (anhydrous Cu complex ≈ 417 g/mol) — confirm' } },
  'cjc-1295': { kind: 'peptide', storage: DEFAULT_STORAGE_LYO,
    verify: {
      cas: 'Confirm which form: WITH-DAC = 863288-34-0, WITHOUT-DAC (Mod GRF 1-29) = 863288-34-0/other — check your COA',
      formula: 'with-DAC ≈ C165H269N47O46 / no-DAC ≈ C152H252N44O42 — confirm the form you sell',
      mw: 'with-DAC ≈ 3647 g/mol / no-DAC ≈ 3368 g/mol — confirm',
      cid: 'Differs by form — confirm on PubChem',
    } },

  // ── proteins / conjugates: no single small-molecule entry ──
  'follistatin-315': { kind: 'protein', formula: 'Recombinant protein (315 aa)', mw: '≈ 34.7 kDa', storage: DEFAULT_STORAGE_LYO,
    verify: { cas: 'No reliable small-molecule CAS (protein) — leave blank or use your supplier reference', cid: 'None (protein) — UniProt P19883' } },
  'follistatin-344': { kind: 'protein', formula: 'Recombinant protein (344 aa)', mw: '≈ 38 kDa', storage: DEFAULT_STORAGE_LYO,
    verify: { cas: 'No reliable small-molecule CAS (protein) — leave blank or use your supplier reference', cid: 'None (protein) — UniProt P19883' } },
  'igf-1-des': { kind: 'protein', formula: 'Recombinant protein (67 aa)', mw: '7371.4 Da', storage: DEFAULT_STORAGE_LYO,
    verify: { cas: 'Vendor CAS values inconsistent — confirm from your COA', cid: 'None (protein) — parent UniProt P05019' } },
  'igf-1-lr3': { kind: 'protein', formula: 'Recombinant protein (83 aa)', mw: '≈ 9100 Da', storage: DEFAULT_STORAGE_LYO,
    verify: { cas: 'Vendor CAS values inconsistent — confirm from your COA', cid: 'None (protein) — parent UniProt P05019' } },
  'mgf': { kind: 'peptide', storage: DEFAULT_STORAGE_LYO,
    verify: { cas: 'Vendor-cited 116541-27-4 is not in PubChem — confirm', formula: 'Synthetic 24-aa E-peptide ≈ C121H200N42O39 — confirm', mw: '≈ 2867 Da — confirm', cid: 'None found — confirm or leave blank' } },
  'peg-mgf': { kind: 'peptide', storage: DEFAULT_STORAGE_LYO,
    verify: { cas: 'PEG conjugate — no single reliable CAS; confirm', formula: 'PEG conjugate — no single formula', mw: 'PEG polymer — no single MW (core peptide ≈ 2867 Da + PEG)', cid: 'None' } },
  'll-37': { kind: 'protein', cas: '154947-66-7', storage: DEFAULT_STORAGE_LYO,
    verify: { formula: '37-aa cathelicidin — confirm exact formula from your COA', mw: '≈ 4493 g/mol — confirm', cid: 'None (peptide) — confirm or leave blank' } },
  'hgh-fragment-176-191': { kind: 'peptide', cas: '66004-57-7', storage: DEFAULT_STORAGE_LYO,
    verify: { formula: 'Confirm exact formula from your COA (values vary by salt form)', mw: '≈ 1817 g/mol — confirm', cid: 'Confirm on PubChem or leave blank' } },

  // ── obscure / modified compounds: confirm everything from your supplier COA ──
  'n-acetyl-semax-amidate': { kind: 'peptide', storage: DEFAULT_STORAGE_LYO,
    verify: { cas: 'Confirm from your supplier COA', formula: 'Modified Semax analogue — confirm from your COA', mw: 'Confirm from your COA', cid: 'Confirm or leave blank' } },
  'dihexa': { kind: 'small-molecule', storage: DEFAULT_STORAGE_LYO,
    verify: { cas: 'Confirm from your supplier COA', formula: 'Confirm from your COA', mw: 'Confirm from your COA', cid: 'Confirm on PubChem' } },
  'pinealon': { kind: 'peptide', storage: DEFAULT_STORAGE_LYO,
    verify: { cas: 'Confirm from your supplier COA', formula: 'Tripeptide (Glu-Asp-Arg) — confirm from your COA', mw: 'Confirm from your COA', cid: 'Confirm or leave blank' } },
  'vesugen': { kind: 'peptide', storage: DEFAULT_STORAGE_LYO,
    verify: { cas: 'Confirm from your supplier COA', formula: 'Tripeptide (Lys-Glu-Asp) — confirm from your COA', mw: 'Confirm from your COA', cid: 'Confirm or leave blank' } },

  // ── shared-across-doses products (data already stored; give each dose its own number) ──
  'bpc-157': { kind: 'peptide', cas: '137525-51-0', formula: 'C62H98N16O22', mw: '1419.55 g/mol', cid: '9941957',
    storage: 'Powder: -20°C for long-term. In solvent: -80°C (6 months) / -20°C (1 month).',
    note: 'One shared certificate currently covers both doses — give each dose its own certificate number and its own batch data.' },
  'epithalon': { kind: 'peptide', cas: '307297-39-8', formula: 'C14H22N4O9', mw: '390.35 g/mol', cid: '219042', storage: DEFAULT_STORAGE_LYO,
    note: 'One shared certificate currently covers both doses — give each dose its own certificate number and its own batch data.' },
  'l-carnitine-5000mg': { kind: 'small-molecule', cas: '541-15-1', formula: 'C7H15NO3', mw: '161.20 g/mol', cid: '10917',
    storage: 'Store at 2-8°C. Do not freeze. Protect from light.',
    note: 'One shared certificate currently covers both doses — give each dose its own certificate number and its own batch data.' },
  'slu-pp-332': { kind: 'small-molecule', storage: DEFAULT_STORAGE_LYO,
    note: 'One shared certificate currently covers both doses — give each dose its own certificate number and its own batch data. Objective data is already stored; confirm it.' },
  'melanotan-ii': { kind: 'peptide', cas: '121062-08-6', formula: 'C50H69N15O9', mw: '1024.2 g/mol', cid: '92432',
    storage: DEFAULT_STORAGE_LYO,
    note: 'The 10mg and 20mg are separate batches — the 20mg is currently disabled. Each enabled dose needs its own certificate number.' },

  // ── blends: multi-component, compose a component sheet (no single molecule) ──
  'glow-70mg': { kind: 'blend', note: 'Blend — list each component with its own purity. Do not use a single molecular formula.' },
  'peptide-complex': { kind: 'blend', note: 'Windsor Glow signature blend — list each component with its own purity. No single molecular formula.' },
  'wolverine-blend': { kind: 'blend', note: 'BPC-157 + TB-500 blend. BPC-157: CAS 137525-51-0 / C62H98N16O22 / 1419.55. TB-500: confirm the form. Give each dose its own number.' },
  'omnimorph-retatrutide-pen': { kind: 'blend', note: 'Retatrutide + Cagrilintide pen blend. Retatrutide: CAS 2381089-83-2 / C221H342N46O68 / 4731.33. Cagrilintide: CAS 1415456-99-3 / C194H312N54O59S2 / 4409.01. Give each dose its own number.' },

  // ── reconstitution fluids: different test panel (not HPLC purity) ──
  'acetic-acid-06-10ml': { kind: 'water', note: 'Reconstitution fluid (0.6% acetic acid). COA panel = concentration / pH / sterility / appearance, NOT HPLC purity. Acetic acid: CAS 64-19-7 / C2H4O2 / 60.05.' },
  'bac-water': { kind: 'water', note: 'Bacteriostatic water (0.9% benzyl alcohol). COA panel = benzyl alcohol % / pH / sterility / endotoxin / appearance, NOT HPLC purity. Benzyl alcohol: CAS 100-51-6 / C7H8O / 108.14.' },
};

// Product slugs whose live certificate is an uploaded supplier document (external
// image mode) rather than a template — nothing to type, just confirm it's correct.
export function isExternalPenSlug(slug: string): boolean {
  return /-pen$/.test(slug) || slug === 'retatrutide-pen' || slug === 'tirzepatide-pen';
}

export function referenceFor(slug: string): CertReference | undefined {
  return CERT_REFERENCE[slug];
}

// Suggests a per-dose-unique certificate number. Prefers an existing recognisable
// base (e.g. "WG-EP307") and appends a dose token so 10mg and 50mg differ; falls
// back to a slug-derived code when there is no base yet. Purely a suggestion — the
// admin can overwrite it, and uniqueness is validated live in the tool.
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
    // don't double-append if the base already ends with this dose token
    return b.toUpperCase().endsWith(token) ? b : `${b}-${token}`;
  }
  return `WG-${slugCode(slug)}-${token}`;
}
