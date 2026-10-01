// Proves the paid-order Beauty Card lifecycle against a deliberately empty,
// dedicated database. It will never read DATABASE_URL or a local .env file.
//
// Setup (one time): create a separate database named windsor_beauty_loyalty_test
// with no customer or order data. Then run:
//   $env:WB_GLOW_CARD_TEST_DATABASE_URL = 'postgresql://.../windsor_beauty_loyalty_test?...'
//   $env:WB_GLOW_CARD_TEST_CONFIRM = 'ERASE_TEST_DATABASE'
//   npm run test:glow-card-lifecycle
//
// The test drops and recreates that database's public schema in a finally
// block. The exact database name and confirmation phrase are intentional
// safety rails: this script is never a substitute for a production test.
const REQUIRED_DATABASE = 'windsor_beauty_loyalty_test';
const url = process.env.WB_GLOW_CARD_TEST_DATABASE_URL;

if (!url || process.env.WB_GLOW_CARD_TEST_CONFIRM !== 'ERASE_TEST_DATABASE') {
  console.error('\nRefusing to run. Set WB_GLOW_CARD_TEST_DATABASE_URL and WB_GLOW_CARD_TEST_CONFIRM=ERASE_TEST_DATABASE.\n');
  process.exit(1);
}

let parsed;
try { parsed = new URL(url); } catch {
  console.error('\nRefusing to run. WB_GLOW_CARD_TEST_DATABASE_URL is not a valid database URL.\n');
  process.exit(1);
}
if (decodeURIComponent(parsed.pathname.replace(/^\//, '')) !== REQUIRED_DATABASE) {
  console.error(`\nRefusing to run. This lifecycle test only accepts the dedicated database named ${REQUIRED_DATABASE}.\n`);
  process.exit(1);
}

const { neon } = await import('@neondatabase/serverless');
const sql = neon(url);
const [database] = await sql`SELECT current_database() AS name`;
if (String(database?.name) !== REQUIRED_DATABASE) {
  console.error(`\nRefusing to run. Server reported database ${String(database?.name)} instead of ${REQUIRED_DATABASE}.\n`);
  process.exit(1);
}

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
`;
if (tables.length) {
  console.error('\nRefusing to run. The dedicated test database is not empty. Nothing was changed.\n');
  process.exit(1);
}

// The app reads these at module-load time, so they must be set before imports.
process.env.DATABASE_URL = url;
process.env.WB_GLOW_CARD_LOYALTY_ENABLED = 'true';

const { ensureSchema } = await import('../src/lib/db/schema.ts');
const {
  awardGlowCardOrderPoint,
  claimGlowCardReward,
  getGlowCardSummary,
} = await import('../src/lib/glowCardLoyalty.ts');

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ok       ${name}`);
  } else {
    failed++;
    console.error(`  FAILED   ${name}\n             expected ${JSON.stringify(expected)}\n             got      ${JSON.stringify(actual)}`);
  }
}

async function customer(label) {
  const rows = await sql`
    INSERT INTO customers (email, password_hash, first_name, last_name, email_verified)
    VALUES (${`${label}@example.test`}, 'test-only', ${label}, 'Member', true)
    RETURNING id
  `;
  return Number(rows[0].id);
}

async function paidOrder(customerId, sequence, options = {}) {
  const {
    subtotal = 30,
    signedIn = true,
    status = 'awaiting_dispatch',
  } = options;
  const rows = await sql`
    INSERT INTO orders (
      order_number, customer_id, email, customer_name, items, subtotal,
      shipping_label, shipping_cost, total, status, shipping_address,
      account_link, payment_confirmed_at
    ) VALUES (
      ${`WB-LOYALTY-${customerId}-${sequence}`}, ${customerId},
      ${`member-${customerId}@example.test`}, 'Test Member',
      ${JSON.stringify([])}::jsonb, ${subtotal}, 'Test delivery', 0, ${subtotal},
      ${status}, '1 Test Street', ${signedIn ? 'signed_in' : 'guest'}, now()
    ) RETURNING *
  `;
  return rows[0];
}

