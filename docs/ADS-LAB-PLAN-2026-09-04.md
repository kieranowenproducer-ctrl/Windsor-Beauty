# ADSLAB: turning Ad Results into a live advertising experiment dashboard

**Written 4 September 2026. Approved by Kieran the same day: "i want them all (all 14)".**

**Trigger word: `ADSLAB`.** When Kieran types it, read this file in full, then start at the first
unticked item in the Progress table and keep going. Tick items off in this file as they ship.

This document is written so a session with no memory of the conversation can do the work correctly.
Everything that was measured against the live Meta account is recorded here so nobody has to
re-discover it.

---

## Why this exists

Kieran runs **two ads at a time and compares them against each other**. His next experiment is:

- **Ad A**: comments off or limited, deliberately targeted at gym and weightlifting audiences.
- **Ad B**: comments on, Meta's own automatic audience targeting.

The question is whether **manual targeting beats Meta's algorithm**, with comments as a second
variable. The page has to answer, within a few seconds of opening it: how much money is left, which
two ads are running, what each has spent, which is winning, how that has changed over time, and
what the difference between A and B actually was.

He also asked why 243 paid clicks produced zero orders. Items 7 to 9 exist to answer that.

---

## What already exists (do not rebuild)

Shipped and live on windsorglow.com on 4 September, in this order:

| Commit | What |
|---|---|
| `eab0f10` | Ad account switched to the one his ads really ran in, plus plain-English Graph errors |
| `1d86d0e` | Shared-account filter: only Windsor Glow's own ads are counted |
| `e6aa47a` | Line chart replacing the bars, gap filling, nullable cost per click |

**Files that matter:**

| Path | What it is |
|---|---|
| `src/lib/ads/meta.ts` | The Meta reader. Graph v21, read only. Ownership filter, insights, snapshot, delivery issues. |
| `src/lib/ads/store.ts` | Our own database side. `campaignTill()`, `getCreativeLinks()`, `setCreativeLink()`, slice history. |
| `src/lib/ads/adviser.ts` | `computeSignals()` deterministic facts, `writeAdvice()` AI advice with a daily pence cap. |
| `src/lib/db/schema-parts/ads.ts` | `ad_daily_metrics`, `ad_daily_slices`, `ad_alert_log`, `ad_creative_links`, `ad_advice`. Self healing. |
| `src/app/admin/ads/page.tsx` | The whole page. Tiles, line chart, campaign and ad tables, breakdowns, signals, advice. |
| `src/app/api/admin/ads/route.ts` | The read the page calls. Gated by `proxy.ts` like every `/api/admin` path. |
| `src/app/api/cron/ads/route.ts` | 06:30 UTC daily. Snapshot, watchdog, Monday email. |

**Two mechanisms already built that the new work should reuse rather than reinvent:**

1. **`ad_creative_links`** already stores a free-text label per ad (`ad_id`, `ad_name`,
   `creative_label`), currently shown as the "Which film" column. **Item 4 extends this table**
   rather than creating a second one.
2. **`ad_daily_metrics`** already saves per-ad figures every morning at level `'ad'`. The comparison
   chart has real history to draw on. Click rate, cost per click, cost per thousand and frequency
   are all derivable from the columns already there.

---

## What Meta actually gives us (measured 4 Sept, not assumed)

Account `act_4002287066545281`, currency GBP, timezone Europe/London, status active, prepay.

### The money is available, two ways that agree

```
funding_source_details -> {"id":"25088003214221144",
                           "display_string":"Available balance (£43.37 GBP)","type":20}
is_prepay_account      -> true
spend_cap              -> "8600"    (£86.00)
amount_spent           -> "4263"    (£42.63)
balance                -> "0"       (postpaid arrears, always 0 on a prepay account)
```

`spend_cap - amount_spent` = **4337 pence = £43.37**, exactly matching Meta's own `display_string`.

**Implementation rule: compute the number from `spend_cap - amount_spent`** (numeric, robust) and
**cross-check it against the figure parsed out of `display_string`** (Meta's own words, but English
prose that could change). Show the number. If the two disagree by more than a penny, show Meta's
display string verbatim and say the two sources disagree. Never show one silently.

