# PayPal checkout demonstration

> **Purpose:** A safe video walkthrough of the new Windsor Glow PayPal customer journey.
> **Status:** LOCAL REVIEW, NOT PUBLISHED.
> **Related:** Windsor Glow checkout and PayPal payment instructions.
> **Dependencies:** The local-only `/checkout/paypal-demo` route and FFmpeg.
> **Key decisions:** The demonstration creates no order, sends no email and makes no payment. It uses a generic demo reference. There is no intermediate reservation page: ticking both boxes unlocks a button that goes straight to PayPal. The final PayPal frame is a faithful visual summary because PayPal blocks direct page capture.
> **Next steps:** Kieran reviews the video. Publishing it on the website requires a separate approval.
> **Last updated:** 2026-09-20

The live PayPal page was opened directly from the one-page checkout during verification. It showed £62.10 GBP, PayPal login and the debit-or-credit-card option. No details were entered and no payment was submitted.

The receiver is taken from the configured Windsor Beauty PayPal email. The generated payment request contains only the amount and `WG-DEMO`, never a product name.
