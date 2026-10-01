import { COMPOUNDS as BASE_COMPOUNDS, SOURCE_METADATA } from "./compounds.generated.mjs";
import {
  RESEARCH_AUDIT,
  RESEARCH_CONFLICTS,
  RESEARCH_PROFILES,
  RESEARCH_SOURCES,
} from "./evidence.generated.mjs";
import { dosagePriorityFor } from "./dosage-priorities.mjs";
import { compileProtocols, knowledgeReceipt, validateDoseAnswer } from "./knowledge-compiler.mjs";
import { GOAL_GUIDANCE, GOAL_GUIDANCE_BY_ID } from "./goal-guidance.mjs";
import {
  PRODUCT_COMPOSITIONS,
  PRODUCT_CATALOGUE_NAMES,
  PROVENANCE_LABELS,
  resolveProductComposition,
} from "./product-compositions.mjs";
import {
  CURATED_TERMINOLOGY,
  PEARL_BLEND_MAPPINGS,
  PEARL_EXPANDED_NAME,
  PEARL_NAME,
  resolvePearlTerminology,
  terminologyManagementSummary,
} from "./terminology.mjs";
import {
  bestResearchConnection,
  enrichTopicWithConcept,
  evidenceStrengthForClaim,
  limitationsForClaim,
  populationForClaim,
  studyTypeForClaim,
} from "./research-intelligence.mjs";

