// Proves the two things that decide what a marketing email looks like and who
// it reaches, both of which are easy to break quietly:
//
//   1. The gold button and the banner. Blank must mean "exactly as it always
//      was", not an empty button, and a dangerous or malformed link must fall
//      back to the shop rather than going out to the whole list.
//   2. The recipient list. Anyone who unsubscribed has to be dropped even when
//      an admin types their address in by hand.
//
// Run: npm run check:marketing
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok       ${name}`);
  } else {
    failures += 1;
    console.log(`  FAILED   ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- resolveMarketingCta, transcribed from src/lib/marketingEmail.ts ---------
// The source is TypeScript, so the rule is mirrored here and pinned to the
// source by the text checks further down: if the defaults are edited there and
// not here, the "matches the source" check fails.
const DEFAULTS = { label: 'Shop Now', url: 'https://windsorglow.com/shop', headerLabel: 'Special Offer' };

function resolveMarketingCta(input) {
  const label = (input?.ctaLabel ?? '').trim().slice(0, 40) || DEFAULTS.label;
  const headerLabel = (input?.headerLabel ?? '').trim().slice(0, 40) || DEFAULTS.headerLabel;
  const raw = (input?.ctaUrl ?? '').trim();
  let url = DEFAULTS.url;
  if (raw) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') url = parsed.toString();
    } catch { /* keep the default */ }
  }
  return { label, url, headerLabel };
}

console.log('\nTHE BUTTON AND THE BANNER\n');

const blank = resolveMarketingCta({});
check('nothing chosen gives the button every past campaign had',
  blank.label === 'Shop Now' && blank.url === 'https://windsorglow.com/shop' && blank.headerLabel === 'Special Offer',
  JSON.stringify(blank));

const nulls = resolveMarketingCta({ ctaLabel: null, ctaUrl: null, headerLabel: null });
check('an old campaign, which stored nulls, is unchanged',
  nulls.label === 'Shop Now' && nulls.url === 'https://windsorglow.com/shop');

const spaces = resolveMarketingCta({ ctaLabel: '   ', ctaUrl: '  ', headerLabel: ' ' });
check('spaces do not produce an empty button', spaces.label === 'Shop Now' && spaces.headerLabel === 'Special Offer');

const review = resolveMarketingCta({
  ctaLabel: 'Leave your review',
  ctaUrl: 'https://windsorglow.com/reviews',
  headerLabel: 'A Favour To Ask',
});
check('a chosen button is used as typed',
  review.label === 'Leave your review'
  && review.url === 'https://windsorglow.com/reviews'
  && review.headerLabel === 'A Favour To Ask',
  JSON.stringify(review));

for (const nasty of ['javascript:alert(1)', 'data:text/html,<script>', 'mailto:someone@example.com', 'not a url', '/reviews']) {
  const out = resolveMarketingCta({ ctaUrl: nasty });
  check(`a link of "${nasty}" falls back to the shop`, out.url === 'https://windsorglow.com/shop', out.url);
}

check('a very long button label is cut rather than breaking the layout',
  resolveMarketingCta({ ctaLabel: 'x'.repeat(200) }).label.length === 40);

// The mirrored rule above must still match the real source.
const source = readFileSync(join(ROOT, 'src/lib/marketingEmail.ts'), 'utf8');
check('the defaults here still match src/lib/marketingEmail.ts',
  source.includes("label: 'Shop Now'")
  && source.includes("url: 'https://windsorglow.com/shop'")
  && source.includes("headerLabel: 'Special Offer'"));
check('the button link and words are escaped into the email',
  source.includes('${escapeHtml(cta.url)}') && source.includes('${escapeHtml(cta.label)}'));
check('the banner uses the chosen words', source.includes('headerLabel: cta.headerLabel'));
check('the plain-text version of the email carries the button link',
  source.includes('`${cta.label}: ${cta.url}`'));

// --- who the campaign reaches ----------------------------------------------
console.log('\nWHO IT REACHES\n');

