import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { answerQuestion } from '../src/lib/concierge/research/chat-engine.mjs';

const audit = JSON.parse(readFileSync(new URL('../docs/pearl-dosage-audit-all-products.json', import.meta.url), 'utf8'));
const KNOWN_SOURCE_GAPS = new Set(['super-human-blend', 'pag-nrg', 'peptide-complex']);

function hasNumericDose(answer) {
  return answer.kind === 'dose' && answer.dose?.some((row) => /\d/.test(String(row.value || '')));
}

test('every current shop product has a truthful dosage answer contract', () => {
  assert.equal(audit.rows.length, 83, 'refresh the committed all-product audit if the catalogue changes');
  const failures = [];
  for (const product of audit.rows) {
    const answer = answerQuestion(`What dose is listed for ${product.name}?`, [], { adminPreview: true });
    if (answer.kind !== 'dose') failures.push(`${product.name}: returned ${answer.kind}`);
    if (!answer.diagnostic?.validation?.valid) failures.push(`${product.name}: failed answer validation`);
    if (KNOWN_SOURCE_GAPS.has(product.slug)) {
      if (hasNumericDose(answer)) failures.push(`${product.name}: invented a number despite the recorded source gap`);
      if (!/no source-listed|does not record|does not contain/i.test(`${answer.title} ${answer.summary}`)) {
        failures.push(`${product.name}: did not explain the source gap`);
      }
      continue;
    }
    if (!hasNumericDose(answer)) failures.push(`${product.name}: no numerical source record`);
    if (answer.dose?.some((row) => !row.source?.label || !row.source?.url)) {
      failures.push(`${product.name}: a numerical row has no provenance`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('complaint products and natural wording reach the exact product', () => {
  const cases = [
    ['KLOW dose', 'Klow Recovery Pen'],
    ['Whats the dossage for the Klow recovery pen?', 'Klow Recovery Pen'],
    ['How much is listed for HGH (191 AA) Human Growth Hormone?', 'HGH'],
    ['B7-33 protocol', 'B7-33'],
    ['IGF-1 DES dosage', 'IGF-1 DES'],
    ['Follistatin-315 dose range', 'Follistatin-315'],
    ['Retatrutide Cagri Omnimorph pen dose', 'Omnimorph'],
    ['Ipamorelin 10mg plus CJC-1295 No DAC dosage', 'Ipamorelin'],
    ['Glow Pen Critical Bio-Tech protocol', 'Glow Pen'],
    ['Wolverine Recovery Pen Remedium dose', 'Wolverine Recovery Pen'],
  ];
  for (const [question, expected] of cases) {
    const answer = answerQuestion(question, [], { adminPreview: true });
    assert.equal(answer.kind, 'dose', question);
    assert.match(answer.title, new RegExp(expected, 'i'), question);
    assert.ok(hasNumericDose(answer), question);
  }
});

test('commercial and licensed-source provenance is retained but competitor identity stays member-hidden', () => {
  const admin = answerQuestion('KLOW dose', [], { adminPreview: true });
  assert.match(JSON.stringify(admin), /peptora\.io/i, 'admin needs the real traceable source');
  const member = answerQuestion('KLOW dose');
  assert.ok(!JSON.stringify(member).toLowerCase().includes('peptora'), 'member answer must keep the existing competitor-name protection');
  assert.ok(member.dose.some((row) => /0\.05|1–2|10 mcg|2–4 mcg|2–2\.5|0\.5–1/.test(row.value)), 'licensed-library figures must still be used');
});
