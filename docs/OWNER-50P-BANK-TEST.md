# Owner's 50p bank payment check

> **Purpose:** Prepare one private bank payment check without sending an email or ordering a parcel.
> **Status:** Prepared locally and live. The live draft is unsent; no payment request exists.
> **Related:** Windsor Beauty handover, 1 October 2026.
> **Dependencies:** Windsor Beauty's own Fena key must be connected before the live payment check.
> **Decisions:** Exactly 50p, collection, no postage, owner email only. Keep the product hidden and the holding screen on.
> **Next steps:** Connect Fena, then give Kieran the private payment page.
> **Last updated:** 2026-10-01

The local draft is **INV-YRUFCR**, at `http://localhost:3002/admin/invoices/1/edit`.
It contains one hidden **Owner bank payment test** product, priced at 50p.
Delivery is zero. The invoice fixes the amount at 50p, so guest pricing does not increase it.
All four automatic actions are off. There is no shop order, bank request, email or parcel.

## Prepare the live draft

For the assistant taking over, run this from the Windsor Beauty website folder after confirming
the live project is still connected to Windsor Beauty's own database:

```powershell
node scripts/prepare-beauty-bank-test.mjs --live --owner-email=kieranowenproducer@gmail.com
```

The script signs in using the shared admin settings for live preparation, or local settings for local preparation without displaying them. It only calls
Windsor Beauty's staff routes. It hides the product before creating it, creates an unsent draft,
then checks the price, delivery and all four switches. Running it twice reuses the same draft.
It stops if that draft has already been sent or paid.

The live command created draft **INV-UZ5C7Y**. Review it at [the saved invoice](https://www.windsorbeauty.co.uk/admin/invoices/1/edit). It is exactly £0.50 with no delivery or automatic actions. No shop order, email, bank request or parcel was created. The default local command was run twice and reused one draft.

## Make the private payment page ready

These steps are for the assistant, after the new Fena key and its notification address are proven:

1. Read the prepared live invoice again. Confirm the owner email, total of £0.50, zero delivery,
   collection, and all four automatic switches off.
2. Use the existing invoice send action while `sendPaymentLink` is still false. Despite the
   action's name, that setting makes it create only the linked order. It does not call Fena or
   send an email. Verify its result reports `emailSent: false` and no Fena link.
3. Save the same invoice with only `sendPaymentLink` set to true. Keep `sendConfirmation`,
   `triggerRoyalMail` and `sendDispatchEmail` false. Do not press Send again.
4. Give Kieran the existing private invoice page at `/pay/` followed by that invoice's private
   token. Keep the token out of logs and committed notes. Opening this page creates the bank
   payment request through the existing invoice flow. It does not approve a payment.
5. Do not use a normal basket checkout for this check: guest pricing and standard delivery would
   change the amount. Do not choose PayPal, which adds its surcharge.

## Kieran's steps

1. Open the private link supplied after Fena is connected.
2. If the holding screen appears, enter **1379**.
3. Check that the total is **£0.50** and delivery is **£0.00**.
4. Read and accept the terms, then choose **Pay by Bank**.
5. Choose your bank and approve **50p** in your bank app. If the amount differs, stop.
6. Return to Windsor Beauty. Tell the assistant you have paid so it can check the invoice and
   order both say paid, that only one payment was recorded, and that no parcel was created.

After verification, the assistant must remove the test invoice, shop order and hidden test product,
and any Royal Mail test order if one was unexpectedly created. Do not delete or alter the real
payment in the bank account. Record the 50p test outcome before removing the shop test records.
