/* What is actually in each Windsor Glow product.
 *
 * Every entry records WHERE the fact came from. Nothing here is invented: a
 * product with no recorded and no findable composition is listed as unknown,
 * not guessed. Provenance values:
 *
 *   'windsor-glow'  Supplied by Windsor Glow, or written on the product's own
 *                   page on the site.
 *   'product-name'  Stated in the product's own name or dosage label.
 *   'researched'    Found in independent outside sources, listed per entry.
 *   'worked-out'    Arithmetic on a known total, corroborated where possible.
 *   'unknown'       Nobody has recorded it and no outside source has it.
 */

/** Multi-compound products: blends, combination pens, complexes. Keyed by slug. */
export const BLENDS = {
  'glow-70mg': {
    plainName: 'GLOW 70mg',
    total: '70mg total',
    components: [
      { name: 'GHK-Cu', mg: 50 },
      { name: 'BPC-157', mg: 10 },
      { name: 'TB-500', mg: 10 },
    ],
    provenance: 'windsor-glow',
    note:
      'The split is written on the product page itself, and the site stores the same figures for its calculator. ' +
      'Three independent suppliers publish the identical 50 / 10 / 10 split for a 70mg GLOW vial.',
    sources: [
      'biolongevitylabs.com GLOW blend product page',
      'medicadepot.com GLOW 70mg listing',
      'koipeptides.com GLOW blend 70mg',
    ],
  },
  'glow-pen': {
    plainName: 'Glow Pen',
    total: '70mg total',
    components: [
      { name: 'GHK-Cu', mg: 50 },
      { name: 'BPC-157', mg: 10 },
      { name: 'TB-500', mg: 10 },
    ],
    provenance: 'worked-out',
    note:
      'This pen\'s own page does not say what is in it. It is a 70mg Glow pen, and 70mg GLOW is the standard ' +
      'GHK-Cu 50 / BPC-157 10 / TB-500 10 formulation used everywhere else on this site. Worth confirming ' +
      'against the pen label before printing it anywhere customer-facing.',
    sources: [],
  },
  'glow-pen-critical-bio-tech': {
    plainName: 'Glow Pen, Critical Bio-Tech',
    total: '70mg total',
    components: [
      { name: 'GHK-Cu', mg: 50 },
      { name: 'BPC-157', mg: 10 },
      { name: 'TB-500', mg: 10 },
    ],
    provenance: 'windsor-glow',
    note:
      'The product page names all three peptides. The individual amounts come from the site\'s stored GLOW ' +
      'recipe and match what outside suppliers publish for a 70mg GLOW pen.',
    sources: ['biolongevitylabs.com GLOW blend product page'],
  },
  'klow-pen-critical-bio-tech': {
    plainName: 'Klow Recovery Pen, Critical Bio-Tech',
    total: '80mg total',
    components: [
      { name: 'GHK-Cu', mg: 50 },
      { name: 'BPC-157', mg: 10 },
      { name: 'TB-500', mg: 10 },
      { name: 'KPV', mg: 10 },
    ],
    provenance: 'windsor-glow',
    note:
      'Supplied by Windsor Glow and cross-checked against the stated click yields. Klow is Glow with KPV added, ' +
      'which is the only difference between the two. Multiple outside suppliers publish the same 50 / 10 / 10 / 10.',
    sources: [
      'biolongevitylabs.com KLOW blend product page',
      'peptidedosages.com KLOW 80mg vial breakdown',
    ],
  },
  'wolverine-blend': {
    plainName: 'BPC-157 / TB-500 Wolverine Blend',
    total: '20mg total in the size sold now',
    components: [
      { name: 'BPC-157', mg: 10 },
      { name: 'TB-500', mg: 10 },
    ],
    provenance: 'product-name',
    note:
      'The split is the dosage label itself, "10mg + 10mg". A smaller 5mg + 5mg size exists in the catalogue ' +
      'but is switched off, so only the 10 + 10 is on sale.',
    sources: [],
  },
  'bpc157-tb500-critical-bio-tech': {
    plainName: 'BPC157 & TB500 Wolverine Repair and Recovery Pen, Critical Bio-Tech',
    total: '20mg total',
    components: [
      { name: 'BPC-157', mg: 10 },
      { name: 'TB-500', mg: 10 },
    ],
    provenance: 'windsor-glow',
    note: 'The product page states 10mg BPC-157 with 10mg TB-500, and the dosage label says "10/10mg".',
    sources: [],
  },
  'wolverine-recovery-pen': {
    plainName: 'Wolverine Recovery Pen, Remedium',
    total: '30mg total',
    components: [
      { name: 'BPC-157', mg: 10 },
      { name: 'TB-500', mg: 10 },
      { name: 'KPV', mg: 10 },
    ],
    provenance: 'researched',
    note:
      'The three peptides are named on the product. The amounts are not. An outside supplier sells the same ' +
      '30mg three-peptide pen as an even 10 / 10 / 10 with no filler and no weighting, which also matches the ' +
      '10mg each that Klow uses for these same three. The site had already worked out the same answer. ' +
      'Still worth one look at the pen label to close it off.',
    sources: ['peptideplugs.com Wolverine Plus 30mg (BPC-157 + TB-500 + KPV)'],
  },
  'cjc-1295-no-dac-ipamorelin-10mg': {
    plainName: 'Ipamorelin + CJC-1295 No DAC',
    total: '10mg total',
    components: [
      { name: 'CJC-1295 No DAC', mg: 5 },
      { name: 'Ipamorelin', mg: 5 },
    ],
    provenance: 'researched',
    note:
      'The product names both peptides but not the split. A 10mg CJC-1295 No DAC and Ipamorelin vial is a ' +
      'standard item across the industry and is 5mg of each, an even split. Several suppliers publish exactly that.',
    sources: [
      'usa-peptidesciences.com CJC-1295 No DAC + Ipamorelin 10mg blend',
      'mypeptidematch.com 10mg blend dosage guide',
      'midwestpeptide.com CJC + IPA blend 10mg',
    ],
  },
  'omnimorph-retatrutide-pen': {
    plainName: 'Retatrutide / Cagri Pen, Omnimorph',
    total: '44mg total',
    components: [
      { name: 'Retatrutide', mg: 40 },
      { name: 'Cagrilintide', mg: 4 },
    ],
    provenance: 'product-name',
    note:
      'The split is in the product name and repeated on the page. A smaller 20mg / 2mg format is mentioned in ' +
      'the description but is not currently listed for sale.',
    sources: [],
  },
  hhb: {
    plainName: 'HHB, Hair Skin Nails',
    total: '10ml vial, 150mg per ml of nutrients',
    isPeptide: false,
    components: [
      { name: 'Niacinamide', mg: 50 },
      { name: 'Thiamine HCl (vitamin B1)', mg: 50 },
      { name: 'Pantothenic acid (vitamin B5)', mg: 25 },
      { name: 'Choline', mg: 10 },
      { name: 'Inositol', mg: 10 },
      { name: 'Niacin (vitamin B3)', mg: 5 },
      { name: 'Biotin', mg: 0.1, label: '100mcg' },
      { name: 'Folic acid', mg: 0.1, label: '100mcg' },
      { name: 'Riboflavin (vitamin B2)', mg: 0.1, label: '100mcg' },
    ],
    provenance: 'windsor-glow',
    note:
      'THIS ONE CONTAINS NO PEPTIDES AT ALL. It is a vitamin and nutrient injection. The full breakdown is ' +
      'printed on its own product page, so nothing here is worked out. The name gives no hint of that, which ' +
      'is exactly the sort of confusion this document is for.',
    sources: [],
  },
  'super-human-blend': {
    plainName: 'UP-389',
    total: '10ml vial',
    isPeptide: false,
    components: [
      { name: 'L-Leucine' },
      { name: 'L-Isoleucine' },
      { name: 'L-Valine' },
      { name: 'L-Glutamine' },
      { name: 'L-Arginine' },
      { name: 'L-Citrulline' },
      { name: 'L-Taurine' },
      { name: 'L-Phenylalanine' },
      { name: 'L-Tyrosine' },
    ],
    provenance: 'windsor-glow',
    note:
      'CONTAINS NO PEPTIDES. It is an amino acid complex, and it is Windsor Glow\'s own product. The nine amino ' +
      'acids are named on its page. The amounts and ratios are deliberately not published, described there as ' +
      'proprietary, so there are no milligram figures to give. Its only size, 10ml, is currently switched off, ' +
      'so nobody can buy it as it stands.',
    sources: [],
  },
  'peptide-complex': {
    plainName: 'Peptide Complex',
    total: '5mg and 10mg',
    unknown: true,
    provenance: 'unknown',
    note:
      'NOBODY HAS WRITTEN DOWN WHAT IS IN THIS. Its page calls it a Windsor Glow signature blend and an advanced ' +
      'formulation, and says nothing more. It is not in the site\'s recipe list. I searched outside sources and ' +
      'found nothing, which is expected: it is your own name for your own product, so no outside supplier would ' +
      'have it. Only you or your supplier can answer this one. It is hidden from the site and marked out of stock, ' +
      'so nothing is being sold unexplained today.',
    sources: [],
  },
  'pag-nrg': {
    plainName: 'PAG~NRG',
    total: '10ml',
    unknown: true,
    provenance: 'unknown',
    note:
      'NOBODY HAS WRITTEN DOWN WHAT IS IN THIS EITHER. Its page says only "Coming soon" with no description. The ' +
      'two words filed against it are energy and growth. It is not in the site\'s recipe list, and outside ' +
      'searches return nothing for the name. Hidden and marked coming soon, so it is not on sale. It needs a ' +
      'composition before it goes live.',
    sources: [],
  },
};

