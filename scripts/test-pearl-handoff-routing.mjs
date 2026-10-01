import assert from 'node:assert/strict';
import test from 'node:test';

import { COMPOUNDS, CURATED_TERMINOLOGY } from '../src/lib/concierge/research/chat-engine.mjs';
import {
  PEARL_HANDOFF_TARGET,
  pearlHandoffTarget,
  shouldHandoffToPearl,
} from '../src/lib/concierge/pearl-handoff.mjs';

test('every PEARL record routes common research questions out of Concierge', () => {
  const failures = [];
  for (const compound of COMPOUNDS) {
    for (const question of [
      `What does ${compound.name} do?`,
      `Who does ${compound.name} work for?`,
      `What is the dosage for ${compound.name}?`,
      `What are the risks of ${compound.name}?`,
    ]) {
      if (!shouldHandoffToPearl(question)) failures.push(question);
    }
  }
  assert.deepEqual(failures, [], `${COMPOUNDS.length * 4} catalogue questions checked`);
});

test('every approved abbreviation and alias routes to PEARL', () => {
  const failures = [];
  let checked = 0;
  for (const record of CURATED_TERMINOLOGY.filter((item) => item.reviewStatus === 'approved')) {
    for (const term of [...(record.abbreviations || []), ...(record.aliases || [])]) {
      checked += 1;
      if (!shouldHandoffToPearl(`Who does ${term} work for?`)) failures.push(term);
    }
  }
  assert.deepEqual(failures, [], `${checked} approved wordings checked`);
});

test('generic evidence and benefit questions route to PEARL', () => {
  for (const question of [
    'What does the research say about weight loss?',
    'Which evidence covers healing?',
    'What are the benefits for recovery?',
    'What helps with sleep?',
  ]) assert.equal(shouldHandoffToPearl(question), true, question);
});

test('dosage calculator questions route to PEARL', () => {
  for (const question of [
    'How do I use the dosage calculator?',
    'What does U-100 mean on the peptide calculator?',
    'Where do I put the bacteriostatic water amount in the calculator?',
    'How does the V3 pen clicks calculator work?',
    'Can the calculator use a 10 mg peptide vial?',
  ]) assert.equal(shouldHandoffToPearl(question), true, question);
});

test('shopping, delivery and order questions remain with Concierge', () => {
  for (const question of [
    'Do you sell reta?',
    'What is the price of retatrutide?',
    'Is SLU-PP-332 in stock?',
    'Where is my order?',
    'When will BPC-157 be delivered?',
  ]) assert.equal(shouldHandoffToPearl(question), false, question);
});

test('the service destination wins and the local destination fills a missed tag', () => {
  const supplied = { url: '/some-configured-place', label: 'Research Chat' };
  assert.equal(pearlHandoffTarget('Who does reta work for?', supplied), supplied);
  assert.deepEqual(pearlHandoffTarget('Who does reta work for?', null), PEARL_HANDOFF_TARGET);
  assert.equal(pearlHandoffTarget('Where is my order?', null), null);
});
