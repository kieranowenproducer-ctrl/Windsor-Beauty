/**
 * The PEARL safety net.
 *
 * PEARL answers from a file of approved research, through a fixed set of
 * templates. Both live in source control, and the engine has no dates and no
 * randomness in it, so the same question always produces the same answer.
 *
 * That means we can take a complete picture of every answer PEARL currently
 * gives, keep it in the repository, and compare against it after any change.
 * Anything that moved shows up as an ordinary diff, with the old and new
 * wording side by side. Nothing can quietly change what a member reads.
 *
 *   npm run pearl:baseline    rebuild the picture (use after an intended change)
 *   npm run pearl:check       compare against it, list what moved, fail if anything did
 *
 * `pearl:check` is the one that runs in `npm run check`. It never writes.
 *
 * Cost: no network, no database, no API. It is free and takes a few seconds.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  answerQuestion,
  COMPOUNDS,
  CURATED_TERMINOLOGY,
  PEARL_BLEND_MAPPINGS,
} from '../src/lib/concierge/research/chat-engine.mjs';
import { PRODUCT_CATALOGUE_NAMES } from '../src/lib/concierge/research/product-compositions.mjs';
import { CONCEPT_METADATA } from '../src/lib/concierge/research/research-intelligence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'docs/pearl-answers.baseline.txt');

/* Every kind of question a member can ask about a named compound. One per
   branch of the answer engine, so a change to any template is caught. */
const COMPOUND_QUESTIONS = [
  ['overview', (name) => `What is ${name}?`],
  ['mechanism', (name) => `How does ${name} work?`],
  ['dose', (name) => `What dosage numbers are listed for ${name}?`],
  ['safety', (name) => `What are the risks of ${name}?`],
  ['evidence', (name) => `What research is listed for ${name}?`],
  ['half-life', (name) => `What is the half life of ${name}?`],
  ['conflicts', (name) => `Why do the sources disagree about ${name}?`],
];

/* Behaviour that is not about one compound: the refusals, the comparisons, the
   follow-ups that rely on the previous answer, and the wording traps. Each is a
   [label, question, contextCompounds] row. */
const BEHAVIOUR_QUESTIONS = [
  ['empty', '', []],
  ['emergency', 'I overdosed on Semaglutide and have chest pain', []],
  ['personal-dose', 'What dose of BPC-157 should I take for my shoulder?', []],
  ['personal-choice', 'Should I use Semaglutide?', []],
  ['procedure', 'How do I inject Semaglutide?', []],
  ['stack', 'Can I stack BPC-157 and TB-500 together?', []],
  ['unverified-blend', 'What is the Phoenix Recovery Stack?', []],
  ['compare-two', 'Compare Semaglutide and Tirzepatide', []],
  ['compare-three', 'Compare Semaglutide, Tirzepatide and Retatrutide', []],
  ['compare-choose', 'Which should I use, Semaglutide or Tirzepatide?', []],
  ['two-compounds', 'What does the research say about BPC-157 and TB-500 for tendon healing?', []],
  ['nonsense', 'zibble frax information', []],
  ['unknown-name', 'What is tesamoreliinxx?', []],
  ['typo-topic', 'weigth los peptids', []],
  ['typo-evidence', 'what resarch and evidnce is there for semaglutide', []],
  ['everyday-healing', 'I want to heal a tendon injury faster, what does the research say?', []],
  ['everyday-sleep', 'Which peptide should I use for sleep?', []],
  ['brand-name', 'What is Ozempic?', []],
  ['abbreviation', 'What is BPC?', []],
  ['misspelling', 'What is semaglutde?', []],
  ['human-studies-filter', 'Show me the human studies', ['BPC-157']],
  ['limitations-filter', 'What are the limitations?', ['BPC-157']],
  ['context-risks', 'What are its risks?', ['BPC-157']],
  ['context-dose', 'Dose?', ['BPC-157']],
  ['context-orphan', 'What are its risks?', []],
  ['multi-topic', 'Show the source entries for muscle growth, healing, sleep and weight loss', []],
];

