// Blend breakdown maths (task 6bf5aee8).
//
// Several products are blends: one vial or pen holding more than one peptide.
// Klow 80mg is BPC-157 10mg + TB-500 10mg + GHK-Cu 50mg + KPV 10mg. A dose of
// such a product delivers each component in proportion to its share of the
// blend, so the only maths needed is a ratio applied to whatever dose the
// existing calculators already work out.
//
// That is deliberate: the reconstitution maths in DosageCalculator and
// PenIuCalculator is already verified and must not be re-derived here. This
// module takes a finished dose and splits it, nothing more.

export interface BlendComponent {
  /** Peptide name as printed on the product, e.g. "GHK-Cu". */
  name: string;
  /** Milligrams of this component in the whole vial or pen. */
  mg: number;
}

export interface BlendShare extends BlendComponent {
  /** This component's fraction of the blend, 0-1. */
  fraction: number;
  /** Milligrams of this component delivered by the dose. */
  doseMg: number;
  /** Same figure in micrograms, which is how the smaller components read. */
  doseMcg: number;
}

/** Components that are actually filled in: named, positive, usable. */
export function usableComponents(components: BlendComponent[]): BlendComponent[] {
  return components.filter((c) => c.name.trim() !== '' && Number.isFinite(c.mg) && c.mg > 0);
}

export function blendTotalMg(components: BlendComponent[]): number {
  return usableComponents(components).reduce((sum, c) => sum + c.mg, 0);
}

/**
 * Split a dose across the blend.
 *
 * `doseMg` is the total amount of blended powder delivered by whatever the
 * calculator worked out: one syringe draw, one pen click, ten clicks. The
 * split is by each component's share of the blend, so it holds for every
 * device and every dose size.
 */
export function splitDose(doseMg: number, components: BlendComponent[]): BlendShare[] {
  const usable = usableComponents(components);
  const total = usable.reduce((sum, c) => sum + c.mg, 0);
  if (!Number.isFinite(doseMg) || doseMg <= 0 || total <= 0) return [];
  return usable.map((c) => {
    const fraction = c.mg / total;
    const mg = doseMg * fraction;
    return { ...c, fraction, doseMg: mg, doseMcg: mg * 1000 };
  });
}

/**
 * Does the stated blend add up to the vial amount the calculator is using?
 * A mismatch silently corrupts every number below it, so it is surfaced rather
 * than quietly normalised away.
 */
export function blendMismatch(components: BlendComponent[], vialMg: number): null | { totalMg: number; vialMg: number } {
  const total = blendTotalMg(components);
  if (total <= 0 || !Number.isFinite(vialMg) || vialMg <= 0) return null;
  // Tolerate float noise and sensible rounding on the label.
  if (Math.abs(total - vialMg) < 0.01) return null;
  return { totalMg: total, vialMg };
}

/** Display helper: mg above 1, mcg below, which is how these are read in practice. */
export function formatAmount(mg: number): string {
  if (!Number.isFinite(mg) || mg <= 0) return '0';
  if (mg >= 1) return `${Number(mg.toFixed(3)).toString()} mg`;
  const mcg = mg * 1000;
  return `${Number(mcg.toFixed(mcg >= 100 ? 0 : 1)).toString()} mcg`;
}

// ── Known blends ──────────────────────────────────────────────────────────
//
// Every preset below carries its own source, and `confidence` says whether the
// split is published or reasoned. Presets are a starting point, not an
// authority: they load into editable fields precisely so the figures can be
// corrected against the label or certificate of analysis.
//
// Note that only the RATIO matters to the breakdown. A 1:1 blend splits 50/50
// whether the vial holds 10mg or 20mg, so a preset stays correct across
// variant sizes of the same formulation.
export type BlendConfidence = 'published' | 'inferred';

export interface BlendPreset {
  id: string;
  label: string;
  /** Where the split comes from, so it can be re-checked later. */
  source: string;
  confidence: BlendConfidence;
  totalMg: number;
  components: BlendComponent[];
}

