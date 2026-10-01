import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { commissionPence, wholePoundsAvailable, poundsToWholePence, affiliateProductPaidPence } from '../src/lib/affiliateMoney.ts';
import { isRafPersonalDiscountCode } from '../src/lib/discountCodes.ts';

assert.equal(isRafPersonalDiscountCode('raf5-test'), true, 'personal-code detection must ignore case');
assert.equal(isRafPersonalDiscountCode('RAF'), false, 'the invitation code is not a customer discount');
assert.equal(isRafPersonalDiscountCode('RAF-CREDIT-TEST'), false, 'shop credit must retain its own rules');

assert.equal(commissionPence(950, 500), 48, '47.5p must round upward to 48p');
assert.equal(commissionPence(949, 500), 47, '47.45p must round normally to 47p');
assert.equal(commissionPence(3000, 500), 150, '5% of £30 must be £1.50');
assert.equal(wholePoundsAvailable(1954), 1900, '£19.54 must release only £19');
assert.equal(wholePoundsAvailable(54), 0, '54p must remain in the balance');
assert.equal(poundsToWholePence(19), 1900, 'whole pounds must convert to pence');
assert.equal(poundsToWholePence(19.5), null, 'part pounds must be refused');
assert.equal(affiliateProductPaidPence(40, 2), 3800, 'delivery must not enter the commission base');

const checkout = await readFile(new URL('../src/app/api/checkout/place-order/route.ts', import.meta.url), 'utf8');
assert.match(checkout, /affiliateCodeOwnedBy/, 'checkout must enforce personal code ownership');
assert.ok(checkout.indexOf('affiliateCodeOwnedBy(effectiveDiscountCode!') < checkout.indexOf('listActivePromotionRules()'), 'ownership must be checked before suppressing automatic offers');
assert.match(checkout, /isAffiliateCode \? \[\] : \(await listActivePromotionRules\(\)\)/, 'personal Raf codes must not stack with automatic offers');
assert.match(checkout, /isAffiliateCode \? null : await getActivePercentagePromotion\(\)/, 'personal Raf codes must not stack with site sales');
assert.match(checkout, /recordAffiliateOrder/, 'checkout must snapshot affiliate attribution');
assert.match(checkout, /subtotalAfterSale/, 'commission must use the product subtotal after promotions');