function stable(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}

/* One answer, rendered as plain lines. Everything a member could see is in
   here, so a change to any visible part shows up. Line-per-fact on purpose:
   a one-word change should be a one-line diff, not a rewritten blob. */
function renderAnswer(answer) {
  const lines = [];
  const push = (key, value) => {
    if (value === undefined || value === null || value === '') return;
    lines.push(`${key}: ${String(value).replace(/\s+/g, ' ').trim()}`);
  };

  push('kind', answer.kind);
  push('title', answer.title);
  push('summary', answer.summary);
  push('keyPoint', answer.keyPoint);
  if (answer.needsLanguageReview) push('needsLanguageReview', 'true');

  const interpretation = answer.interpretation || {};
  push('understood', interpretation.status);
  push('method', interpretation.method);
  push('confidence', interpretation.confidence);
  push('matchedText', interpretation.matchedText);
  push('disclosure', interpretation.disclosure);
  for (const term of interpretation.expandedTerms || []) push('  connectedTo', term);

  for (const section of answer.sections || []) {
    lines.push(`section: ${section.title}`);
    for (const item of section.items || []) push('  -', item);
  }
  for (const bullet of answer.bullets || []) push('  *', bullet);

  for (const row of answer.comparison || []) {
    lines.push(`compare: ${row.name}`);
    push('  purpose', row.purpose);
    push('  evidence', row.evidence);
    push('  halfLife', row.halfLife);
    push('  status', row.status);
  }

  for (const suggestion of answer.suggestions || []) push('  suggest', suggestion.label || suggestion.slug);
  for (const followUp of answer.followUps || []) push('  followUp', followUp);
  for (const compound of stable(answer.compounds || [])) push('  compound', compound);
  for (const source of answer.sources || []) push('  source', `${source.label || 'Research source'} <${source.url || ''}>`);

  return lines;
}

function block(group, id, question, contextNames) {
  const answer = answerQuestion(question, contextNames);
  const header = contextNames.length
    ? `### ${group} | ${id} | ${question} | after: ${contextNames.join(', ')}`
    : `### ${group} | ${id} | ${question}`;
  return [header, ...renderAnswer(answer), ''];
}

function buildBaseline() {
  const lines = [
    '# PEARL answer baseline. Generated by scripts/pearl-baseline.mjs. Do not edit by hand.',
    '# Every answer PEARL currently gives. Rebuild with: npm run pearl:baseline',
    '# Compare against it with: npm run pearl:check',
    '',
  ];

  const compounds = [...COMPOUNDS].sort((left, right) => left.slug.localeCompare(right.slug, 'en-GB'));
  for (const compound of compounds) {
    for (const [id, ask] of COMPOUND_QUESTIONS) {
      lines.push(...block('compound', `${compound.slug}/${id}`, ask(compound.name), []));
    }
  }

  const topics = [...CONCEPT_METADATA].sort((left, right) => String(left.id).localeCompare(String(right.id), 'en-GB'));
  for (const topic of topics) {
    const wording = String(topic.id).replace(/-/g, ' ');
    lines.push(...block('topic', String(topic.id), `Which peptides are researched for ${wording}?`, []));
  }

  const terms = stable(
    CURATED_TERMINOLOGY.flatMap((record) => [
      record.displayName,
      ...(record.abbreviations || []),
      ...(record.misspellings || []),
      ...(record.aliases || []),
    ]),
  ).sort((left, right) => left.localeCompare(right, 'en-GB'));
  for (const term of terms) {
    lines.push(...block('wording', term, `What is ${term}?`, []));
  }

  const blends = [...PEARL_BLEND_MAPPINGS].sort((left, right) => String(left.id).localeCompare(String(right.id), 'en-GB'));
  for (const blend of blends) {
    lines.push(...block('blend', String(blend.id), `What is in ${blend.canonicalName}?`, []));
  }

  const products = Object.entries(PRODUCT_CATALOGUE_NAMES).sort((left, right) => left[0].localeCompare(right[0], 'en-GB'));
  for (const [slug, name] of products) {
    lines.push(...block('product', slug, `What is in ${name}?`, []));
  }

  for (const [id, question, context] of BEHAVIOUR_QUESTIONS) {
    lines.push(...block('behaviour', id, question, context));
  }

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

/* Split a rendered baseline back into one entry per question, so the check can
   say exactly which answers moved rather than "the file changed". */
function splitEntries(text) {
  const entries = new Map();
  let key = null;
  let body = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('### ')) {
      if (key) entries.set(key, body);
      key = line.slice(4);
      body = [];
      continue;
    }
    if (key && line !== '' && !line.startsWith('#')) body.push(line);
  }
  if (key) entries.set(key, body);
  return entries;
}

