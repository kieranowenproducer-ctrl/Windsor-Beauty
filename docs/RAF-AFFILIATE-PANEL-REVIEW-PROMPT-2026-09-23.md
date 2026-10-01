# Review prompt: Raf affiliate panels, visual redesign

> **Purpose:** Hand the 23 September 2026 visual redesign of the two affiliate panels to
> Codex for an independent review.
> **Status:** Work is uncommitted and unpushed. Review not yet done.
> **Related:** [RAF-AFFILIATE-SYSTEM-2026-09-22.md](RAF-AFFILIATE-SYSTEM-2026-09-22.md)
> **Last updated:** 2026-09-23

Paste everything below the line into Codex.

---

# Review task: Windsor Glow affiliate panels, visual redesign

Review work another assistant (Claude Code) did in the previous session. Treat every
claim below as unverified. Your job is to check it, not to accept it.

## Where

Repo: `02_Kierans-Website-Generator/projects/windsor-glow/website`
Branch: `main` (this project is its own git repo, currently 1 commit ahead of origin)
State: three files modified, nothing staged, nothing committed, nothing pushed.

```
src/app/account/affiliate/page.tsx    Raf's own affiliate page
src/app/admin/affiliates/page.tsx     staff affiliate control
src/lib/affiliates.ts                 displayName() helper only
```

Start with `git diff` on those three. There should be no other changes.

## The brief it was given

Improve the visual design of the Raf affiliate panel and the staff affiliate control so
they feel more premium and consistent with the shop. **Presentation only.** Do not alter
affiliate rules, calculations, Glow Card behaviour, discount stacking, account access,
payment flow or database code. Display his name as "Raf". Keep the invitation code RAF and
the personal RAF5- codes uppercase. Keep the customer side closed and his profile paused.
Review at desktop and phone. Run the build and relevant checks. Do not push or deploy.

## Hard boundaries for you as well

- **Do not push, deploy, or commit** unless Kieran says so in this session.
- **Do not press any button in the live staff panel.** No approve, refuse, mark paid,
  pause, restore, save duration, or create profile. His profile must stay `paused`.
- The local `DATABASE_URL` in `.env.local` points at the **live** database. The role is
  `agent_ro` and should be read-only, but do not rely on that. Reads only.
- Do not turn on `WG_AFFILIATE_CUSTOMER_ACCESS_ENABLED`.

## What it claims to have changed

Raf's page:
- Deleted a duplicate "Windsor Glow" wordmark and a nested `<main>` inside the site's `<main>`.
- Replaced hardcoded hex golds (`#9b7628`, `#b89545`, `#87651f`, `#a98227`) and the
  `#f6f4ef` background with the Tailwind `gold` scale and the white account-page background.
- Invitation code moved to its own labelled block, uppercase.
- Added an empty state when there are no referrals.
- Added a `<legend>` to the cash / shop credit buttons, which previously had no group label.

Staff page:
- Moved to the canonical admin shell (`h-full bg-stone-50 flex flex-col lg:flex-row
  overflow-clip` + `<main className="flex-1 p-4 sm:p-8 overflow-clip">`), matching
  `src/app/admin/customers/page.tsx`. It previously used `min-h-screen` with a hard
  `lg:ml-64`, which double-offsets against AdminSidebar's `lg:w-56` spacer.
- Split the old "Active · pause" / "Paused · restore" pill into a status label plus a
  separate, explicitly worded button.
- Plain-English payout stages and method labels; readable dates matching Raf's page.
- Real empty states for payment requests and referred customers.

Both:
- Phone: referral tables became stacked cards under `sm:`; tables kept from `sm:` up.
  Previously both tables ran off the side of a 390px screen, hiding expiry, orders,
  commission and status entirely.

`src/lib/affiliates.ts`:
- `displayName()` previously matched only the exact string `'RAF'`. The live record stores
  `display_name = 'RAF Christian'`, so it never fired and the staff panel showed
  "RAF Christian". It now sentence-cases a shouted first word, preferring `first_name`.
  Claimed to be display-only, applied to both profile rows and the narrower payout-join
  rows, and to leave `referral_code` untouched.

## What you must verify