/** Plain identity for every single-compound product, keyed by slug. */
export const IDENTITIES = {
  '5-amino-1mq-100mg': { what: '5-Amino-1MQ', kind: 'small molecule', plain: 'A small molecule, not a peptide. An NNMT enzyme inhibitor.' },
  'acetic-acid-06-10ml': { what: 'Acetic acid 0.6% in water', kind: 'supply', plain: 'Not a peptide. A liquid for mixing peptides that will not dissolve in plain water.' },
  'ahk-cu-50mg': { what: 'AHK-Cu', kind: 'peptide', plain: 'Copper tripeptide-3. A copper-carrying peptide, close relative of GHK-Cu.' },
  'aod-9604': { what: 'AOD-9604', kind: 'peptide', plain: 'A modified fragment of human growth hormone.' },
  'ara-290': { what: 'ARA-290', kind: 'peptide', plain: 'An 11 amino acid peptide derived from erythropoietin. Also called cibinetide.' },
  'b7-33': { what: 'B7-33', kind: 'peptide', plain: 'A single-chain peptide derived from relaxin-2.' },
  'bac-water': { what: 'Bacteriostatic water', kind: 'supply', plain: 'Not a peptide. Sterile water with a preservative, used to mix powdered peptides.' },
  'bpc-157': { what: 'BPC-157', kind: 'peptide', plain: 'Body Protective Compound 157. A 15 amino acid peptide.' },
  cagrilintide: { what: 'Cagrilintide', kind: 'peptide', plain: 'A long-acting amylin analogue. Often shortened to Cagri.' },
  'cjc-1295': { what: 'CJC-1295', kind: 'peptide', plain: 'A growth hormone releasing hormone analogue. This listing is the plain form.' },
  dihexa: { what: 'Dihexa', kind: 'small molecule', plain: 'A synthetic compound, not strictly a peptide, derived from angiotensin IV.' },
  'dsip-5mg': { what: 'DSIP', kind: 'peptide', plain: 'Delta Sleep-Inducing Peptide. A 9 amino acid peptide. This is the 10mg size.' },
  'dsip-5': { what: 'DSIP', kind: 'peptide', plain: 'Delta Sleep-Inducing Peptide, the 5mg size. Same compound as DSIP 10.' },
  epithalon: { what: 'Epithalon', kind: 'peptide', plain: 'A synthetic four amino acid peptide. Also spelled Epitalon.' },
  'follistatin-315': { what: 'Follistatin-315', kind: 'protein', plain: 'A follistatin variant. The shorter-acting of the two follistatins here.' },
  'follistatin-344': { what: 'Follistatin-344', kind: 'protein', plain: 'A follistatin variant that binds myostatin.' },
  'ghk-cu-critical-bio-tech': { what: 'GHK-Cu, 50mg in a pen', kind: 'peptide', plain: 'One peptide only, GHK-Cu, pre-filled in a pen by Critical Bio-Tech. Not a blend.' },
  'ghk-cu': { what: 'GHK-Cu', kind: 'peptide', plain: 'Copper peptide. Glycyl-L-Histidyl-L-Lysine bound to copper.' },
  'ghrp-2': { what: 'GHRP-2', kind: 'peptide', plain: 'Growth Hormone Releasing Peptide 2. A six amino acid peptide.' },
  'ghrp-6': { what: 'GHRP-6', kind: 'peptide', plain: 'Growth Hormone Releasing Peptide 6. A six amino acid peptide.' },
  'glutathione-1500mg': { what: 'L-Glutathione', kind: 'tripeptide', plain: 'Reduced glutathione, supplied as the 1500mg product size.' },
  gonadorelin: { what: 'Gonadorelin', kind: 'peptide', plain: 'Synthetic gonadotropin-releasing hormone, GnRH.' },
  hexarelin: { what: 'Hexarelin', kind: 'peptide', plain: 'A six amino acid growth hormone secretagogue.' },
  hgh191aa: { what: 'Somatropin, HGH', kind: 'protein', plain: 'The full 191 amino acid human growth hormone sequence. Sold by IU, not mg.' },
  'hgh-fragment-176-191': { what: 'HGH Fragment 176-191', kind: 'peptide', plain: 'A short piece of the growth hormone molecule, amino acids 176 to 191.' },
  'hmg-human-menopausal-gonadotropin': { what: 'Human Menopausal Gonadotropin', kind: 'hormone', plain: 'A gonadotropin preparation, not a peptide in the usual sense.' },
  'igf-1-des': { what: 'IGF-1 DES', kind: 'peptide', plain: 'Des(1-3) IGF-1. A shortened form of insulin-like growth factor 1.' },
  'igf-1-lr3': { what: 'IGF-1 LR3', kind: 'peptide', plain: 'Long R3 IGF-1. A modified, longer-lasting form of IGF-1.' },
  ipamorelin: { what: 'Ipamorelin', kind: 'peptide', plain: 'A five amino acid growth hormone secretagogue. This is the plain single peptide.' },
  'kisspeptin-10': { what: 'Kisspeptin-10', kind: 'peptide', plain: 'A 10 amino acid fragment of kisspeptin.' },
  'kisspeptin-54': { what: 'Kisspeptin-54', kind: 'peptide', plain: 'The longer 54 amino acid kisspeptin. Also called metastin.' },
  kpv: { what: 'KPV', kind: 'peptide', plain: 'A three amino acid peptide, lysine-proline-valine, from the end of alpha-MSH.' },
  'l-carnitine-5000mg': { what: 'L-Carnitine', kind: 'not a peptide', plain: 'Not a peptide. An amino acid derivative.' },
  'll-37': { what: 'LL-37', kind: 'peptide', plain: 'A 37 amino acid antimicrobial peptide, the human cathelicidin.' },
  'melanotan-i': { what: 'Melanotan I', kind: 'peptide', plain: 'Also called afamelanotide. The linear one. Not the same as MT2.' },
  mgf: { what: 'MGF', kind: 'peptide', plain: 'Mechano Growth Factor, a splice variant of IGF-1.' },
  'mots-c': { what: 'MOTS-c', kind: 'peptide', plain: 'A 16 amino acid peptide encoded in mitochondrial DNA.' },
  'mots-c-critical-bio-tech': { what: 'MOTS-c, 40mg in a pen', kind: 'peptide', plain: 'One peptide only, MOTS-c, pre-dosed in a pen by Critical Bio-Tech. Not a blend.' },
  'melanotan-ii': { what: 'Melanotan II', kind: 'peptide', plain: 'MT2 and Melanotan II are the same thing. A melanocortin receptor agonist.' },
  'mt2-critical-bio-tech': { what: 'Melanotan II, 10mg in a pen', kind: 'peptide', plain: 'MT2 only, pre-dosed in a pen by Critical Bio-Tech. Not a blend.' },
  'mt2-tanning-pen': { what: 'Melanotan II in a pen', kind: 'peptide', plain: 'MT2 only, in a TANPRO pen. Same compound as the other MT2 products.' },
  'n-acetyl-semax-amidate': { what: 'N-Acetyl Semax Amidate', kind: 'peptide', plain: 'A modified, longer-lasting version of Semax.' },
  'nad-1000mg': { what: 'NAD+', kind: 'not a peptide', plain: 'Not a peptide. Nicotinamide adenine dinucleotide, a coenzyme.' },
  'nasal-spray-melanotan-ii-critical-bio-tech': { what: 'Melanotan II as a nasal spray', kind: 'peptide', plain: 'MT2 only, in a nasal spray instead of an injection. Not a blend.' },
  oxytocin: { what: 'Oxytocin', kind: 'peptide', plain: 'A nine amino acid peptide hormone.' },
  'peg-mgf': { what: 'PEG-MGF', kind: 'peptide', plain: 'Mechano Growth Factor with a PEG chain attached to make it last longer.' },
  pinealon: { what: 'Pinealon', kind: 'peptide', plain: 'A short three amino acid peptide.' },
  'pt-141': { what: 'Bremelanotide', kind: 'peptide', plain: 'PT-141 and Bremelanotide are the same thing. Derived from Melanotan II.' },
  retatrutide: { what: 'Retatrutide', kind: 'peptide', plain: 'A triple receptor agonist, GLP-1, GIP and glucagon. Sometimes called Reta.' },
  'retatrutide-pen': { what: 'Retatrutide, 30mg in a pen', kind: 'peptide', plain: 'Retatrutide only, pre-dosed by Remedium Research. Not a blend.' },
  'retatrutide-pen-slimfinity-40mg': { what: 'Retatrutide, 40mg in a pen', kind: 'peptide', plain: 'Retatrutide only, pre-dosed by Slimfinity. Not a blend.' },
  'retatrutide-pen-synedica-40mg': { what: 'Retatrutide, 40mg in a pen', kind: 'peptide', plain: 'Retatrutide only, pre-filled by Synedica with a needle kit. Not a blend.' },
  selank: { what: 'Selank', kind: 'peptide', plain: 'A seven amino acid peptide based on tuftsin.' },
  semaglutide: { what: 'Semaglutide', kind: 'peptide', plain: 'A GLP-1 receptor agonist. The same active compound as Ozempic and Wegovy.' },
  semax: { what: 'Semax', kind: 'peptide', plain: 'A peptide derived from ACTH.' },
  sermorelin: { what: 'Sermorelin', kind: 'peptide', plain: 'A growth hormone releasing hormone analogue, the first 29 amino acids.' },
  'slu-pp-332': { what: 'SLU-PP-332', kind: 'small molecule', plain: 'Not a peptide. A small molecule, an ERR agonist.' },
  'tb-500': { what: 'TB-500', kind: 'peptide', plain: 'A fragment of Thymosin Beta-4. TB-500 and Thymosin Beta-4 are used interchangeably.' },
  tesamorelin: { what: 'Tesamorelin', kind: 'peptide', plain: 'A growth hormone releasing factor analogue.' },
  'thymosin-alpha-1': { what: 'Thymosin Alpha-1', kind: 'peptide', plain: 'A 28 amino acid peptide. Different from Thymosin Beta-4 and TB-500.' },
  tirzepatide: { what: 'Tirzepatide', kind: 'peptide', plain: 'A dual GLP-1 and GIP receptor agonist. The same active compound as Mounjaro.' },
  'tirzepatide-pen-lean-luxe-60mg': { what: 'Tirzepatide, 60mg in a pen', kind: 'peptide', plain: 'Tirzepatide only, pre-dosed by Lean Luxe. Not a blend.' },
  'tirzepatide-pen': { what: 'Tirzepatide, 30mg in a pen', kind: 'peptide', plain: 'Tirzepatide only, pre-dosed by Remedium Research. Not a blend.' },
  triptorelin: { what: 'Triptorelin', kind: 'peptide', plain: 'A GnRH agonist, a modified gonadotropin-releasing hormone.' },
  vesugen: { what: 'Vesugen', kind: 'peptide', plain: 'A short three amino acid peptide.' },
};

