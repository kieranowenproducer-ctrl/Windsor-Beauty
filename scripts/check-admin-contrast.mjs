// Prove the admin panel's gold does not drop back below WCAG AA.
//
//   node scripts/check-admin-contrast.mjs
//
// Written 2026-07-30 with the fix, because the fix on its own is a snapshot and the next
// person to add a button will copy the nearest existing one. The failure it guards against
// was real and measured: white on gold-500 is 2.97:1 and active navigation was gold-600 on
// gold-50 at 3.81:1, both under the 4.5:1 AA needs for normal text. Both are now gold-700,
// which is 5.09:1 and 4.80:1.
//
// SCOPE IS THE ADMIN ONLY, deliberately. gold-500 is the brand's button colour on the public
// shop and changing that is a brand decision, not an accessibility one. This script does not
// look outside src/app/admin and src/components/admin, and it should not be widened without
// somebody deciding that first.
//
// It is a lint over class names, not a browser check. It cannot see a colour applied by a
// stylesheet or computed at runtime, so it proves the common case and no more.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOTS = ['src/app/admin', 'src/components/admin'];

const GOLD = {
  300: '#CFA194', 400: '#B98478', 500: '#A9695D',
  600: '#95574C', 650: '#8A4F45', 700: '#4B2A3A', 800: '#63394D',
};
const WHITE = '#F9F1E4';
const GOLD_50 = '#F6E4DC';

const channel = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const luminance = (h) => {
  const c = channel(h).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// The two patterns that failed, expressed as the rule rather than the symptom: a gold light
// enough to fail behind white text, and a gold light enough to fail as text on a light card.
// An alpha form such as bg-gold-600/30 is skipped by both rules, and that is a limitation
// being stated rather than a hole being left. A translucent background composites over
// whatever is behind it, which the class name does not say: the one real instance is the
// active state of the dark rich text toolbar, where the result is a dark tile with gold-300
// text on it and perfectly readable. A lint that reads class names cannot tell that apart
// from the same class over white, so it declines to guess.
const BANNED = [
  {
    pattern: /\bbg-gold-(300|400|500|600)\b(?!\/)/g,
    why: (shade) => `white text on gold-${shade} is ${ratio(WHITE, GOLD[shade]).toFixed(2)}:1, `
      + `under the 4.5:1 AA needs. Use bg-gold-700 (${ratio(WHITE, GOLD[700]).toFixed(2)}:1).`,
    // A gold background carrying no text is a decorative dot or a toggle, judged at 3:1.
    // Nothing that light passes that either, so there is no exemption worth writing.
  },
  {
    pattern: /(?<!\/)\btext-gold-(500|600)\b/g,
    why: (shade) => `gold-${shade} as text is ${ratio(GOLD[shade], WHITE).toFixed(2)}:1 on white `
      + `and ${ratio(GOLD[shade], GOLD_50).toFixed(2)}:1 on gold-50, both under 4.5:1. `
      + `Use text-gold-700 (${ratio(GOLD[700], WHITE).toFixed(2)}:1 and `
      + `${ratio(GOLD[700], GOLD_50).toFixed(2)}:1).`,
  },
];

// text-gold-300 and text-gold-400 are NOT banned. Some of them are deliberate light-on-dark,
// such as the announcement card on bg-stone-900 and the dark rich text toolbar, where a
// darker gold would be the unreadable one. They need reading case by case rather than a rule.

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts|jsx|js)$/.test(entry)) out.push(full);
  }
  return out;
}

let failures = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split(/\r?\n/);
    for (const rule of BANNED) {
      lines.forEach((line, i) => {
        for (const match of line.matchAll(rule.pattern)) {
          failures += 1;
          console.log(`  FAIL  ${file}:${i + 1}  ${match[0]}`);
          console.log(`        ${rule.why(Number(match[1]))}`);
        }
      });
    }
  }
}

// gold-650 was added on 2026-08-19 for the sidebar's section headings (OPERATIONS, CATALOGUE
// and the rest), which Kieran wanted in a gold brighter than the buttons. It is the brightest
// gold that still passes AA as text on white, and the margin is thin, so it is measured here
// rather than trusted. If someone brightens the hex in tailwind.config.js to make it pop more,
// this fails and says why. It is a white-background colour only: on gold-50 it is 4.27:1.
const GOLD_650_ON_WHITE = ratio(GOLD[650], WHITE);
if (GOLD_650_ON_WHITE < 4.5) {
  failures += 1;
  console.log(`  FAIL  tailwind.config.js  gold-650 (${GOLD[650]})`);
  console.log(`        gold-650 as text on white is ${GOLD_650_ON_WHITE.toFixed(2)}:1, under the `
    + '4.5:1 AA needs. It carries the admin sidebar section headings at 7px. Darken it back '
    + 'towards #8A4F45, or take the headings off it.');
}

console.log('');
if (failures) {
  console.log(`${failures} admin contrast problem${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('Admin contrast passes: no gold light enough to fail AA behind white text or as text.');
console.log(`  white on gold-700   ${ratio(WHITE, GOLD[700]).toFixed(2)}:1`);
console.log(`  gold-700 on gold-50 ${ratio(GOLD[700], GOLD_50).toFixed(2)}:1`);
console.log(`  gold-650 on white   ${GOLD_650_ON_WHITE.toFixed(2)}:1  (sidebar section headings)`);
