# Windsor Glow — where everything lives

A map of the code: what each part does, how the pieces connect, and which bits are fragile.
Documentation only. **Last checked against the code: 25 August 2026.**

Start with [README.md](README.md) if you have not run the site yet — it covers the build
traps that will otherwise cost you an afternoon.

**Live site:** windsorglow.com
**Built with:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Neon Postgres, Resend
(email), Fena (Pay by Bank), a manual PayPal payment-link flow, Royal Mail Click & Drop,
Vercel Blob (uploads), hosted on Vercel.

**Size, so you know what you are walking into:** 865 files tracked, 702 of them code,
about 104,000 lines under `src/`. 217 API endpoints. 37 admin folders (42 pages, 30 of them
in the sidebar). 61 products across 13 categories. Counted 25 August 2026.

---

## The shape of it

```
src/
  app/            Every page and every API endpoint (Next.js App Router)
    admin/        The staff area: the sidebar's sections, all locked
    api/          217 endpoints. Everything under api/admin needs a login.
    shop/         Shop, product pages, category pages
    account/      Customer login, registration, their own orders
  components/     Reusable pieces of screen (account/, admin/, blog/, reviews/)
  lib/            The working parts (see below)
  data/           products.ts — the catalogue, written in code
  contexts/       Cart state
  hooks/          Small shared React helpers
scripts/          The check and test scripts
docs/             Test plan, recovery guide, feature records
public/           Images and static files (21 MB)
```

**Generated files in `docs/`.** Four files there are built by scripts, not written by hand.
`docs/source-library.generated.json` (150 MB, gitignored) is rebuilt by
`scripts/build-research-evidence.mjs` and read at run time by `load-source-library.mjs`.
`docs/research-chat-evidence-audit.generated.json` is rebuilt by the same script and read by
nothing at run time. `docs/research-dosage-candidates.generated.json` is rebuilt by
`scripts/build-research-dosage-candidates.mjs`. `docs/pearl-answers.baseline.txt` is written by
`npm run pearl:baseline` and compared by `npm run pearl:check`. Change the script, never the file.

`src/app/concierge-local-preview/` is a development-only page. It returns 404 in production.

### `src/lib` — the working parts

| Folder / file | What it is |
|---|---|
| `db.ts` | **The big one.** 2,618 lines, imported by about 230 files. Most database functions still live here. The schema itself has moved out to `src/lib/db/schema-parts/`. |
| `db/` | The newer, smaller database files — one per subject (reviews, blog, bans, marketing…). **New database work goes here, not in `db.ts`.** |
| `concierge/` | The AI assistant: safety gates, escalation, spend limits, and the research engine behind PEARL |
| `email/` | Shared email sending, addresses, and the bulk-send pacing |
| `costs/` | Recording what each AI call costs, into one shared ledger |
| `social/` | Reads the Social Engine's database for the admin Social section |
| `tasks/` | The Task Engine module that powers `/admin/tasks` |
| `voice/` | Voice note transcription for the account area |

Two database files exist on purpose. `db.ts` grew too large to be comfortable; `db/` is
where it is gradually being unpicked. Nobody is rewriting `db.ts` in one go — that would
be a risky change to a live shop for no customer benefit. Take a piece with you when you
are already working nearby.

---

## The customer's side

| Page | Where |
|---|---|
| Home | `app/page.tsx` |
| Shop | `app/shop/page.tsx` |
| One product | `app/shop/[slug]/page.tsx` |
| One category | `app/shop/category/[slug]/page.tsx` |
| Basket | `app/cart/page.tsx` |
| Checkout | `app/checkout/page.tsx` (+ `success/`, `cancelled/`) |
| Their account | `app/account/` — login, register, forgot password, order history |
| Track an order | `app/orders/[orderNumber]/page.tsx` (needs the matching email) |
| Blog | `app/blog/` |
| Reviews | `app/reviews/` |
| Dosage calculator | `app/calculator/page.tsx` |
| AI assistance | `app/concierge/page.tsx` (members only) |
| Verify a product | `app/verify/page.tsx` |
| Policy pages | `terms`, `privacy`, `cookies`, `shipping`, `returns`, `refund-policy`, `payment-policy`, `contact-policy`, `disclaimer`, `research-disclaimer`, `age-restriction` — all thin pages using the shared policy layout |

The policy pages pull their text from the database if staff have edited it, and fall back
to the wording in `policyDefaults.ts` if not.

---

## The staff side