const EMERGENCY_PATTERN = /\b(overdose|overdosed|cannot breathe|can't breathe|trouble breathing|chest pain|unconscious|seizure|severe reaction|anaphylaxis)\b/i;

/* Second tier, added 19 Aug 2026 after driving PEARL end to end. The list
   above is a set of clinical words, and it missed the way a frightened person
   actually types. Measured, on the live engine before this change:
     "I took too much semaglutide"      -> a product overview page
     "I am having an allergic reaction" -> "I could not match that question"
     "I think I took too much"          -> "I could not match that question"
   None of those should end anywhere but the emergency screen.

   This tier requires the person to be talking about THEMSELVES, so an
   educational question keeps working: "what allergic reactions have been
   reported for BPC-157?" has no first-person marker and is unaffected. That
   is the same who-is-this-about test the rest of the boundary uses. */
const PERSONAL_HARM_PATTERN = /\b(?:i|i'?ve|i have|i'?m|i am|my)\b[^.?!]{0,48}?\b(?:took too much|taken too much|had too much|injected too much|too much by mistake|double dosed|allergic reaction|passed out|fainted|blacked out|vomiting blood|throwing up blood|feel awful|feel terrible|feel really ill|feel very ill|feel very unwell)\b/i;
const PERSONAL_PATTERN = /\b(should i|can i|for me|my dose|my dosage|i take|i inject|i use|i weigh|my weight|my medication|my condition|build me|recommend me)\b/i;
const PERSONAL_PREVIEW_PATTERN = /\b(should i|can i|could i|what (?:should|can|could) i (?:take|use)|which should i|would you recommend|recommend (?:me|for me)|best for me|right for me|suitable for me|for me|my dose|my dosage|my body|my system|my health|i take|i inject|i use|i weigh|my weight|my medication|my condition|build me)\b/i;
const PROCEDURE_PATTERN = /\b(how|where)\b.{0,28}\b(inject|reconstitute|mix|administer)|\binjection site\b/i;
const STACK_PATTERN = /\b(stack|combine|pair|together|same syringe)\b/i;
const DOSE_PATTERN = /\b(dose|doses|dosage|dosages|amount|amounts|how much|numbers?|protocol|protocols|regimen|regimens|range|ranges|schedule|schedules|cycle|cycles|mg|mcg|micrograms?|milligrams?|units?)\b/i;
// A dose question does not always contain the word "dose". This only chooses
// the answer shape. It never creates or changes a source-listed figure.
const IMPLIED_DOSE_PATTERN = /\b(?:what|which)\b.{0,30}\b(?:study|studies|trial|trials|participants?|patients?|subjects?)\b.{0,25}\b(?:use[sd]?|receive[sd]?|get|got|administered)\b|\b(?:what|which)\s+(?:was|were|did)\b.{0,35}\b(?:given|received|administered|tested)\b|\bhow\s+(?:often|frequently)\b|\b(?:daily|weekly)\s+(?:amount|figure|number|regimen)\b/i;
const STUDY_PATTERN = /\b(research|study|studies|trial|trials|evidence|proof|data|results?|findings?|paper|papers|citation|citations)\b/i;
const SAFETY_PATTERN = /\b(side effect|side effects|risk|risks|safety|adverse|warning|warnings|downside|downsides|harm|harms|concern|concerns|tolerability)\b/i;
const MECHANISM_PATTERN = /\b(how does|how do|mechanism|work|works|what is)\b/i;
const HALF_LIFE_PATTERN = /\b(half[ -]?life|pharmacokinetic|pk|clearance|how long.*(?:last|stay|system|body)|stay(?:s)? in (?:the )?(?:system|body)|time in (?:the )?(?:system|body))\b/i;
const CONFLICT_PATTERN = /\b(conflict|conflicting|disagree|disagreement|contradict|different sources|which source|differ|varies|vary|variable)\b/i;
const LIMITATIONS_PATTERN = /\b(limitations?|caveats?|weaknesses?|how limited|what is missing|research gaps?|drawbacks?)\b/i;
const HUMAN_STUDY_PATTERN = /\b(human studies|human study|human trials?|people|patients|participants|clinical evidence|clinical research)\b/i;
const ANIMAL_STUDY_PATTERN = /\b(animal studies|animal study|mouse|mice|rat|rats|rodent|preclinical)\b/i;
const LAB_STUDY_PATTERN = /\b(lab studies|laboratory research|in vitro|cell studies|cell research|mechanistic evidence)\b/i;
const INDIRECT_EVIDENCE_PATTERN = /\b(indirect evidence|direct evidence|mechanistic connection|related mechanism|actually studied|studied directly|only indirect)\b/i;
const RELATED_RESEARCH_PATTERN = /\b(related research|similar research|other research|what else|anything else|closely related)\b/i;
const FOLLOW_UP_PATTERN = /\b(it|its|this|that|the compound|the peptide|what about|and the|how about)\b/i;
const COMPARE_PATTERN = /\b(compare|comparison|versus|vs\.?|difference|differ|better researched|stronger evidence)\b|\b(?:which|what)\b.{0,50}\b(?:more|stronger|better|longer|shorter)\b/i;
const COMPOSITION_PATTERN = /\b(what(?:'s| is) in|what does .{0,36} (?:contain|have in it)|what has .{0,36} in it|contains?|ingredients?|components?|made of|inside|included|composition|breakdown)\b/i;
const CATEGORY_INTENT_PATTERN = /\b(best|top|which|what|show|find|list|entries?|compounds?|peptides?|research|studied|studies|evidence|related|relate|linked|help|support)\b/i;
const CALCULATOR_PATTERN = /\b(?:dosage|dose|peptide|reconstitution|syringe|u[ -]?100|v3 pen|pen clicks?|bacteriostatic water|bac water)\b.{0,40}\bcalculator\b|\bcalculator\b.{0,40}\b(?:dosage|dose|peptide|reconstitution|syringe|u[ -]?100|v3 pen|pen clicks?|bacteriostatic water|bac water)\b/i;

const QUESTION_WORD_CORRECTIONS = new Map([
  ["anexity", "anxiety"],
  ["anixety", "anxiety"],
  ["anxiaty", "anxiety"],
  ["anxiey", "anxiety"],
  ["anxitey", "anxiety"],
  ["anxeity", "anxiety"],
  ["anxety", "anxiety"],
  ["anxity", "anxiety"],
  ["anxous", "anxious"],
  ["attension", "attention"],
  ["affects", "effects"],
  ["comparision", "comparison"],
  ["comparisson", "comparison"],
  ["concentraion", "concentration"],
  ["concentraton", "concentration"],
  ["datta", "data"],
  ["defecit", "deficit"],
  ["defficit", "deficit"],
  ["deppresion", "depression"],
  ["deppression", "depression"],
  ["depresed", "depressed"],
  ["depresion", "depression"],
  ["dosgae", "dosage"],
  ["dosge", "dosage"],
  ["doseage", "dosage"],
  ["dossage", "dosage"],
  ["dosag", "dosage"],
  ["doasge", "dosage"],
  ["protocal", "protocol"],
  ["protcol", "protocol"],
  ["regiman", "regimen"],
  ["dificit", "deficit"],
  ["evidance", "evidence"],
  ["evidnce", "evidence"],
  ["haf", "half"],
  ["hiperactivity", "hyperactivity"],
  ["hyperactivty", "hyperactivity"],
  ["ingrediants", "ingredients"],
  ["ligamants", "ligaments"],
  ["peptids", "peptides"],
  ["proff", "proof"],
  ["recomend", "recommend"],
  ["resarch", "research"],
  ["reseach", "research"],
  ["shoud", "should"],
  ["shuld", "should"],
  ["stess", "stress"],
  ["stres", "stress"],
  ["systm", "system"],
  ["trouma", "trauma"],
  ["obssesive", "obsessive"],
  ["obsesive", "obsessive"],
  ["obsesssive", "obsessive"],
  ["compolsive", "compulsive"],
  ["compuslive", "compulsive"],
  ["compullsive", "compulsive"],
  ["weigth", "weight"],
]);

const TOPIC_DEFINITIONS = [
  {
    id: "muscle-growth",
    label: "muscle growth",
    pattern: /\b(muscle growth|build muscle|building muscle|muscle gain|lean mass|hypertrophy|bodybuilding|strength|putting on size|put on size|gain size|gaining size|bulking|bulk up|get bigger)\b/i,
    categories: ["Muscle Growth"],
    terms: ["muscle", "lean mass", "hypertrophy", "igf", "anabolic", "strength"],
  },
  {
    id: "healing",
    label: "healing and recovery",
    pattern: /\b(healing|heal|injury|injuries|recovery|repair|skin repair|tissue repair|tendon|tendons|damaged tendon|damaged tendons|ligament|ligaments|damaged ligament|damaged ligaments|wound|wounds|gut healing)\b/i,
    categories: ["Healing"],
    terms: ["healing", "repair", "recovery", "tendon", "ligament", "wound", "tissue"],
  },
  {
    id: "sleep",
    label: "sleep",
    pattern: /\b(sleep|insomnia|circadian|deep sleep|restful|rest|narcolepsy|cataplexy|daytime sleepiness|wakefulness)\b/i,
    categories: [],
    terms: ["sleep", "insomnia", "circadian", "melatonin", "deep sleep", "narcolepsy", "cataplexy", "daytime sleepiness", "wakefulness"],
    preferredSlugs: ["melatonin", "dsip", "orexin-a", "orexin-b", "alixorexton", "oveporexton", "pinealon", "epitalon"],
  },
  {
    id: "weight-loss",
    label: "weight loss",
    pattern: /\b(weight loss|lose weight|losing weight|fat loss|appetite|obesity|slimming|get lean|getting lean|leaner|cutting weight)\b/i,
    categories: ["Weight Loss"],
    terms: ["weight loss", "body weight", "fat loss", "appetite", "obesity", "gastric emptying"],
  },
  {
    id: "energy",
    label: "energy and mitochondrial research",
    pattern: /\b(energy|fatigue|mitochondria|mitochondrial|endurance|stamina)\b/i,
    categories: ["Mitochondrial"],
    terms: ["energy", "fatigue", "mitochond", "atp", "endurance", "stamina"],
  },
  {
    id: "mental-health",
    label: "mental-health research",
    pattern: /\b(mental health|mental wellbeing|mental well being|emotional health|psychological health|psychological wellbeing|psychological well being|psychiatric research|neuropsychiatric research)\b/i,
    categories: [],
    terms: ["anxiety", "stress", "mood", "depression", "attention", "cognitive", "mental clarity", "emotional processing", "gaba", "serotonin", "dopamine", "bdnf"],
    preferredSlugs: ["selank", "semax", "dsip", "pe2228", "oxytocin", "npy"],
  },
  {
    id: "adhd-attention",
    label: "ADHD-related research",
    pattern: /\b(adhd|adht|adjd|adha|ahdh|adhdh|addh|attention deficit(?: hyperactivity)? disorder|attention deficit disorder|attention deficit|hyperactivity disorder|inattentive adhd|inattention|hyperactivity)\b/i,
    categories: [],
    terms: ["adhd", "attention deficit", "hyperactivity", "inattention", "attention", "executive function", "concentration", "distractibility", "dopamine", "bdnf"],
    /* Kieran, 18 Aug 2026. This topic used to carry allowedSlugs: ["semax"],
       a hard whitelist of ONE entry. However many attention-related records
       the reviewed library held, an ADHD question could only ever return
       Semax - measured: 1 entry out of 265. That is the whole of the
       "PEARL is superficial" complaint on this question, and it was a
       retrieval limit, not a safety rule: nothing pinned it and the caution
       lives in the note and the per-entry relationship labels below.
       The whitelist is gone. Ranking still puts the most directly studied
       entries first, and every entry now states how strong its connection
       actually is, so breadth arrives WITH its own honesty rather than
       instead of it. preferredSlugs matches the library's own
       attention-and-executive-function list. */
    preferredSlugs: ["semax", "n-acetyl-semax-amidate", "selank", "n-acetyl-selank-amidate", "cortexin", "cerebrolysin", "dihexa", "p21", "noopept"],
    protocolTerms: ["attention-deficit", "adhd"],
    note: "No peptide is an approved or established ADHD treatment, and none of these entries has randomised controlled trial evidence in an ADHD population. Semax is listed first because the reviewed sources connect it with attention research most directly, but its main PubMed ADHD citation is a hypothesis paper and the small Russian paediatric report was open-label rather than a modern blinded placebo-controlled trial. Everything below it is a weaker or more indirect connection, labelled as such.",
    compoundNotes: {
      semax: "ADHD evidence remains limited and hypothesis-generating. It is not established treatment evidence.",
    },
    exclusive: true,
  },
  {
    id: "attention-executive",
    label: "attention and executive-function research",
    pattern: /\b(executive dysfunction|executive function problems?|poor concentration|difficulty concentrating|trouble concentrating|easily distracted|distractibility)\b/i,
    categories: ["Cognitive"],
    terms: ["attention", "executive function", "concentration", "distractibility", "focus", "cognitive", "dopamine", "bdnf"],
    preferredSlugs: ["semax", "cortexin", "cerebrolysin", "dihexa", "selank"],
    exclusive: true,
  },
  {
    id: "ocd-compulsive",
    label: "OCD and compulsive-behaviour research",
    pattern: /\b(ocd|ocd research|obsessive compulsive(?: disorder)?|obsessive thoughts?|intrusive thoughts?|unwanted thoughts?|compulsions?|compulsive behaviou?r|repetitive behaviou?r|cannot stop thoughts?|cant stop thoughts?|repeating things)\b/i,
    categories: [],
    terms: ["ocd", "obsessive compulsive disorder", "obsessive thoughts", "intrusive thoughts", "compulsive behaviour", "compulsive behavior", "glutamate"],
    /* Same one-entry whitelist as the ADHD topic carried, removed for the same
       reason and on the same day. NAC still ranks first because it is the one
       direct link the library holds; anything else that appears is labelled
       with the strength of its connection, and the note below still stands. */
    preferredSlugs: ["nac"],
    note: "The reviewed library has a narrow direct link here, to NAC. Anything listed below it is a weaker or purely mechanistic overlap. PEARL must not turn a general neurotransmitter overlap into a treatment claim.",
    compoundNotes: {
      nac: "The source describes psychiatric research involving obsessive-compulsive symptoms. This is not enough to establish NAC as a treatment recommendation.",
    },
    exclusive: true,
  },
  {
    id: "cognitive",
    label: "focus, memory and cognition",
    pattern: /\b(focus|memory|cognitive|cognition|brain health|mental clarity|mental sharpness|sharp thinking|brain fog|nootropic|neuroprotective|learning|attention|concentration|executive function|distractibility)\b/i,
    categories: ["Cognitive"],
    terms: ["focus", "memory", "cognitive", "brain", "clarity", "learning", "attention", "concentration", "executive function", "neuroprotect"],
  },
  {
    id: "anxiety-stress",
    label: "anxiety and stress research",
    pattern: /\b(anxiety|anxious|anxiolytic|generalised anxiety|generalized anxiety|gad|social anxiety|performance anxiety|stress relief|stress reduction|chronic stress|stress response|post traumatic stress|post-traumatic stress|ptsd|panic|panic attack|panic attacks|nervousness|excessive worry|rumination)\b/i,
    categories: [],
    terms: ["anxiety", "anxiolytic", "generalized anxiety", "stress", "ptsd", "panic", "fear extinction", "gaba"],
    preferredSlugs: ["selank", "semax", "dsip", "oxytocin", "npy", "pe2228"],
  },
  {
    id: "mood",
    label: "mood and depression research",
    pattern: /\b(mood|low mood|depression|depressed|depressive|depressive symptoms|antidepressant|anhedonia|loss of interest|emotional wellbeing|emotional well being|affective disorder|mood disorder)\b/i,
    categories: [],
    terms: ["mood", "depression", "depressive", "antidepressant", "anhedonia", "emotional processing", "serotonin"],
    preferredSlugs: ["pe2228", "selank", "semax", "trh", "oxytocin"],
  },
  {
    id: "immune",
    label: "immune and inflammation research",
    pattern: /\b(immune|immunity|infection|inflammation|anti-inflammatory|antiviral)\b/i,
    categories: ["Immune"],
    terms: ["immune", "inflammation", "anti-inflammatory", "infection", "antiviral"],
  },
  {
    id: "cancer-research",
    label: "cancer research",
    pattern: /\b(cancer|oncology|tumour|tumor|leukaemia|leukemia|anticancer|anti-cancer)\b/i,
    categories: ["Cancer Research"],
    terms: ["cancer", "oncology", "tumour", "tumor", "leukaemia", "leukemia", "anticancer"],
  },
  {
    id: "longevity",
    label: "longevity and anti-aging",
    pattern: /\b(longevity|anti aging|anti-aging|ageing|aging|senolytic|telomere)\b/i,
    categories: ["Longevity", "Anti-Aging"],
    terms: ["longevity", "anti-aging", "aging", "senolytic", "telomere"],
  },
  {
    id: "cardiovascular",
    label: "cardiovascular research",
    pattern: /\b(heart|cardiovascular|blood pressure|circulation|cardiac)\b/i,
    categories: ["Cardiovascular"],
    terms: ["heart", "cardiovascular", "blood pressure", "circulation", "cardiac"],
  },
  {
    id: "metabolic",
    label: "metabolic research",
    pattern: /\b(metabolic|metabolism|glucose|insulin|blood sugar)\b/i,
    categories: ["Metabolic"],
    terms: ["metabolic", "metabolism", "glucose", "insulin", "blood sugar"],
  },
  {
    id: "fertility",
    label: "fertility research",
    pattern: /\b(fertility|infertility|ivf|assisted reproduction|ovarian stimulation|follicular phase|sperm|spermatogenesis|ovulation|folliculogenesis)\b/i,
    categories: [],
    terms: ["fertility", "infertility", "assisted reproduction", "ivf", "ovarian stimulation", "gnrh antagonist", "luteinising hormone", "follicular phase", "sperm", "ovulation"],
    preferredSlugs: ["kisspeptin-54", "kisspeptin-10", "gonadorelin", "hcg", "cetrorelix", "ganirelix"],
  },
  {
    id: "sexual-health",
    label: "sexual health and function research",
    pattern: /\b(sexual health|sexual function|sexual dysfunction|sexual hormones?|sex hormones?|reproductive hormones?|libido|arousal|erectile dysfunction|erectile function|impotence|hsdd)\b/i,
    categories: [],
    terms: ["sexual health", "sexual function", "sexual dysfunction", "libido", "arousal", "erectile", "hsdd", "reproductive", "kisspeptin", "melanocortin"],
    preferredSlugs: ["pt-141", "kisspeptin-10", "kisspeptin-54", "melanotan-ii", "oxytocin", "hcg", "gonadorelin"],
  },
  {
    id: "hormonal",
    label: "hormonal research",
    pattern: /\b(hormonal balance|hormonal imbalance|hormone imbalance|hormone problems?|hormone support|hormone research|hormones?|testosterone|estrogen|oestrogen|progesterone|endocrine|menopause|androgen)\b/i,
    categories: ["Hormonal"],
    terms: ["hormonal", "hormone", "testosterone", "estrogen", "oestrogen", "progesterone", "androgen", "endocrine"],
    preferredSlugs: ["kisspeptin-10", "kisspeptin-54", "gonadorelin", "hcg", "pt-141"],
  },
  {
    id: "gut-digestive",
    label: "gut and digestive research",
    pattern: /\b(gut health|gut healing|digestive health|digestion|intestinal|bowel|ibs|ibd|irritable bowel|inflammatory bowel|colitis|constipation|short bowel|gastrointestinal|gastroenterology)\b/i,
    categories: ["Healing"],
    terms: ["gut", "digestive", "intestinal", "bowel", "ibs", "ibd", "colitis", "constipation", "gastro", "intestinal adaptation"],
  },
  {
    id: "pain",
    label: "pain and nerve-pain research",
    pattern: /\b(pain|pain relief|analgesia|analgesic|nerve pain|neuropathic pain|neuropathy|nociception|back pain|fibromyalgia)\b/i,
    categories: [],
    terms: ["pain", "analges", "neuropath", "nocicep", "back pain", "nerve damage", "fibromyalgia"],
  },
  {
    id: "joint-cartilage",
    label: "joint and cartilage research",
    pattern: /\b(joint health|joint pain|joints|cartilage|osteoarthritis|arthritis|connective tissue)\b/i,
    categories: ["Healing"],
    terms: ["joint", "cartilage", "osteoarthritis", "arthritis", "connective tissue", "tendon", "ligament"],
  },
  {
    id: "skin-collagen",
    label: "skin, collagen and cosmetic research",
    pattern: /\b(skin health|skin care|skincare|skin aging|skin ageing|collagen|wrinkle|wrinkles|scar|scarring|cosmetic peptide|complexion|skin glow)\b/i,
    categories: [],
    terms: ["skin", "collagen", "wrinkle", "scar", "cosmetic", "dermatology", "elastin"],
  },
  {
    id: "hair",
    label: "hair and follicle research",
    pattern: /\b(hair health|hair growth|hair loss|alopecia|follicle|thinning hair)\b/i,
    categories: [],
    terms: ["hair", "follicle", "alopecia", "hair growth", "hair loss"],
  },
  {
    id: "bone",
    label: "bone health and density research",
    pattern: /\b(bone health|bone density|bone growth|osteoporosis|fracture|fracture healing|skeletal)\b/i,
    categories: [],
    terms: ["bone", "osteoporosis", "fracture", "skeletal", "bone density", "bone growth"],
  },
  {
    id: "migraine",
    label: "migraine and headache research",
    pattern: /\b(migraine|migraines|headache|headaches)\b/i,
    categories: [],
    terms: ["migraine", "headache", "pacap", "cgrp", "provocation"],
  },
  {
    id: "liver",
    label: "liver and fatty-liver research",
    pattern: /\b(liver health|liver support|fatty liver|nafld|nash|mash|hepatology|hepatic|liver fibrosis|detoxification)\b/i,
    categories: ["Metabolic"],
    terms: ["liver", "fatty liver", "nafld", "nash", "mash", "hepat", "detoxification"],
  },
  {
    id: "kidney",
    label: "kidney and renal research",
    pattern: /\b(kidney|renal|chronic kidney disease|ckd|kidney protection)\b/i,
    categories: [],
    terms: ["kidney", "renal", "chronic kidney disease", "ckd", "nephro"],
  },
  {
    id: "respiratory",
    label: "lung and respiratory research",
    pattern: /\b(lung|respiratory|copd|airway|breathing|pulmonary|ards|lung fibrosis)\b/i,
    categories: [],
    terms: ["lung", "respiratory", "copd", "airway", "pulmonary", "ards"],
  },
  {
    id: "neurodegeneration",
    label: "neurodegeneration research",
    pattern: /\b(neurodegeneration|neurodegenerative|alzheimer|alzheimer's|dementia|parkinson|parkinson's|als|multiple sclerosis)\b/i,
    categories: ["Cognitive"],
    terms: ["neurodegeneration", "alzheimer", "dementia", "parkinson", "als", "multiple sclerosis", "neuroprotect"],
  },
  {
    id: "growth-hormone",
    label: "growth-hormone and IGF research",
    pattern: /\b(growth hormone|gh secretagogue|ghrh|ghrp|igf-?1|igf research|growth hormone deficiency|gh axis)\b/i,
    categories: ["Muscle Growth"],
    terms: ["growth hormone", "gh secretagogue", "ghrh", "ghrp", "igf", "gh axis"],
  },
  {
    id: "pigmentation",
    label: "pigmentation and melanocortin research",
    pattern: /\b(pigmentation|tan|tans|tanned|tanning|get a tan|getting a tan|melanin|photodermatosis|erythropoietic protoporphyria|epp)\b/i,
    categories: [],
    terms: ["pigmentation", "melanin", "photodermatosis", "erythropoietic protoporphyria", "melanocortin"],
    preferredSlugs: ["melanotan-ii", "melanotan-i", "afamelanotide"],
    answerLead: "MT2 (Melanotan II)",
  },
  {
    id: "fibrosis",
    label: "fibrosis research",
    pattern: /\b(fibrosis|fibrotic|anti-fibrotic|anti fibrotic|tissue scarring)\b/i,
    categories: [],
    terms: ["fibrosis", "fibrotic", "anti-fibrotic", "tissue scarring"],
  },
  {
    id: "brain-injury",
    label: "brain injury and stroke research",
    pattern: /\b(brain injury|traumatic brain injury|tbi|stroke|stroke recovery|neural repair)\b/i,
    categories: ["Cognitive"],
    terms: ["brain injury", "traumatic brain injury", "tbi", "stroke", "neural repair"],
  },
  {
    id: "performance",
    label: "exercise and athletic-performance research",
    pattern: /\b(athletic performance|sports performance|sport performance|exercise performance|workout performance|training performance|physical performance|exercise endurance|training recovery)\b/i,
    categories: ["Muscle Growth", "Mitochondrial"],
    terms: ["athletic performance", "exercise performance", "endurance", "stamina", "oxygen use", "mitochondria", "training recovery"],
  },
  {
    id: "dopamine",
    label: "dopamine-related research",
    pattern: /\b(dopamine|dopaminergic|dopamine receptors?|reward pathway|reward system)\b/i,
    categories: [],
    terms: ["dopamine", "dopaminergic", "dopamine receptor", "reward"],
    note: "A dopamine connection may be mechanistic or indirect. It is not automatically evidence for treating ADHD, mood problems or another condition.",
    exclusive: true,
  },
  {
    id: "serotonin",
    label: "serotonin-related research",
    pattern: /\b(serotonin|serotonergic|5 ht|5-ht|serotonin receptors?)\b/i,
    categories: [],
    terms: ["serotonin", "serotonergic", "5-ht", "5 ht"],
    note: "A serotonin connection is a biological relationship, not proof of an antidepressant or anxiety treatment effect.",
    exclusive: true,
  },
  {
    id: "gaba",
    label: "GABA-related research",
    pattern: /\b(gaba|gabaergic|gaba receptors?|inhibitory neurotransmission)\b/i,
    categories: [],
    terms: ["gaba", "gabaergic", "gaba receptor", "inhibitory neurotransmission"],
    note: "A GABA connection may explain why a compound is researched, but it does not establish a treatment effect.",
    exclusive: true,
  },
  {
    id: "bdnf-neuroplasticity",
    label: "BDNF and neuroplasticity research",
    pattern: /\b(bdnf|brain derived neurotrophic factor|brain-derived neurotrophic factor|neuroplasticity|synaptic plasticity|brain plasticity)\b/i,
    categories: ["Cognitive"],
    terms: ["bdnf", "brain derived neurotrophic factor", "neuroplasticity", "synaptic plasticity"],
    note: "Mechanistic BDNF or neuroplasticity research does not by itself prove a clinical benefit.",
    exclusive: true,
  },
];

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const SOURCE_BY_ID = new Map(RESEARCH_SOURCES.map((source) => [source.id, source]));
const PROFILE_BY_KEY = new Map(RESEARCH_PROFILES.map((profile) => [profile.key, profile]));

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function profileKeysForBase(compound) {
  const keys = unique([
    normalize(compound.slug),
    normalize(compound.name),
    normalize(compound.name.replace(/\([^)]*\)/g, "")),
  ]);
  if (compound.slug === "cjc-1295-with-dac") keys.push("cjc1295", "cjc1295dac");
  if (compound.slug === "cjc-1295-no-dac") keys.push("cjc1295nodac", "modgrf129");
  if (compound.slug === "thymosin-beta-4-tb4") keys.push("thymosinbeta4");
  if (compound.slug === "follistatin-344") keys.push("follistatin344", "follistatin");
  if (compound.slug === "kisspeptin-10") keys.push("kisspeptin");
  if (compound.slug === "glutathione-iv" || compound.slug === "l-glutathione") keys.push("glutathione");
  if (compound.slug === "melanotan-ii") keys.push("melanotan2");
  if (compound.slug === "nad") keys.push("nadplus");
  return unique(keys);
}

function sourcePriority(sourceId) {
  return ({ pepcodex: 5, "peptide-handbook": 4, "halflife-labs": 3, peptpedia: 2, peptidehub: 1, peptidedosage: 0.5, peptidedeck: 0.25, wikipep: 0.1 })[sourceId] || 0;
}

/*
 * GRADING WINDOW (Pearl plan Stage C step 4). The stored evidence text used to
 * be cut at 520 characters, and this keyword ladder was calibrated against
 * that: the site's own grading label ("Low evidence", "Moderate evidence")
 * sits near the start of the text. Step 4 repaired the truncation, so members
 * now read the full text — but grading on the full text inflates scores,
 * because phrases like "no established human dosing" or "no randomized trials"
 * contain the trigger words. So the graders keep reading exactly the window
 * they always read. Making the graders genuinely understand negation is a
 * Stage D improvement that needs a proposal and an approval, not a side effect.
 */
const GRADING_WINDOW = 520;

function evidenceScoreForProfile(profile) {
  const text = profile.claims.map((claim) => String(claim.evidence || "").slice(0, GRADING_WINDOW)).join(" ").toLowerCase();
  if (/established|strong-human|high evidence|phase 3|fda-approved/.test(text)) return 5;
  if (/moderate evidence|moderate|phase 2|randomized/.test(text)) return 4;
  if (/low evidence|limited|preliminary|preclinical/.test(text)) return 2;
  return 1;
}

function categoryForProfile(profile) {
  const text = readableSearchText(`${profile.categories.join(" ")} ${profile.claims.flatMap((claim) => claim.topics).join(" ")}`);
  if (/healing|repair|recovery|wound|tendon|ligament/.test(text)) return "Healing";
  if (/growth hormone|muscle|hypertrophy|performance/.test(text)) return "Muscle Growth";
  if (/metabolic|obesity|weight|glp 1|amylin|diabetes/.test(text)) return "Metabolic";
  if (/cognitive|brain|neuro|sleep|narcolepsy|anxiety/.test(text)) return "Cognitive";
  if (/immune|antimicrobial|inflammation|infection/.test(text)) return "Immune";
  if (/cancer|oncology|tumour|tumor|leukaemia|leukemia|anticancer/.test(text)) return "Cancer Research";
  if (/mitochond|energy|endurance/.test(text)) return "Mitochondrial";
  if (/longevity|aging|anti aging|senolytic/.test(text)) return "Longevity";
  if (/cardiac|cardiovascular|vascular/.test(text)) return "Cardiovascular";
  if (/hormone|fertility|sexual|libido|gonad/.test(text)) return "Hormonal";
  return "Metabolic";
}

function referencesForProfile(profile) {
  return unique(profile.claims.flatMap((claim) => claim.references.map((reference) => reference.url)))
    .map((url) => {
      const reference = profile.claims.flatMap((claim) => claim.references).find((item) => item.url === url);
      return {
        title: reference?.title || "Linked research",
        journal: "",
        pmid: url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/)?.[1] || "",
        summary: "Open the linked source for the full study design, population and results.",
        url,
      };
    })
    .slice(0, 24);
}

function syntheticCompound(profile) {
  const orderedClaims = [...profile.claims].sort((a, b) => sourcePriority(b.sourceId) - sourcePriority(a.sourceId));
  const summary = orderedClaims.find((claim) => claim.summary)?.summary || "A compound listed in the supplied research sources.";
  const mechanism = orderedClaims.find((claim) => claim.mechanism)?.mechanism || "The supplied sources do not provide a clear mechanism summary.";
  const topics = unique(profile.claims.flatMap((claim) => claim.topics)).slice(0, 16);
  // Step 4 raised the per-source safety lists from 6 to 10 items. The union
  // cap rises with them, otherwise the longer first list pushes every other
  // source's items off the end and members silently lose warnings they used
  // to see. Nothing is dropped now; the list simply carries every source.
  const safety = unique(profile.claims.flatMap((claim) => claim.safety)).slice(0, 24);
  const score = evidenceScoreForProfile(profile);
  return {
    name: profile.name,
    slug: profile.key,
    category: categoryForProfile(profile),
    tagline: summary,
    mechanism,
    benefits: topics.length ? topics : ["No research topic was clearly stated by the supplied sources."],
    sideEffects: safety.map((text) => ({ text, severity: "source-listed" })),
    timeline: [],
    sourceSchedule: "No preferred schedule has been established for this newly added profile.",
    sourceCycle: "Study duration must be checked in the linked paper.",
    sourceDose: {
      low: "No preferred lower range has been established.",
      standard: "No preferred standard range has been established.",
      high: "No preferred higher range has been established.",
    },
    evidenceScore: score,
    evidenceNote: orderedClaims.map((claim) => claim.evidence).filter(Boolean).slice(0, 2).join(" ") || "Evidence strength was not stated consistently.",
    studies: referencesForProfile(profile),
    researchProfiles: [profile],
    researchAliases: unique([profile.fullName, ...profile.aliases]),
    researchTopics: topics,
    addedFromExpandedLibrary: true,
  };
}

const claimedProfileKeys = new Set();
const ENRICHED_BASE_COMPOUNDS = BASE_COMPOUNDS.map((compound) => {
  const profiles = profileKeysForBase(compound).map((key) => PROFILE_BY_KEY.get(key)).filter(Boolean);
  profiles.forEach((profile) => claimedProfileKeys.add(profile.key));
  return {
    ...compound,
    researchProfiles: profiles,
    researchAliases: unique(profiles.flatMap((profile) => [profile.fullName, ...profile.aliases])),
    researchTopics: unique(profiles.flatMap((profile) => profile.claims.flatMap((claim) => claim.topics))),
    addedFromExpandedLibrary: false,
  };
});

const EXPANDED_COMPOUNDS = RESEARCH_PROFILES
  .filter((profile) => !claimedProfileKeys.has(profile.key))
  .map(syntheticCompound);

const COMPOUNDS = [...ENRICHED_BASE_COMPOUNDS, ...EXPANDED_COMPOUNDS];
const COMPOUND_BY_SLUG = new Map(COMPOUNDS.map((compound) => [compound.slug, compound]));
const BLEND_PROFILE_SLUGS = new Set(PEARL_BLEND_MAPPINGS.map((mapping) => mapping.profileSlug).filter(Boolean));
const TOPIC_MATCH_CACHE = new Map();

function compoundsFromResolution(resolution) {
  return (resolution?.entities || [])
    .map((entity) => COMPOUND_BY_SLUG.get(entity.slug))
    .filter(Boolean)
    .filter((compound, index, all) => all.findIndex((item) => item.slug === compound.slug) === index)
    .slice(0, 3);
}

function publicInterpretation(resolution) {
  if (!resolution) return null;
  return {
    status: resolution.status,
    type: resolution.type,
    method: resolution.method,
    confidence: resolution.confidence,
    matchedText: resolution.matchedText,
    disclosure: resolution.disclosure,
    suggestions: resolution.suggestions || [],
    expandedTerms: resolution.expandedTerms || [],
    blendId: resolution.blend?.id || null,
  };
}

function firstUsefulSentence(value, limit = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const sentence = text.match(/^.*?[.!?](?=\s|$)/)?.[0] || text;
  if (sentence.length <= limit) return sentence;
  const shortened = sentence.slice(0, limit + 1);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 100 ? lastSpace : limit).trim()}...`;
}

function followUpKey(value) {
  return normaliseQuestionLanguage(value)
    .replace(/\b(show|what|which|tell me|please|the|listed|source listed|research)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function followUpsFor(answer, options = {}) {
  if (["emergency", "boundary", "clarify", "no-match"].includes(answer.kind)) return [];
  const compounds = unique(answer.compounds || []);
  const primary = compounds[0];
  if (!primary) return [];
  const evidence = `Show the research evidence for ${primary}`;
  const human = `Show the human research studies for ${primary}`;
  const strength = `How strong is the research evidence for ${primary}?`;
  const mechanism = `What does the research say about how ${primary} works?`;
  const dose = `What source-listed dosage research is shown for ${primary}?`;
  const risks = `What risks are listed for ${primary}?`;
  const limitations = `What are the research limitations for ${primary}?`;
  const halfLife = `How long does ${primary} stay in the system?`;
  const byKind = {
    topic: [compounds[1] ? `Compare ${primary} and ${compounds[1]}` : null, evidence, human, dose, limitations],
    comparison: [evidence, human, dose, risks, limitations],
    dose: [evidence, human, risks, limitations, halfLife],
    safety: [evidence, human, strength, dose, halfLife],
    evidence: [mechanism, dose, risks, limitations, halfLife],
    overview: [evidence, human, strength, dose, limitations],
  };
  const ordered = unique((byKind[answer.kind] || [evidence, human, dose, risks, limitations]).filter(Boolean));
  const asked = new Set((options.askedQuestions || []).map(followUpKey));
  return ordered.filter((question) => !asked.has(followUpKey(question))).slice(0, 2);
}

/* Approved citation corrections (dashboard audit fix 3, 18 Aug 2026).
   Citations are baked into the generated evidence file at build time, so a
   wrong or missing source link used to need a developer rebuild. An approved
   citation_correction proposal now travels in the same runtime overrides
   array as approved wording (recordType "citation" — the terminology
   resolver ignores that type), and this layer applies it to the finished
   answer's source strip only: "remove" drops a link from that compound's
   answers, "add" appends an approved one. The answer text is never touched,
   and with no corrections every answer stays byte-identical to the build. */
const COMPOUND_SLUG_BY_NAME = new Map(COMPOUNDS.map((compound) => [compound.name.toLowerCase(), compound.slug]));
const APPROVED_SOURCE_HOSTS = new Set(RESEARCH_SOURCES.map((source) => {
  try { return new URL(source.url).hostname; } catch { return null; }
}).filter(Boolean));

export function isApprovedCitationUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (TRUSTED_RESEARCH_HOSTS.has(url.hostname) || APPROVED_SOURCE_HOSTS.has(url.hostname));
  } catch {
    return false;
  }
}

function comparableCitationUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}

function applyCitationCorrections(answer, options = {}) {
  const overrides = Array.isArray(options.overrides) ? options.overrides : [];
  const corrections = overrides.filter((record) => record?.recordType === "citation"
    && record.reviewStatus === "approved" && record.enabled !== false);
  if (!corrections.length) return answer;
  const slugs = new Set((answer.compounds || [])
    .map((name) => COMPOUND_SLUG_BY_NAME.get(String(name).toLowerCase()))
    .filter(Boolean));
  const relevant = corrections.filter((record) => record.compoundSlug && slugs.has(record.compoundSlug));
  if (!relevant.length) return answer;
  const removed = new Set(relevant.filter((record) => record.action === "remove")
    .map((record) => comparableCitationUrl(record.url)));
  let sources = (answer.sources || []).filter((source) => !removed.has(comparableCitationUrl(source.url)));
  for (const record of relevant) {
    if (record.action !== "add") continue;
    // Same whitelist as the rest of the engine: only trusted research hosts
    // or the approved source library may ever be added to an answer.
    if (!isApprovedCitationUrl(record.url)) continue;
    if (sources.some((source) => comparableCitationUrl(source.url) === comparableCitationUrl(record.url))) continue;
    sources = [...sources, {
      label: record.label || record.url,
      detail: record.detail || "Added by an approved citation correction",
      url: record.url,
    }];
  }
  return { ...answer, sources };
}

/* Answer layouts (Kieran's feature, 18 Aug 2026). A layout rearranges the
   SECTIONS an answer already has - reorder, hide, and insert approved custom
   text blocks. It never touches the title, the one-line summary (pinned by
   construction), the bullets, the sources, or any safety answer. Layouts
   travel in the same runtime overrides array as approved wording (recordType
   "layout" - the terminology resolver ignores it), reach members only
   through an assignment that is switched ON, and with none present every
   answer stays byte-identical to the build. */
const LAYOUT_SKIP_KINDS = new Set(["safety", "emergency", "boundary", "clarify", "no-match"]);
const COMPOUND_CATEGORY_BY_NAME = new Map(COMPOUNDS.map((compound) => [
  compound.name.toLowerCase(),
  String(compound.category || "").toLowerCase(),
]));

/* Pure and exported: the dashboard designer uses the exact same function for
   its preview, so what the admin sees is what the member layer does. */
export function applyAnswerLayout(answer, layout) {
  const sections = Array.isArray(answer.sections) ? answer.sections : [];
  const blocks = Array.isArray(layout?.blocks) ? layout.blocks : [];
  if (!blocks.length) return answer;
  const used = new Set();
  const arranged = [];
  let restIndex = -1;
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "section") {
      const index = sections.findIndex((section, position) => !used.has(position) && section.title === block.title);
      if (index === -1) continue;
      used.add(index);
      if (!block.hidden) arranged.push(sections[index]);
    } else if (block.type === "custom") {
      // Unapproved custom words never render, even if a record carries them.
      if (block.approved === true && String(block.text || "").trim()) {
        arranged.push({ title: String(block.heading || "").trim() || "More detail", items: [String(block.text).trim()] });
      }
    } else if (block.type === "rest") {
      restIndex = arranged.length;
    }
  }
  const leftovers = sections.filter((_, position) => !used.has(position));
  const merged = restIndex === -1
    ? [...arranged, ...leftovers]
    : [...arranged.slice(0, restIndex), ...leftovers, ...arranged.slice(restIndex)];
  return { ...answer, sections: merged };
}

function applyAnswerLayouts(answer, options = {}) {
  const overrides = Array.isArray(options.overrides) ? options.overrides : [];
  const layouts = overrides.filter((record) => record?.recordType === "layout"
    && record.reviewStatus === "approved" && record.enabled !== false);
  if (!layouts.length || LAYOUT_SKIP_KINDS.has(answer.kind)) return answer;
  const names = (answer.compounds || []).map((name) => String(name).toLowerCase());
  const slugs = new Set(names.map((name) => COMPOUND_SLUG_BY_NAME.get(name)).filter(Boolean));
  const categories = new Set(names.map((name) => COMPOUND_CATEGORY_BY_NAME.get(name)).filter(Boolean));
  const layout = layouts.find((record) => record.targetKind === "compound" && slugs.has(record.targetValue))
    || layouts.find((record) => record.targetKind === "category" && categories.has(String(record.targetValue || "").toLowerCase()));
  return layout ? applyAnswerLayout(answer, layout) : answer;
}

/* WHICH SOURCES A MEMBER CAN STILL TAP (task dd119599, 7 September 2026).
 *
 * Kieran believed PEARL named its sources. It did more than that: every source was a clickable
 * link opening that website in a new tab, and the peptide reference sites were listed ABOVE
 * PubMed. A member signed in to his own research tool, asking about retatrutide, was offered a
 * door out to somebody else's shop.
 *
 * His decision: keep the primary science tappable, turn the reference sites into plain text.
 * Every source is still SHOWN and still NAMED with its description. Only the tapping goes.
 *
 * This works because the studies already carry "Linked by PepCodex" in their detail line, so the
 * whole trail survives: this figure came from Peptpedia, Peptpedia got it from this study, here
 * is the study. Nothing about the answer's provenance is hidden, and the answer text is untouched.
 *
 * TRUSTED_RESEARCH_HOSTS is the whole rule, and it is the same list the engine already used to
 * decide which URLs an approved citation correction may ever add. One list, two jobs, so a host
 * cannot be trustworthy enough to cite but not to link, which would be a distinction nobody could
 * explain later.
 */
/* Hosts of sources marked memberVisible: false in the build. Peptora is the first (task ab2b7533).
 *
 * Kieran, 10 September 2026: "Ensure if peptora is used that no competitor info is ever shown to
 * any member for any sources used." Not linking it is not enough, because the strip still printed
 * its NAME, which is the competitor information. So a source marked this way is used for the
 * knowledge and never appears in the strip at all.
 *
 * This is deliberately stricter than the reference-site rule above, which credits a site as plain
 * text. That rule is about not sending a member to a rival. This one is about not naming one. */
const HIDDEN_SOURCE_HOSTS = new Set(
  RESEARCH_SOURCES.filter((source) => source.memberVisible === false)
    .map((source) => { try { return new URL(source.url).hostname; } catch { return null; } })
    .filter(Boolean),
);

function isHiddenSourceUrl(value) {
  try { return HIDDEN_SOURCE_HOSTS.has(new URL(value).hostname); } catch { return false; }
}

function finaliseSources(sources, allowHidden = false) {
  if (!Array.isArray(sources) || !sources.length) return sources;
  const visible = allowHidden ? sources : sources.filter((source) => !isHiddenSourceUrl(source?.url));
  const marked = visible.map((source) => ({ ...source, linkable: isTrustedResearchUrl(source.url) }));

  /* THE REPEATED SITE NAMES (the second half of task dd119599).
   *
   * The retatrutide dosage answer credited PeptideDosages.com four times over, every row reading
   * identically, and Kieran asked why it looked padded. It turned out NOT to be a duplicate bug:
   * they are four genuinely different pages, the 5 mg, 10 mg, 20 mg and 30 mg vial protocols, and
   * dropping three would have thrown real provenance away to tidy a display problem.
   *
   * So they are merged rather than deleted, and only where merging loses nothing:
   *
   * A LINK IS A DESTINATION. Two studies are two different places to go, so linkable sources are
   * never merged even when they share a label. Collapsing them would take a reachable citation
   * off the screen.
   *
   * A PLAIN-TEXT ROW IS AN ATTRIBUTION. Now that these are not tappable, the URL is invisible, so
   * four identical rows tell the reader nothing four times over. One row per site is the whole of
   * the true statement, and the count says how much of that site was drawn on.
   */
  const byLabel = new Map();
  const out = [];
  for (const source of marked) {
    if (source.linkable) { out.push(source); continue; }
    const existing = byLabel.get(source.label);
    if (!existing) {
      const row = { ...source, pageCount: 1 };
      byLabel.set(source.label, row);
      out.push(row);
      continue;
    }
    existing.pageCount += 1;
    existing.detail = `${stripPageCount(existing.detail)} | ${existing.pageCount} pages used`;
  }
  return out;
}

function stripPageCount(detail) {
  return String(detail || "").replace(/ \| \d+ pages used$/, "");
}

function decorateAnswer(answer, options = {}) {
  const corrected = applyAnswerLayouts(applyCitationCorrections(answer, options), options);
  const decorated = {
    ...corrected,
    sources: finaliseSources(corrected.sources, options.adminPreview === true),
    keyPoint: Object.hasOwn(corrected, "keyPoint") ? corrected.keyPoint : firstUsefulSentence(corrected.summary),
    followUps: corrected.followUps || followUpsFor(corrected, options),
  };
  if (decorated.kind === "dose") {
    const validation = validateDoseAnswer(decorated);
    decorated.diagnostic = decorated.diagnostic || knowledgeReceipt({
      match: "answer",
      entityIds: decorated.compounds || [],
      answer: decorated,
    });
    decorated.diagnostic.validation = validation;
  }
  // Receipts can contain internal source IDs, including licensed sources whose
  // identity is intentionally hidden from members. They are an admin QA tool,
  // not member-facing answer content.
  if (options.adminPreview !== true) delete decorated.diagnostic;
  return decorated;
}

function withInterpretation(answer, resolution, options = {}) {
  const interpretation = publicInterpretation(resolution);
  // The canonical name in the dose title already confirms what PEARL matched.
  // A second interpretation paragraph is noise in this deliberately short lane.
  if (answer.kind === "dose" && interpretation?.status === "resolved") interpretation.disclosure = "";
  return { ...decorateAnswer(answer, options), interpretation };
}

function aliasesFor(compound) {
  const aliases = new Set([
    normalize(compound.name),
    normalize(compound.slug),
    ...(compound.researchAliases || []).map(normalize),
  ]);
  aliases.add(normalize(compound.name.replace(/\([^)]*\)/g, "")));
  if (compound.name.includes("no DAC")) aliases.add("cjc1295withoutdac");
  if (compound.name.includes("with DAC")) aliases.add("cjc1295dac");
  return [...aliases].filter((alias) => alias.length >= 3);
}

const SEARCH_INDEX = COMPOUNDS.map((compound) => ({
  compound,
  aliases: aliasesFor(compound),
})).sort((a, b) => Math.max(...b.aliases.map((x) => x.length)) - Math.max(...a.aliases.map((x) => x.length)));

function mentionedCompounds(question) {
  const normalizedQuestion = normalize(question);
  const literalQuestion = String(question || "").toLowerCase();
  const found = [];
  for (const item of SEARCH_INDEX) {
    if (item.aliases.some((alias) => normalizedQuestion.includes(alias))) {
      if (!found.some((compound) => compound.slug === item.compound.slug)) found.push(item.compound);
    }
  }
  if (COMPARE_PATTERN.test(question) && found.length > 1) return found.slice(0, 3);
  const literalNames = found.filter((compound) => literalQuestion.includes(compound.name.toLowerCase()));
  if (literalNames.length) {
    const longest = Math.max(...literalNames.map((compound) => compound.name.length));
    const mostSpecific = literalNames.filter((compound) => compound.name.length === longest);
    if (mostSpecific.length === 1) return mostSpecific;
  }
  return found.slice(0, 3);
}

function readableSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseQuestionLanguage(value) {
  const corrected = readableSearchText(value)
    .split(" ")
    .map((word) => QUESTION_WORD_CORRECTIONS.get(word) || word)
    .join(" ");
  return corrected
    .replace(/\bwho does (it|this|that) work for\b/g, "what does $1 do and what benefits is $1 researched for")
    .replace(/\bwho (?:is|would) (it|this|that) for\b/g, "what does $1 do and what benefits is $1 researched for")
    .replace(/\bwhat (?:kind|type) of (?:person|people) does (it|this|that) (?:work for|help)\b/g, "what does $1 do and what benefits is $1 researched for")
    .replace(/\bwho does ([a-z0-9+ -]{2,80}?) work for\b/g, "what does $1 do and what benefits is $1 researched for")
    .replace(/\bside affect\b/g, "side effect")
    .replace(/\b(peptides?|compounds?|research|evidence) (for|on|related to) add\b/g, "$1 $2 attention deficit disorder")
    .replace(/\b(researched|studied) (for|on|related to) add\b/g, "$1 $2 attention deficit disorder")
    .replace(/\badd (research|condition|disorder|symptoms?)\b/g, "attention deficit disorder $1")
    .replace(/\bweight los\b/g, "weight loss")
    .replace(/\bhalf live\b/g, "half life");
}

function isDoseQuestion(value) {
  const understood = normaliseQuestionLanguage(value);
  return DOSE_PATTERN.test(understood) || IMPLIED_DOSE_PATTERN.test(understood);
}

const DYNAMIC_TOPIC_STOP_WORDS = new Set([
  "a", "about", "and", "are", "best", "category", "compound", "compounds", "could", "evidence", "for",
  "from", "goal", "goals", "help", "helps", "in", "increase", "increasing", "information", "is", "issue", "issues", "linked", "list", "most", "mystery",
  "of", "on", "peptide", "peptides", "please", "related", "relate", "research", "researched", "show", "source",
  "studied", "studies", "support", "supporting", "the", "thing", "things", "to", "top", "unknown", "unrelated", "use", "used", "using", "what", "which",
  "with", "would", "problem", "problems",
]);

function dynamicTopicFromQuestion(question) {
  if (!CATEGORY_INTENT_PATTERN.test(question)) return null;
  const understood = normaliseQuestionLanguage(question).replace(/[?!.]+$/g, "").trim();
  const match = understood.match(/\b(?:for|related to|relate to|linked to|research on|research about|evidence on|evidence about)\s+(.+)$/i);
  if (!match) return null;
  const label = match[1]
    .replace(/^(?:increasing|improving|reducing|supporting|helping with|researching)\s+/i, "")
    .replace(/\b(?:research|evidence|studies)\s*$/i, "")
    .trim();
  if (!label || label.length < 3 || label.length > 80) return null;
  const words = label.split(/\s+/).filter((word) => word.length >= 3 && !DYNAMIC_TOPIC_STOP_WORDS.has(word));
  const terms = unique([label, ...words]).slice(0, 8);
  if (!terms.length) return null;
  const topic = {
    id: `dynamic:${normalize(label)}`,
    label,
    pattern: /$a/,
    categories: [],
    terms,
    dynamic: true,
  };
  const enriched = enrichTopicWithConcept(topic);
  const strongest = matchesForTopic(enriched, 1)[0];
  // One incidental word in a large library is not enough to invent a new
  // category. Require more than a single plain-text hit plus evidence score.
  return strongest?.score >= 45 ? enriched : null;
}

function detectedTopics(question) {
  const understood = normaliseQuestionLanguage(question);
  const explicit = TOPIC_DEFINITIONS
    .filter((topic) => topic.pattern.test(understood))
    .map(enrichTopicWithConcept)
    .slice(0, 4);
  const exclusive = explicit.filter((topic) => topic.exclusive);
  if (exclusive.length) return exclusive;
  if (explicit.length) return explicit;
  const dynamic = dynamicTopicFromQuestion(understood);
  return dynamic ? [dynamic] : [];
}

function isContextFollowUp(question) {
  if (FOLLOW_UP_PATTERN.test(question)) return true;
  const understood = normaliseQuestionLanguage(question);
  const wordCount = understood.split(" ").filter(Boolean).length;
  if (wordCount > 7) return false;
  return [DOSE_PATTERN, STUDY_PATTERN, SAFETY_PATTERN, HALF_LIFE_PATTERN, CONFLICT_PATTERN, MECHANISM_PATTERN, LIMITATIONS_PATTERN, HUMAN_STUDY_PATTERN, ANIMAL_STUDY_PATTERN, LAB_STUDY_PATTERN, INDIRECT_EVIDENCE_PATTERN, RELATED_RESEARCH_PATTERN]
    .some((pattern) => pattern.test(understood));
}

function editDistance(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function fuzzyCompounds(question, limit = 4) {
  const tokens = readableSearchText(question).split(" ").filter((token) =>
    token.length >= 4 && !DYNAMIC_TOPIC_STOP_WORDS.has(token),
  );
  if (!tokens.length) return [];
  return SEARCH_INDEX.map((item) => {
    const score = Math.min(...item.aliases.flatMap((alias) =>
      tokens.map((token) => editDistance(alias, normalize(token)) / Math.max(alias.length, token.length)),
    ));
    return { compound: item.compound, score };
  })
    .filter((item) => item.score <= 0.28)
    .sort((a, b) => a.score - b.score || a.compound.name.localeCompare(b.compound.name))
    .slice(0, limit)
    .map((item) => item.compound);
}

function topicMatch(compound, topic) {
  const cacheKey = `${topic.id}|${compound.slug}`;
  if (TOPIC_MATCH_CACHE.has(cacheKey)) return TOPIC_MATCH_CACHE.get(cacheKey);
  if (topic.allowedSlugs?.length && !topic.allowedSlugs.includes(compound.slug)) {
    TOPIC_MATCH_CACHE.set(cacheKey, null);
    return null;
  }
  if (!topic.dynamic && !topic.allowedSlugs?.length && BLEND_PROFILE_SLUGS.has(compound.slug)) {
    TOPIC_MATCH_CACHE.set(cacheKey, null);
    return null;
  }
  const name = readableSearchText(compound.name);
  const tagline = readableSearchText(compound.tagline);
  const mechanism = readableSearchText(compound.mechanism);
  const benefits = compound.benefits.map(readableSearchText);
  const timeline = compound.timeline.map((item) => readableSearchText(item.text));
  const research = readableSearchText([
    ...(compound.researchTopics || []),
    ...(compound.researchProfiles || []).flatMap((profile) => [
      profile.fullName,
      ...profile.aliases,
      ...profile.categories,
      ...profile.claims.flatMap((claim) => [claim.summary, claim.evidence, claim.mechanism, ...claim.topics]),
    ]),
  ].join(" "));
  const categoryMatch = topic.categories.includes(compound.category);
  let score = categoryMatch ? 60 : 0;
  let matchedText = categoryMatch;
  const connection = bestResearchConnection(compound, topic);
  if (connection) {
    score += connection.relationship.rank * 30;
    matchedText = true;
  }
  const preferredIndex = (topic.preferredSlugs || []).indexOf(compound.slug);
  if (preferredIndex >= 0) score += 72 - preferredIndex * 6;

  for (const rawTerm of topic.terms) {
    const term = readableSearchText(rawTerm);
    if (name.includes(term)) {
      score += 18;
      matchedText = true;
    }
    if (tagline.includes(term)) {
      score += 15;
      matchedText = true;
    }
    if (benefits.some((benefit) => benefit.includes(term))) {
      score += 13;
      matchedText = true;
    }
    if (mechanism.includes(term)) {
      score += 9;
      matchedText = true;
    }
    if (timeline.some((item) => item.includes(term))) {
      score += 5;
      matchedText = true;
    }
    if (research.includes(term)) {
      score += 14;
      matchedText = true;
    }
  }

  if (!matchedText) {
    TOPIC_MATCH_CACHE.set(cacheKey, null);
    return null;
  }
  score += Math.max(0, Math.min(5, compound.evidenceScore)) * 3;

  const matchingBenefit = compound.benefits.find((benefit) =>
    topic.terms.some((term) => readableSearchText(benefit).includes(readableSearchText(term))),
  );
  const matchingClaim = (compound.researchProfiles || [])
    .flatMap((profile) => profile.claims)
    .find((claim) => topic.terms.some((term) => {
      const needle = readableSearchText(term);
      return readableSearchText([claim.summary, claim.evidence, claim.mechanism, ...claim.topics].join(" ")).includes(needle);
    }));
  const reason = connection?.relationship.explanation
    || matchingClaim?.summary
    || matchingBenefit
    || (categoryMatch
      ? `The reviewed library classifies this entry under ${compound.category}.`
      : `The reviewed record links this entry with ${topic.label}.`);

  const result = { compound, score, reason, connection };
  TOPIC_MATCH_CACHE.set(cacheKey, result);
  return result;
}

function matchesForTopic(topic, limit) {
  return COMPOUNDS
    .map((compound) => topicMatch(compound, topic))
    .filter(Boolean)
    .sort((a, b) => {
      const preferred = topic.preferredSlugs || [];
      const aIndex = preferred.indexOf(a.compound.slug);
      const bIndex = preferred.indexOf(b.compound.slug);
      if (aIndex >= 0 || bIndex >= 0) {
        if (aIndex < 0) return 1;
        if (bIndex < 0) return -1;
        if (aIndex !== bIndex) return aIndex - bIndex;
      }
      return b.score - a.score
        || b.compound.evidenceScore - a.compound.evidenceScore
        || a.compound.name.localeCompare(b.compound.name);
    })
    .slice(0, limit);
}

function evidenceLabel(score) {
  if (score >= 5) return "Source rating: 5 out of 5";
  if (score === 4) return "Source rating: 4 out of 5";
  if (score === 3) return "Source rating: 3 out of 5";
  if (score === 2) return "Source rating: 2 out of 5, limited evidence";
  return "Source rating: 1 out of 5, very limited evidence";
}

const TRUSTED_RESEARCH_HOSTS = new Set([
  "pubmed.ncbi.nlm.nih.gov",
  "pmc.ncbi.nlm.nih.gov",
  "www.nejm.org",
  "www.nature.com",
  "link.springer.com",
  "doi.org",
  "www.jofem.org",
  "clinicaltrials.gov",
  "www.clinicaltrials.gov",
  "www.fda.gov",
  // DailyMed is the FDA's own database of approved medicine labels, so it belongs
  // beside fda.gov. Added 7 September 2026 with the source-link change (task
  // dd119599): this list now decides which sources a member can still tap, and
  // leaving DailyMed off it would have turned 37 official label citations into
  // plain text alongside the peptide sites they are nothing like.
  "dailymed.nlm.nih.gov",
  "www.dailymed.nlm.nih.gov",
  "www.ema.europa.eu",
  "www.wada-ama.org",
]);

function isTrustedResearchUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && TRUSTED_RESEARCH_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function sourceLinks(compound) {
  const dosageSources = (dosagePriorityFor(compound)?.protocols || []).map((protocol) => ({
    label: protocol.label,
    detail: protocol.evidenceType,
    url: protocol.sourceUrl,
  }));
  const studies = compound.studies
    .filter((study) => isTrustedResearchUrl(study.url))
    .map((study) => ({
      label: study.title,
      detail: [study.journal, study.pmid ? `PMID ${study.pmid}` : ""].filter(Boolean).join(" | "),
      url: study.url,
    }));

  const claims = (compound.researchProfiles || []).flatMap((profile) => profile.claims);
  const expandedSourcePages = claims.map((claim) => {
    const source = SOURCE_BY_ID.get(claim.sourceId);
    return {
      label: source?.name || claim.sourceId,
      detail: [source?.role, claim.lastReviewed && claim.lastReviewed !== "Not stated" ? `Reviewed ${claim.lastReviewed}` : ""].filter(Boolean).join(" | "),
      url: claim.url,
    };
  });
  const expandedReferences = claims.flatMap((claim) => {
    /* sourceName, not source.name, so a member-hidden source is credited without being named here
       too. This line was the last place "Linked by Peptora" reached a member after the strip and
       the bullet prefixes were dealt with, and the study it points at is real and stays linked. */
    return claim.references.filter((reference) => isTrustedResearchUrl(reference.url)).map((reference) => ({
      label: reference.title,
      detail: `Linked by ${sourceName(claim.sourceId)}`,
      url: reference.url,
    }));
  });
  const conflictReferences = conflictsFor(compound).flatMap((conflict) =>
    (conflict.references || []).map((reference) => ({
      label: reference.title,
      detail: `Used to resolve ${conflict.field}`,
      url: reference.url,
    })),
  );

  const original = compound.addedFromExpandedLibrary ? [] : [{
      label: SOURCE_METADATA.sourceName,
      detail: `Supplied reference snapshot, ${SOURCE_METADATA.fetchedOn}`,
      url: SOURCE_METADATA.sourceUrl,
    }];

  return [
    ...dosageSources,
    ...original,
    ...expandedSourcePages,
    ...conflictReferences,
    ...studies,
    ...expandedReferences,
  // 12 → 32 with the step 4 cap raises: claims now carry up to 10 references
  // each, and this strip is a collapsed "where this came from" disclosure, so
  // it grows rather than silently rotating older citations out.
  ].filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index).slice(0, 32);
}

/**
 * The name a member sees against a line of evidence.
 *
 * Every provenance line in this engine goes through here, which is why the one rule for a
 * member-hidden source lives here too rather than in a dozen call sites. Dropping such a source
 * from the sources STRIP was not enough: the bullets themselves are written as "Peptora: ..." and
 * that prefix is the competitor's name, in the answer text, which is exactly what Kieran's
 * instruction of 10 September 2026 forbids.
 *
 * So it is credited without being named. The line keeps its shape, the reader still sees that the
 * figure came from a reference library rather than from us, and the real source stays in the
 * generated audit for anyone who needs to trace it. Nothing is claimed that is not true: it IS a
 * licensed reference library.
 */
function sourceName(sourceId) {
  if (sourceId === "curated-dose-priority") return "Prioritised numerical evidence";
  const source = SOURCE_BY_ID.get(sourceId);
  if (source?.memberVisible === false) return "Licensed reference library";
  return source?.name || sourceId;
}

function researchClaims(compound) {
  return (compound.researchProfiles || [])
    .flatMap((profile) => profile.claims)
    .sort((a, b) => sourcePriority(b.sourceId) - sourcePriority(a.sourceId));
}

function conflictsFor(compound) {
  const keys = new Set([normalize(compound.slug), normalize(compound.name), ...(compound.researchProfiles || []).map((profile) => profile.key)]);
  return RESEARCH_CONFLICTS.filter((conflict) => conflict.key === "all" || keys.has(conflict.key));
}

/* Preparation and handling, exactly as a source words it, attributed to that
   source. Added 19 Aug 2026: Samuel's rule is that a supplied source goes into
   PEARL in full, so a site whose pages are largely preparation needs that
   content to actually reach an answer rather than sit unused in the library.
   Every line is prefixed with the source that said it, so nothing here reads
   as PEARL's own instruction. */
function preparationLines(compound) {
  return unique((compound.researchProfiles || [])
    .flatMap((profile) => profile.claims || [])
    .flatMap((claim) => (claim.preparation || []).map((line) => `${sourceName(claim.sourceId)}: ${line}`)))
    .slice(0, 16);
}

function protocolContextTerms(compound, question) {
  return readableSearchText(question).split(" ").filter((term) =>
    term.length >= 3
    && !DYNAMIC_TOPIC_STOP_WORDS.has(term)
    && !/^(dose|doses|dosage|amount|number|protocol|range|schedule|cycle|study|studies|trial|trials|listed)$/.test(term)
    && !aliasesFor(compound).some((alias) => alias.includes(normalize(term))),
  );
}

function protocolMatchesQuestion(protocol, compound, question) {
  const context = readableSearchText([protocol.label, protocol.population, protocol.evidenceType].join(" "));
  return protocolContextTerms(compound, question).some((term) => context.includes(term));
}

function protocolLines(compound, question = "", includeAllSources = false) {
  const priorityRecord = dosagePriorityFor(compound);
  const allProtocols = compileProtocols(compound, priorityRecord);
  const contextTerms = protocolContextTerms(compound, question);
  if (contextTerms.length) {
    const matched = allProtocols.filter((protocol) => protocolMatchesQuestion(protocol, compound, question));
    if (matched.length) return matched;
  }
  // The admin review shows every distinct figure so disagreements can be
  // inspected before the member-facing format is switched over.
  if (includeAllSources) return allProtocols;
  const reviewed = allProtocols.filter((protocol) => protocol.sourceId === "curated-dose-priority");
  const supplied = allProtocols.filter((protocol) => protocol.sourceId !== "pearl-baseline");
  return reviewed.length ? reviewed : (supplied.length ? supplied : allProtocols);
}

function claimStudyCounts(claim) {
  const counts = [];
  if (Number.isFinite(claim?.humanStudies)) counts.push(`${claim.humanStudies} human studies listed by the source`);
  if (Number.isFinite(claim?.animalStudies)) counts.push(`${claim.animalStudies} animal studies listed by the source`);
  return counts.join("; ") || "The source does not give a reliable study count.";
}

function claimResearchDetail(claim) {
  return `${sourceName(claim.sourceId)}: ${studyTypeForClaim(claim)}; population: ${populationForClaim(claim)}; ${evidenceStrengthForClaim(claim)}. ${claimStudyCounts(claim)}`;
}

function strongestClaim(compound) {
  return researchClaims(compound)
    .filter((claim) => claim.evidence || claim.summary)
    .sort((left, right) => {
      const human = (claim) => populationForClaim(claim) === "Human" ? 1 : 0;
      return human(right) - human(left)
        || (right.humanStudies || 0) - (left.humanStudies || 0)
        || (right.references?.length || 0) - (left.references?.length || 0);
    })[0] || null;
}

function boundaryAnswer(title, summary, compounds = []) {
  return {
    kind: "boundary",
    title,
    summary,
    bullets: [
      "I can show what the supplied source lists for a named compound.",
      "I can summarise its mechanism, evidence note, risks and linked papers.",
      "A qualified clinician or pharmacist must answer questions about you personally.",
    ],
    compounds: compounds.map((compound) => compound.name),
    sources: compounds.flatMap(sourceLinks).slice(0, 12),
  };
}

function personalResearchAnswer(answer) {
  const notice = "I cannot recommend what you should take or use personally.";
  return {
    ...answer,
    keyPoint: answer.kind === "recommendation" && answer.keyPoint
      ? `${notice} ${answer.keyPoint}`
      : notice,
    summary: answer.kind === "dose"
      ? "These are the source-listed figures. For research use only."
      : `Here is what the supplied sources say. ${answer.summary}`,
  };
}

const GOAL_COMPOUND_ALIASES = new Map([
  ["b7-33", "relaxin"],
  ["dsip-5mg", "dsip"], ["nad-1000mg", "nad"],
  ["l-carnitine-5000mg", "lcarnitine"], ["hgh191aa", "hgh-191aa"],
  ["n-acetyl-semax-amidate", "nasemaxamidate"], ["ll-37", "ll37"],
  ["cjc-1295", "cjc-1295-no-dac"],
]);

function goalCompound(slug) {
  return COMPOUND_BY_SLUG.get(slug) || COMPOUND_BY_SLUG.get(GOAL_COMPOUND_ALIASES.get(slug));
}

function wordsForGoalMatch(value) {
  return normaliseQuestionLanguage(value).replace(/[^a-z0-9+]+/g, " ").trim();
}

function guidedGoalForQuestion(question, topics, forcedGoalIds = []) {
  for (const id of forcedGoalIds) {
    const forced = GOAL_GUIDANCE_BY_ID.get(id);
    if (forced) return forced;
  }
  let text = wordsForGoalMatch(question);
  if (/\binstead\b/.test(text) && /\bwhat about\b/.test(text)) text = text.slice(text.lastIndexOf("what about") + "what about".length).trim();
  const tokens = new Set(text.split(/\s+/).filter(Boolean));
  let best = null;
  let exact = null;
  for (const goal of GOAL_GUIDANCE) {
    for (const phrase of goal.intentPhrases) {
      const candidate = wordsForGoalMatch(phrase);
      if (text.includes(candidate) && (!exact || candidate.length > exact.phrase.length)) exact = { goal, phrase: candidate };
      const phraseTokens = candidate.split(/\s+/).filter(Boolean);
      const hits = phraseTokens.filter((token) => tokens.has(token)).length;
      const score = hits / Math.max(phraseTokens.length, 1);
      if (hits && (!best || score > best.score)) best = { goal, score };
    }
  }
  if (exact) return exact.goal;
  for (const topic of topics) {
    const direct = GOAL_GUIDANCE_BY_ID.get(topic.id);
    if (direct) return direct;
  }
  return best?.score >= 0.66 ? best.goal : null;
}

function goalRecommendationAnswer(goal) {
  const picks = goal.shortlist.slice(0, goal.maxVisible).map((pick) => ({
    ...pick, compound: goalCompound(pick.slug),
  })).filter((pick) => pick.compound);
  if (!picks.length) return {
    kind: "recommendation", title: `No clear supplied match for ${goal.label}`,
    keyPoint: goal.caution,
    summary: "PEARL will not fill a gap by guessing or naming something outside the supplied catalogue.",
    bullets: [], sections: [], topicIds: [goal.id], compounds: [], sources: [],
    followUps: ["Show the related research"],
  };
  return {
    kind: "recommendation",
    title: picks.length === 1 ? `Closest source match for ${goal.label}` : `Top source matches for ${goal.label}`,
    keyPoint: picks.length === 1
      ? `${picks[0].name} is the closest match in PEARL's supplied research.`
      : `The strongest supplied research matches are ${joinWithAnd(picks.map((pick) => pick.name))}.`,
    summary: "These are ranked by their reviewed link to the goal, not by personal suitability.",
    sections: [{ title: picks.length === 1 ? "Best source match" : "Top source matches", items: picks.map((pick) => `${pick.name}: ${pick.oneLine}`) }],
    bullets: [], topicIds: [goal.id], compounds: picks.map((pick) => pick.name),
    sources: picks.flatMap((pick) => sourceLinks(pick.compound)).filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index).slice(0, 12),
    followUps: [goal.moreDetailPrompt, "Show all related research"],
  };
}

