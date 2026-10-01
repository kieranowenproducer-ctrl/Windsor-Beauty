// Every switched-off lint warning has to say why.
//
// WHY THIS EXISTS. The audit on 2026-08-15 found 23 places where a lint rule
// had been switched off and, alongside them, 10 places where the same two rules
// were still firing. A developer arriving at that cannot tell which suppressions
// were considered and which were shrugged at, and cannot trust a warning to mean
// anything, because warnings are already normal here.
//
// So the rule is: zero warnings, and every suppression carries a reason after a
// `--`, which is ESLint's own syntax for exactly this. A bare
// `// eslint-disable-next-line react-hooks/exhaustive-deps` is now a failure.
//
// Run: npm run check:suppressions
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const fail = (msg) => { failures += 1; console.log(`  FAILED   ${msg}`); };

// These three are copied verbatim from the social engine and check:costs fails
// if a single byte differs, so they cannot be annotated on this side. Both of
// their suppressions already carry a full explanation in the comment block
// directly above them, which is why leaving them out costs nothing.
const SHARED_VERBATIM = ['src/lib/costs/pricing.ts', 'src/lib/costs/ledger.ts', 'src/lib/costs/period.ts'];

const files = execSync('git ls-files src', { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(f => /\.(ts|tsx|js|jsx)$/.test(f))
  .filter(f => !SHARED_VERBATIM.includes(f));

const DISABLE = /eslint-disable(-next-line|-line)?\s+([@a-z0-9/-]+)(.*)$/;
let total = 0, explained = 0;

console.log('\nEvery suppression explains itself');
for (const rel of files) {
  const text = readFileSync(join(ROOT, rel), 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = line.match(DISABLE);
    if (!m) return;
    total += 1;
    const rest = m[3] ?? '';
    // ESLint's own convention: everything after `--` is the human reason.
    const reason = rest.includes('--') ? rest.split('--')[1].replace(/\*\/\s*\}?\s*$/, '').trim() : '';
    if (reason.length >= 20) explained += 1;
    else fail(`${rel}:${i + 1} switches off ${m[2]} without saying why. Add "-- <reason>" to the same line.`);
  });
}
if (failures === 0) console.log(`  ok       all ${total} suppression(s) carry a reason`);

// The trap this codebase has hit before: a // comment sitting directly among
// JSX children is not a comment, it is text, and it renders on the page.
console.log('\nNo comment is about to render as visible text');
let jsxTrap = 0;
for (const rel of files.filter(f => f.endsWith('.tsx'))) {
  const lines = readFileSync(join(ROOT, rel), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t.startsWith('//')) return;
    // Walk back to the last meaningful line. If it opened a JSX element (ended
    // with `>` and was not a closing tag), this comment is in children position.
    for (let k = i - 1; k >= 0; k--) {
      const prev = lines[k].trim();
      if (!prev || prev.startsWith('//')) continue;
      if (/>$/.test(prev) && !/^<\//.test(prev) && !/\/>$/.test(prev) && !/=>\s*>?$/.test(prev)) {
        jsxTrap += 1;
        fail(`${rel}:${i + 1} is a // comment directly inside JSX, which renders as text on the page. Use {/* ... */}.`);
      }
      break;
    }
  });
}
if (jsxTrap === 0) console.log('  ok       no // comment sits in JSX children position');

// And the point of all this: the linter must actually be quiet.
console.log('\nThe linter is quiet, so a warning means something');
let out = '';
try {
  out = execSync('npx eslint . -f json', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) {
  out = e.stdout ?? '';
}
try {
  const results = JSON.parse(out);
  const problems = results.flatMap(r => r.messages.map(m => `${r.filePath.split(/[\\/]/).slice(-2).join('/')}:${m.line} ${m.ruleId}`));
  if (problems.length === 0) console.log('  ok       eslint reports 0 errors and 0 warnings');
  else { fail(`eslint still reports ${problems.length} problem(s):`); problems.slice(0, 12).forEach(p => console.log(`             ${p}`)); }
} catch {
  fail('could not read eslint output to confirm it is quiet');
}

console.log(failures === 0
  ? `\nAll suppression checks passed (${explained} explained suppressions).\n`
  : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