export const PROVENANCE_LABELS = {
  'windsor-glow': 'Windsor Glow',
  'product-name': 'On the product',
  researched: 'Outside sources',
  'worked-out': 'Worked out',
  unknown: 'Not recorded',
};

/** Storefront names as recorded in the 6 August 2026 catalogue audit. */
export const PRODUCT_CATALOGUE_NAMES = {
  '5-amino-1mq-100mg': '5-Amino-1MQ',
  'acetic-acid-06-10ml': 'Acetic Acid 0.6% (AA Water)',
  'ahk-cu-50mg': 'AHK-CU',
  'aod-9604': 'AOD-9604',
  'ara-290': 'ARA-290',
  'b7-33': 'B7-33',
  'bac-water': 'BAC Water',
  'bpc-157': 'BPC-157',
  'wolverine-blend': 'BPC-157 / TB-500 Wolverine Blend',
  'bpc157-tb500-critical-bio-tech': 'BPC157 & TB500 Wolverine Repair and Recovery, Critical Bio-Tech Pen',
  cagrilintide: 'Cagrilintide (CAGRI)',
  'cjc-1295': 'CJC-1295',
  dihexa: 'Dihexa',
  'dsip-5mg': 'DSIP 10',
  'dsip-5': 'DSIP 5',
  epithalon: 'Epithalon',
  'follistatin-315': 'Follistatin-315',
  'follistatin-344': 'Follistatin-344',
  'ghk-cu-critical-bio-tech': 'GHK-CU, Critical Bio-Tech Pen',
  'ghk-cu': 'GHK-Cu 100mg',
  'ghrp-2': 'GHRP-2',
  'ghrp-6': 'GHRP-6',
  'glow-70mg': 'GLOW 70mg',
  'glow-pen': 'Glow Pen',
  'glow-pen-critical-bio-tech': 'Glow Pen, Critical Bio-Tech',
  'glutathione-1500mg': 'Glutathione 1500mg',
  gonadorelin: 'Gonadorelin',
  hexarelin: 'Hexarelin',
  hgh191aa: 'HGH (191 AA), Human Growth Hormone',
  'hgh-fragment-176-191': 'HGH Fragment 176-191',
  hhb: 'HHB, Hair Skin Nails',
  'hmg-human-menopausal-gonadotropin': 'HMG (Human Menopausal Gonadotropin)',
  'igf-1-des': 'IGF-1 DES',
  'igf-1-lr3': 'IGF-1 LR3',
  ipamorelin: 'Ipamorelin',
  'cjc-1295-no-dac-ipamorelin-10mg': 'Ipamorelin 10mg + CJC-1295 No DAC',
  'kisspeptin-10': 'Kisspeptin-10',
  'kisspeptin-54': 'Kisspeptin-54',
  'klow-pen-critical-bio-tech': 'Klow Recovery Pen, Critical Bio-Tech',
  kpv: 'KPV',
  'l-carnitine-5000mg': 'L-Carnitine',
  'll-37': 'LL-37',
  'melanotan-i': 'Melanotan I',
  mgf: 'MGF',
  'mots-c': 'MOTS-c',
  'mots-c-critical-bio-tech': 'MOTS-C Pen, Critical Bio-Tech',
  'melanotan-ii': 'MT2 (Melanotan II)',
  'mt2-critical-bio-tech': 'MT2 Pen, Critical Bio-Tech',
  'mt2-tanning-pen': 'MT2 Tanning Pen (TANPRO)',
  'n-acetyl-semax-amidate': 'N-Acetyl Semax Amidate',
  'nad-1000mg': 'NAD+',
  'nasal-spray-melanotan-ii-critical-bio-tech': 'Nasal Spray (Melanotan II), Critical Bio-Tech',
  oxytocin: 'Oxytocin',
  'pag-nrg': 'PAG~NRG',
  'peg-mgf': 'PEG-MGF',
  'peptide-complex': 'Peptide Complex',
  pinealon: 'Pinealon',
  'pt-141': 'PT-141 (Bremelanotide)',
  retatrutide: 'Retatrutide',
  'omnimorph-retatrutide-pen': 'Retatrutide / Cagri Pen, Omnimorph 40mg / 4mg',
  'retatrutide-pen': 'Retatrutide Pen, Remedium Research 30mg',
  'retatrutide-pen-slimfinity-40mg': 'Retatrutide Pen, Slimfinity 40mg',
  'retatrutide-pen-synedica-40mg': 'Retatrutide Pen, Synedica 40mg',
  selank: 'Selank',
  semaglutide: 'Semaglutide',
  semax: 'Semax',
  sermorelin: 'Sermorelin',
  'slu-pp-332': 'SLU-PP-332',
  'tb-500': 'TB-500',
  tesamorelin: 'Tesamorelin',
  'thymosin-alpha-1': 'Thymosin Alpha-1',
  tirzepatide: 'Tirzepatide',
  'tirzepatide-pen-lean-luxe-60mg': 'Tirzepatide Pen, Lean Luxe 60mg',
  'tirzepatide-pen': 'Tirzepatide Pen, Remedium Research',
  triptorelin: 'Triptorelin',
  'super-human-blend': 'UP-389',
  vesugen: 'Vesugen',
  'wolverine-recovery-pen': 'Wolverine Recovery Pen, Remedium, BPC-157 / TB-500 / KPV',
};