Everything under `/admin`, in six groups. The sidebar is defined in one place:
`src/components/admin/AdminSidebar.tsx`.

| Group | Sections |
|---|---|
| **Operations** | Dashboard, Tasks, Orders, Invoices, Dispatch, Profitability |
| **Catalogue** | Products, Trial (Products & Profit), Certificates, Certificate Filler, Categories |
| **Marketing** | Content & Ads, Promotions, Discount Codes, Upsell System, QR Campaigns, Email Marketing, Reviews |
| **Customers** | Customers, Member Logins, PEARL Questions, PEARL Terminology, IP Addresses, Website Enquiries, Verification Codes, Batches, Verification Log |
| **Content** | Blog, Site Content |
| **Settings** | System Health, Shipping Settings, Nav Links |

**How the lock works.** `src/proxy.ts` (Next.js 16's name for the old `middleware.ts`; there
is no `src/middleware.ts`) guards every `/admin` page and every
`/api/admin` endpoint by checking the admin cookie's value against the real token — not
merely that a cookie exists. A short list of task-agent endpoints is exempt from the cookie
check and uses a separate password instead. **That list fails closed:** forget to add a new
agent endpoint and it returns 401 before your code runs. Deliberate — the alternative was
an endpoint accidentally left open to the world.

---

## How an order works, start to finish

```
Customer fills the basket (held in the browser)
   ↓
Checkout: the SERVER re-prices everything from the live catalogue
   ↓  (a tampered basket cannot cheat — client prices are ignored)
Order row written, stock comes down
   ↓
Customer pays through Fena (Pay by Bank), or asks for a PayPal link
   ↓  (a private recovery link can resume payment)
   ↓
EITHER Fena's notification OR the success page marks it paid — whichever
arrives first wins, and only that one sends the confirmation email
   ↓
Confirmation email to the customer, alert to the business
   ↓
Admin → Orders, and on the dispatch calendar
   ↓
Staff dispatch: Royal Mail CSV export (normal) or a live label (optional)
   ↓
Tracking email out, order history updated
```

If payment is still unconfirmed after roughly 36 hours, the hourly unpaid-order
job sends one reminder. At 48 hours it cancels the reservation and restores only
the stock that checkout actually reduced.

**Prices are decided on the server.** `api/checkout/place-order` rebuilds every line from
the live catalogue and recalculates delivery and discounts itself. This is the single most
important safety property of the checkout — do not weaken it.

---

## Products

The catalogue is written in code (`src/data/products.ts`), then **overlaid** with staff
edits from the database. `src/lib/shopServerData.ts` merges the two at request time. That
is how a price or stock change in the admin area takes effect without a redeploy.

**So:** editing `products.ts` directly is overridden by any matching database row. If a
change is not showing, look for a database override first.

---

## Email

All sent through Resend. Up to three sending keys are supported so different messages can
come from different verified domains.

| What | Where |
|---|---|
| Order confirmation | `lib/orderConfirmationEmail.ts` |
| Dispatch / tracking | `lib/shippingEmail.ts` |
| New-order alert to the business | `lib/adminOrderNotificationEmail.ts` |
| Password reset | `lib/passwordResetEmail.ts` |
| PayPal payment link | `lib/paypalInstructionsEmail.ts` (different domain) |
| Unpaid-order recovery | `lib/paymentResumeEmail.ts` |
| Marketing campaigns | `lib/marketingEmail.ts` |

Transactional messages save their Resend message ID and latest delivery state.
`api/webhooks/resend-outbound` accepts signed delivery, delay, bounce and failure updates.

**Bulk sends go through `lib/bulkSend.ts`, always.** It paces the sending, retries once,
stops cleanly when it runs out of time, and files a report naming who was missed. This
exists because a launch-day campaign once double-emailed 29 people: the platform killed the
send before its record was written, and re-pressing the button started from the beginning.
If you add a new bulk send, route it through this file.

---

## The AI assistant

The assistant does not live here. It runs as a separate app (`ai-concierge-service`), and
this site is a thin proxy to it — that way the safety rules exist in one place rather than
three. `src/lib/concierge/` holds the local half: who is allowed in, spend limits, the
handover to a human, and the PEARL research engine.

**Standing rules, not suggestions:**
- The safety gates run *before* any answer. A refusal is usually the system working, not a bug.
- Never edit `ResearchDesk.tsx`. Staff reach the research tools through the admin panel.
- Never widen the approved-compound list without Kieran's word.
- Certificates are compliance material. Never invent, alter or vary a lab value.

