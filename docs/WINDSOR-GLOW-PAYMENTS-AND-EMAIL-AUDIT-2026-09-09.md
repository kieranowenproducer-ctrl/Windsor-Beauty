# Windsor Glow Payments and Email Audit

> **Purpose:** Explain why unpaid orders appear in the Windsor Glow admin panel, establish whether the current cases point to a shop, payment, or email fault, and set out the safest improvements.
> **Status:** CORE SAFETY CHANGES LIVE; AUTOMATIC REMINDER COMPLETE LOCALLY; RESEND DELIVERY WEBHOOK WAITING FOR ACCOUNT ACCESS
> **Related projects:** Windsor Glow.
> **Dependencies:** Live Windsor Glow order records, the Windsor Glow checkout and email code, Resend delivery history, and Fena's published guidance.
> **Key decisions:** An order marked Awaiting Payment is an unpaid reservation, not a sale. Never dispatch it or mark it paid without checking that the money arrived. The current screenshot's awaiting orders used Pay by Bank, not PayPal. Keep the Windsor Beauty PayPal branding because it is an approved sister-company association.
> **Next steps:** Deploy the automatic 36-hour reminder after Kieran separately approves it. Configure the signed Resend delivery webhooks if account access is recovered.
> **Last updated:** 2026-09-09

## Executive answer

Nothing in the evidence suggests Windsor Glow is treating unpaid orders as paid or dispatching goods without money. The shop creates an order record first and then sends the customer to payment. Until the payment provider confirms the money, the order is an **unpaid reservation** and appears as **Awaiting Payment**. Unpaid orders are excluded from revenue and do not enter the dispatch queue.^1

The three Awaiting Payment orders visible in the supplied screenshot all selected **Pay by Bank through Fena**, not PayPal. Each has a Fena payment reference, which proves the website successfully created the payment session. No payment-success message has reached the website for those three orders. The most likely explanation is that the customer left the bank journey, declined it, or has not finished it. That is not evidence of a broken email because the normal Fena checkout does not depend on a Windsor Glow payment email.^2

PayPal is not causing the current pile. There were four PayPal orders in the 30-day live-data sample. All four progressed to dispatched or delivered. Resend history was available for the four recent PayPal payment emails and marked every one **delivered**, meaning the recipient's mail server accepted it.^3 Delivery does not prove that a person noticed the message or that it avoided every spam tab, but it does rule out those four messages being lost before reaching the recipient's mail system.^4

There are, however, genuine weaknesses worth fixing:

1. The dashboard says Awaiting Payment means “PayPal orders pending confirmation.” That is factually wrong. The live awaiting orders are Fena orders, and this wording is the main reason the panel is confusing.^5
2. A PayPal email can fail to send while the checkout still tells the customer “We have emailed” and clears the basket. The response contains the failure result, but the page ignores it.^6
3. The PayPal payment email says **Windsor Beauty**, not Windsor Glow. Kieran confirmed this is intentional because Windsor Beauty is an associated sister company. It remains unchanged.^7
4. The PayPal email promises that the reservation will be released after 48 hours, but there is no automatic 48-hour expiry job. Checkout stock is reduced before payment, so an abandoned order can reserve stock indefinitely until somebody cancels or deletes it.^8
5. Windsor Glow has no outbound-email delivery webhook or durable delivery history of its own. It records some send failures, but it cannot reliably answer “delivered, bounced, delayed, or suppressed” for every transactional email from the admin panel.^9

## What the panel is showing

The words **order** and **sale** currently mean different things in this system:

| Stage | What happened | Money confirmed? | Safe to dispatch? |
|---|---|---:|---:|
| Order recorded | Customer submitted their basket and details | No | No |
| Awaiting Payment | A payment session or PayPal instruction step was created | No | No |
| Paid / Ready to Dispatch | Fena confirmed payment, or staff verified PayPal and marked it paid | Yes | Yes |
| Dispatched / Delivered | Fulfilment progressed | Yes | Already in fulfilment |

The order is written before payment so the shop has the items, amount, customer details, stock reservation, discount use, and reference needed to create and match the payment. This is a normal two-stage payment design. Fena's own integration guidance also describes orders being created before payment status later updates.^10

The important protection is whether an unpaid record can masquerade as revenue or reach dispatch. In Windsor Glow it cannot through the normal flow:

- Revenue only sums paid and later statuses. Pending and Awaiting Payment are excluded.^1
- The dispatch-ready list starts only after payment confirmation.^11
- Fena can move an order forward only through its authenticated webhook. The customer-facing return page merely reads the status and cannot mark an order paid.^12
- PayPal requires staff to check the PayPal account and press Mark as Paid. That action is guarded against repeat clicks and sends the confirmation only after the status changes.^13

## The orders in the screenshot

The live database was read on 2026-09-09 without changing any records.

| Order | Panel status | Payment route | What the live record proves | Finding |
|---|---|---|---|---|
| WG-CGDHYG, £205 | Awaiting Payment | Fena Pay by Bank | Fena reference exists; no paid confirmation recorded | Payment journey was created but not completed or not confirmed |
| WG-D3BE82, £137 | Awaiting Payment | Fena Pay by Bank | Fena reference exists; no paid confirmation recorded | Payment journey was created but not completed or not confirmed |
| WG-7BURN5, £226 | Awaiting Payment | Fena Pay by Bank | Fena reference exists; no paid confirmation recorded | Payment journey was created but not completed or not confirmed |
| WG-5JFY74, £336 | Ready to Dispatch | Fena Pay by Bank | Fena reference exists and payment was confirmed | Paid successfully |

The red £336 line is not evidence that the paid £336 order is broken. Fena reported a bank attempt that did not complete, and the site recorded that event. The order itself subsequently or separately received a valid paid confirmation and moved to Ready to Dispatch. The payment webhook deliberately treats declined or cancelled attempts as customer events rather than system faults.^14

One additional Fena order, WG-T7TT4L for £175, was also Awaiting Payment in the live snapshot but fell outside the visible portion of the supplied screenshot. The four outstanding records total £743. They are not counted as revenue.

## Thirty-day payment picture

The live 30-day sample contained 46 orders:

| Payment route | Orders | Completed payment states | Still awaiting payment | Reading |
|---|---:|---:|---:|---|
| Fena Pay by Bank | 41 | 37 | 4 | 90.2% completed; 9.8% currently awaiting |
| PayPal | 4 | 4 | 0 | All progressed to dispatch or delivery |
| Cash | 1 | 1 | 0 | Delivered |

This is a snapshot, not a final conversion rate. The four current Fena orders are recent and may still complete. It nevertheless shows that PayPal email loss is not the explanation for the current awaiting-payment count.

## Email audit

### Fena orders

The normal Fena checkout flow works by redirecting the customer from Windsor Glow to the Fena bank-payment page. Windsor Glow passes the customer email address to Fena as part of creating that payment, but the Windsor Glow code does not send its own “finish your Fena payment” email at this stage.^2 The Windsor Glow order-confirmation email is sent only after Fena's authenticated notification confirms payment.^15

Therefore, the three screenshot orders are not waiting because a Windsor Glow PayPal email failed. They did not choose PayPal.

### PayPal orders

For PayPal, Windsor Glow first records the order, then sends a separate email containing the PayPal link. Recent evidence is reassuring:

- The four most recent accessible PayPal payment-link records were all marked delivered by Resend.
- The matching orders all progressed to dispatched or delivered.
- There were no unpaid PayPal orders in the 30-day live-data sample.

The wording and fault handling are not good enough, though. The customer sees “We have emailed” whenever the PayPal endpoint returns `success: true`. The endpoint returns that even if Resend reports `emailSent: false`, and the checkout never checks the `emailSent` field.^6 This creates a real stranded-customer risk even though it did not appear in the recent sample.

The email itself is also misbranded. Its sender, subject, body, footer, PayPal item name, and contact address say Windsor Beauty. A Windsor Glow customer could reasonably regard it as unrelated or suspicious.^7 That mismatch should be treated as a deliverability and trust issue, not a cosmetic issue.

### What “delivered” proves

Resend defines delivered as accepted by the recipient's mail server.^4 It does not prove that the customer opened it, saw it in the primary inbox, or clicked the payment button. Windsor Glow currently has no saved email event history for these distinctions. The main Windsor Glow API key is also send-only, so this audit could not retrieve the main account's confirmation-email history through the API. The absence of recorded send failures supports that the application accepted those sends, but it is not proof of inbox delivery.

## Root causes

### 1. Misleading admin wording

The dashboard collapses two payment routes into one status, then labels the whole status as PayPal. The database and order details know the payment method, but the headline description does not. This turns a normal Fena abandonment into an apparent PayPal or email fault.

