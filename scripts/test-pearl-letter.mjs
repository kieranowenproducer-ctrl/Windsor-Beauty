// Proves a saved PEARL letter is what actually gets used (task 3a5298f5).
//
// The Website Enquiries screen builds BOTH the email it sends and the preview it
// shows from one call to buildPearlReplyTemplate, passing the letter saved on
// /admin/pearl-email. So this tests the single function both paths go through.
//
// It exists because the browser check for that last step could not be finished:
// the enquiry card has to be opened and its auto-written reply cleared before
// the PEARL template appears, and by the time that sequence was right the
// contact form's rate limit refused another test enquiry. Rather than leave the
// step unproven, it is proven here, where it can also never rot.
//
// Run: npm run test:pearl-letter
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Compiled inside the project so imports resolve; removed at the end.
const OUT = fs.mkdtempSync(path.join(ROOT, '.pearl-letter-test-'));

let passed = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) { passed += 1; console.log(`  ok    ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

try {
  execFileSync(process.execPath, [
    path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
    'src/lib/email/pearlReplyTemplate.ts',
    '--outDir', OUT, '--module', 'esnext', '--target', 'es2022',
    '--moduleResolution', 'bundler', '--skipLibCheck',
  ], { cwd: ROOT, stdio: 'pipe' });

  const built = path.join(OUT, 'pearlReplyTemplate.js');
  const asMjs = built.replace(/\.js$/, '.mjs');
  fs.renameSync(built, asMjs);

  const {
    buildPearlReplyTemplate,
    defaultPearlLetter,
    parsePearlReply,
    pearlReplyValidationError,
    PEARL_REPLY_START,
    PEARL_REPLY_END,
    PEARL_NAME_TOKEN,
  } = await import(pathToFileURL(asMjs).href);

  const TITLE = 'HGH 191AA research ranges';
  const ANSWER = 'Lower source range: 1-2 IU per day';

  console.log('\nWith nothing saved, nothing changes for a customer');
  const asToday = buildPearlReplyTemplate('Yvonne', TITLE, ANSWER);
  check('the built-in letter is used', asToday.includes('Welcome to Windsor Glow'));
  check('the customer is greeted by name', asToday.includes('Hi Yvonne,'));
  check('their answer is in place', asToday.includes(TITLE) && asToday.includes(ANSWER));
  check('and it is a valid email to send', pearlReplyValidationError(asToday) === null,
    pearlReplyValidationError(asToday) ?? '');

  console.log('\nWith a letter saved, the saved words are the ones used');
  const saved = [
    `Dear ${PEARL_NAME_TOKEN},`,
    '',
    'A completely different opening that Kieran typed himself.',
    '',
    PEARL_REPLY_START,
    'placeholder title',
    '',
    'placeholder answer',
    PEARL_REPLY_END,
    '',
    'A completely different sign-off.',
  ].join('\n');

  const built2 = buildPearlReplyTemplate('Yvonne', TITLE, ANSWER, saved);
  check('the saved opening is used', built2.includes('A completely different opening that Kieran typed himself.'));
  check('the saved sign-off is used', built2.includes('A completely different sign-off.'));
  check('the old built-in wording is gone', !built2.includes('Welcome to Windsor Glow'));
  check('the name token became the name', built2.includes('Dear Yvonne,') && !built2.includes(PEARL_NAME_TOKEN));
  check("the customer's own answer replaced the placeholder",
    built2.includes(TITLE) && built2.includes(ANSWER) && !built2.includes('placeholder answer'));
  check('it is still a valid email to send', pearlReplyValidationError(built2) === null,
    pearlReplyValidationError(built2) ?? '');

  const parsed = parsePearlReply(built2);
  check('it still splits into the three parts the email needs', Boolean(parsed));
  check('the gold box holds the answer and nothing else',
    Boolean(parsed) && parsed.pearl.includes(TITLE) && parsed.pearl.includes(ANSWER));

  console.log('\nWhen somebody deletes the markers');
  const broken = 'Just a greeting and nothing else.';
  const built3 = buildPearlReplyTemplate('Yvonne', TITLE, ANSWER, broken);
  check("the answer is not silently lost", built3.includes(ANSWER));
  check('and the send is refused', pearlReplyValidationError(built3) !== null);

  console.log('\nThe reset on the screen');
  const fallback = defaultPearlLetter();
  check('reset gives back the original letter', fallback.includes('Welcome to Windsor Glow'));
  check('with the name token in it, ready to edit', fallback.includes(PEARL_NAME_TOKEN));
  check('and the markers in it', fallback.includes(PEARL_REPLY_START) && fallback.includes(PEARL_REPLY_END));
} finally {
  fs.rmSync(OUT, { recursive: true, force: true });
}

console.log(`\n  ${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  console.error('  Failed: ' + failures.join(', ') + '\n');
  process.exit(1);
}
console.log('  A saved letter is what customers receive.\n');