/** Extra names customers are likely to type, including reviewed misspellings. */
export const PRODUCT_ALIASES = {
  'glutathione-1500mg': ['L-Glutathione 1500mg', 'Glutathione 1500'],
  'tirzepatide-pen': ['Tirzepatide Pen Remedium Research 30mg'],
  'wolverine-blend': ['Wolverine Stack', 'Wolverine Blend', 'Wolverene Stack', 'Wolverin Blend'],
  'bpc157-tb500-critical-bio-tech': ['Critical Bio-Tech Wolverine Pen', 'Wolverine Repair Pen', 'BPC157 & TB500 Wolverine Repair and Recovery Critical Bio-Tech Pen'],
  'wolverine-recovery-pen': ['Wolverine Plus', 'Wolverine Plus Pen', 'Wolverene Recovery Pen'],
  'glow-70mg': ['Glow Stack', 'Glow Blend', 'GLOW', 'Glo Stack', 'Glowe Blend'],
  'glow-pen': ['Plain Glow Pen', 'Glow Pen'],
  'glow-pen-critical-bio-tech': ['Critical Bio-Tech Glow Pen', 'Glow Pen Critical Bio-Tech'],
  'klow-pen-critical-bio-tech': ['KLOW', 'KLOW Stack', 'KLOW Blend', 'Klow Pen', 'KLO Stack', 'KLOWW Blend'],
  'cjc-1295-no-dac-ipamorelin-10mg': ['CJC Ipamorelin Blend', 'CJC IPA Blend', 'Ipamorelin CJC Blend', 'CJC Ipamorelin Stack', 'Ipamorelin 10mg plus CJC-1295 No DAC'],
  'omnimorph-retatrutide-pen': ['Retatrutide Cagri Pen', 'Reta Cagri Pen', 'Reta Cagrilintide Pen', 'Omnimorph Pen', 'Retatrutde Cagri Pen'],
  hhb: ['HHB', 'Hair Skin Nails', 'Hair Skin and Nails', 'HHB Hair Skin Nails'],
  'super-human-blend': ['UP389', 'UP 389'],
  'peptide-complex': ['Peptide Complex Blend', 'Peptid Complex'],
  'pag-nrg': ['PAG NRG', 'PAGNRG', 'PAG Energy'],
  'dsip-5mg': ['DSIP 10mg'],
  'dsip-5': ['DSIP 5mg'],
};