**`spend_cap` is a hard stop.** When `amount_spent` reaches it, ads stop regardless of the balance.
The card must watch both, so "£43.37 available" and "cap reached in X" are the same warning.

### Per-ad metrics that came back live

`spend`, `impressions`, `reach`, `frequency`, `clicks`, `inline_link_clicks`, `ctr`,
`inline_link_click_ctr`, `unique_ctr`, `cpc`, `cost_per_inline_link_click`, `cpm`, `cpp`,
`actions`, `cost_per_action_type`, `video_thruplay_watched_actions`, `outbound_clicks`,
`cost_per_outbound_click`.

`actions` on a real ad returned: `link_click`, `post_engagement`, `page_engagement`, `photo_view`,
`comment`, `post_interaction_gross`, `post_interaction_net`,
`onsite_conversion.post_net_comment`.

**`comment` is Kieran's second experiment variable and Meta reports it per ad.** Surface it.

### Three real gaps, to be stated on the page, never faked

1. **No Meta Pixel exists on this account** (`/act_x/adspixels` returns zero rows). So
   `landing_page_view`, conversions and cost per conversion are **not available from Meta**. Our own
   `site_visits` plus `ip_activity_log` plus `orders` already give real conversions through
   `campaignTill()` in `store.ts`. Use ours, and label it "from our own records".
2. **`quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking` all return `UNKNOWN`.**
   Meta withholds them until an ad has enough volume. Show them only once they are not UNKNOWN, and
   say why they are missing rather than showing an empty box.
3. **`action_values` is absent** because nothing has been bought through a Meta-tracked conversion.

### Rate limits

`x-business-use-case-usage` reports `ads_api_access_tier: development_access`, with `call_count` in
the low single digits after a full page load. Development tier is fine for this page, but it is the
lower tier, so:

- No polling loop faster than about 5 minutes.
- A manual refresh button is the main way to get fresh figures.
- Meta's own reporting lags roughly 15 minutes anyway, so a faster refresh would be a lie dressed as
  precision. Label the page honestly.

### What is running right now

One ad `ACTIVE` ("Instagram post: visit windsorglow.com to learn more"), two `CAMPAIGN_PAUSED`, one
`WITH_ISSUES` which belongs to the other business and is already filtered out.

**So the two-ad comparison will show one line until Kieran launches his experiment. That is correct
behaviour, not a bug.** Build it so one, two or more ads all render sensibly.

---

## Run this to the end without stopping

Kieran asked, in his words, whether the trigger word will "complete all the tasks without me
needing to prompt further, as this is a must". So the default is **keep going**. Build, prove,
commit, deploy, tick the row, move to the next item, without coming back to him between items.

**Do not stop to ask about any of the following. Decide, note the decision in the commit message,
and carry on.**

| Question that might tempt a pause | The answer, already decided |
|---|---|
| Which metrics deserve most prominence on an ad card? | Spend, cost per click, click rate and comments lead. Everything else is secondary. Judgement is delegated. |
| Exact green and red for the two lines? | Any pair that passes contrast on the stone background. Differentiate by line style as well as colour. |
| How rounded, how much shadow? | Match the house style, lift gently. Preserve mode. Do not touch other admin pages. |
| A metric Meta will not return on this tier? | Leave that one out, say so on the page in one line, and continue with the rest of the item. |
| An item turns out bigger than expected? | Ship the useful part, note what was trimmed at the bottom of this file, continue. Do not silently drop it. |
| Only one ad is running, so a comparison cannot be seen? | Build it anyway. Prove it renders correctly with one, two and three ads using real data plus a paused ad. |
| Not enough orders to compute an average? | Show the honest empty state that says so. Never invent a figure. |
| Should this be deployed? | Yes. Push to main deploys. Kieran has standing permission for Vercel. Confirm the live deployment afterwards. |

**The only three things that justify stopping and asking:**

1. **Item 14**, which cannot start without the Pixel ID and his cookie decision. Skip it, finish
   everything else, then list it.
2. **Something would destroy or overwrite real data**, or spend real money. Nothing in items 1 to 13
   should, since it is all read-only reporting.
3. **A finding that changes what he would want**, for example Meta withdrawing access to the funds
   figure. Report it in one short paragraph and keep building everything unaffected.

