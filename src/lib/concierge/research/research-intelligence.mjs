/*
 * PEARL research intelligence layer.
 *
 * This file does not add medical claims. It organises the wording already in
 * the approved research library so PEARL can explain whether a source is
 * directly about a question, related through a symptom, or connected only by
 * a biological mechanism.
 */

function normaliseText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function includesTerm(text, term) {
  const haystack = ` ${normaliseText(text)} `;
  const needle = normaliseText(term);
  if (!needle) return false;
  return haystack.includes(` ${needle} `) || (needle.length >= 5 && haystack.includes(needle));
}

function matchingTerms(text, terms) {
  return unique((terms || []).filter((term) => includesTerm(text, term)));
}

export const CONCEPT_METADATA = [
  {
    id: "muscle-growth",
    bodySystems: ["musculoskeletal", "endocrine"],
    conditions: ["muscle wasting", "sarcopenia"],
    symptoms: ["low muscle mass", "reduced strength", "poor exercise recovery"],
    mechanisms: ["igf-1", "growth hormone", "protein synthesis", "hypertrophy", "anabolic signalling"],
    layTerms: ["build muscle", "gain size", "get stronger", "put on muscle", "exercise performance"],
  },
  {
    id: "healing",
    bodySystems: ["musculoskeletal", "skin", "gastrointestinal"],
    conditions: ["wound", "tendon injury", "ligament injury", "soft tissue injury"],
    symptoms: ["slow healing", "injury recovery", "damaged tissue"],
    mechanisms: ["angiogenesis", "collagen", "cell migration", "tissue repair"],
    layTerms: ["heal faster", "recover from injury", "repair tissue", "damaged tendon", "damaged ligament"],
  },
  {
    id: "sleep",
    bodySystems: ["neurological", "circadian"],
    conditions: ["insomnia", "narcolepsy", "circadian rhythm disorder"],
    symptoms: ["poor sleep", "daytime sleepiness", "difficulty sleeping", "broken sleep", "not feeling rested"],
    mechanisms: ["melatonin", "orexin", "sleep architecture", "circadian rhythm"],
    layTerms: ["sleep better", "deep sleep", "stay asleep", "feel rested", "sleep cycle"],
  },
  {
    id: "weight-loss",
    bodySystems: ["metabolic", "gastrointestinal", "endocrine"],
    conditions: ["obesity", "overweight"],
    symptoms: ["increased appetite", "food cravings", "weight gain"],
    mechanisms: ["glp-1", "gip", "glucagon", "amylin", "gastric emptying", "satiety"],
    layTerms: ["lose weight", "reduce appetite", "feel full", "fat loss", "food noise"],
  },
  {
    id: "energy",
    bodySystems: ["mitochondrial", "metabolic", "musculoskeletal"],
    conditions: ["fatigue", "mitochondrial dysfunction"],
    symptoms: ["low energy", "tiredness", "poor stamina", "exercise intolerance", "exhaustion"],
    mechanisms: ["mitochondria", "atp", "oxidative phosphorylation", "cellular energy"],
    layTerms: ["more energy", "always tired", "chronic fatigue", "better stamina", "less exhausted"],
  },
  {
    id: "mental-health",
    bodySystems: ["neurological", "psychiatric"],
    conditions: ["anxiety", "depression", "stress-related disorder", "attention disorder"],
    symptoms: ["low mood", "worry", "poor concentration", "emotional distress"],
    mechanisms: ["gaba", "serotonin", "dopamine", "bdnf", "neuroplasticity"],
    layTerms: ["mental wellbeing", "emotional health", "feel calmer", "mental health research"],
  },
  {
    id: "adhd-attention",
    bodySystems: ["neurological", "psychiatric"],
    conditions: ["adhd", "attention deficit hyperactivity disorder", "attention deficit disorder"],
    symptoms: ["inattention", "hyperactivity", "impulsivity", "distractibility", "poor concentration"],
    mechanisms: ["dopamine", "bdnf", "executive function", "attention"],
    layTerms: ["cannot focus", "easily distracted", "attention problems", "adhd research", "add research"],
  },
  {
    id: "attention-executive",
    bodySystems: ["neurological"],
    conditions: ["executive dysfunction", "attention impairment"],
    symptoms: ["poor concentration", "distractibility", "difficulty planning", "difficulty focusing"],
    mechanisms: ["attention", "executive function", "dopamine", "bdnf", "working memory"],
    layTerms: ["cannot concentrate", "mind wanders", "struggle to plan", "easily distracted"],
  },
  {
    id: "cognitive",
    bodySystems: ["neurological"],
    conditions: ["cognitive impairment", "memory impairment"],
    symptoms: ["brain fog", "poor memory", "slow thinking", "difficulty learning", "poor focus"],
    mechanisms: ["neuroplasticity", "bdnf", "ngf", "synaptogenesis", "neuroprotection"],
    layTerms: ["think more clearly", "remember things", "learn faster", "mental sharpness", "clear brain fog"],
  },
  {
    id: "ocd-compulsive",
    bodySystems: ["neurological", "psychiatric"],
    conditions: ["ocd", "obsessive compulsive disorder"],
    symptoms: ["obsessive thoughts", "intrusive thoughts", "compulsive behaviour", "compulsive behavior", "repetitive behaviour", "repetitive behavior"],
    mechanisms: ["glutamate", "oxidative stress", "serotonin", "cortico striatal"],
    layTerms: ["cannot stop thoughts", "repeating things", "obsessions", "compulsions", "unwanted thoughts"],
  },
  {
    id: "anxiety-stress",
    bodySystems: ["neurological", "psychiatric", "endocrine"],
    conditions: ["generalized anxiety disorder", "social anxiety", "panic disorder", "ptsd"],
    symptoms: ["worry", "panic", "nervousness", "rumination", "stress", "fear"],
    mechanisms: ["gaba", "serotonin", "hpa axis", "fear extinction", "enkephalin"],
    layTerms: ["feel calmer", "stop worrying", "stress relief", "panic attacks", "overthinking"],
  },
  {
    id: "mood",
    bodySystems: ["neurological", "psychiatric"],
    conditions: ["depression", "depressive disorder", "mood disorder"],
    symptoms: ["low mood", "anhedonia", "loss of interest", "feeling depressed"],
    mechanisms: ["serotonin", "dopamine", "trek-1", "bdnf", "neuroplasticity"],
    layTerms: ["feel low", "nothing feels enjoyable", "mood support", "depression research"],
  },
  {
    id: "immune",
    bodySystems: ["immune"],
    conditions: ["immune dysfunction", "infection", "inflammatory disorder"],
    symptoms: ["frequent infections", "inflammation", "poor immune response"],
    mechanisms: ["t cells", "cytokines", "innate immunity", "adaptive immunity", "anti inflammatory"],
    layTerms: ["immune problems", "fight infection", "immune support", "reduce inflammation"],
  },
  {
    id: "cancer-research",
    bodySystems: ["oncology"],
    conditions: ["cancer", "tumour", "tumor", "leukaemia", "leukemia"],
    symptoms: [],
    mechanisms: ["apoptosis", "angiogenesis", "tumour growth", "tumor growth", "immune surveillance"],
    layTerms: ["cancer research", "tumour research", "anti cancer studies"],
  },
  {
    id: "longevity",
    bodySystems: ["ageing", "metabolic", "cellular"],
    conditions: ["age-related decline", "cellular senescence"],
    symptoms: ["reduced resilience", "age-related decline"],
    mechanisms: ["senescence", "telomere", "autophagy", "mitochondria", "dna repair"],
    layTerms: ["healthy ageing", "age better", "live longer", "anti ageing", "longevity research"],
  },
  {
    id: "cardiovascular",
    bodySystems: ["cardiovascular"],
    conditions: ["hypertension", "heart failure", "vascular disease"],
    symptoms: ["high blood pressure", "poor circulation"],
    mechanisms: ["vasodilation", "angiogenesis", "endothelial function", "cardiac remodelling"],
    layTerms: ["heart health", "blood pressure", "better circulation", "cardiovascular research"],
  },
  {
    id: "metabolic",
    bodySystems: ["metabolic", "endocrine"],
    conditions: ["diabetes", "insulin resistance", "metabolic syndrome"],
    symptoms: ["high blood sugar", "poor glucose control"],
    mechanisms: ["insulin", "glucose", "glp-1", "metabolic rate"],
    layTerms: ["blood sugar", "metabolic health", "insulin sensitivity", "glucose control"],
  },
  {
    id: "fertility",
    bodySystems: ["reproductive", "endocrine"],
    conditions: ["infertility", "anovulation", "hypogonadism"],
    symptoms: ["difficulty conceiving", "low sperm count", "irregular ovulation"],
    mechanisms: ["gnrh", "lh", "fsh", "kisspeptin", "ovulation", "spermatogenesis"],
    layTerms: ["trying to conceive", "sperm health", "egg release", "fertility research"],
  },
  {
    id: "sexual-health",
    bodySystems: ["reproductive", "neurological", "endocrine"],
    conditions: ["erectile dysfunction", "hypoactive sexual desire disorder", "sexual dysfunction"],
    symptoms: ["low libido", "reduced arousal", "erection problems"],
    mechanisms: ["melanocortin", "kisspeptin", "oxytocin", "nitric oxide"],
    layTerms: ["sex drive", "sexual function", "libido", "arousal research"],
  },
  {
    id: "hormonal",
    bodySystems: ["endocrine", "reproductive"],
    conditions: ["hormone deficiency", "menopause", "hypogonadism", "endocrine disorder"],
    symptoms: ["hormonal imbalance", "low testosterone", "menopause symptoms"],
    mechanisms: ["gnrh", "lh", "fsh", "testosterone", "estrogen", "progesterone"],
    layTerms: ["balance hormones", "hormonal imbalance", "hormone problems", "endocrine health"],
  },
  {
    id: "gut-digestive",
    bodySystems: ["gastrointestinal"],
    conditions: ["ibs", "ibd", "colitis", "constipation", "short bowel syndrome"],
    symptoms: ["gut problems", "digestive problems", "abdominal discomfort", "poor digestion"],
    mechanisms: ["intestinal barrier", "gut motility", "tight junction", "mucosal healing"],
    layTerms: ["gut health", "stomach problems", "bowel problems", "leaky gut", "digestive health"],
  },
  {
    id: "pain",
    bodySystems: ["neurological", "musculoskeletal"],
    conditions: ["neuropathic pain", "fibromyalgia", "chronic pain"],
    symptoms: ["nerve pain", "back pain", "persistent pain"],
    mechanisms: ["nociception", "opioid receptor", "ion channel", "neuroinflammation"],
    layTerms: ["pain relief", "nerve pain", "chronic pain", "pain research"],
  },
  {
    id: "joint-cartilage",
    bodySystems: ["musculoskeletal"],
    conditions: ["osteoarthritis", "arthritis", "cartilage injury"],
    symptoms: ["joint pain", "stiff joints", "cartilage damage"],
    mechanisms: ["cartilage", "collagen", "chondrocyte", "connective tissue"],
    layTerms: ["joint health", "worn cartilage", "stiff joints", "arthritis research"],
  },
  {
    id: "skin-collagen",
    bodySystems: ["skin"],
    conditions: ["skin ageing", "scarring"],
    symptoms: ["wrinkles", "poor skin elasticity", "skin damage", "scars"],
    mechanisms: ["collagen", "elastin", "fibroblast", "wound healing"],
    layTerms: ["better skin", "skin glow", "reduce wrinkles", "collagen research"],
  },
  {
    id: "hair",
    bodySystems: ["skin", "hair follicle"],
    conditions: ["alopecia", "hair loss"],
    symptoms: ["thinning hair", "poor hair growth"],
    mechanisms: ["hair follicle", "wnt signalling", "dermal papilla"],
    layTerms: ["grow hair", "stop hair loss", "thinning hair", "hair growth research"],
  },
  {
    id: "bone",
    bodySystems: ["musculoskeletal"],
    conditions: ["osteoporosis", "fracture", "low bone density"],
    symptoms: ["weak bones", "slow fracture healing"],
    mechanisms: ["bone formation", "osteoblast", "osteoclast", "bone density"],
    layTerms: ["stronger bones", "heal a fracture", "bone health"],
  },
  {
    id: "migraine",
    bodySystems: ["neurological", "vascular"],
    conditions: ["migraine", "headache disorder"],
    symptoms: ["headache", "migraine attack"],
    mechanisms: ["cgrp", "pacap", "vasodilation", "trigeminal"],
    layTerms: ["migraine research", "bad headaches", "headache studies"],
  },
  {
    id: "liver",
    bodySystems: ["hepatic", "metabolic"],
    conditions: ["fatty liver", "nafld", "nash", "mash", "liver fibrosis"],
    symptoms: ["poor liver health"],
    mechanisms: ["hepatic fat", "liver inflammation", "fibrosis"],
    layTerms: ["liver health", "fatty liver", "liver support"],
  },
  {
    id: "kidney",
    bodySystems: ["renal"],
    conditions: ["chronic kidney disease", "kidney injury"],
    symptoms: ["poor kidney function"],
    mechanisms: ["renal protection", "kidney fibrosis", "glomerular"],
    layTerms: ["kidney health", "renal research", "protect kidneys"],
  },
  {
    id: "respiratory",
    bodySystems: ["respiratory"],
    conditions: ["copd", "ards", "pulmonary fibrosis", "airway disease"],
    symptoms: ["breathing difficulty", "poor lung function"],
    mechanisms: ["airway inflammation", "lung repair", "pulmonary fibrosis"],
    layTerms: ["lung health", "breathing problems", "respiratory research"],
  },
  {
    id: "neurodegeneration",
    bodySystems: ["neurological"],
    conditions: ["alzheimer disease", "dementia", "parkinson disease", "als", "multiple sclerosis"],
    symptoms: ["memory decline", "cognitive decline", "movement problems"],
    mechanisms: ["neuroprotection", "protein aggregation", "neuroinflammation", "neuronal survival"],
    layTerms: ["protect the brain", "memory decline", "brain ageing", "neurodegenerative research"],
  },
  {
    id: "growth-hormone",
    bodySystems: ["endocrine", "musculoskeletal"],
    conditions: ["growth hormone deficiency"],
    symptoms: ["low growth hormone"],
    mechanisms: ["growth hormone", "ghrh", "ghrp", "igf-1", "pituitary"],
    layTerms: ["raise growth hormone", "gh research", "igf research"],
  },
  {
    id: "pigmentation",
    bodySystems: ["skin"],
    conditions: ["erythropoietic protoporphyria", "photodermatosis"],
    symptoms: ["photosensitivity", "reduced pigmentation"],
    mechanisms: ["melanin", "melanocortin", "melanogenesis"],
    layTerms: ["tanning research", "skin pigmentation", "sun sensitivity"],
  },
  {
    id: "fibrosis",
    bodySystems: ["connective tissue", "organ systems"],
    conditions: ["fibrosis", "tissue scarring"],
    symptoms: ["organ scarring"],
    mechanisms: ["fibroblast", "collagen deposition", "tgf beta", "anti fibrotic"],
    layTerms: ["scar tissue", "organ fibrosis", "anti fibrosis research"],
  },
  {
    id: "brain-injury",
    bodySystems: ["neurological"],
    conditions: ["stroke", "traumatic brain injury", "tbi"],
    symptoms: ["brain injury recovery", "neurological impairment"],
    mechanisms: ["neuroprotection", "neural repair", "bdnf", "cerebral ischemia"],
    layTerms: ["recover after stroke", "brain injury", "protect brain cells"],
  },
  {
    id: "performance",
    bodySystems: ["musculoskeletal", "cardiovascular", "metabolic"],
    conditions: [],
    symptoms: ["poor endurance", "reduced stamina", "slow exercise recovery"],
    mechanisms: ["oxygen use", "mitochondria", "atp", "growth hormone", "muscle recovery"],
    layTerms: ["athletic performance", "sports performance", "workout performance", "exercise endurance", "recover from training"],
  },
  {
    id: "dopamine",
    bodySystems: ["neurological"],
    conditions: [],
    symptoms: ["motivation", "attention", "reward processing"],
    mechanisms: ["dopamine", "dopaminergic", "dopamine receptor", "dopamine release"],
    layTerms: ["dopamine research", "motivation pathway", "reward system"],
  },
  {
    id: "serotonin",
    bodySystems: ["neurological", "gastrointestinal"],
    conditions: [],
    symptoms: ["mood", "anxiety", "emotional processing"],
    mechanisms: ["serotonin", "serotonergic", "5-ht receptor"],
    layTerms: ["serotonin research", "mood pathway"],
  },
  {
    id: "gaba",
    bodySystems: ["neurological"],
    conditions: [],
    symptoms: ["anxiety", "calmness", "neural excitability"],
    mechanisms: ["gaba", "gabaergic", "gaba-a receptor", "inhibitory neurotransmission"],
    layTerms: ["gaba research", "calming pathway", "inhibitory signalling"],
  },
  {
    id: "bdnf-neuroplasticity",
    bodySystems: ["neurological"],
    conditions: [],
    symptoms: ["learning", "memory", "cognitive recovery"],
    mechanisms: ["bdnf", "brain derived neurotrophic factor", "neuroplasticity", "synaptic plasticity"],
    layTerms: ["brain growth factor", "brain plasticity", "learning pathway", "bdnf research"],
  },
];

