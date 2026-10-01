/**
 * PEARL dosage audit, on the command line (Kieran, 10 September 2026).
 *
 * The same report the admin's Pearl Dosages screen shows, for when a file is wanted rather than a
 * screen. It shares ONE implementation with that screen, src/lib/pearlDosageAudit.ts, so the two
 * cannot drift and say different things about the same product.
 *
 *   node --import ./scripts/alias-loader.mjs --experimental-strip-types --no-warnings \
 *     scripts/pearl-dosage-audit.mjs [--markdown] [--json]
 *
 * PEARL is deterministic and offline, so the only cost is reading the catalogue.
 *
 * ONE TRAP THIS SCRIPT ALREADY FELL INTO. Its first version guessed at the table holding hidden
 * products, tried `hidden_products` and then `site_settings`, found neither, and quietly carried on
 * with "nothing is hidden". That put 82 products in the report when the shop sells 55, so 27 of
 * them were products no customer can buy. The hidden list lives in `product_visibility`, and the
 * query below is deliberately not wrapped in a try/catch: a report of what the shop sells must fail
 * loudly rather than quietly become a report of everything.
 */
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, mergeProducts } from '@/data/products';
import { buildDosageAudit, summariseDosageAudit } from '@/lib/pearlDosageAudit';
import { answerQuestion } from '@/lib/concierge/research/chat-engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wantJson = process.argv.includes('--json');
const wantMarkdown = process.argv.includes('--markdown');
const includeHidden = process.argv.includes('--all');
const probeAnswers = process.argv.includes('--probe');

