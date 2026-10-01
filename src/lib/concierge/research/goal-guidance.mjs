/*
 * PEARL reviewed goal guidance.
 *
 * This is deliberately data, not a second search engine. Natural goal wording
 * resolves to one reviewed primary source match or a shortlist of three. The
 * wording describes research links only; it never decides what is suitable for
 * a person. chat-engine.mjs does not consume this module yet.
 */

export const GOAL_GUIDANCE_VERSION = 1;
export const GOAL_GUIDANCE_REVIEWED_ON = "2026-09-13";

const pick = (slug, name, oneLine, rank, sourceBasis = ["approved-research-profile", "shop-catalogue"]) => ({
  slug, name, rank, oneLine, sourceBasis, reviewStatus: "source-grounded",
});

const goal = ({ id, label, intentPhrases, picks = [], caution = "Research links are not proof that a product is suitable for a person." }) => ({
  id,
  label,
  intentPhrases,
  primarySlug: picks[0]?.slug || null,
  maxVisible: picks.length === 1 ? 1 : Math.min(3, picks.length),
  shortlist: picks,
  caution,
  moreDetailPrompt: picks[0] ? `Tell me more about ${picks[0].name}` : "Show the related research",
  validation: {
    basis: "Existing Windsor Glow catalogue wording and approved PEARL research profiles",
    reviewedOn: GOAL_GUIDANCE_REVIEWED_ON,
    version: GOAL_GUIDANCE_VERSION,
  },
});