export const CONCEPT_BY_ID = new Map(CONCEPT_METADATA.map((concept) => [concept.id, concept]));

export function enrichTopicWithConcept(topic) {
  const concept = CONCEPT_BY_ID.get(topic.id);
  if (!concept) return topic;
  return {
    ...topic,
    concept,
    terms: unique([
      ...(topic.terms || []),
      ...concept.conditions,
      ...concept.symptoms,
      ...concept.mechanisms,
      ...concept.layTerms,
    ]),
  };
}

/*
 * MATCHING WINDOW (Pearl plan Stage C step 4). Topic membership and study
 * classification match keywords against the claim text. That matching was
 * calibrated when summaries were cut at 420 characters and evidence and
 * mechanism at 520. Step 4 stores the full text for members to read, but the
 * matchers keep reading the old windows, so no compound silently joins or
 * leaves a topic because a longer paragraph happens to mention a word.
 * Searching the full stored text properly is Stage D work, behind a switch.
 */
const MATCH_SUMMARY_WINDOW = 420;
const MATCH_PROSE_WINDOW = 520;

function claimText(profile, claim) {
  return {
    direct: normaliseText([
      profile?.name,
      profile?.fullName,
      ...(profile?.aliases || []),
      ...(profile?.categories || []),
      String(claim?.summary || "").slice(0, MATCH_SUMMARY_WINDOW),
      String(claim?.evidence || "").slice(0, MATCH_PROSE_WINDOW),
      ...(claim?.topics || []),
      ...(claim?.references || []).slice(0, 6).map((reference) => reference.title),
    ].join(" ")),
    mechanism: normaliseText(String(claim?.mechanism || "").slice(0, MATCH_PROSE_WINDOW)),
    limitations: normaliseText((claim?.limitations || []).slice(0, 4).join(" ")),
    protocol: normaliseText((claim?.protocols || []).map((protocol) => [
      protocol.label,
      protocol.population,
      protocol.species,
      protocol.evidenceType,
    ].join(" ")).join(" ")),
  };
}

