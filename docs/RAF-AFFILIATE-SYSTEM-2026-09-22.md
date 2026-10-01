# RAF affiliate system

> **Purpose:** Record the approved RAF affiliate rules, release and proof.
> **Status:** RAF PROFILE ACTIVE. SAMUEL DEMO ACCOUNT REMOVED. LATER LOCAL BASKET/CHECKOUT EDITS NOT YET RELEASED.
> **Related projects:** Windsor Glow member accounts, checkout, admin and future BRIAN reporting.
> **Dependencies:** Windsor Glow customer 83, an approved database setup, Resend and staff-authorised payments.
> **Key decisions:** Windsor Glow owns the financial record. Raf has reviewed the scheme and his affiliate profile is active. BRIAN may later show summaries but must not own balances or approve payments.
> **Next steps:** Finish checking and release the later basket/checkout changes separately. Do not describe an unmade real purchase or payout as proven.
> **Last updated:** 2026-09-23

## What is built

- Raf Christian's existing customer record is customer 83 and his affiliate code is `RAF`. His live affiliate profile is **active**.
- Raf creates a private, seven-day invitation link for one named email address. It can be used once. Ordinary visitors cannot select Raf at sign-up. The link is kept as a hash in the database, so the secret is not stored there.
- Raf can also retrieve a reusable private request page. He shares that page with someone he knows; the recipient enters their own email and asks Windsor Glow to send one private invitation from `info@windsorglow.com` on Raf's behalf. The emailed link is still one-person, one-use and valid for seven days. The request does not subscribe the recipient to marketing. Repeat requests from the same address are blocked; the page is capped at 20 new requests a day and 50 open invitations. Staff can retrieve the same page or create a one-person fallback link without sending an email.
- Staff can see whether a requested email was accepted by the email provider, failed, or is still pending. Provider acceptance is not proof of delivery. A failed send is not automatically retried; staff can help manually after checking with the person. Known marketing unsubscribes are suppressed, and a marketing-list lookup failure prevents a send.
- After the invited customer signs up and verifies their email, the welcome email contains both the normal 10% first-order code and their own 5% Raf code. The account page also shows the Raf code. Only one code can be used per order.
- The customer receives a private reusable 5% code, normally valid for about six months. It requires at least £30 of products. Delivery does not count.
- The personal 5% code is account-bound and cannot be passed to another customer. It is used on its own, not alongside BOGO, automatic sales or other shop discounts. Other codes keep their existing rules.
- Raf earns 5% of the product amount the referred customer actually pays after discounts, **only on orders where they use their own personal Raf code**. Changed by Samuel on 27 September 2026: the 10% welcome code is for everyone, so an order using it earns Raf nothing, and neither does an order with no code or any other code. Checkout records commission only after it has confirmed the Raf code belongs to that customer, and the commission record checks the code again. Delivery never earns commission. The customer cannot put the Raf code on top of the welcome offer.
- A half penny rounds upward. For example, 47.5p becomes 48p.
- Refunded and cancelled paid orders reverse their commission once. Repeated payment or refund messages cannot duplicate a ledger entry.
- Only complete pounds can be requested. For example, £19.54 releases £19 and leaves 54p.
- A cash request moves through request, staff approval, payment waiting and paid. Staff must record the bank or Fena reference before marking it paid.
- Shop credit creates a private one-use code only after staff approval.
- Staff can choose six months, nine months or a custom lifespan for new customer codes.
- Customers receive one reminder when a personal code is within 30 days of expiry.
- Marketing permission remains optional and unticked. The affiliate account and discount still work if the customer declines marketing.
- RAF remains a normal Windsor Glow member as well as an affiliate. His own orders, deliveries and Glow Card remain in his normal account and are not replaced by the affiliate dashboard.
- Raf's own eligible signed-in orders can earn his normal Glow Card stamps under the same rules as any other member. He does not earn referral stamps for customers he brings in, even if an older member invitation link was used. Those customers still earn stamps on their own qualifying shopping.
- RAF cannot refer himself, use a referred customer's private code as his own or earn affiliate commission from his own purchases. His personal shopping and affiliate earnings stay separate.

## 26 September 2026: Raf sends invitations himself (built locally on branch `samuel-video-task`, not yet live)

Samuel is taking this over to polish (see `../../SAMUEL-VIDEO-TASK/00-START-HERE.md`). He has full authority over the affiliate system and the Windsor Glow videos.

Kieran decided on 26 September that Raf types the person's email into his dashboard and presses Send. This came from a voice note asking for one simple step for Raf and one email that does everything for the customer.

