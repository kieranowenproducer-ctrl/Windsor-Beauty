# Windsor Beauty

The online shop at **[windsorbeauty.co.uk](https://www.windsorbeauty.co.uk)**. It sells research
peptides, takes orders and payments, emails customers, and has a large admin area the
business runs day to day from.

New here? Read this page top to bottom, then
[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the map of the code.

---

## Live visitor tracking

Visitor tracking was repaired and verified live on 10 September 2026 after a database-save
fault caused a gap on 9 September. The browser now keeps unsaved page and basket events and
retries them. The server only reports success after the database confirms the save, and each
event has one receipt so retries cannot inflate the figures. A new registration is connected
to the journey that led to it.

`/api/tracking-health` is the plain health signal. A healthy response means the feed is recent
and no registration since the repair is missing its matching journey. Visitor Demand and System
Health show a red warning when this check fails. Treat any new visitor-tracking warning after
10:57am UK time on 10 September 2026 as a new incident. The eight warnings created during the
repair test were checked and marked as dealt with.

The full incident record and proof are in
`05_Database-and-Knowledge-Store/change-logs/2026-09-10-windsor-beauty-tracking-reliability.md`.

---

## Read this before you run anything

**`DATABASE_URL` is deliberately empty in the local environment file.** The site runs
without a database on purpose, so you can work on pages without touching live customer
data. Pages that need the database answer `503`, and product prices do not appear. That is
expected, not a fault. See "Working with the database" below.

This matters when you run the checks. `npm run check:seo:served` compares what a visitor
sees against what the page tells Google, so it **needs a database on both the build and the
server** or it reports failures that are really just missing data:

```bash
# Give the build and the server the read-only database from .env.local
DATABASE_URL="<the read-only url>" npm run build
DATABASE_URL="<the read-only url>" npm start -- -p 3213
npm run check:seo:served -- --base=http://localhost:3213
```

Build it without a database and the sitemap gets baked empty, which then disagrees with a
shop page that *does* have one. Both halves need the same view of the world.

> **Historical note, now fixed.** Until August 2026 this project could not be built from
> this folder at all, because the apostrophe in `Kieran's AI builder` broke Webpack's
> metadata-route loader: it wrote the path into generated code inside single quotes, and
> the apostrophe closed the quote early. `robots.ts` and `sitemap.ts` failed to parse with
> a misleading "Default export is missing" error. **Next.js 16 builds with Turbopack, which
> does not have that bug.** The apostrophe is no longer a problem and the old copy-to-a-
> clean-path workaround is no longer needed.

---

## Get it running

```bash
npm install          # once
npm run dev          # http://localhost:3000
```

To build the way the live site builds:

```bash
npm run build        # builds with Turbopack
npm start            # serves the built site
```

**Never run `npm run build` while `npm run dev` is running on the same folder.** They
share a build cache and corrupt it. You get `Cannot find module './xxxx.js'`. If that
happens: stop everything, delete the `.next` folder, start again.

### Logins

- **Admin area:** `/admin` — username and password are `ADMIN_USERNAME` and
  `ADMIN_PASSWORD` in `.env.local`. They are never written in documentation.
- **Customer account:** register a new one at `/account/register`. Registration needs the
  `referredBy` field ("where you heard about us") or it refuses with a 400.

---

## Every command

| Command | What it does |
|---|---|
| `npm run dev` | Runs the site locally for development |
| `npm run build` | Builds the production version (Turbopack) |
| `npm start` | Serves an already-built site |
| `npm run check` | Runs every check chained into `npm run check` in one go: 20 commands, from `check:costs` through to `pearl:tests`. Not fully offline: `check:certificates` and `pearl:tests` need the database |
| `npm run check:costs` | Proves the AI cost modules match the Social Engine's copy |
| `npm run check:shipping` | Proves the delivery windows and prices are consistent |
| `npm run check:marketing` | Proves marketing emails have valid links and buttons |
| `npm run check:contrast` | Proves admin text is readable against its background |
| `npm run check:certificates` | Proves every product's certificate matches its strength |
| `npm run check:seo` | Proves the shop, categories and sitemap link up correctly |
| `npm run check:seo:live` | The same, run against the real live site (see the note below) |
| `npm run check:seo:served` | The SEO check, plus fetching a local build to compare what is served with what the code says. Needs a built site running on port 3000, with the database (see the top of this page) |
| `npm run check:system-health` | Proves the admin dashboard's red "needs attention" banner only counts real faults and can be ticked off. Needs nothing |
| `npm run check:data-integrity` | Proves the rules that stop the database contradicting itself, such as refusing to delete an order that still has an invoice. Needs nothing |
| `npm run check:account-link` | Proves every order says truthfully whether the customer was signed in, or was only matched to a member by email. Needs nothing |
| `npm run check:payment-safety` | Proves unpaid-order wording, secure payment recovery, expiry, exact stock restoration and email-delivery tracking. Needs nothing |
| `npm run check:upsell-water` | Proves bacteriostatic water is always offered alongside a dry-powder vial. Needs nothing |
| `npm run check:invoice-number-fields` | Proves the quantity box on a manual invoice no longer puts a 1 back the moment it is cleared. Needs nothing |
| `npm run check:invoice-addresses` | Proves a delivery address never becomes somebody's billing address. Needs nothing |
| `npm run check:certificates:images` | The certificate check, plus fetching every supplier image to prove it loads. Needs the database and the internet. Not part of `npm run check` |
| `npm run check:suppressions` | Proves every switched-off lint warning carries a reason. Needs nothing. Not part of `npm run check` |
| `npm run check:responsive` | Opens the shop in a real browser at phone, tablet and desktop widths and proves the layout holds (see the note below) |
| `npm run check:a11y` | Opens the shop in a real browser and proves a person who cannot see it, or cannot use a mouse, can still buy something (see the note below) |
| `npm run check:admin` | Opens the admin panel in a real browser and proves every button says what it does (see the note below) |
| `npm run check:journeys` | Walks the customer journeys in a real browser and proves no pop-up can trap anybody (see the note below) |
| `npm run test:admin-search` | Proves the Orders and Invoices search finds an order from a customer AND a product typed together, and that the sorting and the date range do what they say. Needs nothing |
| `npm run check:search` | The same thing in a real browser against the real orders and invoices, including at phone width (see the note below) |
| `npm run test:research` | Checks the research assistant's safety and knowledge |
| `npm run test:safety` | Checks that the assistant refuses unsafe questions |
| `npm run test:handoff` | Checks handing a customer over to a human |
| `npm run test:access` | Checks that member-only areas stay member-only |
| `npm run test:escalation` | Checks how problems get escalated |
| `npm run test:handover` | Checks the enquiry handover records. Needs a writable `AI_COSTS_DATABASE_URL` |
| `npm run test:bans` | Checks banning and un-banning accounts. Needs a writable `AI_COSTS_DATABASE_URL` |
| `npm run test:formlimits` | Checks that the public forms' spam brakes stop a script and release again. Needs a writable `AI_COSTS_DATABASE_URL` |
| `npm run test:pearl-ai` | Proves PEARL's AI guards hold: no summary sentence without a source, no fact that is not a verbatim quote. Needs nothing. Inside `npm run check` |
| `npm run test:pearl-citations` | Proves an approved correction is the only way to change a PEARL answer's source strip. Needs nothing. Inside `npm run check` |
| `npm run test:pearl-layouts` | Proves a PEARL answer layout only changes what it is allowed to. Needs nothing. Inside `npm run check` |
| `npm run test:pearl-library` | Proves the source library only records a new version for a real text change. Needs nothing. Inside `npm run check` |
| `npm run test:pearl-admin` | Proves the PEARL source-link safety checks and the admin control centre hold. Needs nothing. Inside `npm run check` |
| `npm run test:pearl-builtin-edit` | Proves editing a built-in terminology record actually changes what PEARL does. Needs nothing. Inside `npm run check` |
| `npm run pearl:baseline` | Writes a complete picture of every PEARL answer to `docs/pearl-answers.baseline.txt`. Needs nothing. Run it only when a change to the answers is intended |
| `npm run pearl:check` | Compares today's PEARL answers against that baseline and fails on any difference. Needs nothing. Inside `npm run check` |
| `npm run pearl:tests` | Runs every saved PEARL test from the admin dashboard, without writing anything. Needs the database (without one it says so and exits cleanly). Inside `npm run check` |
| `npm run source:try -- <source>` | Tries one research source's reader and reports what PEARL would learn from it, writing nothing. Needs the internet. Not part of `npm run check` |
| `npm run lint` | Checks code style and common React mistakes (see `eslint.config.mjs`) |
| `npm run backup` | Writes a full copy of the database into `backups/` (gitignored) |
| `npx tsc --noEmit` | Checks the code for type mistakes without building |

**Before you push anything**, run `npm run check` and the `test:` scripts. There are 14 of
them; the six PEARL ones already run inside `npm run check`. They should all pass. See
[docs/TEST-PLAN.md](docs/TEST-PLAN.md) for the by-hand checks that a machine cannot do.

**And if you touched a modal, an overlay, the entry notice, the header or global CSS, also run
`npm run check:journeys`.** Those pieces are shared by every page, so a change to one of them can
break a customer journey somewhere else entirely. That is not hypothetical: it is what happened
on 14 August 2026, and the code-reading checks all stayed green while it was live.

**`check:seo:live` is the only one that proves what a search engine actually receives.** The
others read the code. This one fetches the real site as Googlebot and checks what comes down
the wire, so it is the one that would catch the site serving something different from what the
code says. It is not part of `npm run check` because it needs the internet and hits production.
**Last run 11 August 2026: all 240 checks passed** — 47 product links in the shop HTML matching
47 in the sitemap, 13 category pages matching, and four product pages sampled. Worth running
after any change to the shop, the categories or the sitemap.

**`check:responsive` was the first one that opens the site and looks at it** — `check:a11y`,
`check:admin` and `check:journeys` do too now. Every other check reads the code, so a page could
pass all of them and still be broken on a phone, which is what
most customers use. It drives a real browser over eight customer-facing pages at three widths
and asserts on **measured** layout, so it gives a pass or a fail rather than an opinion. It needs
a built site running:

```bash
npm run build && npm start -- -p 3213     # in another terminal
npm run check:responsive
```

It checks that the page never scrolls sideways, that nothing is wider than the screen unless its
container holds it, that tap targets meet WCAG 2.2 **including the standard's spacing exception**
(without that, every ordinary footer link reads as broken and the check becomes noise), that
every image has alt text, that the navigation is reachable, and that the page actually rendered
something — an empty page passes every other rule, so it is proved not to be empty.

**First run, 12 August 2026: 168 checks, all pass.** It is deliberately not part of `npm run
check` because it needs a running server.

**`check:journeys` is the one that opens two things at once on purpose.** Every other check looks
at one page, or one overlay, in isolation. This one walks the journeys a customer actually walks
and deliberately lets a pop-up fire while another is already open, because that is the only way
the 14 August fault was ever going to show up: the 10%-membership offer drew itself on top of the
Terms and Conditions while somebody was reading them, and because it sits inside the part of the
page the entry notice marks `inert`, nothing on it could be pressed. On a phone that is a
full-screen black veil over the legal text with no way out. It was live for two days and all 541
existing checks passed throughout, because not one of them opens two overlays at the same time.

```bash
npm run dev -- -p 3010                    # in another terminal
npm run check:journeys
```

It proves the offer cannot interrupt the Terms, that it still appears once the customer is inside
the site (delayed, not switched off), that every way of closing it works, that no overlay is ever
left visible-but-dead inside an `inert` subtree, that the scroll lock never sticks to `<body>`,
and that the shop, a product page, the basket, checkout and the accounts pages all still open and
respond. Phone and desktop.

**Run it before deploying any change to a modal, an overlay, the entry notice, the header, or
global CSS.** Those are the shared pieces: a change to one of them can break a journey four
clicks away, which is exactly what happened. **First run, 14 August 2026: 106 checks, all pass.**

**`check:admin` is the only one that looks at the admin panel.** Everything else here is about
the shop and the customer. This one signs in as the operator, opens every screen in the sidebar's sections, and
asks whether each control tells the truth: no page that fails to load or throws, no button
greyed out with nothing anywhere saying why, and none of the specific labels that were found
lying on 12 August coming back. It needs the running site and the admin token:

```bash
npm run dev                                        # in another terminal
ADMIN_SESSION_TOKEN=... CHECK_BASE=http://localhost:3000 npm run check:admin
```

**Run it against `npm run dev`, never against `npm start`.** A started build reads
`.env.production.local` first, whose `DATABASE_URL` is empty, so the admin panel renders with no
data at all and every check would pass against an empty screen. The check refuses to run when it
finds no database, for exactly that reason. **First run, 12 August 2026: 169 checks, all pass.**
It cannot judge whether a *new* label is honest — that still needs a person pressing the button
and watching what happens. It is the floor, not the ceiling.

Three of those scripts (`test:handover`, `test:bans`, `test:formlimits`) need a writable
database, which they take from `AI_COSTS_DATABASE_URL`. They build throwaway tables, prove
the queries against them, and drop them. They prove the SQL — **not** that the live database
has been updated. That happens on deploy.

---

## How it is built

| Layer | What we use |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript. Builds with Turbopack. |
| Styling | Tailwind CSS — the one brand colour scale is `gold`, defined in `tailwind.config.js` |
| Database | Postgres, hosted by Neon |
| File storage | Vercel Blob (product photos, admin uploads) |
| Email | Resend, sending from windsorbeauty.co.uk |
| Payment | Fena (Pay by Bank) and a manual PayPal payment-link flow. No card processor yet. |
| Delivery | Royal Mail Click & Drop (CSV export, plus an optional live label API) |
| AI assistant | A separate hosted service, `ai-concierge-service`. This site only proxies to it. |
| Hosting | Vercel |

---

## How it goes live

**This repo has its own GitHub remote** (`kieranowenproducer-ctrl/Windsor-Beauty`), separate
from the workspace it sits inside. Deploying means pushing from **inside this folder**.

1. Commit your work on `main`.
2. `git push` — Vercel builds and deploys automatically.
3. **Confirm the live site is actually running your commit.** A push carrying several
   commits at once can silently cancel a build, leaving the site on old code with every
   status looking green. Check the deployment in Vercel, or run
   `npm run check:seo:live` and see that it passes against the new behaviour.

There is no manual deploy command. `npx vercel --prod` is not used here.

### Scheduled jobs

Seven jobs run on Vercel's scheduler (`vercel.json`). Each is protected by
`CRON_SECRET` and refuses anything without it.

| Time (UTC) | Job | What it does |
|---|---|---|
| 03:30 | `concierge-retention` | Deletes old AI assistant conversations |
| 04:00 | `data-retention` | Deletes old visitor and question records |
| 06:00 | `royal-mail-sync` | Pulls tracking numbers back from Royal Mail |
| 06:30 | `ads` | Runs the approved advert scheduler |
| 07:00 | `sentinel` | Health-checks every live site and emails a digest |
| 09:00 | `verification-reminders` | Chases customers who have not verified their email |
| Every hour at :15 | `unpaid-orders` | Sends one reminder at about 36 hours, then cancels unpaid orders after 48 hours and releases only their reserved stock |

---

## Working with the database

All the apps in this workspace share one Neon host. **The local `DATABASE_URL` in
`.env.local` is a read-only account (`agent_ro`)** — you can look, you cannot change
anything. That is on purpose.

`AI_COSTS_DATABASE_URL` and `SOCIAL_DATABASE_URL` point at the same Neon database: the Social
Engine's, which also holds the `ai_costs` ledger. So there are four databases in all: the shop
(`DATABASE_URL`), `taskengine`, `socialengine` and `aisupport`.

Two of the checks inside `npm run check`, `check:certificates` and `pearl:tests`, read the
database, so `npm run check` is not fully offline. `pearl:tests` says so and exits cleanly when
no database is configured.

The database structure is created and updated by one function, `ensureSchema()` in
`src/lib/db.ts`, triggered from the admin Dashboard's "Run Database Setup" button. It only
ever **adds** tables and columns. It never alters or drops anything, because it runs
against the live production database. Any new table or column must be added the same way:
`CREATE TABLE IF NOT EXISTS` or `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Never rewrite
an existing statement.

**If something goes wrong**, read [docs/RECOVERY.md](docs/RECOVERY.md) — how to get the
database back, and how to undo a bad deploy.

---

## Where things are

The full map is [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md). The short version:

```
src/app/            Every page and every API endpoint
  admin/            The admin area (staff only): the sidebar's sections
  api/              217 endpoints; anything under api/admin is locked
  shop/             Shop, product pages, category pages
src/components/     Reusable pieces of screen
src/lib/            The working parts: database, email, payment, AI assistant
  db.ts             The big one, 2,618 lines. Read its contents list at the top.
  db/               Newer, smaller database files, and the schema in db/schema-parts/. New work goes here.
src/data/products.ts  The product catalogue in code, merged with admin edits
scripts/            The check and test scripts listed above
docs/               Test plan, recovery guide, feature records, and four generated files
```

Four files in `docs/` are built by scripts, never edited by hand: `source-library.generated.json`
(150 MB, gitignored) and `research-chat-evidence-audit.generated.json` come from
`scripts/build-research-evidence.mjs`, `research-dosage-candidates.generated.json` comes from
`scripts/build-research-dosage-candidates.mjs`, and `pearl-answers.baseline.txt` is written by
`npm run pearl:baseline` and compared by `npm run pearl:check`.

### How an order actually flows

Customer fills the basket → checkout **re-prices everything on the server** from the live
catalogue, so a tampered basket cannot cheat → the order row is written and stock comes
down → the customer pays through Fena or requests the Windsor Beauty PayPal link → a secure
recovery page lets them resume payment → **either** the Fena webhook **or** the success page
marks it paid, whichever gets there first, and only one of them sends the confirmation
email → the order appears in Admin → Orders → staff dispatch it and the tracking email goes
out. If payment is still unconfirmed after about 36 hours, one reminder is sent. At
48 hours, the reservation is cancelled and its recorded stock is returned.

---

## Things that will catch you out

- **The empty local database** — above. It makes prices vanish and the SEO check fail.
- **Orders and Invoices search the same way, in two different places.** Orders filters in the
  browser; Invoices filters in the database, in `listInvoices`. Both split what was typed with
  the one shared `parseSearchGroups` in `src/lib/adminSearch.ts`, but each does its own matching,
  so **a change to how a word is matched has to be made twice** or the two screens quietly stop
  agreeing. `npm run test:admin-search` and `npm run check:search` are what catch that.
- **A search on Orders deliberately reads Archived orders too.** Everywhere else the archive is a
  separate folder, and that is the point of it. But searching is how somebody asks "where is that
  order", and on 25 September typing `aod` returned an empty screen because all five AOD orders had
  archived themselves. Rows that came out of the archive are labelled in the list. Do not "fix"
  this back to folder-only.
- **The product short names come from PEARL, not from a list of their own.**
  `src/lib/searchAliases.ts` reads `src/lib/concierge/research/terminology.mjs`, so adding a term
  to PEARL teaches the admin search too. There is a short hand-written list in that same file for
  shop shorthand PEARL has no reason to know. Do not start a second list somewhere else.
- **Never roll back past commit `0c776ce`** while `LAUNCH_ACCESS_CODE` is set. Older code
  will put the whole public site back behind the pre-launch wall.
- **`src/lib/db.ts` is imported by about 230 files.** Changing a function signature there is a
  wide change. Prefer adding to `src/lib/db/` instead.
- **The middleware exemption list fails closed.** If you add an agent endpoint under
  `/api/admin/` and forget to list it in `src/proxy.ts`, it returns 401 before your
  code ever runs. That is deliberate — the alternative was an endpoint accidentally left
  open.
- **Never edit `ResearchDesk.tsx`.** Standing rule. Staff reach the research tools through
  the admin panel.
- **Certificates are compliance material.** Never invent, alter or vary a lab value or a
  certificate. If a certificate does not match, say so — do not make one fit.
- **Admin credentials live in two places.** Both `/api/admin/login` and
  `/api/account/login` accept them. Change one, change the other.

---

## Not built yet

- Card payments (Stripe or similar). Today it is Pay by Bank and a manual PayPal link.
- The AI assistant is live for staff only. Opening it to customers means setting
  `CONCIERGE_ACCOUNT_LIVE=on` in Vercel, and that is Kieran's decision, not a code change.