export function studyTypeForClaim(claim) {
  /* Classifies on the pre-step-4 evidence window; see MATCH_PROSE_WINDOW. */
  const evidenceText = normaliseText(String(claim?.evidence || "").slice(0, MATCH_PROSE_WINDOW));
  const text = normaliseText([
    String(claim?.evidence || "").slice(0, MATCH_PROSE_WINDOW),
    ...(claim?.references || []).slice(0, 6).map((reference) => reference.title),
    ...(claim?.protocols || []).slice(0, 4).map((protocol) => protocol.evidenceType),
  ].join(" "));
  if (/systematic review|meta analysis/.test(evidenceText)) return "Systematic review or meta-analysis";
  if (/randomized|randomised|double blind|placebo controlled|controlled trial|\brct\b/.test(text)) return "Randomized or controlled human research";
  if ((claim?.humanStudies || 0) > 0) return "Human clinical research";
  if (/systematic review|meta analysis/.test(text)) return "Systematic review or meta-analysis";
  if (/phase [1234]|clinical trial|human trial|patients|participants|volunteers/.test(text)) return "Human clinical research";
  if (/observational|cohort|case control|case series|case report|retrospective/.test(text)) return "Observational or case-based human research";
  if (/animal|mouse|mice|rat|rodent|rabbit|porcine|canine|monkey/.test(text)) return "Animal research";
  if (/in vitro|cell culture|cells|laboratory|molecular|mechanistic/.test(text)) return "Laboratory or mechanistic research";
  if (/review|guideline|official label|medicine label/.test(text)) return "Review or official medicine information";
  return "Source summary; study design not clearly stated";
}

