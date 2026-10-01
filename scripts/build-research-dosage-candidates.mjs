import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RESEARCH_PROFILES } from "../src/lib/concierge/research/evidence.generated.mjs";
import { COMPOUNDS } from "../src/lib/concierge/research/chat-engine.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "docs/research-dosage-candidates.generated.json");

function hasNumericDose(compound) {
  const protocols = (compound.researchProfiles || [])
    .flatMap((profile) => profile.claims)
    .flatMap((claim) => claim.protocols || []);
  const values = compound.addedFromExpandedLibrary && protocols.length
    ? protocols.flatMap((protocol) => [protocol.dose, protocol.frequency, protocol.duration])
    : Object.values(compound.sourceDose || {});
  return values.some((value) => /\d/.test(String(value || "")));
}

const gaps = COMPOUNDS.filter((compound) => !hasNumericDose(compound));

function decode(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x3bc;|&micro;/gi, "µ")
    .replace(/\s+/g, " ")
    .trim();
}

function numericSnippets(value = "") {
  const text = decode(value);
  const sentences = text.split(/(?<=[.!?;])\s+(?=[A-Z0-9[])/);
  const numeric = /\b\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?\s*(?:mg|mcg|µg|ug|g|IU|units?|U|MBq|kBq|Gy|mg\/kg|mcg\/kg|µg\/kg|U\/kg|units\/kg|mg\/m2|mg\/m²|µM|uM|nM|pM|mg\/mL|µg\/mL|%|vg\/kg)\b/i;
  return [...new Set(sentences.filter((sentence) => numeric.test(sentence)).map((sentence) => sentence.trim()))].slice(0, 16);
}

function idsFor(compound) {
  const references = (compound.researchProfiles || [])
    .flatMap((profile) => profile.claims)
    .flatMap((claim) => claim.references || []);
  const pmids = new Set();
  const trials = new Set();
  for (const reference of references) {
    const pmid = reference.url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i)?.[1]
      || reference.title.match(/PMID\s*:?[ ]?(\d+)/i)?.[1];
    const trial = `${reference.url} ${reference.title}`.match(/NCT\d{8}/i)?.[0]?.toUpperCase();
    if (pmid) pmids.add(pmid);
    if (trial) trials.add(trial);
  }
  return { pmids: [...pmids], trials: [...trials] };
}

const SEARCH_OVERRIDES = new Map([
  ["225Ac-DOTA-LM3", '"225Ac-DOTA-LM3" OR "Ac-225 DOTA-LM3"'],
  ["Alpha-Defensins", '"alpha defensin" OR HNP-1 OR HD-5'],
  ["GIP", '"glucose-dependent insulinotropic polypeptide"'],
  ["GLP-1 (Native)", '"native GLP-1" OR "GLP-1(7-36)"'],
  ["GLP-2 (Native)", '"native GLP-2" OR "GLP-2(1-33)"'],
  ["HMG", '"human menopausal gonadotropin" OR menotropins'],
  ["mRNA-4157/V940", '"mRNA-4157" OR V940'],
  ["N-Acetyl Selank Amidate", '"N-acetyl Selank amidate" OR Selank'],
  ["N-Acetyl Semax Amidate", '"N-acetyl Semax amidate" OR Semax'],
  ["PF-08653944", '"PF-08653944" OR berobenatide OR MET097'],
  ["Rapid-Acting Insulin", '"rapid acting insulin"'],
  ["Regular Insulin", '"regular human insulin"'],
  ["testosterone cypionate", '"testosterone cypionate"'],
  ["Testosterone Enanthate", '"testosterone enanthate"'],
  ["β-Endorphin", '"beta-endorphin"'],
]);