/* One plain sentence with the figures in it (task 7009d5db). The "Key answer"
   box used to show the disclaimer, because keyPoint fell back to the first
   sentence of the summary, so a member read a warning where the answer should
   be and had to hunt for the numbers below. Kieran: "a simplified version
   should appear for the common researcher". The figures are copied from the
   same rows shown in the boxes underneath; nothing is added, converted or
   averaged, and the detail stays where it was. */
function joinWithAnd(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function doseKeyPoint(compound, dose, protocols, fromProtocols) {
  const stated = (value) => value && value !== "Not stated";
  if (fromProtocols) {
    const rows = protocols.slice(0, dose.length);
    const figures = rows.map((protocol) => {
      const frequency = stated(protocol.frequency) ? ` (${protocol.frequency.charAt(0).toLowerCase()}${protocol.frequency.slice(1)})` : "";
      return `${protocol.dose}${frequency}`;
    });
    const routes = unique(rows.map((protocol) => protocol.route).filter(stated));
    const species = unique(rows.map((protocol) => protocol.species).filter(stated));
    const where = [
      routes.length === 1 ? routes[0].toLowerCase() : "",
      species.length === 1
        ? `in ${species[0].toLowerCase()} studies`
        : species.length > 1 ? "across human and animal studies" : "",
    ].filter(Boolean).join(", ");
    return `${compound.name}: the sources list ${joinWithAnd(figures)}${where ? `, ${where}` : ""}. Study figures, not a recommendation.`;
  }
  const withFigures = dose.filter((row) => /\d/.test(String(row.value || "")));
  return `${compound.name}: the source lists ${joinWithAnd(withFigures.map((row) => `${row.label.toLowerCase()} ${row.value}`))}. Study figures, not a recommendation.`;
}

function doseAnswer(compound, question = "", options = {}) {
  const limited = compound.evidenceScore <= 2;
  const priority = dosagePriorityFor(compound);
  const protocols = protocolLines(compound, question, options.adminPreview === true);
  const added = compound.addedFromExpandedLibrary;
  const useProtocols = Boolean(priority || added || protocols.some((protocol) => protocolMatchesQuestion(protocol, compound, question)));
  const dose = useProtocols && protocols.length
    ? protocols.slice(0, 6).map((protocol) => ({
        label: protocol.label,
        value: [protocol.dose, protocol.frequency, protocol.route, protocol.species].filter((value) => value && value !== "Not stated").join(" | "),
        source: options.adminPreview === true && protocol.sourceUrl ? {
          label: protocol.label || sourceName(protocol.sourceId),
          detail: protocol.evidenceType || "Source for this figure",
          url: protocol.sourceUrl,
          linkable: isTrustedResearchUrl(protocol.sourceUrl),
        } : null,
      }))
    : [
        { label: "Lower source range", value: compound.sourceDose.low },
        { label: "Standard source range", value: compound.sourceDose.standard },
        { label: "Higher source range", value: compound.sourceDose.high },
      ];
  const usedProtocols = protocols.slice(0, dose.length);
  const protocolSources = usedProtocols.map((protocol) => ({
        label: protocol.label || sourceName(protocol.sourceId),
        detail: protocol.evidenceType || "Source for the listed research dose",
        url: protocol.sourceUrl,
      })).filter((source, index, all) => source.url && all.findIndex((item) => item.url === source.url) === index);
  const doseSources = protocolSources.length ? protocolSources : sourceLinks(compound).slice(0, 3);
  /* Kieran, 19 Aug 2026. Adding three sources brought in 27 entries the
     reviewed library holds NO source-listed figure for, because those sources'
     dosing sections are deliberately not imported. The answer still announced
     "source-listed research ranges" and "these figures are transcribed from
     ...", and then showed no figures at all. Promising numbers and delivering
     none is worse than saying there are none, so when nothing numeric is held
     the answer says so first and drops the figure block entirely. */
  const numericDose = dose.filter((item) => /\d/.test(String(item.value || ""))).map((item, index) => {
    if (options.adminPreview !== true) return item;
    if (item.source) return item;
    const source = doseSources[index] || doseSources[0] || null;
    return {
      ...item,
      source: source ? { ...source, linkable: isTrustedResearchUrl(source.url) } : null,
    };
  });
  const hasFigures = numericDose.length > 0;
  if (!hasFigures) {
    return {
      kind: "dose",
      title: `${compound.name}: no source-listed numbers are held`,
      keyPoint: "",
      summary: `No source-listed research dose is held for ${compound.name}. For research use only.`,
      sections: [],
      dose: [],
      bullets: [],
      followUps: ["How do I use the dosage calculator?"],
      compounds: [compound.name],
      sources: doseSources,
    };
  }
  return {
    kind: "dose",
    title: `${compound.name}: research dose`,
    keyPoint: "",
    summary: "For research use only.",
    sections: [],
    dose: numericDose,
    bullets: [],
    followUps: ["How do I use the dosage calculator?"],
    compounds: [compound.name],
    sources: doseSources,
  };
}

function evidenceAnswer(compound) {
  const papers = compound.studies.length
    ? compound.studies.map((study) => `${study.title} (${study.journal || "journal not listed"}): ${study.summary}`)
    : [];
  const claims = researchClaims(compound)
    .filter((claim) => claim.evidence)
    .map((claim) => `${sourceName(claim.sourceId)}: ${claim.evidence}`)
    .slice(0, 5);
  const detailedClaims = researchClaims(compound).filter((claim) => claim.evidence || claim.summary).slice(0, 5);

  return {
    kind: "evidence",
    title: `${compound.name}: research listed by the sources`,
    summary: compound.evidenceNote,
    sections: [
      {
        title: "What the research shows",
        items: detailedClaims.map((claim) => `${sourceName(claim.sourceId)}: ${firstUsefulSentence(claim.summary || claim.evidence, 320)}`),
      },
      {
        title: "Evidence strength",
        items: detailedClaims.map(claimResearchDetail),
      },
      {
        title: "Limitations",
        // 8 → 16 with the step 4 cap raises: each source now carries up to 8
        // limitation lines, so the union cap doubles too or the first source
        // would displace every other source's limitations.
        items: unique(detailedClaims.flatMap((claim) => limitationsForClaim(claim))).slice(0, 16),
      },
    ],
    bullets: [
      evidenceLabel(compound.evidenceScore),
      ...claims,
      ...papers.slice(0, 16),
      ...(!claims.length && !papers.length ? ["The supplied sources do not list a linked study for this compound."] : []),
    ],
    compounds: [compound.name],
    sources: sourceLinks(compound),
  };
}

function safetyAnswer(compound) {
  const expandedSafety = researchClaims(compound)
    .filter((claim) => ["peptide-handbook", "halflife-labs", "peptpedia"].includes(claim.sourceId))
    .flatMap((claim) => claim.safety.map((item) => `${sourceName(claim.sourceId)}: ${item}`));
  const originalSafety = compound.sideEffects.map((effect) => `${effect.text} [${effect.severity} source severity]`);
  const bullets = unique([...originalSafety, ...expandedSafety]).slice(0, 8);
  return {
    kind: "safety",
    title: `${compound.name}: source-listed risks`,
    summary: "Source-listed risks only. Missing human safety data does not mean a compound is safe.",
    bullets: bullets.length ? bullets : ["The supplied sources do not list side effects for this compound."],
    compounds: [compound.name],
    sources: sourceLinks(compound),
  };
}

function overviewAnswer(compound) {
  const claims = researchClaims(compound);
  const summary = claims.find((claim) => claim.summary)?.summary || compound.tagline;
  const mechanism = claims.find((claim) => claim.mechanism)?.mechanism || compound.mechanism;
  const best = strongestClaim(compound);
  return {
    kind: "overview",
    title: compound.name,
    summary,
    sections: [
      { title: "Why it is researched", items: [firstUsefulSentence(summary, 240)] },
      { title: "How it works in the research", items: [firstUsefulSentence(mechanism, 240)] },
      { title: "Evidence strength", items: best ? [claimResearchDetail(best)] : [compound.evidenceNote] },
      { title: "Main limitations", items: best ? limitationsForClaim(best).slice(0, 3) : ["The approved sources do not clearly state the research limitations."] },
    ],
    bullets: conflictsFor(compound)
      .filter((conflict) => conflict.status === "needs-review")
      .slice(0, 2)
      .map((conflict) => `Unresolved source difference: ${conflict.field}. ${conflict.preferred}`),
    compounds: [compound.name],
    sources: sourceLinks(compound),
  };
}

function audienceBenefitsAnswer(compound) {
  const answer = overviewAnswer(compound);
  const areas = unique([...(compound.researchTopics || []), ...(compound.benefits || [])])
    .map((item) => typeof item === "string" ? item : item?.text)
    .filter(Boolean)
    .filter((item) => !/^(research|clinical-stage|fda-approved|ema-approved)$/i.test(item))
    .slice(0, 3);
  const focus = areas.length ? joinWithAnd(areas) : firstUsefulSentence(answer.summary, 180);
  return {
    ...answer,
    title: `What ${compound.name} is researched for`,
    keyPoint: `The supplied research connects ${compound.name} with ${focus}. In everyday terms, that describes the goals someone may be asking about, not whether it is suitable for that person.`,
  };
}

function conciseComparisonText(value, fallback, limit = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  const firstSentence = text.match(/^.*?[.!?](?=\s|$)/)?.[0] || text;
  if (firstSentence.length <= limit) return firstSentence;
  const shortened = firstSentence.slice(0, limit + 1);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 80 ? lastSpace : limit).trim()}...`;
}

function comparisonPurpose(compound) {
  const topics = unique([...(compound.researchTopics || []), ...(compound.benefits || [])])
    .filter((topic) => !/^[-\s]/.test(topic))
    .filter((topic) => !/^(research|fda-approved|ema-approved|clinical-stage)$/i.test(topic))
    .slice(0, 3);
  return topics.length
    ? `${compound.category}. ${topics.join("; ")}.`
    : `${compound.category}. ${conciseComparisonText(compound.tagline, "No narrower research purpose is stated.", 160)}`;
}

function comparisonEvidence(compound) {
  return `${evidenceLabel(compound.evidenceScore)}. ${conciseComparisonText(
    compound.evidenceNote,
    "The reviewed sources do not state the evidence quality clearly.",
    210,
  )}`;
}

function halfLifeHours(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)\s*(minute|minutes|hour|hours|day|days|week|weeks)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("minute")) return amount / 60;
  if (unit.startsWith("week")) return amount * 24 * 7;
  if (unit.startsWith("day")) return amount * 24;
  return amount;
}

function comparisonHalfLife(compound) {
  const conflict = conflictsFor(compound).find((item) =>
    item.field === "half-life" || item.field === "half-life and formulation");
  if (conflict?.status === "resolved" && conflict.preferred) {
    return conciseComparisonText(conflict.preferred, "No preferred half-life interpretation is recorded.", 240);
  }

  const values = researchClaims(compound)
    .filter((claim) => claim.halfLife)
    .map((claim) => ({ value: claim.halfLife, source: sourceName(claim.sourceId) }))
    .filter((item, index, all) => all.findIndex((candidate) =>
      candidate.value === item.value && candidate.source === item.source) === index);
  if (!values.length) return "Not clearly stated in the reviewed sources.";
  if (values.length === 1) return `${values[0].value} (${values[0].source})`;
  const comparableValues = values.map((item) => halfLifeHours(item.value));
  const firstComparable = comparableValues[0];
  const equivalent = firstComparable !== null
    && comparableValues.every((value) => value !== null
      && Math.abs(value - firstComparable) / Math.max(value, firstComparable, 1) <= 0.08);
  if (equivalent) return `${values[0].value} (${values[0].source})`;
  return `${values[0].value} (${values[0].source}). Other reviewed sources report different values, so formulation, route and species must be checked.`;
}

function comparisonDevelopmentStatus(compound) {
  const claims = researchClaims(compound);
  const statusCoreText = [
    compound.evidenceNote,
    compound.tagline,
  ].filter(Boolean).join(" ");
  const compoundSpecificText = [
    statusCoreText,
    ...(compound.researchTopics || []),
  ].filter(Boolean).join(" ");
  const statements = [
    compoundSpecificText,
    ...claims.flatMap((claim) => [claim.summary, claim.evidence, ...claim.topics]),
  ].filter(Boolean);
  const text = statements.join(" ");
  // Editorial pages can mention several compounds in one article. Do not let
  // an approval sentence about a neighbour turn this compound into an
  // approved medicine. The compound's own curated record is the status gate.
  const positiveApproval = [statusCoreText].some((statement) =>
    /\b(?:fda|ema)[ -]?approved\b/i.test(statement)
    && !/\b(?:not|no)\s+(?:fda|ema)[ -]?approved\b/i.test(statement));

  if (positiveApproval) return "Approved medicine status is stated in the reviewed sources.";

  if (/\b(?:no|zero) (?:published |completed )?human (?:interventional |clinical )?(?:trial|trials|data)\b/i.test(compoundSpecificText)) {
    return "Preclinical or animal research is reported; no human clinical trials are stated for this compound.";
  }

  const phase = /\bphase\s*(?:iii|3)\b/i.test(text)
    ? "Phase 3"
    : /\bphase\s*(?:ii|2)\b/i.test(text)
      ? "Phase 2"
      : /\bphase\s*(?:i|1)\b/i.test(text)
        ? "Phase 1"
        : "";
  if (/\binvestigational\b/i.test(text)) {
    return phase
      ? `Investigational; ${phase} research is stated in the reviewed sources.`
      : "Investigational status is stated in the reviewed sources.";
  }
  if (phase && /\b(halted|stopped|terminated)\b/i.test(text)) {
    return `${phase} research is mentioned, but the reviewed sources state that the programme was halted; no approval is stated.`;
  }
  if (phase) return `${phase} human research is stated; the reviewed sources do not state an approval.`;

  const humanStudies = Math.max(0, ...claims.map((claim) => Number(claim.humanStudies) || 0));
  if (humanStudies > 0 || /\bhuman (?:study|studies|trial|trials|research|data)\b/i.test(text)) {
    return "Human research is reported; the reviewed sources do not state an approval.";
  }
  if (/\b(preclinical|animal data|animal research|no human|zero human)\b/i.test(text) || compound.evidenceScore <= 2) {
    return "Preclinical or animal research is reported; no approved status is stated.";
  }
  return "Development status is not clearly stated in the reviewed sources.";
}

function comparisonTitle(compounds) {
  const names = compounds.map((compound) => compound.name);
  if (names.length === 2) return `${names[0]} compared with ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)} compared`;
}

function compareAnswer(compounds) {
  return {
    kind: "comparison",
    title: comparisonTitle(compounds),
    summary: "A neutral comparison of the reviewed research records, not a recommendation about which compound is better, safer or suitable for a person.",
    comparison: compounds.map((compound) => ({
      name: compound.name,
      purpose: comparisonPurpose(compound),
      evidence: comparisonEvidence(compound),
      halfLife: comparisonHalfLife(compound),
      status: comparisonDevelopmentStatus(compound),
    })),
    bullets: [
      "Evidence ratings describe the strength of the reviewed record, not personal effectiveness or safety.",
      "Half-life values are only directly comparable when the formulation, route and species match.",
      "Development status can change. Check the dates and wording in the linked sources.",
    ],
    compounds: compounds.map((compound) => compound.name),
    sources: compounds.flatMap(sourceLinks).filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index).slice(0, 24),
  };
}

function researchFilterForQuestion(question) {
  if (HUMAN_STUDY_PATTERN.test(question)) return "human";
  if (ANIMAL_STUDY_PATTERN.test(question)) return "animal";
  if (LAB_STUDY_PATTERN.test(question)) return "laboratory";
  if (LIMITATIONS_PATTERN.test(question)) return "limitations";
  if (INDIRECT_EVIDENCE_PATTERN.test(question)) return "relationship";
  return null;
}

function filteredEvidenceAnswer(compounds, filter, topicIds = []) {
  const topics = topicIds
    .map((id) => TOPIC_DEFINITIONS.find((topic) => topic.id === id))
    .filter(Boolean)
    .map(enrichTopicWithConcept);
  const rows = compounds.flatMap((compound) => {
    const claims = researchClaims(compound).filter((claim) => {
      const population = populationForClaim(claim);
      if (filter === "human") return population === "Human";
      if (filter === "animal") return population === "Animal" || /animal/i.test(studyTypeForClaim(claim));
      if (filter === "laboratory") return population === "Laboratory" || /laboratory|mechanistic/i.test(studyTypeForClaim(claim));
      return true;
    });
    if (filter === "relationship" && topics.length) {
      return topics.flatMap((topic) => {
        const connection = bestResearchConnection(compound, topic);
        return connection ? [{ compound, claim: connection.claim, connection }] : [];
      });
    }
    return claims.slice(0, 4).map((claim) => ({ compound, claim, connection: null }));
  });
  const names = unique(rows.map((row) => row.compound.name));
  const labels = {
    human: "human research",
    animal: "animal research",
    laboratory: "laboratory and mechanistic research",
    limitations: "research limitations",
    relationship: "direct and indirect evidence",
  };
  const label = labels[filter] || "research evidence";
  const noRows = !rows.length;
  return {
    kind: "evidence",
    title: `${label[0].toUpperCase()}${label.slice(1)}`,
    keyPoint: noRows
      ? `PEARL did not find ${label} clearly identified in the approved records for this context.`
      : `PEARL found ${rows.length} approved source ${rows.length === 1 ? "record" : "records"} matching ${label}.`,
    summary: noRows
      ? "This means the approved library does not clearly label a matching record. It does not prove that no research exists elsewhere."
      : "Study type and population are kept visible so human, animal and laboratory findings are not presented as though they were equivalent.",
    sections: noRows ? [] : [
      {
        title: "What the research shows",
        items: rows.map(({ compound, claim, connection }) =>
          `${compound.name}: ${connection?.relationship.label ? `${connection.relationship.label}. ${connection.relationship.explanation} ` : ""}${firstUsefulSentence(claim.summary || claim.evidence, 360)}`,
        ),
      },
      {
        title: "Evidence strength",
        items: rows.map(({ compound, claim }) => `${compound.name}: ${claimResearchDetail(claim)}`),
      },
      {
        title: "Limitations",
        items: unique(rows.flatMap(({ compound, claim }) => limitationsForClaim(claim).map((item) => `${compound.name}: ${item}`))).slice(0, 24),
      },
    ],
    bullets: noRows ? ["Try naming one compound, or ask for all research evidence rather than a study type."] : [],
    compounds: names.length ? names : compounds.map((compound) => compound.name),
    sources: compounds.flatMap(sourceLinks).filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index).slice(0, 24),
    topicIds,
  };
}

function compactSentence(value, maximum = 210) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maximum) return text;
  const shortened = text.slice(0, maximum - 1).replace(/\s+\S*$/, "").trim();
  return `${shortened}.`;
}

function topicDoseSnapshot(compound, topic) {
  const priority = dosagePriorityFor(compound);
  const protocols = protocolLines(compound).filter((item) => item?.dose && /\d/.test(item.dose));
  const preferredProtocol = topic?.protocolTerms?.length
    ? protocols.find((item) => {
        const context = readableSearchText([item.label, item.population, item.evidenceType].join(" "));
        return topic.protocolTerms.some((term) => context.includes(readableSearchText(term)));
      })
    : null;
  const protocol = preferredProtocol || protocols[0];
  if (protocol) {
    const level = priority?.confidence || protocol.evidenceType || sourceName(protocol.sourceId);
    const values = [protocol.dose, protocol.frequency, protocol.route, protocol.species]
      .filter((value) => value && value !== "Not stated")
      .join(" | ");
    return `${protocol.label}: ${compactSentence(values, 165)} Evidence level: ${compactSentence(level, 80)}.`;
  }
  const row = doseAnswer(compound).dose?.find((item) => item?.value && /\d/.test(item.value));
  if (!row) return "No verified numerical record is available in the reviewed library.";
  return `Original tertiary-source listing, not independently validated: ${row.label}: ${compactSentence(row.value, 145)}`;
}

/* Tiering (Kieran, 18 Aug 2026). Breadth on its own is not an improvement: a
   question about attention should not put a compound with a passing mechanistic
   overlap next to the one entry the sources actually studied for it. The engine
   already grades every connection (direct human 5, direct preclinical 4,
   related symptom 3, mechanistic 2, broad 1), so the answer now says so out
   loud and groups by it. That is what makes it safe to return fourteen entries
   where it used to return one. */
function indefinite(value) {
  return `${/^[aeiou]/i.test(String(value || "").trim()) ? "an" : "a"} ${value}`;
}

const TOPIC_TIERS = [
  {
    id: "direct",
    min: 4,
    title: "Most directly studied for this",
    note: "The reviewed sources discuss this condition or outcome directly for these entries. Direct does not mean proven, approved or suitable for anyone.",
  },
  {
    id: "related",
    min: 2,
    title: "Related or indirect research",
    note: "These are connected through a related symptom or a shared biological mechanism, not through research on the condition itself. A mechanism in common is not evidence of an effect.",
  },
  {
    id: "broad",
    min: 0,
    title: "Broad connection only",
    note: "These appear because the reviewed record uses related wording or sits in the same category. Treat them as background, not as candidates.",
  },
];

function tierForMatch(match) {
  const rank = match.connection?.relationship?.rank || 0;
  return TOPIC_TIERS.find((tier) => rank >= tier.min) || TOPIC_TIERS[TOPIC_TIERS.length - 1];
}

function topicAnswer(topics) {
  /* Kieran, 18 Aug 2026: "continue looking for the answer for all of them
     rather than stopping at one when she receives an answer". These caps were
     6 / 4 / 2, which threw away most of what the library actually holds on a
     topic. Raised so a single-topic question returns the full picture; the
     tiers above keep the extra breadth honest. */
  const limitPerTopic = topics.length === 1 ? 14 : topics.length === 2 ? 8 : 5;
  const groupedMatches = topics.map((topic) => ({
    topic,
    matches: matchesForTopic(topic, limitPerTopic),
  }));
  const compounds = groupedMatches
    .flatMap((group) => group.matches.map((match) => match.compound))
    .filter((compound, index, all) => all.findIndex((item) => item.slug === compound.slug) === index);
  const labels = topics.map((topic) => topic.label);
  const topicNotes = unique(topics.map((topic) => topic.note).filter(Boolean));
  const answerLead = topics.length === 1 ? topics[0].answerLead : null;
  const title = labels.length === 1
    ? answerLead
      ? `${answerLead}: first source match for ${labels[0]}`
      : `Source entries related to ${labels[0]}`
    : `Source entries related to ${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;

  const everyMatch = groupedMatches.flatMap(({ topic, matches }) => matches.map((match) => ({ ...match, topic })));
  const tiered = TOPIC_TIERS.map((tier) => ({
    tier,
    entries: everyMatch.filter((match) => tierForMatch(match).id === tier.id),
  })).filter((group) => group.entries.length);

  const tierSections = tiered.map(({ tier, entries }) => ({
    title: `${tier.title} (${entries.length})`,
    items: [
      tier.note,
      ...entries.map(({ compound, reason, connection, topic }) => {
        const label = connection?.relationship.label || "Broad research connection";
        const strength = connection ? ` ${evidenceLabel(compound.evidenceScore)}.` : "";
        const caution = topic.compoundNotes?.[compound.slug] ? ` ${topic.compoundNotes[compound.slug]}` : "";
        return `${compound.name}: ${label}. ${compactSentence(reason, 260)}${caution}${strength}`;
      }),
    ],
  }));

  const evidenceItems = everyMatch.map(({ compound, connection }) => {
    const claim = connection?.claim || strongestClaim(compound);
    return claim
      ? `${compound.name}: ${claimResearchDetail(claim)}`
      : `${compound.name}: ${evidenceLabel(compound.evidenceScore)}. ${compound.evidenceNote}`;
  });

  const limitationItems = unique(everyMatch.flatMap(({ compound, connection }) => {
    const claim = connection?.claim || strongestClaim(compound);
    const relationshipCaution = connection?.relationship.kind === "mechanistic" || connection?.relationship.kind === "broad"
      ? [`${compound.name}: this is an indirect connection and does not establish treatment effectiveness.`]
      : [];
    return [...relationshipCaution, ...(claim ? limitationsForClaim(claim).map((item) => `${compound.name}: ${item}`) : [])];
  })).slice(0, 24);

  const directCount = tiered.find((group) => group.tier.id === "direct")?.entries.length || 0;

  return {
    kind: "topic",
    title,
    keyPoint: compounds.length
      ? `${answerLead ? `${answerLead} is the first source match. ` : ""}PEARL searched every approved source and found ${compounds.length} research ${compounds.length === 1 ? "entry" : "entries"} connected with ${labels.join(" and ")}${directCount ? `, ${directCount} of which the sources study directly` : ", none of which the sources study directly"}. They are grouped below by how strong that connection actually is.`
      : `PEARL did not find a sufficiently clear approved research connection for ${labels.join(" and ")}.`,
    summary: `${answerLead ? `${answerLead} is the first source match. ` : ""}These entries match categories, conditions or descriptions across the reviewed research library. They are grouped by connection strength and then ordered by text relevance and evidence strength, not which compound is best or suitable for a person. Each entry shows its source-listed numbers; select any named compound for its full route, population, duration, evidence and limitations.${topicNotes.length ? ` Important evidence note: ${topicNotes.join(" ")}` : ""}`,
    sections: [
      ...tierSections,
      { title: "Evidence strength", items: evidenceItems },
      {
        title: "Research details and numbers",
        items: everyMatch.map(({ compound, topic }) =>
          `${compound.name}: record-wide source number, which may come from a different indication and must not be treated as ${indefinite(topic.label)} protocol. ${topicDoseSnapshot(compound, topic)}`,
        ),
      },
      { title: "Limitations", items: limitationItems.length ? limitationItems : ["The reviewed sources do not state a clear limitation for these entries. Open the linked papers to check design, size and bias."] },
    ],
    bullets: everyMatch.map((match) => {
      const { compound, reason, connection, topic } = match;
      const snapshot = ` Research-number snapshot: ${topicDoseSnapshot(compound, topic)}`;
      return `${topic.label}: ${compound.name}. ${connection?.relationship.label || "Broad research connection"}. ${compactSentence(reason, 180)}${topic.compoundNotes?.[compound.slug] ? ` Evidence caution: ${topic.compoundNotes[compound.slug]}` : ""} ${evidenceLabel(compound.evidenceScore)}.${snapshot} Evidence summary: ${compactSentence(compound.evidenceNote, 190)}`;
    }),
    compounds: compounds.map((compound) => compound.name),
    topicIds: topics.map((topic) => topic.id),
    sources: compounds
      .flatMap(sourceLinks)
      .filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index)
      .slice(0, 40),
  };
}