export const BLEND_PRESETS: BlendPreset[] = [
  {
    id: 'klow-80',
    label: 'Klow 80mg (GHK-Cu / BPC-157 / TB-500 / KPV)',
    source: 'Composition supplied by Windsor Glow, cross-checked against the stated 10-click yields.',
    confidence: 'published',
    totalMg: 80,
    components: [
      { name: 'GHK-Cu', mg: 50 },
      { name: 'BPC-157', mg: 10 },
      { name: 'TB-500', mg: 10 },
      { name: 'KPV', mg: 10 },
    ],
  },
  {
    id: 'glow-70',
    label: 'GLOW 70mg / Glow Pen (GHK-Cu / BPC-157 / TB-500)',
    source: 'Standard GLOW formulation, 50/10/10, consistent across multiple suppliers and matching Klow minus its KPV.',
    confidence: 'published',
    totalMg: 70,
    components: [
      { name: 'GHK-Cu', mg: 50 },
      { name: 'BPC-157', mg: 10 },
      { name: 'TB-500', mg: 10 },
    ],
  },
  {
    id: 'wolverine-5-5',
    label: 'Wolverine Blend 5mg + 5mg (BPC-157 / TB-500)',
    source: 'Split stated in the product variant name.',
    confidence: 'published',
    totalMg: 10,
    components: [
      { name: 'BPC-157', mg: 5 },
      { name: 'TB-500', mg: 5 },
    ],
  },
  {
    id: 'wolverine-10-10',
    label: 'Wolverine Blend 10mg + 10mg (BPC-157 / TB-500)',
    source: 'Split stated in the product variant name.',
    confidence: 'published',
    totalMg: 20,
    components: [
      { name: 'BPC-157', mg: 10 },
      { name: 'TB-500', mg: 10 },
    ],
  },
  {
    id: 'bpc-tb-pen-10-10',
    label: 'BPC157 & TB500 pen 10/10mg',
    source: 'Split stated in the product variant name.',
    confidence: 'published',
    totalMg: 20,
    components: [
      { name: 'BPC-157', mg: 10 },
      { name: 'TB-500', mg: 10 },
    ],
  },
  {
    id: 'wolverine-recovery-pen-30',
    label: 'Wolverine Recovery Pen 30mg (BPC-157 / TB-500 / KPV)',
    // Was equal thirds worked out from first principles and flagged "check against the pen
    // label". Kieran gave the real breakdown on 10 September 2026: "Recovery pen 30 mg is 10mg
    // tb500, 10mg bpc 157, and kpv 10mg". The figures were right; what changes is that they are
    // now his and not a deduction, so the panel no longer tells anyone to go and check them.
    source: 'Given by Kieran on 10 September 2026: 10mg TB-500, 10mg BPC-157, 10mg KPV.',
    confidence: 'published',
    totalMg: 30,
    components: [
      { name: 'BPC-157', mg: 10 },
      { name: 'TB-500', mg: 10 },
      { name: 'KPV', mg: 10 },
    ],
  },
  {
    /* The 50mg is NOT the 30mg scaled up, which is exactly why it had to be asked rather than
       assumed. Even thirds would have given 16.67mg each; the real pen holds 20 / 20 / 10, so the
       KPV stays at 10mg while the other two double. The version before this one worked the even
       split out for itself and labelled it inferred, which is what prompted the question. */
    id: 'wolverine-recovery-pen-50',
    label: 'Wolverine Recovery Pen 50mg (BPC-157 / TB-500 / KPV)',
    source: 'Given by Kieran on 10 September 2026: 20mg TB-500, 20mg BPC-157, 10mg KPV.',
    confidence: 'published',
    totalMg: 50,
    components: [
      { name: 'BPC-157', mg: 20 },
      { name: 'TB-500', mg: 20 },
      { name: 'KPV', mg: 10 },
    ],
  },
  {
    id: 'ipamorelin-cjc-1-1',
    label: 'Ipamorelin / CJC-1295 No DAC (1:1)',
    source:
      'Ipamorelin and CJC-1295 No DAC are conventionally blended 1:1, so the split is 50/50 whether the vial is 5+5 or 10+10. Adjust the amounts if your label differs.',
    confidence: 'inferred',
    totalMg: 20,
    components: [
      { name: 'Ipamorelin', mg: 10 },
      { name: 'CJC-1295 No DAC', mg: 10 },
    ],
  },
  {
    id: 'omnimorph-retatrutide-cagrilintide-40-4',
    label: 'Omnimorph Retatrutide / Cagrilintide Pen 40mg + 4mg',
    source: 'The 40mg Retatrutide and 4mg Cagrilintide split is stated in the Windsor Glow product name and page.',
    confidence: 'published',
    totalMg: 44,
    components: [
      { name: 'Retatrutide', mg: 40 },
      { name: 'Cagrilintide', mg: 4 },
    ],
  },
];

/** Mixtures the catalogue must recognise but the peptide dose splitter must not
 * pretend it can calculate. */
export const KNOWN_NON_PEPTIDE_MIXTURES = [
  {
    id: 'hhb',
    label: 'HHB Hair Skin Nails',
    reason: 'This is a vitamin and nutrient mixture, not a peptide blend.',
  },
  {
    id: 'up-389',
    label: 'UP-389',
    reason: 'This is a nine-amino-acid mixture, not a peptide blend, and its ratios are proprietary.',
  },
] as const;

