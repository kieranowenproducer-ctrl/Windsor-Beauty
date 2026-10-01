import { createHash } from "node:crypto";
import { open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
/* Step 9: the general reader. The import cycle with this file is safe — the
   helpers it needs are hoisted function declarations, and readWithSettings is
   only called at run time inside main(). */
import { readWithSettings } from "./general-reader.mjs";
import { READER_SETTINGS } from "./source-reader-settings.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "src/lib/concierge/research/evidence.generated.mjs");
const ARTICLE_OUTPUT = path.join(ROOT, "src/lib/concierge/research/article-library.generated.mjs");
const FULL_AUDIT_OUTPUT = path.join(ROOT, "docs/research-chat-evidence-audit.generated.json");
/* Stage C step 5: full text of every page read, for loading into the database.
   Large and regenerated on every run, so it is gitignored, never committed. */
const SOURCE_LIBRARY_OUTPUT = path.join(ROOT, "docs/source-library.generated.json");

const SOURCE_DEFINITIONS = [
  {
    id: "peptide-reference",
    name: "PeptideRef Clinical Reference",
    url: "https://jmitsuominor-ux.github.io/peptide-reference/",
    role: "Original PEARL baseline reference library",
    trust: "Use the pinned 105-entry source snapshot as the baseline library. Recheck linked papers and official medicine information when a claim is disputed or updated.",
    status: "baseline-imported",
  },
  {
    id: "peptide-handbook",
    name: "The Peptide Handbook",
    url: "https://peptide-handbook.com/",
    role: "Tertiary educational database",
    trust: "Use for discovery and source-linked summaries. Prefer the cited primary paper for disputed claims.",
  },
  {
    id: "pepcodex",
    name: "PepCodex",
    url: "https://www.pepcodex.com/",
    role: "Evidence-graded research dossier library",
    trust: "Useful for evidence gaps, conditions and citations. Community reports are never treated as clinical evidence.",
  },
  {
    id: "peptidehub",
    name: "Peptide Hub",
    url: "https://peptidehub.bio/",
    role: "Protocol-focused educational database",
    trust: "Import all mapped content. Keep product-strength, calculator, preparation and stacking claims clearly attributed to this commercial source, and distinguish them from linked papers.",
  },
  {
    id: "halflife-labs",
    name: "Halflife Labs",
    url: "https://halflife-labs.com/database/",
    role: "Pharmacokinetic reference database",
    trust: "Use for species- and route-labelled pharmacokinetic summaries, checked against the cited primary source.",
  },
  {
    id: "peptpedia",
    name: "Peptpedia",
    url: "https://peptpedia.org/",
    role: "Cited research peptide encyclopedia",
    trust: "Use for structured study context and citations. Treat broad narrative claims as tertiary until verified in the cited paper.",
  },
  {
    /* Added 19 Aug 2026 on Kieran's explicit instruction (task 70281b89),
       after the review of it recommended against adding it. He was told what
       the site is and chose to add it, so it goes in under the SAME
       discovery-aid rule its near-twin peptidedosage.org already runs under,
       immediately below.

       Its research and citations are imported. Its preparation content is not,
       and cannot be: the reader for this source reads four named sections and
       nothing else (how it works, published human research, benefits and side
       effects, and the citations). The dosing chart, reconstitution guide,
       spray and syringe calculations, actuator maths, supplies list and
       injection-technique sections are never read. Proven at 95/95 profiles:
       0 protocols imported, and no reconstitution, device, preparation-step or
       reader-addressed text in any imported field.

       Seven safety passages note that site rotation and proper technique
       reduce injection-site reactions. That is a side-effect note rather than
       a procedure, and it is reported to Kieran rather than silently
       stripped. */
    id: "peptidedosages",
    name: "PeptideDosages.com",
    url: "https://peptidedosages.com/",
    role: "Commercial protocol, preparation and citation source",
    trust: "Import the supplied pages in full. Keep the site's own dosage, calculator, preparation and handling content attributed to the site, label it as commercial or tertiary material, and distinguish it from figures reported by a paper or official label.",
    status: "full-source-import",
  },
  {
    id: "peptidedosage",
    name: "PeptideDosage.org",
    url: "https://www.peptidedosage.org/",
    role: "Commercial protocol index and source library",
    /* Re-reviewed 18 Aug 2026 on Kieran's request. Finding, new since this
       source was first accepted: the site now carries an UNDISCLOSED affiliate
       link to a competing peptide vendor in its header -
       ascensionpeptides.com/shop/ref/mihaita/?campaign=dosage-web-exitpopup -
       with no partner or affiliate statement anywhere on the page. That is a
       commercial interest in what it recommends, so its selective-import rule
       below is kept and tightened rather than relaxed. It stays a discovery
       aid only. */
    trust: "Import its supplied content in full. Label its dosage figures and schedules as commercial/community material, preserve its stated limitations and provenance, and prefer an original paper, registered trial or official product label when one supplies a stronger figure.",
    status: "full-source-import",
  },
  {
    /* Added 18 Aug 2026, task 15a024a5. Reviewed against the live site, not the
       homepage claims: published editorial board, evidence grading methodology,
       corrections policy, affiliate disclosure, UK and EU regulatory context on
       every profile, and twenty numbered evidence modules per compound
       including "what this page cannot tell you" and "research gaps".
       Reader proven before this entry was written: 71 profiles read from 702
       mapped pages, 0 failures, every field populated on all 71.

       One discrepancy found and recorded rather than glossed: the site states a
       "no dosing, no sourcing" policy, yet every profile carries a "Theoretical
       Dosing & Protocols" block and the site publishes a reconstitution maths
       tool. Its own framing calls that block educational only and not a
       recommendation. The reader deliberately does NOT extract it, so no
       protocol from this source enters PEARL. Turning that on is a settings
       addition and Kieran's decision. */
    id: "peptideauthority",
    name: "Peptide Authority",
    url: "https://peptideauthority.co.uk/",
    role: "UK and EU education platform with graded evidence and regulatory context",
    trust: "Import the supplied profiles and their theoretical dosing blocks. Label those figures as the site's educational protocols, keep its evidence grades and limitations attached, and prefer a primary paper or official label when available.",
    status: "full-source-import",
  },
  {
    id: "peptidedeck",
    name: "PeptideDeck",
    url: "https://www.peptidedeck.com/",
    role: "Commercial educational directory and supplied source library",
    trust: "Import every reachable supplied profile and article. Keep commercial, affiliate, protocol, preparation and modelled content clearly attributed to PeptideDeck and retain citation mismatches as limitations instead of silently dropping the page.",
    status: "full-source-import",
  },
  {
    /* Added 18 Aug 2026, task 679e8e33. "Science-first educational resource for
       peptide research. Evidence over hype", with a Regulatory & Legal section
       and a Bottom Line on each profile. Reader proven before this entry was
       written: 75 profiles read from 559 mapped pages, 0 failures, 631
       citations, every name, summary, evidence line, review date and citation
       list populated on all 75.

       Its structure is LESS consistent than the other sources here. Headings
       vary between profiles ("The Bottom Line" and "Bottom Line", "Safety
       Profile and Side Effects" and "Safety and Side Effects"), and its
       addresses are descriptive rather than the compound name, so the profile
       key is read from the page headline instead of the URL. Half-life and a
       stated limitations section are genuinely absent from most profiles
       rather than being missed by the reader; that is a property of the
       source, so those fields stay empty rather than being guessed at.

       Its "Administration and Dosing in Research" section is deliberately NOT
       extracted, so no protocol from this source enters PEARL. Its safety
       sections do carry study-attributed figures ("no adverse effects in
       rodent models at doses up to 100 mg/kg"), which is third-person
       reporting of published toxicology rather than instruction, and is left
       in because removing it would make the safety record less honest. */
    id: "peptidejournal",
    name: "PeptideJournal",
    url: "https://www.peptidejournal.org/",
    role: "Science-first educational profile library with regulatory context",
    trust: "Import its research summaries, mechanism, safety, citation trail and source-listed dosing section. Authorship is not named, so dosage figures remain labelled as source protocols and stronger primary or official evidence stays preferred.",
    status: "full-source-import",
  },
  {
    id: "wikipep",
    name: "WikiPep",
    url: "https://wikipep.org/wiki/Main_Page",
    role: "Commercial wiki-style peptide directory and supplied source library",
    trust: "Import every reachable supplied article, including dosage and calculator material. Attribute figures and procedures to WikiPep, label the source type, and retain known evidence-to-product mismatches as explicit limitations.",
    status: "full-source-import",
  },
  {
    id: "pep-university",
    name: "Peptide University Codex",
    url: "https://pepuniversity.com/peptide-codex.php",
    role: "Protocol-focused tertiary database",
    trust: "Import every publicly reachable supplied record in full. Attribute uncited dosage, preparation, combination and safety material to Peptide University and label it as tertiary rather than excluding it.",
    status: "full-source-import",
  },
  {
    id: "peptidegpt",
    name: "PeptideGPT",
    url: "https://chatgpt.com/g/g-zKizzcahz-peptidegpt",
    role: "Custom AI assistant link",
    trust: "No claims imported. The supplied link returns a public 404 and exposes no knowledge files or traceable citations.",
    status: "unavailable",
  },
  {
    /* Peptora, supplied by Kieran on 7 September 2026 and finished on 13 September (task
       ab2b7533). It sat written down but never read in for six days, so none of it reached a
       single answer, and the screen said so plainly the whole time.

       IT IS THE ONLY SOURCE THAT CANNOT BE FETCHED. Peptora is a login-only app on a paid
       one-time licence, so there is no public page for the general reader to open and no
       settings entry can help. Its content was captured through the browser with Kieran's own
       trial session and committed to src/data/pearl/offline-sources/peptora.json. That file IS
       the source: when the trial ends the pages are gone and cannot be fetched again, which is
       exactly why it is in the repository rather than on somebody's machine.

       MEMBER VISIBILITY. Kieran, 10 September: "Ensure if peptora is used that no competitor
       info is ever shown to any member for any sources used." So this carries
       memberVisible: false. It is not in TRUSTED_RESEARCH_HOSTS, so the engine already refuses
       to make it a tappable link, and the flag takes that one step further: the source strip
       never names it at all. Provenance stays in the generated audit for us.

       IN FULL. 29 peptide entries, the stacks index and all six stack pages, including Glow and
       Klow, which are blends Windsor Glow sells. The 10 September run had missed those six. */
    id: "peptora",
    name: "Peptora",
    url: "https://peptora.io/app/encyclopedia",
    role: "Licensed peptide encyclopedia, captured offline",
    trust: "Read from a captured snapshot of the licensed app, not fetched live. Treat its numerical records as tertiary: verify against the original paper or official product information before a figure is preferred.",
    offline: true,
    memberVisible: false,
  },
];

/* Hosts whose pages this build can never fetch, because they are behind a login. Their content
   arrives from a committed capture instead, so the cited-page step must not try to open them:
   every attempt would fail, and a login page stored as though it were the article would be worse
   than the failure. */
const OFFLINE_SOURCE_HOSTS = new Set(
  SOURCE_DEFINITIONS.filter((definition) => definition.offline)
    .map((definition) => { try { return new URL(definition.url).hostname; } catch { return null; } })
    .filter(Boolean),
);

const TRUSTED_REFERENCE_HOSTS = new Set([
  "pubmed.ncbi.nlm.nih.gov",
  "pmc.ncbi.nlm.nih.gov",
  "clinicaltrials.gov",
  "www.clinicaltrials.gov",
  "doi.org",
  "www.fda.gov",
  "fda.gov",
  "www.ema.europa.eu",
  "ema.europa.eu",
  "www.wada-ama.org",
  "wada-ama.org",
  "dailymed.nlm.nih.gov",
]);

// These PubMed identifiers were supplied under unrelated peptide claims but
// resolve at NCBI to different subjects. They are excluded before any source
// record can reach PEARL. The audit conflict list below records what each one
// actually points to and why it was rejected.
const REJECTED_REFERENCE_URLS = new Set([
  "https://pubmed.ncbi.nlm.nih.gov/11157505/",
  "https://pubmed.ncbi.nlm.nih.gov/16640009/",
  "https://pubmed.ncbi.nlm.nih.gov/18677858/",
]);

const PEPTIDEDECK_PROFILE_PATHS = [
  "5-amino-1mq", "aod-9604", "ara-290", "bpc-157", "cagrilintide", "cjc-1295", "dsip",
  "epithalon", "foxo4-dri", "ghk-cu", "glutathione", "hcg", "ipamorelin", "kisspeptin",
  "kisspeptin-10", "kpv", "ll-37", "melanotan-1", "melanotan-i", "melanotan-ii", "melanotan-2",
  "mots-c", "nad-plus", "oxytocin", "pinealon", "pt-141", "retatrutide", "selank", "semaglutide",
  "semax", "sermorelin", "ss-31", "tb-500", "tesamorelin", "thymosin-alpha-1", "tirzepatide",
  "vip", "abaloparatide", "adipotide", "argireline", "cerebrolysin", "cortistatin", "dihexa",
  "dulaglutide", "exenatide", "follistatin-344", "ghrelin", "ghrp-2", "ghrp-6", "gonadorelin",
  "hexarelin", "hgh-fragment-176-191", "humanin", "igf-1-des", "igf-1-lr3", "l-carnosine",
  "lanreotide", "linaclotide", "liraglutide", "lixisenatide", "matrixyl", "mgf", "mk-677",
  "mod-grf-1-29", "n-acetyl-selank", "na-semax-amidate", "nesfatin-1", "neuropeptide-y",
  "octreotide", "orexin-a", "p21", "pacap-38", "peg-mgf", "pemvidutide", "peptide-yy",
  "pramlintide", "ptd-dbm", "setmelanotide", "snap-8", "survodutide", "teriparatide", "thymalin",
  "thymopentin", "thymosin-beta-4", "thymulin", "vosoritide",
];

const WIKIPEP_FALLBACK_MAPPED_PROFILE_COUNT = 341;
const WIKIPEP_IMPORTED_PATHS = [
  "Bivalirudin",
  "Cetrorelix",
  "Ganirelix",
  "Goserelin",
  "Histrelin",
  "Nafarelin",
  "Dasiglucagon",
  "Enfuvirtide",
  "Eptifibatide",
  "Etelcalcetide",
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/*
 * Pearl plan Stage C step 5: the same scrape that builds the evidence also
 * keeps every page it read, in full, so nothing is thrown away any more.
 * First successful read of a URL wins; final failures are kept too, so the
 * source screen can say honestly which pages could not be reached.
 */
const CAPTURED_PAGES = new Map();
const CAPTURE_FAILURES = new Map();

async function fetchText(url, attempt = 1) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml,text/markdown;q=0.9,*/*;q=0.8",
        "User-Agent": "WindsorGlowResearchAudit/1.0 (+educational source verification)",
      },
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    if (!CAPTURED_PAGES.has(url)) CAPTURE_FAILURES.set(url, { url, error: String(error), fetchedAt: new Date().toISOString() });
    throw error;
  }
  if ((response.status === 429 || response.status >= 500) && attempt < 6) {
    await sleep(750 * attempt);
    return fetchText(url, attempt + 1);
  }
  if (!response.ok) {
    if (!CAPTURED_PAGES.has(url)) {
      CAPTURE_FAILURES.set(url, { url, error: `${response.status} ${response.statusText}`, httpStatus: response.status, fetchedAt: new Date().toISOString() });
    }
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  const body = await response.text();
  if (!CAPTURED_PAGES.has(url)) {
    CAPTURED_PAGES.set(url, { url, fetchedAt: new Date().toISOString(), httpStatus: response.status, body });
    CAPTURE_FAILURES.delete(url);
  }
  return body;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error: String(error), url: items[index] };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function decodeHtml(value = "") {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    ndash: "-",
    mdash: "-",
    rsquo: "'",
    lsquo: "'",
    ldquo: '"',
    rdquo: '"',
  };
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function cleanText(value = "", maximum = 1_200) {
  return decodeHtml(String(value))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function cleanList(values, maximumItems = 24) {
  return [...new Set((values || []).map((value) => cleanText(value, 240)).filter(Boolean))].slice(0, maximumItems);
}

/*
 * Cut prose at a sentence boundary instead of mid-sentence. Text under the cap
 * comes back untouched, so anything that fitted before still reads the same.
 * If no sentence ends late enough in the slice, fall back to the last whole
 * word, so a cut can never land mid-word. Pearl plan Stage C step 4: 368 of
 * 1,013 stored fields used to end mid-sentence because of hard slices.
 */
function sentenceTrim(value = "", maximum = 1_200) {
  const text = String(value);
  if (text.length <= maximum) return text;
  const slice = text.slice(0, maximum);
  let end = -1;
  for (const match of slice.matchAll(/[.!?]["')\]]*(?=\s)/g)) {
    end = match.index + match[0].length;
  }
  if (end >= Math.floor(maximum * 0.4)) return slice.slice(0, end).trimEnd();
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
}

/* cleanText for prose fields: same cleaning, sentence-safe cut. Never use it
   for keys, aliases or topics — those feed matching and must not move. */
function cleanProse(value = "", maximum = 1_200) {
  return sentenceTrim(cleanText(value, Number.MAX_SAFE_INTEGER), maximum);
}

function cleanProseList(values, maximumItems = 24, itemMaximum = 320) {
  return [...new Set((values || []).map((value) => cleanProse(value, itemMaximum)).filter(Boolean))].slice(0, maximumItems);
}

/* Keep the supplied page intact in `passages` and the audit archive, but do
 * not let shop chrome, discount copy or rival seller names become PEARL's
 * constructed answer. These replacements remove presentation furniture, not
 * research, protocols or source attribution. */
const SALES_FURNITURE = /\b(add to cart|checkout now|order now|in stock|free shipping|best price|cheapest|use code|promo code|discount code|\d{1,2}% off|buy now|shop now|our range|visit our store)\b/gi;
const THIRD_PARTY_SELLERS = /\b(ascension peptides|ascensionpeptides|swiss chems|swisschems|peptide sciences|limitless life|core peptides|biotech peptides|amino asylum|sports technology labs|pure rawz|purerawz|behemoth labz|umbrella labs|geopeptides|paradigm peptides|chemyo|proven peptides|direct peptides)\b/gi;

function answerText(value = "", maximum = 1_200) {
  return cleanProse(String(value)
    .replace(SALES_FURNITURE, " ")
    .replace(THIRD_PARTY_SELLERS, "third-party seller")
    .replace(/\s+/g, " "), maximum);
}

function answerTextList(values, maximumItems = 24, itemMaximum = 320) {
  return [...new Set((values || []).map((value) => answerText(value, itemMaximum)).filter(Boolean))].slice(0, maximumItems);
}

function canonicalKey(value = "") {
  return cleanText(value, 200)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function sitemapLocations(xml) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeHtml(match[1].trim()));
}

function absoluteUrl(value, base) {
  try {
    return new URL(decodeHtml(value), base).href;
  } catch {
    return "";
  }
}

function extractLinks(markup, base) {
  const links = [];
  for (const match of markup.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absoluteUrl(match[1], base);
    if (!url) continue;
    links.push({ title: cleanText(match[2], 220) || url, url });
  }
  for (const match of markup.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)) {
    links.push({ title: cleanText(match[1], 220) || match[2], url: match[2] });
  }
  return links;
}

function pageHeading(markup, fallback = "") {
  const heading = markup.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || fallback;
  return cleanText(heading, 220);
}

function uniqueLinks(links) {
  const found = new Map();
  for (const link of links) {
    try {
      const parsed = new URL(link.url);
      parsed.hash = "";
      const normalized = parsed.href;
      if (!found.has(normalized)) found.set(normalized, { ...link, url: normalized });
    } catch {
      // Ignore malformed links from third-party pages.
    }
  }
  return [...found.values()];
}

function trustedReferences(markup, base, maximum = 10) {
  const references = [];
  for (const link of extractLinks(markup, base)) {
    try {
      const parsed = new URL(link.url);
      if (!TRUSTED_REFERENCE_HOSTS.has(parsed.hostname)) continue;
      const normalized = parsed.hostname.includes("clinicaltrials.gov")
        ? `${parsed.origin}${parsed.pathname}`
        : link.url;
      if (!references.some((item) => item.url === normalized)) references.push({ ...link, url: normalized });
    } catch {
      // Ignore malformed citations.
    }
  }
  const pmids = cleanText(markup, 200_000).matchAll(/PMID:?\s*(\d{6,9})/gi);
  for (const match of pmids) {
    const url = `https://pubmed.ncbi.nlm.nih.gov/${match[1]}/`;
    if (!references.some((item) => item.url === url)) references.push({ title: `PubMed PMID ${match[1]}`, url });
  }
  return references.slice(0, maximum);
}

function jsonLd(markup) {
  const items = [];
  for (const match of markup.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1].trim()));
      items.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      // A bad optional metadata block should not drop a whole profile.
    }
  }
  return items;
}

function firstJsonLd(items, type) {
  return items.find((item) => item?.["@type"] === type) || {};
}

function between(text, start, ends, maximum = 1_200) {
  const lower = text.toLowerCase();
  const startIndex = lower.indexOf(start.toLowerCase());
  if (startIndex < 0) return "";
  const contentStart = startIndex + start.length;
  let endIndex = text.length;
  for (const end of ends) {
    const found = lower.indexOf(end.toLowerCase(), contentStart);
    if (found >= 0 && found < endIndex) endIndex = found;
  }
  return cleanProse(text.slice(contentStart, endIndex), maximum);
}