export const GOAL_GUIDANCE = [
  goal({ id: "muscle-growth", label: "muscle growth", intentPhrases: ["build muscle", "gain muscle", "muscle gain", "get stronger", "bulk up", "get ripped", "bodybuilding", "strengh"], picks: [
    pick("igf-1-lr3", "IGF-1 LR3", "Linked with IGF-1 signalling, protein synthesis and muscle-growth research.", 1),
    pick("follistatin-344", "Follistatin-344", "Linked with myostatin-inhibition and muscle-development research.", 2),
    pick("hgh191aa", "HGH191AA", "Linked with growth-hormone, recovery and body-composition research.", 3),
  ] }),
  goal({ id: "healing", label: "healing and recovery", intentPhrases: ["heal faster", "injury recovery", "repair tissue", "damaged tendon", "damaged ligament", "recover after gym", "sore muscles", "wound repair", "recovary"], picks: [
    pick("bpc-157", "BPC-157", "Linked with tissue, tendon and gastrointestinal-repair research.", 1),
    pick("tb-500", "TB-500", "Linked with cell migration, tissue repair and recovery research.", 2),
    pick("ghk-cu", "GHK-Cu", "Linked with collagen, skin repair and wound-healing research.", 3),
  ] }),
  goal({ id: "sleep", label: "sleep", intentPhrases: ["sleep better", "sleep", "cannot sleep", "insomnia", "restful sleep", "deep sleep", "stay asleep", "rest better", "sleap"], picks: [
    pick("dsip-5mg", "DSIP", "Linked with sleep regulation, circadian rhythm and stress-response research.", 1),
  ] }),
  goal({ id: "weight-loss", label: "weight loss", intentPhrases: ["lose weight", "weight loss", "fat loss", "slimming", "slim down", "burn fat", "belly fat", "appetite suppression", "reduce appetite", "food noise", "weigth loss"], picks: [
    pick("retatrutide", "Retatrutide", "Triple GLP-1, GIP and glucagon receptor agonist studied in weight-loss research.", 1),
    pick("tirzepatide", "Tirzepatide", "Dual GIP and GLP-1 receptor agonist studied in appetite and weight research.", 2),
    pick("semaglutide", "Semaglutide", "GLP-1 receptor agonist studied in appetite, metabolic and weight research.", 3),
  ] }),
  goal({ id: "energy", label: "energy and mitochondrial research", intentPhrases: ["more energy", "energy", "enerjy", "low energy", "fatigue", "stamina", "endurance", "better stamina", "mitochondrial support"], picks: [
    pick("mots-c", "MOTS-C", "Linked with mitochondrial signalling, metabolism and exercise-capacity research.", 1),
    pick("nad-1000mg", "NAD+", "Linked with cellular energy and metabolic coenzyme research.", 2),
    pick("l-carnitine-5000mg", "L-Carnitine", "Linked with fatty-acid transport, energy metabolism and endurance research.", 3),
  ] }),
  goal({ id: "mental-health", label: "mental-health research", intentPhrases: ["mental wellbeing", "mental health research", "emotional health"], picks: [
    pick("selank", "Selank", "Linked with anxiety, stress-response and neuropeptide research.", 1),
    pick("semax", "Semax", "Linked with cognition, attention and neuroprotection research.", 2),
    pick("dsip-5mg", "DSIP", "Linked with sleep, stress-response and neuroendocrine research.", 3),
  ] }),
  goal({ id: "adhd-attention", label: "ADHD-related research", intentPhrases: ["adhd research", "attention deficit", "hyperactivity", "inattention"], picks: [
    pick("semax", "Semax", "The closest supplied research match for attention, but not established ADHD treatment evidence.", 1),
    pick("n-acetyl-semax-amidate", "N-Acetyl Semax Amidate", "Related to Semax-based attention and neuroprotection research, with limited direct evidence.", 2),
    pick("selank", "Selank", "An indirect stress and anxiety research link that may overlap with attention questions.", 3),
  ], caution: "No supplied product is established or approved as an ADHD treatment." }),
  goal({ id: "attention-executive", label: "attention and executive-function research", intentPhrases: ["focus", "cannot focus", "concentrate", "concentraition", "mental clarity", "poor concentration", "easily distracted", "executive function"], picks: [
    pick("semax", "Semax", "Linked most directly in the supplied library with attention and cognitive research.", 1),
    pick("dihexa", "Dihexa", "Linked with synaptic-plasticity, learning and cognition research.", 2),
    pick("selank", "Selank", "Linked indirectly through anxiety, stress and cognitive-performance research.", 3),
  ] }),
  goal({ id: "ocd-compulsive", label: "OCD and compulsive-behaviour research", intentPhrases: ["ocd research", "obsessive thoughts", "intrusive thoughts", "compulsive behaviour"], picks: [], caution: "The supplied shop catalogue has no reviewed direct shortlist for OCD or compulsive behaviour." }),
  goal({ id: "cognitive", label: "focus, memory and cognition", intentPhrases: ["memory", "brain fog", "think clearly", "cognitive support", "learn faster"], picks: [
    pick("semax", "Semax", "Linked with cognition, memory and neuroprotection research.", 1),
    pick("dihexa", "Dihexa", "Linked with synaptogenesis, learning and memory research.", 2),
    pick("n-acetyl-semax-amidate", "N-Acetyl Semax Amidate", "A Semax analogue linked with cognitive and neuroprotection research.", 3),
  ] }),
  goal({ id: "anxiety-stress", label: "anxiety and stress research", intentPhrases: ["anxiety", "anxiaty", "feel calmer", "calm me down", "stress relief", "panic", "overthinking"], picks: [
    pick("selank", "Selank", "Linked most directly with anxiety, stress-response and calming-pathway research.", 1),
    pick("semax", "Semax", "Linked indirectly through stress, cognition and neuroprotection research.", 2),
    pick("dsip-5mg", "DSIP", "Linked with stress-response, sleep and neuroendocrine research.", 3),
  ] }),
  goal({ id: "mood", label: "mood and depression research", intentPhrases: ["low mood", "depression research", "mood support", "nothing feels enjoyable"], picks: [
    pick("selank", "Selank", "Linked with anxiety, emotional processing and mood-related research.", 1),
    pick("semax", "Semax", "Linked indirectly with neuroplasticity, cognition and mood research.", 2),
    pick("dsip-5mg", "DSIP", "Linked indirectly through sleep and stress-response research.", 3),
  ] }),
  goal({ id: "immune", label: "immune and inflammation research", intentPhrases: ["immune support", "fight infection", "reduce inflammation", "immune research"], picks: [
    pick("thymosin-alpha-1", "Thymosin Alpha-1", "Linked with T-cell activity and immune-response research.", 1),
    pick("ll-37", "LL-37", "Linked with innate immunity and antimicrobial-peptide research.", 2),
    pick("kpv", "KPV", "Linked with anti-inflammatory signalling and gut-inflammation research.", 3),
  ] }),
  goal({ id: "cancer-research", label: "cancer research", intentPhrases: ["cancer research", "tumour research", "oncology research"], picks: [], caution: "The supplied shop catalogue has no reviewed customer-facing shortlist for cancer research." }),
  goal({ id: "longevity", label: "longevity and anti-ageing", intentPhrases: ["longevity", "healthy ageing", "anti ageing", "age better", "look younger"], picks: [
    pick("epithalon", "Epithalon", "Linked with telomere, ageing and circadian research.", 1),
    pick("nad-1000mg", "NAD+", "Linked with cellular energy, metabolism and age-related research.", 2),
    pick("mots-c", "MOTS-C", "Linked with mitochondrial function, metabolic resilience and ageing research.", 3),
  ] }),
  goal({ id: "cardiovascular", label: "cardiovascular research", intentPhrases: ["heart health", "blood pressure", "circulation", "cardiovascular research"], picks: [
    pick("b7-33", "B7-33", "Linked with relaxin-receptor, cardiovascular and anti-fibrotic research.", 1),
  ] }),
  goal({ id: "metabolic", label: "metabolic research", intentPhrases: ["metabolic health", "blood sugar", "glucose control", "insulin sensitivity"], picks: [
    pick("semaglutide", "Semaglutide", "GLP-1 receptor agonist linked with glucose-control and metabolic research.", 1),
    pick("tirzepatide", "Tirzepatide", "Dual GIP and GLP-1 agonist linked with glucose and metabolic research.", 2),
    pick("mots-c", "MOTS-C", "Linked with mitochondrial signalling and metabolic-homeostasis research.", 3),
  ] }),
  goal({ id: "fertility", label: "fertility research", intentPhrases: ["fertility", "fertility research", "trying to conceive", "ovulation", "ovulation research", "sperm health", "reproductive hormones"], picks: [
    pick("kisspeptin-54", "Kisspeptin-54", "Linked with reproductive-hormone signalling and ovulation research.", 1),
    pick("kisspeptin-10", "Kisspeptin-10", "Linked with GnRH signalling and reproductive-axis research.", 2),
    pick("gonadorelin", "Gonadorelin", "Linked with GnRH, LH and FSH response research.", 3),
  ] }),
  goal({ id: "sexual-health", label: "sexual health and function research", intentPhrases: ["libido", "sex drive", "sexual performance", "arousal", "arousal research", "erectile problems", "erectile function"], picks: [
    pick("pt-141", "PT-141", "Linked most directly with melanocortin pathways and sexual-function research.", 1),
    pick("kisspeptin-10", "Kisspeptin-10", "Linked with reproductive-hormone and sexual-response research.", 2),
    pick("melanotan-ii", "Melanotan II", "Linked with melanocortin research that included sexual-function outcomes.", 3),
  ] }),
  goal({ id: "hormonal", label: "hormonal research", intentPhrases: ["hormone research", "hormonal imbalance", "endocrine health", "testosterone research"], picks: [
    pick("kisspeptin-54", "Kisspeptin-54", "Linked with reproductive-axis and gonadotropin-signalling research.", 1),
    pick("gonadorelin", "Gonadorelin", "GnRH analogue linked with LH and FSH response research.", 2),
    pick("kisspeptin-10", "Kisspeptin-10", "Linked with GnRH and reproductive-hormone research.", 3),
  ] }),
  goal({ id: "gut-digestive", label: "gut and digestive research", intentPhrases: ["gut health", "gut problems", "stomach problems", "bowel health", "bowel problems", "leaky gut", "digestive health", "digestive repair"], picks: [
    pick("bpc-157", "BPC-157", "Linked with gastrointestinal tissue and gut-repair research.", 1),
    pick("kpv", "KPV", "Linked with intestinal inflammation and barrier research.", 2),
    pick("ghk-cu", "GHK-Cu", "Linked indirectly through tissue-repair and anti-inflammatory research.", 3),
  ] }),
  goal({ id: "pain", label: "pain and nerve-pain research", intentPhrases: ["pain research", "nerve pain", "chronic pain", "back pain"], picks: [
    pick("ara-290", "ARA-290", "Linked with neuropathic-pain and tissue-protection research.", 1),
    pick("bpc-157", "BPC-157", "Linked indirectly through injury and tissue-repair research.", 2),
    pick("tb-500", "TB-500", "Linked indirectly through recovery and tissue-repair research.", 3),
  ] }),
  goal({ id: "joint-cartilage", label: "joint and cartilage research", intentPhrases: ["joint pain", "joint health", "cartilage", "arthritis research"], picks: [
    pick("bpc-157", "BPC-157", "Linked with tendon, ligament and connective-tissue repair research.", 1),
    pick("tb-500", "TB-500", "Linked with tissue-repair and recovery research.", 2),
    pick("ghk-cu", "GHK-Cu", "Linked with collagen and connective-tissue research.", 3),
  ] }),
  goal({ id: "skin-collagen", label: "skin, collagen and cosmetic research", intentPhrases: ["better skin", "glowing skin", "skin health", "skinn health", "skin repair", "skin glow", "collagen", "collagen research", "wrinkles", "scars", "acne", "spots", "eczema"], picks: [
    pick("ghk-cu", "GHK-Cu", "Linked most directly with collagen, skin-remodelling and wound research.", 1),
    pick("kpv", "KPV", "Linked with skin inflammation and melanocortin-related research.", 2),
    pick("bpc-157", "BPC-157", "Linked indirectly through tissue-repair research.", 3),
  ], caution: "These are related skin, inflammation and repair records. The supplied evidence does not establish them as acne or eczema treatments." }),
  goal({ id: "hair", label: "hair and follicle research", intentPhrases: ["hair growth", "hair loss", "hair thinning", "thinning hair", "thining hair", "alopecia", "alopecia research"], picks: [
    pick("ghk-cu", "GHK-Cu", "The closest supplied match for hair-follicle and skin-remodelling research.", 1),
  ] }),
  goal({ id: "bone", label: "bone research", intentPhrases: ["bone health", "stronger bones", "fracture healing"], picks: [
    pick("bpc-157", "BPC-157", "Linked indirectly with tissue and injury-repair research.", 1),
  ], caution: "The supplied catalogue has no strong direct bone-research shortlist; these links are indirect." }),
  goal({ id: "migraine", label: "migraine research", intentPhrases: ["migraine research", "bad headaches", "headache studies"], picks: [], caution: "The supplied shop catalogue has no reviewed direct migraine-research shortlist." }),
  goal({ id: "liver", label: "liver research", intentPhrases: ["liver health", "fatty liver", "liver support"], picks: [
    pick("mots-c", "MOTS-C", "Linked indirectly with mitochondrial and metabolic research relevant to liver questions.", 1),
  ], caution: "The supplied catalogue has no strong direct liver-research shortlist; these links are indirect." }),
  goal({ id: "kidney", label: "kidney and renal research", intentPhrases: ["kidney health", "renal research", "protect kidneys"], picks: [], caution: "The supplied shop catalogue has no reviewed direct kidney-research shortlist." }),
  goal({ id: "respiratory", label: "lung and respiratory research", intentPhrases: ["lung health", "breathing problems", "respiratory research"], picks: [], caution: "The supplied shop catalogue has no reviewed direct respiratory-research shortlist." }),
  goal({ id: "neurodegeneration", label: "neurodegeneration research", intentPhrases: ["memory decline", "brain ageing", "neurodegenerative research", "protect brain cells"], picks: [
    pick("semax", "Semax", "Linked with neuroprotection and cognitive research.", 1),
    pick("dihexa", "Dihexa", "Linked with synaptic-plasticity and neuronal research.", 2),
    pick("n-acetyl-semax-amidate", "N-Acetyl Semax Amidate", "A Semax analogue linked with neuroprotection research.", 3),
  ] }),
  goal({ id: "growth-hormone", label: "growth-hormone and IGF research", intentPhrases: ["growth hormone research", "raise growth hormone", "gh research", "igf research"], picks: [
    pick("cjc-1295", "CJC-1295", "GHRH analogue linked with growth-hormone and IGF-1 signalling research.", 1),
    pick("ipamorelin", "Ipamorelin", "Growth-hormone secretagogue linked with GH-release research.", 2),
    pick("sermorelin", "Sermorelin", "GHRH analogue linked with pituitary growth-hormone research.", 3),
  ] }),
  goal({ id: "pigmentation", label: "pigmentation and melanocortin research", intentPhrases: ["get a tan", "sun tan", "tan my skin", "skin darker", "get brown", "go brown", "get darker", "bronze my skin", "tanning", "tannning", "pigmentation"], picks: [
    pick("melanotan-ii", "MT2 (Melanotan II)", "The primary supplied compound linked with melanin production and tanning research.", 1),
  ] }),
  goal({ id: "fibrosis", label: "fibrosis research", intentPhrases: ["fibrosis research", "scar tissue", "organ scarring"], picks: [
    pick("b7-33", "B7-33", "Linked most directly with relaxin-receptor and anti-fibrotic research.", 1),
  ] }),
  goal({ id: "brain-injury", label: "brain injury and stroke research", intentPhrases: ["brain injury", "stroke recovery", "protect brain cells"], picks: [
    pick("semax", "Semax", "Linked with neuroprotection and brain-injury research.", 1),
    pick("dihexa", "Dihexa", "Linked indirectly with neural repair and synaptic-plasticity research.", 2),
    pick("n-acetyl-semax-amidate", "N-Acetyl Semax Amidate", "A Semax analogue linked with neuroprotection research.", 3),
  ] }),
  goal({ id: "performance", label: "exercise and athletic-performance research", intentPhrases: ["athletic performance", "sports performance", "exercise endurance", "training recovery"], picks: [
    pick("mots-c", "MOTS-C", "Linked with mitochondrial signalling and exercise-capacity research.", 1),
    pick("l-carnitine-5000mg", "L-Carnitine", "Linked with fatty-acid transport, endurance and recovery research.", 2),
    pick("slu-pp-332", "SLU-PP-332", "Exercise-mimetic compound linked with metabolic activity and endurance research.", 3),
  ] }),
  goal({ id: "dopamine", label: "dopamine-related research", intentPhrases: ["dopamine research", "motivation pathway", "reward system"], picks: [
    pick("semax", "Semax", "Linked indirectly with dopamine signalling, attention and cognition research.", 1),
  ], caution: "A dopamine-pathway link is not evidence that a product treats a mood or attention condition." }),
  goal({ id: "serotonin", label: "serotonin-related research", intentPhrases: ["serotonin research", "serotonin pathway", "mood pathway"], picks: [
    pick("selank", "Selank", "The closest supplied match for anxiety, mood and neurotransmitter-pathway research.", 1),
  ], caution: "A serotonin-pathway link is not evidence that a product treats a mood condition." }),
  goal({ id: "gaba", label: "GABA-related research", intentPhrases: ["gaba research", "calming pathway", "inhibitory signalling"], picks: [
    pick("selank", "Selank", "Linked with GABA-related, anxiety and stress-response research.", 1),
  ], caution: "A GABA-pathway link is not evidence that a product treats anxiety or another condition." }),
  goal({ id: "bdnf-neuroplasticity", label: "BDNF and neuroplasticity research", intentPhrases: ["bdnf research", "brain plasticity", "learning pathway", "brain growth factor"], picks: [
    pick("semax", "Semax", "Linked with BDNF, neuroprotection and cognitive research.", 1),
    pick("dihexa", "Dihexa", "Linked with synaptogenesis and neuroplasticity research.", 2),
    pick("n-acetyl-semax-amidate", "N-Acetyl Semax Amidate", "A Semax analogue linked with neuroplasticity research.", 3),
  ] }),
];

