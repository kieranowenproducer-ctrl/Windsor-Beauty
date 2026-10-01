# PEARL recognition challenge pack

> **Purpose:** Give Samuel and future testers a repeatable way to challenge PEARL's understanding of product names, abbreviations and spelling mistakes.
> **Status:** ACTIVE
> **Related:** PEARL Test and Improve, the shop catalogue and the recognition release gate.
> **Dependencies:** The current Windsor Glow product catalogue.
> **Key decisions:** A confident match may answer. A partial or ambiguous match must offer choices. A rejected choice must be saved for review.
> **Next steps:** Repeat this pack after adding a product, alias or major answer source.
> **Last updated:** 2026-09-13

## How to test

Use PEARL's **Test and Improve** screen. Test each name in a natural question, such as `What is the dosage for [name]?`.

For every product currently sold, try all six forms:

1. The exact shop name.
2. The name in capitals.
3. The name without spaces or punctuation.
4. Two neighbouring letters swapped.
5. One letter missing.
6. One letter repeated.

PEARL's automated release gate runs these checks across all 61 current products. It also checks all 294 shop keywords, all 300 research records, 808 meaningful short prefixes and 1,094 generated spelling mistakes.

## Tester cases to repeat by hand

| Type | Enter | Expected result |
|---|---|---|
| Spoken abbreviation | `M2 dosage` | Melanotan II |
| Common format | `MT-2 dosage` | Melanotan II |
| Roman numeral | `MT-II dosage` | Melanotan II |
| Condensed name | `SLU332 dosage` | SLU-PP-332 |
| Three-letter name | `what does slu do` | SLU-PP-332 overview |
| Misspelling | `Tesamol dosage` | Tesamorelin |
| Partial name | `tesa dosage` | A clickable **Use Tesamorelin** choice |
| Partial name | `fox dri dosage` | A clickable **Use FOXO4-DRI** choice |
| Product family | `HGH dosage` | Choices, not a guessed product |
| Incomplete number | `HGH 191 dosage` | Choices, not a guessed product |
| Shared beginning | `SEMA dosage` | Semaglutide and Semax choices |
| Shared name | `GHK dosage` | GHK, GHK-Cu and topical GHK-Cu choices |
| Ambiguous family | `folli dosage` | Both Follistatin products as choices |
| Unknown words | `zibble frax information` | No confident product answer |
| Ordinary phrase | `What should I take to relax?` | Must not mistake “relax” for a product |
| Ordinary phrase | `What should I take to get a tan?` | Must not mistake “tan” for a product name |

## Pass rules

- A clear name reaches the correct product.
- A spelling mistake may be corrected only when one answer is clearly safer than the rest.
- A shortened or shared name shows clickable choices.
- **None of these** saves the rejected choices in PEARL's review history.
- Clicking a choice keeps the original request. A dosage question stays a dosage question.
- No unrelated product is presented as a confident answer.
- A broad goal question such as `Which peptides are researched for longevity?` remains a goal search and is not mistaken for a similarly named stack.
- The Overview screen shows products protected, keywords covered, active saved tests, rejected suggestions and wording still needing review.

## Release rule

Run `npm run check:pearl-recognition` before publishing any PEARL recognition change. A failure blocks the release until it is understood and fixed.