### 2. Order creation and stock reservation happen too early to remain indefinite

The checkout writes the order and reduces stock before the customer pays.^8 This prevents overselling while a payment is in progress, but it needs an expiry counterpart. The current PayPal message says 48 hours; the scheduler contains no unpaid-order expiry task.^16 An order that never pays can therefore keep stock unavailable indefinitely.

### 3. Weak recovery after an abandoned Fena payment

The customer is redirected to Fena and the basket is cleared once the payment URL is created.^17 The order stores the Fena payment reference, not the reusable URL. Ordinary checkout orders have no clear admin action to resend or regenerate that bank-payment link. A customer who closes the bank page may have no easy route back.

### 4. PayPal is manual and email-dependent

PayPal has no API or payment webhook in this codebase. Staff must check PayPal and mark the order paid.^18 That is workable at the current volume, but it means a paid PayPal order can remain Awaiting Payment if nobody performs the manual reconciliation. Recent orders were handled correctly, so this is an operational risk rather than the cause of the present issue.

### 5. Email evidence is incomplete

The application catches and records several confirmation-email failures, which is good. It does not record the Resend message ID, and it has no outbound webhook for delivered, delayed, bounced, complained, failed, or suppressed events. Resend supports all of those events.^9 Without them, the admin panel cannot answer email-delivery questions from its own records.

## Recommended solution

### Priority 1: Make the panel tell the truth

Change the dashboard explanation from **“PayPal orders pending confirmation”** to **“Orders placed, payment not yet confirmed.”** Show **Pay by Bank** or **PayPal** beside every Awaiting Payment entry. Add a plain-English detail:

- Pay by Bank: “The customer reached the payment step, but Fena has not confirmed the money.”
- PayPal: “A payment link was sent. Check PayPal before marking this paid.”

This is the smallest change and would have answered the present question immediately.

### Priority 2: Stop silent PayPal email failures

If the PayPal email returns `emailSent: false`, the endpoint should report failure, the checkout must keep the basket, and the page must show the direct PayPal link as a fallback. The failure should also be written to System Health against the order. Do not tell the customer an email was sent unless the email service accepted it.

Keep the approved Windsor Beauty branding and sender unchanged. It is the associated sister-company PayPal route.

### Priority 3: Give unpaid orders a real recovery path

Save or safely regenerate the Fena link. Let staff resend a “finish payment” message from the order. Give the customer a secure resume-payment page. A gentle reminder after a short delay can recover genuine abandonments without staff manually chasing every row.

### Priority 4: Implement the promised expiry

After the agreed window, move genuinely unpaid orders to Expired or Cancelled, return their reserved stock, and make the state visible in the admin record. The PayPal email currently promises 48 hours, so either implement 48 hours or change the promise before release. Discount restoration needs a deliberate rule so a limited code cannot be abused through repeated abandoned orders.

### Priority 5: Record outbound email outcomes

Add a verified Resend webhook for sent, delivered, delayed, bounced, failed, complained, and suppressed events. Store the Resend message ID and latest delivery state against the order/email. Then the order panel can say, for example, “payment email delivered to Hotmail at 21:32” or “bounced, resend to corrected address.”

### Priority 6: Automate PayPal confirmation when worthwhile

Replace the manual PayPal send-money link with a proper PayPal checkout integration and verified webhook when the volume justifies it. That would let PayPal mark an order paid automatically, as Fena already does. It is not urgent for the current symptom because recent PayPal orders completed successfully.

## What to do with the current orders

1. Do not dispatch the four Awaiting Payment orders and do not count them as money owed or received.
2. Check the Fena dashboard or bank account before taking any manual action. If no money is present, leave them unpaid.
3. If a customer contacts Windsor Glow, give them a fresh secure payment route rather than marking the order paid.
4. If the orders remain unpaid after the chosen reservation period, cancel them and restore the stock. The current site does not do that automatically.
5. Treat WG-5JFY74 as paid and ready for fulfilment. Its red event is historical information about an unsuccessful attempt, not an instruction to reverse the successful order.

## Overall assessment

**Payment safety: broadly sound.** The system separates unpaid from paid, excludes unpaid orders from revenue, requires authenticated Fena confirmation, and guards the manual paid action.

**Current incident: mostly normal customer abandonment.** The screenshot's awaiting orders are Fena orders with created payment sessions and no successful confirmation. There is no evidence that PayPal email loss caused them.

