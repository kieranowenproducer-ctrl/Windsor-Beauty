// The website's own gates and wiring around the hosted concierge service.
//
//   node --import ./scripts/alias-loader.mjs scripts/test-escalation-rules.mjs
//
// Free: pure functions and source checks, no database, no model, no keys.
//
// REWRITTEN IN STAGE 5 of the assistant merge (2026-08-03). The escalation
// RULES (tier 1, tier 3, missing orders, the reply wording) moved into the
// hosted service with the engine, and their 49-check suite moved with them:
// ai-support-agent/evals/escalation-rules.mjs. What this file still proves is
// what the WEBSITE still owns: who may reach each surface at all, and that
// both routes really are thin doors onto the one service — because the day a
// route quietly grows its own engine again is the day drift comes back.
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
function ok(name, condition) {
  if (condition) { passed += 1; } else { failed += 1; console.log(`  FAIL  ${name}`); }
}

/* ── Who may reach the concierge at all ────────────────────────────────────
 *
 * Kieran asked on 2026-08-02 for it to come off the customer side until he has
 * tested it more. The default has to be CLOSED, because the way it went live
 * in the first place was a setting nobody chose. Every case below is about
 * failing shut. */
const av = await import('@/lib/concierge/availability');

function withEnv(vars, run) {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try { return run(); } finally { process.env = saved; }
}

console.log('\n  WHO MAY REACH THE CONCIERGE\n');

ok('closed by default, with nothing set at all',
  withEnv({ CONCIERGE_ACCOUNT_LIVE: undefined, CONCIERGE_TEST_ACCOUNTS: undefined },
    () => !av.conciergeAvailableTo('someone@example.com')));
ok('closed when the setting is removed later',
  withEnv({ CONCIERGE_ACCOUNT_LIVE: undefined }, () => !av.conciergeOpenToCustomers()));
ok('closed when the setting is misspelled',
  withEnv({ CONCIERGE_ACCOUNT_LIVE: 'yes' }, () => !av.conciergeOpenToCustomers()));
ok('closed when it is explicitly off',
  withEnv({ CONCIERGE_ACCOUNT_LIVE: 'off' }, () => !av.conciergeOpenToCustomers()));
ok('open only on exactly "on"',
  withEnv({ CONCIERGE_ACCOUNT_LIVE: 'on' }, () => av.conciergeOpenToCustomers()));
ok('and "ON" with a stray space still counts, because a settings box is typed by a person',
  withEnv({ CONCIERGE_ACCOUNT_LIVE: ' ON ' }, () => av.conciergeOpenToCustomers()));

ok('a test account gets in while it is closed to everyone else',
  withEnv({ CONCIERGE_ACCOUNT_LIVE: 'off', CONCIERGE_TEST_ACCOUNTS: 'kieran@example.com' },
    () => av.conciergeAvailableTo('kieran@example.com')));
ok('and nobody else does',
  withEnv({ CONCIERGE_ACCOUNT_LIVE: 'off', CONCIERGE_TEST_ACCOUNTS: 'kieran@example.com' },
    () => !av.conciergeAvailableTo('customer@example.com')));
ok('the list is not case sensitive',
  withEnv({ CONCIERGE_ACCOUNT_LIVE: 'off', CONCIERGE_TEST_ACCOUNTS: 'Kieran@Example.com' },
    () => av.conciergeAvailableTo('kieran@example.com')));
ok('spaces around a comma do not lock somebody out',
  withEnv({ CONCIERGE_ACCOUNT_LIVE: 'off', CONCIERGE_TEST_ACCOUNTS: ' a@x.com , b@x.com ' },
    () => av.conciergeAvailableTo('b@x.com')));
ok('an empty list lets nobody in',
  withEnv({ CONCIERGE_ACCOUNT_LIVE: 'off', CONCIERGE_TEST_ACCOUNTS: '' },
    () => !av.conciergeAvailableTo('a@x.com')));
ok('and no email at all is never allowed in',
  withEnv({ CONCIERGE_ACCOUNT_LIVE: 'off', CONCIERGE_TEST_ACCOUNTS: 'a@x.com' },
    () => !av.conciergeAvailableTo(null)));
ok('the message promises no launch date',
  !/\b(soon|shortly|next week|days?|weeks?)\b/i.test(av.CONCIERGE_NOT_AVAILABLE));

/* THE PUBLIC WIDGET'S FRONT DOOR.
 *
 * Added 2026-08-02 after the audit found the endpoint answering the whole
 * internet while the widget was switched off. These checks exist so that can
 * never quietly become true again. */
console.log('\n  WHO MAY REACH THE PUBLIC WIDGET\n');

ok('the public widget is closed when nothing is set',
  withEnv({ NEXT_PUBLIC_SUPPORT_WIDGET: undefined }, () => !av.publicWidgetOpen()));
ok('closed when it is explicitly off',
  withEnv({ NEXT_PUBLIC_SUPPORT_WIDGET: 'off' }, () => !av.publicWidgetOpen()));
ok('closed when the value is misspelled',
  withEnv({ NEXT_PUBLIC_SUPPORT_WIDGET: 'true' }, () => !av.publicWidgetOpen()));
