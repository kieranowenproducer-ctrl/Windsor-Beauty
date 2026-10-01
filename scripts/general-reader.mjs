/**
 * The general source reader (Pearl plan Stage D step 9).
 *
 * Pearl used to need a hand-written reader for every source website. This
 * module replaces that with ONE reader driven by per-source settings: where
 * to find the pages, and a small pipeline of extraction steps for each field.
 * Adding or adjusting a source becomes a settings change, not new code.
 *
 * A bespoke reader is only retired when this general reader, given that
 * source's settings, produces EXACTLY the same profiles — proven by
 * scripts/compare-readers.mjs against the safety net. Until a source passes
 * that bar, its bespoke reader keeps running.
 *
 * Extraction pipeline ops (each takes the previous value, or starts it):
 *   { get: 'drug.name' }          read from the page context (dot path)
 *   { const: value }              a fixed value
 *   { fallback: [[...], [...]] }  first pipeline that yields a non-empty value
 *   { match: p, flags, group }    regex over a string; the numbered group
 *   { matchAll: p, flags }        every regex match (array of full matches)
 *   { split: p } { splitCommas }  string to array
 *   { splitBefore: text }         keep what comes before a marker
 *   { replace: [p, r], flags }    regex replace
 *   { replaceAll: [from, to] }    plain text replace
 *   { cleanText: n } { cleanProse: n } { cleanList: n } { asArray: true }
 *   { between: {start, ends, max} }   text between two markers
 *   { mapProse: n }                   cleanProse every item of an array
 *   { matchFormat: {pattern, format} }  regex over a string; "{1} and {2}"
 *                                     style format filled from the trimmed
 *                                     groups, or empty when nothing matches
 *   { join: {parts: [[...]], with} }  run several pipelines, join the
 *                                     non-empty results with a separator
 * Page context: url, parts (path pieces), markup, text, page (MedicalWebPage),
 * drug (Drug), article (Article), title (page <title>), siblings (values
 * gathered from this profile's sibling pages - see settings.siblings).
 *
 * settings.dropBareHostReferences drops citations that point at a host's
 * front door rather than a page, for sources that link their trusted
 * sources in the footer.
 * Discovery: { sitemap } for one sitemap, or { sitemapIndex } for an index
 * whose child sitemaps are all fetched and merged. settings.siblings gathers
 * values from OTHER pages of the same source (for example, per-condition
 * pages) into each profile's context, keyed by the same canonical key.
 * Numeric claim fields (humanStudies, animalStudies, citedSources) come from
 * ordinary field pipelines when the settings define them.
 */
import {
  fetchText,
  mapLimit,
  cleanText,
  cleanProse,
  cleanList,
  canonicalKey,
  sitemapLocations,
  peptidePathParts,
  jsonLd,
  firstJsonLd,
  between,
  markdownField,
  markdownSection,
  pageTitle,
  pageSections,
  trustedReferences,
  profileClaim,
  hash,
} from "./build-research-evidence.mjs";

function dig(context, path) {
  return String(path).split(".").reduce((value, key) => (value == null ? value : value[key]), context);
}