// UP-389 and HHB Hair Skin Nails deliberately have no calculator preset.
//
// UP-389 never had one: Windsor Glow's own product page describes it as a
// proprietary complex in "precise proprietary ratios", so the split is not
// published by design, and presenting one as fact would be inventing the
// formulation. HHB is a vitamin complex dosed per millilitre rather than per
// vial, so it needed a caveat that did not belong on a peptide calculator.
//
// Both can still be broken down by typing the amounts in by hand.

/* ── Blends the shop is selling, found on their own ──────────────────────────────────────────
 *
 * WHY (Kieran, video, after the pen drop-down shipped): "you've got the wolverine recovery pen
 * for 30 mg but you've forgotten the 50 mg one... all the blends should be there... if we add
 * any more blends your calculator should automatically know."
 *
 * The list above is hand-written, so it only ever held what somebody remembered to add. The shop
 * sells the Recovery Pen at 30mg AND 50mg; only the 30mg was in it. This reads the live catalogue
 * so a blend cannot be missing, and a new one appears without a code change.
 *
 * WHAT CAN AND CANNOT BE AUTOMATIC, because it matters for trust in the numbers:
 *   - the LIST can be built automatically, always;
 *   - the SPLIT can be read EXACTLY when the dosage states it ("10/10mg", "40/4mg");
 *   - otherwise the split is not recorded anywhere in the shop. The catalogue knows "Recovery Pen
 *     (Windsor Glow) BPC 157, TB500, KPV" and "50mg", not how the 50mg divides. So the components
 *     are taken from the name and split evenly, and the entry is marked `inferred` with a source
 *     line telling the reader to check the pen label. That is exactly what the hand-written 30mg
 *     entry already does, and it is the honest answer: offer the arithmetic, do not claim the
 *     formulation.
 *
 * Hand-written entries always win. Several are marked `published`, and a guess must never quietly
 * replace a figure somebody checked.
 */

/**
 * Peptides worth recognising inside a product name, each with the spellings the shop actually
 * uses. Grouped rather than listed flat because SYNONYMS OF ONE PEPTIDE MUST NOT COUNT TWICE:
 * "MT2 (Melanotan II)" is one compound written two ways, and the first version of this read it as
 * a two-part blend and split it 5mg/5mg, which would have been a wrong number on a real product.
 * The first spelling in each group is the name shown.
 */
const BLEND_COMPONENT_ALIASES: readonly (readonly string[])[] = [
  ['CJC-1295 No DAC', 'CJC-1295'],
  ['Cagrilintide', 'Cagri'],
  ['Retatrutide', 'Reta'],
  ['Tirzepatide'],
  ['Ipamorelin'],
  ['Melanotan II', 'MT2'],
  ['Tesamorelin'],
  ['Semaglutide'],
  ['BPC-157', 'BPC 157', 'BPC157'],
  ['TB-500', 'TB 500', 'TB500'],
  ['GHK-Cu', 'GHK CU'],
  ['MOTS-C'],
  ['KPV'],
];

/** The DISTINCT peptides named in a product's title, in the order they appear. */
export function componentsInName(name: string): string[] {
  const haystack = String(name ?? '').toLowerCase();
  const found: { at: number; label: string }[] = [];

  for (const group of BLEND_COMPONENT_ALIASES) {
    // Earliest position any spelling of this one peptide appears. One entry per peptide, so a
    // product naming it twice, or naming it and its abbreviation, still counts once.
    let earliest = -1;
    for (const spelling of group) {
      const at = haystack.indexOf(spelling.toLowerCase());
      if (at !== -1 && (earliest === -1 || at < earliest)) earliest = at;
    }
    if (earliest !== -1) found.push({ at: earliest, label: group[0] });
  }

  return found.sort((a, b) => a.at - b.at).map((f) => f.label);
}

/**
 * True when the NAME itself quotes milligram figures, e.g. "Ipamorelin 10mg+CJC-1295 No DAC".
 *
 * Those products state their split somewhere this does not read, so splitting the variant's total
 * evenly would contradict the label. The first version did exactly that and turned a 10mg + 10mg
 * pen into 5mg + 5mg. When this is true and the dosage does not state the split, the product is
 * left to the curated list rather than guessed at.
 */
export function nameQuotesAmounts(name: string): boolean {
  return /\d+(?:\.\d+)?\s*(?:mg|mcg|iu)/i.test(String(name ?? ''));
}

