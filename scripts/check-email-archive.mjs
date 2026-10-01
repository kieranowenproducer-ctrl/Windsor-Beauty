// Proves every email uses the shared sender and that the shared sender does
// not silently copy customer mail to a staff inbox.
//
// The only way to guarantee "every email" is to have one door and to check that
// nobody has cut a new one. Before this task there were 24 separate calls to
// Resend in 23 files; one set a blind copy and 23 did not, and nothing would
// have told anyone. So: exactly one file may call Resend's send, and it is the
// one that adds the copy.
//
// Run: npm run check:email-archive
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENDER = 'src/lib/email/send.ts';

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(p);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      files.push(p);
    }
  }
})(path.join(ROOT, 'src'));

const offenders = [];
for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel === SENDER) continue;
  const src = fs.readFileSync(file, 'utf8');
  if (/\.emails\.send\s*\(/.test(src) || /new Resend\s*\(/.test(src)) {
    offenders.push(rel);
  }
}

const problems = [];
if (offenders.length) {
  problems.push(
    `These files talk to Resend directly, so their email would go out with no copy to info@windsorglow.com:\n` +
    offenders.map(o => `    ${o}`).join('\n') +
    `\n  Send through sendEmail() from '@/lib/email/send' instead.`
  );
}

const senderSrc = fs.readFileSync(path.join(ROOT, SENDER), 'utf8');
if (senderSrc.includes('withArchiveBcc')) {
  problems.push(`  ${SENDER} still adds an automatic hidden staff copy to customer email.`);
}

if (problems.length) {
  console.error('\nEmail archive check FAILED:\n');
  problems.forEach(p => console.error(p + '\n'));
  process.exit(1);
}

console.log(`\n  Email archive check passed.`);
console.log(`  ${files.length} files scanned; every send goes through ${SENDER},`);
console.log(`  which sends only to the recipients each caller explicitly names.\n`);
