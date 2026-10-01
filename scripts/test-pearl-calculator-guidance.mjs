import assert from 'node:assert/strict';
import test from 'node:test';
import { answerQuestion } from '../src/lib/concierge/research/chat-engine.mjs';

test('PEARL explains the Windsor Glow dosage calculator in plain English', () => {
  const answer = answerQuestion('How does the dosage calculator work?', [], { adminPreview: true });
  const text = JSON.stringify(answer);
  assert.equal(answer.kind, 'calculator');
  assert.match(text, /\/calculator/);
  assert.match(text, /100 marks = 1 mL/);
  assert.match(text, /1 mark = 0\.01 mL/);
  assert.match(text, /does not choose a dose/i);
  assert.doesNotMatch(text, /insert the needle|injection site|inject into/i);
});

test('a numerical product dose points the member to calculator help', () => {
  const answer = answerQuestion('What is the dose of HHB?', [], { adminPreview: true });
  assert.equal(answer.kind, 'dose');
  assert.ok(answer.dose.some((row) => /\d/.test(String(row.value))));
  assert.ok(answer.followUps.includes('How do I use the dosage calculator?'));
});

test('personal wording still gives sourced figures without inventing a personal calculation', () => {
  const answer = answerQuestion('What dose should I take of Glutathione 1500mg?', [], { adminPreview: true });
  assert.equal(answer.kind, 'dose');
  assert.match(answer.keyPoint, /cannot recommend what you should take/i);
  assert.ok(answer.dose.some((row) => /\d/.test(String(row.value))));
  assert.ok(answer.followUps.includes('How do I use the dosage calculator?'));
});
