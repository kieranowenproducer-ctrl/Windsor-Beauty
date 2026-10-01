import assert from 'node:assert/strict';
import test from 'node:test';

import { COMPOUNDS, CURATED_TERMINOLOGY, answerQuestion } from '../src/lib/concierge/research/chat-engine.mjs';
import { compactResearchText, resolvePearlTerminology } from '../src/lib/concierge/research/terminology.mjs';

const compact = (value) => compactResearchText(value);
const unique = (values) => [...new Set(values.filter(Boolean))];
const bySlug = new Map(COMPOUNDS.map((compound) => [compound.slug, compound]));

function subjectName(name) {
  const base = String(name).replace(/\s+Research Profile$/i, '').split(':')[0].trim();
  const short = base.split('(')[0].trim();
  return short.length >= 3 ? short : base;
}

function identity(value) {
  return compact(value).replace(/and|plus/g, '').replace(/(?:blend|stack)$/g, 'mix').replace(/^epithalon$/, 'epitalon').replace(/^igf1des$/, 'igfdes');
}

function recognisedSlugs(result) {
  return unique([
    ...(result.entities || []).map((item) => item.slug),
    ...(result.suggestions || []).map((item) => item.slug),
  ]).map((slug) => String(slug).replace(/^product:/, ''));
}

function damagedForms(name) {
  const value = compact(subjectName(name));
  if (value.length < 5) return [];
  const at = Math.max(1, Math.floor(value.length / 2));
  const keyboard = { a: 's', b: 'v', c: 'x', d: 's', e: 'r', f: 'd', g: 'f', h: 'g', i: 'o', j: 'h', k: 'j', l: 'k', m: 'n', n: 'm', o: 'p', p: 'o', q: 'w', r: 't', s: 'a', t: 'r', u: 'i', v: 'c', w: 'e', x: 'z', y: 'u', z: 'x' };
  const replacement = keyboard[value[at]] || value[at];
  return unique([
    `${value.slice(0, at)}${value.slice(at + 1)}`,
    `${value.slice(0, at)}${value[at]}${value.slice(at)}`,
    `${value.slice(0, at)}${value[at + 1] || ''}${value[at]}${value.slice(at + 2)}`,
    `${value.slice(0, at)}${replacement}${value.slice(at + 1)}`,
  ]);
}

const prefixOwners = new Map();
for (const compound of COMPOUNDS) {
  const key = compact(subjectName(compound.name));
  for (let length = 3; length <= Math.min(6, key.length - 1); length += 1) {
    const prefix = key.slice(0, length);
    if (!prefixOwners.has(prefix)) prefixOwners.set(prefix, new Set());
    prefixOwners.get(prefix).add(identity(subjectName(compound.name)));
  }
}

const unsafePrefixes = new Set(['for', 'per', 'pen', 'ten', 'the', 'and', 'all', 'any', 'are', 'can', 'does', 'how', 'its', 'long', 'not', 'test', 'use', 'what', 'why']);

function recognisedLabels(result) {
  return unique([
    result.blend?.canonicalName,
    ...(result.entities || []).map((item) => item.label),
    ...(result.suggestions || []).map((item) => item.label),
  ].map(identity));
}

function relatedTo(compound, result) {
  if (recognisedSlugs(result).includes(compound.slug)) return true;
  const subject = identity(subjectName(compound.name));
  return recognisedLabels(result).some((label) => label.includes(subject) || subject.includes(label));
}

test('every meaningful three-to-six character research prefix resolves or offers relevant choices', () => {
  const failures = [];
  let checked = 0;
  for (const [prefix, ownersSet] of prefixOwners) {
    if (unsafePrefixes.has(prefix) || !/[a-z]/.test(prefix)) continue;
    const owners = [...ownersSet];
    const result = resolvePearlTerminology(`What does ${prefix} do?`, COMPOUNDS);
    checked += 1;
    if (result.status === 'unknown') failures.push(`${prefix}: lost (${owners.join(', ')})`);
    const relevant = recognisedLabels(result).some((label) => label.startsWith(prefix) || prefix.startsWith(label)
      || (prefix.length >= 5 && label.slice(0, 4) === prefix.slice(0, 4)));
    if (result.method?.startsWith('prefix') && !relevant) failures.push(`${prefix}: unrelated ${recognisedLabels(result).join(', ')}`);
    if (owners.length > 1 && result.status === 'resolved' && result.method !== 'canonical') failures.push(`${prefix}: shared but resolved to ${recognisedSlugs(result).join(', ')}`);
  }
  assert.deepEqual(failures, [], `${checked} prefixes checked:\n${failures.join('\n')}`);
});

test('every approved abbreviation and alias reaches its reviewed record', () => {
  const failures = [];
  let checked = 0;
  for (const record of CURATED_TERMINOLOGY.filter((item) => item.reviewStatus === 'approved' && item.canonicalSlug)) {
    for (const term of unique([...(record.aliases || []), ...(record.abbreviations || [])])) {
      const result = resolvePearlTerminology(`What does ${term} do?`, COMPOUNDS);
      checked += 1;
      if (!recognisedSlugs(result).includes(record.canonicalSlug)) failures.push(`${term} -> ${record.canonicalSlug}: got ${recognisedSlugs(result).join(', ')}`);
    }
  }
  assert.deepEqual(failures, [], `${checked} reviewed terms checked:\n${failures.join('\n')}`);
});

