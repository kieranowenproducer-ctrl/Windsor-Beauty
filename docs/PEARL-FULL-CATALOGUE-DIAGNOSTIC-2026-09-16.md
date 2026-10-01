# PEARL full catalogue dosage diagnostic

> **Purpose:** Explain why PEARL does not give a dosage answer for every Windsor Glow product.
> **Status:** REBUILD COMPLETE LOCALLY. NOT DEPLOYED.
> **Related:** PEARL, the shop catalogue, hidden admin products and the full machine-readable audit.
> **Dependencies:** The live Windsor Glow catalogue and PEARL's current approved research library.
> **Key decisions:** A pass requires a real research-dose answer. A product strength or ingredient amount does not count as a dosage answer.
> **Next steps:** Obtain the missing source facts for HHB, UP-389, PAG~NRG and Peptide Complex, then rerun the release check before any separately approved deployment.
> **Last updated:** 2026-09-17

## Result after the rebuild

The local rebuild now gives a numerical, source-tracked answer for every catalogue product where the supplied material contains a numerical record.

| Final check | Result |
|---|---:|
| Products in the admin catalogue | 83 |
| Live products | 54 |
| Hidden products | 29 |
| Products with a numerical source-backed answer | 79 |
| Genuine source-data gaps | 4 |
| Customer wording checks passed | 395 of 415 |
| Staff wording checks passed | 395 of 415 |
| Product follow-ups with a numerical answer | 79 of 83 |

The 20 unanswered customer checks and 20 unanswered staff checks are the five wording variants for the same four products. PEARL now says the information is missing and does not invent it.

The four remaining gaps are:

| Product | Visibility | Missing fact |
|---|---|---|
| HHB Hair Skin Nails | Live | Ingredients are recorded, but no product-use or research-dose protocol is present. |
| UP-389 | Live | Ingredients are recorded, but individual amounts and a product-use or research-dose protocol are not present. |
| PAG~NRG | Hidden | The formula and dosage source are not recorded. |
| Peptide Complex | Hidden | The formula and dosage source are not recorded. |

The compiler now uses the supplied commercial, community and licensed-source records as instructed. Every numerical row retains its source and evidence wording. Sources that must stay private are traceable in the administrator view but are not named to members.

The production build passes. The changes are local only and have not been deployed.

## Original diagnostic result

The customer complaint is correct.

PEARL was checked against every product currently shown in the admin catalogue, including hidden products.

| Check | Result |
|---|---:|
| Products in the admin catalogue | 83 |
| Live products | 54 |
| Hidden products | 29 |
| Products that passed every customer wording | 70 |
| Products that failed | 13 |
| Live failures | 5 |
| Hidden failures | 8 |
| Customer wording checks passed | 350 of 415 |
| Staff wording checks passed | 350 of 415 |
| Conversational follow-ups passed | 70 of 83 |

Five common dosage phrasings were used for every product. The same five were checked in the staff view. Each product was also introduced in a normal question and followed with “What dose?”.

The customer and staff results are identical. This is important: the failures are not caused by PEARL refusing dosage questions for customers. When PEARL reaches the correct record, it answers even wording such as “How much should I take?”.

## The five live failures

| Product | What happens | Cause |
|---|---|---|
| HGH (191 AA) Human Growth Hormone | PEARL asks the customer to choose between full HGH and HGH Fragment. | The dosage data exists under HGH 191AA, but the exact shop name is treated as ambiguous instead of being locked to that product. |
| HHB Hair Skin Nails | PEARL returns the ingredient amounts in the vial. | PEARL has the composition, but no research dosage protocol. The old check could mistake product amounts for a dosage answer. |
| Ipamorelin 10mg + CJC-1295 No DAC | PEARL asks the customer to choose one component. | Both component records have dosage data. The exact shop blend name is not being handled as a blend dosage question. |
| Retatrutide / Cagri Pen, Omnimorph | PEARL shows a research-dose heading with no figures beneath it. | Both components have dosage data. The blend answer reads a narrower data field and misses the figures used by the individual Retatrutide and Cagrilintide answers. |
| UP-389 | PEARL lists ingredients and says their amounts are not published. | The composition is recorded as proprietary, with no individual amounts and no dosage protocol. This is a genuine data gap, not a refusal. |

