# Account Concierge — cost model and controls

> **Updated:** 2026-08-02. Rates checked against Anthropic's published first-party
> pricing on that date. Corrected 2026-08-25: the rate file had moved, and the Sonnet 5 rate and
> the spend ceilings below were out of date. Update this file when a price changes, and change
> the numbers in `src/lib/costs/pricing.ts` at the same time: that file is the only place a rate
> is written down.

---

## 1. Where the money goes

| Source | Rate | Notes |
|---|---|---|
| Claude Sonnet 5 input | $2.00 / M tokens until 31 August 2026, then $3.00 | The answering model. Both dates are in `pricing.ts`; the changeover needs no edit on the day. |
| Claude Sonnet 5 output | $10.00 / M tokens until 31 August 2026, then $15.00 | Capped at `CONCIERGE_MAX_OUTPUT_TOKENS` (default 700). |
| Claude Haiku 4.5 input | $1.00 / M tokens | Used only when a spending ceiling forces a downgrade. |
| Claude Haiku 4.5 output | $5.00 / M tokens | |
| Cache reads | 10% of the input rate | Applies to the stable system block. |
| Cache writes | 125% of the input rate | Paid once per 5-minute window. |
| OpenAI `text-embedding-3-small` | $0.02 / M tokens | One call per model-routed turn, plus ingestion. |
| Neon (aisupport DB) | shared compute | 4 to 6 small indexed queries per turn. |
| Vercel function time | shared | A turn is 2 to 8 seconds. |
| Royal Mail | £0 | No tracking API is called. There is no tracking API in this project. |

**Prompt caching does not help the cheap path.** Sonnet 5 caches from a 1024-token prefix;
Haiku 4.5 needs **4096**. The concierge's stable instruction block is roughly 900 to 1,100
tokens, so it caches on Sonnet and silently does not on Haiku. That is why the degrade ladder
drops to Haiku for savings on the *model rate* and does not assume a caching saving on top.

---

## 2. Measured, not estimated

From the live test run on 2026-08-02 (`scripts/test-concierge-live.mjs`, 49 checks, cold cache):

| Measure | Value |
|---|---|
| Total metered spend for the run | **$0.1176** |
| Turns executed | 22 |
| — answered by a model | 10 (45%) |
| — blocked before any model (compliance, kill switch) | 6 |
| — answered from data with no model (router, degraded mode) | 5 |
| — served from the answer cache | 1 |
| Cost of a **model** turn | **$0.0118** (~0.9p) |
| Cost across **all** turns | **$0.0053** (~0.4p) |

A second run of the identical suite against a **warm** cache cost **$0.0000** and made zero model
calls: 11 of its 22 turns came from the cache and the rest were blocked or deterministic. That is
the mechanism working, not a measurement error, and it is why the suite now clears its own cache
entries before measuring.

Across the two cold runs recorded on 2026-08-02, a model turn cost between **$0.005 and $0.012**.
The scenarios below use the **higher** figure, so the numbers are a ceiling rather than a hope.

**This test mix is deliberately adversarial** — a quarter of it is compliance probes and prompt
injection. A real customer mix skews far more heavily toward order questions (deterministic, free)
and policy questions (cached after the first customer asks them), so 45% model-routed is a
pessimistic assumption.

---

## 3. Scenarios

Assumptions, stated so they can be argued with:

- 6 turns per conversation.
- **Pessimistic mix:** 45% model-routed, as measured on the adversarial suite → 2.7 model turns.
- **Realistic mix:** 25% model-routed, on the basis that order and navigation questions dominate a
  signed-in account surface and repeat policy questions cache → 1.5 model turns.
- $0.0118 per model turn.

| Scenario | Conversations / month | Realistic | Pessimistic |
|---|---|---|---|
| One normal conversation | 1 | $0.018 (~1.4p) | $0.032 (~2.5p) |
| One support-heavy customer | 20 | $0.35 (~28p) | $0.64 (~50p) |
| 100 customers, 1 conversation each | 100 | **$1.77** (~£1.40) | **$3.19** (~£2.50) |
| 1,000 customers, 1 conversation each | 1,000 | **$17.70** (~£14) | **$31.86** (~£25) |
| 1,000 customers, 3 conversations each | 3,000 | **$53.10** — over the monthly ceiling, so it would degrade to the cheap model partway through the month | **$95.58** — likewise |
| Abuse: one account hammering it all month | — | capped at 40 turns/day and 250/month by the per-account allowance → **max $2.95** | same |
| Abuse: many accounts at once | — | **capped at `CONCIERGE_MONTHLY_USD_CAP`, default $62.50**, regardless of how many accounts | same |

