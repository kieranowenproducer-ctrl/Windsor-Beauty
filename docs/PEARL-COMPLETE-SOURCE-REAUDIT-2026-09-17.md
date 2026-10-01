# PEARL complete source re-audit

> **Purpose:** Record what PEARL re-read, what changed, what is now covered and what still cannot be answered honestly.
> **Status:** IMPLEMENTED LOCALLY, NOT DEPLOYED
> **Related:** PEARL, Windsor Glow product catalogue, dosage calculator, AI Concierge
> **Dependencies:** The supplied public sources remaining available; the Windsor Glow catalogue recording the exact product formula.
> **Decisions:** Every supplied source is retained. Source quality changes the label shown with an answer, not whether the information is allowed into PEARL. Numerical figures are never invented.
> **Next Steps:** Obtain the missing formula or supplier protocol for the three named product gaps, then rerun the product contract before deployment.
> **Last Updated:** 2026-09-17

## What was re-read

- 15 supplied source collections were checked.
- 4,264 individual pages or captured records now have receipts.
- 13 sources were completely read and imported.
- One was read apart from a stale page that the source website itself does not return.
- One old PeptideGPT link is dead and exposes no documents to import.
- Peptide University was captured from its live interactive selector. All 122 of its records were read, including commercial and community protocols that had previously been omitted.
- The rebuilt evidence library contains 525 merged source profiles. Pearl exposes 549 unique customer-facing research entries after the original catalogue records are combined with that library.
- 3,460 full source pages are linked into the server-side article search. Guide, category, legal and privacy pages remain articles rather than being mislabelled as compounds.

The page-by-page proof is in `docs/pearl-source-receipts.md` and `docs/pearl-source-receipts.json`.

## What changed

- Commercial, community, calculator, product-strength and other supplied material is retained instead of being discarded because it is not medical-grade.
- Every answer keeps its source and its source type, so a customer can distinguish a study record from a commercial or community protocol.
- Full article sections are available to the answer layer. The AI evidence packet ranks the most relevant passages instead of using only the first three sources.
- The full article index stays on the server. Customers receive the compact product library, not the entire research archive in their browser.
- Product names are linked directly to the research record used for dosage answers. This repaired HHB, Glutathione 1500mg and Melanotan I.
- PEARL now explains the Windsor Glow dosage calculator, including its fields, units, U-100 scale and V3 pen result. It does not choose a dose.
- Numerical dose answers offer the calculator explanation as the next step.
- The AI Concierge sends calculator and research questions to PEARL. A collision between the compound named CART and the shopping-cart word is handled explicitly.
- New permanent checks fail if a catalogue product that previously had a numerical answer loses it, if a source disappears silently, or if calculator guidance stops working.

## Product result

80 of the 83 current and hidden catalogue products now return a numerical source-listed answer. This is 96.4% coverage.

The Peptide University import filled a real previous gap for HHB. PEARL now holds its complete listed formula and the source's 0.5 to 1 mL, 1 to 2 times weekly protocol. The answer labels it as a commercial/community protocol.

## The three honest product gaps

1. **PAG~NRG:** no supplied record identifies its formula. A dosage record cannot be linked to an unknown product.
2. **Peptide Complex:** no supplied record identifies the components or their amounts. Generic articles using the words "peptide complex" are not proof of this Windsor Glow product's formula.
3. **UP-389:** Windsor Glow records its ingredients, but none of the supplied records contains a protocol for that exact formula. Peptide University's similarly named Super Human Blend has different ingredients, so its dosage has not been falsely attached to UP-389.

PEARL gives a clear no-source-held answer for those three rather than refusing vaguely or inventing a figure.

## Source pages that could not be read

- Peptide Hub lists a CagriSema page that returns 404.
- Every mapped PeptideDosages.com page was eventually captured. Earlier 504 timeouts cleared during the final retry.
- The supplied PeptideGPT link returns 404 and provides no underlying files or citations.

These failures are recorded by URL and status in the receipts. They are not hidden or counted as successfully read.

## Remaining limitations

- The three product gaps require exact supplier or label information. More AI cannot safely infer a proprietary formula.
- Peptide University is an interactive website, so PEARL uses a dated local capture. The supplied refresh command must be run when that site changes.
- The free deterministic response engine constructs customer answers now. The optional model-written conversational layer remains restricted to administrator testing in the current customer screen. Releasing that layer to customers needs a separate controlled rollout because it creates ongoing model cost and needs live monitoring.
- No live website deployment was made in this task.
- No paid AI generation call was made during this rebuild.

## Repeatable proof

The final local production build passed. The catalogue contract passed for all 571 checks, the
conversation suite passed all 49 checks, and the complete 549-entry dosage, evidence and personal-wording
sweep passed. Calculator guidance, concierge handoff and the optional conversation layer also passed their
focused checks.

- `npm run pearl:capture-pep-university`
- `npm run pearl:source-receipts`
- `npm run pearl:source-completeness`
- `npm run test:pearl-product-doses`
- `npm run test:pearl-calculator-guidance`
- `npm run test:handoff`
- `npm run check:pearl-recognition`

The product completeness result and each product's answer receipt are in `docs/pearl-source-completeness.md` and `docs/pearl-source-completeness.json`.