**If the session runs low on room before item 13 is done:** update the Progress table, commit, and
say plainly which row is next. Typing `ADSLAB` again resumes from exactly there with nothing lost.
This is the intended safety net, not a failure. It is the reason the Progress table exists.

**Report once, at the end**, in the plain-English summary format from CLAUDE.md. Not after every
item.

## The 17 items

### Progress

| # | Item | Status |
|---|---|---|
| 1 | Available ad funds card | shipped 4 Sept 2026 |
| 2 | A card per ad, built for two side by side | shipped 4 Sept 2026 |
| 3 | Two-line comparison graph | shipped 4 Sept 2026 |
| 4 | Experiment labels | shipped 4 Sept 2026 |
| 5 | Visual polish | shipped 4 Sept 2026 |
| 6 | Honest live behaviour | shipped 4 Sept 2026 |
| 7 | What happened after the click | shipped 4 Sept 2026 |
| 8 | Cost per visitor and break-even | shipped 4 Sept 2026 |
| 9 | Which page each ad sent people to | shipped 4 Sept 2026 |
| 10 | Last period faintly behind this one | shipped 4 Sept 2026 |
| 11 | Time of day and day of week | shipped 4 Sept 2026 |
| 12 | Download as a spreadsheet | shipped 4 Sept 2026 |
| 13 | Tell me when one ad has beaten the other | shipped 4 Sept 2026 |
| 14 | Meta Pixel | blocked, needs Kieran |
| 15 | Leave existing members out of the ad figures | shipped 5 Sept 2026 |
| 16 | Plain-English page names, not web addresses | shipped 5 Sept 2026 |
| 17 | An instruction film for Samuel | shipped 5 Sept 2026 |

### Suggested order

**Phase A, the experiment itself:** 4, then 2, then 3, then 13.
Labels first, because items 2, 3 and 13 all display them and it is cheaper than retrofitting.

**Phase B, the money:** 1, then 12.

**Phase C, the question his money is asking:** 7, then 8, then 9.

**Phase D, polish and the rest:** 5, 6, 10, 11.

**Phase E:** 14, only when Kieran has supplied what it needs.

One commit per item, each with the plain-English reason in the message. Never one giant commit.

---

### 1. Available ad funds card

Biggest card on the page, above everything else, Windsor Glow gold, visually distinct from the
analytics tiles.

- Value from `spend_cap - amount_spent`, cross-checked against `display_string` as above.
- Label it **Available ad funds**, with a second line saying it is money already paid to Meta.
- Show spent so far and the cap alongside, because the cap can stop ads on its own.
- "Last updated HH:MM" with the honest note that Meta's figures lag about 15 minutes.
- Amber when the remaining funds would last under roughly 7 days at the current daily rate, red at
  under 2. Compute the rate from the last 7 days of real spend, and say "not enough spend yet to
  estimate" rather than dividing by zero.
- If Meta refuses the field, the card says so plainly. **It must never show a number it did not get.**

New reader function in `meta.ts`, for example `fetchAdFunds()`, returning value, source, cap,
spent, and a `disagreement` flag. Wire into `/api/admin/ads`.

### 2. A card per ad, built for two side by side

Replace, or sit above, the current dense ads table. Two cards side by side on desktop, stacked on
mobile, one per currently active ad, with paused ones below and quieter.

Per card: the ad's own thumbnail if cheaply available, its experiment label from item 4, status,
spend, reach, impressions, frequency, clicks, link clicks, click rate, cost per click, cost per
thousand views, comments, engagement, and orders and revenue from our own till.

- Mark the winner on each measure with a small gold indicator, and be careful: **cheapest is best
  for cost measures, highest is best for the rest.**
- Do not show a winner at all while the numbers are too close or too small to mean anything. Reuse
  the sample-size honesty already in `computeSignals()`.
- Do not show ranking fields while Meta returns UNKNOWN.
- Keep it to metrics that inform a decision. Meta returns more than is worth showing.

### 3. Two-line comparison graph

The centrepiece. Two ads on one chart over time.

- **Ad A green, Ad B red**, as Kieran asked. Check the pair passes contrast on the stone background
  and is distinguishable for the colour blind: differentiate by **line style as well as colour**
  (solid and dashed), never colour alone.