**Admin clarity: needs repair.** The PayPal-only label on a mixed status is factually wrong and is driving understandable confusion.

**Email assurance: partly sound, not fully observable.** Recent PayPal payment emails were delivered, but the application can falsely claim a failed PayPal email was sent and cannot show reliable outbound delivery states for every email.

**Order recovery and expiry: needs repair.** Unpaid reservations reduce stock, have no strong resume-payment path, and do not automatically expire despite the 48-hour promise.

## Sources

1. Windsor Glow, [`src/lib/db.ts`, store statistics and revenue status rules](../src/lib/db.ts#L1169-L1223), accessed 2026-09-09.
2. Windsor Glow, [`src/lib/fena.ts`, Fena payment creation and redirect payload](../src/lib/fena.ts#L42-L171), accessed 2026-09-09.
3. Windsor Glow live Neon order snapshot and private Resend sent-email history, read-only checks performed 2026-09-09. Customer addresses were not copied into this report.
4. Resend, [“email.delivered”](https://resend.com/docs/webhooks/emails/delivered), accessed 2026-09-09.
5. Windsor Glow, [`src/app/admin/dashboard/page.tsx`, Awaiting Payment description](../src/app/admin/dashboard/page.tsx#L681-L687), accessed 2026-09-09.
6. Windsor Glow, [`src/app/api/payment/paypal/instructions/route.ts`, response includes but does not enforce `emailSent`](../src/app/api/payment/paypal/instructions/route.ts#L51-L105); [`src/app/checkout/page.tsx`, checkout checks only `success`](../src/app/checkout/page.tsx#L364-L386), accessed 2026-09-09.
7. Windsor Glow, [`src/lib/paypalInstructionsEmail.ts`, Windsor Beauty sender and message branding](../src/lib/paypalInstructionsEmail.ts#L6-L16), [`message body and send`](../src/lib/paypalInstructionsEmail.ts#L231-L273), accessed 2026-09-09.
8. Windsor Glow, [`src/app/api/checkout/place-order/route.ts`, stock reduction before payment](../src/app/api/checkout/place-order/route.ts#L424-L430); [`src/lib/paypalInstructionsEmail.ts`, 48-hour promise](../src/lib/paypalInstructionsEmail.ts#L217-L220), accessed 2026-09-09.
9. Resend, [“Event Types”](https://resend.com/docs/webhooks/event-types), accessed 2026-09-09; Windsor Glow outbound webhook search, performed 2026-09-09. The only Resend webhook in the project handles inbound replies.
10. Fena, [“How to install Fena's Shopify Payments App”](https://help.fena.co/support/solutions/articles/101000528164-how-to-install-the-fena-s-shopify-payments-app-fena-business-toolkit), modified 2024-12-26, accessed 2026-09-09.
11. Windsor Glow, [`src/lib/db.ts`, payment-confirmed statuses and dispatch readiness](../src/lib/db.ts#L1009-L1015), accessed 2026-09-09.
12. Windsor Glow, [`src/app/api/payment/fena/confirm/route.ts`, read-only confirmation route](../src/app/api/payment/fena/confirm/route.ts#L7-L58), accessed 2026-09-09.
13. Windsor Glow, [`src/lib/markOrderPaidManually.ts`, guarded manual payment flow](../src/lib/markOrderPaidManually.ts#L23-L124), accessed 2026-09-09.
14. Windsor Glow, [`src/app/api/webhooks/fena/route.ts`, incomplete-payment event handling](../src/app/api/webhooks/fena/route.ts#L120-L157), accessed 2026-09-09.
15. Windsor Glow, [`src/app/api/webhooks/fena/route.ts`, paid confirmation and email flow](../src/app/api/webhooks/fena/route.ts#L215-L377), accessed 2026-09-09.
16. Windsor Glow, [`vercel.json`, scheduled jobs](../vercel.json#L1-L28), accessed 2026-09-09.
17. Windsor Glow, [`src/app/checkout/page.tsx`, basket clear and Fena redirect](../src/app/checkout/page.tsx#L389-L407), accessed 2026-09-09.
18. Windsor Glow, [`src/app/admin/orders/OrderActions.tsx`, manual PayPal confirmation`](../src/app/admin/orders/OrderActions.tsx#L67-L87), accessed 2026-09-09.
