/**
 * Prove ONE source's reader before anything is imported.
 *
 *   npm run source:try -- peptideauthority
 *   npm run source:try -- peptideauthority semax retatrutide
 *
 * Reads the live site through the same general reader the build uses, with the
 * same per-source settings, and reports what PEARL WOULD learn from it. It
 * writes nothing: not the research library, not the database, not the answer
 * baseline. Nothing a member sees can move because this ran.
 *
 * It exists because adding a source used to mean rebuilding the whole research
 * library to find out whether the reader worked, and that rebuild re-reads
 * every other source from the live web too, so an unrelated edit on someone
 * else's website lands in the same diff. This separates "does the reader work"
 * from "import everything again".
 *
 * What to look at in the output:
 *   - failures should be 0, and the field coverage should be close to every
 *     profile. A field present on a handful of pages means the markers are
 *     wrong, not that the site is thin.
 *   - "protocols imported" should be 0 for any source whose dosing content we
 *     have decided not to take.
 *   - name a compound key to print its whole extracted profile and read it.
 */
import { READER_SETTINGS } from './source-reader-settings.mjs';
import { readWithSettings } from './general-reader.mjs';

const [id, ...show] = process.argv.slice(2);
if (!id || !READER_SETTINGS[id]) {
  console.error(`Usage: npm run source:try -- <sourceId> [compoundKey ...]`);
  console.error(`Known sources with settings: ${Object.keys(READER_SETTINGS).join(', ')}`);
  process.exit(1);
}

const started = Date.now();
const { audit, profiles } = await readWithSettings(READER_SETTINGS[id]);

console.log(`\n${id}: read ${profiles.length} profiles from ${audit.mappedPages} mapped pages in ${Math.round((Date.now() - started) / 1000)}s`);
console.log(`failures: ${audit.failures.length}`);
if (audit.failures.length) for (const failure of audit.failures.slice(0, 5)) console.log('  -', JSON.stringify(failure).slice(0, 200));

const present = (name) => profiles.filter((profile) => {
  const value = name === 'references' ? profile.claim.references : profile.claim[name] ?? profile[name];
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}).length;

console.log('\nfield coverage:');
for (const field of ['name', 'aliases', 'categories', 'summary', 'evidence', 'mechanism', 'halfLife', 'lastReviewed', 'limitations', 'safety', 'topics', 'references']) {
  const count = present(field);
  const flag = count === profiles.length ? '' : count === 0 ? '   <- nothing extracted' : '   <- partial';
  console.log(`  ${field.padEnd(13)} ${String(count).padStart(4)}/${profiles.length}${flag}`);
}

console.log(`\nprotocols imported: ${profiles.reduce((total, profile) => total + profile.claim.protocols.length, 0)}`);
console.log(`citations: ${profiles.reduce((total, profile) => total + profile.claim.references.length, 0)} across ${present('references')} profiles`);
console.log(`\nkeys: ${profiles.map((profile) => profile.key).sort().join(', ')}`);

for (const key of show) {
  const profile = profiles.find((item) => item.key === key);
  console.log(`\n=== ${key} ===`);
  console.log(profile ? JSON.stringify(profile, null, 1) : '(no profile with that key)');
}