const send = readFileSync(join(ROOT, 'src/app/api/admin/marketing/send/route.ts'), 'utf8');

check('the whole list is still the default when no audience is chosen',
  send.includes("body?.audience === 'custom' ? 'custom' : 'all'"));
check('somebody who unsubscribed is dropped even if typed in by hand',
  send.includes('contact.unsubscribed_at || !contact.consent') && send.includes('skippedUnsubscribed.push(email)'));
check('somebody with no contact row is dropped, because they could never unsubscribe',
  send.includes('!contact?.unsubscribe_token') && send.includes('skippedUnknown.push(email)'));
// Anchored to the end of the line on purpose: `includes('MAX_RECIPIENTS = 500')`
// also matches 5000, so a loosened limit would have slipped through silently.
check('one send cannot exceed the 500-person safety limit', /MAX_RECIPIENTS = 500;\s*$/m.test(send));
check('the send is paced and retried rather than a bare loop, so a timeout cannot double-email',
  send.includes('bulkSend(') && !/for \(const contact of contacts\)/.test(send));
check('only the people actually reached are recorded',
  send.includes('recipientCount: successCount + failureCount'));
check('everyone still gets their own unsubscribe link',
  send.includes('unsubscribe?token=${contact.unsubscribe_token}'));

// --- the draft remembers its button ----------------------------------------
console.log('\nSAVING AND REUSING\n');

const dbFile = readFileSync(join(ROOT, 'src/lib/db/marketing.ts'), 'utf8');
for (const column of ['cta_label', 'cta_url', 'header_label']) {
  check(`${column} is added to the table if it is missing`,
    dbFile.includes(`ADD COLUMN IF NOT EXISTS ${column} TEXT`));
}
check('a saved draft stores its button', dbFile.includes('INSERT INTO marketing_campaigns (subject, body_html, body_text, sender, cta_label, cta_url, header_label, status'));

const listRoute = readFileSync(join(ROOT, 'src/app/api/admin/marketing/campaigns/route.ts'), 'utf8');
check('the history hands the button back so Edit & Reuse restores it',
  listRoute.includes('ctaLabel: c.cta_label') && listRoute.includes('ctaUrl: c.cta_url'));

const storedPreview = readFileSync(join(ROOT, 'src/app/api/admin/marketing/campaigns/[id]/preview/route.ts'), 'utf8');
check('previewing a saved campaign shows the button it really carried',
  storedPreview.includes('ctaLabel: campaign.cta_label'));

// --- where the button lands -------------------------------------------------
console.log('\nWHERE THE BUTTON LANDS\n');

const chrome = readFileSync(join(ROOT, 'src/components/SiteChrome.tsx'), 'utf8');
const exemptBlock = /const GATE_EXEMPT_PREFIXES = \[([\s\S]*?)\]/.exec(chrome)?.[1] ?? '';
check('the entry-notice exemption list was found at all', exemptBlock.length > 0);
check('the reviews page is not behind the tick-box entry notice',
  /'\/reviews'/.test(exemptBlock), 'a customer clicking the email button would be stopped by it');
check('the shop is still behind the notice', !/'\/shop'/.test(exemptBlock));

const loginPage = readFileSync(join(ROOT, 'src/app/account/login/page.tsx'), 'utf8');
check('signing in can return somebody to the page that asked for it',
  loginPage.includes('safeNextPath') && loginPage.includes("data.redirect === '/account'"));
check('that return path cannot be pointed at another website',
  loginPage.includes("!raw.startsWith('/')") && loginPage.includes("raw.startsWith('//')"));

const reviewForm = readFileSync(join(ROOT, 'src/components/reviews/ReviewForm.tsx'), 'utf8');
check('the leave-a-review sign-in link brings them back to the review',
  reviewForm.includes('/account/login?next=') && reviewForm.includes('encodeURIComponent(backHere)'));
check('leaving a review still requires being signed in',
  reviewForm.includes('isLoggedIn === false'));

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}\n`);
process.exit(failures ? 1 : 0);