function diffLines(before, after, limit = 6) {
  const removed = before.filter((line) => !after.includes(line)).slice(0, limit);
  const added = after.filter((line) => !before.includes(line)).slice(0, limit);
  return [
    ...removed.map((line) => `      was  ${line.slice(0, 150)}`),
    ...added.map((line) => `      now  ${line.slice(0, 150)}`),
  ];
}

async function main() {
  const write = process.argv.includes('--write');
  const built = buildBaseline();

  if (write) {
    await writeFile(BASELINE, built, 'utf8');
    const answers = built.split('\n').filter((line) => line.startsWith('### ')).length;
    const size = Math.round(Buffer.byteLength(built) / 1024);
    process.stdout.write(`Saved ${answers.toLocaleString('en-GB')} PEARL answers to docs/pearl-answers.baseline.txt (${size} KB)\n`);
    process.stdout.write('Read the git diff before committing. Every changed line is a change a member would see.\n');
    return;
  }

  let saved;
  try {
    /* Windows git may check the file out with CRLF line endings. Normalise, so
       a line-ending difference can never masquerade as a changed answer. */
    saved = (await readFile(BASELINE, 'utf8')).replace(/\r\n/g, '\n');
  } catch {
    process.stdout.write('No baseline picture exists yet. Create one with: npm run pearl:baseline\n');
    process.exitCode = 1;
    return;
  }

  if (saved === built) {
    const answers = built.split('\n').filter((line) => line.startsWith('### ')).length;
    process.stdout.write(`PEARL check: all ${answers.toLocaleString('en-GB')} answers are unchanged.\n`);
    return;
  }

  const before = splitEntries(saved);
  const after = splitEntries(built);
  const changed = [];
  const removed = [];
  const added = [];

  for (const [key, body] of before) {
    if (!after.has(key)) { removed.push(key); continue; }
    if (after.get(key).join('\n') !== body.join('\n')) changed.push(key);
  }
  for (const key of after.keys()) if (!before.has(key)) added.push(key);

  process.stdout.write('\nPEARL check: some answers have moved.\n\n');
  process.stdout.write(`  ${changed.length} answer(s) changed\n`);
  process.stdout.write(`  ${added.length} question(s) newly covered\n`);
  process.stdout.write(`  ${removed.length} question(s) no longer covered\n\n`);

  for (const key of changed.slice(0, 25)) {
    process.stdout.write(`  CHANGED  ${key}\n`);
    for (const line of diffLines(before.get(key), after.get(key))) process.stdout.write(`${line}\n`);
    process.stdout.write('\n');
  }
  if (changed.length > 25) process.stdout.write(`  ...and ${changed.length - 25} more changed answers.\n\n`);
  for (const key of removed.slice(0, 10)) process.stdout.write(`  GONE     ${key}\n`);
  for (const key of added.slice(0, 10)) process.stdout.write(`  NEW      ${key}\n`);

  process.stdout.write('\nIf every change above is one you meant to make, run: npm run pearl:baseline\n');
  process.stdout.write('That saves the new picture. If any change is a surprise, stop and look at it first.\n');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
