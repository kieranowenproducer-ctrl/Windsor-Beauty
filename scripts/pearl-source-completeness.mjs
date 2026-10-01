import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  answerQuestion,
  COMPOUNDS,
  RESEARCH_AUDIT,
  RESEARCH_SOURCES,
} from '../src/lib/concierge/research/chat-engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audit = JSON.parse(await readFile(path.join(ROOT, 'docs/pearl-dosage-audit-all-products.json'), 'utf8'));

const sourceRows = RESEARCH_SOURCES.map((source) => {
  const claims = COMPOUNDS.flatMap((compound) => compound.researchProfiles || [])
    .flatMap((profile) => profile.claims || [])
    .filter((claim) => claim.sourceId === source.id);
  const protocols = claims.flatMap((claim) => claim.protocols || []);
  return {
    id: source.id,
    name: source.name,
    role: source.role,
    status: source.status || RESEARCH_AUDIT.sources?.find((item) => item.sourceId === source.id)?.accessStatus || 'imported',
    memberVisible: source.memberVisible !== false,
    claims: claims.length,
    protocols: protocols.length,
    numericProtocols: protocols.filter((protocol) => /\d/.test(String(protocol.dose || ''))).length,
  };
});

const products = audit.rows.map((product) => {
  const answer = answerQuestion(`What dose is listed for ${product.name}?`, [], { adminPreview: true });
  return {
    slug: product.slug,
    name: product.name,
    hidden: product.hidden,
    answerKind: answer.kind,
    numericalDose: answer.dose?.some((row) => /\d/.test(String(row.value || ''))) || false,
    title: answer.title,
    explanation: answer.summary,
    sourceUrls: [...new Set((answer.dose || []).map((row) => row.source?.url).filter(Boolean))],
    diagnostic: answer.diagnostic || null,
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  sourceSummary: {
    registeredSources: sourceRows.length,
    sourcesWithClaims: sourceRows.filter((row) => row.claims).length,
    sourcesWithNumericProtocols: sourceRows.filter((row) => row.numericProtocols).length,
    compounds: COMPOUNDS.length,
  },
  productSummary: {
    total: products.length,
    live: products.filter((row) => !row.hidden).length,
    hidden: products.filter((row) => row.hidden).length,
    numericalDoseCovered: products.filter((row) => row.numericalDose).length,
    honestSourceGaps: products.filter((row) => !row.numericalDose).length,
  },
  sources: sourceRows,
  sourceGaps: products.filter((row) => !row.numericalDose),
  products,
};

const sourceTable = sourceRows.map((row) =>
  `| ${row.name} | ${row.status} | ${row.claims} | ${row.numericProtocols} | ${row.memberVisible ? 'Named to members' : 'Admin trace only'} |`).join('\n');
const gaps = report.sourceGaps.map((row) =>
  `| ${row.name} | ${row.hidden ? 'Hidden' : 'Live'} | ${row.explanation} |`).join('\n');
const markdown = `# PEARL source and product completeness\n\n`+
  `Generated: ${report.generatedAt}\n\n`+
  `## Result\n\n`+
  `- ${report.productSummary.numericalDoseCovered} of ${report.productSummary.total} catalogue products have a numerical source record.\n`+
  `- ${report.productSummary.honestSourceGaps} products have a genuine source-data gap. PEARL names the gap and does not invent a figure.\n`+
  `- ${report.sourceSummary.registeredSources} supplied sources are registered; ${report.sourceSummary.sourcesWithNumericProtocols} currently contribute structured numerical protocols.\n\n`+
  `## Genuine product gaps\n\n| Product | Visibility | What Pearl says |\n|---|---|---|\n${gaps}\n\n`+
  `## Source register\n\n| Source | Status | Claims used | Numerical protocols | Customer provenance |\n|---|---|---:|---:|---|\n${sourceTable}\n`;

await writeFile(path.join(ROOT, 'docs/pearl-source-completeness.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(path.join(ROOT, 'docs/pearl-source-completeness.md'), markdown, 'utf8');
console.log(`PEARL source completeness: ${report.productSummary.numericalDoseCovered}/${report.productSummary.total} products covered; ${report.productSummary.honestSourceGaps} honest gaps.`);