export const PRODUCT_COMPOSITIONS = Object.freeze({ ...IDENTITIES, ...BLENDS });

function normaliseProductText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactProductText(value) {
  return normaliseProductText(value).replace(/\s+/g, '');
}

function productTerms(slug, entry) {
  return [...new Set([
    PRODUCT_CATALOGUE_NAMES[slug],
    entry.plainName,
    entry.what,
    // The live DSIP 10 product keeps the historic internal key "dsip-5mg" for
    // stock and orders. That key must never compete with the real DSIP 5mg
    // customer term during PEARL matching.
    ['dsip-5mg', 'super-human-blend'].includes(slug) ? null : slug.replaceAll('-', ' '),
    ...(PRODUCT_ALIASES[slug] || []),
  ].filter(Boolean))];
}

function termAppears(question, term) {
  const questionTokens = normaliseProductText(question).split(' ').filter(Boolean);
  const wanted = compactProductText(term);
  if (questionTokens.includes(wanted)) return true;
  const termLength = Math.max(1, normaliseProductText(term).split(' ').filter(Boolean).length);
  for (let start = 0; start < questionTokens.length; start += 1) {
    for (let size = Math.max(1, termLength - 1); size <= Math.min(questionTokens.length - start, termLength + 1); size += 1) {
      if (questionTokens.slice(start, start + size).join('') === wanted) return true;
    }
  }
  return false;
}

