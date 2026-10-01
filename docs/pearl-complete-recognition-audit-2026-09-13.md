# PEARL complete recognition audit

> **Purpose:** Record the release proof for the complete product, source-name, spelling, answer-intent and conversation audit.
> **Status:** LIVE AND VERIFIED
> **Related:** PEARL Test and Improve, the recognition challenge pack and the approved answer baseline.
> **Dependencies:** The 61-product shop catalogue and the 300-record approved PEARL research library.
> **Key decisions:** Unique short names resolve; shared short names offer choices; AI may interpret language but factual answers remain in reviewed records; research questions asked in Concierge are automatically carried into PEARL.
> **Next steps:** Samuel can repeat the challenge pack in Test and Improve.
> **Last updated:** 2026-09-13

## Coverage completed

| Check | Result |
|---|---:|
| Shop products by exact name | 61 passed |
| Shop product phone and punctuation forms | 366 passed |
| Shop product three-character starts | 61 passed |
| Shop catalogue keywords | 294 passed |
| Research records | 300 covered |
| Meaningful three-to-six character research prefixes | 808 passed |
| Generated spelling mistakes | 1,094 passed |
| Exact purpose and dosage pairs | 300 passed |
| Exact risk, evidence and half-life checks | 900 passed |
| Single-subject dosage follow-ups | More than 250 passed |
| Approved answer baseline | 2,423 answers reviewed and saved |

## Repairs made during the audit

- `SLU` now reaches SLU-PP-332.
- Shared families such as HGH, GHK, SEMA, Follistatin and CJC offer the relevant choices instead of silently choosing one.
- Choosing a record keeps the original purpose, dosage, evidence, risk or half-life request.
- TB4-FRAG no longer incorrectly opens TB-500.
- Blend dosage answers no longer present non-numeric “no established dose” wording as a dosage figure.
- Ordinary goal words such as `relax`, `hair`, `gut` and `longevity` are not mistaken for similarly named products in category questions.
- Conversation tests retain the selected subject for follow-up dosage questions and correctly change subject when the user corrects it.
- Concierge now checks every message against PEARL's current catalogue as a second safety net. A PEARL question switches desks automatically and keeps the customer's exact wording. Price, stock, delivery and order questions remain with Concierge.

## Safety boundaries retained

- Dosage figures and sources come from the selected reviewed record, not from AI.
- Shared or uncertain names require a choice.
- AI is bypassed for dosage, administration, safety and emergency routes.
- The saved database test suite was unavailable in the clean local deploy checkout because no database connection is configured there. The code-level test reports this as skipped rather than passed.

## Live proof

- Deployed from commit `a3884e9` on 13 September 2026.
- The authenticated live dashboard reports 61 products, 294 keywords, 300 research records, 808 short forms and 1,094 spelling checks.
- The production build completed successfully before deployment.

## Concierge handoff proof

- Four common research questions were checked for all 300 PEARL records: purpose, audience or benefit, dosage and risks.
- Every approved abbreviation and alias was checked for routing.
- Generic evidence, benefit and research-category wording was checked.
- The PEARL acknowledgement remains mandatory and a forwarded question is never answered until the customer presses Ask.
- Concierge follow-ups read the latest rendered conversation, preventing a quick second question from being sent with stale history.