export function populationForClaim(claim) {
  const protocolSpecies = unique((claim?.protocols || []).slice(0, 4).map((protocol) => protocol.species).filter((value) => value && value !== "Not stated"));
  /* Classifies on the pre-step-4 evidence window; see MATCH_PROSE_WINDOW. */
  const text = normaliseText([
    String(claim?.evidence || "").slice(0, MATCH_PROSE_WINDOW),
    ...(claim?.references || []).slice(0, 6).map((reference) => reference.title),
    ...(claim?.protocols || []).slice(0, 4).map((protocol) => `${protocol.population} ${protocol.species}`),
  ].join(" "));
  if ((claim?.humanStudies || 0) > 0 || protocolSpecies.some((species) => /human/i.test(species)) || /human evidence|human research|patients|participants|volunteers|human study|human trial|clinical trial|randomized|randomised|\brct\b/.test(text)) return "Human";
  if (protocolSpecies.length) return protocolSpecies.join(", ");
  if (/mouse|mice|rat|rodent|rabbit|porcine|canine|monkey|animal/.test(text)) return "Animal";
  if (/in vitro|cell culture|cells|laboratory/.test(text)) return "Laboratory";
  return "Not clearly stated";
}

export function evidenceStrengthForClaim(claim) {
  const studyType = studyTypeForClaim(claim);
  const population = populationForClaim(claim);
  if (studyType === "Systematic review or meta-analysis" && population === "Human") return "Higher-level human evidence";
  if (studyType === "Randomized or controlled human research") return "Direct controlled human evidence";
  if (studyType === "Human clinical research") return "Human evidence with design limitations to check";
  if (studyType === "Observational or case-based human research") return "Limited observational human evidence";
  if (population === "Animal") return "Preclinical animal evidence";
  if (population === "Laboratory") return "Early laboratory evidence";
  return "Evidence level is not fully described by the source";
}

