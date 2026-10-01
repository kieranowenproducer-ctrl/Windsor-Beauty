import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const auditPath = path.join(root, 'docs/research-chat-evidence-audit.generated.json');
const libraryPath = path.join(root, 'docs/source-library.generated.json');
const jsonPath = path.join(root, 'docs/pearl-source-receipts.json');
const markdownPath = path.join(root, 'docs/pearl-source-receipts.md');

const [auditDocument, library] = await Promise.all([
  readFile(auditPath, 'utf8').then(JSON.parse),
  readFile(libraryPath, 'utf8').then(JSON.parse),
]);

const audits = new Map((auditDocument.audit?.sources || []).map((source) => [source.sourceId, source]));
const claimUrlsBySource = new Map();
for (const profile of auditDocument.profiles || []) {
  for (const claim of profile.claims || []) {
    if (!claimUrlsBySource.has(claim.sourceId)) claimUrlsBySource.set(claim.sourceId, new Set());
    claimUrlsBySource.get(claim.sourceId).add(claim.url);
  }
}

const pagesBySource = new Map();
for (const page of library.pages || []) {
  if (!page.sourceId) continue;
  if (!pagesBySource.has(page.sourceId)) pagesBySource.set(page.sourceId, []);
  pagesBySource.get(page.sourceId).push(page);
}
const failuresBySource = new Map();
for (const failure of library.failures || []) {
  let sourceId = null;
  try {
    sourceId = (auditDocument.sources || []).find((source) => new URL(source.url).hostname === new URL(failure.url).hostname)?.id || null;
  } catch { /* Keep malformed URLs out of a source receipt. */ }
  if (!sourceId) continue;
  if (!failuresBySource.has(sourceId)) failuresBySource.set(sourceId, []);
  failuresBySource.get(sourceId).push(failure);
}

const sources = (auditDocument.sources || []).map((definition) => {
  const audit = audits.get(definition.id) || {};
  const captures = pagesBySource.get(definition.id) || [];
  const failures = failuresBySource.get(definition.id) || [];
  const claimUrls = claimUrlsBySource.get(definition.id) || new Set();
  const readablePages = captures.filter((page) => page.kind === 'page');
  const capturedArticles = readablePages.map((page) => ({
    url: page.url,
    title: page.heading || page.title || page.url,
    fetchedAt: page.fetchedAt,
    contentHash: page.contentHash,
    bodyBytes: page.bodyBytes,
    sectionCount: page.sections?.length || 0,
    linkedToAnswerRecord: claimUrls.has(page.url),
  }));
  const reviewedRecords = auditDocument.sourceReviews?.[definition.id] || [];
  const virtualArticles = reviewedRecords.filter((record) => record.url && !capturedArticles.some((page) => page.url === record.url)).map((record) => ({
    url: record.url,
    title: record.title || record.key || record.url,
    fetchedAt: library.generatedAt,
    contentHash: record.contentHash || '',
    bodyBytes: null,
    sectionCount: null,
    linkedToAnswerRecord: claimUrls.has(record.url) || record.importStatus === 'full-source-import',
    recordType: 'dynamic-or-reviewed-record',
  }));
  const articles = [...capturedArticles, ...virtualArticles];
  const unreachable = definition.status === 'unavailable' || failures.length > 0 && !readablePages.length;
  const partial = failures.length > 0 || /selective|not-imported|failure/i.test(String(audit.accessStatus || definition.status || ''));
  return {
    id: definition.id,
    name: definition.name,
    suppliedUrl: definition.url,
    declaredStatus: definition.status || 'imported',
    auditStatus: audit.accessStatus || 'imported',
    result: unreachable ? 'unavailable' : partial ? 'partial-with-recorded-failures' : 'read-and-imported',
    mappedPages: audit.mappedPages ?? null,
    mappedProfileEntries: audit.mappedProfileEntries ?? null,
    analyzedProfiles: audit.analyzedProfiles ?? 0,
    importedProfiles: audit.importedProfiles ?? audit.analyzedProfiles ?? 0,
    capturedPages: articles.length,
    capturedSupportFiles: captures.length - readablePages.length,
    answerLinkedPages: articles.filter((article) => article.linkedToAnswerRecord).length,
    capturedButNotAnswerLinked: articles.filter((article) => !article.linkedToAnswerRecord).length,
    failures,
    notes: audit.notes || '',
    articles,
  };
});

const receipt = {
  generatedAt: new Date().toISOString(),
  definition: 'One receipt for every supplied source and every page captured during the rebuild. A captured page can be retained in full even when it is not a compound answer record; those are counted separately so they cannot disappear silently.',
  suppliedSources: sources.length,
  readAndImported: sources.filter((source) => source.result === 'read-and-imported').length,
  partial: sources.filter((source) => source.result === 'partial-with-recorded-failures').length,
  unavailable: sources.filter((source) => source.result === 'unavailable').length,
  capturedPages: sources.reduce((sum, source) => sum + source.capturedPages, 0),
  sources,
};

const lines = [
  '# PEARL source receipts',
  '',
  `Generated: ${receipt.generatedAt}`,
  '',
  `Supplied sources: ${receipt.suppliedSources}. Read and imported: ${receipt.readAndImported}. Partial: ${receipt.partial}. Unavailable: ${receipt.unavailable}. Captured readable pages: ${receipt.capturedPages}.`,
  '',
  '| Source | Result | Pages captured | Answer-linked | Failures |',
  '|---|---:|---:|---:|---:|',
  ...sources.map((source) => `| ${source.name} | ${source.result} | ${source.capturedPages} | ${source.answerLinkedPages} | ${source.failures.length} |`),
  '',
  '## Honest gaps',
  '',
  ...sources.filter((source) => source.result !== 'read-and-imported').map((source) => `- ${source.name}: ${source.result}. ${source.notes || source.failures[0]?.error || 'See the JSON receipt.'}`),
  '',
  'The JSON file beside this report lists every captured page, its content hash, section count and whether it is linked to an answer record.',
  '',
];

await Promise.all([
  writeFile(jsonPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8'),
  writeFile(markdownPath, `${lines.join('\n')}\n`, 'utf8'),
]);

console.log(`Wrote ${receipt.capturedPages} page receipts across ${receipt.suppliedSources} supplied sources.`);