export const GOAL_GUIDANCE_BY_ID = new Map(GOAL_GUIDANCE.map((item) => [item.id, item]));

/* Every shop product is classified. goalIds means it may appear in a reviewed
 * goal shortlist. supplyOnly means PEARL may explain the named item, but it
 * must not surface it as a general goal answer until a reviewed map adds it. */
const mapped = (slug, goalIds) => ({ slug, goalIds, supplyOnly: false });
const supplyOnly = (slug, reason = "Named-product information only; no reviewed general-goal placement.") => ({ slug, goalIds: [], supplyOnly: true, reason });

export const SUPPLIED_PRODUCT_GUIDANCE = [
  mapped("aod-9604", ["weight-loss"]), mapped("retatrutide", ["weight-loss"]), mapped("semaglutide", ["weight-loss", "metabolic"]),
  mapped("tirzepatide", ["weight-loss", "metabolic"]), mapped("tesamorelin", ["growth-hormone"]), mapped("mots-c", ["energy", "metabolic", "longevity", "liver", "performance"]),
  mapped("sermorelin", ["growth-hormone"]), mapped("hgh-fragment-176-191", ["weight-loss"]), mapped("hexarelin", ["growth-hormone"]),
  mapped("igf-1-lr3", ["muscle-growth", "growth-hormone"]), mapped("peg-mgf", ["muscle-growth"]), mapped("cagrilintide", ["weight-loss"]),
  mapped("gonadorelin", ["fertility", "hormonal"]), mapped("kisspeptin-10", ["fertility", "sexual-health", "hormonal"]), mapped("kisspeptin-54", ["fertility", "hormonal"]),
  mapped("triptorelin", ["hormonal"]), mapped("b7-33", ["cardiovascular", "fibrosis"]), mapped("pt-141", ["sexual-health"]),
  mapped("selank", ["mental-health", "adhd-attention", "attention-executive", "cognitive", "anxiety-stress", "mood", "serotonin", "gaba"]),
  mapped("semax", ["mental-health", "adhd-attention", "attention-executive", "cognitive", "anxiety-stress", "mood", "neurodegeneration", "brain-injury", "dopamine", "bdnf-neuroplasticity"]),
  mapped("n-acetyl-semax-amidate", ["adhd-attention", "attention-executive", "cognitive", "neurodegeneration", "brain-injury", "bdnf-neuroplasticity"]),
  mapped("dihexa", ["attention-executive", "cognitive", "neurodegeneration", "brain-injury", "bdnf-neuroplasticity"]), mapped("pinealon", ["cognitive", "longevity"]),
  mapped("vesugen", ["cardiovascular"]), mapped("melanotan-i", ["pigmentation"]), mapped("melanotan-ii", ["pigmentation", "sexual-health"]),
  mapped("bpc-157", ["healing", "gut-digestive", "pain", "joint-cartilage", "skin-collagen", "bone"]), mapped("ghk-cu", ["healing", "gut-digestive", "joint-cartilage", "skin-collagen", "hair"]),
  mapped("tb-500", ["healing", "pain", "joint-cartilage", "bone"]), mapped("epithalon", ["longevity"]), mapped("kpv", ["immune", "gut-digestive", "skin-collagen"]),
  mapped("ll-37", ["immune"]), mapped("thymosin-alpha-1", ["immune"]), mapped("ara-290", ["pain"]), mapped("follistatin-344", ["muscle-growth"]),
  mapped("follistatin-315", ["muscle-growth"]), mapped("cjc-1295", ["growth-hormone"]), mapped("ghrp-2", ["growth-hormone"]), mapped("ghrp-6", ["growth-hormone"]),
  mapped("ipamorelin", ["growth-hormone"]), mapped("igf-1-des", ["muscle-growth", "growth-hormone"]), mapped("mgf", ["muscle-growth"]),
  supplyOnly("peptide-complex", "Catalogue grouping, not one compound or a reviewed goal answer."), mapped("retatrutide-pen", ["weight-loss"]),
  mapped("retatrutide-pen-slimfinity-40mg", ["weight-loss"]), mapped("retatrutide-pen-synedica-40mg", ["weight-loss"]), mapped("tirzepatide-pen", ["weight-loss"]),
  mapped("tirzepatide-pen-lean-luxe-60mg", ["weight-loss"]), mapped("mt2-tanning-pen", ["pigmentation"]), mapped("glow-pen", ["skin-collagen", "healing"]),
  mapped("wolverine-recovery-pen", ["healing", "joint-cartilage"]), mapped("wolverine-blend", ["healing", "joint-cartilage"]),
  supplyOnly("bac-water", "Laboratory supply; never a goal recommendation."), mapped("5-amino-1mq-100mg", ["weight-loss", "metabolic"]),
  mapped("nad-1000mg", ["energy", "metabolic", "longevity", "liver"]), mapped("l-carnitine-5000mg", ["energy", "performance"]),
  mapped("cjc-1295-no-dac-ipamorelin-10mg", ["growth-hormone"]), supplyOnly("acetic-acid-06-10ml", "Laboratory supply; never a goal recommendation."),
  mapped("dsip-5mg", ["sleep", "mental-health", "anxiety-stress", "mood"]), mapped("slu-pp-332", ["energy", "weight-loss", "performance"]),
  mapped("hgh191aa", ["muscle-growth", "growth-hormone", "performance"]),
];

