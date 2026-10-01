/**
 * Per-source settings for the general reader (Pearl plan Stage D step 9).
 *
 * Each entry tells the general reader where a source's pages live and how to
 * read each field, as data. A source appears here once the general reader's
 * output has been proven IDENTICAL to its bespoke reader by
 * scripts/compare-readers.mjs; only then is the bespoke reader retired from
 * the build (kept in the file, no longer called).
 */
import { peptpediaProtocols, peptidedosagesProtocols, sourceSectionProtocols } from "./build-research-evidence.mjs";

export const READER_SETTINGS = {
  /* PeptideDosages.com (added 19 Aug 2026 on Kieran's explicit instruction,
     task 70281b89, after the review of it recommended against adding it).

     It goes in under the SAME rule its near-twin peptidedosage.org already
     runs under: a discovery aid. Its research and its citations are imported;
     its preparation content is not, and cannot be, because this reader never
     reads those sections.

     That distinction is not cosmetic here. Measured across its pages, EVERY
     profile carries dosing, reconstitution, supplies and injection-technique
     sections as standard, written as instructions to the reader ("add 3.0 mL
     of compatible sterile research vehicle", "prime or reprime the pump").
     Kieran's commissioned research
     (00_Global-Knowledge/research/2026-08-03-ruo-peptide-educational-content-legal-boundary.md)
     puts a preparation method, a route and anything shaped around the reader
     out of bounds for a seller under any framing.

     The site marks each block with a stable section id, so the reader NAMES
     the four it takes rather than trying to describe what it avoids:
       how-this-works        -> what it is and how it works
       benefits-side-effects -> benefits and side effects
       intranasal-research / human-research -> published human findings
       (citations are harvested from the whole page as usual)
     Everything else is untouched, including supplies-needed,
     injection-tech-tips, lifestyle-factors, important-notes and every
     calculator block.

     Blends and stacks are excluded outright: PEARL already refuses to discuss
     combinations, so importing those pages would only create records it must
     decline to use. */
  /* PeptideDosages.com. Added 18 Aug 2026 as a discovery aid, then widened to
     the FULL site on 19 Aug on Kieran's explicit instruction under the rule
     "Samuel decides what goes into PEARL" (CLAUDE.md). A source that is
     supplied goes in in full; taking half a site is what that rule replaces.

     So this reader now takes everything the page holds:
       how-this-works                        -> what it is and how it works
       intranasal-research / human-research  -> published human findings, and
                                                the study table becomes real
                                                protocol records
       benefits-side-effects                 -> benefits and side effects
       important-notes / important-note      -> limitations
       the reconstitution, spray, actuator, supplies, injection-technique,
       lifestyle and calculator blocks       -> preparation
       every citation on the page            -> references

     The study table is the only thing that becomes a numbered protocol,
     because it is the only table on these pages that reports what a SOURCE
     actually used. The site's own reconstitution and spray arithmetic is
     preparation prose, kept as the site words it and attributed to it. */
  peptidedosages: {
    id: "peptidedosages",
    discovery: { sitemapIndex: "https://peptidedosages.com/sitemap.xml", firstPathPart: "single-peptide-dosages", pathParts: 2 },
    dropBareHostReferences: true,
    concurrency: 6,
    textWindow: 120_000,
    /* Addresses are "semax-10-mg-vial-dosage-protocol", so the key comes from
       the headline, always "<Compound> (<size> Vial) Dosage Protocol". Trim at
       the bracket, never at a hyphen: a hyphen trim turns CJC-1295 into CJC
       and collides GHRP-2 with GHRP-6. Several vial sizes of one compound
       share a key on purpose; they are the same compound. */
    key: [
      { fallback: [[{ get: "article.headline" }], [{ get: "title" }]] },
      { replace: ["\\s*\\(.*$", ""] },
      { replace: ["\\s+Dosage\\b.*$", ""] },
    ],
    protocols: { custom: (context) => peptidedosagesProtocols(context.markup, context.url) },
    fields: {
      name: [
        { fallback: [[{ get: "article.headline" }], [{ get: "title" }]] },
        { replace: ["\\s*\\(.*$", ""] },
        { replace: ["\\s+Dosage\\b.*$", ""] },
        { cleanText: 180 },
      ],
      aliases: [{ const: [] }],
      categories: [{ const: [] }],
      lastReviewed: [{ fallback: [
        [{ get: "article.dateModified" }],
        [{ get: "article.datePublished" }],
      ] }],
      summary: [
        { get: "markup" },
        { match: "<section\\b[^>]*id=\"how-this-works\"[\\s\\S]{0,9000}?</section>", group: 0 },
        { cleanProse: 1_400 },
      ],
      evidence: [{ join: { with: " ", parts: [
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"intranasal-research\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_200 }],
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"human-research\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_200 }],
      ] } }],
      halfLife: [{ const: "" }],
      halfLifeContext: [{ const: "" }],
      mechanism: [
        { get: "markup" },
        { match: "<section\\b[^>]*id=\"how-this-works\"[\\s\\S]{0,9000}?</section>", group: 0 },
        { cleanProse: 1_800 },
      ],
      /* "important-note" (singular) is the site's educational disclaimer and
         belongs here. "important-notes" (plural) is practical handling - sharps
         disposal, site rotation, injection speed - which is preparation, not a
         research limitation, and read wrong under a Limitations heading. */
      limitations: [
        { get: "markup" },
        { match: "<section\\b[^>]*id=\"important-note\"[\\s\\S]{0,9000}?</section>", group: 0 },
        { cleanProse: 900 },
        { split: "(?<=[.])\\s+" },
        { mapProse: 320 },
      ],
      safety: [
        { get: "markup" },
        { match: "<section\\b[^>]*id=\"benefits-side-effects\"[\\s\\S]{0,9000}?</section>", group: 0 },
        { cleanProse: 1_800 },
        { split: "(?<=[.])\\s+" },
        { mapProse: 320 },
      ],
      /* Everything the site says about preparing and handling, in its own
         words and attributed to it. Section ids vary by compound - a nasal
         peptide has actuator maths, a topical one has a concentration
         calculator - so each accepted block is named and absent ones are
         simply skipped. */
      preparation: [{ join: { with: " ", parts: [
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"dosing-reconstitution\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_600 }],
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"important-notes\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_600 }],
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"protocol-overview\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_200 }],
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"nasal-device-math\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_400 }],
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"topical-concentration-calculator\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_200 }],
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"small-batch-calculator\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_200 }],
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"stock-measurement-example\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_200 }],
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"supplier-solution-math\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_200 }],
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"label-reading\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_000 }],
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"supplies-needed\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_000 }],
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"injection-tech-tips\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_600 }],
        [{ get: "markup" }, { match: "<section\\b[^>]*id=\"lifestyle-factors\"[\\s\\S]{0,9000}?</section>", group: 0 }, { cleanProse: 1_000 }],
      ] } }, { split: "(?<=[.])\\s+" }, { mapProse: 400 }],
      topics: [{ const: [] }],
    },
    audit: {
      notes: "Every mapped page is read and receipted. Single-compound pages feed attributed facts and protocols into answers; blend, stack, calculator and supporting pages remain in the searchable source archive even where PEARL's answer boundary declines a procedure or combination request.",
    },
  },

  peptidejournal: {
    id: "peptidejournal",
    discovery: { sitemap: "https://www.peptidejournal.org/sitemap.xml", firstPathPart: "peptides", pathParts: 2 },
    dropBareHostReferences: true,
    concurrency: 6,
    textWindow: 120_000,
    protocols: { custom: (context) => sourceSectionProtocols(context.markup, context.url, "Administration and Dosing(?: in Research)?|Research Dosing|Dosage and Administration") },
    /* The compound key CANNOT come from the URL here: addresses are
       descriptive (/peptides/semax-nootropic-peptide-research-profile), so a
       URL key would file every compound as a brand-new entry that merges with
       nothing. It comes from the headline, which is always
       "<Compound>: <what this page is>". The parenthetical is stripped too,
       or "ACTH (Adrenocorticotropic Hormone)" would never match "ACTH". */
    key: [
      { fallback: [[{ get: "article.headline" }], [{ get: "title" }]] },
      { splitBefore: ":" },
      // Strip ONLY a parenthetical, so "ACTH (Adrenocorticotropic Hormone)"
      // still keys as acth. Never strip at a hyphen: that turns BPC-157 into
      // BPC and TB-500 into TB, and collides GHRP-2 with GHRP-6 under one key.
      { replace: ["\\s*\\(.*$", ""] },
    ],
    fields: {
      name: [
        { fallback: [[{ get: "article.headline" }], [{ get: "title" }]] },
        { splitBefore: ":" },
        { replace: ["\\s*\\(.*$", ""] },
        { cleanText: 180 },
      ],
      aliases: [
        { fallback: [
          [{ get: "article.headline" }, { splitBefore: ":" }, { match: "\\(([^)]{2,80})\\)" }],
          [{ get: "text" }, { match: "Full Name\\s+(.{3,90}?)\\s+(?:Amino acid|Molecular|Type|Class|Developer)" }],
        ] },
        { asArray: true },
        { cleanList: 8 },
      ],
      categories: [{ const: [] }],
      lastReviewed: [{ get: "text" }, { match: "\\b([A-Z][a-z]+ \\d{1,2}, \\d{4})\\b" }],
      summary: [
        { fallback: [[{ get: "article.description" }], [{ get: "text" }, { match: "What Is [^?]{1,60}\\?\\s+([\\s\\S]{80,1800}?)\\s+(?:Development History|Quick Facts|Mechanisms? of Action)" }]] },
        { cleanProse: 1_800 },
      ],
      /* Heading wording is not consistent across this source - "The Bottom
         Line" and "Bottom Line" both occur, as do "Research Evidence" and
         "Clinical Research" - so each field takes the first variant present
         rather than assuming one house style. */
      evidence: [{ join: { with: " ", parts: [
        [{ get: "article.description" }],
        [{ get: "markup" }, { match: "<h2[^>]*>[^<]*(?:The )?Bottom Line[^<]*</h2>([\\s\\S]{0,4000}?)<h2" }, { cleanProse: 1_000 }],
        [{ get: "markup" }, { match: "<h2[^>]*>[^<]*(?:Research Evidence|Clinical Research)[^<]*</h2>([\\s\\S]{0,4000}?)<h2" }, { cleanProse: 900 }],
      ] } }],
      halfLife: [{ get: "text" }, { match: "Half-Life\\s+(.{3,140}?)\\s+(?:Type|Full Name|Molecular Weight|Primary route|Approved in|Key mechanism|Developer|Potency|Mechanism|Feature|Attribute|Property|Detail)\\b" }],
      halfLifeContext: [{ const: "PeptideJournal profile summary. Species and route must be checked in the cited pharmacokinetic paper." }],
      mechanism: [
        { get: "markup" },
        { match: "<h2[^>]*>[^<]*(?:Mechanisms? of Action|How [^<]{1,50} Works?)[^<]*</h2>([\\s\\S]{0,7000}?)<h2" },
        { cleanProse: 1_800 },
      ],
      limitations: [
        { get: "markup" },
        { match: "<h2[^>]*>[^<]*(?:Limitations[^<]*|What (?:We|Researchers) (?:Don'?t|Do Not) Know[^<]*|Research Gaps[^<]*|Evidence Gaps[^<]*)</h2>([\\s\\S]{0,6000}?)<h2" },
        { cleanProse: 2_400 },
        { split: "(?<=[.])\\s+" },
        { mapProse: 320 },
      ],
      safety: [
        { get: "markup" },
        { match: "<h2[^>]*>[^<]*Safety[^<]*</h2>([\\s\\S]{0,7000}?)<h2" },
        { cleanProse: 2_400 },
        { split: "(?<=[.])\\s+" },
        { mapProse: 320 },
      ],
      /* Topics come from the page's own research headings - "Cognitive
         Research: Memory, Focus, and Learning" and the like - because this
         source has no consistent research-areas field to read. */
      topics: [
        { get: "markup" },
        { matchAll: "<h2[^>]*>[^<]*(?:Research|Studies|Evidence)[^<]*</h2>", flags: "gi" },
        { mapText: 140 },
        { cleanList: 12 },
      ],
    },
    audit: {
      notes: "Every peptide profile and every mapped supporting page in the published sitemap is read. Administration and dosing sections are imported as source-labelled protocols. Supporting articles are attached in full to every compound they name; pages with no compound match remain receipted in the source archive. Section headings vary across this source, so some profiles legitimately carry no value for a field the page does not contain.",
    },
  },

  /* PeptideJournal (added 18 Aug 2026 on Kieran's request, task 679e8e33).
     "Science-first educational resource for peptide research. Evidence over
     hype", with a Regulatory & Legal section and a "Limitations of the
     Evidence" heading on every profile.

     Two things differ from the other sources and drive the settings below:
     - Its addresses are descriptive, /peptides/semax-nootropic-peptide-
       research-profile rather than /peptides/semax, so the compound key CANNOT
       come from the URL. It comes from the page's own headline instead, which
       is always "<Compound>: <what this page is>". Keying off the URL would
       file every compound as a brand-new entry that merges with nothing.
     - Its section headings are compound-specific ("How Semax Works: Mechanisms
       of Action"), and the page repeats every heading in an "On this page"
       contents list. Both are handled by anchoring on the real <h2> elements
       in the markup rather than on the flattened text.

     As with Peptide Authority, its "Administration and Dosing in Research"
     section is deliberately NOT extracted. */
  peptideauthority: {
    id: "peptideauthority",
    discovery: { sitemap: "https://peptideauthority.co.uk/sitemap.xml", firstPathPart: "peptides", pathParts: 2 },
    /* Every page footers a "Trusted Sources" block linking the front doors of
       PubMed, ClinicalTrials.gov, the NHS and the EMA. Those are not citations
       for this compound and must not be offered to a member as one. */
    dropBareHostReferences: true,
    concurrency: 6,
    textWindow: 120_000,
    protocols: { custom: (context) => sourceSectionProtocols(context.markup, context.url, "Theoretical Dosing(?: &| and) Protocols|Dosing and Protocols|Research Dosing") },
    key: [{ get: "parts.1" }],
    fields: {
      name: [
        { fallback: [[{ get: "page.headline" }], [{ get: "title" }]] },
        { splitBefore: ":" },
        { cleanText: 180 },
      ],
      aliases: [
        { get: "text" },
        { match: "Also known as:\\s*([^:]{2,120}?)\\s+[A-E]\\s+(?:Limited|Moderate|Strong|Insufficient|Animal|No)\\b" },
        { split: "\\s{2,}|,\\s*" },
        { cleanList: 12 },
      ],
      categories: [
        { get: "text" },
        { match: "Quick Facts\\s+Category\\s+(.+?)\\s+Half-Life" },
        { asArray: true },
        { cleanList: 6 },
      ],
      lastReviewed: [{ get: "text" }, { match: "Last reviewed:\\s*(\\d{1,2} [A-Za-z]+ \\d{4})" }],
      summary: [
        { fallback: [
          [{ get: "page.description" }],
          [{ get: "text" }, { match: "Overview\\s+([\\s\\S]{80,2200}?)\\s+Evidence standards summary" }],
        ] },
        { cleanProse: 1_800 },
      ],
      /* The grading modules, in the site's own words: the overall snapshot,
         the human-evidence grade, and how good it rates its own citations. */
      /* The grading modules, in the site's own words. The snapshot block ends
         with "Overall grade against our evidence grading methodology .", which
         is furniture rather than evidence and read badly at the top of an
         answer summary, so it is trimmed off. */
      evidence: [{ join: { with: " ", parts: [
        [
          { get: "text" },
          { between: { start: "01 Evidence snapshot", ends: ["02 Human evidence grade"], max: 700 } },
          { replace: ["^\\s*[A-E]\\s+", ""] },
          { replace: ["\\s*Overall grade against our evidence grading methodology\\s*\\.?\\s*", " "] },
          { cleanProse: 700 },
        ],
        [{ get: "text" }, { matchFormat: { pattern: "02 Human evidence grade\\s+([A-E])\\s+([^0-9]{3,80}?)\\s+Strength of evidence", format: "Human evidence grade {1}, {2}." } }],
        [{ get: "text" }, { matchFormat: { pattern: "17 Citation quality score\\s+([A-E])\\s+([^0-9]{3,80}?)\\s+Quality of the sources", format: "Citation quality grade {1}, {2}." } }],
      ] } }],
      halfLife: [{ get: "text" }, { match: "Quick Facts[\\s\\S]{0,200}?Half-Life\\s+(.+?)\\s+UK Status" }],
      halfLifeContext: [{ const: "Peptide Authority profile summary. Species and route must be checked in the cited pharmacokinetic paper." }],
      mechanism: [
        { get: "text" },
        { match: "Mechanism of Action\\s+([\\s\\S]{60,3000}?)\\s+Researched Benefits" },
        // the page writes its sub-headings as markdown emphasis inside the prose
        { replace: ["\\*\\*\\s*", ""], flags: "g" },
        { cleanProse: 1_800 },
      ],
      /* Two modules the site publishes that most sources do not: what the page
         cannot tell you, and where the research is missing. Exactly the
         material PEARL needs to avoid overstating a connection. */
      limitations: [{ join: { with: " ", parts: [
        [{ get: "text" }, { between: { start: "15 What this page cannot tell you", ends: ["16 Last reviewed"], max: 1_200 } }],
        [{ get: "text" }, { between: { start: "18 Research gaps", ends: ["19 Safer alternatives"], max: 1_200 } }],
      ] } }, { split: "(?<=[.])\\s+" }, { mapProse: 320 }],
      safety: [{ join: { with: " ", parts: [
        [{ get: "text" }, { between: { start: "09 Safety uncertainty score", ends: ["10 Known adverse signals"], max: 400 } }],
        [{ get: "text" }, { between: { start: "10 Known adverse signals", ends: ["11 Drug-interaction uncertainty"], max: 900 } }],
        [{ get: "text" }, { between: { start: "Commonly Reported Side Effects", ends: ["Rare Risks & Concerns"], max: 600 } }],
        [{ get: "text" }, { between: { start: "Rare Risks & Concerns", ends: ["Contraindications"], max: 600 } }],
        [{ get: "text" }, { between: { start: "Contraindications", ends: ["UK & EU Regulatory Context", "Clinical Studies"], max: 600 } }],
      ] } }, { split: "(?<=[.])\\s+" }, { mapProse: 320 }],
      topics: [
        { get: "text" },
        { between: { start: "Researched Benefits Based on preclinical and clinical research findings:", ends: ["Claim vs Evidence", "Theoretical Dosing"], max: 900 } },
        { split: "\\s*\\d+\\s+" },
        { mapText: 140 },
      ],
    },
    audit: {
      notes: "Every peptide profile and every mapped supporting page in the published sitemap is read. Theoretical dosing blocks are imported as source-labelled protocols. Guides, comparisons, stacks, tools, clinic pages and articles are attached in full to every compound they name; pages with no compound match remain receipted in the source archive.",
    },
  },

  peptpedia: {
    id: "peptpedia",
    discovery: { sitemapIndex: "https://peptpedia.org/sitemap.xml", firstPathPart: "peptide", pathParts: 2, excludePattern: "\\.(?:png|jpe?g|webp)$" },
    /* Peptpedia publishes a markdown twin of every profile; the reader reads
       that twin while the profile keeps citing the human page. */
    fetchSuffix: ".md",
    concurrency: 8,
    key: [{ get: "parts.1" }],
    derived: {
      applications: [{ get: "markup" }, { mdSection: ["Research Applications", 900] }, { split: "\\s+-\\s+|,\\s*" }, { mapText: 140 }],
    },
    fields: {
      name: [
        { fallback: [[{ get: "markup" }, { match: "^#\\s+(.+?)(?:\\s+-|\\s+—|$)", flags: "m" }], [{ get: "parts.1" }]] },
        { cleanText: 180 },
      ],
      aliases: [{ get: "markup" }, { mdField: "Also known as" }, { splitCommas: true }, { cleanList: 16 }],
      categories: [{ get: "markup" }, { mdField: "Category" }, { asArray: true }, { cleanList: 6 }],
      lastReviewed: [{ get: "markup" }, { match: "Last updated:\\s*([^\\n]+)" }],
      summary: [
        { fallback: [[{ get: "markup" }, { match: "^>\\s*(.+)$", flags: "m" }], [{ get: "markup" }, { mdSection: ["Overview", 1_800] }]] },
        { cleanProse: 1_800 },
      ],
      evidence: [{ fallback: [
        [{ join: { with: " ", parts: [
          [{ get: "markup" }, { match: "\\*\\*Human data status:\\*\\*\\s*([^\\n]+)" }],
          [{ get: "markup" }, { match: "What is the evidence quality[^\\n]*\\n+([^\\n]+)" }],
        ] } }],
        [{ get: "markup" }, { mdSection: ["Safety & Tolerability", 1_800] }],
      ] }],
      halfLife: [{ get: "markup" }, { mdField: "Half-life" }],
      halfLifeContext: [{ const: "Species and route are retained when stated in the profile's molecular field or research table." }],
      mechanism: [{ get: "markup" }, { mdSection: ["Mechanism of Action", 1_800] }],
      // \b so a match can only start at a real word: without it this regex
      // matched inside words ("ami-no-acid", "k-nown") and produced mid-word
      // junk fragments. Mirrors the bespoke reader exactly.
      limitations: [{ get: "markup" }, { matchAll: "\\b(?:no|not|limited|unknown)\\b[^.\\n]*\\." }],
      safety: [{ get: "markup" }, { mdSection: ["Safety & Tolerability", 2_400] }, { split: "(?<=[.])\\s+" }],
      topics: [{ get: "derived.applications" }],
    },
    /* The research-dose table is a markdown table with a species heuristic -
       a shape the op language cannot honestly express, so the parser travels
       with the settings. */
    protocols: { custom: (context) => peptpediaProtocols(context.markup, context.url) },
    audit: {
      notes: "Every public markdown peptide profile and every mapped comparison or deep-research page is read. Supporting pages are attached in full to every compound they name; pages with no compound match remain receipted in the source archive.",
    },
  },

  "halflife-labs": {
    id: "halflife-labs",
    discovery: { sitemap: "https://halflife-labs.com/sitemap.xml", firstPathPart: "compounds", pathParts: 2 },
    concurrency: 8,
    key: [{ get: "parts.1" }],
    derived: {
      description: [{ get: "page.description" }, { cleanProse: 1_800 }],
    },
    fields: {
      name: [
        { fallback: [
          [{ get: "drug.name" }],
          [{ get: "page.name" }, { splitBefore: " Half-Life" }],
          [{ get: "parts.1" }, { replaceAll: ["-", " "] }],
        ] },
        { cleanText: 180 },
      ],
      aliases: [{ get: "drug.alternateName" }, { splitCommas: true }, { cleanList: 16 }],
      categories: [{ get: "drug.drugClass" }, { asArray: true }, { cleanList: 6 }],
      lastReviewed: [{ fallback: [[{ get: "page.lastReviewed" }], [{ get: "page.dateModified" }]] }],
      summary: [{ get: "derived.description" }],
      evidence: [{ fallback: [
        [{ get: "derived.description" }, { match: "Data quality:\\s*([^.]*)" }],
        [{ const: "Evidence context is stated on the linked compound page." }],
      ] }],
      halfLife: [{ fallback: [
        [{ get: "derived.description" }, { match: "half-life\\s+(?:is\\s+|of\\s+)?(.+?)(?:\\.|;| vs )" }],
        [{ get: "page.name" }, { cleanText: 240 }, { match: "Half-Life:\\s*(.+?)(?:\\s+vs\\s+|$)" }],
      ] }],
      halfLifeContext: [{ get: "drug.clinicalPharmacology" }, { cleanProse: 700 }],
      mechanism: [{ get: "drug.clinicalPharmacology" }, { cleanProse: 1_800 }],
      limitations: [{ get: "derived.description" }, { matchAll: "No published[^.]*\\." }],
      safety: [{ get: "drug.legalStatus" }, { asArray: true }, { cleanList: 4 }],
      topics: [{ get: "drug.drugClass" }, { asArray: true }, { cleanList: 6 }],
    },
    audit: {
      notes: "Every mapped page is read and receipted. Compound pharmacokinetic pages feed answer records; calculators and supporting tools remain in the searchable source archive with their source attribution.",
    },
  },

  pepcodex: {
    id: "pepcodex",
    discovery: { sitemapIndex: "https://www.pepcodex.com/sitemap-index.xml", firstPathPart: "peptides", pathParts: 2 },
    /* Per-condition pages (peptides/<name>/<condition>) feed each dossier's
       topics, exactly as the bespoke reader gathered them. */
    siblings: { firstPathPart: "peptides", pathParts: 3, keyPart: 1, valuePart: 2, replaceAll: ["-", " "] },
    concurrency: 10,
    textWindow: 120_000,
    key: [{ get: "parts.1" }],
    fields: {
      name: [
        { fallback: [[{ get: "article.headline" }], [{ get: "title" }, { splitBefore: ":" }]] },
        { cleanText: 180 },
        { replace: [": Evidence Dossier$", ""] },
      ],
      aliases: [{ get: "text" }, { match: "Also Known As\\s+(.+?)\\s+Class\\s+" }, { split: "\\s*[•|]\\s*" }, { cleanList: 16 }],
      categories: [{ const: [] }],
      lastReviewed: [{ get: "article.dateModified" }],
      summary: [{ get: "article.description" }],
      evidence: [{ join: { with: ". ", parts: [
        [{ get: "text" }, { matchFormat: { pattern: "Research evidence\\s+([A-Za-z /-]+?)\\s+(\\d+)\\s+human studies?", format: "{1} evidence; {2} human studies listed" } }],
        [{ get: "text" }, { between: { start: "Research Depth:", ends: ["Scored", "How we rate"], max: 1_400 } }],
      ] } }],
      halfLife: [{ get: "text" }, { match: "Half-life\\s+(.+?)\\s+Isoelectric" }],
      halfLifeContext: [{ const: "PepCodex dossier summary. Route and species must be checked in the cited pharmacokinetic paper." }],
      mechanism: [{ get: "text" }, { between: { start: "How It Works (Simplified)", ends: ["Key Research", "Important Limitations", "Mechanism Confidence"], max: 1_800 } }],
      limitations: [{ get: "text" }, { between: { start: "Where the case weakens", ends: ["What is being studied now", "Clinical trials"], max: 2_400 } }, { split: "\\s+\\d{3}\\s+" }, { mapProse: 360 }],
      safety: [{ get: "text" }, { between: { start: "Interactions", ends: ["Cited works", "On reading this entry"], max: 1_800 } }, { split: "(?<=[.])\\s+" }],
      topics: [{ get: "siblings" }],
      humanStudies: [{ get: "text" }, { match: "Research evidence\\s+([A-Za-z /-]+?)\\s+(\\d+)\\s+human studies?", group: 2 }],
      citedSources: [{ get: "text" }, { match: "Based on\\s+(\\d+)\\s+cited sources" }],
    },
    audit: {
      notes: "Every root dossier was analysed. Condition and comparison pages were mapped to improve topic and comparison retrieval.",
    },
  },

  peptidehub: {
    id: "peptidehub",
    discovery: { sitemap: "https://peptidehub.bio/sitemap.xml", firstPathPart: "peptides", pathParts: 2 },
    concurrency: 8,
    textWindow: 80_000,
    key: [{ get: "parts.1" }],
    fields: {
      name: [
        { fallback: [[{ get: "page.name" }], [{ get: "title" }, { splitBefore: "—" }]] },
        { cleanText: 180 },
        { replace: [":\\s*\\d+\\s*(?:mg|mcg|iu).*$", ""] },
      ],
      aliases: [{ const: [] }],
      categories: [{ get: "text" }, { match: "Category\\s+(.+?)\\s+Browse\\s+" }, { asArray: true }, { cleanList: 6 }],
      summary: [{ fallback: [
        [{ get: "text" }, { between: { start: "Research Overview", ends: ["How It Works"], max: 1_800 } }],
        [{ get: "page.description" }],
      ] }],
      evidence: [{ const: "Protocol-focused educational summary. Linked papers, site-listed ranges and commercial context are retained with source attribution." }],
      halfLife: [{ get: "text" }, { match: "half-life\\s+(?:of\\s+)?(.+?)(?:\\.| and |, and )" }],
      halfLifeContext: [{ const: "Site summary. Prefer a cited pharmacokinetic paper when available." }],
      mechanism: [{ get: "text" }, { between: { start: "How It Works", ends: ["Commonly Studied With", "Research references"], max: 1_800 } }],
      limitations: [{ const: ["This is a commercial educational source. Its uncited figures and modelled outputs must remain labelled as source-listed rather than clinical evidence."] }],
      safety: [{ const: [] }],
      topics: [{ get: "text" }, { match: "Category\\s+(.+?)\\s+Browse\\s+" }, { asArray: true }, { cleanList: 6 }],
    },
    protocols: {
      fromMatch: {
        on: "text",
        pattern: "Recommended Dose\\s+(.+?)\\s+Frequency\\s+(.+?)\\s+Injection Type\\s+(.+?)\\s+Timing\\s+(.+?)\\s+Research Overview",
        fields: {
          label: "Peptide Hub site-listed range",
          dose: { group: 1, max: 180 },
          frequency: { group: 2, max: 160 },
          duration: "Not stated",
          route: { group: 3, max: 160 },
          population: "Not stated",
          species: "Not stated",
          evidenceType: "Protocol-site summary, not a verified clinical protocol",
        },
      },
    },
    audit: {
      notes: "Every mapped page is read and receipted. Product-strength, calculator, reconstitution and stacking material is retained with commercial-source attribution; exact compound profiles feed the answer engine.",
    },
  },
};
