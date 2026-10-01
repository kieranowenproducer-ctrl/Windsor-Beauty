// PEARL's approved terminology layer.
//
// Research answers still come from chat-engine.mjs. This file only identifies
// what the member is asking about. Known aliases and blend names are explicit,
// source-tracked records. Fuzzy matching is deliberately conservative and can
// suggest a term, but it cannot create a new alias or blend by itself.

export const PEARL_NAME = "PEARL";
export const PEARL_EXPANDED_NAME = "Peptide Experimental Analysis Research Library";
export const TERMINOLOGY_SCHEMA_VERSION = 1;

const VERIFIED_ON = "2026-08-06";
const MENTAL_HEALTH_VERIFIED_ON = "2026-08-13";
const MELANOTAN_VERIFIED_ON = "2026-08-30";

const source = (label, url, role = "Terminology source") => ({ label, url, role });

const PEPTIDE_HUB_GLOSSARY = source(
  "Peptide Hub glossary",
  "https://peptidehub.bio/glossary",
  "Commercial and community terminology source",
);

export const CURATED_TERMINOLOGY = [
  {
    id: "semax",
    recordType: "compound",
    canonicalSlug: "semax",
    displayName: "Semax",
    aliases: ["ACTH(4-7)-Pro-Gly-Pro", "ACTH(4-10) analogue", "ACTH(4-7)PGP", "MEHFPGP"],
    abbreviations: [],
    misspellings: ["senax", "semex", "semaks", "semaxx", "semaax", "seamx", "semaxk"],
    phoneticForms: ["see max", "se max"],
    relatedSlugs: ["selank", "nasemaxamidate"],
    ambiguousWith: ["nasemaxamidate"],
    sources: [
      source("Peptpedia Semax profile", "https://peptpedia.org/peptide/semax"),
      source("PeptideDeck Semax research guide", "https://www.peptidedeck.com/peptides/semax-benefits"),
    ],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: MENTAL_HEALTH_VERIFIED_ON,
    notes: "Common typing and speech-to-text forms resolve to standard Semax. N-acetyl Semax amidate remains a separate research entry.",
  },
  {
    id: "selank",
    recordType: "compound",
    canonicalSlug: "selank",
    displayName: "Selank",
    aliases: ["Selanc", "TP-7", "TKPRPGP", "Tuftsin analogue"],
    abbreviations: [],
    misspellings: ["selanc", "selanck", "selnk", "selnak", "sellank", "seelank", "selankk"],
    phoneticForms: ["see lank", "seh lank"],
    relatedSlugs: ["semax", "naselankamidate"],
    ambiguousWith: ["naselankamidate"],
    sources: [
      source("Peptpedia Selank profile", "https://peptpedia.org/peptide/selank"),
      source("PeptideDeck anxiety research guide", "https://www.peptidedeck.com/blog/best-peptides-for-anxiety-stress-relief"),
    ],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: MENTAL_HEALTH_VERIFIED_ON,
    notes: "Selanc and common typing or speech-to-text forms resolve to standard Selank. N-acetyl Selank amidate remains separate.",
  },
  {
    id: "retatrutide",
    recordType: "compound",
    canonicalSlug: "retatrutide",
    displayName: "Retatrutide",
    aliases: ["LY3437943", "triple incretin"],
    abbreviations: ["RETA"],
    misspellings: ["retatrutde", "retatrutdie", "retatruttide", "retatrutidee", "retatrutied", "retetrutide", "retatrutyde"],
    phoneticForms: ["reta trutide", "retatrutyd"],
    relatedSlugs: ["semaglutide", "tirzepatide"],
    ambiguousWith: [],
    sources: [
      source("PepCodex retatrutide dossier", "https://www.pepcodex.com/peptides/retatrutide"),
      PEPTIDE_HUB_GLOSSARY,
    ],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "RETA is accepted as an informal abbreviation. GLP-3 is handled separately because it is not an official scientific name.",
  },
  {
    id: "retatrutide-glp3",
    recordType: "compound",
    canonicalSlug: "retatrutide",
    displayName: "Retatrutide",
    aliases: ["GLP-3", "GLP3"],
    abbreviations: [],
    misspellings: [],
    phoneticForms: [],
    relatedSlugs: ["semaglutide", "tirzepatide"],
    ambiguousWith: [],
    sources: [PEPTIDE_HUB_GLOSSARY],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: false,
    lastVerified: VERIFIED_ON,
    notes: "Informal community shorthand, not an official pharmacological classification. Ask before using it as Retatrutide.",
  },
  {
    id: "semaglutide",
    recordType: "compound",
    canonicalSlug: "semaglutide",
    displayName: "Semaglutide",
    aliases: ["Ozempic", "Wegovy", "Rybelsus", "NN9535", "NNC0113-0217"],
    abbreviations: ["SEMA"],
    misspellings: ["semaglutde", "semagultide", "semmaglutide", "semaglutidee"],
    phoneticForms: ["semaglootide", "sema gluetide"],
    relatedSlugs: ["tirzepatide", "retatrutide"],
    ambiguousWith: [],
    sources: [source("The Peptide Handbook semaglutide profile", "https://peptide-handbook.com/?open=semaglutide")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "Brand names are retrieval aliases only. Product-specific evidence remains separate in the answer sources.",
  },
  {
    id: "tirzepatide",
    recordType: "compound",
    canonicalSlug: "tirzepatide",
    displayName: "Tirzepatide",
    aliases: ["Mounjaro", "Zepbound", "LY3298176", "twincretin"],
    abbreviations: ["TIRZ"],
    misspellings: ["tirzepatde", "tirzepatdie", "tirzeppatide", "tirzepatidee"],
    phoneticForms: ["tir zepatide", "tirzepatyde"],
    relatedSlugs: ["semaglutide", "retatrutide"],
    ambiguousWith: [],
    sources: [source("The Peptide Handbook tirzepatide profile", "https://peptide-handbook.com/?open=tirzepatide")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "TIRZ is accepted only as a whole token.",
  },
  {
    id: "bpc157",
    recordType: "compound",
    canonicalSlug: "bpc-157",
    displayName: "BPC-157",
    aliases: ["Body Protection Compound 157", "Body Protective Compound 157", "PL 14736", "Bepecin"],
    abbreviations: ["BPC"],
    misspellings: ["bpc1577", "bpc 175", "bcp 157"],
    phoneticForms: [],
    relatedSlugs: ["tb-500"],
    ambiguousWith: [],
    sources: [source("Peptpedia BPC-157 profile", "https://peptpedia.org/peptide/bpc-157")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "BPC is accepted in PEARL research context as BPC-157.",
  },
  {
    id: "tb500",
    recordType: "compound",
    canonicalSlug: "tb-500",
    displayName: "TB-500",
    aliases: ["TB500", "TB 500", "Ac-LKKTETQ"],
    abbreviations: [],
    misspellings: ["tb-050", "tb-5000", "tb 550"],
    phoneticForms: [],
    relatedSlugs: ["thymosin-beta-4-tb4", "bpc-157"],
    ambiguousWith: ["thymosin-beta-4-tb4"],
    sources: [source("PepCodex TB-500 dossier", "https://www.pepcodex.com/peptides/tb-500")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "TB-500 is not silently treated as full-length thymosin beta-4.",
  },
  {
    id: "tb-abbreviation",
    recordType: "compound",
    canonicalSlug: "tb-500",
    displayName: "TB-500",
    aliases: [],
    abbreviations: ["TB"],
    misspellings: [],
    phoneticForms: [],
    relatedSlugs: ["thymosin-beta-4-tb4"],
    ambiguousWith: ["thymosin-beta-4-tb4"],
    sources: [source("PepCodex TB-500 dossier", "https://www.pepcodex.com/peptides/tb-500")],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: false,
    lastVerified: VERIFIED_ON,
    notes: "TB has several meanings, including tuberculosis. PEARL asks the member to confirm TB-500.",
  },
  {
    id: "thymosin-beta4-generic",
    recordType: "ambiguous",
    canonicalSlug: "",
    displayName: "Thymosin Beta-4",
    aliases: ["Thymosin Beta-4", "Thymosin B4", "TB4", "Tβ4"],
    abbreviations: [],
    misspellings: ["Thymosin Beta 4", "Thymosin B-4"],
    phoneticForms: [],
    relatedSlugs: [],
    ambiguousWith: ["tb-500", "thymosin-beta-4-tb4"],
    sources: [source("The Peptide Handbook thymosin beta-4 profile", "https://peptide-handbook.com/?open=thymosin-beta4")],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: false,
    lastVerified: VERIFIED_ON,
    notes: "Some tertiary sources blur TB-500 with full-length thymosin beta-4. PEARL asks unless the wording makes the formulation explicit.",
  },
  {
    id: "ghkcu",
    recordType: "compound",
    canonicalSlug: "ghk-cu",
    displayName: "GHK-Cu",
    aliases: ["GHK Cu", "GHK copper", "Copper Peptide GHK", "Copper Tripeptide-1", "Tripeptide-1"],
    abbreviations: [],
    misspellings: ["ghk-cuu", "gkh-cu", "ghkcuu"],
    phoneticForms: ["g h k copper"],
    relatedSlugs: ["bpc-157", "tb-500"],
    ambiguousWith: [],
    sources: [source("Peptpedia GHK-Cu profile", "https://peptpedia.org/peptide/ghk-cu")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "Copper peptide remains a retrieval alias, not a claim that every copper peptide is GHK-Cu.",
  },
  {
    id: "ghk-generic",
    recordType: "ambiguous",
    canonicalSlug: "",
    displayName: "GHK",
    aliases: ["GHK"],
    abbreviations: [],
    misspellings: [],
    phoneticForms: [],
    relatedSlugs: [],
    ambiguousWith: ["ghk", "ghk-cu", "ghk-cu-topical"],
    sources: [source("Peptpedia GHK-Cu profile", "https://peptpedia.org/peptide/ghk-cu")],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: false,
    lastVerified: VERIFIED_ON,
    notes: "GHK without copper or formulation wording is shared by separate library records, so PEARL asks.",
  },
  {
    id: "motsc",
    recordType: "compound",
    canonicalSlug: "mots-c",
    displayName: "MOTS-c",
    aliases: ["MOTS C", "MOTSc", "Mitochondrial ORF of the 12S rRNA type-c"],
    abbreviations: [],
    misspellings: ["mot-c", "mots-cc", "most-c"],
    phoneticForms: ["mots see"],
    relatedSlugs: ["ss-31", "nad"],
    ambiguousWith: [],
    sources: [source("Peptpedia MOTS-c profile", "https://peptpedia.org/peptide/mots-c")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "Spacing and hyphen changes are accepted.",
  },
  {
    id: "ss31",
    recordType: "compound",
    canonicalSlug: "ss-31",
    displayName: "SS-31",
    aliases: ["SS31", "Elamipretide", "MTP-131", "Bendavia", "Forzinity"],
    abbreviations: [],
    misspellings: ["ss-13", "ss-311", "elamipretde"],
    phoneticForms: ["elami pretide"],
    relatedSlugs: ["mots-c"],
    ambiguousWith: [],
    sources: [source("PepCodex SS-31 dossier", "https://www.pepcodex.com/peptides/ss-31")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "Scientific and development names point to the same approved library entry.",
  },
  {
    id: "ara290",
    recordType: "compound",
    canonicalSlug: "ara-290",
    displayName: "ARA-290",
    aliases: ["ARA 290", "Cibinetide", "Hebesyn", "Helix-B Surface Peptide"],
    abbreviations: ["HBSP"],
    misspellings: ["ara-209", "ara-2900", "cibinetde"],
    phoneticForms: ["sigh bin etide"],
    relatedSlugs: [],
    ambiguousWith: [],
    sources: [source("PepCodex ARA-290 dossier", "https://www.pepcodex.com/peptides/ara-290")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "Cibinetide and HBSP are accepted scientific aliases.",
  },
  {
    id: "thymosin-alpha1",
    recordType: "compound",
    canonicalSlug: "thymosin-alpha-1",
    displayName: "Thymosin Alpha-1",
    aliases: ["Thymalfasin", "Zadaxin", "Thymosin alpha 1"],
    abbreviations: ["TA-1", "TA1"],
    misspellings: ["thymosin alfa 1", "thymosin alpha-11"],
    phoneticForms: [],
    relatedSlugs: [],
    ambiguousWith: [],
    sources: [source("Peptpedia Thymosin Alpha-1 profile", "https://peptpedia.org/peptide/thymosin-alpha-1")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "Greek-letter and spacing variations are normalised.",
  },
  {
    id: "cjc1295-generic",
    recordType: "ambiguous",
    canonicalSlug: "",
    displayName: "CJC-1295",
    aliases: ["CJC-1295", "CJC1295", "CJC 1295", "CJC"],
    abbreviations: [],
    misspellings: ["cjc-1259", "cjc-12955"],
    phoneticForms: [],
    relatedSlugs: [],
    ambiguousWith: ["cjc-1295-no-dac", "cjc-1295-with-dac"],
    sources: [source("Halflife Labs CJC-1295 index", "https://halflife-labs.com/database/")],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: false,
    lastVerified: VERIFIED_ON,
    notes: "The formulation changes the interpretation, so PEARL must ask whether DAC is present.",
  },
  // Tester feedback, 13 Sep 2026. These are names the approved library
  // already holds. The records only make normal phone typing reach the right
  // existing entry; they do not add or change any research claim or figure.
  {
    id: "tesamorelin-phone-typing",
    recordType: "compound",
    canonicalSlug: "tesamorelin",
    displayName: "Tesamorelin",
    aliases: [],
    abbreviations: [],
    misspellings: ["tesamol", "tesamo"],
    phoneticForms: [],
    relatedSlugs: [],
    ambiguousWith: [],
    sources: [source("Peptide Handbook Tesamorelin profile", "https://peptide-handbook.com/?open=tesamorelin")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: false,
    lastVerified: "2026-09-13",
    notes: "Close, incomplete phone spellings ask for confirmation before using the existing Tesamorelin record.",
  },
  {
    id: "slu-pp-332-phone-typing",
    recordType: "compound",
    canonicalSlug: "slu-pp-332",
    displayName: "SLU-PP-332",
    aliases: ["SLU 332", "SLUPP332", "SLU PP 332"],
    abbreviations: ["SLU"],
    misspellings: [],
    phoneticForms: [],
    relatedSlugs: [],
    ambiguousWith: [],
    sources: [source("PeptideDosages SLU-PP-332 page", "https://peptidedosages.com/single-peptide-dosages/slu-pp-332-5-mg-vial-dosage-protocol/")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: "2026-09-13",
    notes: "SLU is the shop's unique short name. Spacing and missing hyphens do not change this identifier.",
  },
  {
    id: "foxo4-dri-phone-typing",
    recordType: "compound",
    canonicalSlug: "foxo4-dri",
    displayName: "FOXO4-DRI",
    aliases: [],
    abbreviations: [],
    misspellings: ["FOX DRI"],
    phoneticForms: [],
    relatedSlugs: [],
    ambiguousWith: [],
    sources: [source("Peptide Handbook FOXO4-DRI profile", "https://peptide-handbook.com/?open=foxo4dri")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: false,
    lastVerified: "2026-09-13",
    notes: "The shortened phone spelling asks for confirmation before using FOXO4-DRI.",
  },
  {
    id: "hgh-somatropin-equivalence",
    recordType: "compound",
    canonicalSlug: "hgh",
    displayName: "Somatropin",
    aliases: ["HGH", "Human Growth Hormone"],
    abbreviations: [],
    misspellings: [],
    phoneticForms: [],
    relatedSlugs: ["hgh-191aa", "hgh-fragment"],
    ambiguousWith: ["hgh-191aa", "hgh-fragment"],
    sources: [source("DailyMed somatropin label", "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ffebf88b-d257-4542-9808-74d9b7167765")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: false,
    lastVerified: "2026-09-13",
    notes: "Plain HGH can mean the canonical hormone or one of two 191-labelled records, so PEARL asks which one is meant.",
  },
  {
    id: "recombinant-hgh-somatropin",
    recordType: "compound",
    canonicalSlug: "hgh",
    displayName: "Somatropin",
    aliases: ["rHGH", "Recombinant Human Growth Hormone"],
    abbreviations: [],
    misspellings: [],
    phoneticForms: [],
    relatedSlugs: ["hgh-191aa", "hgh-fragment"],
    ambiguousWith: [],
    sources: [source("DailyMed somatropin label", "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ffebf88b-d257-4542-9808-74d9b7167765")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: "2026-09-13",
    notes: "Recombinant wording identifies somatropin rather than the separately named fragment records.",
  },
  {
    id: "hgh-191-incomplete",
    recordType: "ambiguous",
    canonicalSlug: "",
    displayName: "HGH 191",
    aliases: ["HGH 191", "Human Growth Hormone 191"],
    abbreviations: [],
    misspellings: [],
    phoneticForms: [],
    relatedSlugs: [],
    ambiguousWith: ["hgh-191aa", "hgh-fragment"],
    sources: [source("DailyMed somatropin label", "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ffebf88b-d257-4542-9808-74d9b7167765")],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: false,
    lastVerified: "2026-09-13",
    notes: "191 alone can mean the full 191-amino-acid molecule or the 176-191 fragment, so PEARL must ask.",
  },
  // Melanotan (task 7009d5db). Kieran typed "M2" for MT2 and got three
  // unrelated research categories back, because nothing here knew the short
  // forms. Melanotan I gets its own so the two never land on each other.
  {
    id: "melanotan-ii",
    recordType: "compound",
    canonicalSlug: "melanotan-ii",
    displayName: "Melanotan II",
    aliases: ["Melanotan 2", "Melanotan two"],
    abbreviations: ["MT2", "MT-2", "MT-II", "MTII"],
    misspellings: ["M2", "melanotan2", "melanotin 2", "melanoton 2", "melatonan 2", "melanatan 2"],
    phoneticForms: ["melano tan two", "em tee two"],
    relatedSlugs: ["melanotan-i", "pt-141"],
    ambiguousWith: [],
    sources: [
      source("Peptpedia Melanotan II profile", "https://peptpedia.org/peptide/melanotan-ii"),
      source("PepCodex Melanotan II dossier", "https://www.pepcodex.com/peptides/melanotan-ii"),
    ],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: MELANOTAN_VERIFIED_ON,
    notes: "MT2, MT-2 and the typing slip M2 all resolve to Melanotan II, and the answer says so. Melanotan I is a separate entry.",
  },
  {
    id: "melanotan-i",
    recordType: "compound",
    canonicalSlug: "melanotan-i",
    displayName: "Melanotan I",
    aliases: ["Melanotan 1", "Melanotan one"],
    abbreviations: ["MT1", "MT-1", "MT-I", "MTI"],
    misspellings: ["melanotan1", "melanotin 1"],
    phoneticForms: ["melano tan one"],
    relatedSlugs: ["melanotan-ii"],
    ambiguousWith: [],
    sources: [source("Peptpedia Melanotan I profile", "https://peptpedia.org/peptide/melanotan-i")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: MELANOTAN_VERIFIED_ON,
    notes: "MT1 and MT-1 resolve to Melanotan I. Afamelanotide (Scenesse) stays its own entry.",
  },
];

export const PEARL_BLEND_MAPPINGS = [
  {
    id: "wolverine",
    recordType: "blend",
    canonicalName: "Wolverine Stack",
    aliases: ["Wolverine Blend", "Wolverine peptide stack", "Wolverine"],
    misspellings: ["Wolverene Stack", "Wolverin Blend", "Wolverinee Stack"],
    components: ["bpc-157", "tb-500"],
    profileSlug: "wolverineblend",
    compositionSlug: "wolverine-blend",
    compositionFixed: true,
    sources: [
      source("Peptide Hub Wolverine Blend profile", "https://peptidehub.bio/peptides/wolverine-blend", "Commercial and community terminology source"),
      source("Peptide Hub Wolverine Stack guide", "https://peptidehub.bio/journal/wolverine-stack-bpc-157-tb-500-research-guide", "Commercial and community terminology source"),
    ],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "The name commonly refers to BPC-157 and TB-500. Evidence for each component is retrieved separately; the name is not a scientific classification.",
    conflicts: ["Product strengths and protocols vary by seller."],
  },
  {
    id: "glow",
    recordType: "blend",
    canonicalName: "Glow Stack",
    aliases: ["Glow Blend", "GLOW", "Glow peptide stack"],
    misspellings: ["Glo Stack", "Glowe Blend", "Gloww Stack"],
    components: ["ghk-cu", "bpc-157", "tb-500"],
    profileSlug: "",
    compositionSlug: "glow-70mg",
    compositionFixed: false,
    sourceDose: [
      {
        label: "Peptide Hub source-listed blend range",
        dose: "900 mcg to 1,800 mcg total blend",
        frequency: "Daily",
        duration: "30-day source cycle with a 14-day break",
        route: "Subcutaneous",
        population: "Commercial research protocol; no validated clinical population",
        species: "Not stated",
        evidenceType: "Commercial and community source, not a clinical study",
        sourceUrl: "https://peptidehub.bio/journal/glow-stack-ghk-cu-skin-hair-research-guide",
      },
    ],
    sources: [
      source("Peptide Hub Glow Stack guide", "https://peptidehub.bio/journal/glow-stack-ghk-cu-skin-hair-research-guide", "Commercial and community terminology source"),
      PEPTIDE_HUB_GLOSSARY,
    ],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "The three components are consistently named in the approved material, but the ratios and total vial strength are not standardised.",
    conflicts: ["The name is commercial rather than scientific.", "Component ratios and product strengths vary between sources."],
  },
  {
    id: "klow",
    recordType: "blend",
    canonicalName: "KLOW Stack",
    aliases: ["KLOW Blend", "KLOW"],
    misspellings: ["KLO Stack", "KLOWW Blend"],
    components: ["ghk-cu", "kpv", "bpc-157", "tb-500"],
    profileSlug: "klowblend",
    compositionSlug: "klow-pen-critical-bio-tech",
    compositionFixed: true,
    sources: [source("Peptide Hub KLOW Blend profile", "https://peptidehub.bio/peptides/klow-blend", "Commercial and community terminology source")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "KLOW is the source's four-component extension of Glow. It is a commercial name, not a scientific classification.",
    conflicts: ["Product strengths and protocols may vary outside the approved source."],
  },
  {
    id: "wolverine-recovery-pen",
    recordType: "blend",
    canonicalName: "Wolverine Recovery Pen",
    aliases: ["Wolverine Plus", "Wolverine Plus Pen", "Remedium Wolverine Pen"],
    misspellings: ["Wolverene Recovery Pen", "Wolverin Plus Pen"],
    components: ["bpc-157", "tb-500", "kpv"],
    profileSlug: "",
    compositionSlug: "wolverine-recovery-pen",
    compositionFixed: true,
    sources: [source("Windsor Glow Wolverine Recovery Pen", "https://windsorglow.com/shop/wolverine-recovery-pen", "Windsor Glow catalogue composition source")],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "The product names all three peptides. The equal 10mg split is supported by an outside matching product but still needs confirmation against the Windsor Glow pen label.",
    conflicts: ["The three component names are recorded, but the individual amounts are not printed on the Windsor Glow page."],
  },
  {
    id: "cjc-ipamorelin",
    recordType: "blend",
    canonicalName: "CJC-1295 No DAC and Ipamorelin Blend",
    aliases: ["CJC Ipamorelin Blend", "CJC IPA Blend", "Ipamorelin CJC Blend", "CJC Ipamorelin Stack"],
    misspellings: ["CJC Ipamorlin Blend", "CJC Ipamorellin Stack"],
    components: ["cjc-1295-no-dac", "ipamorelin"],
    profileSlug: "",
    compositionSlug: "cjc-1295-no-dac-ipamorelin-10mg",
    compositionFixed: true,
    sources: [source("Windsor Glow CJC-1295 No DAC and Ipamorelin product", "https://windsorglow.com/shop/cjc-1295-no-dac-ipamorelin-10mg", "Windsor Glow catalogue identity source")],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "The product names both peptides. The 5mg and 5mg split is supported by matching outside products and should still be checked against the Windsor Glow label.",
    conflicts: ["The equal split is supported by outside product records rather than printed on the Windsor Glow page."],
  },
  {
    id: "retatrutide-cagrilintide-pen",
    recordType: "blend",
    canonicalName: "Retatrutide and Cagrilintide Pen",
    aliases: ["Retatrutide Cagri Pen", "Reta Cagri Pen", "Omnimorph Pen", "Retatrutide Cagrilintide Pen"],
    misspellings: ["Retatrutde Cagri Pen", "Reta Cagrilinitide Pen"],
    components: ["retatrutide", "cagrilintide"],
    profileSlug: "",
    compositionSlug: "omnimorph-retatrutide-pen",
    compositionFixed: true,
    sources: [source("Windsor Glow Omnimorph Retatrutide and Cagrilintide Pen", "https://windsorglow.com/shop/omnimorph-retatrutide-pen", "Windsor Glow catalogue composition source")],
    confidence: "high",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "The 40mg Retatrutide and 4mg Cagrilintide split is stated in the product name and on its page.",
    conflicts: ["A smaller 20mg and 2mg format appears in the description but is not the size currently listed for sale."],
  },
  {
    id: "calm-clarity",
    recordType: "blend",
    canonicalName: "Calm and Clarity Blend",
    aliases: ["Calm + Clarity Blend", "Calm & Clarity Blend", "Calm Clarity Stack"],
    misspellings: ["Calm and Clarirty Blend", "Calm Clarrity Stack"],
    components: ["pe2228", "pinealon", "selank"],
    profileSlug: "calmclarityblend",
    compositionFixed: true,
    sources: [source("Peptide Hub Calm and Clarity profile", "https://peptidehub.bio/peptides/calm-clarity-blend", "Commercial and community terminology source")],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "This mapping follows the supplied commercial source and is not a standard scientific term.",
    conflicts: ["The name may be used differently by other sellers."],
  },
  {
    id: "gut-healing",
    recordType: "blend",
    canonicalName: "Gut Healing Stack",
    aliases: ["Gut Healing Blend", "Gut peptide stack"],
    misspellings: ["Gut Healling Stack", "Gut Healng Blend"],
    components: ["bpc-157", "kpv", "larazotide"],
    profileSlug: "guthealingstack",
    compositionFixed: true,
    sources: [source("Peptide Hub Gut Healing Stack profile", "https://peptidehub.bio/peptides/gut-healing-stack", "Commercial and community terminology source")],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "The imported profile specifies an oral BPC-157 product. Component research remains separate from the combination claim.",
    conflicts: ["The generic name may describe other combinations outside the approved source."],
  },
  {
    id: "longevity-master",
    recordType: "blend",
    canonicalName: "Longevity Master Stack",
    aliases: ["Longevity Master Blend"],
    misspellings: ["Longetivity Master Stack", "Longevity Mastor Blend"],
    components: ["epithalon", "thymalin", "mots-c", "ss-31"],
    profileSlug: "longevitymasterstack",
    compositionFixed: true,
    sources: [source("Peptide Hub Longevity Master Stack profile", "https://peptidehub.bio/peptides/longevity-master-stack", "Commercial and community terminology source")],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "Commercial source terminology only. The combination is not treated as a clinical regimen.",
    conflicts: ["The name is not scientifically standardised."],
  },
  {
    id: "mcas-protocol",
    recordType: "blend",
    canonicalName: "MCAS Protocol Stack",
    aliases: ["MCAS Stack", "MCAS Blend"],
    misspellings: ["MCAS Protcol Stack", "MCASS Stack"],
    components: ["vip", "ara-290", "kpv", "thymosin-alpha-1"],
    profileSlug: "mcasprotocolstack",
    compositionFixed: true,
    sources: [source("Peptide Hub MCAS Protocol Stack profile", "https://peptidehub.bio/peptides/mcas-protocol-stack", "Commercial and community terminology source")],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "The name is a commercial protocol label. It is not evidence that the combination treats MCAS.",
    conflicts: ["The name is not scientifically standardised."],
  },
  {
    id: "mito",
    recordType: "blend",
    canonicalName: "Mito Stack",
    aliases: ["Mito Blend", "Mitochondrial Stack"],
    misspellings: ["Mitoo Stack", "Mitto Blend"],
    components: ["ss-31", "mots-c", "nad"],
    profileSlug: "mitostack",
    compositionFixed: true,
    sources: [source("Peptide Hub Mito Stack profile", "https://peptidehub.bio/peptides/mito-stack", "Commercial and community terminology source")],
    confidence: "medium",
    reviewStatus: "approved",
    autoResolve: true,
    lastVerified: VERIFIED_ON,
    notes: "Commercial source terminology only. Evidence for the three components is retrieved separately.",
    conflicts: ["NAD+ product form and route vary by source."],
  },
];

const GREEK_REPLACEMENTS = new Map([
  ["α", " alpha "],
  ["β", " beta "],
  ["γ", " gamma "],
]);

export function normalizeResearchText(value) {
  let text = String(value || "").toLowerCase().normalize("NFKD");
  for (const [symbol, replacement] of GREEK_REPLACEMENTS) text = text.replaceAll(symbol, replacement);
  return text
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactResearchText(value) {
  return normalizeResearchText(value).replace(/\s+/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function approved(records) {
  return records.filter((record) => record.reviewStatus === "approved" && record.enabled !== false);
}

function runtimeTerms(overrides = []) {
  return approved(overrides).filter((record) => record.recordType === "compound" || record.recordType === "ambiguous");
}

function runtimeBlends(overrides = []) {
  return approved(overrides).filter((record) => record.recordType === "blend");
}

function termDescriptors(record, origin = "curated") {
  const groups = [
    ["alias", record.aliases || []],
    ["abbreviation", record.abbreviations || []],
    ["misspelling", record.misspellings || []],
    ["phonetic", record.phoneticForms || []],
  ];
  return groups.flatMap(([kind, terms]) => terms.map((term) => ({ term, kind, record, origin })));
}

function automaticDescriptors(compounds) {
  return compounds.flatMap((compound) => {
    const baseName = compound.name.replace(/\s+Research Profile$/i, "").trim();
    const spokenName = baseName.replace(/\s*\([^)]*\).*$/, "").trim();
    const terms = [
      { term: compound.name, kind: "canonical" },
      ...unique([baseName, spokenName]).filter((term) => term !== compound.name).map((term) => ({ term, kind: "source-name" })),
      ...unique([compound.slug, ...(compound.researchAliases || [])]).map((term) => ({ term, kind: "source-alias" })),
    ];
    return terms
      // A source page can contain a stray section number in its alias field.
      // A number alone is never a safe compound name ("191 dosage" previously
      // became MK-677), so it must not enter exact terminology matching.
      .filter(({ term }) => !/^\d+$/.test(normalizeResearchText(term)))
      .map(({ term, kind }) => ({
      term,
      kind,
      origin: "library",
      record: {
        id: `library-${compound.slug}`,
        recordType: "compound",
        canonicalSlug: compound.slug,
        displayName: compound.name,
        confidence: "high",
        reviewStatus: "approved",
        autoResolve: true,
        sources: [],
        lastVerified: VERIFIED_ON,
        notes: "Imported from the approved research library.",
      },
      }));
  });
}

function descriptorKey(descriptor) {
  return compactResearchText(descriptor.term);
}

function tokens(value) {
  return normalizeResearchText(value).split(" ").filter(Boolean);
}

function termMatch(questionTokens, term) {
  const wanted = compactResearchText(term);
  if (!wanted) return null;
  const length = Math.max(1, tokens(term).length);
  const minimum = Math.max(1, length - 2);
  const maximum = Math.min(questionTokens.length, length + 2);
  for (let start = 0; start < questionTokens.length; start += 1) {
    for (let size = minimum; size <= maximum && start + size <= questionTokens.length; size += 1) {
      if (questionTokens.slice(start, start + size).join("") === wanted) return { start, size };
    }
  }
  return null;
}

function displayForSlug(slug, compounds) {
  return compounds.find((compound) => compound.slug === slug)?.name || slug;
}

/* Built-in records that an approved, enabled override has replaced
   (Kieran, 19 Aug 2026). Built-in terminology lives in source control and
   cannot be written to at run time, so editing one is stored as an override
   row naming the built-in it supersedes. Here the named built-in is dropped,
   so the edit STANDS IN ITS PLACE rather than being added alongside it -
   which is what makes a spelling removable, not just addable.
   Only approved and enabled overrides count, so a half-finished edit can
   never silently delete a working built-in. */
function supersededBuiltInIds(overrides = []) {
  return new Set(approved(overrides).map((record) => record.supersedesBuiltIn).filter(Boolean));
}

function liveCuratedTerminology(overrides = []) {
  const replaced = supersededBuiltInIds(overrides);
  return replaced.size ? CURATED_TERMINOLOGY.filter((record) => !replaced.has(record.id)) : CURATED_TERMINOLOGY;
}

function buildDescriptors(compounds, overrides) {
  const curated = approved([...liveCuratedTerminology(overrides), ...runtimeTerms(overrides)]).flatMap((record) => termDescriptors(record));
  const automatic = automaticDescriptors(compounds);
  const curatedNormalizedKeys = new Set();
  const curatedCompactKeys = new Set();
  for (const descriptor of curated) {
    // Keep a true canonical spelling when a phonetic form only becomes the
    // same after spaces and punctuation are removed. Exact reviewed terms,
    // such as an ambiguous CJC-1295 record, still take precedence.
    curatedNormalizedKeys.add(normalizeResearchText(descriptor.term));
    curatedCompactKeys.add(descriptorKey(descriptor));
  }

  // A curated record wins for the same spelling. This prevents a bad source
  // alias from silently overriding a reviewed distinction such as TB-500 versus
  // full-length thymosin beta-4, or the two CJC-1295 formulations.
  return [
    ...curated,
    ...automatic.filter((descriptor) => descriptor.kind === "canonical"
      ? !curatedNormalizedKeys.has(normalizeResearchText(descriptor.term))
      : !curatedCompactKeys.has(descriptorKey(descriptor))),
  ].filter((descriptor) =>
    descriptorKey(descriptor).length >= 3
    // A reviewed two-character spelling counts (task 7009d5db: "M2" for MT2).
    // Names taken from the library never get a match this short.
    || (descriptor.origin === "curated" && descriptorKey(descriptor).length === 2)
    || descriptor.record.autoResolve === false);
}

function exactMatches(question, descriptors) {
  const questionTokens = tokens(question);
  const matches = descriptors
    .map((descriptor) => ({ descriptor, match: termMatch(questionTokens, descriptor.term) }))
    .filter((item) => item.match)
    .map((item) => ({ ...item.descriptor, position: item.match.start, tokenLength: item.match.size }));
  const longest = new Map();
  const kindPriority = { canonical: 8, "blend-name": 8, alias: 7, "blend-alias": 7, "source-name": 7, "source-alias": 6, abbreviation: 5, misspelling: 4, "blend-misspelling": 4, phonetic: 3 };
  for (const match of matches) {
    const slug = match.record.canonicalSlug || match.record.id;
    const specificity = descriptorKey(match).length;
    const current = longest.get(slug);
    if (
      !current
      || specificity > current.specificity
      || (specificity === current.specificity && (kindPriority[match.kind] || 0) > (kindPriority[current.kind] || 0))
    ) longest.set(slug, { ...match, specificity });
  }
  const selected = [...longest.values()];
  const withoutSubsumed = selected.filter((candidate) => !selected.some((other) =>
    other !== candidate
    && other.position <= candidate.position
    && other.position + other.tokenLength >= candidate.position + candidate.tokenLength
    && other.specificity > candidate.specificity
    && descriptorKey(other).includes(descriptorKey(candidate)),
  ));
  return withoutSubsumed.sort((a, b) => a.position - b.position || b.specificity - a.specificity);
}

function damerauLevenshtein(left, right) {
  if (left === right) return 0;
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => row || column));
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
      if (
        row > 1
        && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + cost);
      }
    }
  }
  return matrix[left.length][right.length];
}

const QUESTION_WORDS = new Set([
  "a", "about", "and", "are", "best", "can", "category", "compound", "compounds", "dose", "dosage", "entries",
  "entry", "evidence", "for", "give", "has", "have", "help", "how", "i", "improve", "improving", "increase",
  "increasing", "information", "is", "it", "linked", "list", "me", "of", "on", "peptide", "peptides", "please",
  "protocol", "protocols", "range", "related", "relate", "research", "researched", "risk", "risks", "show", "source",
  "stack", "studied", "studies", "study", "support", "supporting", "tell", "the", "this", "top", "treatment", "trial",
  "use", "used", "using", "what", "which", "with", "works",
]);

function fuzzyPhrases(question) {
  const all = tokens(question);
  const phrases = [];
  for (let start = 0; start < all.length; start += 1) {
    for (let size = 1; size <= 4 && start + size <= all.length; size += 1) {
      const words = all.slice(start, start + size);
      if (words.every((word) => QUESTION_WORDS.has(word))) continue;
      const compact = words.join("");
      if (compact.length < 4 || compact.length > 32 || !/[a-z]/.test(compact)) continue;
      phrases.push({ raw: words.join(" "), compact });
    }
  }
  return phrases;
}

// Words that look like a short name but never are: units, counts and small
// English words that the question-word list above does not already hold.
const SHORT_WORD_NOISE = new Set([
  "mg", "mcg", "ml", "mls", "iu", "kg", "ug", "hr", "hrs", "min", "mins", "wk", "wks", "am", "pm", "vs", "per",
  "in", "at", "to", "by", "or", "an", "as", "if", "so", "do", "my", "we", "up", "no", "its", "not", "any", "all",
  "one", "two", "ten", "new", "old", "big", "low", "high", "day", "days", "week", "weeks", "month", "year", "doses",
  "daily", "take", "much", "many", "long", "does", "from", "when", "where", "why", "who", "get", "got", "than",
  "then", "also", "more", "less", "most", "some", "just", "only", "into", "onto", "over", "under", "each", "every",
  "same", "other", "after", "cycle", "vial", "vials", "pen", "pens", "water", "shot", "shots", "unit", "units",
  "level", "test", "tests", "lab", "labs", "coa", "safe", "good", "bad", "side", "buy", "sell", "cost", "price",
  "relax",
  "retinal",
]);

function fuzzyCandidates(question, descriptors) {
  const phrases = fuzzyPhrases(question);
  const bestBySlug = new Map();
  for (const descriptor of descriptors) {
    if (["abbreviation", "phonetic", "misspelling", "blend-misspelling"].includes(descriptor.kind)) continue;
    const target = descriptorKey(descriptor);
    if (target.length < 5 || target.length > 32) continue;
    for (const phrase of phrases) {
      const couldBeCautiousLongName = !phrase.raw.includes(" ")
        && target.length >= 9
        && phrase.compact.length >= 9
        && target[0] === phrase.compact[0]
        && target.slice(-4) === phrase.compact.slice(-4)
        && Math.abs(target.length - phrase.compact.length) <= 6;
      if (Math.abs(target.length - phrase.compact.length) > 3 && !couldBeCautiousLongName) continue;
      const distance = damerauLevenshtein(target, phrase.compact);
      const ratio = distance / Math.max(target.length, phrase.compact.length);
      const allowedHigh = target.length <= 7 ? distance <= 1 : distance <= 2 && ratio <= 0.2;
      const allowedMedium = target.length <= 7 ? distance <= 2 && ratio <= 0.3 : distance <= 3 && ratio <= 0.28;
      const cautiousLongNameSuggestion = couldBeCautiousLongName
        && distance <= 6
        && ratio <= 0.4;
      if (!allowedMedium && !cautiousLongNameSuggestion) continue;
      const confidence = allowedHigh ? "high" : "medium";
      const score = 1 - ratio + (descriptor.kind === "canonical" ? 0.02 : 0);
      const slug = descriptor.record.canonicalSlug || (descriptor.record.recordType === "ambiguous" ? `ambiguous:${descriptor.record.id}` : "");
      if (!slug) continue;
      const candidate = { descriptor, matchedText: phrase.raw, distance, ratio, score, confidence };
      if (!bestBySlug.has(slug) || score > bestBySlug.get(slug).score) bestBySlug.set(slug, candidate);
    }
  }
  // Short reviewed names (task 7009d5db). "MT3" or "M2" for MT2 used to get
  // three unrelated categories back: a name under five letters never took
  // part above, and a word that short never counted as a phrase. A reviewed
  // abbreviation or alias of three to five letters now matches a short word
  // one edit away that starts with the same letter. It only ever ASKS (medium
  // confidence, so PEARL says "did you mean" with a button) and never outranks
  // a longer match already found.
  const shortWords = tokens(question).filter((word) =>
    word.length >= 2 && word.length <= 5 && !QUESTION_WORDS.has(word) && !SHORT_WORD_NOISE.has(word) && !/^\d+$/.test(word),
  );
  // A two-letter word must carry a digit to count ("m3"), or "mt" on its own
  // would suggest both Melanotans; and it only matches a name that has one.
  const usableShortWords = shortWords.filter((word) => word.length >= 3 || /[0-9]/.test(word));
  if (usableShortWords.length) {
    for (const descriptor of descriptors) {
      if (descriptor.origin !== "curated" || !["alias", "abbreviation"].includes(descriptor.kind)) continue;
      const target = descriptorKey(descriptor);
      if (target.length < 3 || target.length > 5) continue;
      const slug = descriptor.record.canonicalSlug;
      if (!slug || bestBySlug.has(slug)) continue;
      for (const word of usableShortWords) {
        if (word === target || word[0] !== target[0]) continue;
        if (word.length === 2 && !/[0-9]/.test(target)) continue;
        const distance = damerauLevenshtein(target, word);
        if (distance > 1) continue;
        const candidate = { descriptor, matchedText: word, distance, ratio: distance / target.length, score: 0.5 - distance / (2 * target.length), confidence: "medium" };
        if (!bestBySlug.has(slug) || candidate.score > bestBySlug.get(slug).score) bestBySlug.set(slug, candidate);
      }
    }
  }
  return [...bestBySlug.values()].sort((a, b) => b.score - a.score);
}

// People often stop after the first recognisable part of a long product name
// when typing on a phone ("reta", "tesa", "cagri"). A prefix is useful as a
// suggestion, but never strong enough to become an answer without a tap. If
// the prefix fits more than one compound, PEARL offers each distinct choice.
function prefixSuggestions(question, descriptors, compounds) {
  if (/\b(?:which|what)\s+(?:peptides|compounds|entries)\b.*\b(?:researched|research|related)\b/i.test(question)) return null;
  const words = tokens(question).filter((word) =>
    /^(?=.*[a-z])[a-z0-9]{3,12}$/.test(word)
    && !QUESTION_WORDS.has(word)
    && !SHORT_WORD_NOISE.has(word),
  );
  if (!words.length) return null;

  const matches = [];
  for (const descriptor of descriptors) {
    if (!["canonical", "source-name", "alias"].includes(descriptor.kind)) continue;
    const target = descriptorKey(descriptor);
    const targetBase = target;
    if (targetBase.length < 4 || targetBase.length > 32 || !/[a-z]/.test(targetBase)) continue;
    for (const word of words) {
      if (!targetBase.startsWith(word) || targetBase === word) continue;
      matches.push({ slug: descriptor.record.canonicalSlug, word });
    }
  }

  const uniqueMatches = matches.filter((match, index, all) => {
    if (!match.slug) return false;
    const label = recognitionLabelKey(displayForSlug(match.slug, compounds));
    return all.findIndex((item) => recognitionLabelKey(displayForSlug(item.slug, compounds)) === label) === index;
  });
  if (!uniqueMatches.length) return null;
  if (uniqueMatches.length === 1) {
    const only = uniqueMatches[0];
    return {
      status: "resolved",
      type: "compound",
      method: "unique-prefix",
      confidence: "high",
      matchedText: only.word,
      blend: null,
      entities: [suggestion(only.slug, compounds)],
      suggestions: [],
      expandedTerms: [displayForSlug(only.slug, compounds)],
      disclosure: disclosure(only.word, displayForSlug(only.slug, compounds), "unique-prefix"),
    };
  }
  return {
    status: "ambiguous",
    type: "compound",
    method: "prefix",
    confidence: "medium",
    matchedText: uniqueMatches[0].word,
    blend: null,
    entities: [],
    suggestions: uniqueMatches.slice(0, 6).map((match) => suggestion(match.slug, compounds)),
    expandedTerms: [],
    disclosure: "",
  };
}

function recognitionLabelKey(value) {
  return compactResearchText(String(value || "")
    .replace(/\s+Research Profile$/i, "")
    .replace(/\s+\(GLP-1\/GIP\/Glucagon\)$/i, ""));
}

export function pearlRecognitionCoverage(compounds) {
  const prefixes = new Set();
  let spellingChecks = 0;
  const keyboardNeighbour = { a: "s", b: "v", c: "x", d: "s", e: "r", f: "d", g: "f", h: "g", i: "o", j: "h", k: "j", l: "k", m: "n", n: "m", o: "p", p: "o", q: "w", r: "t", s: "a", t: "r", u: "i", v: "c", w: "e", x: "z", y: "u", z: "x" };
  for (const compound of compounds || []) {
    const subject = String(compound.name || "")
      .replace(/\s+Research Profile$/i, "")
      .split(":")[0]
      .split("(")[0]
      .trim();
    const key = compactResearchText(subject);
    for (let length = 3; length <= Math.min(6, key.length - 1); length += 1) {
      const prefix = key.slice(0, length);
      if (/[a-z]/.test(prefix) && !QUESTION_WORDS.has(prefix) && !SHORT_WORD_NOISE.has(prefix)) prefixes.add(prefix);
    }
    if (key.length >= 5) {
      const at = Math.max(1, Math.floor(key.length / 2));
      spellingChecks += new Set([
        `${key.slice(0, at)}${key.slice(at + 1)}`,
        `${key.slice(0, at)}${key[at]}${key.slice(at)}`,
        `${key.slice(0, at)}${key[at + 1] || ""}${key[at]}${key.slice(at + 2)}`,
        `${key.slice(0, at)}${keyboardNeighbour[key[at]] || key[at]}${key.slice(at + 1)}`,
      ]).size;
    }
  }
  return { researchRecords: (compounds || []).length, shortPrefixes: prefixes.size, spellingChecks };
}

function suggestion(slug, compounds) {
  return {
    slug,
    // The base record is named "HGH Fragment", but this wording is needed
    // when it sits beside HGH 191AA so the choice is unmistakable.
    label: slug === "hgh-fragment" ? "HGH Fragment 176-191" : displayForSlug(slug, compounds),
  };
}

function disclosure(matchedText, displayName, method) {
  if (method === "canonical" || !matchedText) return "";
  if (method === "context") return "";
  return `I've interpreted '${matchedText}' as ${displayName}.`;
}

function blendDescriptors(overrides) {
  return approved([...PEARL_BLEND_MAPPINGS, ...runtimeBlends(overrides)]).flatMap((record) => [
    { term: record.canonicalName, kind: "blend-name", record },
    ...(record.aliases || []).map((term) => ({ term, kind: "blend-alias", record })),
    ...(record.misspellings || []).map((term) => ({ term, kind: "blend-misspelling", record })),
  ]);
}

function resolveBlend(question, compounds, overrides) {
  const descriptors = blendDescriptors(overrides);
  const exact = exactMatches(question, descriptors);
  if (exact.length) {
    const match = exact[0];
    return {
      status: "resolved",
      type: "blend",
      method: match.kind,
      confidence: match.record.confidence,
      matchedText: match.term,
      blend: match.record,
      entities: match.record.components.map((slug) => suggestion(slug, compounds)),
      suggestions: [],
      expandedTerms: unique([match.record.canonicalName, ...(match.record.aliases || []), ...match.record.components.map((slug) => displayForSlug(slug, compounds))]),
      disclosure: disclosure(match.term, match.record.canonicalName, match.kind === "blend-name" ? "canonical" : match.kind),
    };
  }

  const fuzzy = fuzzyCandidates(question, descriptors.map((descriptor) => ({
    ...descriptor,
    record: { ...descriptor.record, canonicalSlug: `blend:${descriptor.record.id}` },
  })));
  if (!fuzzy.length) return null;
  const first = fuzzy[0];
  const second = fuzzy[1];
  const clearLead = !second || first.score - second.score >= 0.08;
  const record = first.descriptor.record;
  const base = PEARL_BLEND_MAPPINGS.find((item) => item.id === record.id)
    || runtimeBlends(overrides).find((item) => item.id === record.id);
  if (!base) return null;
  if (first.confidence === "high" && clearLead && base.autoResolve !== false) {
    return {
      status: "resolved",
      type: "blend",
      method: "fuzzy",
      confidence: "high",
      matchedText: first.matchedText,
      blend: base,
      entities: base.components.map((slug) => suggestion(slug, compounds)),
      suggestions: [],
      expandedTerms: unique([base.canonicalName, ...(base.aliases || []), ...base.components.map((slug) => displayForSlug(slug, compounds))]),
      disclosure: disclosure(first.matchedText, base.canonicalName, "fuzzy"),
    };
  }
  return {
    status: "ambiguous",
    type: "blend",
    method: "fuzzy",
    confidence: "medium",
    matchedText: first.matchedText,
    blend: null,
    entities: [],
    suggestions: [{ slug: `blend:${base.id}`, label: base.canonicalName }],
    expandedTerms: [],
    disclosure: "",
  };
}

export function resolvePearlTerminology(question, compounds, options = {}) {
  const rawQuestion = String(question || "");
  const overrides = Array.isArray(options.overrides) ? options.overrides : [];
  const blend = resolveBlend(rawQuestion, compounds, overrides);
  // A real blend name wins immediately. A merely fuzzy blend resemblance must
  // wait until PEARL has checked exact and safe-prefix compound names, or a
  // common short form such as "cagri" can be mistaken for CagriSema.
  if (blend && blend.method !== "fuzzy") {
    return { rawQuestion, normalizedQuestion: normalizeResearchText(rawQuestion), ...blend };
  }

  const descriptors = buildDescriptors(compounds, overrides);
  const exact = exactMatches(rawQuestion, descriptors);
  if (exact.length) {
    const canonical = exact.filter((match) => match.kind === "canonical");
    const effectiveExact = canonical.length === 1
      ? exact.filter((match) =>
          match.kind === "canonical"
          || match.position !== canonical[0].position
          || match.tokenLength !== canonical[0].tokenLength
          || descriptorKey(match) !== descriptorKey(canonical[0]),
        )
      : exact;
    const ambiguous = effectiveExact.find((match) => match.record.recordType === "ambiguous" || match.record.autoResolve === false);
    if (ambiguous) {
      const explicitSlugs = unique(
        effectiveExact
          .filter((match) => match !== ambiguous && match.record.recordType !== "ambiguous" && match.record.autoResolve !== false)
          .map((match) => match.record.canonicalSlug),
      );
      const remaining = (ambiguous.record.ambiguousWith || []).filter((slug) => !explicitSlugs.includes(slug));
      if (explicitSlugs.length && remaining.length === 1) {
        const resolvedSlugs = unique([...explicitSlugs, remaining[0]]);
        return {
          rawQuestion,
          normalizedQuestion: normalizeResearchText(rawQuestion),
          status: "resolved",
          type: "compound",
          method: "context-disambiguation",
          confidence: "high",
          matchedText: ambiguous.term,
          blend: null,
          entities: resolvedSlugs.slice(0, 3).map((slug) => suggestion(slug, compounds)),
          suggestions: [],
          expandedTerms: resolvedSlugs.map((slug) => displayForSlug(slug, compounds)),
          disclosure: `I've interpreted '${ambiguous.term}' as ${displayForSlug(remaining[0], compounds)} because the other formulation was named separately.`,
        };
      }
      const slugs = unique([
        ambiguous.record.canonicalSlug,
        ...(ambiguous.record.ambiguousWith || []),
      ]);
      return {
        rawQuestion,
        normalizedQuestion: normalizeResearchText(rawQuestion),
        status: "ambiguous",
        type: "compound",
        method: ambiguous.kind,
        confidence: "medium",
        matchedText: ambiguous.term,
        blend: null,
        entities: [],
        suggestions: slugs.slice(0, 3).map((slug) => suggestion(slug, compounds)),
        expandedTerms: [],
        disclosure: "",
      };
    }

    const uniqueSlugs = unique(effectiveExact.map((match) => match.record.canonicalSlug));
    const sameMention = effectiveExact.length > 1 && effectiveExact.every((match) =>
      match.position === effectiveExact[0].position && match.tokenLength === effectiveExact[0].tokenLength,
    );
    const mentionChoices = uniqueSlugs
      .map((slug) => suggestion(slug, compounds))
      .filter((item, index, all) => all.findIndex((candidate) => recognitionLabelKey(candidate.label) === recognitionLabelKey(item.label)) === index);
    if (sameMention && mentionChoices.length > 1) {
      return {
        rawQuestion,
        normalizedQuestion: normalizeResearchText(rawQuestion),
        status: "ambiguous",
        type: "compound",
        method: "shared-name",
        confidence: "medium",
        matchedText: effectiveExact[0].term,
        blend: null,
        entities: [],
        suggestions: mentionChoices.slice(0, 6),
        expandedTerms: [],
        disclosure: "",
      };
    }
    const selected = effectiveExact.filter((match) => uniqueSlugs.includes(match.record.canonicalSlug));
    return {
      rawQuestion,
      normalizedQuestion: normalizeResearchText(rawQuestion),
      status: "resolved",
      type: "compound",
      method: selected[0].kind,
      confidence: "high",
      matchedText: selected[0].term,
      blend: null,
      entities: uniqueSlugs.slice(0, 3).map((slug) => suggestion(slug, compounds)),
      suggestions: [],
      expandedTerms: unique(selected.flatMap((match) => [match.term, displayForSlug(match.record.canonicalSlug, compounds)])),
      disclosure: selected.length === 1
        ? disclosure(selected[0].term, displayForSlug(selected[0].record.canonicalSlug, compounds), selected[0].kind)
        : "",
    };
  }

  const prefix = prefixSuggestions(rawQuestion, descriptors, compounds);
  if (prefix) return { rawQuestion, normalizedQuestion: normalizeResearchText(rawQuestion), ...prefix };

  if (blend) return { rawQuestion, normalizedQuestion: normalizeResearchText(rawQuestion), ...blend };

  const fuzzy = fuzzyCandidates(rawQuestion, descriptors);
  if (fuzzy.length) {
    const first = fuzzy[0];
    const second = fuzzy[1];
    const clearLead = !second || first.score - second.score >= 0.08;
    if (first.descriptor.record.recordType === "ambiguous" || first.descriptor.record.autoResolve === false) {
      const slugs = unique([
        first.descriptor.record.canonicalSlug,
        ...(first.descriptor.record.ambiguousWith || []),
      ]);
      return {
        rawQuestion,
        normalizedQuestion: normalizeResearchText(rawQuestion),
        status: "ambiguous",
        type: "compound",
        method: "fuzzy",
        confidence: "medium",
        matchedText: first.matchedText,
        blend: null,
        entities: [],
        suggestions: slugs.slice(0, 6).map((slug) => suggestion(slug, compounds)),
        expandedTerms: [],
        disclosure: "",
      };
    }
    const slug = first.descriptor.record.canonicalSlug;
    const label = displayForSlug(slug, compounds);
    if (first.confidence === "high" && clearLead) {
      return {
        rawQuestion,
        normalizedQuestion: normalizeResearchText(rawQuestion),
        status: "resolved",
        type: "compound",
        method: "fuzzy",
        confidence: "high",
        matchedText: first.matchedText,
        blend: null,
        entities: [suggestion(slug, compounds)],
        suggestions: [],
        expandedTerms: [label],
        disclosure: disclosure(first.matchedText, label, "fuzzy"),
      };
    }
    return {
      rawQuestion,
      normalizedQuestion: normalizeResearchText(rawQuestion),
      status: "ambiguous",
      type: "compound",
      method: "fuzzy",
      confidence: "medium",
      matchedText: first.matchedText,
      blend: null,
      entities: [],
      suggestions: fuzzy.slice(0, 3).map((candidate) => suggestion(candidate.descriptor.record.canonicalSlug, compounds)),
      expandedTerms: [],
      disclosure: "",
    };
  }

  return {
    rawQuestion,
    normalizedQuestion: normalizeResearchText(rawQuestion),
    status: "unknown",
    type: "none",
    method: "none",
    confidence: "low",
    matchedText: "",
    blend: null,
    entities: [],
    suggestions: [],
    expandedTerms: [],
    disclosure: "",
  };
}

export function terminologyManagementSummary(overrides = []) {
  const records = [...CURATED_TERMINOLOGY, ...PEARL_BLEND_MAPPINGS, ...(overrides || [])];
  return {
    schemaVersion: TERMINOLOGY_SCHEMA_VERSION,
    name: PEARL_NAME,
    expandedName: PEARL_EXPANDED_NAME,
    records,
    approved: records.filter((record) => record.reviewStatus === "approved" && record.enabled !== false).length,
    review: records.filter((record) => record.reviewStatus === "review").length,
    disabled: records.filter((record) => record.enabled === false || record.reviewStatus === "rejected").length,
  };
}
