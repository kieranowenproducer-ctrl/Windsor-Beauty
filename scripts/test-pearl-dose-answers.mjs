import assert from 'node:assert/strict';
import test from 'node:test';
import { answerQuestion, COMPOUNDS } from '../src/lib/concierge/research/chat-engine.mjs';

function assertShortDose(question, expectedName) {
  const answer = answerQuestion(question, [], { adminPreview: true });
  assert.equal(answer.kind, 'dose', question);
  if (expectedName) assert.match(answer.title, new RegExp(expectedName, 'i'), question);
  assert.match(answer.summary, /For research use only\./i, question);
  assert.deepEqual(answer.sections, [], question);
  assert.deepEqual(answer.bullets, [], question);
  assert.deepEqual(answer.followUps, ['How do I use the dosage calculator?'], question);
  assert.ok(Array.isArray(answer.dose), question);
  assert.ok(Array.isArray(answer.sources), question);
  if (answer.dose.length) {
    assert.ok(answer.dose.every((row) => /\d/.test(row.value)), question);
    assert.ok(answer.dose.every((row) => row.source?.label && row.source?.url), `${question}: every figure needs its own source`);
    assert.ok(answer.sources.length > 0, question);
  }
}

test('dose answers contain only figures, sources and the research-use line', () => {
  const cases = [
    ['What dosage is listed for BPC-157?', 'BPC-157'],
    ['How much tirzepatide should I take?', 'Tirzepatide'],
    ['What mg of retatrutide should I use?', 'Retatrutide'],
  ];
  for (const [question, name] of cases) assertShortDose(question, name);

  const followUp = answerQuestion('Dose?', ['BPC-157'], { adminPreview: true });
  assert.equal(followUp.kind, 'dose');
  assert.deepEqual(followUp.bullets, []);
  assert.deepEqual(followUp.sections, []);
});

test('recognises misspelled dose language and compound names', () => {
  const cases = [
    ['Whats the dossage for BPC 157?', 'BPC-157'],
    ['Semaglutde dosag please', 'Semaglutide'],
    ['tirzepatide protocal', 'Tirzepatide'],
    ['what is the reta regiman', 'Retatrutide'],
  ];
  for (const [question, name] of cases) assertShortDose(question, name);
});

test('recognises implied dose questions without misreading purpose questions', () => {
  const cases = [
    ['What did the trial participants receive for tirzepatide?', 'Tirzepatide'],
    ['What was semaglutide given at in the study?', 'Semaglutide'],
    ['How often was semaglutide given?', 'Semaglutide'],
    ['Which amount was administered in the BPC-157 trial?', 'BPC-157'],
  ];
  for (const [question, name] of cases) assertShortDose(question, name);
  assert.notEqual(answerQuestion('What is BPC-157 used for?').kind, 'dose');
});

test('the short dose shape holds across the full library alphabetically', () => {
  for (const compound of COMPOUNDS) {
    const question = `What dose is listed for ${compound.name}?`;
    const answer = answerQuestion(question, [], { adminPreview: true });
    if (answer.kind === 'clarify') {
      assert.ok(answer.suggestions.length >= 2, `${question}: an ambiguous library name needs choices`);
      continue;
    }
    assertShortDose(question, null);
  }
});

test('administration procedures and emergencies keep their existing boundaries', () => {
  assert.equal(answerQuestion('How do I inject semaglutide?').kind, 'boundary');
  assert.equal(answerQuestion('I took too much semaglutide and have chest pain').kind, 'emergency');
});

test('different source figures stay visible and individually attributed', () => {
  const answer = answerQuestion('What dose is listed for BPC-157?', [], { adminPreview: true });
  assert.equal(answer.kind, 'dose');
  assert.ok(answer.dose.length >= 2);
  assert.ok(new Set(answer.dose.map((row) => row.source.url)).size >= 2);
  assert.ok(answer.dose.every((row) => row.source.label && row.source.url));
});