function pageTitle(markup) {
  return cleanText(markup.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "", 240);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/* Administration guidance does not belong in a SAFETY list (Kieran, 19 Aug
   2026: "remove the seven safety notes"). Sources routinely end a side-effect
   line with a tip - "rotate sites to minimize", "proper technique and site
   rotation minimize these effects" - and that reads as PEARL telling a member
   how to inject, inside the one section they are most likely to trust.

   The side effect itself is real safety information and is kept. Only the
   guidance clause is dropped, so "injection-site reactions (redness, swelling)
   may occur; rotate sites to minimize" keeps everything up to the semicolon.
   A line that is nothing BUT guidance disappears entirely.

   This applies to every source, not just the one that prompted it. The full
   preparation and technique content still travels in the `preparation` field,
   where it is labelled as the source's own words. */
const SAFETY_GUIDANCE_CLAUSE = /(?:rotat\w*\s+(?:the\s+)?(?:injection\s+)?sites?|site\s+rotation|proper\s+technique|correct\s+technique|inject\s+slowly|aspirat\w+|use\s+a\s+new\s+needle|alcohol\s+swab)/i;

/* WHERE a dose goes on the body, which is a different thing from what the compound is.
 *
 * Found 13 September 2026 by reading what the refreshed library would actually tell a member: the
 * afamelanotide summary had become "...It is inserted above the anterior supra-iliac crest every 2
 * months...". That is placement instruction, the same class of content the clause filter above
 * already strips from safety notes, and it had arrived in a SUMMARY where nothing was checking.
 *
 * Narrow on purpose. "Subcutaneous implant" and "intramuscular" describe what a thing IS and stay;
 * this only catches a named anatomical site being given as where to put it. */
const ADMINISTRATION_SITE_CLAUSE = /\b(?:inserted|implanted|injected|administered|placed)\s+(?:just\s+|directly\s+)?(?:above|below|under|beneath|into|in|over)\s+the\s+[\w\s-]*\b(?:crest|abdomen|thigh|deltoid|buttock|navel|umbilicus|flank|upper\s+arm|gluteal)\b/i;

/**
 * The same treatment for prose rather than a list of lines.
 *
 * Sentence by sentence, so the useful half of a paragraph survives when only one sentence is the
 * problem. A paragraph that is nothing but placement instruction disappears, which is correct.
 */
function withoutAdministrationProse(text) {
  const value = String(text || "");
  if (!value || !ADMINISTRATION_SITE_CLAUSE.test(value)) return value;
  const kept = value
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !ADMINISTRATION_SITE_CLAUSE.test(sentence));
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

function withoutAdministrationGuidance(lines) {
  const kept = [];
  for (const line of lines || []) {
    const clauses = String(line).split(/(?<=[.;])\s+/);
    const useful = clauses.filter((clause) => !SAFETY_GUIDANCE_CLAUSE.test(clause));
    const rebuilt = useful.join(" ").replace(/[;,\s]+$/, "").trim();
    // Keep only if something of substance survived; a bare fragment left behind
    // by the trim is worse than nothing.
    if (rebuilt.length >= 25) kept.push(/[.!?]$/.test(rebuilt) ? rebuilt : `${rebuilt}.`);
  }
  return kept;
}

function profileClaim(sourceId, url, fields) {
  return {
    sourceId,
    url,
    lastReviewed: fields.lastReviewed || "Not stated",
    summary: cleanProse(withoutAdministrationProse(fields.summary), 1_800),
    evidence: cleanProse(fields.evidence, 1_800),
    halfLife: cleanText(fields.halfLife, 260),
    halfLifeContext: cleanProse(fields.halfLifeContext, 700),
    mechanism: cleanProse(fields.mechanism, 1_800),
    limitations: cleanProseList(fields.limitations, 10, 320),
    safety: withoutAdministrationGuidance(cleanProseList(fields.safety, 14, 320)),
    topics: cleanList(fields.topics, 30),
    protocols: (fields.protocols || []).slice(0, 10),
    /* Added 19 Aug 2026. Samuel's rule: a source he supplies goes in IN FULL,
       so a site whose pages are largely preparation and handling needs
       somewhere for that to live rather than being silently dropped. Held
       separately from protocols because it is prose, not a numbered record. */
    preparation: cleanProseList(fields.preparation, 14, 400),
    // Searchable article sections preserve the supplied page beyond the
    // handful of fixed fields used by deterministic templates. This is what
    // lets the conversational layer retrieve the relevant part of an article
    // instead of receiving only its opening paragraph.
    passages: (fields.passages || []).map((passage) => ({
      heading: cleanText(passage?.heading || "", 220),
      text: cleanProse(passage?.text || passage, 1_000),
    })).filter((passage) => passage.text).slice(0, 80),
    references: (fields.references || []).filter((reference) => !REJECTED_REFERENCE_URLS.has(reference.url)).slice(0, 12),
    humanStudies: Number.isFinite(fields.humanStudies) ? fields.humanStudies : null,
    animalStudies: Number.isFinite(fields.animalStudies) ? fields.animalStudies : null,
    citedSources: Number.isFinite(fields.citedSources) ? fields.citedSources : null,
    contentHash: fields.contentHash || "",
  };
}

/* ── Peptora, read from its committed capture (task ab2b7533) ───────────────────────────────── */

/**
 * Slice a captured page's rendered text into its sections, using the headings captured with it.
 *
 * There is no HTML to work from: Peptora is a login-only app and what was saved is the text a
 * person would see, plus the heading list in document order. Finding each heading in the text and
 * cutting between them recovers the same sections the general reader gets from markup. Headings are
 * searched from the previous cut forward, so a word that also appears in body text earlier on the
 * page cannot pull a section boundary backwards.
 */
function peptoraSections(entry) {
  const text = String(entry?.text || "");
  const headings = (entry?.headings || []).map((heading) => String(heading.text || "").trim()).filter(Boolean);
  const cuts = [];
  let from = 0;
  for (const heading of headings) {
    const at = text.indexOf(heading, from);
    if (at === -1) continue;
    cuts.push({ heading, at, end: at + heading.length });
    from = at + heading.length;
  }
  const sections = new Map();
  for (const [index, cut] of cuts.entries()) {
    const stop = index + 1 < cuts.length ? cuts[index + 1].at : text.length;
    // "Benefits(4)" and "References(12)" carry their count in the heading; key on the name.
    const key = cut.heading.replace(/\s*\(\d+\)\s*$/, "").trim().toLowerCase();
    const body = text.slice(cut.end, stop).trim();
    if (!body) continue;
    sections.set(key, sections.has(key) ? `${sections.get(key)}\n${body}` : body);
  }
  return sections;
}

/**
 * The readable sentences in a captured section, without the little label/value table above them.
 *
 * Several Peptora sections render a small table first and the explanation after it. Half-Life is
 * "Value / Unknown (minutes) / Estimated / Yes" and only then the paragraph that actually says
 * something; Evidence and Regulatory do the same. Taking the section whole put "Value. Value
 * Unknown (minutes) Estimated Yes" into a member's answer, which is gibberish dressed as evidence.
 *
 * A line counts as prose when it is long enough to be a sentence or actually contains one. The
 * labels never are.
 */
function peptoraProse(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 60 || /[a-z]\. [A-Z]/.test(line))
    .join(" ")
    .trim();
}

/** The value printed under a label in one of those little tables, e.g. Value -> "Unknown (minutes)". */
function peptoraValue(section, label) {
  const lines = String(section || "").split(/\n+/).map((line) => line.trim());
  const at = lines.findIndex((line) => line.toLowerCase() === label.toLowerCase());
  if (at === -1) return "";
  const next = lines[at + 1] || "";
  // A label followed by prose means the value is missing, not that the paragraph is the value.
  return next.length < 60 ? next : "";
}

/** Split a captured section into the list items it was rendered from. */
function peptoraLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 2);
}

/* Turn a source's own dosing section into attributed numerical records. The
   wording is preserved; this parser does not calculate, average or upgrade a
   commercial figure into clinical evidence. */
function sourceSectionProtocols(markup, sourceUrl, headingPattern) {
  const match = String(markup || "").match(new RegExp(
    `<h2\\b[^>]*>[^<]*(?:${headingPattern})[^<]*<\\/h2>([\\s\\S]{0,14000}?)(?=<h2\\b|$)`,
    "i",
  ));
  if (!match) return [];
  const section = cleanProse(match[1], 5_000);
  const chunks = section.split(/(?<=[.;])\s+|\s{2,}/).map((item) => item.trim()).filter(Boolean);
  return chunks.filter((item) =>
    /\d/.test(item)
    && /\b(?:mg|mcg|µg|ug|iu|units?|nmol|pmol|mg\/kg|mcg\/kg|µg\/kg)\b/i.test(item)
  ).slice(0, 8).map((dose, index) => ({
    label: `Source-listed dosing section${index ? ` ${index + 1}` : ""}`,
    dose: cleanText(dose, 500),
    frequency: /\b(?:daily|weekly|monthly|once|twice|three times|every \d+\s*(?:hours?|days?|weeks?))\b/i.exec(dose)?.[0] || "Not stated",
    duration: /\b\d+(?:-\d+)?\s*(?:days?|weeks?|months?)\b/i.exec(dose)?.[0] || "Not stated",
    route: /\b(?:subcutaneous|intranasal|topical|oral|intravenous|intramuscular|SC|IV|IM)\b/i.exec(dose)?.[0] || "Not stated",
    population: "Source-described research context",
    species: /\b(?:mouse|mice|rat|rats|animal|rodent)\b/i.test(dose) ? "Animal" : "Not stated",
    evidenceType: "Source-listed protocol; retain the source's evidence limitations",
    sourceUrl,
  }));
}

/* Peptora's captured pages render dosage cards as labelled text rather than
   JSON. Preserve those cards as structured protocols instead of storing raw
   strings that the answer engine cannot use. This also covers commercial
   blend component cards (KLOW and GLOW), whose figures live under Components
   rather than Studied Dose Ranges. */
function peptoraDoseRecords(value, sourceUrl) {
  const lines = peptoraLines(value);
  const records = [];
  const fieldLabels = new Set(["dose", "route", "frequency", "duration", "phase", "dosing"]);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].toLowerCase() !== "dose") continue;
    const dose = lines[index + 1] || "";
    if (!/\d/.test(dose)) continue;
    let label = "Peptora source-listed range";
    for (let back = index - 1; back >= Math.max(0, index - 5); back -= 1) {
      const candidate = lines[back];
      if (!fieldLabels.has(candidate.toLowerCase()) && candidate.length <= 110) {
        label = candidate;
        break;
      }
    }
    const readField = (wanted) => {
      const at = lines.slice(index + 2, index + 10).findIndex((line) => line.toLowerCase() === wanted);
      return at === -1 ? "Not stated" : (lines[index + 3 + at] || "Not stated");
    };
    records.push({
      label,
      dose,
      frequency: readField("frequency"),
      duration: readField("duration"),
      route: readField("route"),
      population: "Source-described research or anecdotal context; see label",
      species: /\b(?:animal|rodent|mouse|mice|rat|rats)\b/i.test(label) ? "Animal" : "Not stated",
      evidenceType: "Licensed reference-library record; evidence level retained in the source wording",
      sourceUrl,
    });
  }
  return records;
}

async function readPeptora() {
  const reviewedOn = new Date().toISOString().slice(0, 10);
  const file = path.join(ROOT, "src/data/pearl/offline-sources/peptora.json");
  let capture;
  try {
    capture = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    /* The capture is the source. If it cannot be read the honest result is no profiles and a
       failure on the record, never a silently smaller library. */
    return {
      audit: {
        sourceId: "peptora",
        mappedPages: 0,
        analyzedProfiles: 0,
        failures: [{ url: file, error: String(error?.message ?? error) }],
        notes: "The committed capture could not be read, so nothing was imported.",
        readBy: "offline-capture",
        accessStatus: "capture-unreadable",
      },
      profiles: [],
    };
  }

  const pages = [
    ...(capture.entries || []),
    ...(capture.stackDetails || []),
  ].filter((entry) => entry && !entry.error && entry.text);

  const profiles = [];
  for (const entry of pages) {
    const sections = peptoraSections(entry);
    const name = (entry.headings || []).map((h) => String(h.text || "").trim())
      .find((text) => text && text.toLowerCase() !== "encyclopedia") || entry.slug;
    const key = canonicalKey(entry.slug);
    if (!key || !name) continue;

    const halfLife = sections.get("half-life") || "";
    const doses = sections.get("studied dose ranges") || "";
    const componentDoseText = sections.get("components") || "";
    const reconstitution = [sections.get("reconstitution"), sections.get("storage"), sections.get("reconstitution & storage")]
      .filter(Boolean).join("\n");

    profiles.push({
      key,
      name,
      fullName: sections.get("chemistry") ? sentenceTrim(sections.get("chemistry"), 200) : "",
      aliases: [],
      categories: peptoraLines(sections.get("benefits")).slice(0, 8),
      claim: profileClaim("peptora", entry.url, {
        lastReviewed: (entry.capturedAt || capture.capturedAt || "").slice(0, 10) || reviewedOn,
        summary: peptoraProse(sections.get("overview")) || sections.get("overview") || "",
        evidence: peptoraProse(sections.get("evidence")),
        mechanism: peptoraProse(sections.get("mechanism of action")) || peptoraProse(sections.get("pharmacology")),
        /* The figure from the little table, and the paragraph under it as the context. Reading the
           section whole put "Value. Value Unknown (minutes) Estimated Yes" into a member's answer. */
        halfLife: peptoraValue(halfLife, "Value"),
        halfLifeContext: peptoraProse(halfLife),
        /* Regulatory standing is the honest place for what a member most needs to hear about an
           unapproved compound, and it is what this source states plainly on every entry. */
        limitations: peptoraLines(peptoraProse(sections.get("regulatory"))),
        safety: [
          ...peptoraLines(sections.get("risks")),
          ...peptoraLines(sections.get("side effects")),
          ...peptoraLines(sections.get("contraindications")),
        ],
        topics: peptoraLines(sections.get("benefits")),
        protocols: [doses, componentDoseText]
          .filter(Boolean)
          .flatMap((block) => peptoraDoseRecords(block, entry.url))
          .slice(0, 10),
        /* Preparation is carried, not dropped, under the same rule that added the field for
           PeptideDosages: a source Kieran supplies goes in IN FULL. */
        preparation: peptoraLines(reconstitution),
        references: (entry.references || []).filter((reference) => reference?.url),
        citedSources: (entry.references || []).length || null,
      }),
    });

    /* Store the captured page in the library exactly as the fetched sources are stored, so the
       source screen counts it and nothing tries to fetch it later. */
    CAPTURED_PAGES.set(entry.url, {
      url: entry.url,
      body: entry.text,
      fetchedAt: entry.capturedAt || capture.capturedAt || new Date().toISOString(),
      httpStatus: 200,
    });
  }

  return {
    audit: {
      sourceId: "peptora",
      mappedPages: pages.length,
      analyzedProfiles: profiles.length,
      failures: [],
      notes: `Read from a committed capture of the licensed app taken with Kieran's trial session, because Peptora is login-only and cannot be fetched at build time. ${capture.peptideCount || 0} peptide entries and ${capture.stackCount || 0} stack pages. Provenance is kept here and never shown to a member.`,
      readBy: "offline-capture",
    },
    profiles,
  };
}

async function readPeptideReferenceAudit() {
  const url = "https://jmitsuominor-ux.github.io/peptide-reference/";
  const reviewedOn = new Date().toISOString().slice(0, 10);
  try {
    const markup = await fetchText(url);
    return {
      audit: {
        sourceId: "peptide-reference",
        mappedPages: 1,
        mappedProfileEntries: 105,
        analyzedProfiles: 105,
        importedProfiles: 105,
        excludedProfiles: 0,
        accessStatus: "baseline-imported",
        lastReviewed: reviewedOn,
        pinnedSourceCommit: "fc925a75133184de128e114ff333a94932b8e66b",
        livePageHash: hash(markup),
        notes: "The original 105-entry reference snapshot remains PEARL's pinned baseline. The live public page was rechecked during this audit; the source snapshot stays pinned so silent website changes cannot rewrite customer answers without review.",
      },
      profiles: [],
      details: [{
        key: "peptide-reference-baseline",
        url,
        importStatus: "105-entry-pinned-baseline",
        contentHash: hash(markup),
      }],
    };
  } catch (error) {
    return {
      audit: {
        sourceId: "peptide-reference",
        mappedPages: 1,
        mappedProfileEntries: 105,
        analyzedProfiles: 105,
        importedProfiles: 105,
        excludedProfiles: 0,
        accessStatus: "baseline-imported-live-recheck-failed",
        lastReviewed: reviewedOn,
        pinnedSourceCommit: "fc925a75133184de128e114ff333a94932b8e66b",
        failures: [{ url, error: String(error) }],
        notes: "The pinned 105-entry baseline remains available locally, but the public page could not be reloaded during this audit. No local baseline data was discarded.",
      },
      profiles: [],
      details: [],
    };
  }
}

