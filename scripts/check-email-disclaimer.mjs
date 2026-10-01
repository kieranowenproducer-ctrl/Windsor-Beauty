// Every email a CUSTOMER receives carries the research-use line, in both halves of it.
//
//   npm run check:email-disclaimer
//
// Kieran, 10 September 2026: "Ensure every single email has a research disclaimer at the bottom.
// I believe it's already on there, but doublecheck."
//
// He was right that it was there, and right to ask. It was on the picture and not on the words:
// every HTML half carried it, through the shared footer, and the plain-text half carried it in two
// emails out of fifteen. That half is not decorative. It is what a screen reader reads out, what a
// text-only client shows, and what arrives when a mail server strips the HTML. An email whose
// picture carries a disclaimer and whose words do not is an email with no disclaimer at all for
// the person reading the words.
//
// The line is now appended by sendEmail, the one door this site sends through, so a new email
// written next year carries it without anybody remembering. This file proves that door still does
// it, that nothing has opted out that should not have, and that no email has been added that
// nobody has classified.
//
// WHAT IS DELIBERATELY NOT CHECKED. Post that goes to Kieran and the team rather than to a
// customer: a low-stock alert, a sentinel report, a task notification, the admin copy of an order,
// the ad-spend report. Nobody is being sold anything in them, and a compliance line on an alert
// about stock would be noise, which is what teaches people to stop reading the line where it
// matters.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src/', import.meta.url));

/** The words that make a research-use line, in any of the wordings actually in use. */
const DISCLAIMER = /research (?:purposes|use) only|not for human (?:use|consumption)/i;

/** Emails a customer receives. Each one is checked. */
const CUSTOMER_EMAILS = [
  'lib/orderConfirmationEmail.ts',
  'lib/shippingEmail.ts',
  'lib/invoiceEmail.ts',
  'lib/paymentLinkEmail.ts',
  'lib/paymentResumeEmail.ts',
  'lib/paypalInstructionsEmail.ts',
  'lib/membershipWelcomeEmail.ts',
  'lib/verifyEmailEmail.ts',
  'lib/passwordResetEmail.ts',
  'lib/customerMessageEmail.ts',
  'lib/backInStockEmail.ts',
  'lib/marketingEmail.ts',
  'lib/announcementEmail.ts',
  'lib/launchEmail.ts',
  'app/api/admin/enquiries/[id]/reply/route.ts',
  'app/api/contact/send/route.ts',
  'app/api/admin/pearl-emails/[id]/send/route.ts',
];

/** Internal post. Listed so nobody has to wonder whether these were forgotten. */
const INTERNAL_EMAILS = [
  'lib/adminOrderNotificationEmail.ts',
  'lib/lowStockAlertEmail.ts',
  'lib/reviewNotificationEmail.ts',
  'lib/automationAlertEmail.ts',
  'lib/sentinel.ts',
  'lib/tasks/notify.ts',
  'app/api/cron/ads/route.ts',
];

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok    ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`); }
}

/* The shared footer is where the HTML half gets it. If its default ever loses the wording, every
   email that relies on it loses the wording silently and no page looks any different. */
const shared = await readFile(ROOT + 'lib/email/shared.ts', 'utf8');
check('the shared email footer still carries the research-use line', DISCLAIMER.test(shared));

const notice = await readFile(ROOT + 'lib/email/researchNotice.ts', 'utf8').catch(() => '');
check('there is one research notice for the plain-text half', DISCLAIMER.test(notice));
check('and it refuses to write the line twice', /hasResearchNotice/.test(notice));

const sender = await readFile(ROOT + 'lib/email/send.ts', 'utf8');
check('the one send door appends it to the plain-text half', /withResearchNotice/.test(sender));
check('and internal post can opt out', /options\.internal/.test(sender));

for (const file of CUSTOMER_EMAILS) {
  const source = await readFile(ROOT + file, 'utf8').catch(() => null);
  if (source === null) { check(`${file} exists`, false, 'file not found, so the list above is stale'); continue; }

  const name = file.replace(/^lib\//, '').replace(/^app\/api\//, '');
  // renderPearlEmail builds a whole email of its own and carries the line in both halves.
  const viaRenderer = /renderPearlEmail\(/.test(source);

  // The HTML half: through the shared document, which always carries the footer, or written here.
  check(`${name}: the HTML half carries it`,
    viaRenderer || /emailDocument\(/.test(source) || DISCLAIMER.test(source));

  // The plain-text half: appended by the sender, so what would break it is opting out.
  if (/\btext:/.test(source) || /const text =/.test(source)) {
    check(`${name}: the plain-text half carries it`,
      viaRenderer || DISCLAIMER.test(source) || !/internal:\s*true/.test(source),
      'this email opts out of the notice but goes to a customer');
  }
}

/* Every internal one really did opt out, or it is quietly carrying a compliance line into a stock
   alert, which is the mirror-image mistake and just as invisible. */
for (const file of INTERNAL_EMAILS) {
  const source = await readFile(ROOT + file, 'utf8').catch(() => null);
  if (source === null) { check(`${file} exists`, false, 'file not found, so the list above is stale'); continue; }
  check(`${file.replace(/^lib\//, '').replace(/^app\/api\//, '')}: marked as internal post`,
    /internal:\s*true/.test(source));
}

/* Nothing has been dropped off either list. An email added tomorrow fails here until somebody has
   decided which of the two it is, which is the only way "every single email" stays true. */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = `${dir}${entry.name}`;
    if (entry.isDirectory()) out.push(...await walk(`${full}/`));
    else if (/\.tsx?$/.test(entry.name)) out.push(full.slice(ROOT.length).replace(/\\/g, '/'));
  }
  return out;
}
const senders = [];
for (const file of await walk(ROOT)) {
  // The module that IS the door, and the webhook that only forwards a captured reply on, are
  // not emails this rule is about.
  if (file === 'lib/email/send.ts' || file.includes('webhooks/')) continue;
  const source = await readFile(ROOT + file, 'utf8');
  if (/\bsendEmail\(|\bsendViaResend\(|emails\.send\(/.test(source)) senders.push(file);
}
const known = new Set([...CUSTOMER_EMAILS, ...INTERNAL_EMAILS]);
const unlisted = senders.filter(f => !known.has(f));
check('every email in the app is on one of the two lists',
  unlisted.length === 0,
  unlisted.length ? `nobody has decided whether these need the line: ${unlisted.join(', ')}` : '');

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
