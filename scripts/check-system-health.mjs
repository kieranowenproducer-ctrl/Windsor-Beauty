// Proves the three things that decide whether the red "needs attention" banner
// on the admin dashboard can be trusted. All three were real defects on
// 2026-08-15, when the banner read "2 things went wrong" and neither was a
// fault in the website:
//
//   1. A customer's bank declining a payment is not a fault. It was counted as
//      one, in the same red box as a dispatch that never happened. An alarm
//      that goes off for normal events is an alarm people stop reading.
//   2. Nobody could tick anything off. The count was a rolling 24 hours, so an
//      unfixed problem went quiet by itself and a fixed one stayed lit.
//   3. A contact whose stored email was the literal text "hhh" was sent to on
//      every campaign to the whole list, failed every time, and lit the banner
//      every time. The typed-in-addresses path checked the format; the whole
//      list path did not.
//
// Run: npm run check:system-health
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok       ${name}`);
  } else {
    failures += 1;
    console.log(`  FAILED   ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- The rules, transcribed from the TypeScript sources -----------------------
// Both are pinned to their source by the text checks further down, so editing
// the real file without editing this one fails the run.

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_EMAIL_LENGTH = 254;
function isSendableEmailAddress(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH) return false;
  return EMAIL_PATTERN.test(trimmed);
}

const CUSTOMER_EVENT_CATEGORIES = ['fena_payment_not_completed'];
const isCustomerEvent = (c) => CUSTOMER_EVENT_CATEGORIES.includes(c);

