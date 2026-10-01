// Curated numerical research records for entries that otherwise have no numerical protocol.
// These are evidence descriptions, not personal dose recommendations.

const BIOREGULATOR_REPORT = "https://peptidi-slo.si/wp-content/uploads/2023/12/brosura-3.pdf";
const COMMUNITY_PROTOCOLS = "https://helix-medicine.com/protocols";

function protocol({
  label,
  dose,
  frequency,
  duration,
  route,
  population,
  species = "Human",
  evidenceType,
  sourceUrl,
}) {
  return { label, dose, frequency, duration, route, population, species, evidenceType, sourceUrl };
}

function priority(confidence, note, protocols) {
  return { confidence, note, protocols };
}

function naturalBioregulator(dose, frequency, duration = "30 days", sourceUrl = BIOREGULATOR_REPORT) {
  return priority(
    "Low",
    "This is a product-report or supplement-label figure. It is not an independently validated clinical dose and the product is not FDA or EMA approved.",
    [protocol({
      label: "Source-listed oral product protocol",
      dose,
      frequency,
      duration,
      route: "Oral",
      population: "Adults described in a manufacturer-linked product report",
      evidenceType: "Low-confidence product report or supplement label",
      sourceUrl,
    })],
  );
}

function communityBioregulator(dose, frequency, duration, sourceUrl = COMMUNITY_PROTOCOLS) {
  return priority(
    "Very low",
    "This number comes from a community or clinic protocol, not a controlled human dose-finding study. It is included only because no stronger numerical record was found.",
    [protocol({
      label: "Community-listed research protocol",
      dose,
      frequency,
      duration,
      route: "Route stated by source",
      population: "Community or clinic protocol; population not defined",
      species: "Not stated",
      evidenceType: "Unvalidated community protocol",
      sourceUrl,
    })],
  );
}