Full detail: `docs/PEARL-TERMINOLOGY-IMPLEMENTATION-2026-08-06.md`.

---

## The database

Neon Postgres, 61 tables (one `CREATE TABLE` statement each). Created and updated by one
function, `ensureSchema()`, which now lives in `src/lib/db/schema.ts` with its statements in
`src/lib/db/schema-parts/` (still re-exported from `src/lib/db.ts`). It is run from the admin
Dashboard's "Run Database Setup" button.

**It only ever adds.** New tables and columns are added with `CREATE TABLE IF NOT EXISTS`
and `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. Nothing is ever altered or dropped, because
this runs against the live production database. Follow that pattern exactly.

The main tables, by subject:

| Subject | Tables |
|---|---|
| Selling | `orders`, `invoices`, `discount_codes`, `promotions`, `promotion_rules`, `upsell_rules` |
| People | `customers`, `customer_sessions`, `password_reset_tokens`, `email_verification_tokens`, `customer_bans` |
| Catalogue | `custom_products`, `product_stock`, `product_variant_stock`, `product_visibility`, `product_costs`, `category_settings` |
| Content | `blog_posts`, `site_content`, `reviews`, `admin_nav_links` |
| Marketing | `marketing_contacts`, `marketing_campaigns`, `qr_campaigns`, `qr_campaign_scans`, `launch_subscribers` |
| Assistant | `research_chat_log`, `pearl_terminology_overrides`, `enquiries`, `enquiry_notes`, `enquiry_replies` |
| Records | `ip_activity_log`, `member_login_log`, `verification_audit_log`, `automation_failures`, `cron_runs` |

If the database address is unset, reads return empty results instead of failing, so the
site still builds and runs. That is why it works locally with no database.

---

## Scheduled jobs

Seven jobs are defined in `vercel.json` and protected by one shared password (`CRON_SECRET`).

| UTC | Job | What it does |
|---|---|---|
| 03:30 | `concierge-retention` | Deletes old assistant conversations |
| 04:00 | `data-retention` | Deletes old visitor and question records |
| 06:00 | `royal-mail-sync` | Pulls tracking numbers back from Royal Mail |
| 06:30 | `ads` | Runs the approved advert scheduler |
| 07:00 | `sentinel` | Health-checks every live site, emails a digest |
| 09:00 | `verification-reminders` | Chases unverified email addresses |
| Every hour at :15 | `unpaid-orders` | Reminds unpaid customers at about 36 hours, then cancels at 48 hours and releases their recorded stock |

---

## Fragile areas — read before changing

1. **Paid-twice protection.** Both the Fena notification and the checkout success page can
   mark an order paid. The database update is atomic and returns nothing if the other one
   already won, and only the winner sends the confirmation email. Remove that check and
   customers get two emails.

2. **There is only one Fena webhook address:** `api/webhooks/fena`. The old
   `api/payment/fena/webhook` folder has been removed; only `confirm`, `create` and `status`
   remain under `api/payment/fena`. Confirm the Fena dashboard points at
   `/api/webhooks/fena`, because a stale URL there would now 404.

3. **`ensureSchema()` must stay additive.** See above. It runs against live data.

4. **Two login routes accept admin credentials** — `/api/admin/login` and
   `/api/account/login`. Both read the same three settings.

5. **The exemption list in `src/proxy.ts` fails closed.** Adding an agent endpoint without listing
   it means a 401 before your handler runs.

6. **Dates are grouped with `londonDateString()`** (`lib/date.ts`), not raw date maths, so
   the dispatch calendar and revenue figures do not break across midnight for UK users.
   Use it for any new date grouping.

7. **`src/lib/db.ts` has about 230 importers.** Changing a signature there is a wide change.

8. **Never roll back past commit `0c776ce`** while `LAUNCH_ACCESS_CODE` exists — older code
   puts the whole public site back behind the pre-launch wall.

---

## Database functions with no callers

These are exported from `src/lib/db.ts` but nothing calls them. Left in place, not deleted,
in case an external script uses them. Safe to remove once confirmed, or to wire up if the
matching feature gets built.

- `restoreOrderStock`
- `findOrderByFenaPaymentId`
- `listOrdersReadyForDispatch`
- `getCategorySettings` (now defined in `src/lib/db/categorySettings.ts` and re-exported from
  `db.ts`; still uncalled)

(The previous version of this list also named `findCustomerById`, `listCustomers` and
`findMarketingContactByToken`. All three are now in use. List re-checked 25 August 2026.)
