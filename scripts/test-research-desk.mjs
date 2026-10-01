import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  answerQuestion,
  COMPOUNDS,
  CURATED_TERMINOLOGY,
  PEARL_BLEND_MAPPINGS,
  PEARL_EXPANDED_NAME,
  PEARL_NAME,
  PRODUCT_COMPOSITIONS,
  RESEARCH_AUDIT,
  RESEARCH_CONFLICTS,
  RESEARCH_SOURCES,
  searchCompounds,
} from '../src/lib/concierge/research/chat-engine.mjs';
import { RESEARCH_PROFILES } from '../src/lib/concierge/research/evidence.generated.mjs';
import { dosagePriorityFor } from '../src/lib/concierge/research/dosage-priorities.mjs';
import { buildResearchLinkManifest } from '../src/lib/concierge/research/research-intelligence.mjs';
import {
  PRODUCT_ALIASES,
  PRODUCT_CATALOGUE_NAMES,
  resolveProductComposition,
} from '../src/lib/concierge/research/product-compositions.mjs';

test('keeps every original compound and adds the expanded library', () => {
  assert.equal(COMPOUNDS.filter((compound) => !compound.addedFromExpandedLibrary).length, 105);
  assert.ok(COMPOUNDS.length >= 240);
  assert.equal(new Set(COMPOUNDS.map((compound) => compound.name.toLowerCase())).size, COMPOUNDS.length);
});

test('records the original reference and every additional supplied website', () => {
  // 11 -> 14 on 18-19 Aug 2026: Peptide Authority, PeptideJournal and
  // PeptideDosages were reviewed and added on Kieran's instruction.
  assert.equal(RESEARCH_SOURCES.length, 15);
  assert.deepEqual(
    new Set(RESEARCH_SOURCES.map((source) => source.id)),
    new Set([
      'peptide-reference',
      'peptide-handbook',
      'pepcodex',
      'peptidehub',
      'halflife-labs',
      'peptpedia',
      'peptidedosage',
      'peptidedosages',
      'peptideauthority',
      'peptidedeck',
      'peptidejournal',
      'wikipep',
      'pep-university',
      'peptidegpt',
      'peptora',
    ]),
  );
  // Counters after the 19 Aug 2026 rebuild with three added sources.
  // uniqueCompounds is 264, not 267: matrixyl3000 and bdnf are excluded
  // identities, and Fragment 176-191 merged into HGH Fragment 176-191.
  assert.equal(RESEARCH_AUDIT.importedWebsites, 14);
  assert.equal(RESEARCH_AUDIT.reviewedButNotImported, 1);
  assert.ok(RESEARCH_AUDIT.mappedProfileEntries >= 820);
  assert.ok(RESEARCH_AUDIT.analyzedProfileRecords >= 1700);
  assert.equal(RESEARCH_AUDIT.uniqueCompounds, 525);
  assert.ok(RESEARCH_AUDIT.mappedPages >= 4300);
});

test('audits and imports every PeptideDosage page with its source grade', () => {
  const source = RESEARCH_AUDIT.sources.find((item) => item.sourceId === 'peptidedosage');
  assert.equal(source.mappedProfileEntries, 173);
  assert.equal(source.analyzedProfiles, 173);
  assert.equal(source.importedProfiles, 173);
  assert.equal(source.excludedProfiles, 0);
  assert.equal(source.failures.length, 0);
  const claims = RESEARCH_PROFILES.flatMap((profile) => profile.claims).filter((claim) => claim.sourceId === 'peptidedosage');
  assert.ok(claims.length >= source.importedProfiles);
  assert.ok(claims.some((claim) => claim.protocols.some((protocol) => protocol.sourceUrl.includes('peptidedosage.org'))));
});

test('maps and imports all reachable PeptideDeck profiles and articles', () => {
  const source = RESEARCH_AUDIT.sources.find((item) => item.sourceId === 'peptidedeck');
  assert.equal(source.mappedProfileEntries, 86);
  assert.ok(source.analyzedProfiles >= 390);
  assert.equal(source.importedProfiles, 330);
  assert.equal(source.excludedProfiles, 0);
  assert.equal(source.citationMismatchCount, 1);
  assert.ok(source.editorialIndexPagesLoaded >= 20);
  assert.ok(source.editorialPagesMapped >= 150);
  assert.equal(source.editorialPagesAnalyzed, source.editorialPagesMapped);
  assert.ok(source.editorialGoalPagesMapped >= 30);

  const claims = RESEARCH_PROFILES.flatMap((profile) => profile.claims).filter((claim) => claim.sourceId === 'peptidedeck');
  assert.equal(claims.length, source.importedProfiles);
  assert.ok(claims.some((claim) => claim.protocols.some((protocol) => protocol.sourceUrl.includes('peptidedeck.com'))));
});

test('keeps all ten primary-verified PeptideDeck compound gaps', () => {
  const names = [
    'Argireline', 'Dulaglutide', 'Lanreotide', 'Lixisenatide', 'Matrixyl',
    'Nesfatin-1', 'PACAP-38', 'PTD-DBM', 'Thymopentin', 'Vosoritide',
  ];
  for (const name of names) {
    const compound = COMPOUNDS.find((item) => item.name === name);
    assert.ok(compound?.addedFromExpandedLibrary, name);

    const dose = answerQuestion(`What dosage numbers are listed for ${name}?`);
    assert.equal(dose.kind, 'dose', name);
    assert.ok(dose.dose.some((item) => /\d/.test(item.value)), name);
    assert.ok(dose.sources.some((source) => /pubmed|pmc\.ncbi|dailymed|doi\.org/i.test(source.url)), name);

    const research = answerQuestion(`What research information is listed for ${name}?`);
    assert.equal(research.kind, 'evidence', name);
    assert.ok(research.bullets.length > 0, name);
  }
});

test('keeps PeptideDeck PACAP-38 citation error out of answers', () => {
  const answer = answerQuestion('What dosage and research is listed for PACAP-38?');
  assert.ok(answer.dose.some((item) => /10 pmol\/kg\/min/.test(item.value)));
  assert.deepEqual(answer.bullets, []);
  assert.ok(answer.sources.some((source) => source.url.includes('/24501094/')));
  assert.ok(answer.sources.every((source) => !source.url.includes('/19595407/')));
  const conflict = RESEARCH_CONFLICTS.find((item) => item.id === 'peptidedeck-pacap38-citation-mismatch');
  assert.match(conflict.rationale, /unrelated respiratory syncytial virus/i);
});

test('keeps PeptideDeck preclinical records separate from human treatment doses', () => {
  for (const name of ['Nesfatin-1', 'PTD-DBM']) {
    const answer = answerQuestion(`What dosage was studied for ${name}?`);
    assert.ok(answer.dose.some((row) => /Mouse|preclinical/i.test(`${row.label} ${row.value}`)), name);
    assert.deepEqual(answer.bullets, [], name);
  }
});

test('maps and imports every public WikiPep article', () => {
  const source = RESEARCH_AUDIT.sources.find((item) => item.sourceId === 'wikipep');
  assert.ok(source.mappedProfileEntries >= 330);
  assert.ok(source.discoveryPagesAnalyzed >= 300);
  assert.equal(source.analyzedProfiles, 340);
  assert.equal(source.importedProfiles, 334);
  assert.equal(source.supportingArticles, 6);
  assert.equal(source.excludedProfiles, 0);
  assert.equal(source.citationMismatchCount, 2);

  const claims = RESEARCH_PROFILES.flatMap((profile) => profile.claims).filter((claim) => claim.sourceId === 'wikipep');
  assert.equal(claims.length, source.importedProfiles - 3);
  assert.ok(claims.some((claim) => claim.url.includes('wikipep.org')));
});

test('adds all ten official-source-verified WikiPep knowledge gaps', () => {
  const names = [
    'Bivalirudin', 'Cetrorelix', 'Ganirelix', 'Goserelin', 'Histrelin',
    'Nafarelin', 'Dasiglucagon', 'Enfuvirtide', 'Eptifibatide', 'Etelcalcetide',
  ];
  for (const name of names) {
    const compound = COMPOUNDS.find((item) => item.name === name);
    assert.ok(compound?.addedFromExpandedLibrary, name);

    const dose = answerQuestion(`What dosage numbers are listed for ${name}?`);
    assert.equal(dose.kind, 'dose', name);
    assert.ok(dose.dose.some((item) => /\d/.test(item.value)), name);
    assert.ok(dose.sources.some((source) => source.url.includes('dailymed.nlm.nih.gov')), name);

    const research = answerQuestion(`What research information is listed for ${name}?`);
    assert.equal(research.kind, 'evidence', name);
    assert.ok(research.bullets.length > 0, name);
  }
});

test('finds the new fertility medicines through a natural category question', () => {
  const answer = answerQuestion('Which compounds relate to fertility research?');
  assert.equal(answer.kind, 'topic');
  assert.match(answer.title, /fertility research/i);
  assert.ok(answer.compounds.includes('Cetrorelix'));
  assert.ok(answer.compounds.includes('Ganirelix'));
});

test('keeps WikiPep identity and citation mismatches out of Pearl answers', () => {
  const matrixyl = RESEARCH_CONFLICTS.find((item) => item.id === 'wikipep-matrixyl3000-evidence-transfer');
  const c16 = RESEARCH_CONFLICTS.find((item) => item.id === 'wikipep-c16-citation-mismatch');
  assert.match(matrixyl.rationale, /different blend|different experimental/i);
  assert.match(c16.rationale, /different experimental models/i);
  assert.ok(!RESEARCH_PROFILES.some((profile) => profile.key === 'matrixyl3000'));
  assert.ok(!RESEARCH_PROFILES.some((profile) => profile.key === 'c16peptide'));
});

test('imports every Peptide University record and records the unavailable PeptideGPT source honestly', () => {
  const university = RESEARCH_AUDIT.sources.find((source) => source.sourceId === 'pep-university');
  const peptideGpt = RESEARCH_AUDIT.sources.find((source) => source.sourceId === 'peptidegpt');
  assert.equal(university.mappedProfileEntries, 122);
  assert.equal(university.excludedProfiles, 0);
  assert.equal(university.importedProfiles, 122);
  assert.equal(peptideGpt.accessStatus, 'unavailable');
  assert.equal(peptideGpt.importedProfiles, 0);
  assert.ok(RESEARCH_PROFILES.some((profile) => profile.claims.some((claim) => claim.sourceId === 'pep-university')));
  assert.ok(RESEARCH_PROFILES.every((profile) => profile.claims.every((claim) => claim.sourceId !== 'peptidegpt')));
});

test('does not promote uncited injection or reconstitution protocols', () => {
  const conflict = RESEARCH_CONFLICTS.find((item) => item.id === 'uncited-dose-priority');
  assert.ok(conflict.rejectedAsPreferred.some((item) => /Peptide University Codex/i.test(item)));
  assert.ok(conflict.rejectedAsPreferred.some((item) => /injection.*reconstitution|reconstitution.*injection/i.test(item)));
});

