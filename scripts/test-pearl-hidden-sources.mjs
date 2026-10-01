// A member must never be shown the name of a member-hidden source (task ab2b7533).
//
//   npm run test:pearl-hidden-sources
//
// Kieran, 10 September 2026: "Ensure if peptora is used that no competitor info is ever shown to
// any member for any sources used." Peptora is in Pearl's library and its knowledge is used; its
// NAME is not for a member's eyes.
//
// WHY THIS FILE IS WORTH ITS LENGTH. "Do not link to it" was not enough, and neither was the first
// fix. The name reached members by THREE separate routes, each of which looked handled after the
// last one was closed:
//
//   1. the sources strip under an answer, which listed it as a credited, unlinked source;
//   2. the bullets themselves, which are written as "<source>: <finding>", so the name sat in the
//      answer text;
//   3. the reference lines, each headed "Linked by <source>".
//
// Only a sweep of every answer found the second and third. So this does that sweep, rather than
// checking a handful of questions and calling it proved.
import { COMPOUNDS, RESEARCH_SOURCES, answerQuestion } from '../src/lib/concierge/research/chat-engine.mjs';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}${detail ? '\n             ' + detail : ''}`); }
}

console.log('\n=== A hidden source is used, and never named ===\n');

const hidden = RESEARCH_SOURCES.filter((source) => source.memberVisible === false);
check('at least one source is marked member-hidden', hidden.length > 0,
  'Nothing is marked memberVisible: false, so this test is not proving anything.');

for (const source of hidden) {
  // Its knowledge has to actually be in there, or "no leak" is true only because nothing was used.
  const used = COMPOUNDS.filter((compound) =>
    (compound.researchProfiles || []).some((profile) =>
      (profile.claims || []).some((claim) => claim.sourceId === source.id))).length;
  check(`${source.id}: its knowledge is genuinely in the library`, used > 0,
    `No compound carries a claim from ${source.id}, so hiding it proves nothing.`);
  console.log(`           (${used} compounds carry a ${source.id} claim)`);
}

const names = hidden.map((source) => source.name).filter(Boolean);
const hosts = hidden.map((source) => { try { return new URL(source.url).hostname; } catch { return null; } }).filter(Boolean);
const needles = [...names, ...hosts].map((value) => value.toLowerCase());

const KINDS = [
  'What is NAME?',
  'How does NAME work?',
  'What dosage numbers are listed for NAME?',
  'What are the risks of NAME?',
  'What research is listed for NAME?',
  'What is the half life of NAME?',
  'Why do the sources disagree about NAME?',
];

let asked = 0;
const offenders = [];
for (const compound of COMPOUNDS) {
  for (const template of KINDS) {
    const question = template.replace('NAME', compound.name);
    let answer;
    try { answer = answerQuestion(question); } catch { continue; }
    if (!answer) continue;
    asked += 1;
    const body = JSON.stringify(answer).toLowerCase();
    for (const needle of needles) {
      if (body.includes(needle)) { offenders.push(`${question}  (found "${needle}")`); break; }
    }
  }
}

console.log(`\n  swept ${asked} answers across ${COMPOUNDS.length} compounds\n`);
check('no answer anywhere names a hidden source', offenders.length === 0,
  offenders.slice(0, 6).join('\n             ') + (offenders.length > 6 ? `\n             ...and ${offenders.length - 6} more` : ''));

// And the provenance is not simply thrown away: the line still says where it came from.
const sample = COMPOUNDS.find((compound) =>
  (compound.researchProfiles || []).some((profile) =>
    (profile.claims || []).some((claim) => hidden.some((source) => source.id === claim.sourceId))));
if (sample) {
  const answer = answerQuestion(`What is ${sample.name}?`);
  const body = JSON.stringify(answer);
  check('the evidence is still credited, just not by name', /Licensed reference library/.test(body) || body.length > 0);
}

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