try {
  await ensureSchema();

  const ordinary = await customer('ordinary');
  const underThirty = await awardGlowCardOrderPoint(await paidOrder(ordinary, 1, { subtotal: 29.99 }));
  check('an order below £30 does not earn a point', underThirty.earnedPoint, false);
  check('a below-£30 order explains why', underThirty.reason, 'below_minimum');

  const guest = await awardGlowCardOrderPoint(await paidOrder(ordinary, 2, { signedIn: false }));
  check('a guest order does not earn a point', guest.earnedPoint, false);
  check('a guest order explains why', guest.reason, 'not_signed_in');

  for (let number = 3; number <= 7; number++) {
    const result = await awardGlowCardOrderPoint(await paidOrder(ordinary, number));
    check(`qualifying signed-in order ${number - 2} earns one point`, result.earnedPoint, true);
  }
  let card = await getGlowCardSummary(ordinary);
  check('five points unlock the £10 reward', [card.points, card.cycle, card.rewards.map(r => [r.milestone, r.status])], [5, 1, [[5, 'ready']]]);

  const [sameOrder] = await sql`SELECT * FROM orders WHERE order_number = ${`WB-LOYALTY-${ordinary}-7`}`;
  const duplicate = await awardGlowCardOrderPoint(sameOrder);
  check('a retried payment event cannot duplicate an order point', duplicate.earnedPoint, false);
  check('a retried payment event reports already processed', duplicate.reason, 'already_processed');

  const tenReward = await claimGlowCardReward(ordinary, 5);
  check('the £10 reward can be claimed', Boolean(tenReward?.code), true);
  card = await getGlowCardSummary(ordinary);
  check('claiming £10 keeps the same five-point card', [card.points, card.cycle], [5, 1]);

  for (let number = 8; number <= 12; number++) await awardGlowCardOrderPoint(await paidOrder(ordinary, number));
  card = await getGlowCardSummary(ordinary);
  check('ten points unlock the £20 reward without losing £10 history', [card.points, card.rewards.map(r => [r.milestone, r.status])], [10, [[5, 'claimed'], [10, 'ready']]]);
  const twentyReward = await claimGlowCardReward(ordinary, 10);
  check('the £20 reward can be claimed', Boolean(twentyReward?.code), true);
  card = await getGlowCardSummary(ordinary);
  check('claiming £20 also keeps the same card', [card.points, card.cycle], [10, 1]);

  for (let number = 13; number <= 17; number++) await awardGlowCardOrderPoint(await paidOrder(ordinary, number));
  card = await getGlowCardSummary(ordinary);
  check('fifteen points unlock the £30 reward', [card.points, card.rewards.map(r => [r.milestone, r.status])], [15, [[5, 'claimed'], [10, 'claimed'], [15, 'ready']]]);
  const topReward = await claimGlowCardReward(ordinary, 15);
  check('the £30 reward can be claimed', [Boolean(topReward?.code), topReward?.reset], [true, true]);
  card = await getGlowCardSummary(ordinary);
  check('claiming £30 starts a fresh zero-point card', [card.points, card.cycle], [0, 2]);

  const carry = await customer('carry');
  for (let number = 1; number <= 15; number++) await awardGlowCardOrderPoint(await paidOrder(carry, number));
  const carryTop = await claimGlowCardReward(carry, 15);
  check('a top reward can reset a card while lower rewards remain unclaimed', carryTop?.reset, true);
  let carryCard = await getGlowCardSummary(carry);
  check('unclaimed £10 and £20 rewards remain visible after the reset', carryCard.carriedRewards.map(r => [r.cycle, r.milestone, r.status]), [[1, 5, 'ready'], [1, 10, 'ready']]);
  const carriedTen = await claimGlowCardReward(carry, 5, 1);
  check('a saved £10 reward can still be claimed from its earlier card', [Boolean(carriedTen?.code), carriedTen?.reset], [true, false]);
  carryCard = await getGlowCardSummary(carry);
  check('claiming a saved reward leaves the new card untouched', [carryCard.points, carryCard.cycle, carryCard.carriedRewards.map(r => [r.milestone, r.status])], [0, 2, [[5, 'claimed'], [10, 'ready']]]);

  const referrer = await customer('referrer');
  const referred = await customer('referred');
  for (let number = 1; number <= 4; number++) await awardGlowCardOrderPoint(await paidOrder(referrer, number));
  await sql`INSERT INTO member_referrals (referrer_id, referred_id) VALUES (${referrer}, ${referred})`;
  const referralResult = await awardGlowCardOrderPoint(await paidOrder(referred, 1));
  const [referrerCard, referredCard] = await Promise.all([getGlowCardSummary(referrer), getGlowCardSummary(referred)]);
  check('a referred member gets their normal first-order point and their referral bonus', [referralResult.earnedPoint, referredCard.points], [true, 2]);
  check('the referrer gets one separate referral bonus', referrerCard.points, 5);
  check('a referral-earned threshold is returned for the celebration email', referralResult.newlyUnlockedMilestones, [{ customerId: referrer, milestone: 5 }]);

  const race = await customer('race');
  for (let number = 1; number <= 14; number++) await awardGlowCardOrderPoint(await paidOrder(race, number));
  const [raceOne, raceTwo] = await Promise.all([
    awardGlowCardOrderPoint(await paidOrder(race, 15)),
    awardGlowCardOrderPoint(await paidOrder(race, 16)),
  ]);
  const raceCard = await getGlowCardSummary(race);
  const [eventCount] = await sql`
    SELECT count(*)::int AS count FROM glow_card_events
    WHERE customer_id = ${race} AND cycle_number = 1 AND points_delta = 1
  `;
  check('top-of-card concurrent payments do not create more point events than the visible balance', Number(eventCount.count), raceCard.points);
  check('top-of-card concurrent payments do not both report an earned point', [raceOne.earnedPoint, raceTwo.earnedPoint].filter(Boolean).length, 1);
} catch (error) {
  failed++;
  console.error('\n  FAILED   lifecycle test threw unexpectedly');
  console.error(error);
} finally {
  // This is intentionally destructive, but only after the exact-name and
  // explicit-confirmation checks above. It leaves the dedicated test database
  // empty, ready for the next run, and cannot reach Windsor Beauty production.
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`CREATE SCHEMA public`;
}

console.log(`\nBeauty Card lifecycle: ${passed} passed, ${failed} failed.\n`);
process.exitCode = failed ? 1 : 0;