- Metric switcher: spend, reach, impressions, clicks, click rate, cost per click, cost per thousand,
  comments, engagement, orders from our records.
- Ranges: today, last 24 hours, 3 days, 7 days, and the lifetime of the experiment.
- Reuse `smoothPath`, `niceScale` and `fillMissingDays` from `page.tsx`. **They carry hard-won
  correctness: monotone cubic cannot overshoot, gaps must be filled or the line invents spend on
  days nothing ran, and per-click costs must be null and break the line on zero-click days.**
- Today and last 24 hours need `time_increment` and possibly
  `hourly_stats_aggregated_by_advertiser_time_zone`. Verify what Meta returns before designing it.
- Legend shows each ad's experiment label, not its Meta name.

### 4. Experiment labels

Extend `ad_creative_links` with an experiment note and an A or B slot. Additive migration in
`schema-parts/ads.ts`, same self-healing pattern as everything else there.

- Editable inline on the ad card. Example: "Gym targeting, comments off".
- The label then replaces the Meta ad name everywhere a human reads it: cards, chart legend, tables,
  the weekly email, the adviser's prompt.
- Keep the real Meta name visible somewhere small, so an ad can still be found in Ads Manager.

### 5. Visual polish

Preserve mode. Do not redesign the admin system, and do not touch any other admin page.

Rounded corners, soft shadow, a slight lift, more generous spacing, clearer hierarchy, gold used
sparingly with the funds card carrying the most of it. One accent colour on the page. Consistent
corner radii throughout. **taste-skill applies: zero em-dashes and en-dashes in visible text.**

### 6. Honest live behaviour

Last refreshed time, a manual refresh button, no polling faster than 5 minutes, graceful failure
using the existing `explainGraphError()` wording, and never a fabricated value. State plainly that
Meta's own reporting lags.

### 7. What happened after the click

The one that answers the real question. A funnel from our own records:
clicks on Meta, visits that landed, product pages viewed, baskets, orders.

`campaignTill()` in `store.ts` already joins tagged visits to orders. `site_visits` carries the utm
tags and the ip; `ip_activity_log` carries the events. Extend rather than duplicate.
Say clearly which numbers came from Meta and which from us, because they will never match exactly.

### 8. Cost per visitor and break-even

Cost per visitor from real spend over real visits. Then, using the real average order value from
`orders`, how many orders per pound spent are needed to break even, and how far off that is.
If there are not enough orders to average, say so instead of guessing a figure.

### 9. Which page each ad sent people to

Landing page per ad from the creative link, joined to how that page actually performed from
`site_visits`. Shows whether an ad is sending people somewhere weak.

### 10. Last period faintly behind this one

A second, paler line on the single-ad chart for the equal-length previous window.
`fetchAdsDashboard` already fetches `previous` for the tiles; extend it to daily rows.

### 11. Time of day and day of week

Meta breakdown `hourly_stats_aggregated_by_advertiser_time_zone`, plus day of week derived from the
daily rows we already store. Verify the breakdown is permitted on this tier before building the UI.

### 12. Download as a spreadsheet

CSV of the current view: daily rows, campaigns, ads, with the labels. Server-side route so the file
is generated from the same data the page shows, not re-fetched separately.

### 13. Tell me when one ad has beaten the other

A plain sentence, not a p-value. "Ad B is getting clicks for less than half what Ad A pays, over
enough clicks to be believable." Must include the honest opposite: "too early to say, keep going".
Reuse the thresholds and "early days" labels already in `computeSignals()`. Add it to the Monday
email too.

### 14. Meta Pixel, blocked

Approved by Kieran, but it cannot be done without him. It would unlock landing page views,
conversions and cost per conversion inside Meta, and let ads optimise towards sales rather than
clicks. Tracking code already exists in the codebase and is dormant.

**Before building: it changes what is collected about visitors, so the cookie and privacy position
has to be settled first, not afterwards.** See `project_wg_tracking` and the existing privacy policy
work. Do items 1 to 13 first and come back to this.

---


### 15. Leave existing members out of the ad figures (5 September 2026)