function editDistance(left, right) {
  if (left === right) return 0;
  const matrix = Array.from({ length: left.length + 1 }, (_, row) =>
    Array.from({ length: right.length + 1 }, (_, column) => row || column));
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + cost);
      }
    }
  }
  return matrix[left.length][right.length];
}

const PRODUCT_QUESTION_WORDS = new Set([
  'a', 'about', 'and', 'are', 'breakdown', 'can', 'component', 'components', 'contain', 'contains',
  'dose', 'dosage', 'for', 'has', 'have', 'in', 'ingredient', 'ingredients', 'inside', 'is', 'made',
  'me', 'of', 'please', 'product', 'show', 'stack', 'tell', 'the', 'there', 'what', 'which', 'with',
]);

function fuzzyProductPhrases(question) {
  const words = normaliseProductText(question).split(' ').filter(Boolean);
  const phrases = [];
  for (let start = 0; start < words.length; start += 1) {
    for (let size = 1; size <= 7 && start + size <= words.length; size += 1) {
      const part = words.slice(start, start + size);
      if (part.every((word) => PRODUCT_QUESTION_WORDS.has(word))) continue;
      const compact = part.join('');
      if (compact.length >= 4 && compact.length <= 48) phrases.push({ raw: part.join(' '), compact });
    }
  }
  return phrases;
}