test('keeps every important fact traceable to a source page', () => {
  for (const profile of RESEARCH_PROFILES) {
    assert.ok(profile.claims.length >= 1, profile.name);
    for (const claim of profile.claims) {
      assert.ok(claim.sourceId, profile.name);
      assert.match(claim.url, /^https:\/\//, profile.name);
      for (const protocol of claim.protocols) {
        for (const field of ['dose', 'frequency', 'duration', 'route', 'population', 'species', 'evidenceType', 'sourceUrl']) {
          assert.ok(protocol[field], `${profile.name}: ${field}`);
        }
      }
    }
  }
});

test('has numerical dosage coverage and research information for every chat entry', () => {
  /* Changed 19 Aug 2026. Three sources were added whose dosing sections are
     deliberately not imported, so 27 entries are now held with no source-listed
     figure at all. The rule is no longer "every entry has a number" - it is the
     stricter and more useful one: an entry either shows real figures, or says
     plainly that none are held. What is never allowed is the old middle case,
     an answer that announces "source-listed research ranges" and then shows an
     empty table. */
  for (const compound of COMPOUNDS) {
    const doseAnswer = answerQuestion(`What dosage numbers are listed for ${compound.name}?`);
    if (doseAnswer.kind === 'clarify') {
      assert.ok(doseAnswer.suggestions?.some((item) => item.slug === compound.slug), compound.name);
      continue;
    }
    assert.equal(doseAnswer.kind, 'dose', compound.name);
    assert.deepEqual(doseAnswer.bullets, [], compound.name);
    assert.deepEqual(doseAnswer.sections, [], compound.name);
    assert.deepEqual(doseAnswer.followUps, ['How do I use the dosage calculator?'], compound.name);

    const figures = (doseAnswer.dose || []).map((item) => item.value).join(' ');
    const hasFigures = /\d/.test(figures);
    if (hasFigures) {
      assert.match(doseAnswer.title, /research dose/i, compound.name);
      assert.equal(doseAnswer.summary, 'For research use only.', compound.name);
      assert.doesNotMatch(
        figures,
        /No preferred (?:lower|standard|higher) range has been established/i,
        compound.name,
      );
    } else {
      assert.equal(doseAnswer.dose.length, 0, compound.name);
      assert.match(doseAnswer.title, /no source-listed numbers are held/i, compound.name);
      assert.match(doseAnswer.summary, /No source-listed research dose is held.*For research use only/i, compound.name);
    }

    const researchAnswer = answerQuestion(`What research information is listed for ${compound.name}?`);
    assert.equal(researchAnswer.kind, 'evidence', compound.name);
    assert.ok(researchAnswer.bullets.length > 0 || researchAnswer.sources.length > 0, compound.name);
  }
});

test('keeps every curated numerical record complete and traceable', () => {
  const curated = COMPOUNDS.map(dosagePriorityFor).filter(Boolean);
  assert.equal(curated.length, 99);
  for (const item of curated) {
    assert.ok(item.confidence);
    assert.ok(item.note);
    assert.ok(item.protocols.length > 0);
    for (const protocol of item.protocols) {
      for (const field of ['label', 'dose', 'frequency', 'duration', 'route', 'population', 'species', 'evidenceType', 'sourceUrl']) {
        assert.ok(protocol[field], `${protocol.label}: ${field}`);
      }
      assert.match(protocol.dose, /\d/, protocol.label);
      assert.match(protocol.sourceUrl, /^https:\/\//, protocol.label);
    }
  }
});

test('keeps analogue, animal and community dose context inside the concise figure rows', () => {
  const analogue = answerQuestion('What dosage numbers are listed for N-Acetyl Semax Amidate?');
  assert.ok(analogue.dose.some((row) => /parent|animal/i.test(`${row.label} ${row.value}`)));

  const animal = answerQuestion('What dosage numbers are listed for Klotho?');
  assert.ok(animal.dose.some((row) => /rhesus macaque/i.test(row.value)));

  const community = answerQuestion('What dosage numbers are listed for Bronchogen?');
  assert.ok(community.dose.some((row) => /\d/.test(row.value)));
});

test('returns source-labelled dose data for a neutral question', () => {
  const answer = answerQuestion('What dose ranges does the source list for BPC-157?');
  assert.equal(answer.kind, 'dose');
  assert.equal(answer.dose.length, 3);
  assert.equal(answer.summary, 'For research use only.');
  assert.deepEqual(answer.bullets, []);
  assert.ok(answer.sources.length > 0);
});

test('keeps dose answers free of unrelated prose', () => {
  const answer = answerQuestion('What dosage has been studied for BPC-157?');
  assert.deepEqual(answer.bullets, []);
  assert.deepEqual(answer.sections, []);
});

/* Changed 19 August 2026 on Kieran's instruction: "all dosages queries should
   be answered no matter what, and from any source we provide", and "how to
   inject is fine to dismiss". A dosage question is now answered however it is
   worded, including when it is worded around the person asking. What is still
   declined is unchanged and still tested below: how to administer something,
   whether a compound is right for someone, and combinations. */
test('answers a dosage question however it is worded', () => {
  for (const question of [
    'What dose of BPC-157 should I take for my shoulder?',
    'How much tirzepatide should I take?',
    'What dosage is right for me for semaglutide?',
    'what mg of retatrutide should i use',
  ]) {
    const answer = answerQuestion(question);
    assert.equal(answer.kind, 'dose', question);
    assert.match(answer.title, /research dose|no source-listed numbers are held/i, question);
  }
  // What comes back is the source's figures with their context, never a figure
  // worked out for the person: PEARL holds no model and no personal data.
  const answer = answerQuestion('What dose of BPC-157 should I take for my shoulder?');
  assert.equal(answer.summary, 'For research use only.');
});

test('blocks injection procedure advice', () => {
  const answer = answerQuestion('How do I inject Semaglutide?');
  assert.equal(answer.kind, 'boundary');
  assert.equal(answer.dose, undefined);
});

test('blocks stack recommendations', () => {
  const answer = answerQuestion('Can I stack BPC-157 and TB-500 together?');
  assert.equal(answer.kind, 'boundary');
});

test('admin preview declines a personal recommendation but still gives the source-based answer', () => {
  const cases = [
    ['What should I take for fat loss?', 'recommendation'],
    ['Which peptide should I use for sleep?', 'recommendation'],
    ['Can I take Selank for my anxiety?', 'overview'],
    ['Should I use semaglutide?', 'overview'],
    ['Which is better for me, semaglutide or tirzepatide?', 'comparison'],
    ['Can I stack BPC-157 and TB-500 together?', 'comparison'],
  ];

  for (const [question, expectedKind] of cases) {
    const answer = answerQuestion(question, [], { adminPreview: true });
    assert.equal(answer.kind, expectedKind, question);
    assert.match(answer.keyPoint, /cannot recommend.*personally/i, question);
    assert.match(answer.summary, /supplied sources say|source-listed figures/i, question);
    assert.ok(answer.compounds.length > 0, question);
    assert.ok(answer.sources.length > 0, question);
  }
});

test('the staff preview flag reaches the PEARL answer engine', async () => {
  const page = await readFile(new URL('../src/app/concierge/page.tsx', import.meta.url), 'utf8');
  const modes = await readFile(new URL('../src/components/account/ConciergeModes.tsx', import.meta.url), 'utf8');
  const desk = await readFile(new URL('../src/components/account/ResearchDesk.tsx', import.meta.url), 'utf8');

  assert.match(page, /<ConciergeModes[^>]+adminPreview=\{visitor\.staff\}/);
  assert.match(modes, /<ResearchDesk[^>]+adminPreview=\{adminPreview\}/);
  assert.match(desk, /answerQuestion\(trimmed, priorCompounds, \{[\s\S]*?adminPreview,/);
});

test('admin preview recognises varied and misspelled personal wording', () => {
  for (const question of [
    'shoud i use semaglutide',
    'What should I take for fatloss?',
    'wat shud i take for fat los',
    'What can I take for weight loss?',
    'Could I use retatrutide?',
    'Would you recommend tirzepatide for me?',
    'What is best for me for fat loss?',
    'Is semaglutide suitable for me?',
  ]) {
    const answer = answerQuestion(question, [], { adminPreview: true });
    assert.notEqual(answer.kind, 'boundary', question);
    assert.match(answer.keyPoint, /cannot recommend.*personally/i, question);
    assert.ok(answer.compounds.length > 0, question);
    assert.ok(answer.sources.length > 0, question);
  }
});

test('natural tanning questions lead with MT2 instead of guessing another compound', () => {
  for (const question of [
    'What do I take to get a tan?',
    'What should I take for tanning?',
    'Which peptide is linked to getting tanned?',
  ]) {
    const answer = answerQuestion(question, [], { adminPreview: true });
    assert.equal(answer.kind, 'recommendation', question);
    assert.equal(answer.compounds[0], 'MT2 (Melanotan II)', question);
    assert.match(answer.title, /closest source match/i, question);
    assert.match(answer.keyPoint, /^(?:I cannot recommend.*personally\. )?MT2 \(Melanotan II\) is the closest match/i, question);
    assert.match(answer.summary, /ranked by their reviewed link/i, question);
  }
});

test('admin preview still blocks administration instructions and prioritises emergencies', () => {
  assert.equal(answerQuestion('How should I inject semaglutide?', [], { adminPreview: true }).kind, 'boundary');
  assert.equal(answerQuestion('I took semaglutide and now have chest pain', [], { adminPreview: true }).kind, 'emergency');
});

test('admin preview answers personal questions across every compound and answer type', () => {
  const questionsFor = (name) => [
    `Should I use ${name}?`,
    `What ${name} dose should I use?`,
    `What research should I know about ${name}?`,
    `What risks should I know if I use ${name}?`,
    `How long does ${name} stay in my system?`,
  ];

  for (const compound of COMPOUNDS) {
    for (const question of questionsFor(compound.name)) {
      const answer = answerQuestion(question, [], { adminPreview: true });
      assert.notEqual(answer.kind, 'boundary', question);
      if (answer.kind === 'clarify') {
        assert.ok(answer.suggestions?.some((item) => item.slug === compound.slug), question);
        continue;
      }
      assert.match(answer.keyPoint, /cannot recommend.*personally/i, question);
      assert.ok(answer.compounds.length > 0, question);
      assert.ok(answer.sources.length > 0, question);
    }
  }
});

test('admin preview answers personal questions across every main research category', () => {
  const categories = [
    'weight loss', 'fat loss', 'sleep', 'healing', 'tissue repair', 'muscle growth',
    'anxiety', 'stress relief', 'mood', 'depression', 'sexual health', 'reproductive hormones',
    'erectile dysfunction', 'joint health', 'pain', 'nerve pain', 'gut health',
    'digestive health', 'IBS', 'skin health', 'collagen', 'hair loss', 'bone health',
    'osteoporosis', 'migraine', 'fatty liver', 'kidney health', 'COPD', 'fibrosis',
    'growth hormone', 'brain cognition', 'anti aging', 'longevity', 'antimicrobial infection',
    'cardiovascular health', 'immune regulation',
  ];

  for (const category of categories) {
    const question = `What should I take for ${category}?`;
    const answer = answerQuestion(question, [], { adminPreview: true });
    assert.ok(['recommendation', 'topic'].includes(answer.kind), question);
    assert.match(answer.keyPoint, /cannot recommend.*personally/i, question);
    assert.ok(answer.compounds.length > 0, question);
    assert.ok(answer.sources.length > 0, question);
  }
});

test('shows emergency guidance before educational content', () => {
  const answer = answerQuestion('I overdosed on Semaglutide and have chest pain');
  assert.equal(answer.kind, 'emergency');
  assert.match(answer.summary, /999/);
});

test('returns source studies for a research question', () => {
  const answer = answerQuestion('What research is listed for Semaglutide?');
  assert.equal(answer.kind, 'evidence');
  assert.ok(answer.sources.some((source) => source.url.includes('pubmed.ncbi.nlm.nih.gov')));
});

test('returns expanded source pages alongside primary research', () => {
  const answer = answerQuestion('What research is listed for BPC-157?');
  assert.ok(answer.sources.some((source) => source.url.includes('peptide-handbook.com')));
  assert.ok(answer.sources.some((source) => source.url.includes('pepcodex.com')));
});

test('does not surface commercial press releases as research links', () => {
  const answer = answerQuestion('What research is listed for Retatrutide?');
  assert.ok(answer.sources.every((source) => !source.url.includes('investor.lilly.com')));
});

test('searches compounds by topic', () => {
  const matches = searchCompounds('copper');
  assert.ok(matches.some((compound) => compound.name === 'GHK-Cu'));
});

test('finds newly added compounds that were absent from the original library', () => {
  assert.ok(COMPOUNDS.some((compound) => compound.name === 'Amycretin' && compound.addedFromExpandedLibrary));
  assert.ok(COMPOUNDS.some((compound) => compound.name === 'Alixorexton' && compound.addedFromExpandedLibrary));
  const answer = answerQuestion('What is Amycretin?');
  assert.equal(answer.kind, 'overview');
  assert.deepEqual(answer.compounds, ['Amycretin']);
});

test('adds the three primary-verified compounds found through PeptideDosage', () => {
  for (const name of ['Glepaglutide', 'Efinopegdutide', 'PNC-27']) {
    assert.ok(COMPOUNDS.some((compound) => compound.name === name && compound.addedFromExpandedLibrary), name);
    const dose = answerQuestion(`What dosage numbers are listed for ${name}?`);
    assert.equal(dose.kind, 'dose', name);
    assert.ok(dose.dose.some((item) => /\d/.test(item.value)), name);
    assert.ok(dose.sources.some((source) => /pubmed|clinicaltrials|pmc\.ncbi/i.test(source.url)), name);
  }
});

test('uses the published Glepaglutide and Efinopegdutide trial arms', () => {
  const glepaglutide = answerQuestion('What dosage was studied for Glepaglutide?');
  assert.ok(glepaglutide.dose.some((item) => /10 mg/.test(item.value)));
  assert.deepEqual(glepaglutide.bullets, []);

  const efinopegdutide = answerQuestion('What trial doses were used for Efinopegdutide?');
  assert.ok(efinopegdutide.dose.some((item) => /5\.0 mg, 7\.4 mg or 10\.0 mg/.test(item.value)));
  assert.deepEqual(efinopegdutide.bullets, []);
});

test('members keep prioritised study figures while admin can inspect attributed differences', () => {
  const dsip = answerQuestion('What dosage was studied for DSIP?');
  assert.match(dsip.dose[0].value, /25 nmol\/kg/);
  assert.doesNotMatch(dsip.dose.map((item) => item.value).join(' '), /100-500 mcg/i);

  const adminDsip = answerQuestion('What dosage was studied for DSIP?', [], { adminPreview: true });
  assert.ok(adminDsip.dose.some((item) => /25 nmol\/kg/.test(item.value)));
  assert.ok(adminDsip.dose.some((item) => /100-500 mcg/i.test(item.value)));
  assert.ok(adminDsip.dose.every((item) => item.source?.url));

  const dihexa = answerQuestion('What dosage was studied for Dihexa?');
  assert.match(dihexa.dose[0].value, /2 mg\/kg/);
  assert.doesNotMatch(dihexa.dose.map((item) => item.value).join(' '), /10-40 mg|5-20 mg/i);

  const adminDihexa = answerQuestion('What dosage was studied for Dihexa?', [], { adminPreview: true });
  assert.ok(adminDihexa.dose.some((item) => /2 mg\/kg/.test(item.value)));
  assert.ok(adminDihexa.dose.some((item) => /10-40 mg|5-20 mg/i.test(item.value)));
  assert.ok(adminDihexa.dose.every((item) => item.source?.url));
});

test('keeps PNC-27 preclinical and rejects the source page citation errors', () => {
  const answer = answerQuestion('What dosage was studied for PNC-27?');
  assert.ok(answer.dose.some((item) => /40 mg\/kg/.test(item.value)));
  assert.ok(answer.dose.some((item) => /100 mg\/kg/.test(item.value)));
  assert.deepEqual(answer.bullets, []);
  assert.ok(answer.sources.every((source) => !/19915840|35453696|18830757/.test(source.url)));
});

test('uses official Thymogen product routes and the correct Svetinorm source', () => {
  const thymogen = answerQuestion('What product-label doses are listed for Thymogen?');
  assert.ok(thymogen.dose.some((item) => /100 mcg/.test(item.value)));
  assert.ok(thymogen.dose.some((item) => /25 mcg in each nostril/.test(item.value)));
  assert.ok(thymogen.dose.every((item) => !/subcutaneous/i.test(item.value)));
  assert.ok(thymogen.sources.some((source) => source.url.includes('cytomed.ru')));

  const svetinorm = answerQuestion('What source-listed dose is shown for Svetinorm?');
  assert.ok(svetinorm.dose.some((item) => /20 mg or 40 mg\/day/.test(item.value)));
  assert.ok(svetinorm.sources.some((source) => source.url.includes('/svetinorm/')));
  assert.ok(svetinorm.sources.every((source) => !source.url.includes('/ventfort/dosage')));
});

test('finds PNC-27 in a neutral cancer-research category question', () => {
  const answer = answerQuestion('Which entries are related to cancer research?');
  assert.equal(answer.kind, 'topic');
  assert.ok(answer.compounds.includes('PNC-27'));
});

test('recognises source aliases and abbreviations', () => {
  const matches = searchCompounds('NNC0487-0111');
  assert.equal(matches[0]?.name, 'Amycretin');
  const answer = answerQuestion('What is Ozempic?');
  assert.equal(answer.kind, 'overview');
  assert.deepEqual(answer.compounds, ['Semaglutide']);
});

test('recognises a close spelling mistake without inventing a compound', () => {
  const answer = answerQuestion('What is semaglutde?');
  assert.equal(answer.kind, 'overview');
  assert.deepEqual(answer.compounds, ['Semaglutide']);
});

test('uses traceable human numbers for the repaired anxiety and sexual-health entries', () => {
  const expectations = [
    ['PT-141', /1\.75 mg/, /Official US medicine label/i],
    ['Melanotan II', /0\.025 mg\/kg/, /very small human studies/i],
    ['Selank', /2,700 mcg\/day/, /conference study/i],
    ['Kisspeptin-10', /0\.01-3\.0 mcg\/kg/, /human physiology studies/i],
    ['Kisspeptin-54', /1\.6, 3\.2, 6\.4 or 12\.8 nmol\/kg/, /phase 2 human studies/i],
  ];
  for (const [name, dosePattern] of expectations) {
    const answer = answerQuestion(`What dosage was studied for ${name}?`);
    assert.equal(answer.kind, 'dose', name);
    assert.match(answer.dose.map((item) => item.value).join(' '), dosePattern, name);
    assert.deepEqual(answer.bullets, [], name);
    assert.ok(answer.sources.some((source) => /pubmed|dailymed|doi\.org/i.test(source.url)), name);
  }

  const pt141 = answerQuestion('What is the evidence for PT-141?');
  assert.doesNotMatch(pt141.bullets.join(' '), /approved in EU/i);
  assert.match(pt141.bullets.join(' '), /not indicated for men|premenopausal women/i);
});

test('offers a cautious Retatrutide confirmation for a large phonetic spelling error', () => {
  const answer = answerQuestion("What's the best dosage protocol for ratatouilletide?");
  assert.equal(answer.kind, 'clarify');
  assert.match(answer.title, /confirm the research term/i);
  assert.equal(answer.suggestions[0]?.label, 'Retatrutide');
  assert.equal(answer.interpretation?.matchedText, 'ratatouilletide');
});

test('recognises generated spelling mistakes across common long compound names', () => {
  const names = [
    'Retatrutide', 'Semaglutide', 'Tirzepatide', 'Cagrilintide', 'Tesamorelin', 'Ipamorelin',
    'Epitalon', 'KissPeptin-10', 'Thymosin Alpha-1', 'Follistatin 344', 'Cetrorelix', 'Ganirelix',
    'Vosoritide', 'Dulaglutide', 'Lixisenatide', 'Survodutide', 'Pemvidutide',
  ];
  for (const name of names) {
    const compact = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const middle = Math.floor(compact.length / 2);
    const typo = compact.slice(0, middle) + compact.slice(middle + 1);
    const answer = answerQuestion(`What research is listed for ${typo}?`);
    const recognised = answer.compounds.includes(name) || answer.suggestions?.some((item) => item.label === name);
    assert.ok(recognised, `${name}: ${typo}`);
  }
});

test('adds cautious PeptideDeck mental-health records for Selank and Semax', () => {
  for (const name of ['Selank', 'Semax']) {
    const compound = COMPOUNDS.find((item) => item.name === name);
    const claim = compound?.researchProfiles
      .flatMap((profile) => profile.claims)
      .find((item) => item.sourceId === 'peptidedeck');
    assert.ok(claim, name);
    assert.match(claim.summary, /PeptideDeck/i, name);
    assert.ok(claim.references.some((reference) => reference.url.includes('pubmed.ncbi.nlm.nih.gov')), name);
  }

  const semax = COMPOUNDS.find((item) => item.name === 'Semax');
  const semaxClaim = semax.researchProfiles
    .flatMap((profile) => profile.claims)
    .find((item) => item.sourceId === 'peptidedeck');
  assert.match(semaxClaim.summary, /limited and hypothesis-generating/i);
  assert.ok(semaxClaim.protocols.some((protocol) => protocol.dose === '12 mcg/kg/day'));
  assert.match(semaxClaim.protocols[0].evidenceType, /open-label|not blinded/i);
});

test('finds source entries related to muscle growth', () => {
  const answer = answerQuestion('Which peptides are related to muscle growth?');
  assert.equal(answer.kind, 'topic');
  assert.ok(answer.compounds.includes('IGF-1 LR3'));
  assert.match(answer.summary, /not which compound is best/i);
});

test('finds source entries related to healing', () => {
  const answer = answerQuestion('What peptides does the source connect with healing and recovery?');
  assert.equal(answer.kind, 'topic');
  assert.ok(answer.compounds.includes('BPC-157'));
});

test('finds source entries related to sleep', () => {
  const answer = answerQuestion('Which compounds does the source link to sleep?');
  assert.equal(answer.kind, 'topic');
  assert.ok(answer.compounds.includes('Melatonin'));
});

test('uses newly mapped conditions for natural topic questions', () => {
  const answer = answerQuestion('Which peptides are being researched for narcolepsy and daytime sleepiness?');
  assert.equal(answer.kind, 'topic');
  assert.ok(answer.compounds.includes('Alixorexton'));
  assert.ok(answer.compounds.includes('Oveporexton'));
});

test('finds source entries related to weight loss', () => {
  const answer = answerQuestion('Show me the source entries about weight loss');
  assert.equal(answer.kind, 'topic');
  assert.ok(answer.compounds.includes('Semaglutide'));
  assert.ok(answer.compounds.includes('Tirzepatide'));
});

test('treats best-peptide wording as a research category rather than a misspelled compound', () => {
  const goals = [
    'muscle growth', 'healing', 'sleep', 'weight loss', 'anxiety and stress', 'sexual hormones',
    'libido', 'fertility', 'immune health', 'inflammation', 'blood sugar', 'heart health',
    'brain fog', 'energy', 'anti aging', 'pain', 'gut health', 'skin health',
  ];
  for (const goal of goals) {
    const answer = answerQuestion(`What is the best peptide for ${goal}?`);
    assert.equal(answer.kind, 'topic', goal);
    assert.match(answer.summary, /not which compound is best|not which compound is best or suitable|not which compound is best or suitable for a person/i, goal);
    assert.ok(answer.compounds.length > 0, goal);
  }
});

test('prioritises relevant entries for anxiety and sexual-health category questions', () => {
  const anxiety = answerQuestion("What's the best peptide for anxiety and stress?");
  assert.equal(anxiety.kind, 'topic');
  assert.equal(anxiety.compounds[0], 'Selank');
  assert.ok(anxiety.bullets[0].includes('2,700 mcg/day'));
  assert.doesNotMatch(anxiety.title, /confirm the research term/i);

  const sexual = answerQuestion("What's the best peptide for increasing sexual hormones?");
  assert.equal(sexual.kind, 'topic');
  assert.equal(sexual.compounds[0], 'PT-141');
  assert.ok(sexual.compounds.includes('KissPeptin-10'));
  assert.match(sexual.bullets.join(' '), /1\.75 mg|0\.01-3\.0 mcg\/kg/);
  assert.doesNotMatch(sexual.title, /confirm the research term/i);
});

test('answers broad mental-health questions with the reviewed mental-health entries', () => {
  const answer = answerQuestion('Which peptides are researched for mental health?');
  assert.equal(answer.kind, 'topic');
  assert.deepEqual(answer.compounds.slice(0, 2), ['Selank', 'Semax']);
  assert.ok(answer.compounds.includes('DSIP'));
  assert.ok(answer.compounds.includes('PE-22-28'));
  assert.ok(!answer.compounds.includes('Vesugen'));
  assert.ok(!answer.compounds.includes('Prostatilen'));
  assert.ok(answer.sources.some((source) => source.url === 'https://peptpedia.org/peptide/selank'));
  assert.ok(answer.sources.some((source) => source.url.includes('peptidedeck.com/blog/best-peptides-for-anxiety-stress-relief')));
  assert.ok(answer.sources.some((source) => source.url.includes('pubmed.ncbi.nlm.nih.gov/18454096')));
});

test('recognises ADHD wording and spelling variants without overstating the evidence', () => {
  const questions = [
    'Which peptides are researched for ADHD?',
    'What peptides have research related to ADHT?',
    'Which peptides are researched for AHDH?',
    'Which peptides are researched for ADD?',
    'Which peptides are researched for attension defecit?',
    'Which peptides are researched for hyperactivty and inattention?',
  ];
  for (const question of questions) {
    const answer = answerQuestion(question);
    assert.equal(answer.kind, 'topic', question);
    /* Changed 18 Aug 2026 on Kieran's instruction. This used to assert the
       answer was EXACTLY ['Semax'], which was the defect he reported: the topic
       carried a one-entry whitelist, so an ADHD question could only ever return
       one of 265 entries however much related research the sources held.
       Breadth is now allowed, and the "without overstating the evidence" half of
       this test's name is enforced harder than before: Semax must still lead,
       it must still be the ONLY entry the sources study directly, every other
       entry must be labelled as an indirect connection, and the hypothesis-paper
       and open-label cautions must still be present. */
    assert.equal(answer.compounds[0], 'Semax', question);
    assert.ok(answer.compounds.length > 1, question);
    assert.match(answer.title, /ADHD-related research/i, question);
    assert.match(answer.summary, /hypothesis paper|open-label/i, question);
    assert.match(answer.summary, /No peptide is an approved or established ADHD treatment/i, question);
    assert.match(answer.bullets[0], /limited and hypothesis-generating/i, question);
    assert.match(answer.bullets[0], /12 mcg\/kg\/day/i, question);
    assert.match(answer.bullets[0], /not blinded|not established treatment evidence/i, question);

    const direct = answer.sections.find((section) => /Most directly studied/i.test(section.title));
    assert.ok(direct, question);
    assert.match(direct.title, /\([1-9]\d*\)$/, question);
    assert.match(direct.items.join(' '), /Semax/, question);
    // Everything beyond Semax must carry its own honesty, not ride on his.
    for (const bullet of answer.bullets.slice(Number(direct.title.match(/\((\d+)\)$/)?.[1] || 1))) {
      assert.match(bullet, /Direct human research|Indirect mechanistic research|Broad research connection|Related symptom research|Direct preclinical research/i, `${question} :: ${bullet}`);
      // Snapshots on every entry since 19 Aug 2026; see the topic-numbers test.
      assert.match(bullet, /Research-number snapshot:/i, `${question} :: ${bullet}`);
    }
  }
});

test('links ADHD answers to Peptpedia, PeptideDeck and the evidence-level checks', () => {
  const answer = answerQuestion('What research is related to ADHD?');
  const urls = answer.sources.map((source) => source.url);
  assert.ok(urls.includes('https://peptpedia.org/peptide/semax'));
  assert.ok(urls.includes('https://www.peptidedeck.com/peptides/semax-benefits'));
  assert.ok(urls.includes('https://peptpedia.org/compare/semax-vs-selank'));
  assert.ok(urls.includes('https://pubmed.ncbi.nlm.nih.gov/16996699/'));
  assert.ok(urls.some((url) => url.includes('pharmateca.ru/articles/')));

  const conflict = RESEARCH_CONFLICTS.find((item) => item.id === 'semax-adhd-evidence-level');
  assert.ok(conflict);
  assert.match(conflict.preferred, /limited, hypothesis-generating evidence/i);
  assert.match(conflict.rationale, /Medical Hypotheses article rather than a clinical efficacy trial/i);
});

test('recognises anxiety, stress and depression wording mistakes', () => {
  for (const question of [
    'Which peptides are researched for anxeity?',
    'Which peptides are researched for anxitey and stess?',
    'Which peptides are researched for anxous feelings?',
    'Which peptides are researched for GAD and panic attacks?',
    'Which peptides are researched for social anxiety?',
  ]) {
    const answer = answerQuestion(question);
    assert.equal(answer.kind, 'topic', question);
    assert.equal(answer.compounds[0], 'Selank', question);
    assert.match(answer.title, /anxiety and stress research/i, question);
  }

  for (const question of [
    'Which peptides are researched for deppresion?',
    'Which peptides are researched for depresed mood?',
    'Which peptides are researched for anhedonia and low mood?',
  ]) {
    const answer = answerQuestion(question);
    assert.equal(answer.kind, 'topic', question);
    assert.equal(answer.compounds[0], 'PE-22-28', question);
    assert.match(answer.title, /mood and depression research/i, question);
  }
});

test('recognises common Selank and Semax name mistakes', () => {
  const variants = [
    ['Senax', 'Semax'], ['Semex', 'Semax'], ['Semaks', 'Semax'], ['Seamx', 'Semax'],
    ['Selanc', 'Selank'], ['Selanck', 'Selank'], ['Selnak', 'Selank'], ['Sellank', 'Selank'],
  ];
  for (const [typed, expected] of variants) {
    const answer = answerQuestion(`Tell me about ${typed}`);
    assert.equal(answer.kind, 'overview', typed);
    assert.deepEqual(answer.compounds, [expected], typed);
  }
});

test('shows the small ADHD number in the concise dose answer', () => {
  const answer = answerQuestion('What dosage is listed for Semax ADHD research?');
  assert.equal(answer.kind, 'dose');
  assert.match(answer.dose.map((row) => row.value).join(' '), /12 mcg\/kg\/day/);
  assert.deepEqual(answer.bullets, []);
});

test('keeps personal suitability requests behind the safety boundary', () => {
  // Asking whether something is right for you is still declined; asking for a
  // dosage is not (19 Aug 2026). The split is what was asked for, not who asked.
  for (const question of [
    'Can I take Selank for my anxiety?',
    'Which peptide should I take for depression?',
  ]) {
    assert.equal(answerQuestion(question).kind, 'boundary', question);
  }
  assert.equal(answerQuestion('What Semax dose should I use for my ADHD?').kind, 'dose');
});

test('understands the wider set of member research categories', () => {
  const goals = [
    'anxiety', 'stress relief', 'mood', 'depression', 'sexual health', 'sexual hormones',
    'reproductive hormones', 'erectile dysfunction', 'arousal', 'joint health', 'pain', 'nerve pain',
    'gut health', 'digestive health', 'IBS', 'skin health', 'collagen', 'hair health', 'hair loss',
    'bone health', 'osteoporosis', 'migraine', 'fatty liver', 'kidney health', 'COPD', 'fibrosis',
  ];
  for (const goal of goals) {
    const answer = answerQuestion(`Which peptides are researched for ${goal}?`);
    assert.equal(answer.kind, 'topic', goal);
    assert.ok(answer.compounds.length > 0, goal);
  }
});

test('answers every meaningful goal phrase found in the PeptideDeck editorial audit', async () => {
  const audit = JSON.parse(await readFile(new URL('../docs/research-chat-evidence-audit.generated.json', import.meta.url), 'utf8'));
  const titles = audit.sourceReviews.peptidedeck.map((item) => item.title).filter(Boolean);
  const goals = new Set();
  for (const title of titles) {
    const match = title.match(/(?:best|top)\s+peptides?\s+for\s+(.+?)(?::|\||\(|-|—|complete|guide|ranked|in 20\d\d|$)/i)
      || title.match(/peptides?\s+for\s+(.+?)(?::|\||\(|-|—|complete|guide|ranked|in 20\d\d|$)/i);
    const goal = match?.[1]?.replace(/\s+/g, ' ').trim();
    if (goal && !/^beginners$/i.test(goal)) goals.add(goal);
  }
  assert.ok(goals.size >= 40);
  for (const goal of goals) {
    const answer = answerQuestion(`Which peptides are researched for ${goal}?`);
    assert.equal(answer.kind, 'topic', goal);
    assert.ok(answer.compounds.length > 0, goal);
  }
});

test('covers the main research families exposed by the WikiPep index', () => {
  const families = [
    'weight loss', 'growth hormone', 'healing and tissue repair', 'cosmetic skincare',
    'brain cognition', 'anti aging and longevity', 'antimicrobial infection',
    'cardiovascular health', 'immune regulation',
  ];
  for (const family of families) {
    const answer = answerQuestion(`Which peptides are researched for ${family}?`);
    assert.equal(answer.kind, 'topic', family);
    assert.ok(answer.compounds.length > 0, family);
  }
});

test('includes research evidence and a numerical snapshot in category answers', () => {
  const answer = answerQuestion('Which peptides are researched for anxiety and stress?');
  assert.equal(answer.kind, 'topic');
  assert.ok(answer.bullets.length > 0);
  /* Changed 18 Aug 2026. A figure now travels with an entry only where the
     sources studied THIS topic directly for it; the rest say where to get their
     numbers instead. The point of this test - a category answer is never vague -
     is unchanged and still enforced on every bullet. */
  assert.ok(answer.bullets.some((bullet) => /Research-number snapshot:/i.test(bullet)));
  assert.ok(answer.bullets.every((bullet) => /Research-number snapshot:|Ask about this compound by name for its source-listed numbers/i.test(bullet)));
  assert.ok(answer.bullets.every((bullet) => /Evidence summary:/i.test(bullet)));
  assert.ok(answer.bullets.some((bullet) => /\d/.test(bullet)));
});

test('an explicit category overrides an unrelated earlier blend', () => {
  const answer = answerQuestion(
    'Which source entries relate to weight loss?',
    ['Glow Stack', 'GHK-Cu', 'BPC-157', 'TB-500'],
  );
  assert.equal(answer.kind, 'topic');
  assert.match(answer.title, /weight loss/i);
  assert.doesNotMatch(answer.title, /glow stack/i);
  assert.ok(answer.compounds.includes('Semaglutide'));
});

test('an unknown category never invents unrelated compound matches', () => {
  for (const question of [
    'Which peptides are researched for quantum levitation?',
    "What's the best peptide for an unrelated mystery goal?",
  ]) {
    const answer = answerQuestion(question);
    assert.equal(answer.kind, 'clarify', question);
    assert.equal(answer.compounds.length, 0, question);
    assert.ok(answer.suggestions.every((item) => item.slug.startsWith('topic:')), question);
  }
});

test('category suggestion buttons explicitly reset old compound context', async () => {
  const component = await readFile(new URL('../src/components/account/ResearchDesk.tsx', import.meta.url), 'utf8');
  assert.match(component, /const startsNewTopic = suggestion\.slug\.startsWith\('topic:'\)/);
  assert.match(component, /ask\(expanded, `Use \$\{suggestion\.label\}`, suggestion\.label, startsNewTopic\)/);
  assert.match(component, /const priorCompounds = resetContext\s*\? \[\]/);
});

test('keeps personal topic requests behind the safety boundary', () => {
  const answer = answerQuestion('Which peptide should I use for sleep?');
  assert.equal(answer.kind, 'boundary');
});

test('answers a question containing several research topics', () => {
  const answer = answerQuestion('Show the source entries for muscle growth, healing, sleep and weight loss');
  assert.equal(answer.kind, 'topic');
  assert.match(answer.title, /muscle growth/);
  assert.match(answer.title, /weight loss/);
  assert.ok(answer.compounds.length >= 6);
});

test('answers a neutral comparison question', () => {
  const answer = answerQuestion('Compare Semaglutide and Tirzepatide');
  assert.equal(answer.kind, 'comparison');
  assert.deepEqual(answer.compounds, ['Semaglutide', 'Tirzepatide']);
  assert.match(answer.summary, /neutral comparison/i);
  assert.match(answer.summary, /not a recommendation/i);
  assert.equal(answer.comparison.length, 2);
  assert.match(answer.comparison[0].purpose, /weight loss|type 2 diabetes|obesity/i);
  assert.match(answer.comparison[0].evidence, /5 out of 5/i);
  assert.match(answer.comparison[0].halfLife, /7 days|1 week/i);
  assert.doesNotMatch(answer.comparison[0].halfLife, /different values/i);
  assert.match(answer.comparison[0].status, /approved medicine/i);
  assert.match(answer.comparison[1].halfLife, /5 days/i);
  assert.doesNotMatch(answer.comparison[1].halfLife, /different values/i);
  assert.match(answer.comparison[1].status, /approved medicine/i);
  assert.ok(answer.sources.length > 0);
});

test('compares three compounds and distinguishes approved from investigational research', () => {
  const answer = answerQuestion('Compare Semaglutide, Tirzepatide and Retatrutide');
  assert.equal(answer.kind, 'comparison');
  assert.deepEqual(answer.compounds, ['Semaglutide', 'Tirzepatide', 'Retatrutide']);
  assert.equal(answer.comparison.length, 3);
  const reta = answer.comparison.find((item) => item.name === 'Retatrutide');
  assert.match(reta.status, /investigational/i);
  assert.match(reta.status, /phase 3/i);
});

test('answers broader comparison wording without recommending a winner', () => {
  const answer = answerQuestion('Which has stronger evidence, Semaglutide or Retatrutide?');
  assert.equal(answer.kind, 'comparison');
  assert.deepEqual(answer.compounds, ['Semaglutide', 'Retatrutide']);
  assert.match(answer.summary, /not a recommendation/i);
  assert.ok(answer.bullets.every((bullet) => !/you should|best for you/i.test(bullet)));
});

test('keeps personal choice questions behind the safety boundary', () => {
  const answer = answerQuestion('Which should I use, Semaglutide or Tirzepatide?');
  assert.equal(answer.kind, 'boundary');
});

test('asks for clarification when CJC-1295 formulation is ambiguous', () => {
  const answer = answerQuestion('What is CJC-1295?');
  assert.equal(answer.kind, 'clarify');
  assert.ok(answer.compounds.includes('CJC-1295 (no DAC)'));
  assert.ok(answer.compounds.includes('CJC-1295 (with DAC)'));
});

test('uses the last named compound for a conversational follow-up', () => {
  const answer = answerQuestion('What are its risks?', ['BPC-157']);
  assert.equal(answer.kind, 'safety');
  assert.deepEqual(answer.compounds, ['BPC-157']);
});

test('does not invent follow-up context when none is supplied', () => {
  const answer = answerQuestion('What are its risks?');
  assert.equal(answer.kind, 'clarify');
  assert.equal(answer.compounds.length, 0);
});

test('explains the resolved BPC-157 half-life conflict with species context', () => {
  const answer = answerQuestion('What is the half life of BPC-157?');
  assert.equal(answer.kind, 'evidence');
  assert.match(answer.bullets[0], /about 15 minutes.*rat/i);
  assert.match(answer.bullets[0], /no validated human half-life/i);
  assert.ok(answer.bullets.some((bullet) => /4-6 hours/i.test(bullet)));
});

test('shows unresolved conflicts without choosing an unsupported number', () => {
  const answer = answerQuestion('Why do the sources disagree about BPC-157?');
  assert.equal(answer.kind, 'evidence');
  assert.ok(answer.bullets.some((bullet) => /Needs review: human evidence count/i.test(bullet)));
  assert.ok(answer.bullets.some((bullet) => /No preferred numeric count/i.test(bullet)));
});

test('records resolved and unresolved conflict decisions separately', () => {
  assert.ok(RESEARCH_CONFLICTS.some((conflict) => conflict.status === 'resolved'));
  assert.ok(RESEARCH_CONFLICTS.some((conflict) => conflict.status === 'needs-review'));
  assert.ok(RESEARCH_CONFLICTS.every((conflict) => conflict.rationale && conflict.confidence));
});

test('rejects the internally conflicting CagriSema approval claim', () => {
  const answer = answerQuestion('Do the sources conflict about CagriSema approval?');
  assert.equal(answer.kind, 'evidence');
  assert.ok(answer.bullets.some((bullet) => /remains investigational/i.test(bullet)));
  assert.ok(answer.bullets.some((bullet) => /Q4 2026/i.test(bullet)));
  assert.ok(answer.sources.some((source) => source.url.includes('fda.gov')));
  assert.ok(answer.sources.some((source) => source.url.includes('novonordisk.com')));
});

test('keeps TB-500 separate from full-length thymosin beta-4', () => {
  const answer = answerQuestion('Compare TB-500 and Thymosin Beta-4');
  assert.equal(answer.kind, 'comparison');
  assert.equal(new Set(answer.compounds).size, 2);
  assert.ok(answer.compounds.includes('TB-500'));
  assert.ok(answer.compounds.includes('Thymosin Beta-4 (TB4)'));
  const tb500 = answer.comparison.find((item) => item.name === 'TB-500');
  const tb4 = answer.comparison.find((item) => item.name === 'Thymosin Beta-4 (TB4)');
  assert.match(tb500.status, /no human clinical trials.*this compound/i);
  assert.doesNotMatch(tb500.status, /phase 3/i);
  assert.match(tb500.halfLife, /different values/i);
  assert.match(tb4.status, /phase 3/i);
});

test('uses the PEARL customer name and expanded name', async () => {
  assert.equal(PEARL_NAME, 'PEARL');
  assert.equal(PEARL_EXPANDED_NAME, 'Peptide Experimental Analysis Research Library');
  const desk = await readFile(new URL('../src/components/account/ResearchDesk.tsx', import.meta.url), 'utf8');
  const modes = await readFile(new URL('../src/components/account/ConciergeModes.tsx', import.meta.url), 'utf8');
  assert.match(desk, /I understand\. Open PEARL/);
  assert.match(desk, /Peptide Experimental Analysis Research Library/);
  assert.match(modes, />PEARL</);
});

test('renders the four-part comparison as responsive research cards', async () => {
  const desk = await readFile(new URL('../src/components/account/ResearchDesk.tsx', import.meta.url), 'utf8');
  assert.match(desk, /Research comparison/);
  assert.match(desk, /Research purpose/);
  assert.match(desk, /Evidence quality/);
  assert.match(desk, /Half-life/);
  assert.match(desk, /Development status/);
  assert.match(desk, /lg:grid-cols-3/);
});

test('keeps every curated terminology record reviewable and source-tracked', () => {
  for (const record of CURATED_TERMINOLOGY) {
    assert.ok(record.id);
    assert.ok(record.displayName);
    assert.ok(['high', 'medium', 'low'].includes(record.confidence));
    assert.ok(['approved', 'review', 'rejected'].includes(record.reviewStatus));
    assert.match(record.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(record.notes);
    assert.ok(record.sources.length > 0);
    assert.ok(record.sources.every((source) => /^https:\/\//.test(source.url)));
  }
});

test('keeps every approved blend mapping complete and source-tracked', () => {
  const slugs = new Set(COMPOUNDS.map((compound) => compound.slug));
  assert.deepEqual(
    new Set(PEARL_BLEND_MAPPINGS.map((mapping) => mapping.id)),
    new Set([
      'wolverine',
      'glow',
      'klow',
      'wolverine-recovery-pen',
      'cjc-ipamorelin',
      'retatrutide-cagrilintide-pen',
      'calm-clarity',
      'gut-healing',
      'longevity-master',
      'mcas-protocol',
      'mito',
    ]),
  );
  for (const mapping of PEARL_BLEND_MAPPINGS) {
    assert.equal(mapping.reviewStatus, 'approved');
    assert.ok(mapping.components.length >= 2);
    assert.ok(mapping.components.every((slug) => slugs.has(slug)), `${mapping.canonicalName}: component`);
    assert.ok(mapping.sources.length > 0);
    assert.ok(mapping.sources.every((source) => /^https:\/\//.test(source.url)));
    assert.ok(mapping.notes);
    assert.ok(Array.isArray(mapping.conflicts));
  }
});

test('normalises punctuation, spacing, hyphenation and capitalisation', () => {
  for (const question of ['What is bpc157?', 'What is B P C 157?', 'What is GhK cU?', 'What is MOTS C?']) {
    const answer = answerQuestion(question);
    assert.notEqual(answer.kind, 'clarify', question);
    assert.equal(answer.interpretation.status, 'resolved', question);
  }
});

test('recognises missing, extra, repeated and transposed letters', () => {
  const cases = [
    ['retatrutde', 'Retatrutide'],
    ['retatrutidee', 'Retatrutide'],
    ['retatruttide', 'Retatrutide'],
    ['retatrutied', 'Retatrutide'],
  ];
  for (const [term, expected] of cases) {
    const answer = answerQuestion(`What is ${term}?`);
    assert.equal(answer.kind, 'overview', term);
    assert.deepEqual(answer.compounds, [expected], term);
    assert.match(answer.interpretation.disclosure, new RegExp(term, 'i'));
  }
});

test('recognises an approved phonetic form without rewriting the full question', () => {
  const answer = answerQuestion('What does the research say about semaglootide?');
  assert.equal(answer.kind, 'evidence');
  assert.deepEqual(answer.compounds, ['Semaglutide']);
  assert.equal(answer.interpretation.method, 'phonetic');
});

test('recognises approved shorthand and explains the interpretation', () => {
  const reta = answerQuestion('What research is listed for RETA?');
  assert.equal(reta.kind, 'evidence');
  assert.deepEqual(reta.compounds, ['Retatrutide']);
  assert.match(reta.interpretation.disclosure, /RETA.*Retatrutide/);
  const bpc = answerQuestion('What is BPC?');
  assert.deepEqual(bpc.compounds, ['BPC-157']);
});

test('does not correct a correctly written canonical compound name', () => {
  const answer = answerQuestion('What is Retatrutide?');
  assert.equal(answer.kind, 'overview');
  assert.deepEqual(answer.compounds, ['Retatrutide']);
  assert.equal(answer.interpretation.method, 'canonical');
  assert.equal(answer.interpretation.disclosure, '');
});

test('asks before using an informal or ambiguous abbreviation', () => {
  const glp3 = answerQuestion('What is GLP-3?');
  assert.equal(glp3.kind, 'clarify');
  assert.deepEqual(glp3.compounds, ['Retatrutide']);
  const tb = answerQuestion('What is TB?');
  assert.equal(tb.kind, 'clarify');
  assert.ok(tb.compounds.includes('TB-500'));
  assert.ok(tb.compounds.includes('Thymosin Beta-4 (TB4)'));
});

test('uses a conservative medium-confidence spelling suggestion', () => {
  const answer = answerQuestion('What is tesamoreliinxx?');
  assert.equal(answer.kind, 'clarify');
  assert.equal(answer.interpretation.confidence, 'medium');
  assert.deepEqual(answer.compounds, ['Tesamorelin']);
});

test('does not match short aliases inside ordinary words', () => {
  for (const question of ['What does tuberculosis research show?', 'Tell me about data quality', 'What is retinal tissue?']) {
    const answer = answerQuestion(question);
    assert.equal(answer.kind, 'clarify', question);
    assert.equal(answer.compounds.length, 0, question);
  }
});

test('recognises Wolverine names, spelling mistakes and all components', () => {
  for (const name of ['Wolverine Stack', 'Wolverine Blend', 'Wolverene Stack']) {
    const answer = answerQuestion(`What research is listed for the ${name}?`);
    assert.equal(answer.kind, 'evidence', name);
    assert.ok(answer.compounds.includes('Wolverine Stack'));
    assert.ok(answer.compounds.includes('BPC-157'));
    assert.ok(answer.compounds.includes('TB-500'));
    assert.ok(answer.sources.some((source) => source.url.includes('wolverine')));
  }
});

test('recognises Glow while keeping its variable formulation visible', () => {
  const answer = answerQuestion('Why do Glow Stack definitions differ?');
  assert.equal(answer.kind, 'evidence');
  assert.ok(answer.compounds.includes('GHK-Cu'));
  assert.ok(answer.compounds.includes('BPC-157'));
  assert.ok(answer.compounds.includes('TB-500'));
  assert.ok(answer.bullets.some((bullet) => /ratios.*not standardised/i.test(bullet)));
});

test('returns source-labelled Glow numbers without calling them a clinical regimen', () => {
  const answer = answerQuestion('What dosage numbers are listed for Glow Blend?');
  assert.equal(answer.kind, 'dose');
  assert.ok(answer.dose.some((item) => /900.*1,800/i.test(item.value)));
  assert.equal(answer.summary, 'For research use only.');
  assert.ok(answer.sources.some((source) => source.url.includes('glow-stack')));
});

test('recognises every approved stack name, alias and reviewed misspelling', () => {
  for (const mapping of PEARL_BLEND_MAPPINGS) {
    const expectedComponents = mapping.components.map((slug) =>
      COMPOUNDS.find((compound) => compound.slug === slug).name);
    for (const term of [mapping.canonicalName, ...mapping.aliases, ...mapping.misspellings]) {
      const answer = answerQuestion(`What research is listed for ${term}?`);
      assert.notEqual(answer.kind, 'clarify', `${mapping.canonicalName}: ${term}`);
      assert.ok(answer.compounds.includes(mapping.canonicalName), `${mapping.canonicalName}: ${term}`);
      for (const name of expectedComponents) {
        assert.ok(answer.compounds.includes(name), `${mapping.canonicalName}: ${term}: ${name}`);
      }
    }
  }
});

test('recognises every approved compound alias, misspelling and phonetic form', () => {
  for (const record of CURATED_TERMINOLOGY.filter((item) => item.reviewStatus === 'approved' && item.autoResolve)) {
    for (const term of [...record.aliases, ...record.misspellings, ...(record.phoneticForms || [])]) {
      const answer = answerQuestion(`What research is listed for ${term}?`);
      assert.notEqual(answer.kind, 'clarify', `${record.displayName}: ${term}`);
      assert.ok(answer.compounds.includes(record.displayName), `${record.displayName}: ${term}`);
    }
  }
});

test('covers every audited Windsor Glow product without inventing unknown formulas', () => {
  assert.equal(Object.keys(PRODUCT_COMPOSITIONS).length, 78);
  assert.equal(PRODUCT_COMPOSITIONS['peptide-complex'].unknown, true);
  assert.equal(PRODUCT_COMPOSITIONS['pag-nrg'].unknown, true);
  assert.equal(PRODUCT_COMPOSITIONS['super-human-blend'].isPeptide, false);
  assert.equal(PRODUCT_COMPOSITIONS.hhb.isPeptide, false);
  for (const [slug, name] of Object.entries(PRODUCT_CATALOGUE_NAMES)) {
    assert.equal(resolveProductComposition(`What is in ${name}?`).slug, slug, name);
  }
});

test('recognises every reviewed Windsor Glow product alias without crossing products', () => {
  for (const [slug, aliases] of Object.entries(PRODUCT_ALIASES)) {
    for (const term of aliases) {
      const match = resolveProductComposition(`What is in ${term}?`);
      assert.equal(match?.slug, slug, `${term} should resolve to ${slug}`);
    }
  }
  assert.equal(resolveProductComposition('What is in DSIP 5mg?').slug, 'dsip-5');
  assert.equal(resolveProductComposition('What is in DSIP 10mg?').slug, 'dsip-5mg');
});

test('uses the correct public address for the live DSIP 10 product', async () => {
  const answer = answerQuestion('What is in the DSIP 10mg product?');
  assert.equal(answer.title, 'DSIP 10: what the product contains');
  assert.ok(answer.sources.some((source) => source.url.endsWith('/shop/dsip-10mg')));

  const aliases = await readFile(new URL('../src/lib/slugAliases.ts', import.meta.url), 'utf8');
  const nextConfig = await readFile(new URL('../next.config.js', import.meta.url), 'utf8');
  const products = await readFile(new URL('../src/data/products.ts', import.meta.url), 'utf8');
  assert.match(aliases, /'dsip-5mg': 'dsip-10mg'/);
  assert.match(nextConfig, /source: '\/shop\/dsip-5mg'.*destination: '\/shop\/dsip-10mg'/);
  assert.match(products, /name: 'DSIP 10',[\s\S]{0,500}slug: 'dsip-5mg',[\s\S]{0,500}dosage: '10mg'/);
});

test('answers what is in KLOW and keeps product strength separate from research dose', () => {
  const composition = answerQuestion('What is in Klow?');
  assert.equal(composition.kind, 'overview');
  assert.deepEqual(
    composition.dose.map((item) => [item.label, item.value]),
    [['GHK-Cu', '50 mg'], ['BPC-157', '10 mg'], ['TB-500', '10 mg'], ['KPV', '10 mg']],
  );
  assert.match(composition.summary, /whole product, not a recommended dose/i);
  assert.ok(composition.compounds.includes('KLOW Stack'));

  const research = answerQuestion('What dosage is listed for KLO Stack?');
  assert.equal(research.kind, 'dose');
  assert.ok(research.dose.some((item) => /GHK-Cu: source-listed numerical record/i.test(item.label)));
  assert.deepEqual(research.bullets, []);
});

test('distinguishes the three-component Wolverine Recovery Pen from Wolverine Stack', () => {
  const answer = answerQuestion('What is in Wolverene Recovery Pen?');
  assert.equal(answer.kind, 'overview');
  assert.ok(answer.compounds.includes('KPV'));
  assert.deepEqual(answer.dose.map((item) => item.label), ['BPC-157', 'TB-500', 'KPV']);

  const base = answerQuestion('What is in Wolverine Stack?');
  assert.ok(!base.compounds.includes('KPV'));
});

test('recognises the CJC Ipamorelin and Retatrutide Cagri product names', () => {
  const cjc = answerQuestion('What dosage research is listed for CJC Ipamorlin Blend?');
  assert.equal(cjc.kind, 'dose');
  assert.ok(cjc.compounds.includes('CJC-1295 (no DAC)'));
  assert.ok(cjc.compounds.includes('Ipamorelin'));
  assert.ok(cjc.dose.length >= 2);

  const reta = answerQuestion('What is in Retatrutde Cagri Pen?');
  assert.deepEqual(reta.dose.map((item) => [item.label, item.value]), [['Retatrutide', '40 mg'], ['Cagrilintide', '4 mg']]);
  assert.ok(reta.compounds.includes('Retatrutide and Cagrilintide Pen'));
});

test('explains non-peptide mixtures and keeps proprietary ratios unpublished', () => {
  const hhb = answerQuestion('What is in HHB?');
  assert.match(hhb.summary, /contains no peptides/i);
  assert.ok(hhb.dose.every((item) => /per ml$/i.test(item.value)));

  const up389 = answerQuestion('What is in UP 389?');
  assert.match(up389.summary, /contains no peptides/i);
  assert.ok(up389.dose.every((item) => item.value === 'Amount not published'));
  assert.deepEqual(up389.compounds, ['UP-389']);
});

test('fails closed for both Windsor Glow products with unknown composition', () => {
  for (const name of ['Peptide Complex', 'Peptid Complex', 'PAG~NRG', 'PAG NRG']) {
    const answer = answerQuestion(`What is in ${name}?`);
    assert.match(answer.title, /composition not recorded/i, name);
    assert.match(answer.summary, /will not guess/i, name);
    assert.equal(answer.dose, undefined, name);
  }
  assert.doesNotMatch(answerQuestion('What is in Peptide Complex?').title, /Humanin/i);
});

test('shows the weaker Glow Pen provenance instead of presenting it as confirmed', () => {
  const answer = answerQuestion('What is inside the plain Glow Pen?');
  assert.ok(answer.dose.some((item) => item.label === 'GHK-Cu' && item.value === '50 mg'));
  assert.ok(answer.bullets.some((item) => /worked out/i.test(item)));
  assert.ok(answer.bullets.some((item) => /unconfirmed/i.test(item)));
});

test('brings each new answer to the top of the page reading area', async () => {
  const desk = await readFile(new URL('../src/components/account/ResearchDesk.tsx', import.meta.url), 'utf8');
  assert.match(desk, /newestAnswerRef/);
  assert.match(desk, /shownAnswerRef/);
  assert.match(desk, /scrollIntoView\(\{ behavior, block: 'start' \}\)/);
  assert.match(desk, /--site-header-stack-height/);
  assert.match(desk, /inputRef\.current\?\.blur\(\)/);
  assert.match(desk, /messages\.length < 2/);
});

test('does not invent an unknown blend definition', () => {
  const answer = answerQuestion('What is the Phoenix Recovery Stack?');
  assert.equal(answer.kind, 'clarify');
  assert.equal(answer.compounds.length, 0);
  assert.match(answer.summary, /does not invent combination definitions/i);
});

test('preserves a blend as recent context for a safe follow-up', () => {
  const answer = answerQuestion('What are its risks?', ['Wolverine Stack', 'BPC-157', 'TB-500']);
  assert.equal(answer.kind, 'safety');
  assert.ok(answer.compounds.includes('Wolverine Stack'));
  assert.equal(answer.interpretation.method, 'context');
});

test('does not let old context override a newly named compound', () => {
  const answer = answerQuestion('What research is listed for Semaglutide?', ['BPC-157']);
  assert.equal(answer.kind, 'evidence');
  assert.deepEqual(answer.compounds, ['Semaglutide']);
});

test('uses approved administrator aliases and ignores unapproved ones', () => {
  const base = {
    id: 'admin-test', recordType: 'compound', canonicalSlug: 'retatrutide', displayName: 'Retatrutide',
    aliases: ['Project Triple'], abbreviations: [], misspellings: [], phoneticForms: [], relatedSlugs: [], ambiguousWith: [],
    sources: [{ label: 'Test source', url: 'https://clinicaltrials.gov/', role: 'Test' }], confidence: 'high', autoResolve: true,
    enabled: true, lastVerified: '2026-08-06', notes: 'Test-only administrator record.',
  };
  const approved = answerQuestion('What is Project Triple?', [], { overrides: [{ ...base, reviewStatus: 'approved' }] });
  assert.deepEqual(approved.compounds, ['Retatrutide']);
  const review = answerQuestion('What is Project Triple?', [], { overrides: [{ ...base, reviewStatus: 'review' }] });
  assert.equal(review.kind, 'clarify');
  assert.ok(!review.interpretation?.disclosure?.includes('Project Triple'));
});

test('shows approved administrator categories as compound choices', () => {
  const category = {
    id: 'admin-category-test', recordType: 'ambiguous', canonicalSlug: 'pt-141', displayName: 'Intimacy research',
    aliases: ['Intimacy research'], abbreviations: [], misspellings: [], phoneticForms: [], relatedSlugs: ['kisspeptin-10', 'oxytocin'],
    ambiguousWith: ['kisspeptin-10', 'oxytocin'], sources: [], confidence: 'medium', reviewStatus: 'approved',
    autoResolve: false, enabled: true, lastVerified: '2026-08-17', notes: 'Test-only administrator category.',
  };
  const answer = answerQuestion('What is listed for intimacy research?', [], { overrides: [category] });
  assert.equal(answer.kind, 'clarify');
  assert.deepEqual(answer.suggestions.map((item) => item.slug), ['pt-141', 'kisspeptin-10', 'oxytocin']);
});

test('terminology recognition never bypasses the remaining safety boundaries', () => {
  // A nickname still resolves, and a dosage question on it is now answered.
  const reta = answerQuestion('What dose of RETA should I take?');
  assert.equal(reta.kind, 'dose');
  assert.deepEqual(reta.compounds, ['Retatrutide']);
  // Administration and combination requests are unchanged.
  assert.equal(answerQuestion('How do I inject the Wolverine Stack?').kind, 'boundary');
  assert.equal(answerQuestion('Can I combine BPC and TB-500?').kind, 'boundary');
});

test('understands everyday descriptions for common research categories', () => {
  const cases = [
    ['anything related to putting on size', /muscle growth/i],
    ['research for getting lean', /weight loss/i],
    ['what is listed for skin repair', /healing and recovery/i],
    ['research linked to mental sharpness', /focus, memory and cognition/i],
    ['anything studied for damaged ligaments', /healing and recovery/i],
  ];
  for (const [question, title] of cases) {
    const answer = answerQuestion(question);
    assert.equal(answer.kind, 'topic', question);
    assert.match(answer.title, title, question);
  }
});

test('corrects reviewed question-word spelling mistakes', () => {
  const topic = answerQuestion('weigth los peptids');
  assert.equal(topic.kind, 'topic');
  assert.match(topic.title, /weight loss/i);

  const evidence = answerQuestion('what resarch and evidnce is there for semaglutide');
  assert.equal(evidence.kind, 'evidence');
  assert.deepEqual(evidence.compounds, ['Semaglutide']);

  const dose = answerQuestion('what dosge numbers are listed for BPC-157');
  assert.equal(dose.kind, 'dose');

  const personal = answerQuestion('shoud i use semaglutide');
  assert.equal(personal.kind, 'boundary');
});

test('recognises natural evidence, risk and half-life wording', () => {
  const proof = answerQuestion('proof for reta');
  assert.equal(proof.kind, 'evidence');
  assert.deepEqual(proof.compounds, ['Retatrutide']);

  const data = answerQuestion('data on tirzepatide');
  assert.equal(data.kind, 'evidence');

  const risks = answerQuestion('side affects of semaglutide');
  assert.equal(risks.kind, 'safety');

  const halfLife = answerQuestion('how long in the system BPC-157');
  assert.match(halfLife.title, /half-life/i);
});

test('uses recent compound context for very short follow-ups', () => {
  assert.equal(answerQuestion('Dose?', ['BPC-157']).kind, 'dose');
  assert.equal(answerQuestion('and dosage?', ['BPC-157']).kind, 'dose');
  assert.equal(answerQuestion('Downsides?', ['BPC-157']).kind, 'safety');
  assert.equal(answerQuestion('Proof?', ['BPC-157']).kind, 'evidence');
});

test('asks which product a generic Recovery Pen question means', () => {
  const answer = answerQuestion('what does the recovery pen have in it');
  assert.equal(answer.kind, 'clarify');
  assert.equal(answer.suggestions.length, 2);
  assert.ok(answer.suggestions.some((item) => /Wolverine Recovery Pen/i.test(item.label)));
  assert.ok(answer.suggestions.some((item) => /Klow Recovery Pen/i.test(item.label)));
});

test('turns an unknown question into useful reviewed choices', () => {
  const answer = answerQuestion('zibble frax information');
  assert.equal(answer.kind, 'clarify');
  assert.equal(answer.needsLanguageReview, true);
  assert.ok(answer.suggestions.length >= 1 && answer.suggestions.length <= 3);
  assert.match(answer.summary, /research categories|closest approved/i);
});

test('adds a clear first point and relevant next questions to non-dose answers', () => {
  for (const question of [
    'What is BPC-157?',
    'What risks are listed for BPC-157?',
    'Which entries relate to healing?',
  ]) {
    const answer = answerQuestion(question);
    assert.ok(answer.keyPoint, question);
    assert.ok(answer.followUps.length >= 1 && answer.followUps.length <= 3, question);
    assert.ok(answer.followUps.every((item) => /research|source-listed|risks|system|compare/i.test(item)), question);
  }
});

test('renders three-way choices, follow-ups and accessible mobile controls', async () => {
  const desk = await readFile(new URL('../src/components/account/ResearchDesk.tsx', import.meta.url), 'utf8');
  assert.match(desk, /suggestions\.slice\(0, 3\)/);
  assert.match(desk, /Continue exploring/);
  assert.match(desk, /aria-relevant="additions"/);
  assert.match(desk, /aria-labelledby=/);
  assert.match(desk, /min-h-11/);
  assert.match(desk, /focus-visible:outline/);
});

test('shows failed customer wording as a reviewed learning list for staff', async () => {
  const admin = [
    await readFile(new URL('../src/app/admin/research-questions/page.tsx', import.meta.url), 'utf8'),
    await readFile(new URL('../src/app/admin/research-questions/research-questions-client.tsx', import.meta.url), 'utf8'),
  ].join('\n');
  assert.match(admin, /Phrases PEARL could learn next/);
  assert.match(admin, /needsLanguageReview/);
  assert.match(admin, /Nothing is added automatically/);
  assert.match(admin, /Could not understand/);
});

test('builds a complete intelligence record for every unique source and research link', () => {
  const manifest = buildResearchLinkManifest(RESEARCH_PROFILES);
  assert.ok(manifest.length >= 1500);
  assert.ok(manifest.every((record) => record.compounds.length >= 1));
  assert.ok(manifest.every((record) => record.studyType && record.population && record.evidenceStrength));
  assert.ok(manifest.every((record) => record.limitations.length >= 1));
  assert.ok(manifest.every((record) => /^https:\/\//.test(record.url)));
});

test('removes the three unrelated PubMed records found in the citation audit', () => {
  const rejected = new Set([
    'https://pubmed.ncbi.nlm.nih.gov/11157505/',
    'https://pubmed.ncbi.nlm.nih.gov/16640009/',
    'https://pubmed.ncbi.nlm.nih.gov/18677858/',
  ]);
  const manifest = buildResearchLinkManifest(RESEARCH_PROFILES);
  assert.ok(manifest.every((record) => !rejected.has(record.url)));
  assert.ok(RESEARCH_CONFLICTS.some((conflict) => conflict.id === 'mental-health-pubmed-identity-mismatches'));
});

test('recognises OCD, obsessive-thought and compulsive-behaviour wording cautiously', () => {
  for (const question of [
    'Anything studied for OCD?',
    'What research is linked to obsessive thoughts?',
    'What about intrusive thoughts?',
    'Any evidence about compulsive behaviour?',
    'Anything for compolsive behavior?',
    'What is linked to unwanted thoughts?',
  ]) {
    const answer = answerQuestion(question);
    assert.equal(answer.kind, 'topic', question);
    /* Changed 18 Aug 2026, same reason as the ADHD test above: this topic also
       carried a one-entry whitelist. NAC must still lead and must still be the
       only entry the sources study directly, but the narrowness is now SHOWN -
       a heading that says one entry is direct and the rest are not - rather
       than achieved by hiding every other record from the member. */
    assert.equal(answer.compounds[0], 'NAC', question);
    const direct = answer.sections.find((section) => /Most directly studied/i.test(section.title));
    assert.ok(direct, question);
    assert.match(direct.title, /\(1\)$/, question);
    assert.match(direct.items.join(' '), /NAC/, question);
    assert.match(direct.items.join(' '), /Direct human research/i, question);
    assert.match(answer.sections.at(-1).items.join(' '), /limitation|not enough|not establish|risk|toxicity/i, question);
  }
});

test('keeps neurotransmitter and neuroplasticity answers separate from treatment claims', () => {
  for (const question of [
    'Anything involving dopamine?',
    'What research involves serotonin?',
    'Which compounds are linked to GABA?',
    'Show research about BDNF and neuroplasticity',
  ]) {
    const answer = answerQuestion(question);
    assert.equal(answer.kind, 'topic', question);
    assert.match(answer.sections[0].items.join(' '), /research|mechanis|symptom/i, question);
    assert.match(`${answer.summary} ${answer.sections.at(-1).items.join(' ')}`, /not proof|not establish|indirect|does not by itself/i, question);
  }
});

test('uses conversation context for human-study and limitation follow-ups', () => {
  const topic = answerQuestion('What research is linked to anxiety?');
  const human = answerQuestion('Show me the human studies', topic.compounds, {
    previousAnswer: topic,
    askedQuestions: ['What research is linked to anxiety?', 'Show me the human studies'],
  });
  assert.equal(human.kind, 'evidence');
  assert.match(human.title, /Human research/i);
  assert.ok(!human.compounds.includes('Humanin'));
  assert.match(human.sections[1].items.join(' '), /population: Human/i);

  const limits = answerQuestion('What are the limitations?', human.compounds, {
    previousAnswer: human,
    askedQuestions: ['What are the limitations?'],
  });
  assert.equal(limits.kind, 'evidence');
  assert.match(limits.title, /limitations/i);
});

test('does not repeat a clicked follow-up in the next answer', () => {
  const first = answerQuestion('Anything studied for OCD?');
  const clicked = first.followUps[0];
  const second = answerQuestion(clicked, first.compounds, {
    previousAnswer: first,
    askedQuestions: ['Anything studied for OCD?', clicked],
  });
  assert.ok(!second.followUps.includes(clicked));
});

test('answers a 200-question concept and wording bank without falling into random name suggestions', () => {
  const concepts = [
    'build muscle', 'tendon injury', 'insomnia', 'lose weight', 'low energy', 'mental health', 'ADHD',
    'executive dysfunction', 'brain fog', 'OCD', 'anxiety', 'low mood', 'immune function', 'cancer research',
    'longevity', 'blood pressure', 'blood sugar', 'fertility', 'low libido', 'hormonal imbalance', 'IBS',
    'nerve pain', 'cartilage', 'collagen', 'hair loss', 'bone density', 'migraine', 'fatty liver', 'kidney health',
    'lung health', 'Alzheimer disease', 'growth hormone', 'pigmentation', 'fibrosis', 'brain injury',
    'athletic performance', 'dopamine', 'serotonin', 'GABA', 'BDNF neuroplasticity',
  ];
  const templates = [
    (concept) => `Which source entries relate to ${concept}?`,
    (concept) => `Show research about ${concept}`,
    (concept) => `What is studied for ${concept}?`,
    (concept) => `Any evidence involving ${concept}?`,
    (concept) => `Which compounds are linked to ${concept}?`,
  ];
  let checked = 0;
  for (const concept of concepts) {
    for (const template of templates) {
      const question = template(concept);
      const answer = answerQuestion(question);
      assert.notEqual(answer.kind, 'clarify', question);
      assert.ok(answer.compounds.length >= 1, question);
      assert.ok(answer.sections?.length >= 3, question);
      checked += 1;
    }
  }
  assert.equal(checked, 200);
});

/* Kieran, 18 Aug 2026, in his own words: PEARL "needs to understand that this
   is how she should operate by searching only resources that are available to
   her ... and to continue looking for the answer for all of them rather than
   stopping at one when she receives an answer."

   Before this change a topic question returned as few as ONE entry out of 265,
   because two topics carried a hard one-entry whitelist and the per-topic cap
   was six. These tests exist so that can never quietly come back. */
test('a topic question keeps looking instead of stopping at the first answer', () => {
  for (const question of [
    'Which peptides are researched for ADHD?',
    'Anything studied for OCD?',
    'Which peptides are researched for anxiety and stress?',
    'peptides for focus and memory',
    'Which peptides are researched for muscle growth?',
  ]) {
    const answer = answerQuestion(question);
    assert.equal(answer.kind, 'topic', question);
    assert.ok(answer.compounds.length > 6, `${question} :: only ${answer.compounds.length} entries`);
    assert.equal(answer.compounds.length, new Set(answer.compounds).size, question);
    assert.equal(answer.bullets.length, answer.compounds.length, question);
  }
});

test('the extra breadth arrives graded, never as a flat list', () => {
  const answer = answerQuestion('Which peptides are researched for ADHD?');
  const tiers = answer.sections.filter((section) =>
    /Most directly studied|Related or indirect research|Broad connection only/i.test(section.title));
  assert.ok(tiers.length >= 2);
  // Every tier says what it means before it lists anything.
  for (const tier of tiers) {
    assert.match(tier.title, /\(\d+\)$/);
    assert.ok(tier.items.length >= 2, tier.title);
    assert.match(tier.items[0], /direct|mechanism|related wording|background/i, tier.title);
  }
  // The strongest tier comes first, and the count in each heading is honest.
  const counted = tiers.reduce((total, tier) => total + Number(tier.title.match(/\((\d+)\)$/)[1]), 0);
  assert.equal(counted, answer.compounds.length);
  assert.match(tiers[0].title, /Most directly studied/i);
  // And every single entry is labelled with the strength of its own connection.
  for (const bullet of answer.bullets) {
    assert.match(bullet, /Direct human research|Direct preclinical research|Related symptom research|Indirect mechanistic research|Broad research connection/i, bullet);
  }
});

test('every entry on a topic answer carries its source-listed number', () => {
  /* Reversed 19 Aug 2026 on Kieran's instruction. This previously asserted the
     opposite: that figures stayed with the directly-studied entries only. He
     asked for all dosage information to be shown, so every entry now carries
     its figure, each still labelled as a record-wide number that may come from
     a different indication. */
  for (const question of ['Which peptides are researched for ADHD?', 'Anything studied for OCD?']) {
    const answer = answerQuestion(question);
    const numbers = answer.sections.find((section) => /Research details and numbers/i.test(section.title));
    assert.equal(numbers.items.length, answer.compounds.length, question);
    for (const item of numbers.items) {
      assert.match(item, /must not be treated as/i, `${question} :: ${item.slice(0, 70)}`);
    }
    for (const bullet of answer.bullets) {
      assert.match(bullet, /Research-number snapshot:/i, `${question} :: ${bullet.slice(0, 70)}`);
    }
  }
});

test('a person saying they have been harmed always reaches the emergency screen', () => {
  for (const question of [
    'I overdosed on semaglutide',
    'I took too much semaglutide',
    'I think I took too much',
    'I have taken too much by mistake',
    'I am having an allergic reaction',
    'I passed out after my injection',
    'I feel awful after taking it',
    'chest pain after injection',
  ]) {
    const answer = answerQuestion(question);
    assert.equal(answer.kind, 'emergency', question);
    assert.match(answer.summary, /999|A&E|emergency/i, question);
  }
});

test('widening the emergency gate did not swallow educational questions', () => {
  // The second tier requires the person to be talking about THEMSELVES, so a
  // question about what the research reports is untouched.
  for (const question of [
    'What allergic reactions have been reported for BPC-157?',
    'What are the side effects of semaglutide?',
    'Which peptides are researched for ADHD?',
    'What is retatrutide?',
  ]) {
    assert.notEqual(answerQuestion(question).kind, 'emergency', question);
  }
});

/* Kieran, 19 Aug 2026, task 804de696: "Ensure there is no competitor seller
   info on any of the results or info Pearl gets when asks a question due to
   the sources Pearl is using."

   Windsor Glow sells these compounds. A research library that quietly linked a
   member to a rival shop, or repeated a rival's sales copy, would be worse
   than useless. These tests make that a standing guarantee rather than
   something checked once. They run over the WHOLE library, so a future source
   cannot slip one in. */

const APPROVED_LINK_HOSTS = new Set([
  // research databases and regulators
  'pubmed.ncbi.nlm.nih.gov', 'pmc.ncbi.nlm.nih.gov', 'clinicaltrials.gov',
  'www.clinicaltrials.gov', 'doi.org', 'dailymed.nlm.nih.gov', 'www.fda.gov',
  'www.ema.europa.eu', 'www.wada-ama.org', 'www.nejm.org', 'www.nature.com',
  'link.springer.com', 'www.jofem.org', 'pharmateca.ru',
  // the reviewed education sources themselves
  'jmitsuominor-ux.github.io', 'peptide-handbook.com', 'www.pepcodex.com',
  'peptidehub.bio', 'halflife-labs.com', 'peptpedia.org',
  'www.peptidedosage.org', 'peptidedosages.com', 'peptideauthority.co.uk',
  'www.peptidedeck.com', 'peptidejournal.org', 'www.peptidejournal.org',
  'wikipep.org', 'pepuniversity.com', 'chatgpt.com',
]);

function everyLinkInTheLibrary() {
  const links = [];
  for (const profile of RESEARCH_PROFILES) {
    for (const claim of profile.claims || []) {
      if (claim.url) links.push({ url: claim.url, where: `${profile.name} (${claim.sourceId}) source page` });
      for (const reference of claim.references || []) links.push({ url: reference.url, where: `${profile.name} (${claim.sourceId}) citation` });
      for (const protocol of claim.protocols || []) if (protocol.sourceUrl) links.push({ url: protocol.sourceUrl, where: `${profile.name} (${claim.sourceId}) protocol` });
    }
  }
  return links;
}

test('every imported source and citation link stays traceable over HTTPS', () => {
  const strays = [];
  for (const link of everyLinkInTheLibrary()) {
    try {
      const parsed = new URL(link.url);
      if (parsed.protocol !== 'https:') strays.push(`${link.where}: ${parsed.protocol}`);
    } catch { strays.push(`${link.where}: unparseable ${link.url}`); }
  }
  assert.deepEqual(strays, [], `PEARL contains an untraceable link:\n  ${strays.join('\n  ')}`);
});

test('no competing peptide seller is named anywhere in the library', () => {
  // Sellers Windsor Glow competes with, plus the shop the affiliate link on
  // PeptideDosage.org points at. Sample, not a whitelist: the host check above
  // is what actually stops a link, this catches a name in the prose.
  const sellers = [
    'ascension peptides', 'ascensionpeptides', 'swiss chems', 'swisschems',
    'peptide sciences', 'limitless life', 'core peptides', 'biotech peptides',
    'amino asylum', 'sports technology labs', 'pure rawz', 'purerawz',
    'behemoth labz', 'umbrella labs', 'geopeptides', 'paradigm peptides',
    'chemyo', 'proven peptides', 'direct peptides',
  ];
  const library = JSON.stringify(RESEARCH_PROFILES).toLowerCase();
  const found = sellers.filter((seller) => library.includes(seller));
  assert.deepEqual(found, [], `a competing seller is named in the research library: ${found.join(', ')}`);
});

test('no imported text reads as sales copy', () => {
  const SALES = /\b(add to cart|checkout now|order now|in stock|free shipping|best price|cheapest|use code|promo code|discount code|\d{1,2}% off|buy now|shop now|our range|visit our store)\b/i;
  const hits = [];
  for (const profile of RESEARCH_PROFILES) {
    for (const claim of profile.claims || []) {
      // 'preparation' added 19 Aug 2026 with the full PeptideDosages import:
      // a new field is a new place for sales copy to hide.
      for (const field of ['summary', 'evidence', 'mechanism', 'halfLife', 'limitations', 'safety', 'topics', 'preparation']) {
        const values = Array.isArray(claim[field]) ? claim[field] : [claim[field]];
        for (const value of values) {
          if (typeof value === 'string' && SALES.test(value)) hits.push(`${profile.name} (${claim.sourceId}.${field}): ${value.match(SALES)[0]}`);
        }
      }
    }
  }
  assert.deepEqual(hits, [], `sales copy reached the research library:\n  ${hits.join('\n  ')}`);
});