function halfLifeAnswer(compound) {
  const claims = researchClaims(compound).filter((claim) => claim.halfLife);
  const conflict = conflictsFor(compound).find((item) => item.field === "half-life" || item.field === "half-life and formulation");
  const bullets = claims.map((claim) =>
    `${sourceName(claim.sourceId)}: ${claim.halfLife}. ${claim.halfLifeContext}`,
  );
  if (conflict) bullets.unshift(`Preferred interpretation: ${conflict.preferred} Reason: ${conflict.rationale} Confidence: ${conflict.confidence}.`);
  if (!claims.length && !conflict) bullets.push("The supplied sources do not provide a sufficiently clear half-life value.");
  return {
    kind: "evidence",
    title: `${compound.name}: source-listed half-life`,
    summary: "Source-listed values, with formulation, route and species context where available.",
    bullets,
    compounds: [compound.name],
    sources: sourceLinks(compound),
  };
}

function conflictAnswer(compound) {
  const conflicts = conflictsFor(compound);
  return {
    kind: "evidence",
    title: `${compound.name}: source differences`,
    summary: conflicts.length
      ? "The knowledge base keeps conflicting claims and records why one is preferred or why no single value has been chosen."
      : "No material source conflict has been recorded for this compound. That does not mean every source agrees on every detail.",
    bullets: conflicts.length
      ? conflicts.map((conflict) => `${conflict.status === "resolved" ? "Resolved" : "Needs review"}: ${conflict.field}. ${conflict.preferred} ${conflict.rationale} Confidence: ${conflict.confidence}.`)
      : ["Open the linked source pages to compare their exact wording."],
    compounds: [compound.name],
    sources: sourceLinks(compound),
  };
}