Kieran, looking at the After the click page: *"anyone that's already a member ... don't count in the
statistics ... it's more likely they've come from meta ... because our website won't be found any
other way realistically."*

Agreed, with one correction that is the whole of the design. **Somebody is judged by what they were
at the moment they arrived, never by what they are today.** Dropping everybody who is a member now
would delete the ad's best possible result: a stranger who clicked the ad, signed up and ordered.
The switch therefore leaves out people who **already had an account when they arrived**, and keeps
anybody who arrived a stranger and joined afterwards.

Two things mark somebody as already a member:

1. they were signed in when the page loaded, recorded from now on as `site_visits.signed_in`, and
2. somebody at the same internet address had signed in or registered **before** that visit, from
   `ip_activity_log`, which is how the rule reaches back over visits recorded before the flag
   existed.

The switch sits at the top of `/admin/ads/after-the-click` and governs the three cards on that page
only. It deliberately does **not** touch spend, clicks or the Compare verdict: those are Meta's own
figures, and a sale is a sale whoever placed it.

Two honesty rules, both on screen: the page always says how many arrivals were existing members,
whichever way the switch is set, so a filtered figure is never a figure with something quietly
missing from it; and it says the signed-in record only starts on 5 September 2026, so older periods
leave out fewer members than newer ones.

**The read never names the new column.** It asks for the value through `to_jsonb(v) ->> 'signed_in'`
instead. A report that named a column the database had not been given yet would fail outright and
answer "no arrivals recorded", which is a lie that reads like data loss. Asked this way, an
un-migrated database answers null, everybody counts as a stranger, and the figures are simply the
ones we had before the flag existed.

### 16. Plain-English page names, not web addresses (5 September 2026)

Kieran: *"it's using slashes ... make it really clear and dummy friendly ... does it mean that people
actually click on certain products?"*

The landing table printed raw addresses. Every row now leads with the name a person would use, with
the address kept underneath in small grey type so a row is still traceable:

| Was | Is now |
|---|---|
| `/account/verify-email` | Confirming their email address |
| `/checkout/success` | Thank-you page, straight after ordering |
| `/shop/retatrutide-pen` | Product page: Retatrutide Pen, Remedium Research, 30mg |
| `/shop/recovery-pen-windsor-glow-bpc-157-tb500-kpv` | Product page: Recovery Pen (Windsor Glow) BPC 157, TB500, KPV |
| `/privacy` | Small print: Privacy policy |

Fixed pages are named in `src/lib/ads/pageNames.ts`. Product, article, category and offer names
cannot be worked out from an address, so `src/lib/ads/pageLabels.ts` looks up only the addresses on
screen (catalogue first, then admin-created products and blog titles) and the admin read hands the
map down. A name that cannot be found falls back to the address tidied into words, so a row never
shows a slug.

And the answer to his question is now printed above the table: **"Then opened a product" means they
went on to look at a product page within a week of arriving, which is interest, not a sale.**
"Ordered within a week" is the one that means money. Every column carries a second line saying what
it counts, and "addresses" became "households" across all three cards on the page.


### 17. An instruction film for Samuel (5 September 2026)

Kieran asked for a clear, visual instruction video explaining the page to Samuel, and especially
what items 15 and 16 mean. It is built the same way as the Bāl walkthrough films: one script file
that carries both the narration and what happens on screen, a headless browser driving the real
admin, Kieran's own ElevenLabs voice, and subtitles burned in.

`02_Kierans-Website-Generator/projects/windsor-glow/ads-walkthrough-video/` holds the whole thing.
The film is 7.1 minutes and its longest chapter is After the click.

**The one thing that had to be solved first.** A shoot loads the Ad Results pages over and over, and
this ad account is on Meta's development access tier where a page load costs about a dozen Graph
calls. Filming straight against Meta would eventually have recorded the dashboard failing. So the
real figures are captured three times up front and written to disk, and the shoot serves them from
there. Everything else on screen is the real page. If the script ever asks for a period that was
never captured, the shoot stops and says so rather than quietly going to Meta.

Two rules the film obeys because it is handed to a person: nothing signs in on camera, and nothing
filmed may spend or change anything. The QC pass checks the finished file for the admin token, for
any key beginning sk_, and for the word localhost.

