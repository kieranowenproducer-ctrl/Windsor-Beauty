// Every email opens "Hi <first name>," and never shows somebody's full name.
//
//   npm run test:email-greeting
//
// Kieran, 10 September 2026, after seeing a reply box open with "Hello Emma Lewis":
//
//   "no email should start with hello Emma Louise. It should never ever show their full name.
//    It should be hi Emma. Please change this for any response."
//
// The rule used to be written out by hand in fourteen places. Some said Hello and some said Hi,
// some used the first name and some used whatever the customer typed into the name box, and in
// three emails the HTML half and the plain-text half of the SAME message disagreed. This proves
// the one function behaves, and that all fourteen now go through it.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { emailGreeting, emailGreetingName, messageStartsWithGreeting } from '../src/lib/email/greeting.ts';

const ROOT = fileURLToPath(new URL('../src/', import.meta.url));

/* The thing he actually asked for. */
assert.equal(emailGreeting('Emma Lewis'), 'Hi Emma,');
assert.equal(emailGreeting('Emma Louise Lewis'), 'Hi Emma,');
assert.equal(emailGreetingName('Emma Lewis'), 'Emma');

/* A name is whatever somebody typed into a box, so it arrives in every shape. */
assert.equal(emailGreeting('  emma   lewis  '), 'Hi Emma,', 'all lower case is tidied up');
assert.equal(emailGreeting('Emma'), 'Hi Emma,');
assert.equal(emailGreeting('Mrs Emma Lewis'), 'Hi Emma,', 'a title is not a name');
assert.equal(emailGreeting('Dr. Emma Lewis'), 'Hi Emma,');
assert.equal(emailGreeting(''), 'Hi there,', 'no name uses a natural greeting without guessing');
assert.equal(emailGreeting('   '), 'Hi there,');
assert.equal(emailGreeting(null), 'Hi there,');
assert.equal(emailGreeting(undefined), 'Hi there,');
assert.equal(emailGreeting('emma@example.com'), 'Hi there,', 'an address in the name box is not a name');

/* The branded wrapper must not add a second greeting when the reply already has one. */
assert.equal(messageStartsWithGreeting('Hi Pauline,\n\nThanks for writing.'), true);
assert.equal(messageStartsWithGreeting('Hello Emma\n\nThanks for writing.'), true);
assert.equal(messageStartsWithGreeting('Hi Pauline, thanks for writing.'), true);
assert.equal(messageStartsWithGreeting('Of course. Here are the steps.'), false);

/* Names we must not "correct". Getting somebody's own name wrong is worse than plain. */
assert.equal(emailGreeting('McDonald Smith'), 'Hi McDonald,');
assert.equal(emailGreeting("O'Brien"), "Hi O'Brien,");
assert.equal(emailGreeting('de Souza'), 'Hi de Souza,', 'a particle carries the word after it, so nobody is greeted as De');

/* Nothing can be injected through a name into an HTML greeting. */
assert.equal(emailGreetingName('<script>Emma'), 'Script', 'brackets are stripped before use');

/* Every email opens through the one function, so this cannot drift back apart. */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = `${dir}${entry.name}`;
    if (entry.isDirectory()) out.push(...await walk(`${full}/`));
    else if (/\.tsx?$/.test(entry.name)) out.push(full.slice(ROOT.length).replace(/\\/g, '/'));
  }
  return out;
}

const offenders = [];
for (const file of await walk(ROOT)) {
  if (file === 'lib/email/greeting.ts') continue;
  const source = await readFile(ROOT + file, 'utf8');
  // Only things that build an email. The chat window greets people too, and it is allowed its
  // own voice; it is checked separately below for the one thing that matters, the full name.
  const isEmail = /sendEmail\(|emailDocument\(|\btext:\s*`/.test(source) || file.startsWith('lib/email/');
  if (!isEmail) continue;
  // A greeting built by hand out of a name, rather than through emailGreeting.
  for (const match of source.matchAll(/(?:Hi|Hello|Dear) \$\{([^}]*(?:[Nn]ame|firstName)[^}]*)\}/g)) {
    const expression = match[1];
    if (expression.includes('emailGreeting')) continue;
    // A plain variable is fine when that variable was itself produced by the one function:
    // the editable PEARL letter writes "Hi {{NAME}}" and fills it from emailGreetingName.
    const variable = expression.trim().match(/^escapeHtml\((\w+)\)$|^(\w+)$/);
    const named = variable?.[1] ?? variable?.[2];
    if (named && new RegExp(`(?:const|let) ${named} = emailGreetingName\\(`).test(source)) continue;
    offenders.push(`${file}: ${match[0]}`);
  }
}
assert.deepEqual(offenders, [], `these greet somebody without going through emailGreeting:\n  ${offenders.join('\n  ')}`);

/* The chat window is not an email and is allowed its own voice, but it must still not use a
   full name. Checked rather than assumed, because that is where a full name would look worst. */
const chat = await readFile(ROOT + 'components/account/ConciergeChat.tsx', 'utf8');
assert.match(chat, /firstName/, 'the chat greeting still uses a first name only');

console.log('Email greeting checks passed: every email opens "Hi <first name>," and no full names.');
