// Proves the hidden copy is actually ON THE WIRE (task b8fc05c1).
//
// check:email-archive proves no email bypasses the shared sender. This proves
// the shared sender really attaches info@windsorglow.com, by compiling the real
// source, standing in for the network, and reading the request body that would
// have gone to Resend. No API key and no mailbox needed.
//
// Run: npm run test:email-archive
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Compiled inside the project, not into the system temp folder: the sender
// imports 'resend', and Node only finds it from somewhere under this project's
// node_modules. Removed again at the end.
const OUT = fs.mkdtempSync(path.join(ROOT, '.email-archive-test-'));

let passed = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`  ok    ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

// Compile the two real files. No stand-in copies: a test against a retyped
// version of the code proves nothing about the code that ships.
// The compiler is called through node directly. Spawning npx.cmd on Windows
// fails with EINVAL, and this needs no shell.
/* The compile needs the project's "@/..." shorthand, because send.ts reaches the filing code
 * through it (task ce308493). tsc takes that mapping from a tsconfig rather than a flag, so one is
 * written next to the project and thrown away afterwards.
 *
 * Compiling send.ts now pulls in whatever it imports, so the output is no longer three flat files.
 * The step below therefore finds what was emitted rather than assuming the names, which is also why
 * this will not need touching the next time send.ts grows an import. */
const TSCONFIG = path.join(ROOT, `.email-archive-tsconfig-${path.basename(OUT)}.json`);
fs.writeFileSync(TSCONFIG, JSON.stringify({
  compilerOptions: {
    outDir: OUT,
    module: 'esnext',
    target: 'es2022',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    baseUrl: ROOT,
    paths: { '@/*': ['src/*'] },
  },
  files: ['src/lib/email/archive.ts', 'src/lib/email/researchNotice.ts', 'src/lib/email/send.ts'],
}, null, 2));

try {
  execFileSync(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', TSCONFIG],
    { cwd: ROOT, stdio: 'pipe' },
  );
} finally {
  fs.rmSync(TSCONFIG, { force: true });
}
/* Everything tsc emitted becomes .mjs, and every relative import inside it is pointed at the new
 * name. Node will not load a bare ".js" as a module here, and guessing the layout is what used to
 * make this step brittle. */
function emittedFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return emittedFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}
for (const file of emittedFiles(OUT)) {
  fs.renameSync(file, file.replace(/\.js$/, '.mjs'));
}
for (const file of emittedFiles(OUT).concat(
  fs.readdirSync(OUT, { recursive: true }).map(f => path.join(OUT, f)).filter(f => f.endsWith('.mjs')),
)) {
  if (!fs.existsSync(file) || !file.endsWith('.mjs')) continue;
  fs.writeFileSync(
    file,
    fs.readFileSync(file, 'utf8').replace(/(from\s+|import\()'(\.[^']*?)'/g, (whole, lead, spec) =>
      spec.endsWith('.mjs') ? whole : `${lead}'${spec}.mjs'`),
  );
}

/* Where send.js landed depends on what else got compiled: on its own it sits at the top of the
 * output, and with company it sits under its own folder. Both are looked for. */
const emitted = fs.readdirSync(OUT, { recursive: true }).map(f => path.join(OUT, String(f)));
const findEmitted = (name) => emitted.find(f => path.basename(f) === name);
const SEND = findEmitted('send.mjs');
const ARCHIVE = findEmitted('archive.mjs');
if (!SEND || !ARCHIVE) {
  console.error('\n  The compiler did not produce send.mjs/archive.mjs where expected. Emitted:');
  console.error('  ' + fs.readdirSync(OUT, { recursive: true }).join('\n  '));
  process.exit(1);
}

const { getArchiveAddress, withArchiveBcc } = await import(pathToFileURL(ARCHIVE).href);
const { sendEmail } = await import(pathToFileURL(SEND).href);

console.log('\nWhere the copy goes');
delete process.env.EMAIL_ARCHIVE_TO;
check('defaults to info@windsorglow.com', getArchiveAddress('someone@example.com') === 'info@windsorglow.com');
check('an email already going to info@ does not copy itself', getArchiveAddress('info@windsorglow.com') === null);
check('is case insensitive about that', getArchiveAddress('INFO@WindsorGlow.com') === null);
process.env.EMAIL_ARCHIVE_TO = 'off';
check('EMAIL_ARCHIVE_TO=off turns it off', getArchiveAddress('someone@example.com') === null);
process.env.EMAIL_ARCHIVE_TO = 'archive@elsewhere.com';
check('EMAIL_ARCHIVE_TO can point somewhere else', getArchiveAddress('a@b.com') === 'archive@elsewhere.com');
delete process.env.EMAIL_ARCHIVE_TO;

console.log('\nMerging with a blind copy a caller already set');
const merged = withArchiveBcc('customer@example.com', 'someone.else@example.com');
check('keeps the existing one', merged.includes('someone.else@example.com'), JSON.stringify(merged));
check('and adds ours', merged.includes('info@windsorglow.com'), JSON.stringify(merged));
check('never adds it twice', withArchiveBcc('a@b.com', 'info@windsorglow.com').length === 1);
check('a list of recipients still gets the copy',
  (withArchiveBcc(['a@b.com', 'c@d.com'], undefined) || []).includes('info@windsorglow.com'));

console.log('\nWhat actually leaves the building');
const realFetch = globalThis.fetch;
let captured = null;
globalThis.fetch = async (url, init) => {
  captured = { url: String(url), body: JSON.parse(init?.body ?? '{}') };
  return new Response(JSON.stringify({ id: 'test-message-id' }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};

const result = await sendEmail({
  from: 'Windsor Glow <orders@windsorglow.com>',
  to: 'customer@example.com',
  subject: 'Wire check',
  text: 'Wire check',
}, { apiKey: 're_test_key_not_a_real_one' });

globalThis.fetch = realFetch;

check('the send reported success', result.ok === true, result.error ?? '');
check('it went to Resend', (captured?.url ?? '').includes('api.resend.com'), captured?.url);
const bcc = captured?.body?.bcc;
const bccList = Array.isArray(bcc) ? bcc : bcc ? [bcc] : [];
check('the request body has no automatic hidden staff copy', bccList.length === 0, JSON.stringify(bccList));
check('the customer is still the only visible recipient', captured?.body?.to === 'customer@example.com');

fs.rmSync(OUT, { recursive: true, force: true });

console.log(`\n  ${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  console.error('  Failed: ' + failures.join(', ') + '\n');
  process.exit(1);
}
console.log('  Customer email leaves without an automatic staff copy.\n');