const PRODUCT_PROVENANCE_DETAILS = {
  "windsor-glow": "Recorded by Windsor Glow or printed on the product page.",
  "product-name": "The component amounts are stated in the product name or strength label.",
  researched: "The component names are recorded by Windsor Glow, but the split comes from matching outside product information and should be checked against the label.",
  "worked-out": "The split was worked out from the total and matching formulations. It is not confirmed strongly enough to present as a guaranteed label fact.",
  unknown: "Windsor Glow has not recorded the formula.",
};

function formatProductAmount(component) {
  if (component.label) return component.label;
  if (Number.isFinite(component.mg)) return `${Number(component.mg.toFixed(3))} mg`;
  return "Amount not published";
}

function productSourceUrl(slug) {
  const publicSlugs = {
    "super-human-blend": "up389",
    "dsip-5mg": "dsip-10mg",
  };
  const publicSlug = publicSlugs[slug] || slug;
  return `https://windsorglow.com/shop/${publicSlug}`;
}

function componentCompoundsForProduct(slug, product) {
  if (product.isPeptide === false) return [];
  const direct = COMPOUND_BY_SLUG.get(slug);
  const names = product.components?.map((component) => component.name) || [product.what];
  const matches = [direct];
  for (const name of names) {
    if (!name) continue;
    const resolution = resolvePearlTerminology(name, COMPOUNDS);
    matches.push(...compoundsFromResolution(resolution));
  }
  return matches
    .filter(Boolean)
    .filter((compound, index, all) => all.findIndex((item) => item.slug === compound.slug) === index);
}