## What Kieran has to supply

1. **Launch the actual experiment.** Two ads running at once. Until then item 3 has one line and
   item 13 has nothing to compare. Everything can still be built and proven with what is there.
2. **For item 14 only:** create the Pixel in Meta Events Manager and give us the ID, and decide the
   cookie consent position.

Nothing else is blocked. Items 1 to 13 can all be built with the access we already have.

---

## Traps, all of them learned the hard way

- **`vercel env pull` masks every value.** 56 of 71 came back empty including ones that are
  certainly set. It cannot be used to read production back. Set values, do not try to verify by
  pulling.
- **`.env.production.local` outranks `.env.local` for `next start`** and its sensitive values are
  blank, so local admin login answers 503. Rename it for local production tests, restore after.
- **Admin login has an IP brute-force limiter.** Never test production login on a guessed password.
  For local browser checks, set the `wg_admin_session` cookie to `ADMIN_SESSION_TOKEN` from
  `.env.local` instead of logging in.
- **Never run `next build` while `next dev` is running on the same folder.** It corrupts `.next`.
- **Meta returns no row at all for a day nothing ran on.** Any new chart must fill gaps or it will
  draw spend on days that had none.
- **Reach cannot be added up across ads or days.** One person who saw two ads is one person. Let
  Meta recalculate it with its own filter rather than summing.
- **The shared account filter must stay on every insights call.** Filtering only one table leaves
  the totals disagreeing with it. `META_ADS_OWNER_IDS` is
  `1165585146648185,17841443221559012` in both `.env.local` and Vercel production.
- **The costs module is byte-compared with the Social Engine and cannot be edited.** Ads AI spend is
  booked on `ad_advice.cost_minor`.
- **Push to `main` deploys.** Confirm the live deployment afterwards; do not assume.

## How to prove the work

A headless browser harness was used on 4 September and works well. Recreate it rather than trusting
a build to prove a UI change:

- `next dev` on a spare port, session cookie set directly as above.
- `playwright-core` is present in `node_modules`. A script outside the project must import it by
  **absolute file URL** and take the **default** export, because it is CommonJS and a named
  `chromium` import fails.
- Assert DOM structure and text. **Do not take screenshots**: image data is the single biggest cost
  in a long session, and structure is what actually needs proving.
- Also run `npx tsc --noEmit`, `npm run lint` and `npm run build` before every commit.

---

## What was built, decided and trimmed (4 September 2026, the ADSLAB run)

Items 1 to 13 shipped on 4 September, one commit each, in this order: 1, 4, 2, 3, 13, 12, 7, 8, 9,
6, 10, 11, 5. Item 14 is still blocked on Kieran (Pixel ID and the cookie position).

**Decisions taken without stopping, as the table above allows:**

- **Item 2:** orders and sales on a card are matched by campaign tag, because that is what the visit
  log carried. Each boosted post is its own campaign, so that is per ad today. A card says so when a
  campaign holds more than one ad.
- **Item 3:** Meta's hourly breakdown works at ad level on this account but does not carry reach, so
  reach is greyed out in the hourly views and the chart says why. The chart has its own small read
  (`/api/admin/ads/compare`) so a window change does not re-read the whole page.
- **Item 6:** the Meta reader keeps a two-minute memory of answers per server. Proving the page used
  up the ad account's hourly call limit (Meta error 17, "Ad account has too many API calls") and two
  people opening the page a few times would do the same. Also: a boosted post past its end date now
  reads **Finished**, because Meta keeps it ACTIVE, which is how a "running" ad came to have spent
  nothing for a week. Budgets come from the campaign when the ad set has none (boosted posts).
- **Item 7:** the funnel is per campaign tag. The visit beacon now also records `utm_content`
  (the ad id) so two ads in one campaign can be told apart from now on; earlier rows have null.
- **Item 8:** the average order is taken over a year whatever period is on screen, and not offered
  below five orders.
- **Item 9 (trimmed):** Meta does not expose the link behind a boosted Instagram post, only the
  button's words. The landing page therefore comes from our own records of tagged arrivals, joined
  to how each landing page does for everyone. An ad whose button goes to the Instagram profile is
  said to send people to Instagram, not the site.