const env = Object.fromEntries(readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const { neon } = await import('@neondatabase/serverless');
const sql = neon(env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

const overrideRows = await sql`select slug, data from custom_products`;
const overrides = Object.fromEntries(overrideRows.map((r) => [r.slug, typeof r.data === 'string' ? JSON.parse(r.data) : r.data]));

const hiddenRows = await sql`select slug from product_visibility where hidden = true`;
const hidden = new Set(hiddenRows.map((r) => r.slug));

const completeCatalogue = mergeProducts(PRODUCTS, overrides);
const catalogue = includeHidden ? completeCatalogue : completeCatalogue.filter((p) => !hidden.has(p.slug));
const rows = buildDosageAudit(catalogue);
const summary = summariseDosageAudit(rows);

const numericDose = (answer) => answer?.kind === 'dose'
  && Array.isArray(answer.dose)
  && answer.dose.some((item) => /\d/.test(String(item?.value ?? '')));
const researchDose = (answer) => numericDose(answer)
  && /research dose$/i.test(String(answer?.title ?? ''));

const answerProbe = (row) => {
  if (!probeAnswers) return null;
  const questions = [
    `What dose is listed for ${row.name}?`,
    `What dosage does PEARL have for ${row.name}?`,
    `How much ${row.name} should I take?`,
    `${row.name} dose`,
    `Whats the dossage for ${row.name}?`,
  ];
  const customer = questions.map((question) => {
    const answer = answerQuestion(question, [], { adminPreview: false });
    return { question, kind: answer.kind, title: answer.title, numericDose: numericDose(answer), researchDose: researchDose(answer) };
  });
  const staff = questions.map((question) => {
    const answer = answerQuestion(question, [], { adminPreview: true });
    return { question, kind: answer.kind, title: answer.title, numericDose: numericDose(answer), researchDose: researchDose(answer) };
  });
  const first = answerQuestion(`What does ${row.name} do?`, [], { adminPreview: false });
  const followUp = answerQuestion('What dose?', first.compounds ?? [], {
    adminPreview: false,
    previousAnswer: {
      kind: first.kind,
      title: first.title,
      compounds: first.compounds ?? [],
      topicIds: first.topicIds ?? [],
    },
  });
  return {
    customer,
    staff,
    followUp: {
      firstKind: first.kind,
      firstTitle: first.title,
      kind: followUp.kind,
      title: followUp.title,
      numericDose: numericDose(followUp),
      researchDose: researchDose(followUp),
    },
  };
};

const auditedRows = rows.map((row) => ({
  ...row,
  hidden: hidden.has(row.slug),
  probes: answerProbe(row),
}));

const probeSummary = probeAnswers ? {
  products: auditedRows.length,
  customerQuestions: auditedRows.length * 5,
  staffQuestions: auditedRows.length * 5,
  customerNumericPasses: auditedRows.reduce((count, row) => count + row.probes.customer.filter((probe) => probe.numericDose).length, 0),
  staffNumericPasses: auditedRows.reduce((count, row) => count + row.probes.staff.filter((probe) => probe.numericDose).length, 0),
  followUpNumericPasses: auditedRows.filter((row) => row.probes.followUp.numericDose).length,
  customerResearchDosePasses: auditedRows.reduce((count, row) => count + row.probes.customer.filter((probe) => probe.researchDose).length, 0),
  staffResearchDosePasses: auditedRows.reduce((count, row) => count + row.probes.staff.filter((probe) => probe.researchDose).length, 0),
  followUpResearchDosePasses: auditedRows.filter((row) => row.probes.followUp.researchDose).length,
} : null;

const hiddenInCatalogue = completeCatalogue.filter((product) => hidden.has(product.slug)).length;
const staleHiddenSlugs = [...hidden].filter((slug) => !completeCatalogue.some((product) => product.slug === slug));

const reportName = includeHidden ? 'pearl-dosage-audit-all-products' : 'pearl-dosage-audit';

if (wantJson) {
  await writeFile(
    path.join(ROOT, `docs/${reportName}.json`),
    JSON.stringify({ generatedAt: new Date().toISOString(), includeHidden, hiddenInCatalogue, staleHiddenSlugs, summary, probeSummary, rows: auditedRows }, null, 2),
  );
  console.log(`wrote docs/${reportName}.json`);
} else if (wantMarkdown) {
  const lines = ['# PEARL dosage audit', ''];
  lines.push(includeHidden
    ? `${rows.length} products in the full admin catalogue, including ${hiddenInCatalogue} hidden products.`
    : `${rows.length} products on sale, in the same alphabetical order as the website.`);
  if (!includeHidden) lines.push(`${hidden.size} hidden products are deliberately left out: a customer cannot buy them.`);
  lines.push('');
  for (const [kind, count] of Object.entries(summary)) lines.push(`- ${kind}: ${count}`);
  if (probeSummary) {
    lines.push('');
    lines.push(`- customer wording checks with a research dose: ${probeSummary.customerResearchDosePasses}/${probeSummary.customerQuestions}`);
    lines.push(`- staff wording checks with a research dose: ${probeSummary.staffResearchDosePasses}/${probeSummary.staffQuestions}`);
    lines.push(`- conversational follow-ups with a research dose: ${probeSummary.followUpResearchDosePasses}/${probeSummary.products}`);
  }
  lines.push('');
  for (const r of auditedRows) {
    lines.push(`## ${r.name}`, '');
    lines.push(`- Shop status: **${r.hidden ? 'hidden' : 'live'}**`);
    lines.push(`- Water: **${r.water}**`);
    lines.push(`- Strengths sold: ${r.strengths.join(', ') || 'none listed'}`);
    if (r.pearlCompound) lines.push(`- PEARL record: **${r.pearlCompound}**`);
    if (r.dose) for (const [k, v] of Object.entries(r.dose)) if (v) lines.push(`  - ${k}: ${v}`);
    if (r.schedule) lines.push(`- Schedule: ${r.schedule}`);
    if (r.cycle) lines.push(`- Cycle: ${r.cycle}`);
    if (r.components.length) lines.push(`- Contains: ${r.components.join(', ')}`);
    if (r.provenance) lines.push(`- Where the split came from: ${r.provenance}`);
    if (r.evidence) lines.push(`- Evidence: ${r.evidence}`);
    if (r.pearlNote) lines.push(`- PEARL's note: ${r.pearlNote}`);
    lines.push(`- Outcome: **${r.kind}**`);
    if (r.sources.length) {
      lines.push(`- Sources PEARL cites: ${r.sources.length}`);
      for (const s of r.sources.slice(0, 8)) lines.push(`  - ${[s.title, s.journal, s.year, s.url].filter(Boolean).join(' — ')}`);
      if (r.sources.length > 8) lines.push(`  - ...and ${r.sources.length - 8} more`);
    }
    if (r.probes) {
      const customerPasses = r.probes.customer.filter((probe) => probe.researchDose).length;
      const staffPasses = r.probes.staff.filter((probe) => probe.researchDose).length;
      lines.push(`- Customer wording checks: **${customerPasses}/5 research-dose answers**`);
      lines.push(`- Staff wording checks: **${staffPasses}/5 research-dose answers**`);
      lines.push(`- Follow-up check: **${r.probes.followUp.researchDose ? 'research-dose answer' : `${r.probes.followUp.kind} — ${r.probes.followUp.title}`}**`);
      const failures = r.probes.customer.filter((probe) => !probe.researchDose);
      for (const failure of failures) lines.push(`  - Failed: “${failure.question}” → ${failure.kind}: ${failure.title}`);
    }
    lines.push('');
  }
  await writeFile(path.join(ROOT, `docs/${reportName}.md`), lines.join('\n'));
  console.log(`wrote docs/${reportName}.md`);
} else {
  console.log(includeHidden
    ? `PEARL DOSAGE AUDIT — ${rows.length} products in the admin catalogue (${hiddenInCatalogue} hidden)\n`
    : `PEARL DOSAGE AUDIT — ${rows.length} products on sale (${hidden.size} hidden ones left out)\n`);
  for (const [kind, count] of Object.entries(summary)) console.log(`  ${String(count).padStart(3)}  ${kind}`);
  if (probeSummary) {
    console.log(`\n  ${probeSummary.customerResearchDosePasses}/${probeSummary.customerQuestions} customer questions returned research doses`);
    console.log(`  ${probeSummary.staffResearchDosePasses}/${probeSummary.staffQuestions} staff questions returned research doses`);
    console.log(`  ${probeSummary.followUpResearchDosePasses}/${probeSummary.products} follow-ups returned research doses`);
  }
  console.log('');
  for (const r of auditedRows) {
    console.log(`${r.kind.padEnd(20)} ${r.name}`);
    console.log(`${' '.repeat(21)}water: ${r.water}   sources: ${r.sources.length}`);
    if (r.probes) {
      const passes = r.probes.customer.filter((probe) => probe.researchDose).length;
      console.log(`${' '.repeat(21)}customer dose wording: ${passes}/5   follow-up: ${r.probes.followUp.researchDose ? 'pass' : r.probes.followUp.kind}`);
    }
  }
}
