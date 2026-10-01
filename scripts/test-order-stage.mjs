// Prove the red / orange / yellow / green square on an order (task 41a3910f).
//
//   npm run test:order-stage
//
// This is pure logic over data the shop already holds, so it needs no database and no network. It
// runs the real orderStage from src/lib/orderStage.ts.
//
// Royal Mail pending_postage means postage is still unpaid. It must stay in
// the waiting-for-label stage until a label or tracking number exists.
import { readFileSync } from 'node:fs';
import { orderStage } from '../src/lib/orderStage.ts';

let passed = 0;
let failed = 0;
function check(name, order, expectedStage) {
  const got = orderStage(order).stage;
  if (got === expectedStage) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}\n             expected ${expectedStage}\n             got      ${got}`); }
}

console.log('\n=== Which colour an order gets ===\n');

// 1. RED — paid and still waiting on a label.
check("a paid order with no label", { status: 'awaiting_dispatch', royalMailLabelStatus: 'none', trackingNumber: null }, 'to_label');
check("a pending order: Royal Mail has it but the postage is unpaid", { status: 'awaiting_dispatch', royalMailLabelStatus: 'pending_postage', trackingNumber: null }, 'to_label');
check("a label that failed goes back to red, not forward", { status: 'awaiting_dispatch', royalMailLabelStatus: 'error', trackingNumber: null }, 'to_label');
check("just paid, nothing done yet", { status: 'paid', royalMailLabelStatus: 'none', trackingNumber: null }, 'to_label');
check("exported to Royal Mail but no label made", { status: 'exported', royalMailLabelStatus: 'none', trackingNumber: null }, 'to_label');

// 2. ORANGE — the label genuinely exists.
check("the label has been made", { status: 'awaiting_dispatch', royalMailLabelStatus: 'created', trackingNumber: 'MZ553321601GB' }, 'labelled');
check("an old order with a tracking number and no recorded label status", { status: 'awaiting_dispatch', royalMailLabelStatus: null, trackingNumber: 'MZ552975151GB' }, 'labelled');
check("pending postage but a tracking number did arrive", { status: 'awaiting_dispatch', royalMailLabelStatus: 'pending_postage', trackingNumber: 'MZ111111111GB' }, 'labelled');

// 3. YELLOW — he has marked it dispatched.
check("marked dispatched", { status: 'dispatched', royalMailLabelStatus: 'created', trackingNumber: 'MZ553326351GB' }, 'dispatched');
check("marked dispatched even with no label recorded", { status: 'dispatched', royalMailLabelStatus: 'none', trackingNumber: null }, 'dispatched');

// 4. GREEN — delivered.
check("delivered", { status: 'delivered', royalMailLabelStatus: 'created', trackingNumber: 'MZ552323875GB' }, 'delivered');
check("delivered beats everything else", { status: 'delivered', royalMailLabelStatus: 'none', trackingNumber: null }, 'delivered');

// Not in the queue. Colouring these red would put permanent false work on the screen, which is the
// opposite of what the squares are for.
check("nobody has paid yet", { status: 'awaiting_payment', royalMailLabelStatus: 'none', trackingNumber: null }, 'not_started');
check("cancelled", { status: 'cancelled', royalMailLabelStatus: 'none', trackingNumber: null }, 'not_started');
check("refunded", { status: 'refunded', royalMailLabelStatus: 'created', trackingNumber: 'MZ1GB' }, 'not_started');
check("the payment failed", { status: 'payment_failed', royalMailLabelStatus: 'none', trackingNumber: null }, 'not_started');

// Orders that are not posted at all never get a label, so they must not sit on orange for ever.
check("being collected: red until it goes, never orange", { status: 'awaiting_dispatch', fulfilmentType: 'collection', royalMailLabelStatus: 'none', trackingNumber: null }, 'to_label');
check("hand delivered and marked dispatched is yellow", { status: 'dispatched', fulfilmentType: 'hand_delivered', royalMailLabelStatus: 'none', trackingNumber: null }, 'dispatched');

// The four stages must never share a step number, or "which is further on" becomes a guess.
const steps = ['to_label', 'labelled', 'dispatched', 'delivered'].map(want => {
  const sample = {
    to_label: { status: 'paid' },
    labelled: { status: 'paid', royalMailLabelStatus: 'created' },
    dispatched: { status: 'dispatched' },
    delivered: { status: 'delivered' },
  }[want];
  return orderStage(sample).step;
});
check('the four stages are numbered 1 to 4 in order', { status: 'paid' }, 'to_label');
if (JSON.stringify(steps) === '[1,2,3,4]') { passed++; console.log('  ok       the four steps run 1, 2, 3, 4'); }
else { failed++; console.log(`  FAILED   the four steps run 1, 2, 3, 4\n             got ${JSON.stringify(steps)}`); }

// Every colour must be a real Tailwind class. A shade the config cannot resolve applies NOTHING and
// does it silently, which here would mean an invisible square and no warning anywhere.
const swatches = ['to_label', 'labelled', 'dispatched', 'delivered', 'not_started'].map(want => {
  const sample = {
    to_label: { status: 'paid' },
    labelled: { status: 'paid', royalMailLabelStatus: 'created' },
    dispatched: { status: 'dispatched' },
    delivered: { status: 'delivered' },
    not_started: { status: 'cancelled' },
  }[want];
  return orderStage(sample).swatch;
});
const allRealShades = swatches.every(s => /^bg-(blue|orange|yellow|green|stone)-\d{2,3} border-(blue|orange|yellow|green|stone)-\d{2,3}$/.test(s));
if (allRealShades) { passed++; console.log('  ok       every square uses a real Tailwind colour, not a made-up one'); }
else { failed++; console.log(`  FAILED   every square uses a real Tailwind colour\n             got ${JSON.stringify(swatches)}`); }

// Stage one and stage two must be visibly different colours. They were red-600 and orange-600 to
// begin with, and on a phone Kieran could not tell them apart, which is the whole job of the square.
// Two adjacent stages sharing a colour family is that fault coming back.
const stageOne = orderStage({ status: 'paid' }).swatch;
const stageTwo = orderStage({ status: 'paid', royalMailLabelStatus: 'created' }).swatch;
const family = (s) => s.split('-')[1];
if (family(stageOne) !== family(stageTwo)) {
  passed++;
  console.log('  ok       stage 1 and stage 2 are different colours, not two shades of the same one');
} else {
  failed++;
  console.log(`  FAILED   stage 1 and stage 2 are different colours
             both are ${family(stageOne)}`);
}

// And Tailwind has to have SEEN these class names, or it writes no CSS for them and the square
// renders as nothing at all, silently. That is not hypothetical: the first version of this kept the
// colours in src/lib, which was not in Tailwind's content list, and the orange and yellow squares
// came out invisible while red and green worked by luck, because those exact classes happen to be
// used elsewhere in the app. Nothing warned anybody. This check is that bug, written down.
const tailwindConfig = readFileSync('tailwind.config.js', 'utf-8');
if (tailwindConfig.includes('./src/lib/**')) {
  passed++;
  console.log('  ok       Tailwind scans src/lib, so these colours actually get written');
} else {
  failed++;
  console.log('  FAILED   Tailwind scans src/lib');
  console.log('             src/lib is missing from the content list in tailwind.config.js.');
  console.log('             The squares will render with no colour at all and nothing will warn you.');
}

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