- **Item 11:** day of week is added up from the live day-by-day rows, not the stored history, because
  the history tables are empty until the daily snapshot has run (Meta access was granted after the
  4 September run) and the live rows are the same numbers.
- **Item 13:** the Monday email's stored history has no orders per ad, so the email's verdict leaves
  the orders sentence out.

**What the real data said while building:**

- Every ad on the account is past its scheduled end date. The "running" post ended on 26 August.
- The paused "thank you" post got its clicks about a third cheaper than the main post (9p against
  14p), over 65 and 172 clicks, which is enough to believe.
- The one tagged ad brought 40 addresses to the home page and not one opened a product page, the
  basket or the checkout. That is the answer to "243 clicks, no orders": the landing page, not the ad.
- Site-wide, the home page turned 63 arriving addresses into 10 product views and 1 order.
- Break-even at the real average order (£169.50 over 59 orders) is one order per £169.50 of spend,
  about one in every 214 visitors at 79p a visitor.

**How it was proven:** the headless browser harness described above, 12 checksets, every check
asserting DOM structure or API values, no screenshots. Plus 13 pure naming tests, 7 database
checks run directly against the real records, and tsc, lint and build before every push.

## Six pages under one bar (4 September 2026, evening, Kieran's request)

Kieran: "one long scroll page is difficult to navigate ... a navigation bar of the dashboard ... when
you click on them it takes you to the page, like the shop header ... drop down boxes so you can change
how the graph looks." Done the same evening:

| Page | Address | What is on it |
|---|---|---|
| Dashboard | `/admin/ads` | Available ad funds, the verdict, the six headline boxes, the two-ad graph, the day-by-day line |
| A and B | `/admin/ads/ab` | The verdict and the two ads being compared, side by side, with the A/B and note editors |
| All ads | `/admin/ads/all` | Every ad including earlier ones, the campaigns table, other tagged links, the account line |
| After the click | `/admin/ads/after-the-click` | The funnel, cost per visitor and break-even, which page each ad sent people to |
| Who and when | `/admin/ads/who-and-when` | Time of day, day of the week, placements, age and gender, countries |
| Advice | `/admin/ads/advice` | What the numbers say, the AI advice, the link tags to set |

- The period, the Refresh button and the spreadsheet download sit in the header on every page.
- The graph's measure and window are dropdowns; the day-by-day chart has a measure dropdown too and
  the headline boxes still drive it.
- One read is shared by all six pages (`src/components/admin/ads/AdsData.tsx`, a provider in
  `src/app/admin/ads/layout.tsx`), so switching pages never asks Meta again. Proven: the navigation
  checkset counts reads across all six pages and finds none.
- Proof: the harness gained a `nav` checkset; all 13 checksets pass (234 checks) on the new pages.

**Kieran's first look at the six pages (4 Sept, 20:43), four fixes shipped straight after:**
the back link now says "Main dashboard" so it cannot be confused with the Ads dashboard tab; the
tab you are on is bold, gold and tinted; the Who and when bars were squashed because the hour labels
sat inside the same box as the bars (hours with a label got a shorter bar), so they are redrawn as
SVG to one scale, bars kept because each hour is its own bucket; and the A and B page opens with two
plain boxes, "Ad A" and "Ad B", listing every ad, with a sentence saying new ads are made in Ads
Manager and appear in the boxes on their own.

**"A and B" became "Compare" (4 Sept, late), on Kieran's second look:** two was not enough ("if I
have five ads running on the go"). Now: a tick list of every ad on `/admin/ads/compare`, up to five
ticked at once, each ticked ad lettered A to E in tick order (one ad per letter, enforced in the
database when a letter is saved); the verdict, the cards and the Dashboard graph follow the ticks
(five line styles). A "New ad" box at the top of that page has the button into Ads Manager's create
screen and the three plain steps, including the one thing only Kieran can do: paste the tag line
into the "URL parameters" box. The old `/admin/ads/ab` address forwards to Compare. The card editor's
A/B buttons became a letter dropdown. Harness: `picker` checkset replaces `pair`.

## The measured design audit and its 17 fixes (4 Sept, late evening)