function productCompositionAnswer(productResolution, question, options = {}) {
  const { slug, name, product } = productResolution;
  const blend = PEARL_BLEND_MAPPINGS.find((mapping) => mapping.compositionSlug === slug) || null;
  const componentCompounds = componentCompoundsForProduct(slug, product);
  const compounds = [blend?.canonicalName || name, ...componentCompounds.map((compound) => compound.name)]
    .filter((item, index, all) => all.indexOf(item) === index);
  const interpretation = {
    status: "resolved",
    type: "product",
    method: productResolution.method,
    confidence: productResolution.confidence,
    matchedText: productResolution.matchedText,
    blend,
    entities: componentCompounds.map((compound) => ({ slug: compound.slug, label: compound.name })),
    suggestions: [],
    expandedTerms: compounds,
    disclosure: productResolution.method === "catalogue-name" || productResolution.matchedText === name
      ? ""
      : `I've interpreted '${productResolution.matchedText}' as ${name}.`,
  };

  if (product.unknown) {
    return withInterpretation({
      kind: "overview",
      title: `${name}: composition not recorded`,
      summary: `Windsor Glow has not recorded what is inside ${name}. PEARL will not guess or substitute a similar-sounding product.`,
      bullets: [
        "No component list or verified formula is available.",
        "This product should remain unavailable until Windsor Glow or its supplier records the full composition.",
      ],
      compounds: [name],
      sources: [],
    }, interpretation);
  }

  if (!product.components?.length) {
    return withInterpretation({
      kind: "overview",
      title: `${name}: what the product contains`,
      summary: `${name} is a single-product listing for ${product.what}.`,
      bullets: [
        product.plain,
        `Product type: ${product.kind}.`,
        "Product identity is not a dosage recommendation. Ask PEARL separately for the source-listed research ranges.",
      ],
      compounds,
      sources: [{ label: name, detail: "Windsor Glow catalogue identity", url: productSourceUrl(slug) }],
    }, interpretation);
  }

  const productCompositionSource = {
    label: name,
    detail: "Windsor Glow product composition",
    url: productSourceUrl(slug),
    linkable: false,
  };
  const amounts = product.components.map((component) => ({
    label: component.name,
    value: `${formatProductAmount(component)}${slug === "hhb" ? " per ml" : ""}`,
    ...(options.adminPreview === true ? { source: productCompositionSource } : {}),
  }));
  const peptideStatement = product.isPeptide === false
    ? `${name} contains no peptides. It is ${slug === "hhb" ? "a vitamin and nutrient mixture" : "an amino-acid mixture"}.`
    : `${name} contains ${product.components.map((component) => component.name).join(", ")}.`;
  const hasUnpublishedAmounts = product.components.some((component) => !component.label && !Number.isFinite(component.mg));
  const asksForNumbers = isDoseQuestion(question);
  const compositionContext = slug === "hhb"
    ? "These are the listed amounts per millilitre, not a recommended dose or a study protocol."
    : hasUnpublishedAmounts
      ? "This is the recorded ingredient list. Individual amounts are not published, and it is not a recommended dose or a study protocol."
      : "These are amounts in the whole product, not a recommended dose or a study protocol.";

  return withInterpretation({
    kind: asksForNumbers ? "dose" : "overview",
    title: `${name}: product composition`,
    summary: `${peptideStatement} ${compositionContext}`,
    dose: amounts,
    bullets: [
      `Product total: ${product.total}.`,
      `Composition evidence: ${PROVENANCE_LABELS[product.provenance]}. ${PRODUCT_PROVENANCE_DETAILS[product.provenance]}`,
      ...(hasUnpublishedAmounts ? ["The product names the ingredients but does not publish their individual amounts or ratios."] : []),
      ...(product.provenance === "worked-out" ? ["PEARL shows this as unconfirmed and does not treat it as a label fact."] : []),
      ...(componentCompounds.length ? ["PEARL keeps the research and dosage evidence for each peptide separate from the product composition."] : []),
    ],
    compounds,
    sources: [{ label: name, detail: "Windsor Glow product composition", url: productSourceUrl(slug) }],
  }, interpretation);
}

function blendComponents(mapping) {
  return mapping.components.map((slug) => COMPOUND_BY_SLUG.get(slug)).filter(Boolean);
}

function blendSourceLinks(mapping, components, profile) {
  const terminologySources = (mapping.sources || []).map((item) => ({
    label: item.label,
    detail: item.role,
    url: item.url,
  }));
  const researchSources = [
    ...(profile ? sourceLinks(profile) : []),
    ...components.flatMap(sourceLinks),
  ];
  return [...terminologySources, ...researchSources]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index)
    // 12 → 32 with the step 4 cap raises, same reason as sourceLinks.
    .slice(0, 32);
}

function sourceDoseForBlend(mapping) {
  return (mapping.sourceDose || []).map((protocol) => ({
    label: protocol.label,
    value: [protocol.dose, protocol.frequency, protocol.route, protocol.species]
      .filter((value) => value && value !== "Not stated")
      .join(" | "),
    source: protocol.sourceUrl ? {
      label: protocol.label || mapping.canonicalName,
      detail: protocol.evidenceType || "Source for this figure",
      url: protocol.sourceUrl,
      linkable: isTrustedResearchUrl(protocol.sourceUrl),
    } : null,
  }));
}

function blendCompositionBullets(mapping) {
  const product = mapping.compositionSlug ? PRODUCT_COMPOSITIONS[mapping.compositionSlug] : null;
  if (!product || product.unknown || !product.components?.length) return [];
  const name = PRODUCT_CATALOGUE_NAMES[mapping.compositionSlug] || product.plainName || mapping.canonicalName;
  const contents = product.components
    .map((component) => `${component.name} ${formatProductAmount(component)}`)
    .join(", ");
  return [
    `Windsor Glow product composition: ${name} contains ${contents}; ${product.total}.`,
    `Composition evidence: ${PROVENANCE_LABELS[product.provenance]}. ${PRODUCT_PROVENANCE_DETAILS[product.provenance]}`,
    "The product composition is not a research dose or a recommendation.",
  ];
}

