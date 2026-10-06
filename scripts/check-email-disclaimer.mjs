// No email carries the old compliance line, and every email is on one of two lists.
//
//   npm run check:email-disclaimer
//
// Windsor Beauty is a skincare shop. An earlier version of this shop added a compliance line to
// the bottom of every customer email. That line is gone, and this check fails if the old wording
// ever comes back into an email, the shared footer or the one door every email is sent through.
//
// It also keeps the two lists honest: emails a customer receives, and post that goes to the team.
// Team post must be marked as internal so it is not filed under a customer.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src/', import.meta.url));

/** The old wording, in any of the forms it used to take. None of it may appear in an email. */
const OLD_WORDING = /research (?:purposes|use)|not for human (?:use|consumption)|laboratory and in vitro/i;

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
  'lib/launchEmail.ts',
  'app/api/admin/enquiries/[id]/reply/route.ts',
  'app/api/contact/send/route.ts',
  'app/api/admin/customer-emails/[id]/forward/route.ts',
  'lib/affiliateEmail.ts',
  'lib/glowCardMilestoneEmail.ts',
  'app/api/admin/member-changeover/route.ts',
  'lib/email/memberChangeoverNotice.ts',
];

/** Internal post. Listed so nobody has to wonder whether these were forgotten. */
const INTERNAL_EMAILS = [
  'lib/adminOrderNotificationEmail.ts',
  'lib/lowStockAlertEmail.ts',
  'lib/reviewNotificationEmail.ts',
  'lib/automationAlertEmail.ts',
  'app/api/admin/enquiries/route.ts',
];

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok    ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`); }
}

const shared = await readFile(ROOT + 'lib/email/shared.ts', 'utf8');
check('the shared email footer does not carry the old line', !OLD_WORDING.test(shared));

const sender = await readFile(ROOT + 'lib/email/send.ts', 'utf8');
check('the one send door does not add the old line', !OLD_WORDING.test(sender) && !/researchNotice/i.test(sender));
check('and team post can be marked as internal', /options\.internal/.test(sender));

const noticeFile = await readFile(ROOT + 'lib/email/researchNotice.ts', 'utf8').catch(() => null);
check('the old notice file has not come back', noticeFile === null);

for (const file of [...CUSTOMER_EMAILS, ...INTERNAL_EMAILS]) {
  const source = await readFile(ROOT + file, 'utf8').catch(() => null);
  if (source === null) { check(`${file} exists`, false, 'file not found, so the list above is stale'); continue; }
  const name = file.replace(/^lib\//, '').replace(/^app\/api\//, '');
  check(`${name}: does not carry the old line`, !OLD_WORDING.test(source));
}

/* Every piece of team post is marked as internal, so it is never filed under a customer. */
for (const file of INTERNAL_EMAILS) {
  const source = await readFile(ROOT + file, 'utf8').catch(() => null);
  if (source === null) { check(`${file} exists`, false, 'file not found, so the list above is stale'); continue; }
  check(`${file.replace(/^lib\//, '').replace(/^app\/api\//, '')}: marked as internal post`,
    /internal:\s*true/.test(source));
}

/* Nothing has been dropped off either list. An email added tomorrow fails here until somebody has
   decided which of the two it is. */
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
  unlisted.length ? `nobody has decided which list these belong on: ${unlisted.join(', ')}` : '');

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