## The eight hidden failures

| Product | What happens | Cause |
|---|---|---|
| B7-33 | PEARL describes the product but does not give a dose. | The B7-33 product is not linked to PEARL's Relaxin record. That Relaxin record already contains a numerical protocol. |
| CJC-1295 | PEARL asks whether the customer means with DAC or without DAC. | Both records contain dose figures, but the shop product does not say which formulation it is. This needs a catalogue decision, not a guess. |
| Follistatin-315 | PEARL says no source-listed numbers are held. | The research profile exists, but its loaded source contains no numerical protocol. |
| HGH Fragment 176-191 | PEARL says no source-listed numbers are held. | The research profile and supporting sources exist, but no numerical protocol was extracted. The old audit incorrectly borrowed AOD-9604's dose because the names overlap. |
| IGF-1 DES | PEARL says no source-listed numbers are held. | The research profile exists, but its loaded source contains no numerical protocol. |
| PAG~NRG | PEARL says the composition is not recorded. | No one has recorded what the product contains. |
| Peptide Complex | PEARL says the composition is not recorded. | No one has recorded what the Windsor Glow blend contains. |
| Wolverine Recovery Pen, Remedium | PEARL shows a research-dose heading with no figures beneath it. | BPC-157, TB-500 and KPV each have figures. The blend answer does not read the data field holding them. |

## Why the previous checks passed

The previous PEARL proof was strong at checking the research library, spelling, short names and ordinary conversation. It did not prove the current admin catalogue end to end.

Three gaps allowed this problem through:

1. The previous dosage report left hidden products out on purpose.
2. It counted text such as “No preferred range has been established” as if a dose existed because the field was not empty.
3. Its name matching could borrow a related product's record. The clearest case is HGH Fragment 176-191 being reported with AOD-9604's dose even though the customer-facing answer correctly says it has no figures.

There is also one old visibility row for a deleted test product called `qa-debug-minimal-product`. It does not appear in the 83-product admin catalogue and does not affect customers.

## What this proves

- PEARL is not applying a blanket dosage refusal.
- The failures are repeatable and deterministic.
- Some failures are recognition or blend wiring problems even though the needed figures already exist.
- Some products have a research profile but no numerical protocol inside the loaded PEARL data.
- Three products need business or supplier information before PEARL can give a truthful answer: UP-389, PAG~NRG and Peptide Complex.
- CJC-1295 needs the shop formulation confirmed as with DAC or without DAC.

## Repair order

1. Fix the four live routing and blend problems: HGH 191AA, Ipamorelin plus CJC, Retatrutide plus Cagri, and HHB's misleading composition response.
2. Decide what can truthfully be published for UP-389.
3. Link B7-33 to the existing Relaxin record.
4. Add verified numerical records for Follistatin-315, HGH Fragment 176-191 and IGF-1 DES if the supplied source material genuinely contains them.
5. Confirm the exact CJC-1295 formulation.
6. Record the compositions for PAG~NRG and Peptide Complex before either product is made live.
7. Fix the Wolverine blend to use its components' existing dose records.
8. Make the full 83-product customer-wording check a required release test.

## Evidence files

- `docs/pearl-dosage-audit-all-products.md` contains every product and each failed customer wording.
- `docs/pearl-dosage-audit-all-products.json` contains the complete machine-readable result.
- `scripts/pearl-dosage-audit.mjs` can repeat the live and hidden audit with `--all --probe`.

No customer-facing code, live product, database row or deployment was changed during this diagnostic.