function componentDoseForBlend(components) {
  return components.flatMap((compound) => {
    const protocol = protocolLines(compound)[0];
    if (!protocol) return [];
    const value = [protocol.dose, protocol.frequency, protocol.route, protocol.species]
      .filter((entry) => entry && entry !== "Not stated")
      .join(" | ");
    if (!/\d/.test(value)) return [];
    return [{
      label: `${compound.name}: source-listed numerical record`,
      value,
      source: protocol.sourceUrl ? {
        label: protocol.label || sourceName(protocol.sourceId),
        detail: protocol.evidenceType || "Source for this figure",
        url: protocol.sourceUrl,
        linkable: isTrustedResearchUrl(protocol.sourceUrl),
      } : null,
    }];
  });
}

function componentDoseBullets(components) {
  return components.flatMap((compound) => {
    const protocol = protocolLines(compound)[0];
    if (!protocol) return [];
    return [`${compound.name} numerical evidence: ${protocol.dose}; ${protocol.frequency}; route ${protocol.route}; species ${protocol.species}; context ${protocol.population}. ${protocol.evidenceType}.`];
  });
}

function blendContextBullets(mapping, components) {
  return [
    `Source-listed components: ${components.map((compound) => compound.name).join(", ")}.`,
    ...blendCompositionBullets(mapping),
    mapping.compositionFixed
      ? "The approved terminology source gives a fixed component list. Product strengths and protocols can still vary."
      : "The component names are consistent in the approved source, but the ratios and total strength are not standardised.",
    `Terminology confidence: ${mapping.confidence}. ${mapping.notes}`,
    ...(mapping.conflicts || []).map((conflict) => `Naming limitation: ${conflict}`),
  ];
}

function blendAnswer(mapping, question, options = {}) {
  const components = blendComponents(mapping);
  const profile = mapping.profileSlug ? COMPOUND_BY_SLUG.get(mapping.profileSlug) : null;
  const context = blendContextBullets(mapping, components);
  const sources = blendSourceLinks(mapping, components, profile);
  const compounds = [mapping.canonicalName, ...components.map((compound) => compound.name)];

  if (isDoseQuestion(question)) {
    const base = profile ? doseAnswer(profile, question, options) : null;
    const blendDose = base?.dose?.length ? base.dose : sourceDoseForBlend(mapping);
    const dose = [...blendDose, ...componentDoseForBlend(components)]
      .map((row) => options.adminPreview === true ? row : ({ label: row.label, value: row.value }));
    const protocols = mapping.sourceDose || [];
    if (!dose.some((row) => /\d/.test(String(row.value || "")))) {
      return {
        kind: "dose",
        title: `${mapping.canonicalName}: no source-listed numbers are held`,
        keyPoint: "",
        summary: `PEARL recognises the product and its components, but no source-listed numerical protocol is held for the blend or its components.`,
        dose: [],
        sections: [],
        bullets: context,
        followUps: ["How do I use the dosage calculator?"],
        compounds,
        sources,
        diagnostic: knowledgeReceipt({ match: `blend:${mapping.id}`, entityIds: compounds, answer: { kind: "dose", dose: [] } }),
      };
    }
    return {
      kind: "dose",
      title: `${mapping.canonicalName}: research dose`,
      keyPoint: "",
      summary: "For research use only.",
      dose,
      sections: [],
      bullets: [],
      followUps: ["How do I use the dosage calculator?"],
      compounds,
      sources,
      diagnostic: knowledgeReceipt({
        match: `blend:${mapping.id}`,
        entityIds: compounds,
        protocols,
        answer: { kind: "dose", dose },
      }),
    };
  }

  if (SAFETY_PATTERN.test(question)) {
    return {
      kind: "safety",
      title: `${mapping.canonicalName}: source-listed risks and limitations`,
      summary: "The approved source defines the name, but it does not establish that the combination is safe. The notes below keep component risks separate because a blend name is not clinical evidence.",
      bullets: [
        ...context,
        ...components.flatMap((compound) => safetyAnswer(compound).bullets.slice(0, 3).map((item) => `${compound.name}: ${item}`)),
      ],
      compounds,
      sources,
    };
  }

  if (HALF_LIFE_PATTERN.test(question)) {
    return {
      kind: "evidence",
      title: `${mapping.canonicalName}: component half-lives`,
      summary: "A blend does not have one reliable half-life when its components, formulations and routes differ. Each component must be checked separately.",
      bullets: [
        ...context,
        ...components.flatMap((compound) => halfLifeAnswer(compound).bullets.slice(0, 2).map((item) => `${compound.name}: ${item}`)),
      ],
      compounds,
      sources,
    };
  }

  if (CONFLICT_PATTERN.test(question)) {
    return {
      kind: "evidence",
      title: `${mapping.canonicalName}: naming and source differences`,
      summary: "PEARL keeps the informal combination name separate from scientific evidence and does not merge different formulations into one false definition.",
      bullets: context,
      compounds,
      sources,
    };
  }

  const researchBullets = components.map((compound) =>
    `${compound.name}: ${evidenceLabel(compound.evidenceScore)}. ${compound.evidenceNote}`,
  );
  return {
    kind: STUDY_PATTERN.test(question) ? "evidence" : "overview",
    title: mapping.canonicalName,
    summary: `The approved terminology source uses ${mapping.canonicalName} for ${components.map((compound) => compound.name).join(", ")}. PEARL searches the name and every component, while keeping component research separate from evidence about the combination.`,
    bullets: [
      ...context,
      "No source in the approved library establishes that the combination itself has the same evidence as its individual components.",
      ...researchBullets,
    ],
    compounds,
    sources,
  };
}

function calculatorAnswer() {
  return {
    kind: "calculator",
    title: "How the Windsor Glow dosage calculator works",
    keyPoint: "Open the dosage calculator at /calculator, then enter the amount printed on the product, the water volume and the source-listed dose you want to model.",
    summary: "The calculator converts those figures into concentration, liquid volume and the matching U-100 syringe scale. It does not choose a dose for you.",
    sections: [
      {
        title: "What to enter",
        items: [
          "Product amount: enter the total amount printed on the vial or product and select the matching unit.",
          "Water volume: enter the number of millilitres used in the calculation.",
          "Desired dose: enter a source-listed figure and select mg, mcg or product IU exactly as shown by the source.",
        ],
      },
      {
        title: "What the result means",
        items: [
          "Concentration is product amount divided by water volume.",
          "The result shows the liquid volume for the entered figure. On a U-100 scale, 100 marks = 1 mL and 1 mark = 0.01 mL.",
          "Product IU stays separate from mg and mcg. The calculator does not invent an IU-to-mg conversion.",
          "The V3 pen view expresses the same calculated volume as pen clicks when that device is selected.",
        ],
      },
    ],
    bullets: [
      "Use PEARL's source-listed dosage answer for the input figure; do not treat the calculator as a dosage recommendation.",
      "The calculator runs in the browser and the entered figures are not stored.",
    ],
    followUps: ["What is the source-listed dosage for a product?"],
    compounds: [],
    sources: [{
      label: "Windsor Glow dosage calculator",
      detail: "The calculator being explained",
      url: "/calculator",
    }],
  };
}

/* Exact shop products win over broader scientific-name matching for dosage
   questions. This is the bridge between the catalogue and the research
   library, so a customer asking about the item in front of them never gets a
   "which one?" response when the catalogue already supplied the answer. */
const PRODUCT_DOSE_TARGETS = new Map([
  ["hgh191aa", "hgh-191aa"],
  ["b7-33", "relaxin"],
  ["cjc-1295", "cjc-1295-no-dac"],
  ["hgh-fragment-176-191", "hgh-fragment"],
  ["follistatin-315", "follistatin315"],
  ["igf-1-des", "igf1des"],
  ["glutathione-1500mg", "l-glutathione"],
  ["n-acetyl-semax-amidate", "nasemaxamidate"],
  ["hhb", "healthyhairskinnailshhb"],
  ["melanotan-i", "melanotan-i"],
]);

function productCompound(slug, product) {
  const direct = PRODUCT_DOSE_TARGETS.get(slug) || slug;
  if (COMPOUND_BY_SLUG.has(direct)) return COMPOUND_BY_SLUG.get(direct);
  const identity = [product?.what, product?.plainName, PRODUCT_CATALOGUE_NAMES[slug]].filter(Boolean).join(" ");
  const resolved = resolvePearlTerminology(identity, COMPOUNDS, { adminPreview: true });
  const found = compoundsFromResolution(resolved);
  return found.length === 1 ? found[0] : null;
}

function productDoseGap(productResolution) {
  const { slug, name, product } = productResolution;
  const reason = product?.unknown
    ? "The supplied catalogue does not record the formula, so PEARL cannot identify which dosage record belongs to it."
    : product?.isPeptide === false
      ? "The supplied material records the ingredients or concentration, but it does not contain a product-use or research-dose protocol."
      : "PEARL recognises the product, but none of the supplied sources currently holds a numerical protocol for it.";
  return {
    kind: "dose",
    title: `${name}: no source-listed dose is held`,
    keyPoint: "",
    summary: `${reason} PEARL will not invent a figure.`,
    dose: [],
    sections: [],
    bullets: product?.note ? [product.note] : [],
    followUps: ["How do I use the dosage calculator?"],
    compounds: [name],
    sources: [{ label: name, detail: "Windsor Glow catalogue record", url: productSourceUrl(slug) }],
    diagnostic: knowledgeReceipt({ match: `product:${slug}`, entityIds: [slug], answer: { kind: "dose", dose: [] } }),
  };
}

function needsProductDoseRoute(productResolution, researchResolution) {
  if (productResolution?.status !== "resolved" || productResolution.method !== "catalogue-name") return false;
  return true;
}

function productDoseAnswer(productResolution, question, options) {
  const { slug, name, product } = productResolution;
  let mapping = PEARL_BLEND_MAPPINGS.find((candidate) => candidate.compositionSlug === slug);
  if (!mapping && product?.isPeptide !== false && product?.components?.length > 1) {
    const componentSlugs = product.components.map((component) => {
      const resolved = resolvePearlTerminology(component.name, COMPOUNDS, { adminPreview: true });
      const matches = compoundsFromResolution(resolved);
      return matches.length === 1 ? matches[0].slug : null;
    }).filter(Boolean);
    if (componentSlugs.length) {
      mapping = {
        id: `catalogue-${slug}`,
        canonicalName: name,
        components: componentSlugs,
        profileSlug: "",
        compositionSlug: slug,
        compositionFixed: !product.unknown,
        sourceDose: [],
        sources: [{
          label: name,
          url: productSourceUrl(slug),
          role: "Windsor Glow catalogue identity source",
        }],
        confidence: product.provenance === "worked-out" ? "medium" : "high",
        notes: product.note || "The catalogue records the component identities.",
        conflicts: product.provenance === "worked-out" ? ["The product formula still needs label confirmation."] : [],
      };
    }
  }
  if (mapping) {
    const answer = blendAnswer(mapping, question, options);
    answer.title = answer.title.replace(mapping.canonicalName, name);
    answer.compounds = [name, ...answer.compounds.filter((item) => item !== mapping.canonicalName)];
    answer.diagnostic = {
      ...(answer.diagnostic || {}),
      match: `product:${slug}`,
      productSlug: slug,
    };
    return answer;
  }

  const compound = productCompound(slug, product);
  if (!compound) return productDoseGap(productResolution);
  const answer = doseAnswer(compound, question, options);
  answer.title = answer.title.replace(compound.name, name);
  answer.compounds = [name];
  answer.diagnostic = knowledgeReceipt({
    match: `product:${slug}`,
    entityIds: [slug, compound.slug],
    protocols: protocolLines(compound, question, options.adminPreview === true),
    answer,
  });
  return answer;
}

function clarificationAnswer(resolution) {
  const suggestions = (resolution.suggestions || []).slice(0, 3);
  const labels = suggestions.map((item) => item.label);
  return {
    kind: "clarify",
    title: "Please confirm the research term",
    summary: labels.length === 1
      ? `I'm not completely certain which compound you mean. Did you mean ${labels[0]}?`
      : labels.length > 1
        ? `I'm not completely certain which entry you mean. Please choose from the likely matches below.`
        : "I could not identify that term confidently. Please check the spelling or add the full compound name.",
    bullets: labels.map((label) => `Possible match: ${label}`),
    suggestions,
    compounds: labels,
    sources: [],
  };
}

function productClarificationAnswer(productResolution) {
  const suggestions = (productResolution.suggestions || []).slice(0, 3);
  return {
    kind: "clarify",
    title: "Which Windsor Glow product do you mean?",
    summary: "More than one product matches that description. Choose the exact product so PEARL does not mix their ingredients.",
    bullets: suggestions.map((item) => `Possible product: ${item.label}`),
    suggestions,
    compounds: suggestions.map((item) => item.label),
    sources: [],
  };
}

const DEFAULT_RESEARCH_CATEGORIES = [
  { slug: "topic:muscle-growth", label: "muscle growth" },
  { slug: "topic:healing", label: "healing and recovery" },
  { slug: "topic:weight-loss", label: "weight loss" },
];

function noMatchAnswer(question) {
  const likelyCompounds = fuzzyCompounds(question, 3);
  const suggestions = likelyCompounds.length
    ? likelyCompounds.map((compound) => ({ slug: compound.slug, label: compound.name }))
    : DEFAULT_RESEARCH_CATEGORIES;
  return {
    kind: "clarify",
    needsLanguageReview: true,
    title: "I could not match that question yet",
    summary: likelyCompounds.length
      ? "These are the closest approved compound names. Choose one only if it matches what you meant."
      : "Try one of these research categories, or add the full compound, product or stack name.",
    bullets: suggestions.map((item) => `Try: ${item.label}`),
    suggestions,
    compounds: likelyCompounds.map((compound) => compound.name),
    sources: [{ label: "Expanded research library", detail: `${RESEARCH_AUDIT.uniqueCompounds} source-tracked compound profiles`, url: SOURCE_METADATA.sourceUrl }],
  };
}

export function searchCompounds(query, category = "All", options = {}) {
  const needle = normalize(query);
  const exact = COMPOUNDS.filter((compound) => {
    const inCategory = category === "All" || compound.category === category;
    if (!inCategory) return false;
    if (!needle) return true;
    return normalize(`${compound.name} ${compound.category} ${compound.tagline} ${compound.mechanism} ${(compound.researchAliases || []).join(" ")} ${(compound.researchTopics || []).join(" ")}`).includes(needle);
  });
  if (exact.length || !needle || category !== "All") return exact;
  const resolution = resolvePearlTerminology(query, COMPOUNDS, options);
  const matches = resolution.status === "resolved"
    ? compoundsFromResolution(resolution)
    : (resolution.suggestions || []).map((item) => COMPOUND_BY_SLUG.get(item.slug)).filter(Boolean);
  return matches.filter((compound) => category === "All" || compound.category === category);
}

function contextCompounds(contextNames) {
  const requested = new Set((contextNames || []).map(normalize));
  return COMPOUNDS.filter((compound) => requested.has(normalize(compound.name)) || requested.has(normalize(compound.slug))).slice(0, 3);
}

function contextResolution(contextNames) {
  const normalized = new Set((contextNames || []).map(normalize));
  const blend = PEARL_BLEND_MAPPINGS.find((mapping) =>
    normalized.has(normalize(mapping.canonicalName))
    || (mapping.profileSlug && normalized.has(normalize(COMPOUND_BY_SLUG.get(mapping.profileSlug)?.name || ""))),
  );
  if (blend) {
    return {
      rawQuestion: "",
      normalizedQuestion: "",
      status: "resolved",
      type: "blend",
      method: "context",
      confidence: "high",
      matchedText: "",
      blend,
      entities: blend.components.map((slug) => ({ slug, label: COMPOUND_BY_SLUG.get(slug)?.name || slug })),
      suggestions: [],
      expandedTerms: [blend.canonicalName],
      disclosure: "",
    };
  }
  const compounds = contextCompounds(contextNames);
  if (!compounds.length) return null;
  return {
    rawQuestion: "",
    normalizedQuestion: "",
    status: "resolved",
    type: "compound",
    method: "context",
    confidence: "high",
    matchedText: "",
    blend: null,
    entities: compounds.map((compound) => ({ slug: compound.slug, label: compound.name })),
    suggestions: [],
    expandedTerms: compounds.map((compound) => compound.name),
    disclosure: "",
  };
}

function withoutLiteralCompoundName(question, compound) {
  const lowerQuestion = question.toLowerCase();
  const lowerName = compound.name.toLowerCase();
  const index = lowerQuestion.indexOf(lowerName);
  if (index < 0) return question;
  return `${question.slice(0, index)} ${question.slice(index + compound.name.length)}`;
}

function withoutInterpretedTerm(question, resolution) {
  const term = String(resolution?.matchedText || "").trim();
  if (!term) return question;
  const lowerQuestion = question.toLowerCase();
  const index = lowerQuestion.indexOf(term.toLowerCase());
  if (index < 0) return question;
  return `${question.slice(0, index)} ${question.slice(index + term.length)}`;
}