function categoryLabel(category, labels) {
  const known = labels[category];
  if (known) return known;
  const words = category.replace(/[_-]+/g, ' ').trim();
  if (!words) return 'Something else';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// The count behind the banner and the sidebar badge.
function openCount(rows) {
  return rows.filter((r) => !isCustomerEvent(r.category) && !r.resolved_at).length;
}

console.log('\nEmail addresses that can actually be sent to');
check('a normal address passes', isSendableEmailAddress('cpink999@hotmail.com'));
check('an address with a plus tag passes', isSendableEmailAddress('sam+news@windsorglow.com'));
check('a subdomain address passes', isSendableEmailAddress('a@mail.co.uk'));
check('surrounding spaces are ignored', isSendableEmailAddress('  joe@example.com  '));
check('the literal "hhh" is refused', !isSendableEmailAddress('hhh'), 'this is the contact that failed every campaign');
check('a blank is refused', !isSendableEmailAddress('   '));
check('no at-sign is refused', !isSendableEmailAddress('joe.example.com'));
check('no dot after the at-sign is refused', !isSendableEmailAddress('joe@example'));
check('an inner space is refused', !isSendableEmailAddress('joe smith@example.com'));
check('a non-string is refused', !isSendableEmailAddress(null));
check('an absurdly long address is refused', !isSendableEmailAddress(`${'a'.repeat(250)}@example.com`));

console.log('\nWhat counts as a fault, and what is just something that happened');
check('a declined payment is not a fault', isCustomerEvent('fena_payment_not_completed'));
check('a dispatch that did not go is a fault', !isCustomerEvent('royal_mail_dispatch'));
check('an email that did not send is a fault', !isCustomerEvent('customer_email'));
check('a payment update we do not recognise is still a fault', !isCustomerEvent('fena_webhook_unhandled_status'),
  'an unknown status means the integration may genuinely be broken');

console.log('\nThe number on the red banner');
const sample = [
  { id: 1, category: 'fena_payment_not_completed', resolved_at: null },
  { id: 2, category: 'customer_email', resolved_at: null },
  { id: 3, category: 'royal_mail_dispatch', resolved_at: '2026-08-15T10:00:00Z' },
  { id: 4, category: 'admin_email', resolved_at: null },
];
check('declined payments are left out', openCount(sample) === 2, `got ${openCount(sample)}`);
check('anything ticked off is left out', !openCount(sample.filter((r) => r.id === 3)));
check('an untouched fault still counts however old it is', openCount([{ id: 9, category: 'customer_email', resolved_at: null }]) === 1);
check('nothing open reads as zero', openCount([{ id: 9, category: 'fena_payment_not_completed', resolved_at: null }]) === 0);

console.log('\nNo raw database slug ever reaches the screen');
const labels = { customer_email: 'Email to a customer' };
check('a known category uses its label', categoryLabel('customer_email', labels) === 'Email to a customer');
check('an unlabelled category is turned into words',
  categoryLabel('fena_payment_not_completed', {}) === 'Fena payment not completed',
  `got "${categoryLabel('fena_payment_not_completed', {})}"`);
check('an empty category still reads as English', categoryLabel('', {}) === 'Something else');

// --- Pinned to the real sources ----------------------------------------------
console.log('\nThe real files still say what this test assumes');

const emailSrc = read('src/lib/emailAddress.ts');
check('emailAddress.ts uses the same pattern',
  emailSrc.includes('/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/'),
  'the pattern changed, so update this test');
check('emailAddress.ts still caps the length at 254', emailSrc.includes('254'));

const kindsSrc = read('src/lib/automationFailureKinds.ts');
check('the declined-payment category is still the event category',
  kindsSrc.includes("'fena_payment_not_completed'"));
check('categoryLabel still has a words fallback', /replace\(\/\[_-\]\+\/g/.test(kindsSrc));

const dbSrc = read('src/lib/db.ts');
check('the open count excludes customer events',
  dbSrc.includes('countOpenAutomationFailures') && dbSrc.includes('CUSTOMER_EVENT_CATEGORIES'));
check('the open count excludes anything ticked off',
  /countOpenAutomationFailures[\s\S]{0,900}resolved_at IS NULL/.test(dbSrc));
check('the resolved column is added lazily as well as in the schema',
  dbSrc.includes('ADD COLUMN IF NOT EXISTS resolved_at'));
check('a missing column falls back instead of throwing',
  /hasResolvedColumn\(\)\)\)\s*\{[\s\S]{0,400}INTERVAL '24 hours'/.test(dbSrc),
  'the deploy lands before Run DB Setup, so this must not 500');

const schemaSrc = read('src/lib/db/schema-parts/operations-and-logs.ts');
check('Run DB Setup also adds the resolved column',
  schemaSrc.includes('ADD COLUMN IF NOT EXISTS resolved_at'));

const sendSrc = read('src/app/api/admin/marketing/send/route.ts');
check('the whole-list send now checks the addresses',
  sendSrc.includes('partitionSendableAddresses'),
  'this is the path that emailed "hhh" on every campaign');
check('skipped addresses are reported back, not swallowed',
  sendSrc.includes('skippedInvalid'));

const announceSrc = read('src/app/api/admin/launch/announce/route.ts');
check('the announcement send checks its stored list too',
  /listLaunchSubscribers\(\)[\s\S]{0,400}EMAIL_RE\.test/.test(announceSrc));

const marketingDb = read('src/lib/db/marketing.ts');
check('a bad address can no longer be saved as a contact',
  marketingDb.includes('isSendableEmailAddress'));

const webhookSrc = read('src/app/api/webhooks/fena/route.ts');
check('our own bank details are no longer written into the log',
  webhookSrc.includes('paymentDetailForLog') && !/'bankAccount'/.test(webhookSrc));
check('an unrecognised status is still captured in full',
  /fena_webhook_unhandled_status[\s\S]{0,200}detail: payload/.test(webhookSrc),
  'that full capture is how the original payload bug was solved');

const dashboardSrc = read('src/app/admin/dashboard/page.tsx');
check('the dashboard banner reads the open count', dashboardSrc.includes('data.openCount'));
check('the banner no longer claims a 24 hour window',
  !dashboardSrc.includes('in the last 24 hours'));

const sidebarSrc = read('src/components/admin/AdminSidebar.tsx');
check('the sidebar badge reads the open count', sidebarSrc.includes('data.openCount'));

const healthPage = read('src/app/admin/system-health/page.tsx');
check('System Health uses the shared labels',
  healthPage.includes("from '@/lib/automationFailureKinds'"));
check('System Health has a Done button', /setResolved\(f, options\.tick === 'resolve'\)/.test(healthPage));

console.log(failures === 0
  ? '\nAll system health checks passed.\n'
  : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