export function relationshipForClaim(profile, claim, topic) {
  const concept = topic?.concept || CONCEPT_BY_ID.get(topic?.id);
  const text = claimText(profile, claim);
  if (!concept) {
    const matches = matchingTerms(`${text.direct} ${text.mechanism}`, topic?.terms || []);
    return matches.length ? {
      kind: "broad",
      rank: 1,
      label: "Broad research connection",
      matchedTerms: matches,
      explanation: `The approved source uses wording related to ${topic.label}, but it does not state a more precise condition-level connection.`,
    } : null;
  }

  const directConditions = matchingTerms(text.direct, concept.conditions);
  const directSymptoms = matchingTerms(text.direct, concept.symptoms);
  const mechanismMatches = matchingTerms(text.mechanism, concept.mechanisms);
  const broadMatches = matchingTerms(`${text.direct} ${text.mechanism}`, [...concept.layTerms, ...(topic?.terms || [])]);
  const population = populationForClaim(claim);
  const studyType = studyTypeForClaim(claim);

  if (directConditions.length) {
    const human = population === "Human" || /human/i.test(studyType);
    return {
      kind: human ? "direct-human" : "direct-preclinical",
      rank: human ? 5 : 4,
      label: human ? "Direct human research" : "Direct preclinical research",
      matchedTerms: directConditions,
      explanation: human
        ? `The approved source directly discusses ${directConditions.slice(0, 2).join(" and ")} in human research.`
        : `The approved source directly discusses ${directConditions.slice(0, 2).join(" and ")}, but the available record is not established human treatment evidence.`,
    };
  }
  if (directSymptoms.length) {
    return {
      kind: "symptom-related",
      rank: 3,
      label: "Related symptom research",
      matchedTerms: directSymptoms,
      explanation: `The source studies a related symptom or outcome (${directSymptoms.slice(0, 2).join(" and ")}), rather than necessarily studying the full condition as a treatment target.`,
    };
  }
  if (mechanismMatches.length) {
    return {
      kind: "mechanistic",
      rank: 2,
      label: "Indirect mechanistic research",
      matchedTerms: mechanismMatches,
      explanation: `The connection is through ${mechanismMatches.slice(0, 2).join(" and ")}. That biological overlap is not proof that the compound treats the condition or symptom.`,
    };
  }
  if (broadMatches.length) {
    return {
      kind: "broad",
      rank: 1,
      label: "Broad research connection",
      matchedTerms: broadMatches,
      explanation: `The approved source contains related wording (${broadMatches.slice(0, 2).join(" and ")}), but the connection is broad and should not be treated as direct evidence.`,
    };
  }
  return null;
}