function searchTerm(compound) {
  return SEARCH_OVERRIDES.get(compound.name) || `"${compound.name}"`;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "WindsorGlowResearchAudit/1.0 (+educational source verification)" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

async function fetchPubMed(pmids) {
  if (!pmids.length) return new Map();
  const output = new Map();
  for (let offset = 0; offset < pmids.length; offset += 80) {
    const chunk = pmids.slice(offset, offset + 80);
    const xml = await fetchText(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${chunk.join(",")}&retmode=xml`);
    for (const match of xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/gi)) {
      const article = match[1];
      const pmid = article.match(/<PMID[^>]*>(\d+)<\/PMID>/i)?.[1];
      if (!pmid) continue;
      const title = decode(article.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/i)?.[1]);
      const abstract = [...article.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/gi)]
        .map((item) => decode(item[1]))
        .join(" ");
      output.set(pmid, {
        title,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        numericSnippets: numericSnippets(abstract),
      });
    }
  }
  return output;
}

async function searchPubMed(term) {
  const query = `${term} AND (dose OR dosage OR dosing OR administered OR infusion)`;
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=8&sort=relevance&term=${encodeURIComponent(query)}`;
  const result = JSON.parse(await fetchText(url));
  return result?.esearchresult?.idlist || [];
}

async function fetchTrial(id) {
  const response = await fetch(`https://clinicaltrials.gov/api/v2/studies/${id}`, {
    headers: { "User-Agent": "WindsorGlowResearchAudit/1.0 (+educational source verification)" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${id}`);
  const study = await response.json();
  const protocol = study.protocolSection || {};
  const arms = protocol.armsInterventionsModule || {};
  const design = protocol.designModule || {};
  const identification = protocol.identificationModule || {};
  const status = protocol.statusModule || {};
  const armLabels = (arms.armGroups || []).map((arm) => arm.label).filter(Boolean);
  const interventions = (arms.interventions || []).map((intervention) => ({
    name: intervention.name,
    description: intervention.description || "",
    armGroupLabels: intervention.armGroupLabels || [],
  }));
  const searchable = [
    ...armLabels,
    ...interventions.flatMap((item) => [item.description, ...item.armGroupLabels]),
  ].join(". ");
  return {
    id,
    title: identification.briefTitle || identification.officialTitle || id,
    url: `https://clinicaltrials.gov/study/${id}`,
    studyType: design.phases || [],
    status: status.overallStatus || "",
    armLabels,
    interventions,
    numericSnippets: numericSnippets(searchable),
  };
}

function trialFromStudy(study) {
  const protocol = study.protocolSection || {};
  const arms = protocol.armsInterventionsModule || {};
  const design = protocol.designModule || {};
  const identification = protocol.identificationModule || {};
  const status = protocol.statusModule || {};
  const id = identification.nctId || "";
  const armLabels = (arms.armGroups || []).map((arm) => arm.label).filter(Boolean);
  const interventions = (arms.interventions || []).map((intervention) => ({
    name: intervention.name,
    description: intervention.description || "",
    armGroupLabels: intervention.armGroupLabels || [],
  }));
  const searchable = [
    ...(arms.armGroups || []).flatMap((arm) => [arm.label, arm.description]),
    ...interventions.flatMap((item) => [item.name, item.description, ...item.armGroupLabels]),
  ].join(". ");
  return {
    id,
    title: identification.briefTitle || identification.officialTitle || id,
    url: `https://clinicaltrials.gov/study/${id}`,
    studyType: design.phases || [],
    status: status.overallStatus || "",
    armLabels,
    interventions,
    numericSnippets: numericSnippets(searchable),
  };
}

async function searchTrials(term) {
  const url = `https://clinicaltrials.gov/api/v2/studies?format=json&pageSize=10&query.term=${encodeURIComponent(term)}`;
  const result = JSON.parse(await fetchText(url));
  return (result.studies || []).map(trialFromStudy);
}

async function pause(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const identifiers = gaps.map((compound) => ({ compound, ...idsFor(compound) }));
  const allPmids = [...new Set(identifiers.flatMap((item) => item.pmids))];
  const allTrials = [...new Set(identifiers.flatMap((item) => item.trials))];
  const pubmed = await fetchPubMed(allPmids);
  const trialEntries = await Promise.all(allTrials.map(async (id) => {
    try {
      return [id, await fetchTrial(id)];
    } catch (error) {
      return [id, { id, error: String(error), url: `https://clinicaltrials.gov/study/${id}` }];
    }
  }));
  const trials = new Map(trialEntries);
  const profiles = [];
  for (const { compound, pmids, trials: trialIds } of identifiers) {
    const term = searchTerm(compound);
    const searchedPmids = await searchPubMed(term);
    await pause(350);
    const searchRecords = await fetchPubMed(searchedPmids);
    await pause(350);
    let searchedTrials = [];
    try {
      searchedTrials = await searchTrials(term);
    } catch (error) {
      searchedTrials = [{ error: String(error), url: `https://clinicaltrials.gov/search?term=${encodeURIComponent(term)}` }];
    }
    await pause(350);
    const linkedPubMed = pmids.map((id) => pubmed.get(id)).filter(Boolean);
    const linkedTrials = trialIds.map((id) => trials.get(id)).filter(Boolean);
    profiles.push({
      key: compound.slug,
      name: compound.name,
      searchTerm: term,
      sourcePages: (compound.researchProfiles || []).flatMap((profile) => profile.claims.map((claim) => claim.url)),
      pubmed: [...linkedPubMed, ...searchRecords.values()]
        .filter((record, index, all) => all.findIndex((item) => item.url === record.url) === index),
      trials: [...linkedTrials, ...searchedTrials]
        .filter((record, index, all) => !record.id || all.findIndex((item) => item.id === record.id) === index),
    });
    process.stdout.write(`Checked ${profiles.length}/${identifiers.length}: ${compound.name}\n`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    numericalCoverageGapsChecked: gaps.length,
    linkedPubmedRecordsRead: pubmed.size,
    linkedTrialRecordsRead: trials.size,
    officialSearchQueries: profiles.length,
    profiles,
  };
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote dosage candidates for ${profiles.length} profiles to ${OUTPUT}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