1. **Scope discipline.** Read the full diff. Does anything touch affiliate rules,
   commission maths (`src/lib/affiliateMoney.ts`), the API route handlers' logic, the
   schema, the feature flags, discount stacking, or Glow Card? Any behavioural change that
   is not purely presentational is a finding. Check especially that every `act(...)` and
   `fetch(...)` payload on both pages is byte-identical in meaning to the original.

2. **The displayName change is the riskiest edit.** It is the one change outside a page
   component. Reason about it adversarially:
   - Does it mutate anything, or only return a copy?
   - What does it do to a future second affiliate whose stored name is legitimately
     capitalised, an initialism, a single character, an empty string, a non-Latin script,
     or `null`?
   - It drops the surname. Is that right for every place `display_name` is rendered?
     Grep for all render sites, including emails (`src/lib/affiliateEmail.ts`) and the
     cron reminder route, and confirm none of them relied on the old value.
   - Confirm `referral_code` and the `RAF5-` personal codes are untouched anywhere.

3. **The name actually renders as "Raf".** Verify against the live row, not the fixtures.
   The preview routes use hardcoded fixtures that already said "Raf", so they prove
   nothing about this. Check the real `/admin/affiliates`.

4. **Re-run the checks yourself. Do not trust the reported results.** Claimed: `npm run
   build` passes with 123 pages; `npx tsc --noEmit` clean; eslint clean on the changed
   files; `npm run check:contrast` passes; `npm run check:costs` passes; `npm run
   check:responsive` 168/168 against a dev server on port 3213.

5. **`npm run check:journeys` was never run.** It needs a dev server on port 3010. Run it.
   It has reportedly been failing on `main` since 25 August for two known unrelated
   reasons (entry notice bypassed on request, basket is a link not a button), so establish
   the baseline by stashing the three files first, then compare. Only a new failure counts.

6. **Accessibility.** Claimed zero axe violations inside both panels at 1440px and 390px,
   and that the site-wide `npm run check:a11y` failures (368 pass, 5 fail: home page
   `aria-prohibited-attr` and three entry-notice items) pre-date this work. That baseline
   claim was made by stashing the three files and re-running. Re-derive it yourself.

7. **Look at the panels.** Code review is not enough here; the whole task was visual.
   The preview routes are `/affiliate-preview` and `/affiliate-admin-preview`, both 404 in
   production, so you need `next dev`. Note they render under storefront chrome, not the
   real chrome, so also view the real `/admin/affiliates` with the `wg_admin_session`
   cookie set to `ADMIN_SESSION_TOKEN` from `.env.local`. Inject it via CDP
   `Network.setCookie`, not a proxy, or React will not hydrate.
   Check at 1440 and 390: no sideways scroll, no clipped table columns, tap targets 24px
   and up, the gold matches the site header and footer rather than sitting slightly off,
   and the two panels look like the same product as each other and as the shop.

8. **House rules.** `taste-skill` applies: zero em-dashes or en-dashes in visible text.
   Note the serif and the warm gold are locked Windsor Glow brand tokens, so taste-skill's
   default bans on those do not apply here. Also confirm `npm run check:contrast` still
   passes given new gold usages inside `src/app/admin`, and that no new Tailwind class is
   a ghost class.

9. **One deliberate wording change**, flagged for Kieran and not yet ruled on: the withdraw
   heading went from "Request £19.00" to "Request up to £19.00". Judge whether that is
   presentation or an unrequested copy change.

10. **Cleanup.** A temporary Playwright harness was written to `node_modules/.wg-qa/` and
    deleted. Confirm nothing stray is left in the working tree and `git status --short`
    shows only the three files.

## Output

Report in plain English, short sentences, for a non-technical reader (Kieran and Samuel),
per the workspace rule. Lead with anything that is broken, risky or unfinished. Then:

- Anything outside "presentation only", quoted with file and line.
- Any check that fails, with the actual output, and whether it also fails without these
  changes.
- Any phone or desktop layout fault you can see, with the width it appears at.
- Your verdict: safe to commit as is, safe with named fixes, or not safe, and why.

Do not fix anything until you have reported. If Kieran then asks for fixes, keep to
presentation only and the same boundaries above.