- The email comes from `info@windsorglow.com`. It is titled "Welcome to Windsor Glow", says it is courtesy of Raf, gives three numbered steps and a button, and states the 10% first-order and 5% personal code offers. It is the customer's whole guide. The request-page email uses the same design with a different opening line.
- If the first send fails, it is tried once more after about a second and a half, using the same Resend idempotency key, so it is never delivered twice.
- Whatever happens to the email, Raf immediately gets the same link with WhatsApp, Text message and Copy message buttons, with the message already written. It is sent from his own phone. WhatsApp uses its public `wa.me` share link, so Raf picks the contact himself.
- "People you have invited" shows each invitation as Email sent, Email arrived, Email did not arrive, Link only, Joined, Link expired or Replaced by a newer link. A bounce reported later by Resend changes the status to Email did not arrive. "Send a new link" makes a fresh link and retires the old one, so each person only ever has one working link.
- Raf can create 20 invitations a day. Staff help is not counted towards that limit. Addresses that unsubscribed from Windsor Glow email are never emailed; Raf sees the same "did not go through" message and can use his phone instead. People who asked on his request page appear to him with a masked address.
- The staff page lists every invitation with its status and links to "See the email Raf sends", which shows the real email with an example address. Nothing is sent from that preview.
- No database change was needed.
- Proof: the acceptance checks pass; the lifecycle test passed 37 of 37 (14 new) on a throwaway local PostgreSQL, not the Neon test branch; TypeScript, lint and the production build pass; the panel was checked at phone and desktop widths with no sideways scroll. Not deployed.

### Full demo journey with real emails, 26 September 2026

