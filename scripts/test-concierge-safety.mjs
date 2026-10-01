// Deterministic safety tests for what is LEFT of the concierge in this app
// after Stage 5 of the assistant merge (2026-08-03). No API calls, no
// database, no cost.
//
//   node scripts/test-concierge-safety.mjs
//
// The engine — and with it the medical screen, the output filter, the
// whitelist and the governor arithmetic — now lives in the hosted concierge
// service (ai-support-agent). Its full 118-check safety suite moved with it:
// ai-support-agent/evals/safety.mjs. What this file still proves is the part
// the WEBSITE still owns: the data-minimisation helpers its integration
// endpoint uses, and the handover address rules.

import { redact, redactForModel } from '../src/lib/concierge/redact.ts';

let pass = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass += 1;
  else failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
console.log('\n1. Redaction — secrets and card numbers never reach storage or a model\n');
// ---------------------------------------------------------------------------

const REDACT = [
  ['My card is 4111 1111 1111 1111', '4111'],
  ['card 4111111111111111 expires soon', '4111111111111111'],
  ['my password is hunter2please', 'hunter2please'],
  ['sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345', 'sk-ant'],
  ['cvv 123 and sort code 12-34-56', '12-34-56'],
];
for (const [input, secret] of REDACT) {
  const out = redact(input);
  check(`redact removes "${secret}"`, !out.includes(secret), `got: ${out}`);
}
check('redaction keeps an order number intact', redact('order WG-ABC123 please').includes('WG-ABC123'));
check('redaction keeps an ordinary sentence intact', redact('Where is my order?') === 'Where is my order?');

// ---------------------------------------------------------------------------
console.log('2. The model never receives a delivery address\n');
// ---------------------------------------------------------------------------
// Used by /api/admin/tasks/agent-customer-orders, which is where the hosted
// service gets a signed-in customer's orders: the masking happens HERE, where
// the data lives, so a full address never leaves this app at all.

check(
  'model context drops the full address',
  !redactForModel({ line1: '12 High Street', city: 'Windsor', postcode: 'SL4 1AA' }).includes('12 High Street'),
);
check(
  'the postcode is masked to the district',
  redactForModel({ line1: '12 High Street', city: 'Windsor', postcode: 'SL4 1AA' }).includes('SL4 ***'),
);
check(
  'a legacy single-string address is masked the same way',
  !redactForModel('12 High Street, Windsor, SL4 1AA').includes('12 High Street'),
);
check('no address at all is said plainly', redactForModel(null) === 'no delivery address on file');

// ---------------------------------------------------------------------------
console.log('3. The handover address is the one Kieran chose\n');
// ---------------------------------------------------------------------------
// Kieran chose sales@windsorglow.com on 3 August 2026. The enquiry write stays
// in this app (the agent-enquiry endpoint); the notification email is sent by
// the hosted service from its tenant config, which the service's own safety
// suite pins to the same address.

const { CONCIERGE_HANDOVER_TO, SUPPORT_REPLY_TO } = await import('../src/lib/email/supportAddress.ts');
check('handovers go to the address Kieran chose',
  CONCIERGE_HANDOVER_TO === 'sales@windsorglow.com', CONCIERGE_HANDOVER_TO);
check('the handover address is NOT tied to the transactional reply-to',
  CONCIERGE_HANDOVER_TO !== SUPPORT_REPLY_TO,
  `both are ${CONCIERGE_HANDOVER_TO}, so changing one would move the other`);

// ---------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${'='.repeat(60)}`);
if (failures.length) {
  console.log(`FAILED ${failures.length} of ${total}\n`);
  for (const f of failures) console.log(`  x ${f}`);
  process.exit(1);
}
console.log(`PASSED ${pass}/${total}`);