Two things to read off that table:

1. **At Windsor Glow's current scale the concierge costs a couple of pounds a month.** The default
   $50 monthly ceiling is roughly three times the pessimistic 1,000-customer figure, so it is a
   backstop rather than a constraint.
2. **The 3,000-conversation row is the one to watch.** It exceeds the default ceiling, which means
   the service would degrade rather than overspend. If real traffic approaches that, raise
   `CONCIERGE_MONTHLY_USD_CAP` deliberately rather than discovering the degrade in a customer
   conversation.

**Cost of *not* having the deterministic router and cache:** if every turn went to a model, the
1,000-customer realistic row would be 6,000 model turns rather than 1,500 — **$70.80 instead of
$17.70**, i.e. four times the bill and over the ceiling.

---

## 4. Controls, and what each one actually stops

### Per message
| Control | Default | Env var |
|---|---|---|
| Max message length | 1,500 chars | `CONCIERGE_MAX_MESSAGE_CHARS` |
| History sent to the model | 8 turns | `CONCIERGE_MAX_HISTORY_TURNS` |
| Retrieved chunks | 6 | `CONCIERGE_MAX_CHUNKS` |
| Output tokens | 700 | `CONCIERGE_MAX_OUTPUT_TOKENS` |
| Tool rounds | 4 | `CONCIERGE_MAX_TOOL_ROUNDS` |
| Request timeout | 25s | `CONCIERGE_TIMEOUT_MS` |

### Per account
| Control | Default | Env var |
|---|---|---|
| Burst | 12 / 10 min | `CONCIERGE_BURST_10MIN` |
| Hourly | 30 | `CONCIERGE_PER_HOUR` |
| Daily | 40 | `CONCIERGE_PER_DAY` |
| Monthly fair use | 250 | `CONCIERGE_PER_MONTH` |

Counters live in the `concierge_hits` and `concierge_usage` tables, not in memory, so they hold
across every serverless instance. The previous public widget used an in-memory `Map`, which on
Vercel gave one bucket per instance and therefore almost no limit at all; it now shares this
governor.

### Platform
| Control | Default | Env var |
|---|---|---|
| Daily ceiling | $6.25 (Kieran's £5 at the ledger's 0.80 rate) | `CONCIERGE_DAILY_USD_CAP` |
| Monthly ceiling | $62.50 (Kieran's £50 at the ledger's 0.80 rate) | `CONCIERGE_MONTHLY_USD_CAP` |
| Kill switch | on | `CONCIERGE_ENABLED=off` |

At **70%** of either ceiling the concierge routes everything to the cheap model. At **100%** it
stops calling a model at all. It does not stop working: orders, tracking, prices, stock,
policies and navigation are answered from data, and the route to a person is always offered.

### Reductions already implemented
- **Deterministic router** — order status, tracking, greetings, thanks, human handover and site
  navigation answer from data with zero model calls. Biggest single lever.
- **Answer cache** — identical first-turn non-personal questions reuse a stored answer for
  `CONCIERGE_CACHE_TTL_HOURS` (default 24). Keyed with a knowledge-base version stamp, so a
  re-ingest retires every cached answer rather than serving stale policy. Personal turns are
  never cached.
- **Prompt caching** — the stable instruction block carries `cache_control`, worth ~90% off that
  portion on Sonnet.
- **Compliance blocks before the model** — an emergency or a personal-dosing request costs zero.
- **Bounded everything** — history, chunks, output tokens, tool rounds, wall clock.

### Not implemented, and why
- **Semantic (fuzzy) caching.** Would need a second embedding per turn to look up, which costs
  something on every miss, to save on a smaller set of near-duplicate hits. Revisit if the
  admin dashboard shows a high exact-cache hit rate; the data to make that call is now recorded.
- **A cheaper model for routine answers by default.** Tempting, but Haiku cannot cache the
  system prefix (see §1) and gave noticeably worse link-first answers in the previous pilot. It
  is used as the degrade step, not the default.

---

## 5. Watching it

`/admin/concierge` shows spend today and this month against both ceilings, how many turns
avoided a model, the 30-day daily chart, the heaviest accounts, and any case where the team was
never notified. Numbers nobody reads are not a control, which is why this screen exists.