Kieran asked for a design audit and quality check of everything. It was measured, not eyeballed:
`scripts/audit-ads-pages.mjs` opens all six pages at desktop and phone widths in a headless browser
and reports overflow, text sizes, contrast of small text, tap-target heights, page length, headings
and duplicated wording. He approved all 17 findings ("all please"). What changed, and what the
re-measure showed:

- **Readability:** helper text moved from 2.4:1 contrast to about 5:1; nothing on the pages is
  under 10 pixels any more (was 8); status pills darker; a real heading on every section.
- **Phone:** the six tabs originally wrapped into two rows. The 5 September follow-up replaced that
  with one labelled, swipeable row which stays within reach on long pages and brings the current
  section into view. The main controls and menu buttons are now 44-pixel tap targets; tick-list rows
  remain whole-row targets. Charts are drawn taller with bigger labels on narrow screens (209 pixels
  instead of 110); a tap on a chart does what a hover does.
- **Simpler:** "nothing ticked" said once; the ten secondary figures on a card fold behind "More
  figures"; the campaigns table is gone from All ads (each boosted post is its own campaign, so it
  repeated the cards); the tag-line card left Advice (it lives with the New ad steps on Compare);
  the always-zero Purchases box became Orders from our own records; the graph's second time
  control is labelled "Graph window" with a note; the New ad box folds to one line.
- **Small:** the day-by-day chart moved from the Dashboard to Who and when, so the Dashboard is one
  graph; the card links became buttons.
- Re-measured: Dashboard 2,356 to 1,945 pixels tall on desktop; Compare 2,013 to 1,819; All ads
  1,847 to 1,558. All 14 checksets pass (258 checks).

## Two Windsor Glow ad accounts (5 September 2026)

Kieran published the Ibiza video through Meta Business Suite. Meta placed it in account
`act_4486863841549073`, while the Ad Results panel was reading only
`act_4002287066545281`. Waiting or refreshing could never make that advert appear because the
accounts were separate.

The reader now combines both accounts throughout the Dashboard, Compare, All ads, Who and when,
exports, daily snapshots and watchdog. Each advert and campaign retains its real account ID, so its
Ads Manager button still opens the correct account. The existing account remains first and its
stored history is preserved. Daily account totals are saved under that same first account ID, now
containing the combined Windsor Glow total, so no duplicate history row is created.

Funding is read separately. Account `act_4002287066545281` is prepaid and Meta reports £280
available. Account `act_4486863841549073` is card-billed. Meta puts the masked card number in the
same field it uses for balance wording, so only text explicitly labelled "Available balance" may
be parsed as money. Card digits are never added to the prepaid total. Reach is added across the
accounts and is labelled honestly because one person can be counted once in each account.

Every advert card, comparison row and graph legend now says Account 1 or Account 2 and shows the
last five digits of the real account ID. Spreadsheet downloads carry the full account ID. A missing
campaign tag is also shown on the advert itself, because Meta results still work without that tag
but Windsor Glow cannot tie its own visits and orders to the advert.

Read-only verification on 5 September proved the existing system-user token can access both GBP,
Europe/London accounts. It also saw advert `120250688573010299`, "Promoting website:
https://www.windsorglow.com/", as Running in the second account. The focused browser proof passed
10 of 10 checks, the seven-day Compare feed returned all four adverts including the new one, the
TypeScript check passed and the full production build completed. A later focused audit passed 16
of 16 checks and caught that the new advert has no campaign tag in Meta. That advert's Meta spend,
views and clicks are readable; its Windsor Glow visit and order attribution remains incomplete until
the URL parameters are added in Meta.

Kieran added the required URL parameters to both new Account 2 adverts later on 5 September. A live
read then showed both adverts as Running and both campaign tags as present. Account 1 still holds the
£280 prepaid balance. The running adverts are in Account 2, which is billed to a card, so their spend
does not reduce that £280. The funds card now says this directly rather than leaving the two balances
to be inferred.

The same follow-up re-audited all six pages at 390-pixel phone width and desktop width. The phone uses
the existing admin menu plus a one-row Ad Results section rail. Every section, the period selector,
spreadsheet download and Ads Manager link remain available. The final automated audit found no page
overflow, one section row, the active section visible, every control named, and all checks passed.
