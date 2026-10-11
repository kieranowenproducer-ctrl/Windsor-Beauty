# Windsor Beauty customer interface audit, 11 October 2026

> **Purpose:** Record the customer visibility audit and safe UI repair.
> **Status:** Verified locally; release metadata is recorded in the workspace evidence supplement.
> **Related projects:** Windsor Beauty. Windsor Glow is the owner's visual reference.
> **Dependencies:** Existing account UI, hand-delivery eligibility, checkout and payment gates.
> **Key decisions:** True-white customer cards and clear outlined controls; retain the pale blue page and dark primary actions.
> **Next steps:** Owner completes any real payment test. Include local evidence in the next verified hard-drive transfer.
> **Last updated:** 2026-10-11

## Confirmed problem and repair

The legacy Tailwind `white`, `gold-100` and `stone-200` colours are pale blue. Many panels were transparent with nearly invisible pale borders. Browser measurements confirmed this on the payment page: the main panel and order summary matched the page, and the unselected bank option was transparent. This was a wider customer UI problem, not a failed payment calculation.

The public SiteChrome now scopes consistent true-white surfaces to customer cards, dialogs and outlined actions. Admin routes retain their existing theme. The global brand palette is unchanged. Coloured errors, paid status notices, product photographs and dark primary buttons retain their meaning.

- Basket, drawer, catalogue cards, bundle card, upsells and customer dialogs have distinct white surfaces. Quantity controls have visible outlines, descriptive names and 44px targets.
- Checkout details, shipping, discount code, terms confirmation and both order summaries use white panels. Address fields retain strong outlines and now have names and autofill hints.
- Shipping choices have white cards, strong selection borders, a radio indicator, visible “Selected” text and keyboard focus. The summary correctly calls eligible hand delivery “Hand delivered”. Eligibility and pricing logic are untouched.
- Payment choices say “Pay by Bank (Fena)” and “Pay with PayPal”. PayPal becomes dark blue with white text when selected. Both choices expose their selected state to assistive technology and stack on phones.
- Neutral disabled checkout actions remain grey with readable text and a disabled cursor. The existing explanation of required confirmation remains visible.
- Invoice payment and recovery panels inherit white surfaces. Invoice terms retain the original payment-link gate.
- FAQ items have individual white cards. Review stars have white outlined 44px targets, filled/empty stars and an accessible selected rating. Review fields, stock-alert email, product search and password-recovery labels are clearer.
- Existing login, registration, account statistics, profile and contact form panels were already white following the earlier account work. They remain consistent. Contact errors are announced; long messages can be resized vertically.

## Coverage

All 40 non-admin page sources were inventoried for surfaces and form controls, with their shared customer components. The local source inventory and exact browser measurements are in `customer-ui-audit-2026-10-11/` in the workspace project folder.

| Area | Review and verification |
| --- | --- |
| Home, about, shop, categories, individual products, haircare bundle, promotion | Source and shared-card review; local general/empty states; live product, catalogue, category and bundle inspection after release |
| Login, register, account, forgot/reset/create password, verify email | White surfaces, labels and phone layout; fixture account only, no registration or credential changes |
| Basket and drawer | Phone interaction, quantity increase/decrease, white surfaces and 44px controls |
| Checkout | Desktop and 390px phone; saved/alternate address, UK/international shipping, eligible free hand delivery, postal alternative, guest refusal of hand delivery, Fena/PayPal selection and totals, keyboard focus and confirmation gate |
| Invoice pay and resume payment | Local fake tokens; unpaid, paid and expired states; no click through to a payment provider |
| Order lookup, checkout success/cancelled | Empty/lookup/error navigation states, source review; no live customer order lookup |
| Reviews, contact | Phone layout, rating selection and order-number field; no messages, reviews or stock-alert subscriptions sent |
| Terms, privacy, cookies, shipping, returns, refund/payment/contact policies, disclaimer | Phone layout and readable existing prose; content and policy rules unchanged |
| Unsubscribe | Missing-token layout only; no subscription changes |
| Coming soon and PayPal demo | Existing inactive/protected routing preserved; demo returns 404 without staff access |
| Affiliate, RAF and Glow Card routes | Retired route guards preserved and regression-tested; not re-enabled |

No horizontal page overflow was found on the 27 ordinary routes inspected at 390px, nor on the exercised checkout, basket, invoice and recovery states. Some Chrome-autofilled login fields retain the browser's pale autofill colour; their dark outlines and white surrounding panel remain distinct.

## Validation and limits

Production Webpack build including TypeScript, targeted ESLint and the full `npm run check` passed. Separate checks passed for hand-delivery eligibility and authoritative pricing, PayPal no-email/payment-token safety using an isolated PGlite database, Fena authenticated confirmation and replay handling, retired features and member savings.

An initial legacy UI script could not connect to its default port 3010. Its hand-delivery scenarios were verified through the isolated browser preview instead. An initial retired-feature command lacked the alias loader; the corrected command passed. Neither initial setup error changed live data.

Browser fixtures were served only on loopback with database and email credentials unset. The fixture proxy blocks mutations except inert local mocks, strips cookies/authorisation before forwarding, and uses clearly labelled fictional details. No live order, payment, account, email, review or subscription was created. Real settlement with PayPal/Fena and actual delivery emails require the owner's real test; passing UI checks is not proof that money was received.

The preceding hand-delivery feature and account fixes are included. No payment/API/backend, stock, database, email routing, maintenance setting or authentication logic changed in this repair. Local screenshots, check logs and hashes require hard-drive transfer; website code and this document travel through Beauty GitHub main.
