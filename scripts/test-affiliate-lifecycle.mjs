// Destructive only inside the exact, dedicated database named below. The script
// never reads DATABASE_URL or a local env file and clears the test schema when done.
const REQUIRED_DATABASE = 'windsor_glow_affiliate_test';
const url = process.env.WG_AFFILIATE_TEST_DATABASE_URL;

if (!url || process.env.WG_AFFILIATE_TEST_CONFIRM !== 'ERASE_TEST_DATABASE') {
  console.error('\nRefusing to run. Set WG_AFFILIATE_TEST_DATABASE_URL and WG_AFFILIATE_TEST_CONFIRM=ERASE_TEST_DATABASE.\n');
  process.exit(1);
}

let parsed;
try { parsed = new URL(url); } catch {
  console.error('\nRefusing to run. WG_AFFILIATE_TEST_DATABASE_URL is not a valid database URL.\n');
  process.exit(1);
}
if (decodeURIComponent(parsed.pathname.replace(/^\//, '')) !== REQUIRED_DATABASE) {
  console.error(`\nRefusing to run. This lifecycle test accepts only ${REQUIRED_DATABASE}.\n`);
  process.exit(1);
}

const { neon } = await import('@neondatabase/serverless');
const sql = neon(url);
const [database] = await sql`SELECT current_database() AS name`;
if (String(database?.name) !== REQUIRED_DATABASE) {
  console.error(`\nRefusing to run. Server reported ${String(database?.name)} instead of ${REQUIRED_DATABASE}.\n`);
  process.exit(1);
}

const existingTables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
`;
if (existingTables.length) {
  console.error('\nRefusing to run because the dedicated affiliate database is not empty.\n');
  process.exit(1);
}

process.env.DATABASE_URL = url;
process.env.WG_AFFILIATES_ENABLED = 'true';

const { ensureSchema } = await import('../src/lib/db/schema.ts');
const {
  affiliateCodeOwnedBy,
  affiliateCreditOwnedBy,
  createAffiliateInvitation,
  createAffiliateProfile,
  createAffiliateReferralFromInvitation,
  createPayoutRequest,
  findAffiliateInvitation,
  getAffiliateDashboard,
  handlePayoutRequest,
  markInvitationDelivery,
  markInvitationEmailFailedByProvider,
  recordAffiliateOrder,
  setAffiliateStatus,
  syncAffiliateOrderStatus,
} = await import('../src/lib/affiliates.ts');

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`  ok       ${name}`);
  } else {
    failed += 1;
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

async function order(customerId, sequence) {
  const rows = await sql`
    INSERT INTO orders (
      order_number, customer_id, email, customer_name, items, subtotal,
      shipping_label, shipping_cost, total, status, shipping_address, account_link
    ) VALUES (
      ${`WG-AFFILIATE-${sequence}`}, ${customerId}, ${`member-${customerId}@example.test`},
      'Test Member', '[]'::jsonb, 40, 'Test delivery', 2, 40,
      'pending', '1 Test Street', 'signed_in'
    ) RETURNING *
  `;
  return rows[0];
}

async function ledgerTotal(affiliateCustomerId) {
  const [row] = await sql`
    SELECT COALESCE(SUM(amount_pence), 0)::INTEGER AS total
    FROM affiliate_ledger WHERE affiliate_customer_id = ${affiliateCustomerId}
  `;
  return Number(row.total);
}

try {
  await ensureSchema();

  const raf = await customer('raf');
  await createAffiliateProfile({ customerId: raf, displayName: 'RAF Christian', referralCode: 'RAF-CHRISTIAN', durationDays: 183 });
  const invite = await createAffiliateInvitation(raf, 'referred@example.test');
  check('a private invitation is tied to its recipient email', Boolean(await findAffiliateInvitation(invite.token, 'referred@example.test')), true);
  check('a forwarded invitation cannot be claimed with another email', await findAffiliateInvitation(invite.token, 'stranger@example.test'), null);
  const requested = await createAffiliateInvitation(raf, 'requested@example.test', 'recipient');
  let repeatBlocked = false;
  try { await createAffiliateInvitation(raf, 'requested@example.test', 'recipient'); } catch { repeatBlocked = true; }
  check('a second email request is blocked for seven days', repeatBlocked, true);
  await sql`UPDATE affiliate_invitations SET created_at = now() - interval '8 days', expires_at = now() - interval '1 day' WHERE id = ${requested.id}`;
  const renewed = await createAffiliateInvitation(raf, 'requested@example.test', 'recipient');
  check('a new invitation is possible after the first expires', Boolean(renewed?.token), true);
  const referred = await customer('referred');

  const referralCode = await createAffiliateReferralFromInvitation(invite.token, 'referred@example.test', referred);
  check('a referred member receives one personal code', Boolean(referralCode?.code), true);
  check('the personal code belongs to the referred member', await affiliateCodeOwnedBy(String(referralCode.code), referred), true);
  check('RAF cannot use the referred member code', await affiliateCodeOwnedBy(String(referralCode.code), raf), false);
  check('the invitation is consumed exactly once', await findAffiliateInvitation(invite.token), null);
  check('the same invitation cannot be redeemed twice', await createAffiliateReferralFromInvitation(invite.token, 'referred@example.test', referred), null);

  const selfInvite = await createAffiliateInvitation(raf, 'self@example.test');
  check('RAF cannot refer himself', await createAffiliateReferralFromInvitation(selfInvite.token, 'self@example.test', raf), null);

  // Raf types an email into his dashboard and presses Send (26 September 2026).
  const stateOf = async id => (await getAffiliateDashboard(raf)).invitations.find(row => Number(row.id) === Number(id))?.state;
  const sentInvite = await createAffiliateInvitation(raf, 'phone@example.test', 'affiliate', { sendEmail: true });
  check('a Raf-sent invitation starts as sending', await stateOf(sentInvite.id), 'sending');
  await markInvitationDelivery(sentInvite.id, true, 'provider-test-1');
  check('an accepted send shows as email sent', await stateOf(sentInvite.id), 'sent');
  await sql`INSERT INTO customer_emails (direction, email, provider_id, delivery_status) VALUES ('sent', 'phone@example.test', 'provider-test-1', 'delivered')`;
  check('a delivery report shows as email arrived', await stateOf(sentInvite.id), 'delivered');
  check('a bounce report is matched to the invitation', await markInvitationEmailFailedByProvider('provider-test-1'), true);
  check('a bounced invitation shows as did not arrive', await stateOf(sentInvite.id), 'email_failed');
  const replacement = await createAffiliateInvitation(raf, 'phone@example.test', 'affiliate', { sendEmail: true });
  check('sending a new link retires the old one', await findAffiliateInvitation(sentInvite.token), null);
  check('the new link works for the same person', Boolean(await findAffiliateInvitation(replacement.token, 'phone@example.test')), true);
  check('the old invitation says it was replaced', await stateOf(sentInvite.id), 'replaced');
  await markInvitationDelivery(replacement.id, false, null);
  check('a failed send shows as did not arrive', await stateOf(replacement.id), 'email_failed');
  const linkOnly = await createAffiliateInvitation(raf, 'linkonly@example.test', 'affiliate', { sendEmail: false });
  check('a link-only invitation says no email was sent', await stateOf(linkOnly.id), 'link_only');
  check('a joined invitation says joined', await stateOf(invite.id), 'joined');
  const requestedRow = (await getAffiliateDashboard(raf)).invitations.find(row => Number(row.id) === Number(renewed.id));
  check('Raf sees only a masked address for someone who asked on his page', requestedRow?.recipient_email, 'r•••@example.test');
  const [{ today }] = await sql`SELECT COUNT(*)::INTEGER AS today FROM affiliate_invitations WHERE created_source = 'affiliate' AND affiliate_customer_id = ${raf}`;
  for (let n = today; n < 20; n += 1) await createAffiliateInvitation(raf, `daily-${n}@example.test`, 'affiliate', { sendEmail: true });
  let dailyLimitBlocked = false;
  try { await createAffiliateInvitation(raf, 'one-too-many@example.test', 'affiliate', { sendEmail: true }); } catch { dailyLimitBlocked = true; }
  check('Raf can send at most 20 invitations a day', dailyLimitBlocked, true);
  let staffStillWorks = true;
  try { await createAffiliateInvitation(raf, 'staff-help@example.test', 'staff'); } catch { staffStillWorks = false; }
  check('staff can still help after Raf reaches his daily limit', staffStillWorks, true);

  // Samuel, 27 Sep 2026: only an order paid with the customer's own RAF code earns. The 10%
  // welcome code is for everyone, so it earns nothing, and neither does an order with no code.
  const welcomeOrder = await order(referred, 11);
  check('a 10% welcome-code order earns Raf nothing', await recordAffiliateOrder({
    orderId: Number(welcomeOrder.id), customerId: referred, code: 'WELCOME-10', subtotalAfterSale: 40, discountAmount: 4,
  }), null);
  const noCodeOrder = await order(referred, 12);
  check('an order with no code earns Raf nothing', await recordAffiliateOrder({
    orderId: Number(noCodeOrder.id), customerId: referred, code: null, subtotalAfterSale: 40, discountAmount: 0,
  }), null);
  const strangerOrder = await order(referred, 13);
  check('an order with a RAF code that is not theirs earns Raf nothing', await recordAffiliateOrder({
    orderId: Number(strangerOrder.id), customerId: referred, code: 'RAF5-NOTTHEIRS', subtotalAfterSale: 40, discountAmount: 2,
  }), null);

  const firstOrder = await order(referred, 1);
  const firstAttribution = await recordAffiliateOrder({
    orderId: Number(firstOrder.id), customerId: referred, code: String(referralCode.code),
    subtotalAfterSale: 40, discountAmount: 4,
  });
  check('an order with their own RAF code earns 5% on the paid products', [Number(firstAttribution?.product_paid_pence), Number(firstAttribution?.commission_pence), firstAttribution?.code], [3600, 180, String(referralCode.code)]);
  check('one order cannot be attributed twice', await recordAffiliateOrder({ orderId: Number(firstOrder.id), customerId: referred, code: String(referralCode.code), subtotalAfterSale: 40, discountAmount: 2 }), null);

  await syncAffiliateOrderStatus(String(firstOrder.order_number), 'awaiting_dispatch');
  await syncAffiliateOrderStatus(String(firstOrder.order_number), 'awaiting_dispatch');
  check('payment earns commission exactly once', await ledgerTotal(raf), 180);
  await syncAffiliateOrderStatus(String(firstOrder.order_number), 'refunded');
  await syncAffiliateOrderStatus(String(firstOrder.order_number), 'refunded');
  check('refund reverses commission exactly once', await ledgerTotal(raf), 0);

  const secondOrder = await order(referred, 2);
  await recordAffiliateOrder({ orderId: Number(secondOrder.id), customerId: referred, code: String(referralCode.code), subtotalAfterSale: 30, discountAmount: 0 });
  await syncAffiliateOrderStatus(String(secondOrder.order_number), 'paid');
  const dashboard = await getAffiliateDashboard(raf);
  check('£1.50 leaves one whole pound available', [Number(dashboard?.profile.balance_pence), Number(dashboard?.profile.withdrawable_pence)], [150, 100]);

  const payout = await createPayoutRequest(raf, 100, 'cash');
  await handlePayoutRequest(Number(payout.id), 'approve', 'Approved in lifecycle test');
  let paidWithoutReferenceBlocked = false;
  try { await handlePayoutRequest(Number(payout.id), 'mark_paid'); } catch { paidWithoutReferenceBlocked = true; }
  check('cash cannot be marked paid without a reference', paidWithoutReferenceBlocked, true);
  await handlePayoutRequest(Number(payout.id), 'mark_paid', 'Sent', 'TEST-BANK-REFERENCE');
  const [paidPayout] = await sql`SELECT status, payment_reference FROM affiliate_payout_requests WHERE id = ${Number(payout.id)}`;
  check('staff approval and payment reference complete the cash payout', [paidPayout.status, paidPayout.payment_reference], ['paid', 'TEST-BANK-REFERENCE']);
  check('the cash payout is deducted once', await ledgerTotal(raf), 50);

  await setAffiliateStatus(raf, 'paused');
  check('pausing RAF closes his dashboard immediately', await getAffiliateDashboard(raf), null);
  check('pausing RAF disables customer codes', await affiliateCodeOwnedBy(String(referralCode.code), referred), false);
  await setAffiliateStatus(raf, 'active');
  check('resuming RAF restores an unexpired customer code', await affiliateCodeOwnedBy(String(referralCode.code), referred), true);

  const thirdOrder = await order(referred, 3);
  await recordAffiliateOrder({ orderId: Number(thirdOrder.id), customerId: referred, code: String(referralCode.code), subtotalAfterSale: 100, discountAmount: 0 });
  await syncAffiliateOrderStatus(String(thirdOrder.order_number), 'paid');
  const creditRequest = await createPayoutRequest(raf, 500, 'store_credit');
  await handlePayoutRequest(Number(creditRequest.id), 'approve', 'Approved store credit');
  const [credit] = await sql`SELECT status, payment_reference FROM affiliate_payout_requests WHERE id = ${Number(creditRequest.id)}`;
  check('approved shop credit becomes a paid one-use code', [credit.status, String(credit.payment_reference).startsWith('RAF-CREDIT-')], ['paid', true]);
  check('RAF owns the issued shop-credit code', await affiliateCreditOwnedBy(String(credit.payment_reference), raf), true);
} catch (error) {
  failed += 1;
  console.error('\n  FAILED   lifecycle test threw unexpectedly');
  console.error(error);
} finally {
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`CREATE SCHEMA public`;
}

console.log(`\nAffiliate lifecycle: ${passed} passed, ${failed} failed.\n`);
process.exitCode = failed ? 1 : 0;
