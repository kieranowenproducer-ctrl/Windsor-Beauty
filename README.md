# Windsor Beauty: shop and admin panel

Windsor Beauty's online shop and the admin panel that runs it. It was built from the Windsor Glow
shop in October 2026, so it works the same way, with Windsor Beauty's own brand, products, database
and settings.

**The shop is not open.** The live address shows a "We are making a few improvements" screen to
everybody except signed-in admin staff. See "The holding screen" below before changing anything
about how the site is published.

## What is in it

**The shop:** catalogue, categories, product pages with sizes, stock, basket, checkout, customer
accounts, orders, promotions, discount codes, upsells and reviews.

**The admin panel** (`/admin`):

| Section | Pages |
| --- | --- |
| Operations | Dashboard, Orders, Invoices, Dispatch, Profitability |
| Catalogue | Products, Trial (Products & Profit), Certificates, Categories |
| Promotions | Promotions, Discount Codes, Upsell System, QR Campaigns, Reviews |
| Customers | Customers, Security Review, Member Logins, Batches |
| Settings | Site Content, System Health, Shipping Settings, Nav Links |
| Pinned | Website Enquiries, Visitor Demand |

**Deliberately not here, because BRIAN looks after them:** PEARL (dashboard and email), the AI
assistant, verification logs, email marketing, advertising results and tasks. Do not rebuild them
in this project. Website Enquiries and Visitor Demand stay here for now and are expected to move to
BRIAN later.

## What Windsor Beauty shares with Windsor Glow, and what it does not

Decided by Kieran on 1 October 2026: the two shops are run by the same people, so they share accounts.

**Shared (same accounts, set as Windsor Beauty's own live settings):**
- Admin sign-in: the same username and password as Windsor Glow. If the password is ever changed, change it on both sites.
- Royal Mail Click & Drop: the same account. Windsor Beauty orders arrive with a reference starting `WB-`.
- PayPal: the same receiving account. Customers pay on the website. No PayPal payment-link email is sent.
- Fena Pay by Bank: to be the same account. **Not connected yet**, see "Before the shop can open".

**Never shared:** the database (orders, customers, products, stock), the image store, the admin
session, and the website itself. "Run Database Setup" refuses a database that already holds another shop.

**Product names go to Royal Mail and the payment provider unchanged.** Windsor Glow swaps its product
names for plain ones before sending; Windsor Beauty does not (`src/lib/genericNames.ts`). Only a
typed "Shipping description" on a product replaces its name.

## The holding screen

- It is on unless the live site's settings contain `MAINTENANCE_MODE=off`. Nothing in the code turns
  it off. Setting that value and publishing again is the launch.
- While it is on, public pages and back-end addresses answer with the holding screen. Staff sign-in and authorised payment notices and scheduled jobs still work.
- To look at the real shop on the live address while it is closed: type the access code **1379**
  into the box on the holding screen (that browser is remembered for 30 days), or sign in at
  `/admin/login`. The code is a short one for showing people round, not a lock.
- Payment notifications and scheduled jobs are let through, because each checks its own secret.
- On your own computer `npm run dev` always shows the real shop.

The code is in `src/lib/holdingScreen.ts` and the top of `src/proxy.ts`.

## Running it on this computer

```
npm install
npm run db:local      # window 1: Windsor Beauty's private test database, leave it open
npm run dev           # window 2: the site, at http://localhost:3002
```

The settings live in `.env.local` (never committed; `.env.example` lists every setting). The admin
sign-in for local testing is in that file.

First time on an empty database: sign in at `/admin/login`, open the Dashboard and press
**Run Database Setup**. It creates the tables and adds the 18 starter skincare products.

## Products

Every product lives in the database and is managed in **Admin > Products**: add, edit, sizes,
prices, photos, stock, hide, delete. No code change is needed.

The 18 starter products (`src/data/starterProducts.ts`) are copied in once, on the first database
setup, so there is something to test with. After that the file is never read again. Replace them
with the real catalogue through the admin panel.

## Before the shop can open

Live and connected already: its own database and image store, the shared admin sign-in, Royal Mail,
PayPal and email (sent from windsorbeauty.co.uk).

Still owed:

1. **Fena.** Windsor Glow's Fena keys cannot be read back from the host, and they are not saved on
   the laptop. Fena also sends "paid" notices to one web address per integration, and that address
   is Windsor Glow's. Needed from the Fena dashboard: an integration ID and secret for Windsor
   Beauty, with its notification address set to
   `https://www.windsorbeauty.co.uk/api/webhooks/fena?key=<a new secret>`. Until then Pay by Bank
   says "Payment is not configured" and PayPal is the working payment method.
2. Real delivery prices (Shipping Settings), and whether guest and member pricing should stay.
3. A read of the policy pages, with the company's legal details added.
4. Social media links.

## Where things are

- `src/app` pages and back-end routes; `src/app/admin` the admin panel
- `src/components` shared screen parts; `src/lib` the workings (orders, emails, payments, database)
- `src/lib/db` database code; `src/lib/db/schema-parts` the table definitions
- `scripts` checks and tools; `npm run check` runs the checks that need no database

## Publishing

The repository is `kieranowenproducer-ctrl/Windsor-Beauty`. A push to `main` publishes to
www.windsorbeauty.co.uk. The new platform went live there on 1 October 2026, behind the holding screen.

## Codex follow-up, 1 October 2026

PayPal opens directly, keeps the on-screen resume link and sends the staff order notice. Customer PayPal payment emails and automatic PayPal reminders are off. Payment still needs staff verification in PayPal; a redirect is not proof of payment. Windsor Glow still sends its backup email and was not changed.

Emails and the holding screen use the approved logo and Blush and Plum colours. There are 15 real email previews at `/api/admin/email-preview?type=paid` (other types are listed by that route). The old affiliate, referral, loyalty and countdown routes are blocked, with their intertwined files retained. The old affiliate schedule has been removed.

The daily Royal Mail job requires its secret even when one is missing from settings. Product weights remain estimates that need measuring before launch. Print documents use true white; packing slips escape typed text and include discounts and fees.

Fena remains unconnected: Edge showed the signed-in account but was unavailable to this chat. Existing Fena keys were untouched. An unsent live 50p invoice, INV-UZ5C7Y, is ready with a hidden test product, zero delivery and all automatic actions off. See [the bank test instructions](docs/OWNER-50P-BANK-TEST.md).

See [the check record](docs/CODEX-CHECKS-2026-10-01.md) for tested behaviour and remaining checks. Keep the holding screen on until Kieran explicitly says to launch.
