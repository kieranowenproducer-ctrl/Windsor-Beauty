// Task 7009d5db: short names and typing slips, and the key answer on a dosage
// answer. Pure engine, no database.   npm run test:pearl-short-names
import assert from 'node:assert/strict';
import test from 'node:test';
import { answerQuestion } from '../src/lib/concierge/research/chat-engine.mjs';

test('"M2" is read as Melanotan II and confirmed by the short answer title', () => {
  const answer = answerQuestion('What is the standard protocol dosage for M2?');
  assert.equal(answer.kind, 'dose');
  assert.deepEqual(answer.compounds, ['Melanotan II']);
  assert.match(answer.title, /^Melanotan II: research dose$/i);
  assert.equal(answer.interpretation.disclosure, '');
});

test('MT2, MT-2, MT-II and Melanotan 2 all land on Melanotan II', () => {
  for (const question of ['MT2 dosage', 'What is the standard dosage for MT-2 protocol?', 'MT-II protocol', 'melanotan 2 dose']) {
    const answer = answerQuestion(question);
    assert.equal(answer.kind, 'dose', question);
    assert.deepEqual(answer.compounds, ['Melanotan II'], question);
  }
});

test('MT1 stays Melanotan I, never Melanotan II', () => {
  const answer = answerQuestion('What research is listed for MT1?');
  assert.deepEqual(answer.compounds, ['Melanotan I']);
});

test('a near miss on a short name asks instead of guessing', () => {
  const answer = answerQuestion('MT3 dosage');
  assert.equal(answer.kind, 'clarify');
  assert.ok(answer.suggestions.some((item) => item.label === 'Melanotan II'), JSON.stringify(answer.suggestions));
  assert.ok(!answer.compounds.includes('Melanotan II') || answer.kind === 'clarify');
});

test('units and small words never turn into a short-name suggestion', () => {
  for (const question of ['10 mg dose', 'how much per ml', 'what is the best mt']) {
    const answer = answerQuestion(question);
    const labels = (answer.suggestions || []).map((item) => item.label);
    assert.ok(!labels.some((label) => /melanotan/i.test(label)), `${question}: ${labels.join(', ')}`);
  }
});

test('a dosage answer has no duplicate key box or supporting waffle', () => {
  const answer = answerQuestion('MT2 dosage');
  assert.equal(answer.keyPoint, '');
  assert.equal(answer.summary, 'For research use only.');
  assert.deepEqual(answer.bullets, []);
  assert.deepEqual(answer.sections, []);
  assert.deepEqual(answer.followUps, ['How do I use the dosage calculator?']);
  assert.ok(answer.dose.some((row) => /0\.025 mg\/kg/.test(row.value)));
  assert.ok(answer.sources.length > 0);
});

test('a dosage answer with no figures says so in one line', () => {
  const answer = answerQuestion('ACTH dosage');
  assert.equal(answer.kind, 'dose');
  assert.equal(answer.keyPoint, '');
  assert.equal(answer.dose.length, 0);
  assert.match(answer.summary, /^No source-listed research dose is held.+For research use only\.$/);
  assert.deepEqual(answer.bullets, []);
});

test('the tester phone spellings reach the intended existing records', () => {
  for (const question of ['SLU 332 dosage', 'SLUPP332 dosage', 'SLU PP 332 dosage']) {
    const answer = answerQuestion(question, [], { adminPreview: true });
    assert.equal(answer.kind, 'dose', question);
    assert.match(answer.title, /^SLU-PP-332: research dose$/i, question);
  }

  for (const [question, expected] of [
    ['tesamol dosage', 'Tesamorelin'],
    ['tesamo dosage', 'Tesamorelin'],
    ['fox dri dosage', 'FOXO4-DRI'],
  ]) {
    const answer = answerQuestion(question, [], { adminPreview: true });
    assert.equal(answer.kind, 'clarify', question);
    assert.deepEqual(answer.suggestions.map((item) => item.label), [expected], question);
  }
});

test('plain SLU answers from SLU-PP-332 instead of offering unrelated categories', () => {
  for (const question of ['what does slu do', 'tell me about SLU', 'SLU information']) {
    const answer = answerQuestion(question, [], { adminPreview: true });
    assert.notEqual(answer.kind, 'clarify', question);
    assert.match(answer.title, /SLU-PP-332/i, question);
    assert.equal(answer.interpretation?.status, 'resolved', question);
    assert.equal(answer.interpretation?.matchedText, 'SLU', question);
  }
});

test('HGH offers its distinct forms and 191 narrows that choice safely', () => {
  for (const question of ['HGH dosage', 'human growth hormone dosage']) {
    const answer = answerQuestion(question, [], { adminPreview: true });
    assert.equal(answer.kind, 'clarify', question);
    assert.deepEqual(answer.suggestions.map((item) => item.label), ['Somatropin', 'HGH 191AA', 'HGH Fragment 176-191'], question);
  }

  const unclear = answerQuestion('HGH 191 dosage', [], { adminPreview: true });
  assert.equal(unclear.kind, 'clarify');
  assert.deepEqual(unclear.suggestions.map((item) => item.label), ['HGH 191AA', 'HGH Fragment 176-191']);

  assert.equal(answerQuestion('HGH 191AA dosage', [], { adminPreview: true }).title, 'HGH (191 AA), Human Growth Hormone: research dose');
  assert.equal(answerQuestion('HGH Fragment 176-191 dosage', [], { adminPreview: true }).title, 'HGH Fragment 176-191: research dose');
});

test('a bare 191 never becomes an unrelated compound', () => {
  const answer = answerQuestion('191 dosage', [], { adminPreview: true });
  assert.equal(answer.kind, 'clarify');
  assert.ok(!answer.compounds.includes('MK-677'));
});

test('unfinished phone names offer safe choices across the catalogue', () => {
  const cases = [
    ['tesa dosage', ['Tesamorelin', 'Tesamorelin 5mg + Ipamorelin 5mg']],
    ['serm dosage', ['Sermorelin']],
    ['hexa dosage', ['Hexarelin', 'Hexapeptide-11']],
    ['cagri dosage', ['Cagrilintide', 'Cagrilintide + Semaglutide', 'CagriSema']],
    ['tript dosage', ['Triptorelin']],
    ['ipamo dosage', ['Ipamorelin', 'Ipamorelin + CJC-1295 (no DAC)', 'Ipamorelin + Tesamorelin']],
    ['pine dosage', ['Pinealon']],
    ['vesu dosage', ['Vesugen']],
    ['folli dosage', ['Follistatin 344', 'Follistatin 315']],
  ];
  for (const [question, expected] of cases) {
    const answer = answerQuestion(question, [], { adminPreview: true });
    if (expected.length === 1) {
      assert.equal(answer.kind, 'dose', question);
      assert.match(answer.title, new RegExp(expected[0], 'i'), question);
    } else {
      assert.equal(answer.kind, 'clarify', question);
      assert.deepEqual(answer.suggestions.map((item) => item.label), expected, question);
    }
  }

  assert.equal(answerQuestion('reta dosage', [], { adminPreview: true }).title, 'Retatrutide: research dose');
});