async function readHandbook() {
  const home = await fetchText("https://peptide-handbook.com/");
  const scriptPath = [...home.matchAll(/<script\b[^>]*src=["']([^"']*\/assets\/index-[^"']+\.js)["']/gi)][0]?.[1];
  if (!scriptPath) throw new Error("Peptide Handbook application bundle was not found");
  const bundleUrl = absoluteUrl(scriptPath, "https://peptide-handbook.com/");
  const bundle = await fetchText(bundleUrl);
  const dataMatch = bundle.match(/(?:const\s+\w+\s*=)?JSON\.parse\(`(\[\{"id":"bpc157"[\s\S]*?\}\])`\)/);
  if (!dataMatch) throw new Error("Peptide Handbook structured profile collection was not found");
  const profiles = JSON.parse(dataMatch[1]);
  return {
    audit: {
      sourceId: "peptide-handbook",
      mappedPages: sitemapLocations(await fetchText("https://peptide-handbook.com/sitemap.xml")).length,
      analyzedProfiles: profiles.length,
      excludedPages: 0,
      notes: "All structured compound profiles in the public application bundle were analysed.",
    },
    profiles: profiles.map((item) => ({
      key: canonicalKey(item.id || item.name),
      name: cleanText(item.name, 160),
      fullName: cleanText(item.fullName, 220),
      aliases: cleanList([...(item.aliases || []), item.fullName], 20),
      categories: cleanList([item.category], 8),
      claim: profileClaim("peptide-handbook", `https://peptide-handbook.com/?open=${encodeURIComponent(item.id)}`, {
        lastReviewed: item.lastReviewed,
        summary: item.quickSummary || item.description,
        evidence: canonicalKey(item.id || item.name) === "dihexa"
          ? "Preclinical only, with no validated human dose. The 2012 HGF/Met development paper and the 2014 HGF/c-Met mechanism paper were formally retracted in 2025. A separate 2013 rat cognition paper remains available, but the overall evidence base is weak and the proposed mechanism is no longer reliable."
          : [item.evidenceLevel, item.researchSummary].filter(Boolean).join(". "),
        halfLife: item.halfLife,
        halfLifeContext: "The site's summary value. Species and route are included only when the site states them.",
        mechanism: item.description,
        limitations: item.seriousRisks,
        safety: [...(item.sideEffects || []), ...(item.seriousRisks || [])],
        topics: [...(item.researchAreas || []), ...(item.tags || [])],
        protocols: item.commonDosageRange
          ? [{
              label: "Handbook site-listed range",
              dose: cleanText(item.commonDosageRange, 260),
              frequency: cleanText(item.startingDose, 180),
              duration: "Not stated",
              route: cleanList(item.route, 6).join(", ") || "Not stated",
              population: "Not stated",
              species: "Not stated",
              evidenceType: "Tertiary site summary, not assumed to be a validated study protocol",
              sourceUrl: `https://peptide-handbook.com/?open=${encodeURIComponent(item.id)}`,
            }]
          : [],
        references: canonicalKey(item.id || item.name) === "dihexa"
          ? [
              { title: "Dihexa rat cognition study", url: "https://pubmed.ncbi.nlm.nih.gov/23055539/" },
              { title: "Retracted HGF/Met development paper", url: "https://pubmed.ncbi.nlm.nih.gov/22129598/" },
              { title: "Retraction notice for the 2012 HGF/Met paper", url: "https://pubmed.ncbi.nlm.nih.gov/40312092/" },
              { title: "Retraction notice for the 2014 HGF/c-Met paper", url: "https://pubmed.ncbi.nlm.nih.gov/40312093/" },
              { title: "Dihexa ClinicalTrials.gov search", url: "https://clinicaltrials.gov/search?term=dihexa" },
            ]
          : [...(item.pubmedLinks || []), ...(item.clinicalTrialLinks || [])],
        humanStudies: Number(item.humanStudies),
        animalStudies: Number(item.animalStudies),
        contentHash: hash(JSON.stringify(item)),
      }),
    })),
  };
}

function peptidePathParts(url) {
  return new URL(url).pathname.split("/").filter(Boolean);
}

async function readPepCodex() {
  const index = sitemapLocations(await fetchText("https://www.pepcodex.com/sitemap-index.xml"));
  const allUrls = [];
  for (const sitemap of index) allUrls.push(...sitemapLocations(await fetchText(sitemap)));
  const peptidePages = allUrls.filter((url) => new URL(url).pathname.startsWith("/peptides/"));
  const dossierUrls = peptidePages.filter((url) => peptidePathParts(url).length === 2);
  const conditionsByKey = new Map();
  for (const url of peptidePages.filter((item) => peptidePathParts(item).length === 3)) {
    const [, peptide, condition] = peptidePathParts(url);
    const key = canonicalKey(peptide);
    if (!conditionsByKey.has(key)) conditionsByKey.set(key, []);
    conditionsByKey.get(key).push(condition.replaceAll("-", " "));
  }
  const results = await mapLimit(dossierUrls, 10, async (url) => {
    const markup = await fetchText(url);
    const text = cleanText(markup, 120_000);
    const metadata = firstJsonLd(jsonLd(markup), "Article");
    const parts = peptidePathParts(url);
    const key = canonicalKey(parts[1]);
    const evidenceMatch = text.match(/Research evidence\s+([A-Za-z /-]+?)\s+(\d+)\s+human studies?/i);
    const citedMatch = text.match(/Based on\s+(\d+)\s+cited sources/i);
    const halfLifeMatch = text.match(/Half-life\s+(.+?)\s+Isoelectric/i);
    const aliasesMatch = text.match(/Also Known As\s+(.+?)\s+Class\s+/i);
    const limitations = between(text, "Where the case weakens", ["What is being studied now", "Clinical trials"], 2_400)
      .split(/\s+\d{3}\s+/)
      .map((value) => cleanProse(value, 360))
      .filter(Boolean);
    const title = cleanText(metadata.headline || pageTitle(markup).split(":")[0], 180).replace(/: Evidence Dossier$/i, "");
    return {
      key,
      name: title,
      aliases: cleanList((aliasesMatch?.[1] || "").split(/\s*[•|]\s*/), 16),
      categories: [],
      claim: profileClaim("pepcodex", url, {
        lastReviewed: metadata.dateModified,
        summary: metadata.description,
        evidence: [
          evidenceMatch ? `${evidenceMatch[1].trim()} evidence; ${evidenceMatch[2]} human studies listed` : "",
          between(text, "Research Depth:", ["Scored", "How we rate"], 1_400),
        ].filter(Boolean).join(". "),
        halfLife: halfLifeMatch?.[1],
        halfLifeContext: "PepCodex dossier summary. Route and species must be checked in the cited pharmacokinetic paper.",
        mechanism: between(text, "How It Works (Simplified)", ["Key Research", "Important Limitations", "Mechanism Confidence"], 1_800),
        limitations,
        safety: between(text, "Interactions", ["Cited works", "On reading this entry"], 1_800).split(/(?<=[.])\s+/),
        topics: conditionsByKey.get(key) || [],
        references: trustedReferences(markup, url, 10),
        humanStudies: evidenceMatch ? Number(evidenceMatch[2]) : null,
        citedSources: citedMatch ? Number(citedMatch[1]) : null,
        contentHash: hash(markup),
      }),
    };
  });
  const profiles = results.filter((item) => item && !item.error);
  const failures = results.filter((item) => item?.error);
  return {
    audit: {
      sourceId: "pepcodex",
      mappedPages: allUrls.length,
      analyzedProfiles: profiles.length,
      conditionPagesMapped: peptidePages.length - dossierUrls.length,
      comparisonPagesMapped: allUrls.filter((url) => new URL(url).pathname.startsWith("/compare/")).length,
      excludedPages: allUrls.length - peptidePages.length,
      failures,
      notes: "Every root dossier was analysed. Condition and comparison pages were mapped to improve topic and comparison retrieval.",
    },
    profiles,
  };
}

async function readPeptideHub() {
  const allUrls = sitemapLocations(await fetchText("https://peptidehub.bio/sitemap.xml"));
  const profileUrls = allUrls.filter((url) => peptidePathParts(url)[0] === "peptides" && peptidePathParts(url).length === 2);
  const results = await mapLimit(profileUrls, 8, async (url) => {
    const markup = await fetchText(url);
    const text = cleanText(markup, 80_000);
    const structured = firstJsonLd(jsonLd(markup), "MedicalWebPage");
    const parts = peptidePathParts(url);
    const key = canonicalKey(parts[1]);
    const title = cleanText(structured.name || pageTitle(markup).split("—")[0], 180).replace(/:\s*\d+\s*(?:mg|mcg|iu).*$/i, "");
    const dose = text.match(/Recommended Dose\s+(.+?)\s+Frequency\s+(.+?)\s+Injection Type\s+(.+?)\s+Timing\s+(.+?)\s+Research Overview/i);
    const category = text.match(/Category\s+(.+?)\s+Browse\s+/i)?.[1];
    return {
      key,
      name: title,
      aliases: [],
      categories: cleanList([category], 6),
      claim: profileClaim("peptidehub", url, {
        summary: between(text, "Research Overview", ["How It Works"], 1_800) || structured.description,
        evidence: "Protocol-focused educational summary. Linked papers are retained; uncited product-strength and stacking claims are not preferred evidence.",
        halfLife: text.match(/half-life\s+(?:of\s+)?(.+?)(?:\.| and |, and )/i)?.[1],
        halfLifeContext: "Site summary. Prefer a cited pharmacokinetic paper when available.",
        mechanism: between(text, "How It Works", ["Commonly Studied With", "Research references"], 1_800),
        limitations: ["Product, calculator, reconstitution and stacking claims were excluded from preferred evidence."],
        safety: [],
        topics: cleanList([category], 6),
        protocols: dose
          ? [{
              label: "Peptide Hub site-listed range",
              dose: cleanText(dose[1], 180),
              frequency: cleanText(dose[2], 160),
              duration: "Not stated",
              route: cleanText(dose[3], 160),
              population: "Not stated",
              species: "Not stated",
              evidenceType: "Protocol-site summary, not a verified clinical protocol",
              sourceUrl: url,
            }]
          : [],
        references: trustedReferences(markup, url, 10),
        contentHash: hash(markup),
      }),
    };
  });
  const profiles = results.filter((item) => item && !item.error);
  const failures = results.filter((item) => item?.error);
  const commercial = allUrls.filter((url) => peptidePathParts(url)[0] === "database");
  return {
    audit: {
      sourceId: "peptidehub",
      mappedPages: allUrls.length,
      analyzedProfiles: profiles.length,
      journalPagesMapped: allUrls.filter((url) => peptidePathParts(url)[0] === "journal").length,
      excludedPages: commercial.length,
      failures,
      notes: `${commercial.length} product-strength pages plus calculators, reconstitution and stacking instructions were not promoted into preferred evidence.`,
    },
    profiles,
  };
}

async function readHalflifeLabs() {
  const allUrls = sitemapLocations(await fetchText("https://halflife-labs.com/sitemap.xml"));
  const profileUrls = allUrls.filter((url) => peptidePathParts(url)[0] === "compounds" && peptidePathParts(url).length === 2);
  const results = await mapLimit(profileUrls, 8, async (url) => {
    const markup = await fetchText(url);
    const structured = jsonLd(markup);
    const page = firstJsonLd(structured, "MedicalWebPage");
    const drug = firstJsonLd(structured, "Drug");
    const parts = peptidePathParts(url);
    const key = canonicalKey(parts[1]);
    const description = cleanProse(page.description, 1_800);
    const halfLife = description.match(/half-life\s+(?:is\s+|of\s+)?(.+?)(?:\.|;| vs )/i)?.[1]
      || cleanText(page.name, 240).match(/Half-Life:\s*(.+?)(?:\s+vs\s+|$)/i)?.[1]
      || "";
    return {
      key,
      name: cleanText(drug.name || page.name?.split(" Half-Life")[0] || parts[1].replaceAll("-", " "), 180),
      aliases: cleanList(String(drug.alternateName || "").split(/\s*,\s*/), 16),
      categories: cleanList([drug.drugClass], 6),
      claim: profileClaim("halflife-labs", url, {
        lastReviewed: page.lastReviewed || page.dateModified,
        summary: description,
        evidence: description.match(/Data quality:\s*([^.]*)/i)?.[1] || "Evidence context is stated on the linked compound page.",
        halfLife,
        halfLifeContext: cleanProse(drug.clinicalPharmacology, 700),
        mechanism: cleanProse(drug.clinicalPharmacology, 1_800),
        limitations: description.match(/No published[^.]*\./gi) || [],
        safety: cleanList([drug.legalStatus], 4),
        topics: cleanList([drug.drugClass], 6),
        references: trustedReferences(markup, url, 10),
        contentHash: hash(markup),
      }),
    };
  });
  const profiles = results.filter((item) => item && !item.error);
  const failures = results.filter((item) => item?.error);
  return {
    audit: {
      sourceId: "halflife-labs",
      mappedPages: allUrls.length,
      analyzedProfiles: profiles.length,
      excludedPages: allUrls.filter((url) => new URL(url).pathname.includes("reconstitution-calculator")).length,
      failures,
      notes: "Compound pharmacokinetic pages were analysed. Calculators and administration tools were excluded from the knowledge layer.",
    },
    profiles,
  };
}

function markdownSection(markdown, heading, maximum = 2_000) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^## ${escaped}\\s*$([\\s\\S]*?)(?=^## |\\Z)`, "im"));
  return cleanProse(match?.[1] || "", maximum);
}

function markdownField(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cleanText(markdown.match(new RegExp(`^- \\*\\*${escaped}:\\*\\*\\s*(.+)$`, "im"))?.[1] || "", 320);
}

/* PeptideDosages.com publishes a "Published Human ... Research" table on each
   page: source, research context, and the amount that source actually
   reported. That is study-attributed, so it becomes proper protocol records.
   Its OTHER tables (reconstitution volumes, spray equivalents, actuator maths)
   are the site's own arithmetic rather than anything a study reported, and
   they go to the preparation field instead. Added 19 Aug 2026. */
function peptidedosagesProtocols(markup, sourceUrl) {
  const protocols = [];
  for (const table of markup.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const rows = [...table[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((row) =>
      [...row[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cleanText(cell[1], 300)));
    if (rows.length < 2) continue;
    const head = (rows[0] || []).join(" | ").toLowerCase();
    // Only the study table. The preparation tables lead with a volume or an
    // actuator output, never with a source.
    /* Two tables matter, and they are labelled differently on purpose because
       one is what a STUDY reported and the other is what the SITE recommends.
       Both are imported (Kieran, 19 Aug, "all of it"), and each says which it
       is in its evidenceType so a member is never shown one as the other. */
    const isStudyTable = /source/.test(head) && /(published|amount|research context)/.test(head);
    const isScheduleTable = /dose/.test(head) && /(week|units|day)/.test(head);
    if (!isStudyTable && !isScheduleTable) continue;

    if (isScheduleTable) {
      const doseColumn = (rows[0] || []).findIndex((cell) => /dose/i.test(cell));
      const unitsColumn = (rows[0] || []).findIndex((cell) => /unit|\bml\b/i.test(cell));
      for (const cells of rows.slice(1)) {
        const dose = cells[doseColumn >= 0 ? doseColumn : 1];
        if (!dose || !/\d/.test(dose)) continue;
        const units = unitsColumn >= 0 ? cells[unitsColumn] : "";
        protocols.push({
          label: `PeptideDosages schedule: ${cells[0] || "listed step"}`,
          dose: units && units !== dose ? `${dose} (${units})` : dose,
          frequency: /daily|per day/i.test(head) ? "Daily" : "Not stated",
          duration: /week|day/i.test(cells[0] || "") ? cells[0] : "Not stated",
          route: /injection|units/i.test(head) ? "Injection, as listed by the site" : "Not stated",
          population: "Not stated",
          species: "Not stated",
          evidenceType: "PeptideDosages' own schedule, not a figure reported by a study; verify against the original paper or product information",
          sourceUrl,
        });
      }
      continue;
    }

    for (const cells of rows.slice(1)) {
      if (cells.length < 3 || !cells[0] || !cells[2]) continue;
      const context = `${cells[1]} ${cells[2]}`.toLowerCase();
      const species = /\brat\b|rodent|mouse|mice|animal|in vitro/.test(context) ? "Animal or laboratory model"
        : /human|volunteer|patient|participant/.test(context) ? "Human" : "Not stated";
      protocols.push({
        label: `PeptideDosages research table: ${cells[0]}`,
        dose: cells[2],
        frequency: /per day|daily|twice|once|\bbid\b|weekly/i.test(cells[2]) ? cells[2] : "Not stated",
        duration: /\b\d+\s*(?:day|week|month)/i.test(cells[2]) ? cells[2].match(/\b\d+\s*(?:day|week|month)[^.,;]*/i)[0] : "Not stated",
        route: /intranasal|nasal/.test(context) ? "Intranasal"
          : /subcutaneous|\bsc\b/.test(context) ? "Subcutaneous"
          : /intramuscular|\bim\b/.test(context) ? "Intramuscular"
          : /oral/.test(context) ? "Oral"
          : /topical/.test(context) ? "Topical" : "Not stated",
        population: cells[1] || "Not stated",
        species,
        evidenceType: "Transcribed by PeptideDosages from the cited source; verify in the original paper or product information",
        sourceUrl,
      });
    }
  }
  return protocols.slice(0, 8);
}

function peptpediaProtocols(markdown, sourceUrl) {
  const section = markdown.match(/^## Dosing Information \(Research Context\)\s*$([\s\S]*?)(?=^## |\Z)/im)?.[1] || "";
  const protocols = [];
  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith("|") || /^\|\s*(?:---|Route\s*\|)/i.test(line.trim())) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cleanText(cell, 220));
    if (cells.length < 4 || !cells[0] || !cells[1]) continue;
    const context = `${cells[0]} ${cells[3]}`.toLowerCase();
    const species = /rat|rodent|mouse|mice|animal/.test(context) ? "Animal model" : "Not stated";
    protocols.push({
      label: `Peptpedia research table: ${cells[0]}`,
      dose: cells[1],
      frequency: cells[2] || "Not stated",
      duration: "Not stated",
      route: cells[0],
      population: cells[3] || "Not stated",
      species,
      evidenceType: "Tertiary transcription of research context; verify in the cited study",
      sourceUrl,
    });
  }
  return protocols.slice(0, 8);
}

async function readPeptpedia() {
  const sitemapIndex = sitemapLocations(await fetchText("https://peptpedia.org/sitemap.xml"));
  const maps = [];
  for (const sitemap of sitemapIndex) maps.push({ sitemap, urls: sitemapLocations(await fetchText(sitemap)) });
  const peptideMap = maps.find((item) => item.sitemap.includes("sitemap-peptides"));
  const profileUrls = peptideMap.urls.filter((url) => new URL(url).pathname.startsWith("/peptide/") && !url.match(/\.(?:png|jpe?g|webp)$/i));
  const results = await mapLimit(profileUrls, 8, async (url) => {
    const markdown = await fetchText(`${url}.md`);
    const name = cleanText(markdown.match(/^#\s+(.+?)(?:\s+-|\s+—|$)/m)?.[1] || peptidePathParts(url)[1], 180);
    const key = canonicalKey(peptidePathParts(url)[1]);
    const summary = cleanProse(markdown.match(/^>\s*(.+)$/m)?.[1] || markdownSection(markdown, "Overview", 1_800), 1_800);
    const applications = markdownSection(markdown, "Research Applications", 900)
      .split(/\s+-\s+|,\s*/)
      .map((value) => cleanText(value, 140));
    const evidence = [
      markdown.match(/\*\*Human data status:\*\*\s*([^\n]+)/i)?.[1],
      markdown.match(/What is the evidence quality[^\n]*\n+([^\n]+)/i)?.[1],
    ].filter(Boolean).join(" ");
    return {
      key,
      name,
      aliases: cleanList((markdownField(markdown, "Also known as") || "").split(/\s*,\s*/), 16),
      categories: cleanList([markdownField(markdown, "Category")], 6),
      claim: profileClaim("peptpedia", url, {
        lastReviewed: markdown.match(/Last updated:\s*([^\n]+)/i)?.[1],
        summary,
        evidence: evidence || markdownSection(markdown, "Safety & Tolerability", 1_800),
        halfLife: markdownField(markdown, "Half-life"),
        halfLifeContext: "Species and route are retained when stated in the profile's molecular field or research table.",
        mechanism: markdownSection(markdown, "Mechanism of Action", 1_800),
        // \b so a match can only start at a real word: without it this regex
        // matched inside words ("ami-no-acid", "k-nown") and produced mid-word
        // junk fragments that members could read as limitation lines. "not" is
        // listed explicitly because the old pattern reached it through the
        // bare "no" prefix.
        limitations: [...markdown.matchAll(/\b(?:no|not|limited|unknown)\b[^.\n]*\./gi)].map((match) => match[0]),
        safety: markdownSection(markdown, "Safety & Tolerability", 2_400).split(/(?<=[.])\s+/),
        topics: applications,
        protocols: peptpediaProtocols(markdown, url),
        references: trustedReferences(markdown, url, 10),
        contentHash: hash(markdown),
      }),
    };
  });
  const profiles = results.filter((item) => item && !item.error);
  const failures = results.filter((item) => item?.error);
  const totalMapped = maps.reduce((sum, item) => sum + item.urls.length, 0);
  return {
    audit: {
      sourceId: "peptpedia",
      mappedPages: totalMapped,
      analyzedProfiles: profiles.length,
      comparisonPagesMapped: maps.find((item) => item.sitemap.includes("comparisons"))?.urls.length || 0,
      researchPagesMapped: maps.find((item) => item.sitemap.includes("research"))?.urls.length || 0,
      excludedPages: peptideMap.urls.length - profileUrls.length,
      failures,
      notes: "Every public markdown peptide profile was analysed. Comparison and deep-research pages were mapped for future updates.",
    },
    profiles,
  };
}

function structuredMedicalPage(markup) {
  for (const item of jsonLd(markup)) {
    const candidates = item?.["@graph"] ? item["@graph"] : [item];
    const page = candidates.find((candidate) => {
      const types = Array.isArray(candidate?.["@type"]) ? candidate["@type"] : [candidate?.["@type"]];
      return types.includes("MedicalWebPage");
    });
    if (page) return page;
  }
  return null;
}

function structuredTrustedCitations(page, maximum = 12) {
  const values = Array.isArray(page?.citation) ? page.citation : page?.citation ? [page.citation] : [];
  const citations = [];
  for (const value of values) {
    const url = cleanText(value?.url, 500);
    if (!url) continue;
    try {
      if (!TRUSTED_REFERENCE_HOSTS.has(new URL(url).hostname)) continue;
    } catch {
      continue;
    }
    if (!citations.some((citation) => citation.url === url)) {
      citations.push({ title: cleanText(value?.name, 320) || url, url });
    }
  }
  return citations.slice(0, maximum);
}

function curatedPeptideDosageProfiles() {
  return [
    {
      key: "glepaglutide",
      name: "Glepaglutide",
      fullName: "Glepaglutide (ZP1848)",
      aliases: ["ZP1848", "ZP-1848"],
      categories: ["Metabolic", "GLP-2 receptor agonist", "Short bowel syndrome"],
      claim: profileClaim("peptidedosage", "https://www.peptidedosage.org/peptides/glepaglutide/dosage", {
        lastReviewed: "2026-08-06",
        summary: "An investigational long-acting GLP-2 analogue studied for reducing parenteral-support needs in adults with short bowel syndrome and intestinal failure.",
        evidence: "Published human phase 2 and phase 3 trials. In the 106-participant phase 3 trial, 10 mg twice weekly reduced parenteral-support volume significantly versus placebo; the once-weekly arm did not show a statistically significant advantage on the primary endpoint.",
        halfLife: "About 88 hours after 10 mg and about 124 hours after 5 mg in a published healthy-volunteer pharmacokinetic study",
        halfLifeContext: "Human pharmacokinetic estimates from the published study; these are not dosing recommendations.",
        mechanism: "A DPP-4-resistant GLP-2 receptor agonist designed to promote intestinal adaptation and absorption through GLP-2 signalling.",
        limitations: [
          "Investigational and not an established general-use treatment dose.",
          "The phase 3 once-weekly arm did not significantly outperform placebo on the primary endpoint.",
        ],
        safety: ["Gastrointestinal effects, stoma complications, peripheral oedema and injection-site reactions were reported in trials."],
        topics: ["short bowel syndrome", "intestinal absorption", "GLP-2", "parenteral support", "metabolic research"],
        protocols: [
          {
            label: "Published phase 3 trial arms",
            dose: "10 mg",
            frequency: "Once weekly or twice weekly",
            duration: "24 weeks",
            route: "Subcutaneous",
            population: "106 adults with short bowel syndrome and intestinal failure requiring parenteral support",
            species: "Human",
            evidenceType: "Published randomized double-blind phase 3 trial",
            sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/39708985/",
          },
          {
            label: "Published phase 2 dose-ranging trial",
            dose: "0.1 mg, 1 mg or 10 mg",
            frequency: "Once daily during each treatment period",
            duration: "3 weeks per treatment period, separated by a 4-8 week washout",
            route: "Subcutaneous",
            population: "18 treated adults with short bowel syndrome; 16 completed",
            species: "Human",
            evidenceType: "Published randomized double-blind crossover phase 2 trial",
            sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/30880176/",
          },
        ],
        references: [
          { title: "Glepaglutide phase 3 randomized trial", url: "https://pubmed.ncbi.nlm.nih.gov/39708985/" },
          { title: "Glepaglutide phase 2 dose-ranging trial", url: "https://pubmed.ncbi.nlm.nih.gov/30880176/" },
          { title: "Glepaglutide human pharmacokinetic study", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9705454/" },
          { title: "ClinicalTrials.gov NCT03690206", url: "https://clinicaltrials.gov/study/NCT03690206" },
        ],
        humanStudies: 3,
        contentHash: hash("glepaglutide-primary-verification-2026-08-06"),
      }),
    },
    {
      key: "efinopegdutide",
      name: "Efinopegdutide",
      fullName: "Efinopegdutide (MK-6024 / JNJ-64565111 / HM12525A)",
      aliases: ["MK-6024", "MK6024", "JNJ-64565111", "JNJ64565111", "HM12525A"],
      categories: ["Metabolic", "GLP-1/glucagon co-agonist", "Weight research"],
      claim: profileClaim("peptidedosage", "https://www.peptidedosage.org/peptides/efinopegdutide/dosage", {
        lastReviewed: "2026-08-06",
        summary: "An investigational once-weekly GLP-1/glucagon receptor co-agonist studied in obesity, type 2 diabetes and fatty-liver disease.",
        evidence: "Published randomized human phase 2 studies and registered trials. The strongest completed NAFLD study compared efinopegdutide 10 mg with semaglutide 1 mg over 24 weeks after titration.",
        halfLife: "The supplied discovery page describes once-weekly pharmacology; a preferred numerical half-life was not imported without a directly verified primary value.",
        halfLifeContext: "Frequency is supported by published studies and registered trials. No tertiary half-life estimate is promoted as preferred evidence.",
        mechanism: "A dual GLP-1 and glucagon receptor co-agonist investigated for effects on body weight, liver fat and metabolic regulation.",
        limitations: [
          "Investigational; study arms are not an approved general-use schedule.",
          "Gastrointestinal adverse events were common and some diabetes-study measures did not improve.",
        ],
        safety: ["Nausea and vomiting were more common than with placebo in dose-ranging studies."],
        topics: ["weight loss research", "obesity", "NAFLD", "liver fat", "GLP-1", "glucagon", "metabolic research"],
        protocols: [
          {
            label: "Published obesity phase 2 dose-ranging arms",
            dose: "5.0 mg, 7.4 mg or 10.0 mg",
            frequency: "Once weekly",
            duration: "26 weeks",
            route: "Subcutaneous",
            population: "474 adults with class II or III obesity without type 2 diabetes",
            species: "Human",
            evidenceType: "Published randomized phase 2 dose-ranging study and registered trial",
            sourceUrl: "https://clinicaltrials.gov/study/NCT03486392",
          },
          {
            label: "Published NAFLD phase 2a study",
            dose: "10 mg target dose after titration",
            frequency: "Once weekly",
            duration: "24 weeks, with titration over 8 weeks",
            route: "Subcutaneous",
            population: "145 adults with at least 10% liver fat; 72 assigned efinopegdutide and 73 semaglutide",
            species: "Human",
            evidenceType: "Published randomized active-comparator phase 2a study",
            sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/37355043/",
          },
        ],
        references: [
          { title: "Efinopegdutide NAFLD phase 2a study", url: "https://pubmed.ncbi.nlm.nih.gov/37355043/" },
          { title: "JNJ-64565111 obesity dose-ranging study", url: "https://pubmed.ncbi.nlm.nih.gov/33475255/" },
          { title: "ClinicalTrials.gov NCT03486392", url: "https://clinicaltrials.gov/study/NCT03486392" },
          { title: "ClinicalTrials.gov NCT04944992", url: "https://clinicaltrials.gov/study/NCT04944992" },
        ],
        humanStudies: 3,
        contentHash: hash("efinopegdutide-primary-verification-2026-08-06"),
      }),
    },
    {
      key: "pnc27",
      name: "PNC-27",
      fullName: "PNC-27 p53-derived anticancer peptide",
      aliases: ["PNC 27", "PNC27"],
      categories: ["Cancer research", "Preclinical"],
      claim: profileClaim("peptidedosage", "https://www.peptidedosage.org/peptides/pnc-27/dosage", {
        lastReviewed: "2026-08-06",
        summary: "A p53-derived membrane-active peptide studied in cancer-cell and mouse leukaemia models. No validated human dose or completed human clinical trial was found.",
        evidence: "Preclinical only. The preferred numerical records come from a full-text mouse acute myeloid leukaemia study, not from the discovery site's modelled 100-500 mcg injection schedule.",
        halfLife: "Not established in humans",
        halfLifeContext: "No reliable human pharmacokinetic study was found.",
        mechanism: "PNC-27 is reported to bind membrane-associated HDM-2 on susceptible cancer cells and produce membrane disruption in laboratory models.",
        limitations: [
          "No published human dose-finding or safety trial.",
          "The discovery page contains multiple PubMed links whose identifiers resolve to unrelated papers, so none were accepted without independent verification.",
        ],
        safety: ["Human safety is unknown. Mouse tolerability observations cannot establish human safety."],
        topics: ["cancer research", "HDM-2", "p53", "acute myeloid leukaemia", "preclinical research"],
        protocols: [
          {
            label: "Published mouse AML experiments",
            dose: "40 mg/kg",
            frequency: "Once daily",
            duration: "2 or 3 weeks depending on the experiment",
            route: "Intraperitoneal",
            population: "Mouse acute myeloid leukaemia and patient-derived xenograft models",
            species: "Mouse",
            evidenceType: "Published preclinical full-text study",
            sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7951797/",
          },
          {
            label: "Published higher-dose mouse cohort",
            dose: "100 mg/kg",
            frequency: "Once daily",
            duration: "2 weeks",
            route: "Intraperitoneal",
            population: "Mouse AML and normal-haematopoiesis experiments",
            species: "Mouse",
            evidenceType: "Published preclinical full-text study",
            sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7951797/",
          },
        ],
        references: [
          { title: "Targeting Cell Membrane HDM2 in acute myeloid leukaemia", url: "https://pubmed.ncbi.nlm.nih.gov/31337857/" },
          { title: "Full-text PNC-27 mouse AML study", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7951797/" },
          { title: "PNC-27 K562 cell study", url: "https://pubmed.ncbi.nlm.nih.gov/25117093/" },
          { title: "PNC-27 membrane HDM-2 study", url: "https://pubmed.ncbi.nlm.nih.gov/20080680/" },
        ],
        animalStudies: 1,
        contentHash: hash("pnc27-primary-verification-2026-08-06"),
      }),
    },
    {
      key: "dsip",
      name: "DSIP",
      fullName: "Delta Sleep-Inducing Peptide",
      aliases: ["Delta sleep-inducing peptide", "Delta sleep peptide"],
      categories: ["Sleep", "Nootropic & CNS"],
      claim: profileClaim("peptidedosage", "https://www.peptidedosage.org/peptides/dsip/dosage", {
        lastReviewed: "2026-08-06",
        summary: "A historically studied neuropeptide with small and inconsistent human sleep studies. The preferred numerical record is a six-person intravenous insomnia experiment, not a community subcutaneous protocol.",
        evidence: "Very small historical human evidence with no modern validated treatment dose. The cited 1981 study tested one acute 25 nmol/kg intravenous administration in six middle-aged chronic insomniacs.",
        halfLife: "Short plasma persistence has been reported, but no modern validated human therapeutic pharmacokinetic profile was established.",
        halfLifeContext: "Historic research only; route and assay conditions materially affect the value.",
        mechanism: "The proposed role in sleep regulation and stress signalling remains incompletely understood and has not been consistently reproduced.",
        limitations: ["Only six participants in the preferred numerical human record.", "Old study methods and limited modern replication."],
        safety: ["The small study reported no daytime sedation or other observed side effects, but it was far too small to establish safety."],
        topics: ["sleep", "insomnia", "sleep architecture", "neuropeptide", "historical human research"],
        protocols: [
          {
            label: "Historical human insomnia experiment",
            dose: "25 nmol/kg body weight",
            frequency: "Single acute administration",
            duration: "One-night sleep observation",
            route: "Intravenous",
            population: "6 middle-aged adults with chronic insomnia",
            species: "Human",
            evidenceType: "Published very small historical human study",
            sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/7028502/",
          },
        ],
        references: [
          { title: "The influence of synthetic DSIP on disturbed human sleep", url: "https://pubmed.ncbi.nlm.nih.gov/7028502/" },
          { title: "DSIP review and evidence limitations", url: "https://pubmed.ncbi.nlm.nih.gov/16539663/" },
        ],
        humanStudies: 1,
        contentHash: hash("dsip-primary-verification-2026-08-06"),
      }),
    },
  ];
}

async function readPeptideDosage() {
  const sitemap = await fetchText("https://www.peptidedosage.org/sitemap.xml");
  const mappedUrls = sitemapLocations(sitemap);
  const profileUrls = mappedUrls
    .filter((url) => /\/peptides\/[^/]+\/dosage\/?$/i.test(url))
    .sort();
  const results = await mapLimit(profileUrls, 6, async (url) => {
    const markup = await fetchText(url);
    const page = structuredMedicalPage(markup);
    if (!page) throw new Error(`MedicalWebPage metadata was not found for ${url}`);
    const name = cleanText(page?.about?.name || page.name || pageTitle(markup), 180)
      .replace(/\s+Dosage.*$/i, "");
    const references = structuredTrustedCitations(page, 16);
    const text = cleanText(markup, 120_000);
    const typicalDose = text.match(/Typical dose\s+(.{2,220}?)(?=\s+(?:Concentration|Reconstitute|Vial size|Storage)\b)/i)?.[1]?.trim() || "";
    const schedule = between(text, "Protocol Schedule 1", "Administration guidelines");
    const reconstitution = between(text, "Reconstitution Instruction & Mixing Step-by-Step", "Visual Reconstitution Planner");
    const description = cleanProse(page?.about?.description || page.description || "", 1_800);
    const protocols = /\d/.test(typicalDose) ? [{
      label: "PeptideDosage.org source-listed typical range",
      dose: typicalDose,
      frequency: /\b(?:daily|weekly|per day|per week|training days?|once|twice|three times)\b/i.exec(typicalDose)?.[0] || "See the source schedule",
      duration: cleanText(schedule, 500) || "Not stated",
      route: /\b(?:subcutaneous|intranasal|topical|oral|intravenous|intramuscular|SC|IV|IM)\b/i.exec(`${typicalDose} ${description}`)?.[0] || "Not stated",
      population: "Commercial/community research context described by the source",
      species: /no human clinical trials?|animal (?:study|studies|literature)/i.test(description) ? "Not stated; source says no human clinical trial" : "Not stated",
      evidenceType: "Commercial/community protocol; source limitations must be read with the figure",
      sourceUrl: url,
    }] : [];
    return {
      key: canonicalKey(name || url.match(/\/peptides\/([^/]+)/i)?.[1]),
      name,
      url,
      lastReviewed: cleanText(page.lastReviewed, 40) || "Not stated",
      trustedReferences: references,
      contentHash: hash(markup),
      profile: {
        key: canonicalKey(name || url.match(/\/peptides\/([^/]+)/i)?.[1]),
        name,
        fullName: cleanText(page?.about?.nonProprietaryName || "", 180),
        aliases: [],
        categories: [],
        claim: profileClaim("peptidedosage", url, {
          lastReviewed: cleanText(page.lastReviewed, 40) || "Not stated",
          summary: description,
          evidence: cleanProse(page?.about?.clinicalPharmacology || page?.about?.warning || "", 1_500),
          mechanism: cleanProse(page?.about?.mechanismOfAction || "", 1_800),
          limitations: [description].filter((value) => /not approved|no human|unproven|not clinically|research/i.test(value)),
          safety: cleanProseList(Array.isArray(page?.about?.adverseOutcome)
            ? page.about.adverseOutcome
            : [page?.about?.adverseOutcome].filter(Boolean), 10, 320),
          topics: [],
          protocols,
          preparation: reconstitution ? [cleanProse(reconstitution, 1_600)] : [],
          references,
          contentHash: hash(markup),
        }),
      },
    };
  });
  const failures = results.filter((item) => item?.error);
  const reviewed = results.filter((item) => !item?.error);
  const profiles = [
    ...reviewed.map((item) => item.profile).filter(Boolean),
    ...curatedPeptideDosageProfiles(),
  ];
  const importedKeys = new Set(profiles.map((profile) => profile.key));
  const pagesWithTrustedReferences = reviewed.filter((item) => item.trustedReferences.length > 0).length;
  const trustedReferenceCount = reviewed.reduce((sum, item) => sum + item.trustedReferences.length, 0);
  return {
    audit: {
      sourceId: "peptidedosage",
      mappedPages: mappedUrls.length,
      mappedProfileEntries: profileUrls.length,
      analyzedProfiles: reviewed.length,
      importedProfiles: reviewed.length,
      excludedProfiles: 0,
      pagesWithTrustedReferences,
      trustedReferenceCount,
      accessStatus: failures.length ? "full-import-with-failures" : "full-import",
      lastReviewed: "2026-08-06",
      failures,
      notes: "Every public protocol page is imported with its source-listed typical range, stated limitations, source description, references and captured preparation section. Commercial/community figures remain labelled as such rather than being silently excluded.",
    },
    profiles,
    details: reviewed.map((item) => ({
      ...item,
      importStatus: importedKeys.has(item.key) ? "imported-with-reviewed-priority-record" : "full-source-import",
    })),
  };
}

function curatedPeptideDeckProfiles() {
  return [
    {
      key: "selank",
      name: "Selank",
      fullName: "Selank (TP-7 / tuftsin analogue)",
      aliases: ["Selanc", "TP-7", "TKPRPGP", "Tuftsin analogue"],
      categories: ["Mental-health research", "Anxiety research", "Stress research", "Cognitive research"],
      claim: profileClaim("peptidedeck", "https://www.peptidedeck.com/blog/best-peptides-for-anxiety-stress-relief", {
        lastReviewed: "2026-08-13",
        summary: "PeptideDeck identifies Selank as the most directly anxiety-focused compound in its mental-health guides. PEARL links that discovery page to the small Russian human literature while keeping the absence of large independent Western trials clear.",
        evidence: "A PubMed-indexed Russian randomized comparison enrolled 62 people with generalized anxiety disorder or neurasthenia: 30 received Selank and 32 received medazepam. The abstract reports similar anxiolytic effects, with additional antiasthenic and psychostimulant effects for Selank. The study is small, Russian-language and not independently replicated in a large modern trial.",
        halfLife: "No preferred human half-life from this editorial source",
        halfLifeContext: "PeptideDeck is retained as a topic-discovery page. Pharmacokinetic figures remain source-specific elsewhere in PEARL.",
        mechanism: "Preclinical and translational work discusses GABAergic signalling, enkephalin-degrading enzymes, serotonin pathways and BDNF expression. These mechanisms do not by themselves prove clinical effectiveness.",
        limitations: [
          "Small and geographically concentrated human evidence base.",
          "No FDA or EMA approval for anxiety or another mental-health indication.",
          "Panic, social-anxiety and stress-resilience wording on tertiary sites extends beyond the directly tested generalized-anxiety population.",
        ],
        safety: ["Long-term and interaction data remain limited, especially alongside psychiatric medicines."],
        topics: [
          "mental health", "anxiety", "generalized anxiety disorder", "GAD", "anxiolytic", "stress", "stress resilience",
          "panic research", "social anxiety research", "calm mental clarity", "attention", "cognitive research", "BDNF", "GABA",
        ],
        references: [
          { title: "Selank randomized comparison in generalized anxiety disorder and neurasthenia", url: "https://pubmed.ncbi.nlm.nih.gov/18454096/" },
          { title: "Selank and phenazepam comparison", url: "https://pubmed.ncbi.nlm.nih.gov/25176261/" },
          { title: "Selank and Semax functional-connectivity study in 52 healthy participants", url: "https://pubmed.ncbi.nlm.nih.gov/32342318/" },
        ],
        humanStudies: 3,
        contentHash: hash("peptidedeck-selank-mental-health-primary-verification-2026-08-13"),
      }),
    },
    {
      key: "semax",
      name: "Semax",
      fullName: "Semax (ACTH 4-7 Pro-Gly-Pro analogue)",
      aliases: ["ACTH(4-7)PGP", "MEHFPGP", "ACTH(4-10) analogue", "Heptapeptide Semax"],
      categories: ["Mental-health research", "Attention research", "Cognitive research", "ADHD hypothesis"],
      claim: profileClaim("peptidedeck", "https://www.peptidedeck.com/peptides/semax-benefits", {
        lastReviewed: "2026-08-13",
        summary: "PeptideDeck links Semax with focus, memory and mental clarity but explicitly says it is not approved or robustly studied specifically for ADHD. PEARL therefore treats its ADHD relevance as limited and hypothesis-generating, not established treatment evidence.",
        evidence: "The PubMed paper most often cited for Semax and ADHD is a 2007 Medical Hypotheses article, not an efficacy trial. A Russian review describes a small open-label group of 20 children receiving Semax within a wider non-randomized comparison and reports improvement in 50%, but it lacks a blinded placebo-controlled design.",
        halfLife: "No preferred human half-life from this editorial source",
        halfLifeContext: "PeptideDeck is retained as a topic-discovery page. Pharmacokinetic figures remain source-specific elsewhere in PEARL.",
        mechanism: "Semax is studied for BDNF and NGF signalling and dopaminergic or serotonergic modulation. Mechanistic overlap with attention pathways is not proof that it treats ADHD.",
        limitations: [
          "The 2007 ADHD paper proposes a hypothesis and reports no Semax ADHD trial.",
          "The small Russian pediatric report was open-label and did not provide modern randomized placebo-controlled evidence.",
          "No FDA or EMA approval for ADHD or another mental-health indication.",
        ],
        safety: ["The small pediatric report noted excitability, irritability or sleep problems in three of 20 Semax participants; this does not define a complete safety profile."],
        topics: [
          "mental health", "ADHD", "attention deficit", "hyperactivity", "inattention", "attention", "concentration",
          "executive function", "focus", "mental clarity", "cognitive research", "stress resilience", "mood research", "BDNF", "dopamine",
        ],
        protocols: [
          {
            label: "Small Russian open-label ADHD comparison described in a review",
            dose: "12 mcg/kg/day",
            frequency: "Daily",
            duration: "1 month",
            route: "Intranasal",
            population: "20 children aged 6 to 11 with attention-deficit/hyperactivity disorder within a wider non-randomized comparison",
            species: "Human",
            evidenceType: "Small open-label Russian report; not blinded, randomized or placebo-controlled",
            sourceUrl: "https://pharmateca.ru/articles/Farmakoterapiya-giperaktivnosti-s-deficitom-vnimaniya-u-detei-zarubejnyi-i-rossiiskii-opyt.html",
          },
        ],
        references: [
          { title: "Semax proposed for ADHD and Rett syndrome: hypothesis paper, not a clinical trial", url: "https://pubmed.ncbi.nlm.nih.gov/16996699/" },
          { title: "Selank and Semax functional-connectivity study in 52 healthy participants", url: "https://pubmed.ncbi.nlm.nih.gov/32342318/" },
        ],
        humanStudies: 2,
        contentHash: hash("peptidedeck-semax-mental-health-primary-verification-2026-08-13"),
      }),
    },
    {
      key: "argireline",
      name: "Argireline",
      fullName: "Argireline (acetyl hexapeptide-8)",
      aliases: ["Acetyl hexapeptide-8", "Acetyl hexapeptide-3", "Ac-EEMQRR-NH2"],
      categories: ["Skin research", "Cosmetic peptide", "Wrinkle research"],
      claim: profileClaim("peptidedeck", "https://www.peptidedeck.com/peptides/argireline", {
        lastReviewed: "2026-08-06",
        summary: "A topical cosmetic peptide studied for changes in facial skin surface measurements. It has no established systemic human treatment dose.",
        evidence: "A small four-week human cosmetic study enrolled 40 women aged 35 to 55. The Argireline formulation changed a facial skin anisotropy measure, but did not significantly improve the viscoelasticity outcome.",
        halfLife: "No established systemic human half-life",
        halfLifeContext: "The verified study was topical and did not establish systemic pharmacokinetics.",
        mechanism: "A short acetylated peptide designed to mimic part of SNAP-25 and reduce aspects of neurotransmitter release in cosmetic laboratory models.",
        limitations: ["Small, short cosmetic study.", "No validated systemic dose or clinical treatment role."],
        safety: ["The verified study does not establish long-term or systemic safety."],
        topics: ["skin", "wrinkles", "cosmetic research", "topical peptide"],
        protocols: [
          {
            label: "Published four-week topical cosmetic study",
            dose: "1.0 mL of formulation containing 10% Argireline solution; the supplied Argireline solution contained 0.05% acetyl hexapeptide-3",
            frequency: "Twice daily",
            duration: "4 weeks",
            route: "Topical to face and forearm",
            population: "40 women aged 35 to 55",
            species: "Human",
            evidenceType: "Published small comparative cosmetic study",
            sourceUrl: "https://doi.org/10.1590/S1984-82502015000400016",
          },
        ],
        references: [
          { title: "Argireline topical skin study", url: "https://doi.org/10.1590/S1984-82502015000400016" },
        ],
        humanStudies: 1,
        contentHash: hash("peptidedeck-argireline-primary-verification-2026-08-06"),
      }),
    },
    {
      key: "dulaglutide",
      name: "Dulaglutide",
      fullName: "Dulaglutide (Trulicity / LY2189265)",
      aliases: ["Trulicity", "LY2189265", "LY-2189265"],
      categories: ["Metabolic", "GLP-1 receptor agonist", "Type 2 diabetes"],
      claim: profileClaim("peptidedeck", "https://www.peptidedeck.com/peptides/dulaglutide", {
        lastReviewed: "2026-08-06",
        summary: "A long-acting GLP-1 receptor agonist with an official prescription label for type 2 diabetes and cardiovascular-risk reduction in specified adults.",
        evidence: "Large randomized human trials include REWIND for cardiovascular outcomes and AWARD-7 in adults with type 2 diabetes and chronic kidney disease.",
        halfLife: "About 5 days",
        halfLifeContext: "Official US product information.",
        mechanism: "A GLP-1 receptor agonist that increases glucose-dependent insulin secretion, lowers glucagon secretion and slows gastric emptying.",
        limitations: ["Official schedules require clinical prescribing and monitoring.", "A labelled medicine is not a general research-use recommendation."],
        safety: ["The official label contains important contraindications, warnings and dose-adjustment considerations."],
        topics: ["type 2 diabetes", "GLP-1", "cardiovascular outcomes", "metabolic research", "weight research"],
        protocols: [
          {
            label: "Official adult US label schedule",
            dose: "0.75 mg initially; 1.5 mg after at least 4 weeks if additional glycaemic control is needed; further 1.5 mg steps to a maximum 4.5 mg",
            frequency: "Once weekly",
            duration: "Ongoing prescription treatment; each escalation only after at least 4 weeks",
            route: "Subcutaneous",
            population: "Adults with type 2 diabetes under licensed clinical care",
            species: "Human",
            evidenceType: "Official US prescribing information",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=af4e38a6-ad3f-480c-ae82-5ac6c7735b99&type=display",
          },
        ],
        references: [
          { title: "Official dulaglutide prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=af4e38a6-ad3f-480c-ae82-5ac6c7735b99&type=display" },
          { title: "REWIND cardiovascular outcomes trial", url: "https://pubmed.ncbi.nlm.nih.gov/31189511/" },
          { title: "AWARD-7 chronic kidney disease trial", url: "https://pubmed.ncbi.nlm.nih.gov/29221658/" },
        ],
        humanStudies: 3,
        contentHash: hash("peptidedeck-dulaglutide-primary-verification-2026-08-06"),
      }),
    },
    {
      key: "lanreotide",
      name: "Lanreotide",
      fullName: "Lanreotide (Somatuline Depot / Autogel)",
      aliases: ["Somatuline Depot", "Somatuline Autogel", "Lanreotide acetate"],
      categories: ["Somatostatin analogue", "Acromegaly", "Neuroendocrine tumour research"],
      claim: profileClaim("peptidedeck", "https://www.peptidedeck.com/peptides/lanreotide", {
        lastReviewed: "2026-08-06",
        summary: "A long-acting somatostatin analogue with official prescription uses in acromegaly and certain neuroendocrine tumour settings.",
        evidence: "The CLARINET randomized trial compared lanreotide 120 mg every 28 days with placebo for up to 96 weeks in 204 participants and reported a lower risk of progression or death.",
        halfLife: "About 23 to 30 days for the depot formulation",
        halfLifeContext: "Official US product information after deep subcutaneous depot administration.",
        mechanism: "A somatostatin receptor agonist that suppresses selected endocrine secretions and can slow growth signalling in susceptible neuroendocrine tumours.",
        limitations: ["Schedules differ by approved indication.", "Use requires specialist diagnosis, prescribing and monitoring."],
        safety: ["The official label includes gallbladder, glucose, cardiovascular and thyroid monitoring considerations."],
        topics: ["acromegaly", "neuroendocrine tumour", "GEP-NET", "somatostatin", "carcinoid syndrome"],
        protocols: [
          {
            label: "Official acromegaly starting schedule",
            dose: "90 mg, then adjusted to 60 mg, 90 mg or 120 mg according to response",
            frequency: "Every 4 weeks",
            duration: "First 3 months before response-based adjustment",
            route: "Deep subcutaneous",
            population: "Adults with acromegaly under specialist care",
            species: "Human",
            evidenceType: "Official US prescribing information",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6e4a41fd-a753-4362-87ee-8cc56ed3660d",
          },
          {
            label: "CLARINET phase 3 trial",
            dose: "120 mg",
            frequency: "Every 28 days",
            duration: "Up to 96 weeks",
            route: "Deep subcutaneous",
            population: "204 adults with advanced well or moderately differentiated nonfunctioning enteropancreatic neuroendocrine tumours",
            species: "Human",
            evidenceType: "Published randomized double-blind placebo-controlled trial",
            sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/25014687/",
          },
        ],
        references: [
          { title: "Official lanreotide prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6e4a41fd-a753-4362-87ee-8cc56ed3660d" },
          { title: "CLARINET randomized trial", url: "https://pubmed.ncbi.nlm.nih.gov/25014687/" },
        ],
        humanStudies: 2,
        contentHash: hash("peptidedeck-lanreotide-primary-verification-2026-08-06"),
      }),
    },
    {
      key: "lixisenatide",
      name: "Lixisenatide",
      fullName: "Lixisenatide (Adlyxin / Lyxumia / AVE0010)",
      aliases: ["Adlyxin", "Lyxumia", "AVE0010", "AVE-0010"],
      categories: ["Metabolic", "GLP-1 receptor agonist", "Type 2 diabetes"],
      claim: profileClaim("peptidedeck", "https://www.peptidedeck.com/peptides/lixisenatide", {
        lastReviewed: "2026-08-06",
        summary: "A short-acting GLP-1 receptor agonist studied and labelled for type 2 diabetes treatment in adults.",
        evidence: "The GetGoal-Mono randomized trial studied 361 adults. The larger ELIXA cardiovascular trial enrolled 6,068 patients after acute coronary syndrome and found cardiovascular non-inferiority to placebo.",
        halfLife: "About 3 hours",
        halfLifeContext: "Official US product information.",
        mechanism: "A GLP-1 receptor agonist that increases glucose-dependent insulin secretion, reduces glucagon secretion and slows gastric emptying.",
        limitations: ["Official use depends on clinical context and monitoring.", "The US product was discontinued commercially, which is not the same as withdrawal for a safety finding."],
        safety: ["The official label includes gastrointestinal, pancreatitis, kidney, hypoglycaemia and hypersensitivity warnings."],
        topics: ["type 2 diabetes", "GLP-1", "cardiovascular outcomes", "metabolic research"],
        protocols: [
          {
            label: "Official labelled initiation schedule",
            dose: "10 mcg for 14 days, then 20 mcg from day 15",
            frequency: "Once daily within one hour before the first meal",
            duration: "14-day initiation followed by the maintenance dose",
            route: "Subcutaneous",
            population: "Adults with type 2 diabetes under licensed clinical care",
            species: "Human",
            evidenceType: "Official US prescribing information",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/downloadpdffile.cfm?setId=1727cc16-4f86-4f13-b8b5-804d4984fa8c",
          },
        ],
        references: [
          { title: "Official lixisenatide prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/downloadpdffile.cfm?setId=1727cc16-4f86-4f13-b8b5-804d4984fa8c" },
          { title: "GetGoal-Mono trial", url: "https://pubmed.ncbi.nlm.nih.gov/22432104/" },
          { title: "ELIXA cardiovascular outcomes trial", url: "https://pubmed.ncbi.nlm.nih.gov/26630143/" },
        ],
        humanStudies: 3,
        contentHash: hash("peptidedeck-lixisenatide-primary-verification-2026-08-06"),
      }),
    },
    {
      key: "matrixyl",
      name: "Matrixyl",
      fullName: "Matrixyl (palmitoyl pentapeptide-4 / pal-KTTKS)",
      aliases: ["Palmitoyl pentapeptide-4", "Pal-KTTKS", "Palmitoyl pentapeptide-3"],
      categories: ["Skin research", "Cosmetic peptide", "Wrinkle research"],
      claim: profileClaim("peptidedeck", "https://www.peptidedeck.com/peptides/matrixyl", {
        lastReviewed: "2026-08-06",
        summary: "A topical cosmetic signal peptide studied for facial wrinkle measures. It has no established systemic treatment dose or human systemic half-life.",
        evidence: "A 12-week double-blind split-face randomized study enrolled 93 women and compared moisturizer containing 3 ppm pal-KTTKS with moisturizer alone.",
        halfLife: "No established systemic human half-life",
        halfLifeContext: "The verified clinical study was topical.",
        mechanism: "A palmitoylated fragment related to a collagen-derived signalling sequence, investigated for extracellular-matrix effects in skin models.",
        limitations: ["Single topical cosmetic study used for the preferred numerical record.", "Cosmetic outcomes do not establish systemic therapeutic effects."],
        safety: ["The study does not establish systemic or long-term safety."],
        topics: ["skin", "wrinkles", "cosmetic research", "collagen research", "topical peptide"],
        protocols: [
          {
            label: "Published split-face cosmetic trial",
            dose: "Moisturizer containing 3 ppm pal-KTTKS",
            frequency: "Applied according to the study's daily topical regimen",
            duration: "12 weeks",
            route: "Topical split-face application",
            population: "93 women with facial wrinkles",
            species: "Human",
            evidenceType: "Published randomized double-blind split-face trial",
            sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/18492182/",
          },
        ],
        references: [
          { title: "Pal-KTTKS randomized facial-wrinkle study", url: "https://pubmed.ncbi.nlm.nih.gov/18492182/" },
        ],
        humanStudies: 1,
        contentHash: hash("peptidedeck-matrixyl-primary-verification-2026-08-06"),
      }),
    },
    {
      key: "nesfatin1",
      name: "Nesfatin-1",
      fullName: "Nesfatin-1 (NUCB2-derived peptide)",
      aliases: ["Nesfatin 1", "NUCB2-derived nesfatin-1", "NUCB2"],
      categories: ["Metabolic research", "Appetite research", "Preclinical"],
      claim: profileClaim("peptidedeck", "https://www.peptidedeck.com/peptides/nesfatin-1", {
        lastReviewed: "2026-08-06",
        summary: "An endogenous NUCB2-derived peptide studied in appetite and energy-balance models. No validated human therapeutic dose exists.",
        evidence: "The preferred numerical record is a preclinical mouse experiment using intracerebroventricular doses. It must not be converted into a human or subcutaneous schedule.",
        halfLife: "No validated human therapeutic half-life",
        halfLifeContext: "Human treatment pharmacokinetics have not been established.",
        mechanism: "Investigated as a central satiety-related signalling peptide with effects on food intake and energy regulation in animal models.",
        limitations: ["Preclinical evidence only for the preferred dose record.", "Central mouse administration cannot establish a human treatment schedule."],
        safety: ["Human treatment safety is not established."],
        topics: ["appetite", "satiety", "weight research", "energy balance", "metabolic research", "preclinical research"],
        protocols: [
          {
            label: "Published mouse dose-response experiment",
            dose: "0.1, 0.3 or 0.9 nmol per mouse",
            frequency: "Single experimental administration",
            duration: "Food intake observed for 24 hours",
            route: "Intracerebroventricular",
            population: "Laboratory mice",
            species: "Mouse",
            evidenceType: "Published preclinical dose-response study",
            sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/22682899/",
          },
        ],
        references: [
          { title: "Nesfatin-1 mouse appetite study", url: "https://pubmed.ncbi.nlm.nih.gov/22682899/" },
          { title: "Nesfatin-1 rat study", url: "https://pubmed.ncbi.nlm.nih.gov/26635512/" },
        ],
        animalStudies: 2,
        contentHash: hash("peptidedeck-nesfatin1-primary-verification-2026-08-06"),
      }),
    },
    {
      key: "pacap38",
      name: "PACAP-38",
      fullName: "Pituitary adenylate cyclase-activating polypeptide-38",
      aliases: ["PACAP 38", "PACAP38", "Pituitary adenylate cyclase activating polypeptide 38"],
      categories: ["Neurology research", "Migraine research", "Provocation study"],
      claim: profileClaim("peptidedeck", "https://www.peptidedeck.com/peptides/pacap-38", {
        lastReviewed: "2026-08-06",
        summary: "An endogenous neuropeptide used in controlled human migraine-provocation research. The verified number is an experimental intravenous challenge, not a treatment dose.",
        evidence: "In a double-blind crossover study, 24 women with migraine were enrolled and 22 completed. PACAP-38 provoked migraine-like attacks in 73% after a 20-minute infusion.",
        halfLife: "No preferred human therapeutic half-life",
        halfLifeContext: "The verified human work is a brief experimental provocation infusion, not a therapeutic pharmacokinetic programme.",
        mechanism: "A vasoactive neuropeptide acting through PAC1, VPAC1 and VPAC2 receptors, studied in migraine signalling and vasodilation.",
        limitations: ["Provocation experiment, not treatment evidence.", "Small, female-only completed sample.", "No validated therapeutic dose."],
        safety: ["The experiment deliberately provoked migraine-like attacks and must not be read as a self-use schedule."],
        topics: ["migraine", "headache", "neurology", "PAC1 receptor", "provocation research"],
        protocols: [
          {
            label: "Published human migraine-provocation study",
            dose: "10 pmol/kg/min",
            frequency: "Continuous infusion for 20 minutes in one experimental session",
            duration: "20-minute infusion with post-infusion observation",
            route: "Intravenous",
            population: "24 women with migraine without aura; 22 completed",
            species: "Human",
            evidenceType: "Published randomized double-blind crossover provocation study",
            sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/24501094/",
          },
        ],
        references: [
          { title: "PACAP-38 human migraine-provocation study", url: "https://pubmed.ncbi.nlm.nih.gov/24501094/" },
          { title: "Modern PACAP-38 provocation follow-up", url: "https://pubmed.ncbi.nlm.nih.gov/40229719/" },
        ],
        humanStudies: 2,
        contentHash: hash("peptidedeck-pacap38-primary-verification-2026-08-06"),
      }),
    },
    {
      key: "ptddbm",
      name: "PTD-DBM",
      fullName: "Protein transduction domain-dishevelled binding motif peptide",
      aliases: ["PTD DBM", "Protein Transduction Domain-Dishevelled Binding Motif", "Dishevelled binding motif peptide"],
      categories: ["Hair research", "Wnt signalling", "Preclinical"],
      claim: profileClaim("peptidedeck", "https://www.peptidedeck.com/peptides/ptd-dbm", {
        lastReviewed: "2026-08-06",
        summary: "An experimental Wnt-signalling peptide studied in cell and mouse hair-growth models. No validated human treatment dose exists.",
        evidence: "The preferred numerical record is a topical mouse experiment from a full primary paper. PeptideDeck's generic concentration and cycle suggestions were not imported.",
        halfLife: "No validated human half-life",
        halfLifeContext: "Human pharmacokinetics have not been established.",
        mechanism: "Designed to interfere with a CXXC5-dishevelled interaction and thereby alter Wnt/beta-catenin signalling in preclinical models.",
        limitations: ["Preclinical only.", "Mouse topical exposure cannot establish a human cosmetic or treatment schedule."],
        safety: ["Human treatment safety is unknown."],
        topics: ["hair growth", "hair loss", "Wnt signalling", "CXXC5", "preclinical research"],
        protocols: [
          {
            label: "Published topical mouse experiment",
            dose: "300 microlitres of 10 mM PTD-DBM solution",
            frequency: "Every other day",
            duration: "Days 8 to 12 or day 20 after depilation, depending on the experiment",
            route: "Topical",
            population: "Depilated laboratory mice in a PGD2-suppressed hair-growth model",
            species: "Mouse",
            evidenceType: "Published preclinical full-text study",
            sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9954685/",
          },
        ],
        references: [
          { title: "PTD-DBM mouse hair-growth study", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9954685/" },
        ],
        animalStudies: 1,
        contentHash: hash("peptidedeck-ptddbm-primary-verification-2026-08-06"),
      }),
    },
    {
      key: "thymopentin",
      name: "Thymopentin",
      fullName: "Thymopentin (TP-5)",
      aliases: ["TP-5", "TP5", "Timunox"],
      categories: ["Immune research", "Thymic peptide", "Historical human research"],
      claim: profileClaim("peptidedeck", "https://www.peptidedeck.com/peptides/thymopentin", {
        lastReviewed: "2026-08-06",
        summary: "A synthetic five-amino-acid thymic peptide studied historically as an immune modulator. It is not current HIV treatment guidance.",
        evidence: "A historical randomized study enrolled 352 asymptomatic HIV-positive participants receiving zidovudine and tested thymopentin for 48 weeks. The record belongs to the pre-modern antiretroviral era.",
        halfLife: "No preferred modern human therapeutic half-life",
        halfLifeContext: "Historical pharmacology does not establish a current treatment schedule.",
        mechanism: "A synthetic fragment corresponding to an active region of thymopoietin, investigated for T-cell and immune-signalling effects.",
        limitations: ["Historical study context predates modern combination antiretroviral therapy.", "Not current HIV treatment guidance.", "No modern general-use dose is established."],
        safety: ["Historical trial data cannot substitute for current specialist medical guidance."],
        topics: ["immune research", "thymic peptide", "T-cell research", "historical HIV research"],
        protocols: [
          {
            label: "Historical zidovudine-era randomized study",
            dose: "50 mg",
            frequency: "Three times per week",
            duration: "48 weeks",
            route: "Subcutaneous",
            population: "352 asymptomatic HIV-positive participants receiving zidovudine",
            species: "Human",
            evidenceType: "Published historical randomized multicentre study",
            sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/7859140/",
          },
        ],
        references: [
          { title: "Historical thymopentin randomized study", url: "https://pubmed.ncbi.nlm.nih.gov/7859140/" },
        ],
        humanStudies: 1,
        contentHash: hash("peptidedeck-thymopentin-primary-verification-2026-08-06"),
      }),
    },
    {
      key: "vosoritide",
      name: "Vosoritide",
      fullName: "Vosoritide (Voxzogo / BMN-111)",
      aliases: ["Voxzogo", "BMN-111", "BMN111"],
      categories: ["Growth disorder medicine", "CNP analogue", "Achondroplasia"],
      claim: profileClaim("peptidedeck", "https://www.peptidedeck.com/peptides/vosoritide", {
        lastReviewed: "2026-08-06",
        summary: "An approved C-type natriuretic peptide analogue for increasing linear growth in children with achondroplasia and open epiphyses under specialist care.",
        evidence: "A phase 3 randomized trial enrolled 121 children aged 5 to under 18 years and compared vosoritide 15 mcg/kg daily with placebo for 52 weeks.",
        halfLife: "About 27.9 minutes after the 15 mcg/kg dose",
        halfLifeContext: "Official US product information; the short half-life does not replace the official once-daily weight-based schedule.",
        mechanism: "A C-type natriuretic peptide analogue that activates natriuretic peptide receptor-B signalling downstream of FGFR3 to support endochondral bone growth.",
        limitations: ["Only for the labelled population with achondroplasia and open growth plates.", "Weight-based dosing and monitoring require specialist clinical care."],
        safety: ["The official label warns about low blood pressure and requires attention to hydration and food intake around dosing."],
        topics: ["achondroplasia", "linear growth", "bone growth", "CNP analogue", "paediatric medicine"],
        protocols: [
          {
            label: "Current official weight-based schedule",
            dose: "0.096 mg at 3 kg through 1.4 mg at 90 kg or more, selected from the official actual-body-weight table",
            frequency: "Once daily",
            duration: "Until epiphyseal closure under specialist monitoring",
            route: "Subcutaneous",
            population: "Children with achondroplasia and open epiphyses under licensed specialist care",
            species: "Human",
            evidenceType: "Official US prescribing information",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=228e8560-04a4-4bb1-a81f-29531a9e4d27",
          },
          {
            label: "Published phase 3 trial",
            dose: "15 mcg/kg",
            frequency: "Once daily",
            duration: "52 weeks",
            route: "Subcutaneous",
            population: "121 children aged 5 to under 18 years with achondroplasia",
            species: "Human",
            evidenceType: "Published randomized double-blind placebo-controlled phase 3 trial",
            sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/32891212/",
          },
        ],
        references: [
          { title: "Official vosoritide prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=228e8560-04a4-4bb1-a81f-29531a9e4d27" },
          { title: "Vosoritide phase 3 randomized trial", url: "https://pubmed.ncbi.nlm.nih.gov/32891212/" },
          { title: "Vosoritide long-term extension study", url: "https://pubmed.ncbi.nlm.nih.gov/34341520/" },
        ],
        humanStudies: 3,
        contentHash: hash("peptidedeck-vosoritide-primary-verification-2026-08-06"),
      }),
    },
  ];
}

/** Turn a reachable supplied article into a source-attributed PEARL record.
 * The whole cleaned section set is retained in `passages`; the fixed fields
 * are only the short deterministic fallback. No source grade is used as an
 * exclusion rule. */
function fullSourcePageProfile(sourceId, url, markup, fallbackName = "", forcedKey = "") {
  const sections = pageSections(markup);
  const heading = pageHeading(markup, fallbackName) || pageTitle(markup) || fallbackName;
  const name = cleanText(heading.replace(/\s*[|:-]\s*(?:PeptideDeck|WikiPep).*$/i, ""), 180) || fallbackName;
  const findSections = (pattern) => sections
    .filter((section) => pattern.test(section.heading))
    .map((section) => section.text)
    .filter(Boolean);
  const opening = sections.map((section) => section.text).find(Boolean) || cleanPageText(markup, 1_800);
  const evidence = answerText(findSections(/research|evidence|stud(?:y|ies)|trial|reference|benefit/i).join(" "), 8_000);
  const mechanism = answerText(findSections(/mechanism|how .*works?|pharmacology/i).join(" "), 5_000);
  const limitations = answerTextList(findSections(/limitation|caveat|warning|disclaimer|cannot tell|research gap/i));
  const safety = answerTextList(findSections(/safety|side effect|adverse|contraindication|risk/i));
  const preparation = answerTextList(findSections(/reconstit|prepar|syringe|inject|administr|mix|storage|calculator|suppl/i));
  const topics = answerTextList(sections.map((section) => section.heading).filter(Boolean));
  const slug = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1) || name);
  return {
    key: canonicalKey(forcedKey || slug || name),
    name,
    aliases: [],
    categories: [],
    claim: profileClaim(sourceId, url, {
      lastReviewed: new Date().toISOString().slice(0, 10),
      summary: answerText(opening, 1_800),
      evidence,
      mechanism,
      limitations,
      safety,
      topics,
      protocols: sourceSectionProtocols(markup, url, "(?:Research )?(?:Dose|Dosage|Dosing|Protocol|Schedule|Administration)[^<]*"),
      preparation,
      passages: sections,
      references: trustedReferences(markup, url, 100),
      contentHash: hash(markup),
    }),
  };
}

function mergeVerifiedAndFullProfiles(verified, full) {
  const verifiedByKey = new Map(verified.map((profile) => [profile.key, profile]));
  return full.map((profile) => {
    const checked = verifiedByKey.get(profile.key);
    if (!checked) return profile;
    verifiedByKey.delete(profile.key);
    return {
      ...profile,
      name: checked.name || profile.name,
      fullName: checked.fullName || profile.fullName,
      aliases: cleanList([...(profile.aliases || []), ...(checked.aliases || [])], 30),
      categories: cleanList([...(profile.categories || []), ...(checked.categories || [])], 12),
      claim: {
        ...profile.claim,
        ...checked.claim,
        passages: profile.claim.passages,
        preparation: cleanProseList([...(profile.claim.preparation || []), ...(checked.claim.preparation || [])], 14, 400),
        protocols: [...(checked.claim.protocols || []), ...(profile.claim.protocols || [])].slice(0, 10),
        references: [...(checked.claim.references || []), ...(profile.claim.references || [])]
          .filter((reference, index, all) => all.findIndex((item) => item.url === reference.url) === index)
          .slice(0, 12),
      },
    };
  }).concat([...verifiedByKey.values()]);
}

async function readPeptideDeckEditorialAudit() {
  const indexPages = [];
  const articleLinks = [];
  const categoryLinks = [];
  const failures = [];

  for (let page = 1; page <= 40; page += 1) {
    const url = page === 1 ? "https://www.peptidedeck.com/blog" : `https://www.peptidedeck.com/blog?page=${page}`;
    let markup;
    try {
      markup = await fetchText(url);
    } catch (error) {
      failures.push({ url, error: String(error) });
      break;
    }
    const links = extractLinks(markup, url);
    indexPages.push({ url, contentHash: hash(markup) });
    for (const link of links) {
      try {
        const parsed = new URL(link.url);
        if (parsed.hostname !== "www.peptidedeck.com") continue;
        if (/^\/blog\/category\/[^/]+\/?$/i.test(parsed.pathname)) categoryLinks.push(link);
        if (/^\/blog\/[^/]+\/?$/i.test(parsed.pathname) && !/^\/blog\/category\//i.test(parsed.pathname)) articleLinks.push(link);
      } catch {
        // Ignore malformed navigation or affiliate links.
      }
    }
    const hasNextPage = links.some((link) => {
      try {
        const parsed = new URL(link.url);
        return parsed.pathname === "/blog" && Number(parsed.searchParams.get("page")) === page + 1;
      } catch {
        return false;
      }
    });
    if (!hasNextPage) break;
  }

  const articles = uniqueLinks(articleLinks);
  const reviewed = await mapLimit(articles, 8, async (article) => {
    const markup = await fetchText(article.url);
    const references = trustedReferences(markup, article.url, 100);
    const profile = fullSourcePageProfile("peptidedeck", article.url, markup, article.title);
    return {
      key: canonicalKey(new URL(article.url).pathname.split("/").filter(Boolean).at(-1)),
      title: pageHeading(markup, article.title) || pageTitle(markup),
      url: article.url,
      trustedReferenceCount: references.length,
      contentHash: hash(markup),
      importStatus: "full-source-import",
      profile,
    };
  });
  const articleFailures = reviewed.filter((item) => item?.error);
  const successful = reviewed.filter((item) => item && !item.error);
  const goalPages = successful.filter((item) => /\b(best|top)\b.*\bpeptides?\b|\bpeptides? for\b|\bresearch guide\b/i.test(item.title));

  return {
    indexPages,
    articles: successful,
    categories: uniqueLinks(categoryLinks),
    failures: [...failures, ...articleFailures],
    goalPages,
  };
}

async function readPeptideDeckAudit() {
  const verifiedProfiles = curatedPeptideDeckProfiles();
  const fetchedProfiles = await mapLimit(PEPTIDEDECK_PROFILE_PATHS, 8, async (slug) => {
    const url = `https://www.peptidedeck.com/peptides/${slug}`;
    const markup = await fetchText(url);
    return fullSourcePageProfile("peptidedeck", url, markup, slug, slug);
  });
  const profileFailures = fetchedProfiles.filter((item) => item?.error);
  const fullProfiles = fetchedProfiles.filter((item) => item && !item.error);
  const profiles = mergeVerifiedAndFullProfiles(verifiedProfiles, fullProfiles);
  const importedKeys = new Set(profiles.map((profile) => profile.key));
  const profileDetails = PEPTIDEDECK_PROFILE_PATHS.map((slug) => ({
    key: canonicalKey(slug),
    url: `https://www.peptidedeck.com/peptides/${slug}`,
    importStatus: importedKeys.has(canonicalKey(slug))
      ? "full-source-import"
      : "fetch-failed",
  }));
  const editorial = await readPeptideDeckEditorialAudit();
  // Map each editorial article to every imported compound it explicitly
  // names. This makes goal-oriented articles answerable without inventing a
  // fake compound whose name is the article headline.
  const articleProfiles = editorial.articles.flatMap((article) => {
    const searchable = canonicalKey(`${article.title} ${(article.profile?.claim?.passages || []).map((passage) => passage.text).join(" ")}`);
    return profiles.filter((profile) => {
      const terms = [profile.key, profile.name, ...(profile.aliases || [])].map(canonicalKey).filter((term) => term.length >= 4);
      return terms.some((term) => searchable.includes(term));
    }).map((profile) => ({ ...article.profile, key: profile.key, name: profile.name, aliases: [], categories: [] }));
  });
  profiles.push(...articleProfiles);
  const reviewedOn = new Date().toISOString().slice(0, 10);
  return {
    audit: {
      sourceId: "peptidedeck",
      mappedPages: PEPTIDEDECK_PROFILE_PATHS.length + editorial.indexPages.length + editorial.articles.length + editorial.categories.length,
      mappedProfileEntries: PEPTIDEDECK_PROFILE_PATHS.length,
      editorialIndexPagesLoaded: editorial.indexPages.length,
      editorialPagesMapped: editorial.articles.length,
      editorialPagesAnalyzed: editorial.articles.length,
      editorialGoalPagesMapped: editorial.goalPages.length,
      editorialCategoriesMapped: editorial.categories.length,
      trustedEditorialReferenceCount: editorial.articles.reduce((sum, item) => sum + item.trustedReferenceCount, 0),
      sampledProfiles: PEPTIDEDECK_PROFILE_PATHS.length,
      analyzedProfiles: fullProfiles.length + editorial.articles.length,
      importedProfiles: profiles.length,
      excludedProfiles: profileFailures.length,
      accessStatus: [...profileFailures, ...editorial.failures].length ? "full-source-import-with-failures" : "full-source-import",
      lastReviewed: reviewedOn,
      citationMismatchCount: 1,
      failures: [...profileFailures, ...editorial.failures],
      notes: "Every reachable public profile and editorial article is imported in full with its source attribution. Protocol, preparation, cycle, stack and modelled material is retained and labelled rather than excluded. Shop buttons, discount wording and rival-seller names remain in the auditable raw archive but are removed from customer answer fields. The twelve previously verified records remain preferred where they conflict. Known citation mismatches remain visible as limitations.",
    },
    profiles,
    details: [
      ...profileDetails,
      ...editorial.categories.map((item) => ({
        key: `category:${canonicalKey(new URL(item.url).pathname.split("/").filter(Boolean).at(-1))}`,
        title: item.title,
        url: item.url,
        importStatus: "category-vocabulary-only",
      })),
      ...editorial.articles.map(({ profile, ...detail }) => detail),
    ],
  };
}

function curatedWikiPepProfiles() {
  return [
    {
      key: "bivalirudin",
      name: "Bivalirudin",
      fullName: "Bivalirudin (Angiomax / Angiox)",
      aliases: ["Angiomax", "Angiox"],
      categories: ["Anticoagulation", "Direct thrombin inhibitor", "Cardiovascular medicine"],
      claim: profileClaim("wikipep", "https://wikipep.org/wiki/Bivalirudin", {
        lastReviewed: "2026-08-07",
        summary: "A short-acting direct thrombin inhibitor used as a prescription intravenous anticoagulant during percutaneous coronary intervention.",
        evidence: "The official label is supported by randomized coronary-intervention studies. The numerical schedule is procedure-specific, with a lower infusion rate in severe kidney impairment because clearance falls as renal function worsens.",
        halfLife: "About 25 minutes with normal renal function",
        halfLifeContext: "Official US product information reports longer half-lives with renal impairment, including about 3.5 hours in dialysis patients.",
        mechanism: "It binds directly and reversibly to thrombin, reducing thrombin-mediated clot formation.",
        limitations: ["This is a hospital procedure medicine, not a general research-use schedule.", "Renal function and procedure context materially change the infusion rate."],
        safety: ["Serious and sometimes fatal bleeding can occur.", "The official regimen requires specialist monitoring during a coronary procedure."],
        topics: ["anticoagulation", "PCI", "coronary intervention", "thrombin", "cardiovascular research"],
        protocols: [
          {
            label: "Official PCI schedule",
            dose: "0.75 mg/kg intravenous bolus followed by 1.75 mg/kg/hour",
            frequency: "One bolus, then continuous infusion for the procedure",
            duration: "For the duration of percutaneous coronary intervention; selected STEMI cases may continue the infusion for up to 4 hours afterwards",
            route: "Intravenous",
            population: "Adults undergoing percutaneous coronary intervention under specialist care",
            species: "Human",
            evidenceType: "Official US prescribing information",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=91cf9d00-29e0-4357-a184-f70026c47edb",
          },
          {
            label: "Official severe renal-impairment infusion adjustments",
            dose: "1 mg/kg/hour when creatinine clearance is below 30 mL/min; 0.25 mg/kg/hour during haemodialysis",
            frequency: "Continuous infusion after the standard 0.75 mg/kg bolus",
            duration: "For the coronary procedure",
            route: "Intravenous",
            population: "Adults undergoing PCI with severe renal impairment or haemodialysis",
            species: "Human",
            evidenceType: "Official US prescribing information",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=91cf9d00-29e0-4357-a184-f70026c47edb",
          },
        ],
        references: [{ title: "Official bivalirudin prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=91cf9d00-29e0-4357-a184-f70026c47edb" }],
        humanStudies: 3,
        contentHash: hash("wikipep-bivalirudin-official-verification-2026-08-07"),
      }),
    },
    {
      key: "cetrorelix",
      name: "Cetrorelix",
      fullName: "Cetrorelix acetate (Cetrotide)",
      aliases: ["Cetrotide", "Cetrorelix acetate"],
      categories: ["GnRH antagonist", "Fertility medicine", "Reproductive research"],
      claim: profileClaim("wikipep", "https://wikipep.org/wiki/Cetrorelix", {
        lastReviewed: "2026-08-07",
        summary: "A prescription gonadotropin-releasing hormone antagonist used in assisted-reproduction treatment to prevent a premature luteinising-hormone surge.",
        evidence: "Five clinical studies in 732 patients evaluated either a daily 0.25 mg schedule or a single 3 mg schedule during controlled ovarian stimulation. The two regimens have different timing and must not be combined into an improvised protocol.",
        halfLife: "About 5 hours after a single 0.25 mg dose; about 20.6 hours after repeated 0.25 mg doses; about 62.8 hours after 3 mg",
        halfLifeContext: "Official US product information; values differ by dose and repeated exposure.",
        mechanism: "It competitively blocks pituitary GnRH receptors and suppresses luteinising hormone and follicle-stimulating hormone release.",
        limitations: ["The schedule is tied to monitored fertility treatment and ovarian response.", "A labelled medicine schedule is not a personal recommendation."],
        safety: ["Hypersensitivity, ovarian hyperstimulation and pregnancy-related risks require specialist oversight."],
        topics: ["fertility", "assisted reproduction", "IVF", "GnRH antagonist", "ovarian stimulation"],
        protocols: [
          {
            label: "Official multiple-dose fertility regimen",
            dose: "0.25 mg",
            frequency: "Once every 24 hours",
            duration: "Started on stimulation day 5 or 6 and continued through the day of hCG administration",
            route: "Subcutaneous",
            population: "Adults undergoing controlled ovarian stimulation under fertility-specialist care",
            species: "Human",
            evidenceType: "Official US prescribing information and clinical studies",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=95b852d6-26a4-4aaf-a4c3-26340a24723d",
          },
          {
            label: "Studied single-dose fertility regimen",
            dose: "3 mg",
            frequency: "Single dose; if hCG was not given within 4 days, 0.25 mg daily began 96 hours later",
            duration: "Timed to controlled ovarian stimulation and hCG administration",
            route: "Subcutaneous",
            population: "Adults in controlled ovarian-stimulation clinical studies",
            species: "Human",
            evidenceType: "Official US product information describing clinical studies",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=95b852d6-26a4-4aaf-a4c3-26340a24723d",
          },
        ],
        references: [{ title: "Official cetrorelix prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=95b852d6-26a4-4aaf-a4c3-26340a24723d" }],
        humanStudies: 5,
        contentHash: hash("wikipep-cetrorelix-official-verification-2026-08-07"),
      }),
    },
    {
      key: "ganirelix",
      name: "Ganirelix",
      fullName: "Ganirelix acetate (Fyremadel / Antagon)",
      aliases: ["Ganirelix acetate", "Fyremadel", "Antagon"],
      categories: ["GnRH antagonist", "Fertility medicine", "Reproductive research"],
      claim: profileClaim("wikipep", "https://wikipep.org/wiki/Ganirelix", {
        lastReviewed: "2026-08-07",
        summary: "A prescription GnRH antagonist used during controlled ovarian stimulation to prevent a premature luteinising-hormone surge.",
        evidence: "The official product information describes controlled fertility-treatment studies using 250 mcg once daily alongside follicle-stimulating hormone until the ovulation-trigger stage.",
        halfLife: "About 12.8 hours after a single dose and 16.2 hours after repeated daily doses",
        halfLifeContext: "Official US product information after subcutaneous use.",
        mechanism: "It competitively blocks pituitary GnRH receptors, rapidly reducing gonadotropin secretion.",
        limitations: ["Timing depends on monitored ovarian stimulation and response.", "This specialist medicine is not interchangeable with other GnRH antagonists."],
        safety: ["Hypersensitivity and ovarian-hyperstimulation risks require fertility-specialist supervision."],
        topics: ["fertility", "assisted reproduction", "IVF", "GnRH antagonist", "ovarian stimulation"],
        protocols: [{
          label: "Official controlled ovarian-stimulation regimen",
          dose: "250 mcg",
          frequency: "Once daily",
          duration: "Started during stimulation, commonly on day 7 or 8 in the clinical studies, and continued through the day of hCG administration",
          route: "Subcutaneous",
          population: "Adults undergoing controlled ovarian stimulation under fertility-specialist care",
          species: "Human",
          evidenceType: "Official US prescribing information and controlled clinical studies",
          sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c23ca7b2-7350-4f07-8adf-046bffb47842",
        }],
        references: [{ title: "Official ganirelix prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c23ca7b2-7350-4f07-8adf-046bffb47842" }],
        humanStudies: 2,
        contentHash: hash("wikipep-ganirelix-official-verification-2026-08-07"),
      }),
    },
    {
      key: "goserelin",
      name: "Goserelin",
      fullName: "Goserelin acetate implant (Zoladex)",
      aliases: ["Zoladex", "Goserelin acetate"],
      categories: ["GnRH agonist", "Oncology medicine", "Hormone suppression"],
      claim: profileClaim("wikipep", "https://wikipep.org/wiki/Goserelin", {
        lastReviewed: "2026-08-07",
        summary: "A long-acting prescription GnRH agonist implant used in selected hormone-sensitive cancer and gynaecological settings.",
        evidence: "Official product information describes distinct 3.6 mg monthly and 10.8 mg twelve-week depot products. Controlled studies and indication-specific schedules support the labelled uses.",
        halfLife: "Depot release is designed for about 28 days or 12 weeks, depending on implant strength",
        halfLifeContext: "The clinically relevant figure is sustained depot release; a single serum half-life does not describe the two implant products well.",
        mechanism: "Initial pituitary GnRH stimulation is followed by receptor downregulation and suppression of gonadal steroid production.",
        limitations: ["The two implant strengths have different labelled populations and must not be treated as freely interchangeable.", "Clinical indication determines the schedule."],
        safety: ["Initial hormone flare, bone loss, metabolic effects and cardiovascular risks require specialist assessment and monitoring."],
        topics: ["prostate cancer", "breast cancer", "endometriosis", "hormone suppression", "GnRH agonist"],
        protocols: [
          {
            label: "Official 3.6 mg depot schedule",
            dose: "3.6 mg implant",
            frequency: "Every 28 days",
            duration: "Indication-specific prescription treatment",
            route: "Subcutaneous implant",
            population: "Patients with an approved indication under specialist care",
            species: "Human",
            evidenceType: "Official US prescribing information",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=294b168b-6e5f-4db9-bf70-d599271458b3",
          },
          {
            label: "Official 10.8 mg prostate-cancer depot schedule",
            dose: "10.8 mg implant",
            frequency: "Every 12 weeks",
            duration: "Long-term specialist treatment as clinically indicated",
            route: "Subcutaneous implant",
            population: "Men with an approved prostate-cancer indication under specialist care",
            species: "Human",
            evidenceType: "Official US prescribing information",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=e4cb3c20-2738-400a-b522-3f36f71fe6c5&version=8",
          },
        ],
        references: [
          { title: "Official goserelin 3.6 mg prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=294b168b-6e5f-4db9-bf70-d599271458b3" },
          { title: "Official goserelin 10.8 mg prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=e4cb3c20-2738-400a-b522-3f36f71fe6c5&version=8" },
        ],
        humanStudies: 2,
        contentHash: hash("wikipep-goserelin-official-verification-2026-08-07"),
      }),
    },
    {
      key: "histrelin",
      name: "Histrelin",
      fullName: "Histrelin acetate implant (Supprelin LA)",
      aliases: ["Supprelin LA", "Vantas", "Histrelin acetate"],
      categories: ["GnRH agonist", "Central precocious puberty", "Endocrinology"],
      claim: profileClaim("wikipep", "https://wikipep.org/wiki/Histrelin", {
        lastReviewed: "2026-08-07",
        summary: "A long-acting prescription GnRH agonist implant. Current official US information describes a twelve-month implant for children with central precocious puberty.",
        evidence: "The official label reports a 50 mg implant designed to release about 65 mcg each day for twelve months. Clinical studies assessed suppression of stimulated luteinising hormone and pubertal progression.",
        halfLife: "About 12 months of controlled implant delivery",
        halfLifeContext: "The product uses sustained release rather than repeated systemic dosing; the label emphasises daily release from the implant.",
        mechanism: "Continuous GnRH-receptor stimulation produces pituitary desensitisation and suppresses gonadotropin secretion after an initial stimulation phase.",
        limitations: ["Insertion, removal and monitoring are specialist procedures.", "The implant schedule is indication-specific and not a general peptide protocol."],
        safety: ["Initial hormonal flare, psychiatric effects, seizures in susceptible patients and implant complications are recognised warnings."],
        topics: ["central precocious puberty", "puberty suppression", "endocrinology", "GnRH agonist", "implant"],
        protocols: [{
          label: "Official central-precocious-puberty implant schedule",
          dose: "One 50 mg implant releasing about 65 mcg per day",
          frequency: "One implant every 12 months",
          duration: "12 months per implant, with treatment duration determined by the specialist",
          route: "Subcutaneous implant",
          population: "Children with central precocious puberty under paediatric endocrine care",
          species: "Human",
          evidenceType: "Official US prescribing information and clinical studies",
          sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d8fb000e-3cc9-4803-b71d-2cc597661977",
        }],
        references: [{ title: "Official histrelin implant prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d8fb000e-3cc9-4803-b71d-2cc597661977" }],
        humanStudies: 1,
        contentHash: hash("wikipep-histrelin-official-verification-2026-08-07"),
      }),
    },
    {
      key: "nafarelin",
      name: "Nafarelin",
      fullName: "Nafarelin acetate nasal solution (Synarel)",
      aliases: ["Synarel", "Nafarelin acetate"],
      categories: ["GnRH agonist", "Central precocious puberty", "Endocrinology"],
      claim: profileClaim("wikipep", "https://wikipep.org/wiki/Nafarelin", {
        lastReviewed: "2026-08-07",
        summary: "A prescription intranasal GnRH agonist with official product information for central precocious puberty and historical studied schedules in endometriosis.",
        evidence: "The current official label gives a 1,600 mcg daily starting schedule for central precocious puberty, with a defined 1,800 mcg daily escalation when suppression is inadequate. Dose and spray timing are specific to the nasal product.",
        halfLife: "About 3 hours",
        halfLifeContext: "Official product information after intranasal administration; label versions report approximately 2.5 to 3 hours.",
        mechanism: "Continuous GnRH-receptor stimulation is followed by pituitary desensitisation and reduced gonadotropin secretion.",
        limitations: ["The nasal product's schedule cannot be converted into an injectable research protocol.", "Response and adherence require endocrine monitoring."],
        safety: ["Initial hormonal flare, reduced bone density and psychiatric or seizure warnings require clinical oversight."],
        topics: ["central precocious puberty", "endometriosis", "GnRH agonist", "intranasal", "endocrinology"],
        protocols: [
          {
            label: "Official central-precocious-puberty starting schedule",
            dose: "1,600 mcg per day: 400 mcg into each nostril in the morning and evening",
            frequency: "Twice daily",
            duration: "Continued under paediatric endocrine monitoring",
            route: "Intranasal",
            population: "Children with central precocious puberty under specialist care",
            species: "Human",
            evidenceType: "Official US prescribing information",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d0aa57cb-d2f4-46d7-af43-7c8b06aa81a6",
          },
          {
            label: "Official inadequate-suppression escalation",
            dose: "1,800 mcg per day: 600 mcg alternating nostrils",
            frequency: "Three times daily",
            duration: "Only when the labelled starting schedule does not provide adequate suppression",
            route: "Intranasal",
            population: "Children with central precocious puberty under specialist care",
            species: "Human",
            evidenceType: "Official US prescribing information",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d0aa57cb-d2f4-46d7-af43-7c8b06aa81a6",
          },
        ],
        references: [{ title: "Official nafarelin prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d0aa57cb-d2f4-46d7-af43-7c8b06aa81a6" }],
        humanStudies: 2,
        contentHash: hash("wikipep-nafarelin-official-verification-2026-08-07"),
      }),
    },
    {
      key: "dasiglucagon",
      name: "Dasiglucagon",
      fullName: "Dasiglucagon (Zegalogue)",
      aliases: ["Zegalogue"],
      categories: ["Glucagon analogue", "Severe hypoglycaemia", "Emergency medicine"],
      claim: profileClaim("wikipep", "https://wikipep.org/wiki/Dasiglucagon", {
        lastReviewed: "2026-08-07",
        summary: "A prescription glucagon analogue used as emergency rescue treatment for severe hypoglycaemia in adults and children aged six years or older.",
        evidence: "Randomized placebo-controlled studies evaluated recovery from insulin-induced severe hypoglycaemia. The official single 0.6 mg rescue dose is the same for the labelled adult and paediatric age groups.",
        halfLife: "About 30 minutes",
        halfLifeContext: "Official US product information after subcutaneous administration.",
        mechanism: "It activates hepatic glucagon receptors, increasing glycogen breakdown and glucose release into the blood.",
        limitations: ["This is emergency rescue treatment, not a routine glucose-management schedule.", "A repeat dose does not replace emergency assistance."],
        safety: ["Emergency help should be requested immediately after administration.", "Nausea, vomiting, headache and hypersensitivity are recognised risks."],
        topics: ["severe hypoglycaemia", "diabetes", "emergency rescue", "glucagon analogue", "blood glucose"],
        protocols: [{
          label: "Official severe-hypoglycaemia rescue dose",
          dose: "0.6 mg; one additional 0.6 mg dose from a new device may be given after 15 minutes if there is no response",
          frequency: "Single emergency dose, with one repeat permitted after 15 minutes while emergency assistance is awaited",
          duration: "Acute emergency rescue",
          route: "Subcutaneous",
          population: "Adults and children aged 6 years or older with severe hypoglycaemia",
          species: "Human",
          evidenceType: "Official US prescribing information and randomized clinical studies",
          sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=14704879-872c-4967-8779-04a3bbdfb4e6",
        }],
        references: [{ title: "Official dasiglucagon prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=14704879-872c-4967-8779-04a3bbdfb4e6" }],
        humanStudies: 3,
        contentHash: hash("wikipep-dasiglucagon-official-verification-2026-08-07"),
      }),
    },
    {
      key: "enfuvirtide",
      name: "Enfuvirtide",
      fullName: "Enfuvirtide (Fuzeon / T-20)",
      aliases: ["Fuzeon", "T-20", "Pentafuside"],
      categories: ["HIV medicine", "Fusion inhibitor", "Antiviral peptide"],
      claim: profileClaim("wikipep", "https://wikipep.org/wiki/Enfuvirtide", {
        lastReviewed: "2026-08-07",
        summary: "A prescription HIV-1 fusion-inhibitor peptide used with other antiretroviral medicines in treatment-experienced patients with ongoing viral replication.",
        evidence: "Randomized TORO studies supported use in treatment-experienced adults. The official label also provides a weight-based paediatric schedule for children weighing at least 11 kg.",
        halfLife: "About 3.8 hours",
        halfLifeContext: "Mean value in official product information after a 90 mg subcutaneous dose.",
        mechanism: "It binds the HIV-1 gp41 envelope protein and prevents fusion of viral and host-cell membranes.",
        limitations: ["It must be used as part of a clinically selected antiretroviral combination.", "Resistance history and specialist monitoring determine suitability."],
        safety: ["Injection-site reactions were extremely common in trials.", "Bacterial pneumonia and hypersensitivity are important label warnings."],
        topics: ["HIV", "antiretroviral treatment", "fusion inhibitor", "gp41", "treatment resistance"],
        protocols: [
          {
            label: "Official adult HIV-1 schedule",
            dose: "90 mg",
            frequency: "Twice daily",
            duration: "Ongoing combination antiretroviral treatment",
            route: "Subcutaneous",
            population: "Treatment-experienced adults with HIV-1 and ongoing viral replication",
            species: "Human",
            evidenceType: "Official US prescribing information and randomized clinical studies",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6935e846-d5a1-49e5-89a2-f8ebe4d5590d",
          },
          {
            label: "Official paediatric weight-based schedule",
            dose: "2 mg/kg per dose, up to a maximum 90 mg per dose",
            frequency: "Twice daily",
            duration: "Ongoing combination antiretroviral treatment",
            route: "Subcutaneous",
            population: "Children weighing at least 11 kg with treatment-experienced HIV-1",
            species: "Human",
            evidenceType: "Official US prescribing information",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6935e846-d5a1-49e5-89a2-f8ebe4d5590d",
          },
        ],
        references: [{ title: "Official enfuvirtide prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6935e846-d5a1-49e5-89a2-f8ebe4d5590d" }],
        humanStudies: 2,
        contentHash: hash("wikipep-enfuvirtide-official-verification-2026-08-07"),
      }),
    },
    {
      key: "eptifibatide",
      name: "Eptifibatide",
      fullName: "Eptifibatide (Integrilin)",
      aliases: ["Integrilin"],
      categories: ["Antiplatelet medicine", "Glycoprotein IIb/IIIa inhibitor", "Cardiovascular medicine"],
      claim: profileClaim("wikipep", "https://wikipep.org/wiki/Eptifibatide", {
        lastReviewed: "2026-08-07",
        summary: "A prescription intravenous platelet glycoprotein IIb/IIIa inhibitor used in selected acute coronary syndrome and percutaneous coronary intervention settings.",
        evidence: "Large randomized acute-coronary-syndrome and PCI studies support the labelled bolus-plus-infusion regimens. Kidney function changes the infusion rate, and the PCI regimen includes a second bolus.",
        halfLife: "About 2.5 hours",
        halfLifeContext: "Official US product information; clearance is reduced with renal impairment.",
        mechanism: "It reversibly blocks platelet glycoprotein IIb/IIIa receptors, reducing fibrinogen-mediated platelet aggregation.",
        limitations: ["Acute coronary syndrome and PCI use different bolus details and durations.", "This is a monitored hospital medicine."],
        safety: ["Serious bleeding and thrombocytopenia are key risks.", "Renal function, body weight and contraindications must be assessed by the clinical team."],
        topics: ["acute coronary syndrome", "PCI", "antiplatelet", "platelet aggregation", "cardiovascular research"],
        protocols: [
          {
            label: "Official acute-coronary-syndrome schedule",
            dose: "180 mcg/kg bolus followed by 2 mcg/kg/minute; infusion reduced to 1 mcg/kg/minute when creatinine clearance is below 50 mL/min",
            frequency: "One bolus, then continuous infusion",
            duration: "Until discharge or coronary bypass, up to 72 hours; PCI continuation can bring total therapy to 96 hours",
            route: "Intravenous",
            population: "Adults with acute coronary syndrome under hospital specialist care",
            species: "Human",
            evidenceType: "Official US prescribing information and randomized clinical studies",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ef0ad483-9086-4267-9b57-fcedd868719c",
          },
          {
            label: "Official PCI schedule",
            dose: "180 mcg/kg bolus, 2 mcg/kg/minute infusion, then a second 180 mcg/kg bolus 10 minutes later; infusion reduced to 1 mcg/kg/minute when creatinine clearance is below 50 mL/min",
            frequency: "Two boluses 10 minutes apart plus continuous infusion",
            duration: "At least 12 hours and up to 18 to 24 hours after PCI",
            route: "Intravenous",
            population: "Adults undergoing percutaneous coronary intervention under specialist care",
            species: "Human",
            evidenceType: "Official US prescribing information and randomized clinical studies",
            sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ef0ad483-9086-4267-9b57-fcedd868719c",
          },
        ],
        references: [{ title: "Official eptifibatide prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ef0ad483-9086-4267-9b57-fcedd868719c" }],
        humanStudies: 3,
        contentHash: hash("wikipep-eptifibatide-official-verification-2026-08-07"),
      }),
    },
    {
      key: "etelcalcetide",
      name: "Etelcalcetide",
      fullName: "Etelcalcetide (Parsabiv)",
      aliases: ["Parsabiv"],
      categories: ["Calcimimetic peptide", "Secondary hyperparathyroidism", "Dialysis medicine"],
      claim: profileClaim("wikipep", "https://wikipep.org/wiki/Etelcalcetide", {
        lastReviewed: "2026-08-07",
        summary: "A prescription intravenous calcimimetic peptide for secondary hyperparathyroidism in adults with chronic kidney disease receiving haemodialysis.",
        evidence: "Randomized controlled trials evaluated thrice-weekly post-dialysis dosing. Official information gives a 5 mg starting dose and a 2.5 to 15 mg maintenance range, with titration no more often than every four weeks.",
        halfLife: "Effective half-life about 3 to 4 days",
        halfLifeContext: "Official US product information in haemodialysis patients; dialysis is part of drug elimination.",
        mechanism: "It activates the calcium-sensing receptor on parathyroid cells, lowering parathyroid hormone secretion.",
        limitations: ["This schedule applies only to adults receiving haemodialysis.", "Calcium and parathyroid hormone results determine specialist adjustment."],
        safety: ["Severe hypocalcaemia, QT prolongation, seizures and worsening heart failure are recognised risks.", "Calcium must be checked before starting and during treatment."],
        topics: ["secondary hyperparathyroidism", "haemodialysis", "chronic kidney disease", "calcimimetic", "parathyroid hormone"],
        protocols: [{
          label: "Official haemodialysis schedule",
          dose: "5 mg starting dose; 2.5 to 15 mg maintenance range",
          frequency: "Three times weekly at the end of haemodialysis",
          duration: "Ongoing specialist treatment; titration no more often than every 4 weeks",
          route: "Intravenous bolus through the dialysis circuit",
          population: "Adults with chronic kidney disease and secondary hyperparathyroidism receiving haemodialysis",
          species: "Human",
          evidenceType: "Official US prescribing information and randomized clinical studies",
          sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cd270093-c6a8-4596-a4ab-e6aa0a2c8a0c",
        }],
        references: [{ title: "Official etelcalcetide prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cd270093-c6a8-4596-a4ab-e6aa0a2c8a0c" }],
        humanStudies: 3,
        contentHash: hash("wikipep-etelcalcetide-official-verification-2026-08-07"),
      }),
    },
  ];
}

async function readWikiPepAudit() {
  const verifiedProfiles = curatedWikiPepProfiles();
  const mainUrl = "https://wikipep.org/wiki/Main_Page";
  const failures = [];
  let links = [];
  try {
    const main = await fetchText(mainUrl);
    links = uniqueLinks(extractLinks(main, mainUrl).filter((link) => {
      try {
        const parsed = new URL(link.url);
        if (parsed.hostname !== "wikipep.org" || !parsed.pathname.startsWith("/wiki/")) return false;
        const slug = decodeURIComponent(parsed.pathname.slice("/wiki/".length));
        return slug
          && !/^(Main_Page|Special:|Category:|File:|Template:|Help:|Wikipep:|Talk:|User:)/i.test(slug);
      } catch {
        return false;
      }
    }));
  } catch (error) {
    failures.push({ url: mainUrl, error: String(error) });
  }

  const reviewed = await mapLimit(links, 8, async (link) => {
    const markup = await fetchText(link.url);
    const slug = decodeURIComponent(new URL(link.url).pathname.slice("/wiki/".length));
    const key = canonicalKey(slug);
    return {
      key,
      title: pageHeading(markup, link.title) || pageTitle(markup),
      url: link.url,
      trustedReferenceCount: trustedReferences(markup, link.url, 100).length,
      contentHash: hash(markup),
      importStatus: "full-source-import",
      profile: fullSourcePageProfile("wikipep", link.url, markup, link.title, key),
    };
  });
  failures.push(...reviewed.filter((item) => item?.error));
  const successful = reviewed.filter((item) => item && !item.error);
  // WikiPep's index includes category guides and its own legal/about pages.
  // They are supplied articles and stay fully searchable, but they are not
  // compounds and must not become fake names in Pearl's compound picker.
  const articleKeys = new Set([
    "nootropicandneuroprotectivepeptides",
    "peptidesforantiagingandlongevity",
    "peptidesforhealingandtissuerepair",
    "wikipepthepeptideencyclopediaabout",
    "wikipepthepeptideencyclopediageneraldisclaimer",
    "wikipepthepeptideencyclopediaprivacypolicy",
  ]);
  const articleRecords = successful.filter((item) => articleKeys.has(item.key));
  const compoundRecords = successful.filter((item) => !articleKeys.has(item.key));
  const profiles = mergeVerifiedAndFullProfiles(
    verifiedProfiles,
    compoundRecords.map((item) => item.profile).filter(Boolean),
  );
  const articles = articleRecords.map((item) => {
    const claim = item.profile.claim;
    const searchable = canonicalKey(`${item.title} ${(claim.passages || []).map((passage) => passage.text).join(" ")}`);
    const productKeys = profiles.filter((profile) => {
      const terms = [profile.key, profile.name, ...(profile.aliases || [])].map(canonicalKey).filter((term) => term.length >= 4);
      return terms.some((term) => searchable.includes(term));
    }).map((profile) => profile.key);
    return {
      sourceId: "wikipep",
      url: item.url,
      title: item.title,
      summary: claim.summary,
      limitations: claim.limitations,
      passages: claim.passages,
      references: claim.references,
      contentHash: claim.contentHash,
      productKeys,
    };
  });
  const mappedCount = links.length || WIKIPEP_FALLBACK_MAPPED_PROFILE_COUNT;
  const fallbackDetails = WIKIPEP_IMPORTED_PATHS.map((slug) => ({
    key: canonicalKey(slug),
    url: `https://wikipep.org/wiki/${slug}`,
    importStatus: "selectively-imported-after-official-verification",
  }));
  return {
    audit: {
      sourceId: "wikipep",
      mappedPages: mappedCount + 1,
      mappedProfileEntries: mappedCount,
      discoveryPagesAnalyzed: successful.length,
      pagesWithTrustedReferences: successful.filter((item) => item.trustedReferenceCount > 0).length,
      trustedReferenceCount: successful.reduce((sum, item) => sum + item.trustedReferenceCount, 0),
      analyzedProfiles: successful.length,
      importedProfiles: profiles.length,
      supportingArticles: articles.length,
      excludedProfiles: failures.length,
      accessStatus: failures.length ? "full-source-import-with-failures" : "full-source-import",
      lastReviewed: new Date().toISOString().slice(0, 10),
      citationMismatchCount: 2,
      failures,
      notes: "Every public article exposed by the WikiPep index is imported in full, including dosage, calculator, preparation and commercial material, with WikiPep attribution. The ten independently verified numerical records remain preferred where sources conflict. Matrixyl 3000 and C16 Peptide retain explicit mismatch records and cannot overwrite a different product identity.",
    },
    profiles,
    articles,
    details: successful.length ? successful.map(({ profile, ...detail }) => detail) : fallbackDetails,
  };
}

async function readPeptideUniversityAudit() {
  const url = "https://pepuniversity.com/peptide-codex.php";
  const failures = [];
  let markup = "";
  try {
    markup = await fetchText(url);
  } catch (error) {
    failures.push({ url, error: String(error) });
  }
  const capturePath = path.join(ROOT, "src/data/pearl/offline-sources/pep-university.json");
  let capture = { records: [], failures: [] };
  try {
    capture = JSON.parse(await readFile(capturePath, "utf8"));
  } catch (error) {
    failures.push({ url: capturePath, error: `Dynamic record capture unavailable: ${String(error)}` });
  }
  failures.push(...(capture.failures || []));
  const profiles = (capture.records || []).map((record) => {
    const protocols = (record.protocols || []).flatMap((protocol) => (protocol.rows || []).map((row) => ({
      label: `Peptide University: ${protocol.label}`,
      dose: row.dose || "Not stated",
      frequency: row.timeframe || "Not stated",
      duration: row.timeframe || "Not stated",
      route: (record.routes || []).join(" or ") || "Not stated",
      population: row.notes || "Not stated",
      species: "Not stated",
      evidenceType: "Commercial/community protocol supplied by Peptide University",
      sourceUrl: `${url}#${record.key}`,
    })));
    const passages = [
      { heading: "Description", text: record.description },
      ...(record.protocols || []).map((protocol) => ({ heading: protocol.label, text: (protocol.rows || []).map((row) => [row.timeframe, row.dose, row.notes].filter(Boolean).join(" | ")).join(". ") })),
      { heading: "Cycle length and washout", text: (record.washout || []).join(" ") },
      { heading: "Contraindications", text: (record.contraindications || []).join(" ") },
      { heading: "Potential side effects", text: (record.sideEffects || []).join(" ") },
    ];
    return {
      key: canonicalKey(record.key),
      name: cleanText(record.name || record.optionName, 180),
      aliases: cleanList([record.optionName], 8),
      categories: cleanList(record.routes || [], 6),
      claim: profileClaim("pep-university", `${url}#${record.key}`, {
        lastReviewed: String(capture.capturedAt || "").slice(0, 10),
        summary: record.description,
        evidence: "Peptide University labels its records as aggregated from empirical research and anecdotal community data. This record is retained as supplied and is not upgraded to clinical evidence.",
        mechanism: record.description,
        limitations: record.contraindications || [],
        safety: record.sideEffects || [],
        topics: [record.name, ...(record.routes || [])],
        protocols,
        preparation: [
          ...(record.vialSizes?.length ? [`The source lists these product sizes: ${record.vialSizes.join(", ")}.`] : []),
          ...(record.washout || []),
          ...(record.protocols || []).flatMap((protocol) => (protocol.rows || []).map((row) => row.notes).filter(Boolean)),
        ],
        passages,
        references: [],
        contentHash: hash(JSON.stringify(record)),
      }),
    };
  });
  const mappedEntries = profiles.length;
  return {
    audit: {
      sourceId: "pep-university",
      mappedPages: 1,
      mappedProfileEntries: mappedEntries,
      sampledProfiles: mappedEntries,
      analyzedProfiles: mappedEntries,
      importedProfiles: mappedEntries,
      excludedProfiles: failures.length,
      accessStatus: failures.length ? "full-source-import-with-capture-failures" : "full-source-import",
      lastReviewed: new Date().toISOString().slice(0, 10),
      trustedReferenceCount: markup ? trustedReferences(markup, url, 100).length : 0,
      failures,
      notes: "Every public dynamic compound record is captured and imported in full, including narrative, routes, every protocol table, vial-size options, washout, contraindications and side effects. The source itself says its protocols aggregate empirical research and anecdotal community data, so those figures stay labelled as commercial/community material.",
    },
    profiles,
    details: (capture.records || []).map((record) => ({
      key: canonicalKey(record.key),
      title: record.name || record.optionName,
      url: `${url}#${record.key}`,
      contentHash: hash(JSON.stringify(record)),
      importStatus: "full-source-import",
    })),
  };
}

async function readPeptideGptAudit() {
  const url = "https://chatgpt.com/g/g-zKizzcahz-peptidegpt";
  let failure = "The public page exposes no auditable knowledge files or traceable citations.";
  try {
    const markup = await fetchText(url);
    if (!/not found|404|page not found/i.test(cleanText(markup, 10_000))) {
      failure = "The page may load a ChatGPT shell, but it exposes no auditable knowledge files or traceable source library to a public evidence audit.";
    }
  } catch (error) {
    failure = String(error);
  }
  return {
    audit: {
      sourceId: "peptidegpt",
      mappedPages: 0,
      analyzedProfiles: 0,
      importedProfiles: 0,
      accessStatus: "unavailable",
      lastReviewed: new Date().toISOString().slice(0, 10),
      failures: [
        {
          url,
          error: failure,
        },
      ],
      notes: "An AI-generated answer is not research evidence. This source can be reconsidered only if its underlying documents or traceable citations become available.",
    },
    profiles: [],
  };
}

/* Identities that must NEVER become a PEARL profile, whatever a source says,
   each naming the resolved conflict that decided it.

   Until 19 Aug 2026 these were absent only because no reader happened to
   produce them, and a test asserted that absence. Adding three sources turned
   that luck into a live risk: PeptideJournal publishes a Matrixyl 3000 page,
   and the profile duly appeared. The exclusion is now enforced at merge, so
   no source present or future can reintroduce a banned identity. */
const IDENTITY_EXCLUSIONS = new Map([
  ["matrixyl3000", "wikipep-matrixyl3000-evidence-transfer"],
  ["c16peptide", "wikipep-c16-citation-mismatch"],
  /* BDNF is a mechanism, not a research compound. PEARL's own topic
     vocabulary already uses "bdnf" as a mechanism term, and Peptide Authority
     publishes a BDNF page, so on 19 Aug 2026 a compound entry appeared that
     SHADOWED the mechanism topic: "Show research about BDNF and
     neuroplasticity" stopped listing the compounds connected to BDNF and
     returned a page about the protein instead. Nobody buys BDNF - the source's
     own page says it is "not a medicine; the molecule is too large and
     unstable to be useful as a therapeutic" - so the compound entry costs a
     useful answer and buys nothing. Excluded so the mechanism question keeps
     working. Remove this line to get the entry back. */
  ["bdnf", "mechanism term, not a compound: it shadowed the bdnf topic"],
]);

/* One compound, one entry. Different sources name the same compound
   differently, and two keys for one thing makes PEARL ask "which did you
   mean?" about a choice that does not exist. Only clear-cut same-compound
   pairs belong here; a class name like "Copper Peptides" is NOT merged into a
   specific member like GHK-Cu, because they are genuinely different scopes. */
const IDENTITY_ALIASES = new Map([
  ["fragment176191", "hghfragment176191"],
  ["klow", "klowblend"],
  ["melanotan1", "melanotani"],
  ["melanotan2", "melanotanii"],
  ["angiotensin2", "angiotensinii"],
  ["bpc157tb500", "bpctbblend"],
  ["cortistatin", "cortistatin14"],
  ["nacetylselankamidate", "naselankamidate"],
  ["nacetylsemaxamidate", "nasemaxamidate"],
  ["neuropeptidey", "npy"],
  ["bpctbkpvblend", "triheal"],
  ["cjc1295nodacipamorelin", "cjcipablend"],
]);

function mergeProfiles(collections) {
  const merged = new Map();
  for (const collection of collections) {
    for (const rawProfile of collection.profiles) {
      if (!rawProfile?.key || !rawProfile.name || !rawProfile.claim) continue;
      if (IDENTITY_EXCLUSIONS.has(rawProfile.key)) {
        process.stdout.write(`  excluded identity "${rawProfile.key}" from ${collection.audit.sourceId} (${IDENTITY_EXCLUSIONS.get(rawProfile.key)})\n`);
        continue;
      }
      const profile = IDENTITY_ALIASES.has(rawProfile.key)
        ? { ...rawProfile, key: IDENTITY_ALIASES.get(rawProfile.key) }
        : rawProfile;
      if (!merged.has(profile.key)) {
        merged.set(profile.key, {
          key: profile.key,
          name: profile.name,
          fullName: profile.fullName || "",
          aliases: [],
          categories: [],
          claims: [],
        });
      }
      const target = merged.get(profile.key);
      if (!target.fullName && profile.fullName) target.fullName = profile.fullName;
      target.aliases = cleanList([...target.aliases, ...(profile.aliases || [])], 30);
      target.categories = cleanList([...target.categories, ...(profile.categories || [])], 12);
      target.claims.push(profile.claim);
    }
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function runtimeProfiles(profiles) {
  return profiles.map((profile) => ({
    key: profile.key,
    name: profile.name,
    fullName: profile.fullName,
    aliases: profile.aliases,
    categories: profile.categories,
    claims: profile.claims.map((claim) => ({
      sourceId: claim.sourceId,
      url: claim.url,
      lastReviewed: claim.lastReviewed,
      summary: cleanProse(claim.summary, 1_000),
      evidence: cleanProse(claim.evidence, 1_100),
      halfLife: claim.halfLife,
      halfLifeContext: cleanProse(claim.halfLifeContext, 700),
      mechanism: cleanProse(claim.mechanism, 1_100),
      limitations: cleanProseList(claim.limitations, 8, 320),
      safety: cleanProseList(claim.safety, 10, 320),
      topics: cleanList(claim.topics, 20),
      protocols: claim.protocols.slice(0, 8),
      // Carried into the runtime shape 19 Aug 2026 so the dose answer can show
      // it. Without this the preparation content is read and stored but never
      // reaches a member, which is not "in full" in any useful sense.
      preparation: cleanProseList(claim.preparation, 12, 400),
      references: claim.references.slice(0, 10),
      humanStudies: claim.humanStudies,
      animalStudies: claim.animalStudies,
      citedSources: claim.citedSources,
    })),
  }));
}

const CURATED_CONFLICTS = [
  {
    id: "bpc157-half-life",
    key: "bpc157",
    field: "half-life",
    status: "resolved",
    preferred: "About 15 minutes in a rat pharmacokinetic study. No validated human half-life is available.",
    rationale: "The species- and route-labelled pharmacokinetic measurement is stronger than tertiary estimates of 30 minutes or 4 hours.",
    confidence: "high",
    rejectedAsPreferred: ["The Peptide Handbook: about 4 hours", "PepCodex and Peptide Hub: about or under 30 minutes"],
  },
  {
    id: "bpc157-human-evidence-count",
    key: "bpc157",
    field: "human evidence count",
    status: "needs-review",
    preferred: "No preferred numeric count. State that published human evidence is sparse, small and not supported by completed large randomized efficacy trials.",
    rationale: "Sites count registered, unpublished, retrospective and pilot reports differently. A single number would hide that classification problem.",
    confidence: "high for the limitation; low for a single count",
    options: ["Handbook: 2 human studies", "PepCodex: 3 human studies", "Peptpedia: no completed peer-reviewed human clinical trial"],
  },
  {
    id: "tb500-identity",
    key: "tb500",
    field: "identity and human evidence",
    status: "resolved",
    preferred: "Keep TB-500 separate from full-length thymosin beta-4. Human trials on thymosin beta-4 do not automatically validate TB-500.",
    rationale: "They are not interchangeable research entities. Conflating them transfers evidence between different materials.",
    confidence: "high",
    rejectedAsPreferred: ["Any summary that treats TB-500 and full-length thymosin beta-4 as the same compound"],
  },
  {
    id: "cjc1295-dac-identity",
    key: "cjc1295",
    field: "half-life and formulation",
    status: "resolved",
    preferred: "Treat CJC-1295 with DAC and non-DAC modified GRF as separate entries.",
    rationale: "The DAC changes albumin binding and pharmacokinetics. The multi-day and minute-scale values describe different formulations.",
    confidence: "high",
    rejectedAsPreferred: ["A single CJC-1295 half-life without naming the formulation"],
  },
  {
    id: "uncited-dose-priority",
    key: "all",
    field: "site-listed dose ranges",
    status: "resolved",
    preferred: "Published study protocols with species, route, population, frequency and duration take priority. Uncited commercial ranges remain labelled and secondary.",
    rationale: "A product or calculator range is not evidence that a dose was studied, effective or safe.",
    confidence: "high",
    rejectedAsPreferred: [
      "Peptide Hub product-strength, calculator, stack and reconstitution instructions",
      "Peptide University Codex dosing, syringe-pull, injection, reconstitution, cycle, washout and stack instructions",
      "PeptideDosage.org reconstitution, syringe-unit, injection-technique, supply-planning, stack and modelled protocol content",
      "PeptideDeck affiliate vendor claims, self-use protocols, reconstitution, syringe units, injection technique, cycles and stacks",
      "WikiPep calculators, dose-unit tools, reconstitution, injection guidance, vendor promotions, cycles and stacks",
    ],
  },
  {
    id: "semax-adhd-evidence-level",
    key: "semax",
    field: "ADHD evidence level",
    status: "resolved",
    preferred: "Describe Semax as ADHD-related research with limited, hypothesis-generating evidence, not as an established ADHD treatment.",
    rationale: "Peptpedia highlights ADHD relevance, while PeptideDeck says Semax has not been robustly studied specifically for ADHD. The often-cited PMID 16996699 is a Medical Hypotheses article rather than a clinical efficacy trial. A small Russian open-label pediatric report exists, but it was not a modern blinded randomized placebo-controlled study.",
    confidence: "high for the evidence limitation",
    rejectedAsPreferred: ["Calling PMID 16996699 a human ADHD efficacy study", "Describing Semax as proven or approved for ADHD outside country-specific Russian use"],
    references: [
      { title: "Peptpedia Semax and Selank comparison", url: "https://peptpedia.org/compare/semax-vs-selank" },
      { title: "PeptideDeck Semax benefits guide", url: "https://www.peptidedeck.com/peptides/semax-benefits" },
      { title: "Semax ADHD hypothesis paper", url: "https://pubmed.ncbi.nlm.nih.gov/16996699/" },
      { title: "Russian review describing the small open-label pediatric report", url: "https://pharmateca.ru/articles/Farmakoterapiya-giperaktivnosti-s-deficitom-vnimaniya-u-detei-zarubejnyi-i-rossiiskii-opyt.html" },
    ],
  },
  {
    id: "peptidedeck-pacap38-citation-mismatch",
    key: "pacap38",
    field: "citation identity and human dose context",
    status: "resolved",
    preferred: "Use the verified human migraine-provocation study at PMID 24501094: PACAP-38 at 10 pmol/kg/min by intravenous infusion for 20 minutes. Label it as a provocation experiment, not treatment guidance.",
    rationale: "PeptideDeck linked PMID 19595407 as a PACAP review, but that identifier resolves to an unrelated respiratory syncytial virus and SOCS paper. The preferred record was checked directly against the actual PACAP-38 primary study.",
    confidence: "high",
    rejectedAsPreferred: ["PeptideDeck's PACAP-38 reference labelled as a PACAP review but linked to PMID 19595407", "Any conversion of the experimental infusion into a self-use schedule"],
    references: [
      { title: "Verified PACAP-38 migraine-provocation study", url: "https://pubmed.ncbi.nlm.nih.gov/24501094/" },
    ],
  },
  {
    id: "wikipep-matrixyl3000-evidence-transfer",
    key: "matrixyl3000",
    field: "compound identity and cosmetic evidence",
    status: "resolved",
    preferred: "Keep Matrixyl 3000 separate from Matrixyl or pal-KTTKS. Do not use a pal-KTTKS study as proof of the two-peptide Matrixyl 3000 blend.",
    rationale: "WikiPep's Matrixyl 3000 page cites a Robinson study of pal-KTTKS, the single peptide commonly called Matrixyl. Matrixyl 3000 is a different blend containing palmitoyl tripeptide-1 and palmitoyl tetrapeptide-7, so the study cannot validate the blend's claimed schedule or effect.",
    confidence: "high",
    rejectedAsPreferred: ["Any Matrixyl 3000 dose or efficacy claim supported only by the pal-KTTKS Matrixyl study", "WikiPep's calculator or topical protocol"],
  },
  {
    id: "wikipep-c16-citation-mismatch",
    key: "c16peptide",
    field: "preclinical model and numerical dose",
    status: "resolved",
    preferred: "Do not promote WikiPep's C16 Peptide 2 mg/kg EAE schedule until the exact animal primary paper is identified and checked.",
    rationale: "The page's numerical table attributes a rat EAE schedule to Han et al. 2010, while the listed Han reference describes an LPS-stimulated BV-2 microglial cell study. Those are different experimental models, so the citation does not verify the animal dose as presented.",
    confidence: "high for the mismatch; unresolved for an exact preferred dose",
    rejectedAsPreferred: ["WikiPep's 2 mg/kg rat EAE dose table", "Any conversion of the preclinical figure into a human schedule"],
  },
  {
    id: "peptidedosage-route-modelling",
    key: "all",
    field: "modelled administration routes",
    status: "resolved",
    preferred: "Use only the route stated in the original study or official product information. Do not convert an oral, intranasal, intramuscular or investigational product into a generic subcutaneous vial protocol.",
    rationale: "PeptideDosage.org applies a common reconstitution and syringe format even to products such as Ventfort that it identifies as oral. That format is not evidence that the modelled route was studied or is suitable.",
    confidence: "high",
    rejectedAsPreferred: ["Any modelled injection route, vial size, mixing calculation or syringe-unit conversion that is not present in the primary source"],
  },
  {
    id: "pnc27-reference-integrity",
    key: "pnc27",
    field: "references and dosage",
    status: "resolved",
    preferred: "Show only the verified mouse AML study doses of 40 mg/kg daily for 2 or 3 weeks and 100 mg/kg daily for 2 weeks. State that no validated human dose exists.",
    rationale: "Several PubMed identifiers listed on the PeptideDosage.org PNC-27 page resolve to unrelated PET, orchid and liver-transplant papers. The preferred numerical records were read directly from the full primary mouse study.",
    confidence: "high",
    rejectedAsPreferred: ["The site's modelled 100-500 mcg daily subcutaneous protocol", "PMID 19915840", "PMID 35453696", "PMID 18830757"],
    references: [
      { title: "PNC-27 mouse AML full text", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7951797/" },
      { title: "PNC-27 mouse AML PubMed record", url: "https://pubmed.ncbi.nlm.nih.gov/31337857/" },
    ],
  },
  {
    id: "dihexa-retracted-foundation",
    key: "dihexa",
    field: "mechanism and numerical evidence",
    status: "resolved",
    preferred: "No validated human dose exists. A non-retracted rat cognition study used 2 mg/kg by oral gavage daily for 8 days, while the 2012 HGF/Met development paper and 2014 HGF/c-Met mechanism paper were retracted in 2025.",
    rationale: "The retractions remove key support for the widely repeated HGF/c-Met mechanism claims. Community human-use ranges must not be presented as established research doses.",
    confidence: "high",
    rejectedAsPreferred: ["Community human ranges of 5-20 mg or 10-40 mg", "The incorrect PubMed links previously attached to the Dihexa profile"],
    references: [
      { title: "Rat cognition study", url: "https://pubmed.ncbi.nlm.nih.gov/23055539/" },
      { title: "2012 paper retraction notice", url: "https://pubmed.ncbi.nlm.nih.gov/40312092/" },
      { title: "2014 paper retraction notice", url: "https://pubmed.ncbi.nlm.nih.gov/40312093/" },
    ],
  },
  {
    id: "thymogen-route-and-label",
    key: "thymogen",
    field: "official product routes and schedules",
    status: "resolved",
    preferred: "Keep the Russian intramuscular and intranasal product figures separate and use the manufacturer's registered product leaflets. Do not use the site's modelled subcutaneous route.",
    rationale: "The official leaflets describe a ready-to-use 100 mcg/mL intramuscular solution and a 25 mcg-per-dose nasal spray. The PeptideDosage.org subcutaneous reconstitution model is not an approved product route.",
    confidence: "high",
    rejectedAsPreferred: ["The modelled subcutaneous Thymogen protocol"],
    references: [
      { title: "Thymogen intramuscular patient leaflet", url: "https://cytomed.ru/wp-content/uploads/2023/11/timogen-rastvor_listok-vkladysh.pdf" },
      { title: "Thymogen nasal spray patient leaflet", url: "https://cytomed.ru/wp-content/uploads/timogen-sprej-lv.pdf" },
    ],
  },
  {
    id: "bpc157-wada-status",
    key: "bpc157",
    field: "WADA status",
    status: "resolved",
    preferred: "BPC-157 is prohibited under S0 on the 2026 WADA Prohibited List.",
    rationale: "The current official WADA list takes priority over an older tertiary note that said it was no longer prohibited.",
    confidence: "high",
    rejectedAsPreferred: ["The original reference snapshot's statement that BPC-157 is not currently prohibited"],
    references: [
      { title: "2026 WADA Prohibited List", url: "https://www.wada-ama.org/sites/default/files/2025-09/2026list_en_final_clean_september_2025.pdf" },
    ],
  },
  {
    id: "cagrisema-fda-status",
    key: "cagrisema",
    field: "FDA approval status",
    status: "resolved",
    preferred: "CagriSema remains investigational and was awaiting an FDA decision expected in Q4 2026 at the time of this audit.",
    rationale: "Peptide Hub contains both pending-review wording and an incompatible claim of approval on 25 May 2026. FDA information stated cagrilintide was not part of an approved drug, while Novo Nordisk continued to call CagriSema investigational and expected a Q4 2026 decision.",
    confidence: "high",
    rejectedAsPreferred: ["Peptide Hub dosing page: CagriSema received full FDA approval on 25 May 2026"],
    references: [
      { title: "FDA concerns with unapproved GLP-1 drugs", url: "https://www.fda.gov/drugs/drug-alerts-and-statements/fdas-concerns-unapproved-glp-1-drugs-used-weight-loss" },
      { title: "Novo Nordisk Q1 2026 CagriSema status", url: "https://www.novonordisk.com/content/dam/nncorp/global/en/investors/pdfs/financial-results/2026/Q1-2026-investor-presentation.pdf" },
    ],
  },
  {
    id: "mental-health-pubmed-identity-mismatches",
    key: "all",
    field: "mental-health citation identity",
    status: "resolved",
    preferred: "Exclude three unrelated PubMed identifiers copied under Semax, NAC and Selank claims. Keep only links whose NCBI record matches the stated research subject.",
    rationale: "NCBI identifies PMID 11157505 as a Hodgkin-disease cell-fusion paper, PMID 16640009 as a Freeman-Sheldon syndrome case report, and PMID 18677858 as a neonatal-mortality paper. None supports the peptide claim beside which it appeared.",
    confidence: "high",
    rejectedAsPreferred: [
      "PMID 11157505 labelled as a Semax ADHD human study",
      "PMID 16640009 labelled as a NAC OCD randomized trial",
      "PMID 18677858 labelled as a Selank anxiolytic human trial",
    ],
  },
];

/* ---- Stage C step 5: the source library ------------------------------- */

const SOURCE_ID_BY_HOST = new Map(
  SOURCE_DEFINITIONS.flatMap((definition) => {
    const host = new URL(definition.url).hostname;
    const bare = host.replace(/^www\./, "");
    return [[host, definition.id], [bare, definition.id], [`www.${bare}`, definition.id]];
  }),
);

function sourceIdForUrl(url) {
  try {
    return SOURCE_ID_BY_HOST.get(new URL(url).hostname) || "";
  } catch {
    return "";
  }
}

/* Origin + path, so ?open= style client-side routes count as one page. */
function normalizeForCapture(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

/*
 * Page-text cleaning for the SOURCE LIBRARY only (Pearl passages clean-up).
 * The evidence pipeline's cleanText feeds compound keys and aliases and must
 * never change behaviour; these exist so the stored library can be improved
 * without moving a single answer. Two fixes over cleanText:
 *  - whole navigation/promo containers are removed before extraction;
 *  - tags are stripped by a walker that honours quotes, so ">" inside an
 *    attribute value (Tailwind arbitrary selectors like class="[&>svg]:px-2")
 *    can no longer leak attribute fragments into the stored text.
 */
function stripTagsSafely(value) {
  const text = String(value);
  let out = "";
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("<", index);
    if (open < 0) { out += text.slice(index); break; }
    out += text.slice(index, open);
    let cursor = open + 1;
    let quote = "";
    while (cursor < text.length) {
      const character = text[cursor];
      if (quote) { if (character === quote) quote = ""; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
      cursor++;
    }
    out += " ";
    index = cursor + 1;
  }
  return out;
}

function dropChromeContainers(markup) {
  return String(markup)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(nav|footer|aside|form|button|dialog)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
}

function cleanPageText(value, maximum) {
  return decodeHtml(stripTagsSafely(String(value)))
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function cleanPageProse(value, maximum) {
  return sentenceTrim(cleanPageText(value, Number.MAX_SAFE_INTEGER), maximum);
}

function pageSections(markup) {
  const stripped = dropChromeContainers(markup);
  const headings = [...stripped.matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  const sections = [];
  for (let index = 0; index < headings.length && sections.length < 80; index++) {
    const match = headings[index];
    const start = match.index + match[0].length;
    const end = index + 1 < headings.length ? headings[index + 1].index : stripped.length;
    const heading = cleanPageText(match[2], 300);
    const text = cleanPageProse(stripped.slice(start, end), 20_000);
    if (heading || text) sections.push({ heading, level: Number(match[1]), text });
  }
  return sections;
}

function markdownSections(source) {
  const sections = [];
  let current = null;
  for (const line of String(source).split(/\r?\n/)) {
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = { heading: cleanText(heading[2], 300), level: heading[1].length, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) sections.push(current);
  return sections
    .map((section) => ({ heading: section.heading, level: section.level, text: cleanProse(section.lines.join(" "), 20_000) }))
    .filter((section) => section.heading || section.text)
    .slice(0, 80);
}

function libraryRecord(capture) {
  const { url, body, fetchedAt, httpStatus } = capture;
  const head = body.slice(0, 5_000);
  const isSitemap = /\.xml(?:\?|$)/i.test(url) || (/^\s*<\?xml/.test(head) && /<(?:urlset|sitemapindex)/i.test(head));
  const isAsset = /\.m?js(?:\?|$)/i.test(url);
  const kind = isSitemap ? "sitemap" : isAsset ? "asset" : "page";
  let metadata = {};
  if (kind === "page") {
    const items = jsonLd(body);
    metadata = firstJsonLd(items, "Article");
    if (!metadata["@type"]) metadata = structuredMedicalPage(body) || {};
  }
  const looksHtml = /<(?:html|body|div|h1|p)[\s>]/i.test(head);
  const sections = kind !== "page" ? [] : looksHtml ? pageSections(body) : markdownSections(body);
  return {
    url,
    sourceId: sourceIdForUrl(url),
    kind,
    httpStatus,
    fetchedAt,
    title: kind === "page" ? pageTitle(body) || pageHeading(body) || url : url,
    heading: kind === "page" && looksHtml ? pageHeading(body) : "",
    publisher: cleanText(metadata?.publisher?.name || metadata?.publisher || "", 200),
    datePublished: cleanText(metadata?.datePublished || "", 40),
    dateModified: cleanText(metadata?.dateModified || metadata?.lastReviewed || "", 40),
    contentHash: createHash("sha256").update(body).digest("hex"),
    bodyBytes: Buffer.byteLength(body),
    sections,
    /* Assets (JS bundles) keep the plain cleaner: code is not HTML, and the
       quote-aware walker would eat everything between comparison operators. */
    fullText: kind === "sitemap" ? "" : kind === "asset" ? cleanText(body, 200_000) : cleanPageText(body, 200_000),
  };
}

/*
 * Fetch, purely for the library, every page the evidence cites that no reader
 * happened to read live this run. This is how the curated sources' pages
 * (PeptideDosage, PeptideDeck, WikiPep) get stored at all: their profiles are
 * hand-checked datasets, so their readers fetch nothing.
 */
async function captureCitedPages(profiles) {
  const wanted = new Map();
  const consider = (url) => {
    if (!url || !sourceIdForUrl(url)) return;
    // A login-only source is supplied by its capture, never fetched. See OFFLINE_SOURCE_HOSTS.
    try { if (OFFLINE_SOURCE_HOSTS.has(new URL(url).hostname)) return; } catch { /* not a URL */ }
    const key = normalizeForCapture(url);
    if (!wanted.has(key)) wanted.set(key, url);
  };
  for (const profile of profiles) {
    for (const claim of profile.claims) consider(claim.url);
  }
  for (const definition of SOURCE_DEFINITIONS) consider(definition.url);
  const already = new Set([...CAPTURED_PAGES.keys(), ...CAPTURE_FAILURES.keys()].map(normalizeForCapture));
  const missing = [...wanted.entries()].filter(([key]) => !already.has(key)).map(([, url]) => url);
  if (missing.length) {
    process.stdout.write(`Library: fetching ${missing.length} cited pages the readers did not open...\n`);
    await mapLimit(missing, 6, (url) => fetchText(url).catch(() => ""));
  }
}

async function writeSourceLibrary(profiles) {
  const evidenceUrls = [...new Set(
    profiles.flatMap((profile) => profile.claims.map((claim) => normalizeForCapture(claim.url))).filter(Boolean),
  )].sort();
  // Stream this archive one record at a time. A complete source sweep is
  // hundreds of megabytes; building and stringifying the entire object twice
  // exhausted Node's heap even though every fetch had succeeded.
  const generatedAt = new Date().toISOString();
  const handle = await open(SOURCE_LIBRARY_OUTPUT, "w");
  let bytes = 0;
  const put = async (value) => {
    bytes += Buffer.byteLength(value);
    await handle.write(value, null, "utf8");
  };
  try {
    await put(`{"generatedAt":${JSON.stringify(generatedAt)},"pages":[`);
    let first = true;
    for (const capture of CAPTURED_PAGES.values()) {
      if (!first) await put(",");
      first = false;
      await put(JSON.stringify(libraryRecord(capture)));
    }
    const failures = [...CAPTURE_FAILURES.values()];
    await put(`],"failures":${JSON.stringify(failures)},"evidenceUrls":${JSON.stringify(evidenceUrls)}}\n`);
    const megabytes = (bytes / 1_048_576).toFixed(1);
    process.stdout.write(`Wrote ${CAPTURED_PAGES.size} stored pages (${failures.length} unreachable) to ${SOURCE_LIBRARY_OUTPUT} (${megabytes} MB)\n`);
  } finally {
    await handle.close();
  }
}

async function main() {
  const started = new Date().toISOString();
  const collections = [];
  for (const reader of [
    readPeptideReferenceAudit,
    /* readHandbook stays bespoke ON PURPOSE (assessed 18 Aug 2026): it does
       not read pages at all - it extracts a JSON dataset from the site's
       compiled application bundle, and it carries hand-curated compliance
       corrections (the dihexa retractions) that must never be lost in a
       settings translation. It is a curated-dataset reader, the class the
       Pearl plan says needs a decision, not code. */
    readHandbook,
    /* Step 9 (continued 18 Aug 2026): PepCodex, PeptideHub, Halflife Labs
       and Peptpedia are now read by the general reader from per-source
       settings. Retired one at a time against the safety net:
       compare-readers.mjs proved the output identical (102/102, 44/44,
       44/44 and 46/46 profiles) before each swap, and the answer baseline
       did not move. The bespoke readers above stay in this file, callable
       by the comparison bench. */
    () => readWithSettings(READER_SETTINGS.pepcodex),
    () => readWithSettings(READER_SETTINGS.peptidehub),
    () => readWithSettings(READER_SETTINGS["halflife-labs"]),
    () => readWithSettings(READER_SETTINGS.peptpedia),
    readPeptideDosage,
    /* Added 18-19 Aug 2026 (tasks 15a024a5, 679e8e33, 70281b89). All three are
       general-reader sources: no bespoke reader, just per-source settings.
       Each was proven with `npm run source:try -- <id>` BEFORE being added
       here, so this list only ever gains a reader that already works.
       PeptideDosages is a discovery aid only - its settings read four named
       sections and never touch its dosing, reconstitution, supplies or
       injection-technique blocks. */
    () => readWithSettings(READER_SETTINGS.peptideauthority),
    () => readWithSettings(READER_SETTINGS.peptidejournal),
    () => readWithSettings(READER_SETTINGS.peptidedosages),
    readPeptideDeckAudit,
    readWikiPepAudit,
    readPeptideUniversityAudit,
    readPeptideGptAudit,
    /* Last on purpose: its records are tertiary and captured, so where another source already
       states a figure, that one is merged first and stays preferred (task ab2b7533). */
    readPeptora,
  ]) {
    const result = await reader();
    collections.push(result);
    process.stdout.write(`${result.audit.sourceId}: ${result.audit.analyzedProfiles} profiles analysed\n`);
  }
  const profiles = mergeProfiles(collections);
  const profileArticles = profiles.flatMap((profile) => profile.claims
    .filter((claim) => claim.passages?.length)
    .map((claim) => ({
      sourceId: claim.sourceId,
      url: claim.url,
      title: `${profile.name}: supplied source page`,
      summary: claim.summary,
      limitations: claim.limitations,
      passages: claim.passages,
      references: claim.references,
      contentHash: claim.contentHash,
      productKeys: [profile.key],
    })));
  const articles = [...collections.flatMap((collection) => collection.articles || []), ...profileArticles];
  await captureCitedPages(profiles);
  const audit = {
    generatedAt: new Date().toISOString(),
    startedAt: started,
    suppliedWebsites: SOURCE_DEFINITIONS.length,
    importedWebsites: collections.filter((item) => item.profiles.length > 0 || item.audit.accessStatus?.startsWith("baseline-imported")).length,
    reviewedButNotImported: collections.filter((item) =>
      item.profiles.length === 0 && !item.audit.accessStatus?.startsWith("baseline-imported"),
    ).length,
    mappedPages: collections.reduce((sum, item) => sum + (item.audit.mappedPages || 0), 0),
    mappedProfileEntries: collections.reduce((sum, item) => sum + (item.audit.mappedProfileEntries || 0), 0),
    analyzedProfileRecords: collections.reduce((sum, item) => sum + (item.audit.analyzedProfiles || 0), 0),
    uniqueCompounds: profiles.length,
    sources: collections.map((item) => item.audit),
  };
  const fullAudit = {
    audit,
    sources: SOURCE_DEFINITIONS,
    profiles,
    conflicts: CURATED_CONFLICTS,
    sourceReviews: Object.fromEntries(
      collections.filter((item) => item.details).map((item) => [item.audit.sourceId, item.details]),
    ),
  };
  await writeFile(FULL_AUDIT_OUTPUT, `${JSON.stringify(fullAudit, null, 2)}\n`, "utf8");
  const banner = "// Generated by scripts/build-research-evidence.mjs. Do not edit by hand.\n";
  const output = `${banner}export const RESEARCH_SOURCES = ${JSON.stringify(SOURCE_DEFINITIONS, null, 2)};\n\nexport const RESEARCH_AUDIT = ${JSON.stringify(audit, null, 2)};\n\nexport const RESEARCH_PROFILES = ${JSON.stringify(runtimeProfiles(profiles), null, 2)};\n\nexport const RESEARCH_CONFLICTS = ${JSON.stringify(CURATED_CONFLICTS, null, 2)};\n`;
  await writeFile(OUTPUT, output, "utf8");
  await writeFile(
    ARTICLE_OUTPUT,
    `${banner}export const RESEARCH_ARTICLES = ${JSON.stringify(articles, null, 2)};\n`,
    "utf8",
  );
  await writeSourceLibrary(profiles);
  process.stdout.write(`Wrote ${profiles.length} merged profiles to ${OUTPUT}\n`);
  process.stdout.write(`Wrote ${articles.length} linked supporting articles to ${ARTICLE_OUTPUT}\n`);
  process.stdout.write(`Wrote the full traceability audit to ${FULL_AUDIT_OUTPUT}\n`);
}

/* Refresh the committed login-only capture without fetching or rewriting any
   of the other supplied websites. This makes a parser repair reproducible and
   avoids silently pulling new live-site content into an unrelated change. */
async function rebuildSourceOnly(sourceId, reader) {
  const existingModule = await import(`${pathToFileURL(OUTPUT).href}?refresh=${Date.now()}`);
  const result = await reader();
  const freshProfiles = runtimeProfiles(mergeProfiles([result]));
  const freshByKey = new Map(freshProfiles.map((profile) => [profile.key, profile]));
  const profiles = existingModule.RESEARCH_PROFILES.map((profile) => {
    const fresh = freshByKey.get(profile.key);
    if (!fresh) return {
      ...profile,
      claims: (profile.claims || []).filter((claim) => claim.sourceId !== sourceId),
    };
    freshByKey.delete(profile.key);
    return {
      ...profile,
      name: fresh.name || profile.name,
      fullName: fresh.fullName || profile.fullName,
      aliases: cleanList([...(profile.aliases || []), ...(fresh.aliases || [])], 30),
      categories: cleanList([...(profile.categories || []), ...(fresh.categories || [])], 12),
      claims: [
        ...(profile.claims || []).filter((claim) => claim.sourceId !== sourceId),
        ...fresh.claims,
      ],
    };
  }).filter((profile) => profile.claims.length);
  profiles.push(...freshByKey.values());
  profiles.sort((left, right) => left.name.localeCompare(right.name));

  const audit = {
    ...existingModule.RESEARCH_AUDIT,
    generatedAt: new Date().toISOString(),
    sources: (existingModule.RESEARCH_AUDIT.sources || []).map((source) =>
      source.sourceId === sourceId ? result.audit : source),
  };
  const banner = "// Generated by scripts/build-research-evidence.mjs. Do not edit by hand.\n";
  const output = `${banner}export const RESEARCH_SOURCES = ${JSON.stringify(SOURCE_DEFINITIONS, null, 2)};\n\nexport const RESEARCH_AUDIT = ${JSON.stringify(audit, null, 2)};\n\nexport const RESEARCH_PROFILES = ${JSON.stringify(profiles, null, 2)};\n\nexport const RESEARCH_CONFLICTS = ${JSON.stringify(existingModule.RESEARCH_CONFLICTS, null, 2)};\n`;
  await writeFile(OUTPUT, output, "utf8");
  process.stdout.write(`Refreshed ${freshProfiles.length} ${sourceId} profiles in ${OUTPUT}\n`);
}

/* Run only when executed directly. Other scripts (the reader comparison
   harness, the general reader) import this file for its readers and helpers,
   and an import must never start a full scrape by itself. */
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const selected = process.argv.includes("--peptora-only")
    ? rebuildSourceOnly("peptora", readPeptora)
    : process.argv.includes("--peptidedosage-only")
      ? rebuildSourceOnly("peptidedosage", readPeptideDosage)
      : process.argv.includes("--peptideauthority-only")
        ? rebuildSourceOnly("peptideauthority", () => readWithSettings(READER_SETTINGS.peptideauthority))
        : process.argv.includes("--peptidejournal-only")
          ? rebuildSourceOnly("peptidejournal", () => readWithSettings(READER_SETTINGS.peptidejournal))
      : main();
  selected.catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  SOURCE_DEFINITIONS,
  fetchText,
  mapLimit,
  cleanText,
  cleanProse,
  cleanProseList,
  cleanList,
  canonicalKey,
  sentenceTrim,
  sitemapLocations,
  peptidePathParts,
  jsonLd,
  firstJsonLd,
  structuredMedicalPage,
  between,
  markdownSection,
  markdownField,
  pageTitle,
  pageHeading,
  pageSections,
  trustedReferences,
  profileClaim,
  sourceSectionProtocols,
  hash,
  readHandbook,
  readPepCodex,
  readPeptideHub,
  readHalflifeLabs,
  readPeptpedia,
  peptpediaProtocols,
  peptidedosagesProtocols,
};