The whole site ran locally against a throwaway PostgreSQL (a test-only translator answered the Neon driver's web requests; no site code was changed for it). Real emails went through Resend to Kieran's own inbox (`kieranowenproducer+rafdemo@gmail.com`, then `+rafdemo2`) and were read back through the Gmail connection. Every one landed in the main inbox, not spam.

A demo Raf pressed Send, the invitation arrived from `info@windsorglow.com`, its link opened sign-up with Raf locked in, the customer joined (marketing ticked, both confirmations, Terms read to the end), the confirmation email arrived, verifying worked, and the welcome email carried both the 10% code and the personal `RAF5-` code. Raf's list then showed the person as Joined.

The run found three things, fixed the same day and proven by a second run:
- Sign-up now opens with an "Invited by Raf" welcome, and fills in and locks the invited email (the invitation checker returns the address; the link is a one-person secret, so only its holder sees it).
- A Raf customer's account now opens with one "Invited by Raf" panel showing the 10% first-order code (until used) and the personal Raf code, each with a Copy button. Before, the 10% code was only in an email.
- Stated plainly: the personal Raf code is not permanent. It lasts for the staff-set duration (currently 183 days). Staff can choose six months, nine months or a custom length up to ten years.

Screenshots are in `../../SAMUEL-VIDEO-TASK/raf-invite-guide-2026-09-26/journey/`. A customer video filmed from this flow is in `../../SAMUEL-VIDEO-TASK/raf-customer-join-video-2026-09-26/`.

## Screens

- Raf: `/account/affiliate`
- Staff: `/admin/affiliates`
- Local RAF preview: `/affiliate-preview`
- Local staff preview: `/affiliate-admin-preview`

The two preview routes exist only during local development. Production returns a not-found page. Preview actions change fixture data on screen only and cannot email, pay, edit a customer or touch the database.

## Current production cleanup, 23 September 2026

Kieran authorised permanent deletion of Samuel's demo account (`samueldean1987@gmail.com`) after the live experiment. The account had no orders, commission, payouts or affiliate profile. The test referral, redeemed invitation, unused `RAF5` customer code, site-visit and interaction records, and pending test security case were deleted in one guarded database transaction. A separate read-back found no customer account for that email and no remaining Raf test referral or invitation. Raf Christian remains the sole affiliate profile, active, with zero referrals after cleanup. Samuel can register again with the same email.

Samuel's older pre-launch marketing subscription and welcome-offer records predate this demo and were preserved. This was not a reset of his historical mailing-list or offer status. The deletion is permanent at the application level; this document records what was removed and why.

## Current testing boundary, 22 September 2026

Kieran asked that RAF not see or use the scheme before they speak. Staff can still inspect `/admin/affiliates`. The live profile was paused through staff controls and had zero referred customers, personal codes and payout requests at that point. A new customer-access gate defaults closed in production and hides the RAF sign-up choice and member-account link, refuses the RAF dashboard and payout API, rejects personal RAF discounts, and skips expiry emails. The old `WG_AFFILIATES_ENABLED` switches are no longer sufficient to open the customer side. A later launch requires Kieran's approval, restoring the profile and deliberately configuring both new customer-access switches.

The latest recipient-requested-email demo is in `../../raf-affiliate-walkthrough-video/out/Windsor Glow - Raf recipient-requested email (local demo).mp4`, with a clearly titled copy in Downloads. It shows the local preview and explains the private page, one-person link, staff fallback, welcome-code commission and separate RAF5 discount. Earlier recordings are archived and outdated. No recording proves that Raf has seen the panel, an email was delivered, or a payout occurred.

## September 23 release checkpoint: Raf account still paused

Kieran approved the controlled release on 23 September. The private-invitation and recipient-requested-email code is deployed, and its new database fields are installed. The two production customer-access switches are on, but Raf's live profile remains **paused**, so he cannot create invitations or use his dashboard. The request email uses `info@windsorglow.com`. Local test links use the local app; production links use the Windsor Glow domain. Do not unpause Raf or send a real customer invitation until the remaining checks and Raf's review are complete.

### Full isolated local demo, 23 September 2026

- The dedicated Neon test branch/database was checked before use. The isolated affiliate lifecycle passed 20 of 20 checks, including email-bound one-use invitations, welcome-offer commission, duplicate payment/refund protection, staff payout approval and code ownership. This test did not use the live database.
- An invented Raf test account opened the real local affiliate panel, produced the reusable request page and a separate copy-only one-person link. The recipient requested one email at their own address. Resend recorded the message as delivered from `info@windsorglow.com` with the local signup link. Kieran forwarded all three received messages from the controlled test inbox to the connected Gmail account, independently confirming inbox arrival and readable content.
- The emailed invitation opened the local signup form with Raf preselected. The invited test member declined marketing, created an account, received and used the verification link, then received one welcome email containing a unique 10% first-order code and a separate account-bound `RAF5` code. The member account displayed the Raf code. Raf's panel and the staff panel each displayed one referred customer and zero earnings before any purchase.
- The used invitation then returned `valid: false`. Staff recovered the same request page and created a one-person fallback link without sending another email. An unauthenticated staff API request returned 401.
- The live discount-validation route, against the isolated test data, accepted the member's 5% code and 10% welcome code individually, rejected the 5% code below £30, and rejected that member's code when used from Raf's account. The code permits only one entered code per order; the isolated lifecycle also proved 5% commission on the discounted product amount of a welcome-code order.
- With customer access set closed in a production-mode local server, the request page, invitation API and customer affiliate API refused access, and ordinary public signup did not offer Raf as a referral choice. The affiliate page rendered not-found content, although Next.js streaming returned HTTP 200 for that page; the API refused access with HTTP 404.
- Focused affiliate acceptance tests, TypeScript, focused lint and the full production build passed. The test did not submit a real payment, place a live customer order, deliver a real payout, or enable Raf's live profile. The forwarded messages preserve Gmail's rendering but are not a pixel-by-pixel review of every email client.
- A separate read-only schema check confirmed the local production connection points to the Neon `main` branch compute. At that time it lacked the invitation table and new request-page field. On 23 September, the additive migration was rehearsed on a fresh clone of the live database, applied to the live database, and read back successfully. Raf remained paused. The isolated lifecycle then passed 22 of 22 checks on a new disposable database. These results do not yet prove a deployed customer flow.

After deployment, the live registration page no longer showed the RAF choice. The RAF account API and RAF page returned not-found responses, including when a nonempty test session cookie was supplied. The signed-in staff affiliate page and its API still loaded; the live profile read back as paused, with zero referrals and payout requests. No real customer login or payout was used for these checks.

The isolated lifecycle passed 23 of 23 checks after a further safeguard: pausing an affiliate now closes their dashboard immediately. Focused affiliate acceptance tests, TypeScript, lint and the production build passed. Commits `302de4d` and `e2196d6` were pushed and deployed. With the new production switches on and Raf still paused, the live invitation checker returned `valid: false` for a made-up token, the unauthenticated affiliate account API returned 401, the fake invitation page returned 404, and public registration still offered no Raf choice. The signed-in staff panel showed Raf paused, zero referrals, zero orders and £0 balance; its invitation fallback controls were disabled. The live database showed zero active affiliate profiles and one paused profile. No errors appeared in the production error log during the check. This proves the closed state, not an actual live invitation, email delivery, signup, paid order or payout.

## Payment boundary

The existing Fena shop connection collects customer payments. It has not been proven to support automatic outgoing affiliate payments from this account. The first release therefore prepares and tracks RAF's payment, but a person authorises the bank or Fena payment and records its reference. Do not describe outbound Fena payments as automatic until Fena confirms the supported account and API route.

## Original release proof, before customer access was paused

- Affiliate acceptance checks passed.
- The full affiliate lifecycle passed 18 of 18 checks on a dedicated empty Neon database branch. The test cleaned its data afterwards and never used production.
- The acceptance checks prove RAF keeps his normal order history and Glow Card while self-referral is blocked.
- The optional social-profile flow passed its focused data checks.
- Focused lint passed.
- TypeScript passed.
- Full production build passed with 123 pages.
- RAF dashboard and staff control opened in fresh browser tabs with no page error or console error.
- The RAF sign-up link selected RAF and filled the invitation code correctly.
- The phone layout was checked and repaired so the page has no sideways overflow. The referral table scrolls inside its own panel.
- Preview payout request and staff approval interactions worked without touching real data.
- The live schema migration completed successfully.
- RAF's live profile is active with a 183-day code duration.
- Both production release switches are enabled.
- Commit `b4ff9e4` was pushed to GitHub and deployed through Vercel.
- Live public pages returned successfully. Private account, staff and scheduled-task routes refused unauthorised requests as expected.
- The live registration page showed the correct optional social-profile field and RAF invitation-code field on a phone-sized browser.
- Production error logs showed no release errors during the verification window.

## Release boundaries

- No email was sent during release verification.
- No payout or customer payment was made.
- Production-only preview pages remain unavailable.
- The broader certificate check still reports four older certificate-data issues. They concern missing or duplicate human evidence and are not caused by this affiliate release. Never guess those certificate details.
