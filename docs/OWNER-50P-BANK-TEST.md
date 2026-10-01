# Owner's 50p bank payment check

> **Purpose:** Complete one private bank payment check without ordering a parcel.
> **Status:** Fena is connected. The real 50p payment page is ready; the owner has not paid.
> **Related:** Windsor Beauty handover, 1 October 2026.
> **Dependencies:** Kieran must approve the bank payment. Fena's own paid notice is not proved yet.
> **Decisions:** Exactly 50p, collection, no postage, owner email only. Keep the product hidden and the holding screen on.
> **Next steps:** Finish the notification checks, then Kieran completes the existing payment.
> **Last updated:** 2026-10-01

## The existing test

Live invoice **INV-UZ5C7Y** and order **WB-UCSSFU** are unpaid. Review the invoice at
[the saved invoice](https://www.windsorbeauty.co.uk/admin/invoices/1/edit).
The hidden **Owner bank payment test** item is exactly **£0.50**, with **£0.00** delivery.
The invoice fixes the price, so guest pricing does not increase it. It is marked for collection.
No email or parcel was created when the bank payment page was prepared.

**Keep this invoice, order and hidden product until the owner's real payment check finishes.**
Do not run the preparation script again to create another payment.

The invoice page and direct Fena link are saved privately in `OWNER-50P-PAYMENT.local.txt`.
Do not print the private tokens in logs or commit the file. The new Fena credentials are in
`.env.fena.local` and sensitive production settings. The old Windsor Glow key was not changed.

Fena payment-page creation succeeded after deployment `dpl_GpcNcfNgyEENZbW9yqzTj47nPVQZ`
from tested source `f1709d3`. This does not prove a bank payment or Fena's own paid notice.
The separate live simulated-notice test passed: wrong secret refused, rejection left unpaid,
paid confirmed once, and a repeat made no second confirmation. Its temporary records were
deleted. The owner's unpaid order was not used. The confirmation-email switch repair passed its focused Fena regression test, type check,
standard checks and full production build. It is ready to publish; the final hosting result
will be recorded in the workspace handover.

## Kieran's steps

1. Open the existing private invoice link supplied by the assistant.
2. If the holding screen appears, enter **1379**.
3. Check that the total is **£0.50** and delivery is **£0.00**.
4. Read and accept the terms, then choose **Pay by Bank**.
5. Choose your bank and approve **50p** in your bank app. If the amount differs, stop.
6. Return to Windsor Beauty. Tell the assistant you have paid so it can check the invoice and
   order both say paid, that only one payment was recorded, and that no parcel was created.

Do not use a normal basket checkout for this check. Guest pricing and standard delivery would
change the amount. Do not choose PayPal, which adds its surcharge.

## After the payment

Confirm a genuine Fena notice reached the shop and matched the 50p amount. Record the outcome.
Only then remove the test invoice, shop order and hidden product, plus any Royal Mail test order
if one was unexpectedly created. Do not delete or alter the real payment in the bank account.

## Preparation history

The local draft was **INV-YRUFCR**, at `http://localhost:3002/admin/invoices/1/edit`.
The local preparation script ran twice and reused one draft. It then prepared the live draft
INV-UZ5C7Y without sending anything. That same live draft was later linked to WB-UCSSFU and
used to request the existing 50p Fena page. No second owner test is needed.

The source helper `scripts/prepare-beauty-bank-test.mjs` is kept for reference. It stops when the
matching draft has already been sent or paid. It must not be changed to evade that safeguard.