function runPipeline(steps, context, seed) {
  let value = seed;
  for (const step of steps || []) {
    if (step.get !== undefined) value = dig(context, step.get);
    else if (step.const !== undefined) value = step.const;
    else if (step.fallback) {
      value = undefined;
      for (const candidate of step.fallback) {
        const attempt = runPipeline(candidate, context);
        if (attempt !== undefined && attempt !== null && attempt !== "" && !(Array.isArray(attempt) && !attempt.length)) { value = attempt; break; }
      }
    }
    else if (step.match) value = String(value ?? "").match(new RegExp(step.match, step.flags || "i"))?.[step.group ?? 1] ?? "";
    else if (step.matchAll) value = [...String(value ?? "").matchAll(new RegExp(step.matchAll, step.flags || "gi"))].map((found) => found[0]);
    else if (step.split) value = String(value ?? "").split(new RegExp(step.split));
    else if (step.splitCommas) value = String(value ?? "").split(/\s*,\s*/);
    else if (step.splitBefore) value = String(value ?? "").split(step.splitBefore)[0];
    else if (step.replace) value = String(value ?? "").replace(new RegExp(step.replace[0], step.flags || "i"), step.replace[1]);
    else if (step.replaceAll) value = String(value ?? "").replaceAll(step.replaceAll[0], step.replaceAll[1]);
    else if (step.cleanText) value = cleanText(value, step.cleanText);
    else if (step.cleanProse) value = cleanProse(value, step.cleanProse);
    else if (step.cleanList) value = cleanList(Array.isArray(value) ? value : [value], step.cleanList);
    else if (step.asArray) value = value == null || value === "" ? [] : Array.isArray(value) ? value : [value];
    else if (step.between) value = between(String(value ?? ""), step.between.start, step.between.ends, step.between.max);
    else if (step.mapProse) value = (Array.isArray(value) ? value : []).map((item) => cleanProse(item, step.mapProse)).filter(Boolean);
    else if (step.mapText) value = (Array.isArray(value) ? value : []).map((item) => cleanText(item, step.mapText));
    else if (step.mdField) value = markdownField(String(value ?? ""), step.mdField);
    else if (step.mdSection) value = markdownSection(String(value ?? ""), step.mdSection[0], step.mdSection[1]);
    else if (step.matchFormat) {
      const found = String(value ?? "").match(new RegExp(step.matchFormat.pattern, step.matchFormat.flags || "i"));
      value = found ? step.matchFormat.format.replace(/\{(\d+)\}/g, (_, group) => String(found[Number(group)] ?? "").trim()) : "";
    }
    else if (step.join) {
      value = step.join.parts
        .map((part) => runPipeline(part, context))
        .filter((part) => part !== undefined && part !== null && part !== "")
        .join(step.join.with ?? ". ");
    }
  }
  return value;
}

/** One protocol object built from a single multi-group regex over the text,
 *  or a source-supplied function for shapes (like markdown tables) the op
 *  language cannot honestly express. The function lives WITH the source's
 *  settings, so the general reader stays one reader. */
function protocolsFromSettings(settings, context) {
  const spec = settings.protocols;
  if (!spec) return [];
  if (spec.custom) return spec.custom(context) || [];
  if (spec.fromMatch) {
    const found = String(dig(context, spec.fromMatch.on) ?? "").match(new RegExp(spec.fromMatch.pattern, spec.fromMatch.flags || "i"));
    if (!found) return [];
    const fields = {};
    for (const [key, value] of Object.entries(spec.fromMatch.fields)) {
      fields[key] = typeof value === "string" ? value
        : value.group ? cleanText(found[value.group], value.max || 200)
        : "";
    }
    return [{ ...fields, sourceUrl: context.url }];
  }
  return [];
}

/** Citations for one page. A source whose footer links its "trusted sources"
 *  (pubmed.ncbi.nlm.nih.gov with no path, and the like) would otherwise have
 *  those counted as references, which puts a link to a search engine's front
 *  door in front of a member instead of a paper. Opt-in per source so no
 *  existing source's output moves. */
function sourceReferences(settings, markup, url) {
  const references = trustedReferences(markup, url, (settings.referenceLimit || 10) + 12);
  const filtered = settings.dropBareHostReferences
    ? references.filter((reference) => {
        try {
          const parsed = new URL(reference.url);
          return parsed.pathname.replace(/\/+$/, "").length > 0;
        } catch {
          return false;
        }
      })
    : references;
  return filtered.slice(0, settings.referenceLimit || 10);
}