ok('open only on exactly "on"',
  withEnv({ NEXT_PUBLIC_SUPPORT_WIDGET: 'on' }, () => av.publicWidgetOpen()));
ok('a stray space or capital does not lock it shut',
  withEnv({ NEXT_PUBLIC_SUPPORT_WIDGET: ' ON ' }, () => av.publicWidgetOpen()));

const widgetRoute = readFileSync(new URL('../src/app/api/support/chat/route.ts', import.meta.url), 'utf8');
const accountRoute = readFileSync(new URL('../src/app/api/account/concierge/route.ts', import.meta.url), 'utf8');
const serviceClient = readFileSync(new URL('../src/lib/concierge/service.ts', import.meta.url), 'utf8');
const availabilitySource = readFileSync(new URL('../src/lib/concierge/availability.ts', import.meta.url), 'utf8');
const availabilityCode = availabilitySource
  .replace(/\/\/[^\n]*/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

ok('the endpoint reads the same flag the page reads, so the two cannot disagree',
  /publicWidgetOpen\(\)/.test(widgetRoute));
/* Kieran's decision 4 (2026-08-02): no chat bubble anywhere on the public
 * site, full stop. SiteChrome must not mount SupportWidget at all. */
ok('the public bubble is not mounted at all (Kieran\'s decision 4, 2026-08-02)',
  !/SupportWidget/.test(
    readFileSync(new URL('../src/components/SiteChrome.tsx', import.meta.url), 'utf8')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')));

/* STAGE 5: BOTH ROUTES ARE THIN DOORS ONTO THE ONE SERVICE.
 *
 * The day one of these fails is the day a route has grown behaviour of its
 * own again, which is exactly the disease the merge cured. */
console.log('\n  BOTH SURFACES CALL THE ONE HOSTED SERVICE\n');

ok('the public route calls the service, not an engine of its own',
  /askConciergeService\(/.test(widgetRoute) && !/from '@\/lib\/support\/engine'/.test(widgetRoute));
ok('the account route calls the service, not an engine of its own',
  /askConciergeService\(/.test(accountRoute) && !/from '@\/lib\/concierge\/engine'/.test(accountRoute));
/* The session must be built from the VERIFIED customer the route resolved from
 * the cookie, never from anything the message carried. Written as two claims
 * rather than one shape, because the shape changed on 2026-08-05 when staff
 * gained a way in and the session became conditional. What must stay true is
 * that a customer id only ever comes from `customer`, and never from the body. */
ok('the account route passes the VERIFIED session, never anything from the message',
  /customerId:\s*customer\.id/.test(accountRoute)
  && !/customerId:\s*(?:body|b)/.test(accountRoute));
/* STAFF TURNS (2026-08-05). An admin with no customer account of their own may
 * use the assistant. The safety property is that their turn carries NO session,
 * so the hosted service never switches on the order toolset: there is no
 * customer to scope it to, so it cannot be scoped to the wrong one. */
ok('a staff turn carries no customer session at all',
  /session:\s*customer\s*\?/.test(accountRoute)
  && /:\s*undefined,?\s*orderCount/.test(accountRoute));
ok('a staff turn is still metered, under a name of its own',
  /staffActor\(\)/.test(accountRoute));
/* Comments stripped first: the file explains at length WHY the browser-readable
 * hint cookie is not the signal, and naming it in prose must not read as using it. */
ok('the admin door is the real admin cookie, never the browser-readable staff hint',
  /wg_admin_session/.test(availabilityCode) && !/wg_ui_session/.test(availabilityCode));
ok('the admin check fails closed when no admin secret is configured',
  /if\s*\(!expected\)\s*return false/.test(availabilitySource));
ok('the public route names its caller by a hashed IP for the limits',
  /ipActor\(/.test(widgetRoute));
ok('the account route names its caller by customer id for the limits',
  /customerActor\(customer\.id\)/.test(accountRoute));
ok('both routes put the reported charges on the one cost ledger',
  /recordServiceCharges\(r, 'widget'\)/.test(widgetRoute)
  && /recordServiceCharges\(r, 'account'\)/.test(accountRoute));
ok('the ledger write uses the audited cost module, not sums of its own',
  /from '..\/costs\/record'/.test(serviceClient)
  && /recordConciergeTurn\(/.test(serviceClient) && /recordEmbedding\(/.test(serviceClient));
ok('the service client authenticates with the service secret',
  /CONCIERGE_SERVICE_SECRET/.test(serviceClient));
ok('a ledger failure can never fail a customer\'s turn',
  /never throws and never blocks/i.test(serviceClient) || /console\.error\('\[concierge\/service\] ledger write failed/.test(serviceClient));
ok('the GDPR self-service erase stayed with the website',
  /export async function DELETE/.test(accountRoute));
ok('no engine copies remain anywhere in this app',
  !/screenTurnForHandover|checkOutput\(|INJECTION_GUARD/.test(widgetRoute + accountRoute + serviceClient));

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.\n`);
process.exit(failed ? 1 : 0);