const registration = await readFile(new URL('../src/app/api/account/register/route.ts', import.meta.url), 'utf8');
assert.match(registration, /findAffiliateInvitation\(suppliedAffiliateInvite, email\)/, 'registration must validate the private invitation against the recipient email');
assert.match(registration, /createAffiliateReferralFromInvitation\(suppliedAffiliateInvite, email, customer\.id\)/, 'registration must consume the invitation and issue a personal code');
assert.match(registration, /reportAutomationFailure\('affiliate_referral',[\s\S]*alertAdmin: true/, 'a failed Raf attribution must alert staff for repair');
assert.doesNotMatch(registration, /findAffiliateByReferralCode/, 'a public affiliate name or code must never create a referral');
assert.match(registration, /if \(suppliedReferralCode && suppliedAffiliateInvite\)/, 'member and affiliate invitations must not combine');

const affiliates = await readFile(new URL('../src/lib/affiliates.ts', import.meta.url), 'utf8');
assert.match(affiliates, /WB_AFFILIATE_CUSTOMER_ACCESS_ENABLED/, 'production customer access must require a separate launch switch');
assert.match(affiliates, /randomBytes\(32\)\.toString\('hex'\)/, 'invitation tokens must be unpredictable');
assert.match(affiliates, /createHash\('sha256'\)/, 'the database must store an invitation hash, not its secret link');
assert.match(affiliates, /i\.recipient_email = \$\{email\}/, 'invitation redemption must require the named email');
assert.match(affiliates, /i\.redeemed_at IS NULL AND i\.expires_at > now\(\)/, 'invitation redemption must be one-use and time-limited');
assert.match(affiliates, /AND \$\{productPaidPence\} > 0/, 'free product orders must not create a zero-pence commission entry');
assert.match(affiliates, /WHERE ap\.customer_id = \$\{customerId\} AND ap\.status = 'active'/, 'a paused affiliate must lose dashboard access without a deployment');
assert.match(affiliates, /ON CONFLICT \(dedupe_key\) DO NOTHING/, 'commission ledger must be retry-safe');
assert.match(affiliates, /status = 'requested'/, 'payout approval must only act on a new request');
assert.match(affiliates, /b\.available >= b\.amount_pence/, 'payout approval must recheck the available balance');

const schema = await readFile(new URL('../src/lib/db/schema-parts/affiliates.ts', import.meta.url), 'utf8');
assert.match(schema, /amount_pence % 100 = 0/, 'database must enforce whole-pound payout requests');
assert.match(schema, /UNIQUE REFERENCES orders\(id\)/, 'one order can have only one affiliate attribution');
assert.match(schema, /dedupe_key TEXT NOT NULL UNIQUE/, 'ledger writes must be idempotent');
assert.match(schema, /CHECK \(affiliate_customer_id <> referred_customer_id\)/, 'an affiliate must never refer themselves');
assert.match(schema, /CREATE TABLE IF NOT EXISTS affiliate_invitations/, 'private invitations must have a database table');
assert.match(schema, /token_hash TEXT NOT NULL UNIQUE/, 'the invitation secret must never be stored directly');
assert.match(affiliates, /i\.created_at > now\(\) - interval '7 days'/, 'a recipient must not be emailed repeatedly within seven days');
assert.match(schema, /affiliate_invitations_recipient_requests/, 'recipient request lookups must stay indexed');
assert.match(schema, /delivery_status/, 'requested email delivery must be auditable');

const account = await readFile(new URL('../src/app/account/page.tsx', import.meta.url), 'utf8');
assert.match(account, /Your (?:Glow|Beauty) Card/, 'an affiliate must keep the normal member Beauty Card');
assert.match(account, /orders\.map\(order =>/, 'an affiliate must keep normal personal order history');
assert.match(account, /data\.affiliateAvailable/, 'the affiliate panel must be added to, not replace, the member account');

const accountApi = await readFile(new URL('../src/app/api/account/affiliate/route.ts', import.meta.url), 'utf8');
assert.match(accountApi, /if \(!affiliatesEnabled\(\)\)/, 'customer dashboard and payout API must close while testing');
const accountMe = await readFile(new URL('../src/app/api/account/me/route.ts', import.meta.url), 'utf8');
assert.match(accountMe, /affiliatesEnabled\(\) && await isAffiliateCustomer/, 'normal member account must hide the affiliate link while testing');
const accountLayout = await readFile(new URL('../src/app/account/affiliate/layout.tsx', import.meta.url), 'utf8');
assert.match(accountLayout, /if \(!affiliatesEnabled\(\)\) notFound\(\)/, 'the affiliate page must not open while testing');
const registrationForm = await readFile(new URL('../src/components/MemberRegistrationForm.tsx', import.meta.url), 'utf8');
assert.match(registrationForm, /NEXT_PUBLIC_WB_AFFILIATE_CUSTOMER_ACCESS_ENABLED/, 'the public signup choice must also require launch approval');
assert.match(registrationForm, /affiliateInvite/, 'signup must recognise the private link');
assert.match(registrationForm, /\.filter\(source => source\.value !== 'RAF affiliate' \|\| Boolean\(form\.affiliateInvite\)\)/, 'the public signup list must not offer Raf');
// commission only on orders paid with the customer's own verified RAF code.
assert.match(checkout, /if \(affiliatesEnabled\(\) && customer && isAffiliateCode\)/, 'commission must be recorded only for an order using the customer\'s own Raf code');
assert.match(affiliates, /acc\.customer_id = \$\{params\.customerId\}\s+AND upper\(acc\.code\) = upper\(/, 'the commission record must re-check that the Raf code belongs to the customer');

const affiliateDashboard = await readFile(new URL('../src/app/account/affiliate/page.tsx', import.meta.url), 'utf8');
assert.match(affiliateDashboard, /My orders and Beauty Card/, 'RAF must have a clear route back to personal shopping');
assert.match(affiliateDashboard, /Your own purchases,\s*deliveries and Beauty Card (?:stay|remain) in your normal member account/, 'RAF must be told that personal activity remains separate');
const invitePanel = await readFile(new URL('../src/components/affiliate/InviteSomeone.tsx', import.meta.url), 'utf8');
assert.match(affiliateDashboard, /<InviteSomeone /, 'Raf must have the invitation panel on his dashboard');
assert.match(invitePanel, /Get my request page/, 'Raf must be able to retrieve his reusable request page');
assert.match(invitePanel, /Send invitation/, 'Raf must be able to type an email and press Send');
assert.match(invitePanel, /whatsappShareUrl\(result\.shareMessage\)/, 'every invitation must offer WhatsApp from Raf’s own phone');
assert.match(invitePanel, /smsShareUrl\(result\.shareMessage\)/, 'every invitation must offer a text message from Raf’s own phone');
assert.match(invitePanel, /did not go through\. Send the link from your phone instead/, 'a failed email must point Raf to the phone fallback');
assert.match(invitePanel, /Send a new link/, 'Raf must be able to replace a link that did not arrive');

const inviteApi = await readFile(new URL('../src/app/api/account/affiliate/invitations/route.ts', import.meta.url), 'utf8');
assert.match(inviteApi, /if \(!affiliatesEnabled\(\)\)/, 'Raf-sent invitations must stay behind the launch switch');
assert.match(inviteApi, /getActiveAffiliateName\(customer\.id\)/, 'only an active affiliate can send invitations');
assert.match(inviteApi, /findMarketingContactByEmail/, 'an unsubscribed address must never be emailed by an invitation');
assert.match(inviteApi, /shareMessage/, 'the link must always come back for the phone fallback');
assert.doesNotMatch(inviteApi, /upsertMarketingContact/, 'an invitation must not opt someone into marketing');

const requestApi = await readFile(new URL('../src/app/api/affiliate-request/route.ts', import.meta.url), 'utf8');
assert.match(requestApi, /if \(!affiliatesEnabled\(\)\)/, 'recipient-requested email must stay behind launch switch');
assert.match(requestApi, /findAffiliateRequestProfile\(key\)/, 'only a valid private page can trigger an email');
assert.match(requestApi, /findMarketingContactByEmail\(email\)/, 'known unsubscribed recipients must be suppressed');
assert.match(requestApi, /createAffiliateInvitation\(Number\(profile.customer_id\), email, 'recipient'\)/, 'the recipient must request their own invitation');
assert.match(requestApi, /sendAffiliateInvitationEmail\(\{[\s\S]*requested: true/, 'the requested email must use the approved sender');
assert.doesNotMatch(requestApi, /upsertMarketingContact/, 'a request must not opt someone into marketing');
const requestPage = await readFile(new URL('../src/app/raf-invite/[key]/page.tsx', import.meta.url), 'utf8');
assert.match(requestPage, /robots: \{ index: false, follow: false \}/, 'request page must not be indexed');
const staffApi = await readFile(new URL('../src/app/api/admin/affiliates/route.ts', import.meta.url), 'utf8');
assert.match(staffApi, /body\?\.action === 'request_link'/, 'staff must be able to retrieve the page');
assert.match(staffApi, /body\?\.action === 'create_invitation'/, 'staff must be able to create a one-person fallback link');
const requestEmail = await readFile(new URL('../src/lib/affiliateEmail.ts', import.meta.url), 'utf8');
assert.match(requestEmail, /Windsor Beauty <info@windsorbeauty.co.uk>/, 'requested invitations must come from the verified information address');
assert.match(requestEmail, /You have not been added to our marketing list/, 'the email must distinguish the request from marketing consent');
assert.match(requestEmail, /idempotencyKey: `affiliate-invitation-\$\{params\.invitationId\}`/, 'a retried invitation must never arrive twice');
assert.match(affiliates, /AFFILIATE_DAILY_INVITATIONS = 20/, 'Raf-sent invitations must have a daily limit');
assert.match(affiliates, /UPDATE affiliate_invitations SET expires_at = now\(\)/, 'a new link must retire the older one for the same person');
const outboundHook = await readFile(new URL('../src/app/api/webhooks/resend-outbound/route.ts', import.meta.url), 'utf8');
assert.match(outboundHook, /markInvitationEmailFailedByProvider/, 'a bounced invitation must show as not arrived');

const { affiliateInvitationState } = await import('../src/lib/affiliates.ts');
const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();
assert.equal(affiliateInvitationState({ redeemed_at: past, expires_at: past }), 'joined', 'joining wins over everything');
assert.equal(affiliateInvitationState({ replaced: true, expires_at: past, delivery_status: 'sent' }), 'replaced');
assert.equal(affiliateInvitationState({ expires_at: past, delivery_status: 'sent' }), 'expired');
assert.equal(affiliateInvitationState({ expires_at: future, delivery_status: 'sent', provider_status: 'bounced' }), 'email_failed', 'a bounce reported later must show');
assert.equal(affiliateInvitationState({ expires_at: future, delivery_status: 'failed' }), 'email_failed');
assert.equal(affiliateInvitationState({ expires_at: future, delivery_status: 'sent', provider_status: 'delivered' }), 'delivered');
assert.equal(affiliateInvitationState({ expires_at: future, delivery_status: 'sent' }), 'sent');
assert.equal(affiliateInvitationState({ expires_at: future, delivery_status: 'not_requested' }), 'link_only');

const { affiliateInvitationEmail } = await import('../src/lib/affiliateEmail.ts');
const sample = affiliateInvitationEmail({ email: 'a@b.com', affiliateName: 'Raf', link: 'https://www.windsorbeauty.co.uk/account/register?affiliateInvite=x', expiresAt: future, requested: false });
assert.match(sample.subject, /Raf has invited you to Windsor Beauty/);
assert.match(sample.html, /Welcome to Windsor Beauty/);
assert.match(sample.html, /Courtesy of Raf/);
assert.match(sample.html, /10% off your first order/);
assert.match(sample.text, /Join with this email address: a@b\.com/);
assert.doesNotMatch(sample.html + sample.text, /—/, 'no em dashes in the email');

const loyalty = await readFile(new URL('../src/lib/glowCardLoyalty.ts', import.meta.url), 'utf8');
assert.match(loyalty, /referrer_is_affiliate \? Promise\.resolve\(null\) : addPoint/, 'an affiliate must not earn member referral stamps');
assert.match(loyalty, /source: 'qualifying_order'/, 'Raf must retain normal personal shopping stamps');
const checkoutPage = await readFile(new URL('../src/app/checkout/page.tsx', import.meta.url), 'utf8');
assert.match(checkoutPage, /rafCodeApplied \? 0 : promoPreview/, 'the checkout preview must hide promotions with a personal Raf code');

console.log('Affiliate acceptance checks passed: money, ownership, personal shopping, Beauty Card, attribution, refunds and payout safety.');