test('four common typing mistakes for every research record never become an unrelated confident answer', () => {
  const failures = [];
  let checked = 0;
  for (const compound of COMPOUNDS) {
    for (const form of damagedForms(compound.name)) {
      const result = resolvePearlTerminology(`What does ${form} do?`, COMPOUNDS);
      checked += 1;
      if (result.status === 'unknown') failures.push(`${compound.name}: ${form} was lost`);
      else if (!relatedTo(compound, result)) failures.push(`${compound.name}: ${form} led to ${recognisedLabels(result).join(', ')}`);
    }
  }
  assert.deepEqual(failures, [], `${checked} damaged names checked:\n${failures.join('\n')}`);
});

test('every exact research name answers purpose and dose from its own record', () => {
  const failures = [];
  for (const compound of COMPOUNDS) {
    const overview = answerQuestion(`What does ${compound.name} do?`, [], { adminPreview: true });
    if (overview.kind === 'clarify') {
      if (!(overview.suggestions || []).some((item) => item.slug === compound.slug)) failures.push(`${compound.name}: purpose clarification omitted its record`);
    } else if (!relatedTo(compound, { entities: (overview.compounds || []).map((label) => ({ label })) })) failures.push(`${compound.name}: purpose used ${(overview.compounds || []).join(', ')}`);

    const dose = answerQuestion(`What is the source-listed dosage for ${compound.name}?`, [], { adminPreview: true });
    if (dose.kind === 'clarify') {
      if (!(dose.suggestions || []).some((item) => item.slug === compound.slug)) failures.push(`${compound.name}: dose clarification omitted its record`);
    } else {
      if (dose.kind !== 'dose') failures.push(`${compound.name}: dosage became ${dose.kind}`);
      if (!relatedTo(compound, { entities: (dose.compounds || []).map((label) => ({ label })) })) failures.push(`${compound.name}: dose used ${(dose.compounds || []).join(', ')}`);
      if (!Array.isArray(dose.dose)) failures.push(`${compound.name}: dose facts are not structured`);
    }
  }
  assert.deepEqual(failures, [], `${COMPOUNDS.length} exact purpose and dose pairs checked:\n${failures.join('\n')}`);
});

test('every exact research name preserves risk, evidence and half-life intent', () => {
  const failures = [];
  const intents = [
    ['What are the source-listed risks of', 'safety'],
    ['What is the evidence for', 'evidence'],
    ['What is the source-listed half-life of', 'evidence'],
  ];
  for (const compound of COMPOUNDS) {
    for (const [opening, expectedKind] of intents) {
      const answer = answerQuestion(`${opening} ${compound.name}?`, [], { adminPreview: true });
      if (answer.kind === 'clarify') {
        if (!(answer.suggestions || []).some((item) => item.slug === compound.slug)) failures.push(`${compound.name}: ${opening} omitted its choice`);
        continue;
      }
      if (answer.kind !== expectedKind) failures.push(`${compound.name}: ${opening} became ${answer.kind}`);
      if (!relatedTo(compound, { entities: (answer.compounds || []).map((label) => ({ label })) })) failures.push(`${compound.name}: ${opening} used ${(answer.compounds || []).join(', ')}`);
    }
  }
  assert.deepEqual(failures, [], `${COMPOUNDS.length * intents.length} intent checks completed:\n${failures.join('\n')}`);
});

test('who it works for is treated as a benefits question across every research record', () => {
  const failures = [];
  for (const compound of COMPOUNDS) {
    const answer = answerQuestion(`Who does ${compound.name} work for?`, [], { adminPreview: true });
    if (answer.kind === 'boundary') failures.push(`${compound.name}: became a personal-suitability refusal`);
    if (answer.kind === 'clarify') {
      if (!(answer.suggestions || []).some((item) => item.slug === compound.slug)) failures.push(`${compound.name}: clarification omitted its record`);
      continue;
    }
    if (!relatedTo(compound, { entities: (answer.compounds || []).map((label) => ({ label })) })) failures.push(`${compound.name}: answered about ${(answer.compounds || []).join(', ')}`);
  }
  assert.deepEqual(failures, [], `${COMPOUNDS.length} audience-as-benefits checks completed:\n${failures.join('\n')}`);
});

test('single-subject answers keep their subject for conversational dose follow-ups', () => {
  const failures = [];
  let checked = 0;
  for (const compound of COMPOUNDS) {
    const first = answerQuestion(`What does ${compound.name} do?`, [], { adminPreview: true });
    if (first.kind === 'clarify' || (first.compounds || []).length !== 1) continue;
    const followUp = answerQuestion('What about the source-listed dose?', first.compounds, {
      adminPreview: true,
      askedQuestions: [`What does ${compound.name} do?`, 'What about the source-listed dose?'],
      previousAnswer: { kind: first.kind, title: first.title, compounds: first.compounds, topicIds: first.topicIds || [] },
    });
    checked += 1;
    if (followUp.kind !== 'dose') failures.push(`${compound.name}: follow-up became ${followUp.kind}`);
    else if (!relatedTo(compound, { entities: (followUp.compounds || []).map((label) => ({ label })) })) failures.push(`${compound.name}: follow-up used ${(followUp.compounds || []).join(', ')}`);
  }
  assert.ok(checked >= 250, `Only ${checked} single-subject conversations were available`);
  assert.deepEqual(failures, [], `${checked} conversation follow-ups checked:\n${failures.join('\n')}`);
});

test('the source register is complete and has no orphaned reviewed term', () => {
  assert.ok(COMPOUNDS.length >= 272, `Research library unexpectedly shrank to ${COMPOUNDS.length}`);
  for (const record of CURATED_TERMINOLOGY.filter((item) => item.reviewStatus === 'approved' && item.canonicalSlug)) {
    assert.ok(bySlug.has(record.canonicalSlug), `Reviewed term points to missing record: ${record.id} -> ${record.canonicalSlug}`);
  }
});