export async function readWithSettings(settings) {
  let allUrls;
  if (settings.discovery.sitemapIndex) {
    const index = sitemapLocations(await fetchText(settings.discovery.sitemapIndex));
    allUrls = [];
    for (const sitemap of index) allUrls.push(...sitemapLocations(await fetchText(sitemap)));
  } else {
    allUrls = sitemapLocations(await fetchText(settings.discovery.sitemap));
  }
  const profileUrls = allUrls.filter((url) => {
    const parts = peptidePathParts(url);
    if (settings.discovery.firstPathPart && parts[0] !== settings.discovery.firstPathPart) return false;
    if (settings.discovery.pathParts && parts.length !== settings.discovery.pathParts) return false;
    if (settings.discovery.excludePattern && new RegExp(settings.discovery.excludePattern, "i").test(url)) return false;
    return true;
  });
  const profileUrlSet = new Set(profileUrls);
  const supplementalUrls = allUrls.filter((url) => !profileUrlSet.has(url));

  /* Values gathered from OTHER pages of the same source - for example, the
     per-condition pages that sit under each profile - grouped by the same
     canonical key and handed to the profile's context as `siblings`. */
  const siblingsByKey = new Map();
  if (settings.siblings) {
    for (const url of allUrls) {
      const parts = peptidePathParts(url);
      if (settings.siblings.firstPathPart && parts[0] !== settings.siblings.firstPathPart) continue;
      if (parts.length !== settings.siblings.pathParts) continue;
      const key = canonicalKey(parts[settings.siblings.keyPart]);
      let value = parts[settings.siblings.valuePart];
      if (settings.siblings.replaceAll) value = value.replaceAll(settings.siblings.replaceAll[0], settings.siblings.replaceAll[1]);
      if (!siblingsByKey.has(key)) siblingsByKey.set(key, []);
      siblingsByKey.get(key).push(value);
    }
  }

  // A supplied source means the whole supplied source. Fetch every mapped
  // non-profile page too, so comparison pages, condition articles,
  // calculators and supporting guides receive a content hash and receipt
  // instead of being counted and then silently skipped.
  const supplementalResults = await mapLimit(supplementalUrls, settings.concurrency || 8, async (url) => ({
    url,
    markup: await fetchText(url),
  }));
  const supplementalFailures = supplementalResults.filter((item) => item?.error);
  const supplementalPages = supplementalResults.filter((item) => item && !item.error);
  const siblingPassagesByKey = new Map();
  if (settings.siblings) {
    for (const page of supplementalPages) {
      const parts = peptidePathParts(page.url);
      if (settings.siblings.firstPathPart && parts[0] !== settings.siblings.firstPathPart) continue;
      if (parts.length !== settings.siblings.pathParts) continue;
      const key = canonicalKey(parts[settings.siblings.keyPart]);
      if (!siblingPassagesByKey.has(key)) siblingPassagesByKey.set(key, []);
      siblingPassagesByKey.get(key).push(...pageSections(page.markup).map((passage) => ({
        heading: `${parts[settings.siblings.valuePart] || "Related page"}: ${passage.heading}`,
        text: passage.text,
      })));
    }
  }

  const results = await mapLimit(profileUrls, settings.concurrency || 8, async (url) => {
    /* Some sources publish a plain-text twin of each page (peptpedia's
       markdown profiles); fetchSuffix reads that twin while the profile
       keeps citing the human page. */
    const markup = await fetchText(settings.fetchSuffix ? `${url}${settings.fetchSuffix}` : url);
    const structured = jsonLd(markup);
    const parts = peptidePathParts(url);
    const context = {
      url,
      parts,
      markup,
      text: cleanText(markup, settings.textWindow || 100_000),
      page: firstJsonLd(structured, "MedicalWebPage"),
      drug: firstJsonLd(structured, "Drug"),
      article: firstJsonLd(structured, "Article"),
      title: pageTitle(markup),
    };
    const key = canonicalKey(runPipeline(settings.key, context));
    context.siblings = siblingsByKey.get(key) || [];
    context.siblingPassages = siblingPassagesByKey.get(key) || [];
    context.derived = {};
    for (const [name, pipeline] of Object.entries(settings.derived || {})) {
      context.derived[name] = runPipeline(pipeline, context);
    }
    const field = (name) => runPipeline(settings.fields[name] || [], context);
    /* A count only exists when its pipeline yields something numeric;
       an empty match must stay null, never become a zero. */
    const count = (name) => {
      if (!settings.fields[name]) return undefined;
      const raw = runPipeline(settings.fields[name], context);
      return raw === "" || raw == null ? NaN : Number(raw);
    };
    return {
      key,
      name: field("name"),
      aliases: field("aliases") || [],
      categories: field("categories") || [],
      claim: profileClaim(settings.id, url, {
        lastReviewed: field("lastReviewed"),
        summary: field("summary"),
        evidence: field("evidence"),
        halfLife: field("halfLife"),
        halfLifeContext: field("halfLifeContext"),
        mechanism: field("mechanism"),
        limitations: field("limitations") || [],
        safety: field("safety") || [],
        topics: field("topics") || [],
        protocols: protocolsFromSettings(settings, context),
        preparation: field("preparation") || [],
        passages: [...pageSections(markup), ...context.siblingPassages],
        references: sourceReferences(settings, markup, url),
        humanStudies: count("humanStudies"),
        animalStudies: count("animalStudies"),
        citedSources: count("citedSources"),
        contentHash: hash(markup),
      }),
    };
  });
  const profiles = results.filter((item) => item && !item.error);
  // Supporting articles used to be fetched for an audit receipt and then
  // stopped there. Build a separate server-side article index linking each
  // page to every compound it actually discusses. Keeping this out of the
  // browser's compound catalogue avoids shipping a huge duplicated corpus to
  // every customer while the complete page remains searchable by the AI.
  const normalSearch = (value) => ` ${String(value || "").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
  let linkedSupplementalPages = 0;
  let supplementalAnswerRecords = 0;
  const articles = [];
  const primaryProfiles = [...profiles];
  for (const page of supplementalPages) {
    const sections = pageSections(page.markup);
    const title = pageTitle(page.markup) || "Supporting article";
    // Match only the article's own title and section bodies. Whole-page text
    // includes navigation menus that list dozens of unrelated compounds.
    const titleText = normalSearch(title);
    const articleText = normalSearch(sections.map((section) => `${section.heading} ${section.text}`).join(" "));
    const productKeys = [];
    for (const profile of primaryProfiles) {
      const terms = [profile.name, ...(profile.aliases || [])]
        .map((term) => normalSearch(term).trim())
        .filter((term) => term.length >= 4);
      const isMeaningfulMention = terms.some((term) => {
        const needle = ` ${term} `;
        if (titleText.includes(needle)) return true;
        // A single body mention is commonly a navigation or related-content
        // card. Two mentions shows that the article actually discusses it.
        return articleText.split(needle).length - 1 >= 2;
      });
      if (!isMeaningfulMention) continue;
      productKeys.push(profile.key);
      supplementalAnswerRecords += 1;
    }
    if (productKeys.length) {
      linkedSupplementalPages += 1;
      const article = profileClaim(settings.id, page.url, {
        lastReviewed: "Not stated",
        summary: sections[0]?.text || title,
        evidence: `Supporting article supplied by ${settings.id}; source type and limitations remain attached to the answer.`,
        topics: [title],
        passages: sections,
        references: sourceReferences(settings, page.markup, page.url),
        contentHash: hash(page.markup),
      });
      articles.push({ ...article, title, productKeys });
    }
  }
  const failures = [...results.filter((item) => item?.error), ...supplementalFailures];
  return {
    audit: {
      sourceId: settings.id,
      mappedPages: allUrls.length,
      analyzedProfiles: profiles.length,
      supplementalPagesAnalyzed: supplementalPages.length,
      supplementalPagesLinkedToAnswers: linkedSupplementalPages,
      supplementalAnswerRecords,
      excludedPages: 0,
      failures,
      notes: settings.audit?.notes || "Read by the general reader from per-source settings.",
      readBy: "general-reader",
    },
    profiles,
    articles,
  };
}