export const DOSAGE_PRIORITIES = {
  follistatin315: priority("Commercial/community source plus animal research", "The human-style figures are explicitly described by the supplied source as an unvalidated community research model. The separate weight-based figure is an animal record. Neither is an established human clinical dose.", [
    protocol({ label: "Supplied commercial source: community research range", dose: "100-300 mcg", frequency: "Daily", duration: "Short cycles; the source's example schedule spans 3 weeks", route: "Subcutaneous (source-described research model)", population: "Community research context; no validated human protein-dose trial", species: "Not stated", evidenceType: "Commercial/community protocol, explicitly unvalidated", sourceUrl: "https://www.peptidedosage.org/peptides/follistatin-315/dosage" }),
    protocol({ label: "WikiPep recombinant-protein animal record", dose: "100-500 mcg/kg", frequency: "Daily", duration: "Study-specific", route: "Subcutaneous or intraperitoneal", population: "Animal studies of recombinant FS315 protein", species: "Animal", evidenceType: "Commercial/community encyclopedia summary of animal research", sourceUrl: "https://wikipep.org/wiki/Follistatin_315" }),
  ]),
  igf1des: priority("Commercial/community source; no human trials", "The supplied source calls these educational community research figures and states that IGF-1 DES has no human clinical trials. They are included with that limitation, not presented as a validated clinical schedule.", [
    protocol({ label: "Supplied commercial source: reported research range", dose: "20-100 mcg per injection", frequency: "On research/training days; source schedule is phase-based", duration: "Example source schedule spans 6 weeks", route: "Source describes local subcutaneous research use", population: "Community research context; no human clinical trials", species: "Not stated", evidenceType: "Commercial/community protocol, not clinically validated", sourceUrl: "https://www.peptidedosage.org/peptides/igf-1-des/dosage" }),
    protocol({ label: "Supplied commercial source: example phases", dose: "20 mcg week 1; 40 mcg weeks 2-3; 60 mcg weeks 4-6; 100 mcg upper community ceiling", frequency: "Per source research schedule", duration: "6 weeks", route: "Source-described research use", population: "Community research context; no human clinical trials", species: "Not stated", evidenceType: "Commercial/community schedule, not clinically validated", sourceUrl: "https://www.peptidedosage.org/peptides/igf-1-des/dosage" }),
  ]),
  argireline: priority("Small published human cosmetic study", "The number comes from a four-week topical cosmetic study. It is not a systemic treatment dose.", [
    protocol({ label: "Published topical cosmetic study", dose: "1.0 mL of formulation containing 10% Argireline solution; the supplied solution contained 0.05% acetyl hexapeptide-3", frequency: "Twice daily", duration: "4 weeks", route: "Topical to face and forearm", population: "40 women aged 35 to 55", evidenceType: "Published small comparative cosmetic study", sourceUrl: "https://doi.org/10.1590/S1984-82502015000400016" }),
  ]),
  bivalirudin: priority("Official medicine label", "Bivalirudin is a monitored hospital anticoagulant. The figures are procedure schedules, not personal-use guidance.", [
    protocol({ label: "Official PCI schedule", dose: "0.75 mg/kg bolus followed by 1.75 mg/kg/hour", frequency: "One bolus, then continuous infusion", duration: "For the coronary procedure; selected STEMI cases may continue for up to 4 hours afterwards", route: "Intravenous", population: "Adults undergoing percutaneous coronary intervention under specialist care", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=91cf9d00-29e0-4357-a184-f70026c47edb" }),
    protocol({ label: "Official severe renal-impairment adjustments", dose: "1 mg/kg/hour when creatinine clearance is below 30 mL/min; 0.25 mg/kg/hour during haemodialysis", frequency: "Continuous infusion after the standard 0.75 mg/kg bolus", duration: "For the coronary procedure", route: "Intravenous", population: "Adults undergoing PCI with severe renal impairment or haemodialysis", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=91cf9d00-29e0-4357-a184-f70026c47edb" }),
  ]),
  cetrorelix: priority("Official medicine label", "Cetrorelix is used within monitored fertility treatment. Daily and single-dose regimens have different timing.", [
    protocol({ label: "Official multiple-dose fertility regimen", dose: "0.25 mg", frequency: "Once every 24 hours", duration: "Started on stimulation day 5 or 6 and continued through the day of hCG administration", route: "Subcutaneous", population: "Adults undergoing controlled ovarian stimulation under fertility-specialist care", evidenceType: "Official US medicine label and clinical studies", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=95b852d6-26a4-4aaf-a4c3-26340a24723d" }),
    protocol({ label: "Studied single-dose fertility regimen", dose: "3 mg", frequency: "Single dose; if hCG was not given within 4 days, 0.25 mg daily began 96 hours later", duration: "Timed to controlled ovarian stimulation and hCG administration", route: "Subcutaneous", population: "Adults in controlled ovarian-stimulation clinical studies", evidenceType: "Official US product information describing clinical studies", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=95b852d6-26a4-4aaf-a4c3-26340a24723d" }),
  ]),
  ganirelix: priority("Official medicine label", "Ganirelix is used within monitored fertility treatment and its timing depends on ovarian response.", [
    protocol({ label: "Official controlled ovarian-stimulation regimen", dose: "250 mcg", frequency: "Once daily", duration: "Used during the mid to late follicular phase and continued through the day of hCG administration", route: "Subcutaneous", population: "Adults undergoing controlled ovarian stimulation under fertility-specialist care", evidenceType: "Official US medicine label and controlled studies", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c23ca7b2-7350-4f07-8adf-046bffb47842" }),
  ]),
  goserelin: priority("Official medicine labels", "Goserelin is a specialist prescription implant. The 3.6 mg and 10.8 mg products have different intervals and labelled populations.", [
    protocol({ label: "Official 3.6 mg depot schedule", dose: "3.6 mg implant", frequency: "Every 28 days", duration: "Indication-specific prescription treatment", route: "Subcutaneous implant", population: "Patients with an approved indication under specialist care", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=294b168b-6e5f-4db9-bf70-d599271458b3" }),
    protocol({ label: "Official 10.8 mg prostate-cancer depot schedule", dose: "10.8 mg implant", frequency: "Every 12 weeks", duration: "Long-term specialist treatment as clinically indicated", route: "Subcutaneous implant", population: "Men with an approved prostate-cancer indication under specialist care", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=e4cb3c20-2738-400a-b522-3f36f71fe6c5&version=8" }),
  ]),
  histrelin: priority("Official medicine label", "Histrelin is a long-acting prescription implant inserted, monitored and removed by trained clinicians.", [
    protocol({ label: "Official central-precocious-puberty implant schedule", dose: "One 50 mg implant releasing about 65 mcg per day", frequency: "One implant every 12 months", duration: "12 months per implant, with total treatment duration determined by the specialist", route: "Subcutaneous implant", population: "Children with central precocious puberty under paediatric endocrine care", evidenceType: "Official US medicine label and clinical studies", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d8fb000e-3cc9-4803-b71d-2cc597661977" }),
  ]),
  kisspeptin10: priority("Published small human physiology studies", "Kisspeptin-10 is investigational. These figures describe controlled intravenous experiments and do not establish a treatment dose.", [
    protocol({ label: "Healthy-men bolus dose-response", dose: "0.01-3.0 mcg/kg", frequency: "Single bolus by study visit", duration: "Acute hormone sampling", route: "Intravenous", population: "Six healthy men in each principal dose comparison", evidenceType: "Published small human physiology study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/21632807/" }),
    protocol({ label: "Healthy-men continuous infusion experiments", dose: "1.5 or 4 mcg/kg/hour", frequency: "Continuous infusion", duration: "9 or 22.5 hours by experiment", route: "Intravenous", population: "Four healthy men per infusion experiment", evidenceType: "Published very small human physiology study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/21632807/" }),
  ]),
  kisspeptin54: priority("Published specialist phase 2 human studies", "Kisspeptin-54 remains a specialist investigational fertility intervention. The figures are IVF study arms, not a general fertility or hormone protocol.", [
    protocol({ label: "IVF oocyte-maturation dose-ranging study", dose: "1.6, 3.2, 6.4 or 12.8 nmol/kg", frequency: "Single study trigger", duration: "Oocyte retrieval 36 hours later", route: "Subcutaneous", population: "53 women undergoing IVF", evidenceType: "Published human phase 2 dose-ranging study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/25036713/" }),
    protocol({ label: "High-OHSS-risk IVF dose-ranging study", dose: "3.2, 6.4, 9.6 or 12.8 nmol/kg", frequency: "Single study trigger", duration: "Oocyte retrieval 36 hours later", route: "Subcutaneous", population: "60 women undergoing IVF at high risk of ovarian hyperstimulation syndrome", evidenceType: "Published human phase 2 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/26192876/" }),
  ]),
  nafarelin: priority("Official medicine label", "Nafarelin is a prescription nasal product. These figures must not be converted into an injection protocol.", [
    protocol({ label: "Official central-precocious-puberty starting schedule", dose: "1,600 mcg per day: 400 mcg into each nostril in the morning and evening", frequency: "Twice daily", duration: "Continued under paediatric endocrine monitoring", route: "Intranasal", population: "Children with central precocious puberty under specialist care", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d0aa57cb-d2f4-46d7-af43-7c8b06aa81a6" }),
    protocol({ label: "Official inadequate-suppression escalation", dose: "1,800 mcg per day: 600 mcg alternating nostrils", frequency: "Three times daily", duration: "Only when the labelled starting schedule does not provide adequate suppression", route: "Intranasal", population: "Children with central precocious puberty under specialist care", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d0aa57cb-d2f4-46d7-af43-7c8b06aa81a6" }),
  ]),
  dasiglucagon: priority("Official medicine label and randomized studies", "Dasiglucagon is emergency rescue treatment for severe hypoglycaemia, not a routine glucose-management schedule.", [
    protocol({ label: "Official severe-hypoglycaemia rescue dose", dose: "0.6 mg; one additional 0.6 mg dose from a new device may be given after 15 minutes if there is no response", frequency: "Single emergency dose, with one repeat permitted after 15 minutes while emergency assistance is awaited", duration: "Acute emergency rescue", route: "Subcutaneous", population: "Adults and children aged 6 years or older with severe hypoglycaemia", evidenceType: "Official US medicine label and randomized clinical studies", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=14704879-872c-4967-8779-04a3bbdfb4e6" }),
  ]),
  enfuvirtide: priority("Official medicine label and randomized studies", "Enfuvirtide is used only as part of a specialist-selected antiretroviral combination.", [
    protocol({ label: "Official adult HIV-1 schedule", dose: "90 mg", frequency: "Twice daily", duration: "Ongoing combination antiretroviral treatment", route: "Subcutaneous", population: "Treatment-experienced adults with HIV-1 and ongoing viral replication", evidenceType: "Official US medicine label and randomized studies", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6935e846-d5a1-49e5-89a2-f8ebe4d5590d" }),
    protocol({ label: "Official paediatric weight-based schedule", dose: "2 mg/kg per dose, up to a maximum 90 mg per dose", frequency: "Twice daily", duration: "Ongoing combination antiretroviral treatment", route: "Subcutaneous", population: "Children weighing at least 11 kg with treatment-experienced HIV-1", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6935e846-d5a1-49e5-89a2-f8ebe4d5590d" }),
  ]),
  eptifibatide: priority("Official medicine label and randomized studies", "Eptifibatide is a monitored hospital antiplatelet medicine. Acute coronary syndrome and PCI use different schedules.", [
    protocol({ label: "Official acute-coronary-syndrome schedule", dose: "180 mcg/kg bolus followed by 2 mcg/kg/minute; infusion reduced to 1 mcg/kg/minute when creatinine clearance is below 50 mL/min", frequency: "One bolus, then continuous infusion", duration: "Until discharge or coronary bypass, up to 72 hours; PCI continuation can bring total therapy to 96 hours", route: "Intravenous", population: "Adults with acute coronary syndrome under hospital specialist care", evidenceType: "Official US medicine label and randomized studies", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ef0ad483-9086-4267-9b57-fcedd868719c" }),
    protocol({ label: "Official PCI schedule", dose: "180 mcg/kg bolus, 2 mcg/kg/minute infusion, then a second 180 mcg/kg bolus 10 minutes later; renal infusion 1 mcg/kg/minute when creatinine clearance is below 50 mL/min", frequency: "Two boluses 10 minutes apart plus continuous infusion", duration: "At least 12 hours and up to 18 to 24 hours after PCI", route: "Intravenous", population: "Adults undergoing percutaneous coronary intervention under specialist care", evidenceType: "Official US medicine label and randomized studies", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ef0ad483-9086-4267-9b57-fcedd868719c" }),
  ]),
  etelcalcetide: priority("Official medicine label and randomized studies", "Etelcalcetide is for adults receiving haemodialysis. Calcium and parathyroid hormone results guide specialist adjustment.", [
    protocol({ label: "Official haemodialysis schedule", dose: "5 mg starting dose; 2.5 to 15 mg maintenance range", frequency: "Three times weekly at the end of haemodialysis", duration: "Ongoing specialist treatment; titration no more often than every 4 weeks", route: "Intravenous bolus through the dialysis circuit", population: "Adults with chronic kidney disease and secondary hyperparathyroidism receiving haemodialysis", evidenceType: "Official US medicine label and randomized studies", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cd270093-c6a8-4596-a4ab-e6aa0a2c8a0c" }),
  ]),
  dulaglutide: priority("Official medicine label", "Dulaglutide is a prescription medicine. The labelled schedule requires clinical prescribing and monitoring.", [
    protocol({ label: "Official adult label schedule", dose: "0.75 mg initially; 1.5 mg after at least 4 weeks if needed; further 1.5 mg steps to a maximum 4.5 mg", frequency: "Once weekly", duration: "Ongoing prescription treatment; each escalation only after at least 4 weeks", route: "Subcutaneous", population: "Adults with type 2 diabetes under licensed clinical care", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=af4e38a6-ad3f-480c-ae82-5ac6c7735b99&type=display" }),
  ]),
  lanreotide: priority("Official medicine label and phase 3 trial", "Lanreotide is a prescription medicine. Indication and response determine the specialist schedule.", [
    protocol({ label: "Official acromegaly starting schedule", dose: "90 mg, adjusted to 60 mg, 90 mg or 120 mg according to response", frequency: "Every 4 weeks", duration: "First 3 months before response-based adjustment", route: "Deep subcutaneous", population: "Adults with acromegaly under specialist care", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6e4a41fd-a753-4362-87ee-8cc56ed3660d" }),
    protocol({ label: "CLARINET phase 3 trial", dose: "120 mg", frequency: "Every 28 days", duration: "Up to 96 weeks", route: "Deep subcutaneous", population: "204 adults with advanced nonfunctioning enteropancreatic neuroendocrine tumours", evidenceType: "Published randomized human phase 3 trial", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/25014687/" }),
  ]),
  lixisenatide: priority("Official medicine label", "Lixisenatide is a prescription GLP-1 medicine. This is its labelled initiation schedule, not a personal recommendation.", [
    protocol({ label: "Official labelled initiation schedule", dose: "10 mcg for 14 days, then 20 mcg from day 15", frequency: "Once daily within one hour before the first meal", duration: "14-day initiation followed by the maintenance dose", route: "Subcutaneous", population: "Adults with type 2 diabetes under licensed clinical care", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/downloadpdffile.cfm?setId=1727cc16-4f86-4f13-b8b5-804d4984fa8c" }),
  ]),
  matrixyl: priority("Published human cosmetic study", "The number comes from a topical split-face wrinkle study. It is not a systemic treatment dose.", [
    protocol({ label: "Published split-face cosmetic trial", dose: "Moisturizer containing 3 ppm pal-KTTKS", frequency: "Daily topical study regimen", duration: "12 weeks", route: "Topical split-face application", population: "93 women with facial wrinkles", evidenceType: "Published randomized double-blind split-face trial", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/18492182/" }),
  ]),
  nesfatin1: priority("Preclinical", "No validated human therapeutic dose exists. This is an intracerebroventricular mouse experiment and must not be converted to human use.", [
    protocol({ label: "Mouse dose-response experiment", dose: "0.1, 0.3 or 0.9 nmol per mouse", frequency: "Single experimental administration", duration: "Food intake observed for 24 hours", route: "Intracerebroventricular", population: "Laboratory mice", species: "Mouse", evidenceType: "Published preclinical dose-response study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/22682899/" }),
  ]),
  pacap38: priority("Small human provocation study", "This dose deliberately provoked migraine-like attacks. It is an experimental infusion, not treatment guidance.", [
    protocol({ label: "Human migraine-provocation study", dose: "10 pmol/kg/min", frequency: "Continuous infusion for 20 minutes in one experimental session", duration: "20-minute infusion with post-infusion observation", route: "Intravenous", population: "24 women with migraine without aura; 22 completed", evidenceType: "Published randomized double-blind crossover provocation study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/24501094/" }),
  ]),
  ptddbm: priority("Preclinical", "No validated human dose exists. PeptideDeck's generic concentration and cycle suggestions were rejected.", [
    protocol({ label: "Topical mouse hair-growth experiment", dose: "300 microlitres of 10 mM PTD-DBM solution", frequency: "Every other day", duration: "Days 8 to 12 or day 20 after depilation, depending on the experiment", route: "Topical", population: "Depilated laboratory mice in a PGD2-suppressed hair-growth model", species: "Mouse", evidenceType: "Published preclinical full-text study", sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9954685/" }),
  ]),
  thymopentin: priority("Historical human study", "This is a pre-modern antiretroviral-era research schedule and is not current HIV treatment guidance.", [
    protocol({ label: "Historical zidovudine-era randomized study", dose: "50 mg", frequency: "Three times per week", duration: "48 weeks", route: "Subcutaneous", population: "352 asymptomatic HIV-positive participants receiving zidovudine", evidenceType: "Published historical randomized multicentre study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/7859140/" }),
  ]),
  vosoritide: priority("Official medicine label and phase 3 trial", "Vosoritide is a specialist prescription medicine. The official dose is selected from a weight table for eligible children with achondroplasia.", [
    protocol({ label: "Current official weight-based schedule", dose: "0.096 mg at 3 kg through 1.4 mg at 90 kg or more, selected from the official actual-body-weight table", frequency: "Once daily", duration: "Until epiphyseal closure under specialist monitoring", route: "Subcutaneous", population: "Children with achondroplasia and open epiphyses under licensed specialist care", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=228e8560-04a4-4bb1-a81f-29531a9e4d27" }),
    protocol({ label: "Published phase 3 trial", dose: "15 mcg/kg", frequency: "Once daily", duration: "52 weeks", route: "Subcutaneous", population: "121 children aged 5 to under 18 years with achondroplasia", evidenceType: "Published randomized human phase 3 trial", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/32891212/" }),
  ]),
  klotho: priority("Preclinical", "No validated human dose exists. The strongest numerical record is from aged rhesus macaques.", [
    protocol({ label: "Aged-primate dose-ranging study", dose: "0.4, 2, 10, 20 or 30 μg/kg", frequency: "Single administration", duration: "Follow-up to 14-23 days", route: "Subcutaneous", population: "Aged rhesus macaques; the reported cognitive signal used 10 μg/kg", species: "Rhesus macaque", evidenceType: "Published non-human primate study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/37400721/" }),
  ]),
  "225acdotalm3": priority("Very limited human", "This is a radioactive activity, not a conventional peptide mass dose. It was reported in an individual human treatment case.", [
    protocol({ label: "Published human case activity", dose: "8 MBq per treatment cycle", frequency: "Two treatment cycles", duration: "Two cycles; interval must be checked in the paper", route: "Intravenous radiopharmaceutical injection", population: "One patient with a neuroendocrine tumour", evidenceType: "Published human case report", sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12845222/" }),
  ]),
  alixorexton: priority("Registered human trial", "Investigational oral orexin-2 agonist. These are trial arms, not approved doses.", [
    protocol({ label: "Phase 2 trial arms", dose: "4 mg, 6 mg or 8 mg", frequency: "Once daily", duration: "Study treatment period", route: "Oral", population: "Adults with narcolepsy type 1", evidenceType: "Completed registered phase 2 trial", sourceUrl: "https://clinicaltrials.gov/study/NCT06358950" }),
  ]),
  alphadefensins: priority("Preclinical", "No established therapeutic human dose was found. Numerical records are from cell and mouse experiments.", [
    protocol({ label: "HNP-1 mouse infection study", dose: "1 or 5 μg per mouse", frequency: "Once weekly", duration: "1, 2 or 4 weeks", route: "Subcutaneous", population: "Mice with experimental tuberculosis", species: "Mouse", evidenceType: "Published animal study", sourceUrl: "https://journals.asm.org/doi/10.1128/aac.45.2.639-640.2001" }),
    protocol({ label: "HNP-1 antiviral cell study", dose: "15 μg/mL IC50; 50 μg/mL reduced infection by more than 95%", frequency: "In-vitro exposure", duration: "Study assay", route: "Cell culture", population: "Adenovirus-infected 293 cells", species: "Human cell line", evidenceType: "Published in-vitro dose-response study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/11495691/" }),
  ]),
  amycretin: priority("Published human", "Amycretin remains investigational. Oral and subcutaneous programmes use different numerical ranges.", [
    protocol({ label: "First-in-human oral study", dose: "1, 3, 6, 12, 18 or 25 mg single doses; 3, 6 or 12 mg multiple doses; escalation to 50 or 100 mg", frequency: "Once daily", duration: "Single and multiple ascending-dose study", route: "Oral", population: "Adults in a phase 1 trial", evidenceType: "Published randomized human phase 1 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/40550229/" }),
    protocol({ label: "Subcutaneous phase 1b/2a study", dose: "1.25, 5, 20 or 60 mg", frequency: "Once weekly after escalation", duration: "Up to 36 weeks", route: "Subcutaneous", population: "Adults with overweight or obesity", evidenceType: "Published randomized human phase 1b/2a study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/40550231/" }),
  ]),
  bronchogen: communityBioregulator("20 mg", "Once or twice daily, as listed", "10-30 days", "https://www.peptabase.com/peptides/bronchogen"),
  bt5528: priority("Published human", "Investigational oncology trial dosing. The recommended phase 2 dose is a trial selection, not a general-use dose.", [
    protocol({ label: "Phase 1/2 dose escalation", dose: "2.2 mg/m² weekly through 10.0 mg/m² every 2 weeks", frequency: "Weekly or every 2 weeks by cohort", duration: "Repeated trial cycles", route: "Intravenous", population: "Adults with advanced solid tumours", evidenceType: "Published human phase 1/2 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/39231383/" }),
    protocol({ label: "Selected phase 2 trial dose", dose: "6.5 mg/m²", frequency: "Every 2 weeks", duration: "Repeated trial cycles", route: "Intravenous", population: "Adults with advanced solid tumours", evidenceType: "Published recommended phase 2 dose", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/39231383/" }),
  ]),
  cardiogen: communityBioregulator("2-4 mg/day", "Daily", "10-20 days", "https://peptidesexplorer.com/blog/cardiogen-peptide-benefits"),
  cartalax: priority("Preclinical and source-listed", "No validated human dose exists. Published work is preclinical and community protocols disagree widely.", [
    protocol({ label: "Published preclinical concentration range", dose: "10^-7 to 10^-12 M", frequency: "Continuous culture exposure", duration: "3 days", route: "Organotypic cell culture", population: "Cartilage tissue culture", species: "Cell and tissue model", evidenceType: "Published in-vitro research range", sourceUrl: "https://peptideinsight.com/en/peptides/cartalax" }),
    protocol({ label: "Source-listed oral protocol", dose: "200-400 μg", frequency: "Daily", duration: "10-30 days", route: "Oral", population: "Community supplement protocol", species: "Human-use listing, not a validated trial", evidenceType: "Low-confidence source-listed range", sourceUrl: "https://peptideinsight.com/en/peptides/cartalax" }),
  ]),
  cerluten: naturalBioregulator("10-40 mg/day", "1-2 capsules of 10 mg, once or twice daily"),
  chelohart: naturalBioregulator("10-40 mg/day", "1-2 capsules of 10 mg, once or twice daily", "30 days", "https://peptidi-slo.si/wp-content/uploads/2023/12/brosura-3.pdf"),
  chonluten: communityBioregulator("10-20 mg", "Once daily", "10-20 days", "https://peptide-db.com/peptides/chonluten"),
  cortexin: priority("Published human and animal", "Cortexin has published numerical studies, but availability and regulatory status vary by country.", [
    protocol({ label: "Human comparative study groups", dose: "10 mg or 20 mg", frequency: "Once daily", duration: "10 days", route: "Intramuscular", population: "Human neurological study groups", evidenceType: "Published human study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/30335070/" }),
    protocol({ label: "Rat ischaemia models", dose: "1 or 3 mg/kg/day", frequency: "Daily", duration: "10 days", route: "Parenteral; check full paper", population: "Experimental brain ischaemia models", species: "Rat", evidenceType: "Published animal study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/34260655/" }),
  ]),
  dihexa: priority("Preclinical with major retraction warning", "No validated human dose exists. A separate rat cognition study supplies the numerical record below, but the foundational 2012 HGF/Met development paper and 2014 HGF/c-Met mechanism paper were retracted in 2025.", [
    protocol({ label: "Aged-rat cognition study", dose: "2 mg/kg", frequency: "Once daily", duration: "8 days", route: "Oral gavage", population: "Six 24-month-old Sprague-Dawley rats", species: "Rat", evidenceType: "Published animal study; related foundational mechanism papers were later retracted", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/23055539/" }),
  ]),
  dsip: priority("Very small historical human study", "No validated modern treatment dose exists. This numerical record is a single acute experiment in six people and must not be treated as a general sleep protocol.", [
    protocol({ label: "Historical human insomnia experiment", dose: "25 nmol/kg body weight", frequency: "Single acute administration", duration: "One-night sleep observation", route: "Intravenous", population: "Six middle-aged adults with chronic insomnia", evidenceType: "Published very small historical human study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/7028502/" }),
  ]),
  ct388: priority("Published human", "CT-388 remains investigational.", [
    protocol({ label: "Phase 1 single-dose cohorts", dose: "0.5-7.5 mg", frequency: "Single dose", duration: "Single ascending-dose phase", route: "Subcutaneous", population: "Adults with overweight or obesity", evidenceType: "Published human phase 1 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/41319798/" }),
    protocol({ label: "Phase 1 multiple-dose cohorts", dose: "5-12 mg", frequency: "Once weekly", duration: "4 doses", route: "Subcutaneous", population: "Adults with overweight or obesity", evidenceType: "Published human phase 1 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/41319798/" }),
  ]),
  ecnoglutide: priority("Published human", "Ecnoglutide is investigational outside its trial and regulatory settings.", [
    protocol({ label: "Phase 3 obesity trial arms", dose: "1.2 mg, 1.8 mg or 2.4 mg", frequency: "Once weekly", duration: "40 weeks", route: "Subcutaneous", population: "Adults with overweight or obesity", evidenceType: "Published randomized human phase 3 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/40555243/" }),
  ]),
  efinopegdutide: priority("Published human", "Efinopegdutide remains investigational. These are study arms, not an approved general-use schedule.", [
    protocol({ label: "Phase 2 obesity dose-ranging arms", dose: "5.0 mg, 7.4 mg or 10.0 mg", frequency: "Once weekly", duration: "26 weeks", route: "Subcutaneous", population: "474 adults with class II or III obesity without type 2 diabetes", evidenceType: "Published randomized human phase 2 study and registered trial", sourceUrl: "https://clinicaltrials.gov/study/NCT03486392" }),
    protocol({ label: "NAFLD phase 2a target dose", dose: "10 mg after titration", frequency: "Once weekly", duration: "24 weeks, with titration over 8 weeks", route: "Subcutaneous", population: "145 adults with at least 10% liver fat", evidenceType: "Published randomized active-comparator human phase 2a study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/37355043/" }),
  ]),
  endoluten: naturalBioregulator("10-40 mg/day", "1-2 capsules of 10 mg, once or twice daily"),
  evx01: priority("Published human", "EVX-01 is a personalised cancer vaccine used with specialist oncology treatment.", [
    protocol({ label: "Human dose-escalation cohorts", dose: "500 μg, 1,000 μg or 2,000 μg total peptide", frequency: "Every 2 weeks", duration: "6 vaccinations", route: "First 3 intraperitoneal, then 3 intramuscular", population: "Adults with metastatic melanoma receiving anti-PD-1 therapy", evidenceType: "Published human dose-escalation study", sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11116868/" }),
  ]),
  ghk: priority("Preclinical", "A numerical GHK-Cu wound-study dose exists, but it does not establish a safe human injectable dose.", [
    protocol({ label: "GHK-Cu wound research", dose: "2 mg per injection", frequency: "Repeated injections", duration: "Study course; check full paper", route: "Injection", population: "Wound-healing research model", species: "Animal model; species should be checked in the full paper", evidenceType: "Published preclinical study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/11121126/" }),
  ]),
  gip: priority("Published human", "Native GIP is an endogenous hormone and not an approved standalone treatment. Figures are controlled infusion experiments.", [
    protocol({ label: "Human GIP infusion study", dose: "1 or 4 pmol/kg/min", frequency: "Continuous infusion", duration: "60 minutes per dose", route: "Intravenous", population: "Adults with type 2 diabetes and healthy controls", evidenceType: "Published human physiology study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/16609993/" }),
    protocol({ label: "Human metabolic infusion study", dose: "2 pmol/kg/min", frequency: "Continuous infusion", duration: "4 hours", route: "Intravenous", population: "Healthy adults and adults with type 2 diabetes", evidenceType: "Published human physiology study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/19178509/" }),
  ]),
  glp1native: priority("Published human", "Native GLP-1 has a very short half-life. These are controlled physiology experiments, not an approved treatment protocol.", [
    protocol({ label: "Human graded infusion", dose: "0.375, 0.75 or 1.5 pmol/kg/min", frequency: "Continuous infusion", duration: "Meal study period", route: "Intravenous", population: "Healthy volunteers", evidenceType: "Published human dose-response study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/9862830/" }),
    protocol({ label: "Human subcutaneous dose-response", dose: "0.15, 0.5, 1.5 or 4.5 nmol/kg", frequency: "Single dose", duration: "Acute study", route: "Subcutaneous", population: "Healthy volunteers", evidenceType: "Published human pharmacology study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/7672496/" }),
  ]),
  glp2native: priority("Published human", "Native GLP-2 is an endogenous hormone, not an approved standalone treatment.", [
    protocol({ label: "Human physiology infusion", dose: "0.75 or 2.25 pmol/kg/min", frequency: "Continuous infusion", duration: "180 minutes", route: "Intravenous", population: "Healthy volunteers", evidenceType: "Published human infusion study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/14599711/" }),
  ]),
  glepaglutide: priority("Published human", "Glepaglutide remains investigational. In the phase 3 trial, the twice-weekly arm met the primary endpoint while the once-weekly arm did not significantly outperform placebo.", [
    protocol({ label: "Phase 3 trial arms", dose: "10 mg", frequency: "Once weekly or twice weekly", duration: "24 weeks", route: "Subcutaneous", population: "106 adults with short bowel syndrome and intestinal failure requiring parenteral support", evidenceType: "Published randomized double-blind human phase 3 trial", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/39708985/" }),
    protocol({ label: "Phase 2 dose-ranging trial", dose: "0.1 mg, 1 mg or 10 mg", frequency: "Once daily during each treatment period", duration: "3 weeks per period, separated by a 4-8 week washout", route: "Subcutaneous", population: "18 treated adults with short bowel syndrome; 16 completed", evidenceType: "Published randomized double-blind crossover human phase 2 trial", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/30880176/" }),
  ]),
  hmg: priority("Official medicine label", "Menotropins is a prescription fertility medicine. The label requires specialist monitoring and individual adjustment.", [
    protocol({ label: "MENOPUR label starting dose", dose: "225 IU/day", frequency: "Daily from cycle day 2 or 3", duration: "Adjust after 5 days based on ovarian response", route: "Subcutaneous", population: "Women undergoing assisted reproductive technology", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=22c8db95-c3db-1770-8086-31356fbabe35" }),
    protocol({ label: "MENOPUR label ceiling", dose: "Maximum 450 IU/day", frequency: "Daily", duration: "Specialist-monitored treatment cycle", route: "Subcutaneous", population: "Women undergoing assisted reproductive technology", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=22c8db95-c3db-1770-8086-31356fbabe35" }),
  ]),
  insulindegludec: priority("Official medicine label", "Insulin can cause life-threatening hypoglycaemia. These figures describe labelled starting doses, not a dose for any individual.", [
    protocol({ label: "Labelled type 2 diabetes starting dose", dose: "10 units", frequency: "Once daily", duration: "Individualised ongoing treatment", route: "Subcutaneous", population: "Insulin-naive adults with type 2 diabetes", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=62128c8b-f613-44d9-af04-18d52c4348cd" }),
    protocol({ label: "Labelled type 1 total daily insulin estimate", dose: "0.2-0.4 units/kg/day total insulin; degludec about one-third to one-half", frequency: "Once-daily basal component plus meal insulin", duration: "Individualised ongoing treatment", route: "Subcutaneous", population: "Insulin-naive adults with type 1 diabetes", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=62128c8b-f613-44d9-af04-18d52c4348cd" }),
  ]),
  insulindetemir: priority("Official medicine label", "Insulin can cause life-threatening hypoglycaemia. These are labelled starting figures only.", [
    protocol({ label: "Labelled type 2 diabetes starting dose", dose: "10 units or 0.1-0.2 units/kg", frequency: "Once daily in the evening or divided twice daily", duration: "Individualised ongoing treatment", route: "Subcutaneous", population: "Insulin-naive adults with type 2 diabetes", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=eae6fcac-02a9-4d7c-8445-03a647b6b59b" }),
  ]),
  insulinglargine: priority("Official medicine label", "Insulin can cause life-threatening hypoglycaemia. These are labelled starting figures only.", [
    protocol({ label: "Labelled type 2 diabetes starting dose", dose: "10 units or 0.2 units/kg", frequency: "Once daily", duration: "Individualised ongoing treatment", route: "Subcutaneous", population: "Insulin-naive adults with type 2 diabetes", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b861fdd9-e134-436e-8c0c-a60dd0006dd3" }),
  ]),
  insulinnph: priority("Published human", "NPH insulin must be individually prescribed. These numbers are single-dose research clamp exposures, not a personal regimen.", [
    protocol({ label: "Human euglycaemic clamp studies", dose: "0.3 or 0.4 units/kg", frequency: "Single study dose", duration: "24-hour clamp observation", route: "Subcutaneous", population: "Human pharmacology study participants", evidenceType: "Published human pharmacology studies", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/11118018/" }),
  ]),
  kristagen: communityBioregulator("2 mg/day", "Daily", "10 days"),
  lactoferricin: priority("Preclinical", "No established human therapeutic dose was found.", [
    protocol({ label: "Mouse toxoplasmosis study", dose: "5 mg orally or 0.1 mg intraperitoneally", frequency: "Study administration", duration: "Follow-up to 35 days", route: "Oral or intraperitoneal", population: "Mice challenged with Toxoplasma gondii", species: "Mouse", evidenceType: "Published animal study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/9524950/" }),
  ]),
  livagen: communityBioregulator("2 mg/day", "Daily", "10 days"),
  maritide: priority("Published human", "Maridebart cafraglutide remains investigational.", [
    protocol({ label: "Phase 2 obesity trial", dose: "140, 280 or 420 mg", frequency: "Every 4 weeks", duration: "52 weeks", route: "Subcutaneous", population: "Adults with obesity", evidenceType: "Published randomized human phase 2 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/40549887/" }),
    protocol({ label: "Extended-interval trial arm", dose: "420 mg", frequency: "Every 8 weeks", duration: "52 weeks", route: "Subcutaneous", population: "Adults with obesity", evidenceType: "Published randomized human phase 2 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/40549887/" }),
  ]),
  melanotanii: priority("Published very small human studies", "Melanotan II is not an approved medicine. These figures come from early small human experiments and do not validate commercial tanning or sexual-use protocols.", [
    protocol({ label: "Organic erectile-dysfunction crossover study", dose: "0.025 mg/kg", frequency: "One study dose on each of two active visits", duration: "6-hour observation per visit", route: "Subcutaneous", population: "10 men with erectile dysfunction and organic risk factors", evidenceType: "Published small double-blind crossover human study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/11018622/" }),
    protocol({ label: "Pilot phase 1 dose escalation", dose: "0.01-0.03 mg/kg", frequency: "Alternating active and saline study days, Monday to Friday", duration: "2 weeks", route: "Subcutaneous", population: "Three healthy men", evidenceType: "Published very small phase 1 human study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/8637402/" }),
  ]),
  igf1: priority("Official medicine label", "Mecasermin is a prescription medicine with a serious hypoglycaemia risk.", [
    protocol({ label: "Labelled starting range", dose: "0.04-0.08 mg/kg per dose", frequency: "Twice daily", duration: "Individualised treatment", route: "Subcutaneous", population: "Children with severe primary IGF-1 deficiency meeting label criteria", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d5b2b0e1-c523-468d-9a0b-4ae4e4a8dbce" }),
    protocol({ label: "Labelled maximum", dose: "0.12 mg/kg per dose", frequency: "Twice daily", duration: "Individualised treatment", route: "Subcutaneous", population: "Children meeting label criteria", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d5b2b0e1-c523-468d-9a0b-4ae4e4a8dbce" }),
  ]),
  mk0616: priority("Registered human trial", "Enlicitide/MK-0616 remains a prescription investigational programme in the cited trial context.", [
    protocol({ label: "Phase 2b trial arms", dose: "6, 12, 18 or 30 mg", frequency: "Once daily", duration: "8 weeks", route: "Oral", population: "Adults with hypercholesterolaemia", evidenceType: "Completed registered phase 2b trial", sourceUrl: "https://clinicaltrials.gov/study/NCT05261126" }),
  ]),
  mrna4157: priority("Published human", "V940/intismeran is a personalised cancer vaccine used only in specialist oncology trials.", [
    protocol({ label: "KEYNOTE-942 vaccine schedule", dose: "1 mg", frequency: "Every 3 weeks", duration: "9 doses", route: "Intramuscular", population: "Adults with resected high-risk melanoma, combined with pembrolizumab in the trial", evidenceType: "Published randomized human phase 2b study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/38246194/" }),
  ]),
  murepavadin: priority("Published human", "Murepavadin is investigational and the intravenous programme encountered renal safety concerns in later development.", [
    protocol({ label: "Human renal-impairment PK study", dose: "2.2 mg/kg", frequency: "Single dose", duration: "3-hour infusion", route: "Intravenous", population: "Adults with varying renal function and healthy controls", evidenceType: "Published human phase 1 pharmacokinetic study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/30012756/" }),
  ]),
  naselankamidate: priority("Analogue evidence gap", "No numerical human study was found for N-acetyl Selank amidate itself. These numbers belong to parent Selank animal research and cannot validate the modified analogue.", [
    protocol({ label: "Parent Selank animal study", dose: "100 or 300 μg/kg/day", frequency: "Daily", duration: "5-20 days depending on experiment", route: "Intraperitoneal or intranasal by experiment", population: "Stress and behaviour models", species: "Mouse or rat", evidenceType: "Published parent-compound animal research, not the N-acetyl amidate", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/29787664/" }),
  ]),
  nasemaxamidate: priority("Analogue evidence gap", "No numerical human study was found for N-acetyl Semax amidate itself. The human number is for parent Semax and cannot validate the modified analogue.", [
    protocol({ label: "Parent Semax human study", dose: "6,000 μg/day", frequency: "Daily", duration: "10 days, 2 courses separated by 20 days", route: "Route must be checked in the full paper", population: "Human study participants", evidenceType: "Published parent-compound human study, not the N-acetyl amidate", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/29798983/" }),
  ]),
  nadinjectable: priority("Small human pilot", "Direct intravenous NAD+ evidence is limited and does not establish clinical benefit or a general treatment dose.", [
    protocol({ label: "Human NAD+ metabolome pilot", dose: "750 mg total at about 2 mg/min", frequency: "Single infusion", duration: "6 hours", route: "Intravenous", population: "8 healthy men receiving NAD+ and 3 controls", evidenceType: "Published small human pilot study", sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6751327/" }),
  ]),
  ovagen: naturalBioregulator("20 mg/day", "Two 10 mg capsules once daily", "30 days"),
  oveporexton: priority("Published human", "Oveporexton remains investigational.", [
    protocol({ label: "Phase 2 narcolepsy trial arms", dose: "0.5 mg twice daily; 2 mg twice daily; 2 mg then 5 mg daily; or 7 mg once daily", frequency: "Once or twice daily by arm", duration: "8 weeks", route: "Oral", population: "Adults with narcolepsy type 1", evidenceType: "Published randomized human phase 2 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/40367374/" }),
  ]),
  pancragen: priority("Preclinical", "No validated human dose was found. The numerical record is from aged monkeys.", [
    protocol({ label: "Aged-monkey metabolic study", dose: "50 μg per animal per day", frequency: "Daily", duration: "10 days", route: "Intramuscular", population: "Old monkeys", species: "Monkey", evidenceType: "Published animal study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/28509500/" }),
  ]),
  pasireotide: priority("Official/published human", "Pasireotide is a prescription medicine requiring specialist monitoring.", [
    protocol({ label: "Cushing disease phase 3 study", dose: "600 or 900 μg", frequency: "Twice daily; some participants increased by 300 μg twice daily", duration: "12 months", route: "Subcutaneous", population: "Adults with Cushing disease", evidenceType: "Published randomized human phase 3 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/22397653/" }),
    protocol({ label: "Long-acting acromegaly study", dose: "40 or 60 mg", frequency: "Every 28 days", duration: "24 weeks", route: "Intramuscular long-acting release", population: "Adults with inadequately controlled acromegaly", evidenceType: "Published randomized human phase 3 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/25260838/" }),
  ]),
  pemvidutide: priority("Published human", "Pemvidutide remains investigational.", [
    protocol({ label: "MASH phase 2 trial", dose: "1.2 or 1.8 mg", frequency: "Once weekly without titration", duration: "24 weeks", route: "Subcutaneous", population: "Adults with MASH", evidenceType: "Published randomized human phase 2 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/41237796/" }),
  ]),
  pf08653944: priority("Registered human trial", "PF-08653944 is berobenatide, formerly MET097. These figures come from the registered MET097 programme and remain investigational.", [
    protocol({ label: "MET097/PF-08653944 phase 1/2 schedules", dose: "0.4-1.2 mg weekly lead-in, with studied final doses from 1.2 to 4.8 mg", frequency: "Once weekly", duration: "13 injections", route: "Subcutaneous", population: "Adults with overweight or obesity", evidenceType: "Completed registered phase 1/2 trial", sourceUrl: "https://clinicaltrials.gov/study/NCT06857617" }),
  ]),
  pnc27: priority("Preclinical", "No validated human dose exists. The discovery site's modelled 100-500 mcg schedule was rejected; the preferred numerical records come from a published full-text mouse AML study.", [
    protocol({ label: "Mouse AML experiments", dose: "40 mg/kg", frequency: "Once daily", duration: "2 or 3 weeks depending on the experiment", route: "Intraperitoneal", population: "Mouse acute myeloid leukaemia and patient-derived xenograft models", species: "Mouse", evidenceType: "Published preclinical full-text study", sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7951797/" }),
    protocol({ label: "Higher-dose mouse cohort", dose: "100 mg/kg", frequency: "Once daily", duration: "2 weeks", route: "Intraperitoneal", population: "Mouse AML and normal-haematopoiesis experiments", species: "Mouse", evidenceType: "Published preclinical full-text study", sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7951797/" }),
  ]),
  pt141: priority("Official US medicine label", "Bremelanotide is FDA approved in the United States only for acquired, generalised HSDD in specified premenopausal women. The label says it is not indicated for men, postmenopausal women, or enhancement of sexual performance.", [
    protocol({ label: "Vyleesi labelled dose", dose: "1.75 mg", frequency: "As needed; no more than one dose in 24 hours and more than 8 doses per month is not recommended", duration: "The label says to discontinue after 8 weeks if symptoms do not improve", route: "Subcutaneous autoinjector", population: "Premenopausal women meeting the labelled acquired, generalised HSDD indication", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=f1d0c1b5-2f39-4bad-a6a4-0066e3ad5dcf" }),
  ]),
  prostatilen: priority("Published human", "The preparation and route matter. These are two different clinical formulations.", [
    protocol({ label: "Intramuscular clinical study", dose: "5-10 mg", frequency: "Once daily", duration: "5-10 days", route: "Intramuscular", population: "Adult men in a prostatitis study", evidenceType: "Published human study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/1823682/" }),
    protocol({ label: "Rectal formulation study", dose: "30 mg prostatilen with 90 mg dimexide", frequency: "Once daily", duration: "Study course", route: "Rectal suppository", population: "Adult men in a prostatitis study", evidenceType: "Published human formulation study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/17315707/" }),
  ]),
  insulinrapid: priority("Official medicine class data", "Rapid-acting insulin is individually prescribed and can cause life-threatening hypoglycaemia. The figure describes total insulin need, not a standalone rapid-acting dose.", [
    protocol({ label: "Rapid-acting insulin lispro label figure", dose: "0.5-1.0 units/kg/day total insulin; about 50% may be meal-related boluses", frequency: "Divided between basal and meal-related insulin", duration: "Individualised ongoing treatment", route: "Subcutaneous", population: "Adults and children with diabetes using insulin lispro", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c5f75765-86b8-4926-b8c3-b42133ca7ac8" }),
  ]),
  insulinregular: priority("Official medicine label", "Regular insulin is individually prescribed and can cause life-threatening hypoglycaemia.", [
    protocol({ label: "Labelled total daily insulin requirement", dose: "Usually 0.5-1.0 units/kg/day total insulin", frequency: "Divided within an individualised regimen", duration: "Ongoing treatment", route: "Subcutaneous; intravenous only under medical supervision", population: "Adults and children with diabetes", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=78dadbee-c3b6-4d62-a338-731b24cc7ef0" }),
  ]),
  retinalamin: priority("Published human", "Retinalamin use and regulatory status vary by country. Retrobulbar administration is a specialist ophthalmic procedure.", [
    protocol({ label: "Human comparative study groups", dose: "5 mg intramuscular plus 5 mg retrobulbar; or 5 mg by either route alone", frequency: "Daily course dosing", duration: "Total course amount reported as 50 mg", route: "Intramuscular and/or retrobulbar", population: "Adults in an ophthalmology study", evidenceType: "Published human comparative study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/32366071/" }),
  ]),
  rusfertide: priority("Published human", "Rusfertide remains a specialist investigational medicine.", [
    protocol({ label: "Healthy-volunteer PK dose range", dose: "10-60 mg lyophilised formulation; 20 mg aqueous formulation", frequency: "Single dose in crossover study", duration: "Single-dose pharmacokinetic observation", route: "Subcutaneous", population: "Healthy adult volunteers", evidenceType: "Published human pharmacokinetic study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/39546273/" }),
  ]),
  selank: priority("Small published human conference study", "Selank is not FDA or EMA approved. The clearest numerical human record found is a small uncontrolled conference study, while the larger PubMed-indexed comparison does not state the dose in its abstract.", [
    protocol({ label: "Small generalized-anxiety study", dose: "2,700 mcg/day", frequency: "Daily", duration: "14 days", route: "Intranasal", population: "20 adults with generalized anxiety disorder", evidenceType: "Published human conference abstract; small and uncontrolled", sourceUrl: "https://doi.org/10.1016/S0924-9338(12)75281-1" }),
  ]),
  sigumir: naturalBioregulator("20-90 mg/day", "1-3 capsules of 10 mg, 2-3 times daily", "30-45 days"),
  hgh: priority("Official medicine label", "Somatropin is a prescription hormone. Indication, age and monitoring substantially change the dose.", [
    protocol({ label: "Labelled adult growth hormone deficiency start", dose: "About 0.2 mg/day; stated range 0.15-0.30 mg/day", frequency: "Daily", duration: "Individualised treatment", route: "Subcutaneous", population: "Adults with diagnosed growth hormone deficiency", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ffebf88b-d257-4542-9808-74d9b7167765" }),
    protocol({ label: "Labelled paediatric growth hormone deficiency range", dose: "0.16-0.24 mg/kg/week", frequency: "Divided over the week", duration: "Individualised treatment", route: "Subcutaneous", population: "Children with diagnosed growth hormone deficiency", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ffebf88b-d257-4542-9808-74d9b7167765" }),
  ]),
  stamakort: naturalBioregulator("20 mg/day", "Two 10 mg capsules once daily", "30 days", "https://peptideproduct.com/upload/ebook/brochure_synergy_of_natural_peptides_in_english.pdf"),
  sulanemadlin: priority("Published human", "Sulanemadlin is an investigational oncology medicine.", [
    protocol({ label: "Phase 1 dose escalation", dose: "0.16-4.4 mg/kg in arm A; 0.32-2.7 mg/kg in arm B", frequency: "By trial schedule", duration: "Repeated oncology trial cycles", route: "Intravenous", population: "Adults with advanced malignancies", evidenceType: "Published human phase 1 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/34301750/" }),
    protocol({ label: "Maximum tolerated and phase 2 dose", dose: "3.1 mg/kg", frequency: "By trial schedule", duration: "Repeated oncology trial cycles", route: "Intravenous", population: "Adults with advanced malignancies", evidenceType: "Published human phase 1 dose selection", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/34301750/" }),
  ]),
  suprefort: naturalBioregulator("20 mg/day", "Two 10 mg capsules once daily", "30-60 days", "https://biogenvita.com/products/suprefort"),
  survodutide: priority("Published human", "Survodutide remains investigational.", [
    protocol({ label: "MASH phase 2 trial", dose: "2.4, 4.8 or 6.0 mg", frequency: "Once weekly", duration: "48 weeks", route: "Subcutaneous", population: "Adults with biopsy-confirmed MASH", evidenceType: "Published randomized human phase 2 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/38847460/" }),
    protocol({ label: "Obesity dose-finding trial", dose: "0.6, 2.4, 3.6 or 4.8 mg", frequency: "Once weekly with a 20-week escalation period", duration: "46 weeks", route: "Subcutaneous", population: "Adults with overweight or obesity without diabetes", evidenceType: "Published randomized human phase 2 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/38330987/" }),
  ]),
  svetinorm: naturalBioregulator("20 mg or 40 mg/day", "One or two 10 mg capsules twice daily with meals", "1 month; the product page says use may be repeated after 3-6 months", "https://peptideproduct.com/catalog/peptide_products/svetinorm/"),
  testagen: communityBioregulator("2 mg/day", "Daily", "10 days"),
  testosteronecypionate: priority("Official medicine label", "Testosterone cypionate is a prescription Schedule III controlled substance in the US and requires confirmed diagnosis and monitoring.", [
    protocol({ label: "Labelled male hypogonadism replacement range", dose: "50-400 mg", frequency: "Every 2-4 weeks", duration: "Individualised treatment", route: "Deep intramuscular", population: "Adult men with confirmed hypogonadism", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=837570cb-8a33-4129-ad41-bead378d9987" }),
  ]),
  testosteroneenanthate: priority("Official medicine label", "Testosterone enanthate is a prescription controlled medicine and requires confirmed diagnosis and monitoring.", [
    protocol({ label: "Labelled male hypogonadism replacement range", dose: "50-400 mg", frequency: "Every 2-4 weeks", duration: "Individualised treatment", route: "Deep intramuscular", population: "Adult men with confirmed hypogonadism", evidenceType: "Official US medicine label", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=82a98132-9d5f-40a5-8c4f-f52f2a5de60e" }),
  ]),
  thymogen: priority("Official non-US product information", "These figures come from the Russian manufacturer's registered product leaflets. Thymogen is not FDA or EMA approved, and the two product forms must not be converted into a modelled subcutaneous protocol.", [
    protocol({ label: "Adult intramuscular product label", dose: "100 mcg", frequency: "Once daily", duration: "3-10 days", route: "Intramuscular", population: "Adults described in the Russian patient leaflet", evidenceType: "Official manufacturer patient leaflet for a registered non-US medicine", sourceUrl: "https://cytomed.ru/wp-content/uploads/2023/11/timogen-rastvor_listok-vkladysh.pdf" }),
    protocol({ label: "Adult nasal spray product label", dose: "25 mcg in each nostril", frequency: "Twice daily", duration: "10 days for treatment or 3-5 days for prevention, as stated in the product leaflet", route: "Intranasal", population: "Adults described in the Russian patient leaflet", evidenceType: "Official manufacturer patient leaflet for a registered non-US medicine", sourceUrl: "https://cytomed.ru/wp-content/uploads/timogen-sprej-lv.pdf" }),
  ]),
  ventfort: naturalBioregulator("10-40 mg/day", "One or two 10 mg capsules, once or twice daily", "30 days", "https://www.peptidedosage.org/peptides/ventfort/dosage"),
  vesugen: communityBioregulator("2 mg/day", "Daily", "10 days"),
  vilon: priority("Preclinical", "No validated human dose was found. The numerical record is from mice.", [
    protocol({ label: "Mouse survival study", dose: "1 mg/kg", frequency: "Study injections", duration: "Study period", route: "Injection", population: "Experimental survival model", species: "Mouse", evidenceType: "Published animal study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/14743610/" }),
  ]),
  visoluten: naturalBioregulator("20 mg/day", "Two 10 mg capsules once daily", "30 days"),
  vk2735: priority("Registered human trial", "VK2735 remains investigational.", [
    protocol({ label: "Registered weekly trial arms", dose: "7.5, 12.5 or 17.5 mg", frequency: "Once weekly", duration: "Trial treatment period", route: "Subcutaneous", population: "Adults with obesity and type 2 diabetes", evidenceType: "Registered phase 3 trial arms", sourceUrl: "https://clinicaltrials.gov/study/NCT07104383" }),
  ]),
  vladonix: naturalBioregulator("20-40 mg/day", "2-4 capsules daily", "30 days", "https://registri.pvd.gov.lv/ub/dati?mark_data=11412&name=&page=312"),
  zelenectidepevedotin: priority("Published human", "Zelenectide pevedotin is an investigational oncology medicine.", [
    protocol({ label: "Phase 1 dose escalation", dose: "2.5, 5.0 or 7.5 mg/m² weekly; 7.5 or 10 mg/m² every 2 weeks", frequency: "Weekly or every 2 weeks by cohort", duration: "21-day or 28-day cycles", route: "Intravenous", population: "Adults with advanced solid tumours", evidenceType: "Published human phase 1 study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/41197088/" }),
    protocol({ label: "Recommended phase 2 schedules", dose: "5.0 mg/m² weekly; or 7.5 mg/m² on days 1 and 8", frequency: "Weekly or days 1 and 8", duration: "21-day cycles", route: "Intravenous", population: "Adults with advanced solid tumours", evidenceType: "Published human phase 1 dose selection", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/41197088/" }),
  ]),
  betaendorphin: priority("Published small human study", "This historic study involved only a few cancer-pain patients and highly specialist routes. It does not establish a general therapeutic dose.", [
    protocol({ label: "Human intravenous pharmacokinetic doses", dose: "5 or 10 mg", frequency: "Single study administration", duration: "Acute pharmacokinetic observation", route: "Intravenous", population: "Three patients with cancer pain", evidenceType: "Published very small human study", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/291954/" }),
    protocol({ label: "Human intracerebroventricular study dose", dose: "7.5 mg", frequency: "Single study administration", duration: "Acute observation", route: "Intracerebroventricular", population: "One patient with cancer pain", evidenceType: "Published single-patient specialist procedure", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/291954/" }),
  ]),
};

export function dosagePriorityFor(compound) {
  const key = String(compound.slug || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return DOSAGE_PRIORITIES[key] || null;
}