export const SUPPLIED_PRODUCT_GUIDANCE_BY_SLUG = new Map(SUPPLIED_PRODUCT_GUIDANCE.map((item) => [item.slug, item]));

export function validateGoalGuidance({ topicIds = [], productSlugs = [] } = {}) {
  const errors = [];
  const goalIds = GOAL_GUIDANCE.map((item) => item.id);
  const suppliedSlugs = SUPPLIED_PRODUCT_GUIDANCE.map((item) => item.slug);
  const duplicate = (values) => values.filter((value, index) => values.indexOf(value) !== index);
  for (const id of duplicate(goalIds)) errors.push(`Duplicate goal id: ${id}`);
  for (const slug of duplicate(suppliedSlugs)) errors.push(`Duplicate supplied product: ${slug}`);
  for (const id of topicIds) if (!GOAL_GUIDANCE_BY_ID.has(id)) errors.push(`Missing topic guidance: ${id}`);
  for (const slug of productSlugs) if (!SUPPLIED_PRODUCT_GUIDANCE_BY_SLUG.has(slug)) errors.push(`Unclassified supplied product: ${slug}`);
  for (const item of GOAL_GUIDANCE) {
    if (![0, 1, 3].includes(item.shortlist.length)) errors.push(`${item.id} must have zero, one or three reviewed picks`);
    item.shortlist.forEach((entry, index) => {
      if (entry.rank !== index + 1) errors.push(`${item.id} has a broken rank sequence`);
      if (!SUPPLIED_PRODUCT_GUIDANCE_BY_SLUG.has(entry.slug)) errors.push(`${item.id} uses a product outside the supplied catalogue: ${entry.slug}`);
      if (!entry.oneLine || entry.oneLine.length > 140) errors.push(`${item.id}/${entry.slug} needs a concise approved explanation`);
      if (!entry.sourceBasis?.length) errors.push(`${item.id}/${entry.slug} has no source basis`);
    });
  }
  for (const product of SUPPLIED_PRODUCT_GUIDANCE) {
    if (product.supplyOnly === !product.goalIds.length) continue;
    errors.push(`${product.slug} must be either goal-mapped or explicitly supply-only`);
  }
  return errors;
}