/** The numbers in a dosage that states its own split: "10/10mg" -> [10, 10], "40/4mg" -> [40, 4]. */
export function splitFromDosage(dosage: string): number[] {
  const text = String(dosage ?? '').trim();
  if (!text.includes('/')) return [];
  const unit = text.match(/(mcg|mg|iu)\s*$/i);
  if (!unit) return [];
  const numbers = (text.slice(0, unit.index).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  return numbers.length >= 2 && numbers.every((n) => Number.isFinite(n) && n > 0) ? numbers : [];
}

/** The single total in a plain dosage: "50mg" -> 50. Zero when it is not a plain mg figure. */
function totalFromDosage(dosage: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*mg$/i.exec(String(dosage ?? '').trim());
  return match ? Number(match[1]) : 0;
}

/** Enough of a product for this to work, so it can be tested without the whole catalogue type. */
export interface BlendCandidate {
  slug: string;
  name: string;
  categories?: readonly string[];
  variants?: readonly { dosage?: string; enabled?: boolean }[];
}

/**
 * Blend entries derived from the shop, EXCLUDING anything the hand-written list already covers.
 *
 * A product qualifies when its dosage states a split, or its name mentions more than one peptide.
 * Mixtures we have already decided not to split (UP-389, HHB) are left out by name.
 */
export function shopBlendPresets(catalogue: readonly BlendCandidate[]): BlendPreset[] {
  const out: BlendPreset[] = [];
  const nonPeptide = KNOWN_NON_PEPTIDE_MIXTURES.map((m) => m.label.toLowerCase());

  for (const product of catalogue ?? []) {
    const name = String(product?.name ?? '').trim();
    if (!name || nonPeptide.some((n) => name.toLowerCase().includes(n))) continue;

    for (const variant of product.variants ?? []) {
      if (!variant || variant.enabled === false) continue;
      const dosage = String(variant.dosage ?? '').trim();
      if (!dosage) continue;

      const named = componentsInName(name);
      const stated = splitFromDosage(dosage);

      let components: BlendComponent[] = [];
      let confidence: BlendConfidence = 'inferred';
      let source = '';

      if (stated.length >= 2) {
        // The split is printed on the product itself. Name the parts where we can, and fall back
        // to "Part 1 / Part 2" rather than pretending to know which peptide is which.
        components = stated.map((mg, i) => ({ name: named[i] ?? `Part ${i + 1}`, mg }));
        confidence = named.length >= stated.length ? 'published' : 'inferred';
        source = named.length >= stated.length
          ? `The ${stated.join(' and ')}mg split is stated in the product name on the shop.`
          : `The ${stated.join(' and ')}mg split is stated on the shop, but which peptide is which is not, so check the label.`;
      } else if (named.length >= 2) {
        // The name is quoting its own amounts; an even split would contradict it.
        if (nameQuotesAmounts(name)) continue;
        const total = totalFromDosage(dosage);
        if (!total) continue;
        const each = total / named.length;
        components = named.map((n) => ({ name: n, mg: each }));
        source = `Split evenly across the ${named.length} peptides named on the product, inferred not published, because the shop records the ${dosage} total and not how it divides. Check against the label.`;
      } else {
        continue; // one peptide, or nothing recognisable: not a blend.
      }

      out.push({
        id: `shop:${product.slug}:${dosage}`,
        label: `${name}, ${dosage}`,
        source,
        confidence,
        totalMg: components.reduce((sum, c) => sum + c.mg, 0),
        components,
      });
    }
  }

  return out;
}

/**
 * The full list the calculator offers: the curated entries first, then anything the shop is
 * selling that they do not already cover.
 *
 * Matched on the components rather than the label, because the two lists name the same pen
 * differently ("Wolverine Recovery Pen 30mg" against "Recovery Pen (Windsor Glow) BPC 157,
 * TB500, KPV, 30mg"), and a duplicate row for one product is exactly what this must not create.
 */
export function allBlendPresets(catalogue: readonly BlendCandidate[] = []): BlendPreset[] {
  const fingerprint = (p: BlendPreset) =>
    `${Math.round(p.totalMg * 100)}|${p.components.map((c) => c.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .sort().join(',')}`;
  const covered = new Set(BLEND_PRESETS.map(fingerprint));
  const extra: BlendPreset[] = [];
  // Also de-duplicate the shop entries against EACH OTHER, on the label as well as the
  // composition. Two differently named products that happen to share a formulation are two real
  // products and both belong in the list; two rows reading the same thing are a fault.
  const seen = new Set<string>();
  for (const preset of shopBlendPresets(catalogue)) {
    const print = fingerprint(preset);
    if (covered.has(print)) continue;
    const row = `${preset.label.toLowerCase()}|${print}`;
    if (seen.has(row)) continue;
    seen.add(row);
    extra.push(preset);
  }
  return [...BLEND_PRESETS, ...extra];
}