export function bestResearchConnection(compound, topic) {
  const candidates = (compound?.researchProfiles || []).flatMap((profile) =>
    (profile.claims || []).map((claim) => {
      const relationship = relationshipForClaim(profile, claim, topic);
      if (!relationship) return null;
      return {
        profile,
        claim,
        relationship,
        studyType: studyTypeForClaim(claim),
        population: populationForClaim(claim),
        evidenceStrength: evidenceStrengthForClaim(claim),
      };
    }).filter(Boolean),
  );
  return candidates.sort((left, right) =>
    right.relationship.rank - left.relationship.rank
    || (right.population === "Human" ? 1 : 0) - (left.population === "Human" ? 1 : 0)
    || (right.claim?.references?.length || 0) - (left.claim?.references?.length || 0),
  )[0] || null;
}

export function limitationsForClaim(claim) {
  const stated = unique(claim?.limitations || []);
  if (stated.length) return stated;
  const population = populationForClaim(claim);
  if (population === "Animal") return ["The reviewed record is animal research and cannot establish human effectiveness or safety."];
  if (population === "Laboratory") return ["The reviewed record is laboratory research and cannot establish effects in people."];
  if (population === "Not clearly stated") return ["The source does not clearly state the study population or design in PEARL's reviewed record."];
  return ["The reviewed record does not state a specific limitation. The linked paper still needs to be checked for design, size and bias."];
}

