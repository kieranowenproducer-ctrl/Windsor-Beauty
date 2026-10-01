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

## Windsor Beauty and Windsor Glow never share anything

This is the rule that matters most. The two shops have separate databases, email keys, payment
keys, postage keys, image storage, admin passwords and websites. Never paste a Windsor Glow value
into Windsor Beauty's settings, and never the other way round.

Two guards back this up:

- "Run Database Setup" refuses to run against a database that already holds another shop.
- Every optional key that is missing switches its feature off safely: no emails, no payments, no
  postage labels, no uploads.

## The holding screen

- It is on unless the live site's settings contain `MAINTENANCE_MODE=off`. Nothing in the code turns
  it off. Setting that value and publishing again is the launch.
- While it is on, every page **and every back-end address** (checkout, payments, contact form,
  scheduled jobs, payment notifications) answers with the holding screen. Only the admin area
  works, behind its sign-in.
- To look at the real shop on the live address while it is closed: sign in at `/admin/login`, then
  browse normally. Signed-in staff see the real shop.
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

These are owed by the business, not by the code. Until each is supplied its feature stays off.

1. A live database for Windsor Beauty (its own Neon database).
2. An email key for the windsorbeauty.co.uk domain (Resend), and which mailboxes to use.
3. Payment details (Fena and/or PayPal) for Windsor Beauty.
4. A Royal Mail Click & Drop key, if labels are to be booked from the admin panel.
5. An image store (Vercel Blob) so product photos can be uploaded from the admin panel.
6. A new admin password and session token in the live settings.
7. A read of the policy pages by the business, with the company's legal details added.

## Where things are

- `src/app` pages and back-end routes; `src/app/admin` the admin panel
- `src/components` shared screen parts; `src/lib` the workings (orders, emails, payments, database)
- `src/lib/db` database code; `src/lib/db/schema-parts` the table definitions
- `scripts` checks and tools; `npm run check` runs the checks that need no database

## Publishing

The repository is `kieranowenproducer-ctrl/Windsor-Beauty`. Its `main` branch is what the live
site publishes. The new platform is on the branch `platform-from-windsor-glow` and has **not** been
merged or pushed. The old brochure-style site is still what `main` holds, behind the same holding
screen.
