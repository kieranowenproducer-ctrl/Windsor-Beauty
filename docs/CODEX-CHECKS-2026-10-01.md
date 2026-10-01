# Windsor Beauty checks, 1 October 2026

> **Purpose:** Record completed checks and remaining launch work.
> **Status:** Release checks passed. Live checks follow deployment.
> **Related:** README.md and OWNER-50P-BANK-TEST.md.
> **Dependencies:** Existing Vercel, Royal Mail and email accounts.
> **Decisions:** Holding screen stays on. Windsor Glow remains unchanged. No new paid service.
> **Next steps:** Complete the owner's bank test and prove Fena's own paid notice reaches the shop.
> **Last updated:** 2026-10-01

## Completed

- Read the current Windsor Glow main branch. It still sends a PayPal backup email. No Glow code was edited or deployed.
- Beauty now returns the PayPal link directly. Customer PayPal link emails and unpaid reminders are disabled. Staff new-order notices remain. Payment recovery links remain available.
- Real route tests with an isolated local database passed: payment token protection, paid-order refusal, no customer PayPal email, bank-only reminders and stock released only once.
- Fifteen active email designs and additional staff and dormant partner messages passed brand, escaping and contrast checks. Ninety local HTML layout checks covered phone and desktop widths in light and dark settings. Fifteen test messages were delivered to Kieran's verified Gmail address. This does not prove Gmail or Outlook's actual rendering.
- Fifty-three local admin actions and reads passed. Test rows were removed and changed settings restored. This covered product details, sizes, stock, visibility, categories, discounts, promotions, navigation, upsells, content, QR campaigns and batches.
- Twenty-five admin pages were opened at phone width with no page errors or sideways scroll. The phone menu, basket and checkout steps were used. Home and shop layouts passed. This was not a click of every button, and no real checkout payment was made.
- Printed order and invoice checks passed, including safe handling of typed text, recipient, discounts, fees and paid or unpaid labels. Print and certificate backgrounds use true white. No physical print or QR scan was performed.
- Retired affiliate, referral, loyalty and old countdown routes refuse requests even for staff. Their shared code remains intact and switched off.
- Readability improved, with measured contrast checks against the actual cream and blush colours. The holding screen uses the new logo and colours.
- Beauty's live database is separate from Glow. Shipping settings retain UK delivery at £10, international delivery off and starter product weights of 90 to 180 grams. These weights are estimates awaiting real product measurements.
- The daily Royal Mail route now refuses requests if its secret is missing. Its production secret was saved for this deployment. The previous handover records a successful Royal Mail test order 1174, then deletion. No new postage label was purchased in this session.
- Type check, full npm check and production build passed before release. The npm check includes deliberate missing-database error-path tests; those passed.

## Still needed

Fena was initially skipped because the signed-in Edge session was unavailable. Kieran then created the new Beauty key and supplied its values privately. Sensitive production settings were saved and deployment dpl_GpcNcfNgyEENZbW9yqzTj47nPVQZ is READY from tested source f1709d3. Fena created a real 50p payment page successfully. The existing Glow key was untouched. A real bank payment and Fena-originated paid notice are still unproved.

The hidden 50p product, unpaid invoice INV-UZ5C7Y and linked order WB-UCSSFU are reserved for Kieran's real bank check. The payment page is ready. No email or parcel was created. Do not delete these records while waiting for the owner. Follow OWNER-50P-BANK-TEST.md.

Actual Gmail and Outlook appearance, physical printing and QR scanning, real postage label download, customer account journeys and every remaining admin button still need checking. Do not describe this as a complete end-to-end launch test.

Kieran must confirm the logo and colours; guest versus member pricing; the 3.5 percent PayPal charge; delivery prices; working mailboxes; company name, address and C&S wording; social links; real products, prices and photos; and the launch date. Keep the holding screen on until instructed.

## Transfer

The website source travels through its own GitHub repository. Local settings, the private Fena notification address, Vercel project connection and Glow's shared local settings must travel on the hard drive. Do not copy the disposable local database or build caches. The existing PC transfer start page records the route.


## Fena follow-up still being checked

A separate collection-only record passed the live simulated-notice checks: a wrong secret was
refused, a rejected notice left it unpaid, a paid notice confirmed the invoice, and a repeat
returned already processed with the same confirmation time. The temporary invoice and order
were deleted and their absence verified. The owner's unpaid invoice was not used. No parcel
was created. The current proof does not cover
a real bank approval, a Fena-originated paid notice or a new Royal Mail parcel. The confirmation-email switch issue found during this work is fixed. The focused Fena
regression test, type check, standard checks and full production build all passed. This repair
is ready to publish; hosting confirmation will be recorded in the workspace handover.

Private transfer now also includes `.env.fena.local` and `OWNER-50P-PAYMENT.local.txt`. Never
commit those files or print their contents. Keep the pending owner test intact after transfer.