export function buildResearchLinkManifest(profiles) {
  const records = [];
  for (const profile of profiles || []) {
    for (const claim of profile.claims || []) {
      const base = {
        profileKey: profile.key,
        compound: profile.name,
        sourceId: claim.sourceId,
        studyType: studyTypeForClaim(claim),
        population: populationForClaim(claim),
        evidenceStrength: evidenceStrengthForClaim(claim),
        topics: unique(claim.topics || []),
        limitations: limitationsForClaim(claim),
      };
      records.push({ ...base, linkType: "source-page", title: profile.name, url: claim.url });
      for (const reference of claim.references || []) {
        records.push({ ...base, linkType: "research-reference", title: reference.title, url: reference.url });
      }
      for (const protocol of claim.protocols || []) {
        if (!protocol.sourceUrl) continue;
        records.push({
          ...base,
          linkType: "protocol-source",
          title: protocol.label,
          url: protocol.sourceUrl,
          protocol: {
            dose: protocol.dose,
            frequency: protocol.frequency,
            duration: protocol.duration,
            route: protocol.route,
            population: protocol.population,
            species: protocol.species,
            evidenceType: protocol.evidenceType,
          },
        });
      }
    }
  }
  const grouped = new Map();
  for (const record of records) {
    if (!grouped.has(record.url)) grouped.set(record.url, { ...record, compounds: [record.compound], appearances: 1 });
    else {
      const current = grouped.get(record.url);
      current.compounds = unique([...current.compounds, record.compound]);
      current.appearances += 1;
    }
  }
  return [...grouped.values()];
}

export { normaliseText as normaliseResearchText };