/** Resolve only reviewed Windsor Glow catalogue names. Unknown formulas remain
 * resolvable records so PEARL can say that they are not recorded. */
export function resolveProductComposition(question) {
  const normalisedQuestion = normaliseProductText(question);
  const descriptors = Object.entries(PRODUCT_COMPOSITIONS).flatMap(([slug, entry]) =>
    productTerms(slug, entry).map((term, index) => ({ slug, entry, term, priority: index === 0 ? 4 : index <= 2 ? 3 : 2 })));
  const exact = descriptors
    .filter((descriptor) => termAppears(question, descriptor.term))
    .map((descriptor) => ({ ...descriptor, specificity: compactProductText(descriptor.term).length }))
    .sort((left, right) => right.specificity - left.specificity || right.priority - left.priority);
  let exactResolution = null;
  if (exact.length) {
    const best = exact[0];
    const tied = exact.filter((candidate, index) => index > 0 && candidate.slug !== best.slug && candidate.specificity === best.specificity);
    if (!tied.length) exactResolution = {
      status: 'resolved', method: 'catalogue-name', confidence: 'high', matchedText: best.term,
      slug: best.slug, name: PRODUCT_CATALOGUE_NAMES[best.slug] || best.entry.plainName || best.entry.what, product: best.entry,
    };
    else exactResolution = {
      status: 'ambiguous', method: 'catalogue-name', confidence: 'medium', matchedText: best.term,
      slug: null, name: '', product: null, suggestions: [best, ...tied]
      .filter((candidate, index, all) => all.findIndex((item) => item.slug === candidate.slug) === index)
      .slice(0, 3)
      .map((candidate) => ({
        slug: `product:${candidate.slug}`,
        label: PRODUCT_CATALOGUE_NAMES[candidate.slug] || candidate.entry.plainName || candidate.entry.what,
      })),
    };
  }

  const phrases = fuzzyProductPhrases(question);
  const candidates = [];
  for (const descriptor of descriptors) {
    const target = compactProductText(descriptor.term);
    if (target.length < 5 || target.length > 48) continue;
    for (const phrase of phrases) {
      if (Math.abs(target.length - phrase.compact.length) > 3) continue;
      const distance = editDistance(target, phrase.compact);
      const ratio = distance / Math.max(target.length, phrase.compact.length);
      const allowed = target.length <= 7 ? distance <= 1 : distance <= 2 && ratio <= 0.2;
      if (!allowed) continue;
      // Prefer a near-complete product name over a perfect match on one short
      // ingredient inside it. This keeps a typo in a named pen or blend from
      // collapsing the answer to the first ingredient it contains.
      candidates.push({
        ...descriptor,
        matchedText: phrase.raw,
        score: 1 - ratio + descriptor.priority / 100 + Math.min(target.length, 48) / 100,
      });
    }
  }
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  const second = candidates.find((candidate) => candidate.slug !== best?.slug);
  if (best && (!second || best.score - second.score >= 0.06)) {
    const fuzzySpecificity = compactProductText(best.term).length;
    const exactSpecificity = exact[0]?.specificity || 0;
    if (!exactResolution || fuzzySpecificity > exactSpecificity + 4) return {
      status: 'resolved', method: 'fuzzy-product-name', confidence: 'high', matchedText: best.matchedText,
      slug: best.slug, name: PRODUCT_CATALOGUE_NAMES[best.slug] || best.entry.plainName || best.entry.what, product: best.entry,
    };
  }

  if (exactResolution) return exactResolution;

  const isCategoryQuestion = /\b(?:which|what)\s+(?:peptides|compounds|entries)\b.*\b(?:researched|research|related)\b/i.test(question);
  const shortWords = (isCategoryQuestion ? [] : normalisedQuestion.split(' ')).filter((word) =>
    /^[a-z0-9]{3,12}$/.test(word) && /[a-z]/.test(word) && !PRODUCT_QUESTION_WORDS.has(word),
  );
  for (const word of shortWords) {
    const prefixMatches = descriptors
      .filter((descriptor) => {
        const target = compactProductText(descriptor.term);
        return target.length > word.length && target.startsWith(word);
      })
      .filter((candidate, index, all) => all.findIndex((item) => item.slug === candidate.slug) === index)
      .slice(0, 6);
    if (prefixMatches.length === 1) {
      const match = prefixMatches[0];
      return {
        status: 'resolved', method: 'catalogue-prefix', confidence: 'high', matchedText: word,
        slug: match.slug, name: PRODUCT_CATALOGUE_NAMES[match.slug] || match.entry.plainName || match.entry.what, product: match.entry,
      };
    }
    if (prefixMatches.length > 1) return {
      status: 'ambiguous', method: 'catalogue-prefix', confidence: 'medium', matchedText: word,
      slug: null, name: '', product: null,
      suggestions: prefixMatches.map((match) => ({
        slug: `product:${match.slug}`,
        label: PRODUCT_CATALOGUE_NAMES[match.slug] || match.entry.plainName || match.entry.what,
      })),
    };
  }

  if (/\brecovery pen\b/.test(normalisedQuestion)) {
    const slugs = ['wolverine-recovery-pen', 'klow-pen-critical-bio-tech'];
    return {
      status: 'ambiguous', method: 'generic-product-name', confidence: 'medium', matchedText: 'recovery pen',
      slug: null, name: '', product: null,
      suggestions: slugs.map((slug) => ({ slug: `product:${slug}`, label: PRODUCT_CATALOGUE_NAMES[slug] })),
    };
  }

  return { status: 'unknown', method: 'none', confidence: 'low', matchedText: '', slug: null, name: '', product: null, suggestions: [] };
}
