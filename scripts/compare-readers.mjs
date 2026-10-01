/**
 * The reader retirement bench (Pearl plan Stage D step 9).
 *
 * Runs a source's bespoke reader and the general reader side by side, live,
 * and reports whether they produce identical profiles. A bespoke reader is
 * only retired when this prints IDENTICAL for its source; anything less and
 * the bespoke reader stays.
 *
 *   node scripts/compare-readers.mjs              compare every configured source
 *   node scripts/compare-readers.mjs halflife-labs   compare one source
 */
import { readHalflifeLabs, readPepCodex, readPeptideHub, readPeptpedia } from "./build-research-evidence.mjs";
import { readWithSettings } from "./general-reader.mjs";
import { READER_SETTINGS } from "./source-reader-settings.mjs";

const BESPOKE = {
  "halflife-labs": readHalflifeLabs,
  pepcodex: readPepCodex,
  peptidehub: readPeptideHub,
  peptpedia: readPeptpedia,
};

function firstDifference(left, right, path = "") {
  if (left === right) return null;
  if (typeof left !== typeof right || left === null || right === null || typeof left !== "object") {
    return { path: path || "(value)", left, right };
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const found = firstDifference(left[key], right[key], path ? `${path}.${key}` : key);
    if (found) return found;
  }
  return null;
}

const only = process.argv[2];
let anyCompared = false;

for (const [sourceId, settings] of Object.entries(READER_SETTINGS)) {
  if (only && sourceId !== only) continue;
  const bespoke = BESPOKE[sourceId];
  if (!bespoke) { console.log(`${sourceId}: no bespoke reader to compare against.`); continue; }
  anyCompared = true;
  process.stdout.write(`\n${sourceId}: reading twice (bespoke, then general)...\n`);
  const [bespokeResult, generalResult] = [await bespoke(), await readWithSettings(settings)];

  const b = bespokeResult.profiles;
  const g = generalResult.profiles;
  process.stdout.write(`  bespoke: ${b.length} profiles · general: ${g.length} profiles\n`);

  const byKey = new Map(g.map((profile) => [profile.key, profile]));
  let identical = 0;
  const differences = [];
  for (const profile of b) {
    const twin = byKey.get(profile.key);
    if (!twin) { differences.push({ key: profile.key, path: "(missing from general)", left: "present", right: "absent" }); continue; }
    /* contentHash covers the fetched page; two live fetches can race a site
       edit, so compare the extracted data, not the hash. */
    const scrub = (p) => JSON.parse(JSON.stringify(p, (key, value) => (key === "contentHash" ? undefined : value)));
    const found = firstDifference(scrub(profile), scrub(twin), profile.key);
    if (found) differences.push({ key: profile.key, ...found });
    else identical += 1;
  }
  for (const profile of g) if (!b.some((item) => item.key === profile.key)) differences.push({ key: profile.key, path: "(extra in general)", left: "absent", right: "present" });

  if (!differences.length) {
    process.stdout.write(`  IDENTICAL: every one of the ${identical} profiles matches exactly. Safe to retire the bespoke reader.\n`);
  } else {
    process.stdout.write(`  NOT IDENTICAL: ${identical} match, ${differences.length} differ. The bespoke reader stays.\n`);
    for (const difference of differences.slice(0, 8)) {
      process.stdout.write(`    ${difference.key} @ ${difference.path}\n      bespoke: ${JSON.stringify(difference.left)?.slice(0, 160)}\n      general: ${JSON.stringify(difference.right)?.slice(0, 160)}\n`);
    }
    if (differences.length > 8) process.stdout.write(`    ...and ${differences.length - 8} more\n`);
  }
}

if (!anyCompared) console.log("No source matched. Configured:", Object.keys(READER_SETTINGS).join(", "));