export function answerQuestion(rawQuestion, contextNames = [], options = {}) {
  const originalQuestion = String(rawQuestion || "").trim();
  const asksWhoItWorksFor = /\bwho does (?:it|this|that|[a-z0-9+ -]{2,80}?) work for\b|\bwho (?:is|would) (?:it|this|that) for\b|\bwhat (?:kind|type) of (?:person|people) does (?:it|this|that) (?:work for|help)\b/i.test(originalQuestion);
  const question = options.adminPreview
    ? originalQuestion
      .replace(/\bwat\b/gi, "what")
      .replace(/\bfat ?los(?:s)?\b/gi, "fat loss")
    : originalQuestion;

  if (!question) {
    return withInterpretation(
      boundaryAnswer("Ask PEARL a research question", "Name a compound and ask about its evidence, mechanism, source-listed dose ranges or risks."),
      null,
      options,
    );
  }

  const understoodQuestion = normaliseQuestionLanguage(question);
  const topics = detectedTopics(understoodQuestion);
  let resolution = resolvePearlTerminology(question, COMPOUNDS, options);
  const researchFilter = researchFilterForQuestion(understoodQuestion);
  if (researchFilter && contextNames.length && resolution.entities?.every((entity) => entity.slug === "humanin") && !/\bhumanin\b/i.test(understoodQuestion)) {
    resolution = contextResolution(contextNames) || resolution;
  }
  if (resolution.status === "unknown" && !topics.length && contextNames.length && isContextFollowUp(understoodQuestion)) {
    resolution = contextResolution(contextNames) || resolution;
  }
  const possibleProductResolution = resolveProductComposition(question);
  const specificProductResolution = possibleProductResolution?.status === "resolved"
    && /^(?:peptide|blend|stack|pen|recovery)$/i.test(String(possibleProductResolution.matchedText || "").trim())
    ? null
    : possibleProductResolution;
  // An exact shop name must keep its catalogue identity for every intent, not
  // only dose questions. For example, HGH Fragment 176-191 is sold as its own
  // product even though some research sources also use that phrase around
  // AOD9604. A full product-name match is stronger than that broader alias.
  const exactProductTarget = specificProductResolution?.status === "resolved"
    ? PRODUCT_DOSE_TARGETS.get(specificProductResolution.slug)
    : null;
  const exactCatalogueProduct = specificProductResolution?.status === "resolved"
    && specificProductResolution.method === "catalogue-name"
    && normalize(specificProductResolution.matchedText) === normalize(specificProductResolution.name)
    && resolution.status === "resolved"
    && specificProductResolution.slug === "hgh-fragment-176-191"
    && exactProductTarget
    && !resolution.entities?.some((entity) => entity.slug === exactProductTarget);
  const productResolution = exactCatalogueProduct
    || COMPOSITION_PATTERN.test(understoodQuestion)
    || isDoseQuestion(understoodQuestion)
    || resolution.status === "unknown"
    ? specificProductResolution
    : null;
  const compounds = compoundsFromResolution(resolution);

  if (EMERGENCY_PATTERN.test(understoodQuestion) || PERSONAL_HARM_PATTERN.test(understoodQuestion)) {
    return withInterpretation({
      kind: "emergency",
      title: "Get urgent medical help now",
      summary: "PEARL cannot assess an emergency. In the UK, call 999 or go to A&E. If you are elsewhere, contact your local emergency service or poison centre.",
      bullets: ["Do not wait for a chatbot response.", "Take the product packaging or label with you if it is safe to do so."],
      compounds: compounds.map((compound) => compound.name),
      sources: [],
    }, resolution, options);
  }

  /* Kieran, 19 August 2026: "all dosages queries should be answered no matter
     what, and from any source we provide", and "how to inject is fine to
     dismiss". So the two halves of this gate now part company.

     A PROCEDURE question - how to inject, reconstitute, mix or administer -
     is still declined, unchanged.

     A DOSAGE question is answered however it is worded, including when it is
     worded around the person asking. What comes back is the source-listed
     figures and the context they came with; PEARL holds no model and no
     personal data, so it cannot and does not compute a figure for an
     individual. In the admin preview, a personal question is split into two
     parts: PEARL declines the personal recommendation, then still provides
     the relevant source-based research. The member-facing answer keeps its
     existing boundary until Kieran approves the preview. */
  // A compound can legitimately contain a word such as "Injectable" in its
  // catalogue name. Remove recognised names before deciding whether the
  // member actually asked for administration instructions.
  // Work out the intent from the words around a recognised catalogue/source
  // name. Product names can themselves contain words such as "Mix",
  // "Protocol", "mg" or "units"; those words must not turn an ordinary
  // half-life or evidence question into an administration/dose request.
  let intentProbe = compounds.reduce(
    (remaining, compound) => withoutLiteralCompoundName(remaining, compound),
    question,
  );
  if (resolution.status === "resolved") intentProbe = withoutInterpretedTerm(intentProbe, resolution);
  if (specificProductResolution?.status === "resolved") {
    intentProbe = withoutLiteralCompoundName(intentProbe, { name: specificProductResolution.name });
    if (specificProductResolution.matchedText) {
      intentProbe = withoutLiteralCompoundName(intentProbe, { name: specificProductResolution.matchedText });
    }
  }
  intentProbe = normaliseQuestionLanguage(intentProbe);
  let procedureQuestion = intentProbe;
  if (options.adminPreview && compounds.some((compound) => /\binjectable\b/i.test(compound.name))) {
    procedureQuestion = procedureQuestion.replace(/\binjectable\b/gi, " ");
  }
  const asksProcedure = !/\bhow long\b/i.test(procedureQuestion) && PROCEDURE_PATTERN.test(procedureQuestion);
  const asksDosage = isDoseQuestion(intentProbe) || /\bsource(?:[- ]listed| list(?:ed)?)?\b.{0,20}\b(?:dose|dosage)\b/i.test(intentProbe);
  const asksPersonally = (options.adminPreview ? PERSONAL_PREVIEW_PATTERN : PERSONAL_PATTERN).test(understoodQuestion);
  const previewsPersonalResearch = asksPersonally && options.adminPreview === true;
  const addPersonalNotice = (answer) => previewsPersonalResearch ? personalResearchAnswer(answer) : answer;
  const previousAnswer = options.previousAnswer || null;
  const previousGoal = (previousAnswer?.topicIds || []).map((id) => GOAL_GUIDANCE_BY_ID.get(id)).find(Boolean);
  const previousCompounds = (previousAnswer?.compounds || [])
    .map((name) => {
      const wanted = wordsForGoalMatch(name);
      const exact = COMPOUNDS.find((compound) => wordsForGoalMatch(compound.name) === wanted);
      if (exact) return exact;
      return COMPOUNDS.filter((compound) => {
        const candidate = wordsForGoalMatch(compound.name);
        return candidate.includes(wanted) || wanted.includes(candidate);
      }).sort((a, b) => wordsForGoalMatch(b.name).length - wordsForGoalMatch(a.name).length)[0];
    })
    .filter(Boolean);
  if (!previousCompounds.length && previousGoal) {
    previousCompounds.push(...previousGoal.shortlist.map((pick) => goalCompound(pick.slug)).filter(Boolean));
  }
  const ordinalMatch = understoodQuestion.match(/\b(first|1st|second|2nd|third|3rd)(?:\s+one)?\b/i);
  const ordinalIndex = ordinalMatch
    ? ({ first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2 })[ordinalMatch[1].toLowerCase()]
    : null;
  const contextualCompound = ordinalIndex !== null
    ? previousCompounds[ordinalIndex]
    : previousCompounds.length === 1
      ? previousCompounds[0]
      : null;
  if (asksProcedure) {
    return withInterpretation(boundaryAnswer(
      "I cannot advise how to administer it",
      "PEARL explains published references. It does not use your age, weight, health, medicines or goals to make a decision. Ask about the source-listed numbers for a named compound and it will show you those.",
      compounds,
    ), resolution, options);
  }

  // Explain the site's calculator before the administration boundary sees
  // words such as "reconstitution" or "syringe". This describes fields and
  // arithmetic only; it does not tell somebody how to administer anything.
  if (CALCULATOR_PATTERN.test(understoodQuestion)
    && specificProductResolution?.status !== "resolved"
    && !compounds.length) {
    return withInterpretation(calculatorAnswer(), resolution, options);
  }

  if (asksDosage && needsProductDoseRoute(productResolution, resolution)) {
    return decorateAnswer(addPersonalNotice(productDoseAnswer(productResolution, understoodQuestion, options)), options);
  }

  if (asksDosage && contextNames.length === 1 && isContextFollowUp(understoodQuestion)) {
    const contextProduct = resolveProductComposition(contextNames.join(" "));
    if (needsProductDoseRoute(contextProduct, resolution)) {
      return decorateAnswer(addPersonalNotice(productDoseAnswer(contextProduct, understoodQuestion, options)), options);
    }
  }

  if (previousCompounds.length && !/\b(?:actually|instead|forget|mean)\b/i.test(understoodQuestion)) {
    if (asksDosage && contextualCompound) {
      const answer = doseAnswer(contextualCompound, understoodQuestion, options);
      if (ordinalIndex !== null && previousAnswer?.compounds?.[ordinalIndex]) answer.compounds = [previousAnswer.compounds[ordinalIndex]];
      return withInterpretation(addPersonalNotice(answer), resolution, options);
    }
    if (/\bcompare\b/i.test(understoodQuestion) && /\b(first|second|two|both|these|them)\b/i.test(understoodQuestion)) {
      const answer = compareAnswer(previousCompounds.slice(0, 2));
      answer.compounds = [...(previousAnswer?.compounds || answer.compounds)].slice(0, 2);
      return withInterpretation(addPersonalNotice(answer), resolution, options);
    }
    if (contextualCompound && /\b(?:tell me|more|about|explain|why|evidence|research)\b/i.test(understoodQuestion)) {
      const answer = asksWhoItWorksFor ? audienceBenefitsAnswer(contextualCompound) : overviewAnswer(contextualCompound);
      answer.compounds = [...(previousAnswer?.compounds || answer.compounds)];
      answer.topicIds = [...(previousAnswer?.topicIds || [])];
      return withInterpretation(addPersonalNotice(answer), resolution, options);
    }
    if ((/^(?:and\s+)?why\??$|\bwhy (?:is|are|was|were|these|those|that)\b/i.test(understoodQuestion))) {
      if (previousGoal?.shortlist.length) {
        const answer = goalRecommendationAnswer(previousGoal);
        answer.title = `Why these match ${previousGoal.label}`;
        answer.summary = `PEARL selected them because the approved research records connect their mechanisms and study topics with ${previousGoal.label}. The strength and limitations differ, so this is a research comparison rather than a personal recommendation.`;
        return withInterpretation(answer, resolution, options);
      }
      return withInterpretation(overviewAnswer(previousCompounds[0]), resolution, options);
    }
  }

  if (asksPersonally && !asksDosage && !previewsPersonalResearch) {
    return withInterpretation(boundaryAnswer(
      "I cannot advise whether it is right for you",
      "PEARL explains published references. It does not use your age, weight, health, medicines or goals to make a decision. Ask about the source-listed numbers for a named compound and it will show you those.",
      compounds,
    ), resolution, options);
  }

  const asksForAllResearch = /\b(?:source|research) entries\b|\bwhich compounds? does (?:the )?source link\b|\b(?:show|list|give)\b.{0,24}\b(?:all|every|full)\b|\b(?:all|every)\b.{0,20}\b(?:source|research|entr)/i.test(understoodQuestion);
  const guidedGoal = options.adminPreview && !asksDosage && !asksProcedure && !asksForAllResearch
    ? guidedGoalForQuestion(understoodQuestion, topics, options.interpretedGoalIds || [])
    : null;
  const asksForGoalRecommendation = /\b(?:what|which)\b.{0,28}\b(?:take|use|choose|recommend)\b|\brecommend(?:ation|ed)?\b/i.test(understoodQuestion);
  if (guidedGoal?.shortlist.length && (
    !compounds.length
    || options.interpretedGoalIds?.length
    || /\b(?:actually|instead|forget|mean)\b/i.test(understoodQuestion)
    || (resolution.method === "unique-prefix" && asksForGoalRecommendation)
  )) {
    return withInterpretation(addPersonalNotice(goalRecommendationAnswer(guidedGoal)), resolution, options);
  }

  if (!asksDosage && (!topics.length || COMPOSITION_PATTERN.test(understoodQuestion)) && productResolution?.status === "resolved") {
    return decorateAnswer(addPersonalNotice(productCompositionAnswer(productResolution, understoodQuestion, options)), options);
  }

  if (!asksDosage && (!topics.length || COMPOSITION_PATTERN.test(understoodQuestion)) && productResolution?.status === "ambiguous") {
    return withInterpretation(productClarificationAnswer(productResolution), {
      ...productResolution,
      type: "product",
      blend: null,
      expandedTerms: [],
      disclosure: "",
    });
  }

  if (resolution.status === "resolved" && resolution.type === "blend" && resolution.blend) {
    const blendProfile = resolution.blend.profileSlug ? COMPOUND_BY_SLUG.get(resolution.blend.profileSlug) : null;
    const intentQuestion = normaliseQuestionLanguage(withoutInterpretedTerm(
      blendProfile ? withoutLiteralCompoundName(question, blendProfile) : question,
      resolution,
    ));
    return withInterpretation(addPersonalNotice(blendAnswer(resolution.blend, intentQuestion, options)), resolution, options);
  }

  if (/\b(stack|blend)\b/i.test(understoodQuestion)
    && ["fuzzy", "prefix", "unique-prefix"].includes(resolution.method)) {
    return withInterpretation({
      kind: "clarify",
      title: "I could not verify that blend name",
      summary: "Please check the name or list its components. PEARL does not invent combination definitions.",
      bullets: [], suggestions: [], compounds: [], sources: [],
    }, resolution, options);
  }

  if (STACK_PATTERN.test(understoodQuestion) && compounds.length) {
    if (!options.adminPreview) {
      return withInterpretation(boundaryAnswer(
        "I cannot recommend stacks or combinations",
        "Combining compounds is a personal treatment decision. I can explain each named compound separately and show the research listed for it.",
        compounds,
      ), resolution, options);
    }
    const research = compounds.length > 1
      ? compareAnswer(compounds.slice(0, 3))
      : overviewAnswer(compounds[0]);
    return withInterpretation(addPersonalNotice(research), resolution, options);
  }

  if (!compounds.length && /\b(stack|blend)\b/i.test(understoodQuestion)) {
    return withInterpretation({
      kind: "clarify",
      title: "I could not verify that blend name",
      summary: "Please check the name or list its components. PEARL does not invent combination definitions.",
      bullets: [],
      suggestions: [],
      compounds: [],
      sources: [],
    }, resolution, options);
  }

  // A phrase such as "what did the trial participants receive?" contains a
  // human-study filter, but its requested answer is still the dose. Dose intent
  // wins so the member gets the short numerical answer they asked for.
  if (researchFilter && compounds.length && !asksDosage) {
    return withInterpretation(
      addPersonalNotice(filteredEvidenceAnswer(compounds, researchFilter, options.previousAnswer?.topicIds || [])),
      resolution,
      options,
    );
  }

  // An explicitly recorded phone spelling is more useful than a broad topic
  // page. Keep ordinary fuzzy guesses behind topic answers so a broad question
  // such as "collagen" is not replaced by an unrelated compound suggestion.
  if (resolution.status === "ambiguous" && (
    !["fuzzy", "prefix"].includes(resolution.method)
    || (resolution.method === "prefix" && asksDosage)
  )) {
    return withInterpretation(clarificationAnswer(resolution), resolution, options);
  }

  // A clear category phrase beats a fuzzy compound-name guess. For example,
  // "libido and sexual health" must open the full topic result, not silently
  // reinterpret "libido" as the similarly named compound Libidon.
  if (!asksDosage && topics.length && ["fuzzy", "prefix", "unique-prefix"].includes(resolution.method)) {
    return withInterpretation(addPersonalNotice(topicAnswer(topics)), resolution, options);
  }

  if (!compounds.length && topics.length) return withInterpretation(addPersonalNotice(topicAnswer(topics)), resolution, options);

  if (resolution.status === "ambiguous") {
    return withInterpretation(clarificationAnswer(resolution), resolution, options);
  }

  if (!compounds.length) return withInterpretation(noMatchAnswer(question), resolution, options);

  if (compounds.length > 1) {
    if (COMPARE_PATTERN.test(understoodQuestion)) return withInterpretation(addPersonalNotice(compareAnswer(compounds.slice(0, 3))), resolution, options);
    return withInterpretation({
      kind: "clarify",
      title: "Choose the exact compound or formulation",
      summary: "More than one source entry matches that wording. Name the one you mean so evidence and half-life values are not mixed together.",
      bullets: compounds.map((compound) => `${compound.name}: ${compound.tagline}`),
      suggestions: compounds.slice(0, 3).map((compound) => ({ slug: compound.slug, label: compound.name })),
      compounds: compounds.map((compound) => compound.name),
      sources: compounds.flatMap(sourceLinks).filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index).slice(0, 16),
    }, resolution, options);
  }

  const compound = compounds[0];
  const intentQuestion = normaliseQuestionLanguage(withoutInterpretedTerm(withoutLiteralCompoundName(question, compound), resolution));
  if (CONFLICT_PATTERN.test(intentQuestion)) return withInterpretation(addPersonalNotice(conflictAnswer(compound)), resolution, options);
  if (HALF_LIFE_PATTERN.test(intentQuestion)) return withInterpretation(addPersonalNotice(halfLifeAnswer(compound)), resolution, options);
  if (isDoseQuestion(intentQuestion)) return withInterpretation(addPersonalNotice(doseAnswer(compound, intentQuestion, options)), resolution, options);
  if (STUDY_PATTERN.test(intentQuestion)) return withInterpretation(addPersonalNotice(evidenceAnswer(compound)), resolution, options);
  if (SAFETY_PATTERN.test(intentQuestion)) return withInterpretation(addPersonalNotice(safetyAnswer(compound)), resolution, options);
  if (MECHANISM_PATTERN.test(intentQuestion)) return withInterpretation(addPersonalNotice(asksWhoItWorksFor ? audienceBenefitsAnswer(compound) : overviewAnswer(compound)), resolution, options);
  return withInterpretation(addPersonalNotice(asksWhoItWorksFor ? audienceBenefitsAnswer(compound) : overviewAnswer(compound)), resolution, options);
}

export {
  COMPOUNDS,
  CURATED_TERMINOLOGY,
  PEARL_BLEND_MAPPINGS,
  PEARL_EXPANDED_NAME,
  PEARL_NAME,
  PRODUCT_COMPOSITIONS,
  RESEARCH_AUDIT,
  RESEARCH_CONFLICTS,
  RESEARCH_SOURCES,
  SOURCE_METADATA,
  terminologyManagementSummary,
};
