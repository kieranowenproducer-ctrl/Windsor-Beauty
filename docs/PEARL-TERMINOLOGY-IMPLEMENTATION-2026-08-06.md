# PEARL terminology intelligence implementation

> **Purpose:** Record the completed PEARL rename, terminology resolver, product and blend mappings, administrator controls and verification results.
> **Status:** COMPLETE LOCALLY. NOT DEPLOYED.
> **Related projects:** Windsor Glow AI Assistance and the expanded research evidence library.
> **Dependencies:** The 265-entry source-tracked research library, 77-product Windsor Glow composition audit, member gate, existing research question log and administrator authentication.
> **Key decisions:** Keep interpretation deterministic, make uncertain terms ask before searching, keep product strength separate from research dosage, keep component evidence separate from blend claims, preserve provenance and require administrator approval for new runtime terminology.
> **Next steps:** Keep the live PEARL unchanged until Kieran says the exact trigger phrase **pearl upgrade**. Then run final checks before any deployment.
> **Last updated:** 2026-08-07

## 1. Original problem

The old Research Chat could answer questions about canonical compound names, but it had no maintained record of why a nickname, abbreviation, misspelling or stack name should resolve to a particular entry. Its broad typo fallback could recover simple errors, but it could not reliably explain the match, distinguish ambiguous terms, or expand a stack into its components.

## 2. Implementation plan

The completed plan is in [PEARL-TERMINOLOGY-PLAN-2026-08-06.md](./PEARL-TERMINOLOGY-PLAN-2026-08-06.md). It audited ingestion, the 245-entry library, retrieval, conversation context, existing fuzzy matching, citations, safety boundaries, member access and every visible old name before implementation.

## 3. Architecture selected

PEARL now processes a question in this order:

1. Preserve the exact question for the existing privacy-conscious log.
2. Normalise case, spacing, punctuation, hyphens and Greek-letter forms for matching only.
3. Check exact compound names.
4. Check approved aliases, abbreviations, misspellings and phonetic forms.
5. Check approved blend and stack names.
6. Use recent conversation context only for an incomplete follow-up.
7. Run conservative Damerau-Levenshtein typo matching against entity-like phrases.
8. Continue only for a unique high-confidence match.
9. Ask a one or two option clarification for a medium-confidence or ambiguous match.
10. Expand retrieval with the approved canonical entry and approved blend components.
11. Run the existing research, dose, source and safety answer engine.
12. Record unresolved, corrected and rejected terms for staff review.

There is no embedding or vector-search service in this implementation. A language model is not allowed to invent a match, component list, source or answer. This is the safest fit for the current browser-side deterministic research engine.

## 4. Main parts changed

| Area | Change |
|---|---|
| Research engine | Added terminology resolution, query expansion, blend answers, disclosure, ambiguity handling and context protection. |
| Terminology records | Added structured, source-tracked compound and blend records. |
| Member interface | Renamed the customer tool to PEARL and added friendly correction and clarification controls. |
| Member data feed | Added a protected route that returns approved administrator terminology only. |
| Administrator area | Added PEARL Terminology management and expanded PEARL Questions review. |
| Database | Added the idempotent `pearl_terminology_overrides` table. |
| Logging | Added interpretation details to the existing research question log without adding medical details. |
| Tests | Expanded research coverage and pinned member, admin and production-preview access rules. |
| Documentation | Added the plan, this completion record and the project change-log entry. |

The main files are `terminology.mjs`, `chat-engine.mjs`, `ResearchDesk.tsx`, the PEARL admin page and routes, `pearlTerminology.ts`, `schema.ts`, and the research/access test scripts. Compatibility names such as `ResearchDesk`, `mode=research`, `research_chat_log` and `/api/account/research-log` remain internal so this change does not create a risky migration.

## 5. Terminology schema

Built-in and administrator records carry the fields needed for safe review:

- Record type or kind.
- Canonical slug and display name.
- Accepted aliases, abbreviations, misspellings and phonetic forms.
- Related or ambiguous compound slugs.
- Blend components and whether the composition is fixed.
- Source links and source role.
- Confidence level.
- Review status.
- Automatic-resolution permission.
- Enabled or disabled state.
- Last verified date.
- Notes and conflict warnings.

Administrator records begin in review state and stay inactive until approved. A blend requires at least two components. Every new record requires at least one HTTPS source.

## 6. Confidence and disambiguation rules

- **High confidence:** An exact canonical name, approved unique alias, approved unique abbreviation, approved misspelling, or unique close spelling can continue automatically.
- **Medium confidence:** PEARL asks a short question and offers at most two choices. No research answer is retrieved until the member confirms.
- **Low confidence:** PEARL says it could not verify the term and records it for staff review.
- Short abbreviations and stored misspellings are never used as fuzzy targets.
- Ordinary words must not match a short alias inside a longer word.
- A fuzzy result needs a strict distance threshold and a clear lead over the next candidate.
- A named new compound overrides old conversation context.
- TB-500 and full-length thymosin beta-4 remain separate.
- CJC-1295 without a formulation remains a clarification question.
- A correctly written canonical name is never given an unnecessary correction message.

## 7. Initial aliases and shorthand

The first reviewed set includes:

- RETA and LY3437943 for Retatrutide.
- SEMA and the approved product names for Semaglutide retrieval.
- TIRZ and the approved product names for Tirzepatide retrieval.
- BPC for BPC-157.
- TB500, TB 500, TB4-FRAG and Ac-LKKTETQ for the TB-500 library entry.
- GHK, GHK copper and Copper Tripeptide-1 for GHK-Cu.
- MOTS C and MOTSc for MOTS-c.
- SS31, Elamipretide, MTP-131 and Bendavia for SS-31.
- Cibinetide and HBSP for ARA-290.
- TA-1, TA1 and Thymalfasin for Thymosin Alpha-1.
- Common reviewed missing-letter, extra-letter, repeated-letter, transposed-letter and phonetic forms for the entries above.

## 8. Initial blend and stack mappings

Commercial and community sources establish naming only. Scientific claims still come from the stronger evidence attached to each component.

| Approved name | Components | Naming source |
|---|---|---|
| Wolverine Stack | BPC-157 and TB-500 | [Peptide Hub profile](https://peptidehub.bio/peptides/wolverine-blend), [Peptide Hub guide](https://peptidehub.bio/journal/wolverine-stack-bpc-157-tb-500-research-guide) |
| Glow Stack | GHK-Cu, BPC-157 and TB-500 | [Peptide Hub guide](https://peptidehub.bio/journal/glow-stack-ghk-cu-skin-hair-research-guide), [Peptide Hub glossary](https://peptidehub.bio/glossary) |
| KLOW Stack | GHK-Cu, KPV, BPC-157 and TB-500 | [Peptide Hub profile](https://peptidehub.bio/peptides/klow-blend) |
| Wolverine Recovery Pen | BPC-157, TB-500 and KPV | [Windsor Glow product](https://windsorglow.com/shop/wolverine-recovery-pen) |
| CJC-1295 No DAC and Ipamorelin Blend | CJC-1295 No DAC and Ipamorelin | [Windsor Glow product](https://windsorglow.com/shop/cjc-1295-no-dac-ipamorelin-10mg) |
| Retatrutide and Cagrilintide Pen | Retatrutide and Cagrilintide | [Windsor Glow product](https://windsorglow.com/shop/omnimorph-retatrutide-pen) |
| Calm and Clarity Blend | PE-22-28, Pinealon and Selank | [Peptide Hub profile](https://peptidehub.bio/peptides/calm-clarity-blend) |
| Gut Healing Stack | BPC-157, KPV and Larazotide | [Peptide Hub profile](https://peptidehub.bio/peptides/gut-healing-stack) |
| Longevity Master Stack | Epithalon, Thymalin, MOTS-c and SS-31 | [Peptide Hub profile](https://peptidehub.bio/peptides/longevity-master-stack) |
| MCAS Protocol Stack | VIP, ARA-290, KPV and Thymosin Alpha-1 | [Peptide Hub profile](https://peptidehub.bio/peptides/mcas-protocol-stack) |
| Mito Stack | SS-31, MOTS-c and NAD+ | [Peptide Hub profile](https://peptidehub.bio/peptides/mito-stack) |

## 9. Disputed, conditional and unapproved mappings

- GLP-3 is informal shorthand. It suggests Retatrutide but requires confirmation.
- TB is ambiguous. It asks between TB-500 and full-length thymosin beta-4.
- CJC-1295 asks whether DAC is present.
- Glow Stack is approved as a name for the three listed components, but its ratios and product strengths are not standardised. It is medium confidence.
- The Glow figure of 900 mcg to 1,800 mcg total blend daily is clearly labelled as a commercial/community source range, not a clinical regimen or recommendation.
- Unknown stack names are never given an invented component list.
- Peptide University material was excluded from evidence because it did not meet the project's traceability and safety standard. PeptideGPT exposed no usable cited knowledge. Neither was used to invent mappings.
- New administrator proposals remain unapproved until a staff member reviews their sources and activates them.

## 10. Automated results

| Check | Result |
|---|---:|
| Research, terminology, all 245 entries, 77 products and every numerical dose answer | 72 of 72 passed |
| Privacy and safety | 13 of 13 passed |
| Member and administrator access | 20 of 20 passed |
| Concierge-to-PEARL handover | 20 of 20 passed |
| Existing Concierge and escalation behavior | 35 of 35 passed |
| Production compile, type check and page generation | Passed |

The exhaustive coverage check asks for both numerical dose information and research information for every one of the 265 customer-facing research entries. Product checks separately prove that all 77 audited catalogue names resolve to the correct record.

## 11. Manual results

Design read: **Member research assistant | Adult Windsor Glow members | Calm, trusted and evidence-led | Preserve the established Windsor Glow editorial style.** The redesign mode was Preserve, with design variance 2/10, motion 1/10 and visual density 6/10. The existing serif, stone and gold system remains intact, while the PEARL book mark gives the research mode one clear identity.

The frontend pre-flight found no visible em dashes or en dashes in the new interface. New gold buttons use the site's approved accessible gold shade, action text fits without wrapping, corner radii are consistent, responsive grids collapse cleanly, and no new animation or dark theme was introduced into the existing light-only brand system.

The local browser review confirmed:

- The public header remains AI Assistance and PEARL appears as the second member option.
- The PEARL consent screen shows the full expanded name and the research-only limits.
- RETA retrieves Retatrutide evidence and openly states the interpretation.
- Glow Stack retrieves the approved component mapping and the source-labelled 900 mcg to 1,800 mcg number with the non-clinical warning.
- GLP-3 asks for confirmation and offers one clear Retatrutide button.
- Source lists remain collapsed until the member chooses to view them.
- The existing Concierge remains a separate mode and its opening behavior is unchanged.

The browser review found one unnecessary second correction after accepting the GLP-3 suggestion. That wording defect was fixed and pinned with an automated regression test.

## 12. Screenshots

- [PEARL consent screen](./screenshots/pearl-consent-desktop.png)
- [RETA interpreted as Retatrutide](./screenshots/pearl-reta-alias-desktop.png)
- [Glow Stack components and source-listed range](./screenshots/pearl-glow-blend-dose-desktop.png)

## 13. Successful typo examples

- `retatrutdie` resolves to Retatrutide.
- `retatrutied` resolves to Retatrutide.
- `Wolverene Stack` resolves to Wolverine Stack.
- `Glo Stack` resolves to Glow Stack.
- `semaglootide` resolves to Semaglutide as an approved phonetic form.

## 14. Abbreviation examples

- `RETA` resolves to Retatrutide and PEARL explains the interpretation.
- `BPC` resolves to BPC-157.
- `TB` does not auto-resolve because it can mean more than one thing.

## 15. Stack and blend examples

- Wolverine searches the blend profile, BPC-157 and TB-500.
- Glow searches the approved name plus GHK-Cu, BPC-157 and TB-500.
- Each remaining approved stack searches its stored components.
- Component research is kept separate from evidence about the combination.

## 16. Clarification examples

- `What is GLP-3?` asks whether the member means Retatrutide.
- `What is TB?` offers TB-500 and Thymosin Beta-4.
- `What is CJC-1295?` asks for with DAC or without DAC.
- `Phoenix Recovery Stack` receives an unverified-name response with no invented components.
- A medium-confidence spelling match offers no more than two likely options.

## 17. Retrieval confirmation

Correction is not cosmetic. The resolver returns the approved canonical slug, and the research engine retrieves that exact library entry. Blend records return their approved component slugs. Tests confirm that an old context entry cannot override a newly named compound and that all 245 canonical entries still return their original research and dose records.

## 18. Citations, safety and access confirmation

Substantive answers retain the source links attached to the retrieved entry. Informal terminology sources are labelled as commercial/community material. Emergency wording, personal-advice blocks, administration-instruction blocks and stack-recommendation blocks run before normal research answers. PEARL uses the same member gate as the Concierge. Its maintenance page and endpoints remain protected by the existing administrator middleware.

## 19. Remaining risks and recommended improvements

- Informal blend names can change between sellers. Review them periodically and keep the verification date current.
- The administrator table will be created idempotently when the deployed app next ensures its database schema. No live database write was made during this local task.
- The local visual-review route returns a production 404 and must remain local-only.
- Review unknown-term and rejected-suggestion counts after controlled release before approving new aliases.
- A future semantic search service is optional. It should only rank already-approved records and must not replace the deterministic terminology gate.

Nothing in this task has been committed, pushed or deployed.

## 20. Product composition and answer-position extension

PEARL now contains a reviewed composition record for every one of the 77 Windsor Glow products in the 6 August 2026 catalogue audit. It recognises storefront names, common stack names and reviewed spelling errors. A question such as `What is in KLOW?` now returns GHK-Cu 50mg, BPC-157 10mg, TB-500 10mg and KPV 10mg, while clearly saying these are amounts in the product rather than a recommended dose.

The provenance travels with every composition answer. Windsor Glow facts, product-name facts, outside-source splits, worked-out splits and unknown formulas are not presented as equal. The plain Glow Pen remains visibly unconfirmed. Peptide Complex and PAG~NRG return `composition not recorded`, and PEARL never guesses their contents. HHB is identified as a vitamin and nutrient mixture, and UP-389 as an amino-acid mixture with unpublished ratios. Neither is described as a peptide blend.

The approved stack list increased from eight to eleven with Wolverine Recovery Pen, the CJC-1295 No DAC and Ipamorelin blend, and the Retatrutide and Cagrilintide pen. A dosage question returns source-listed numerical records for every component and separately shows the Windsor Glow product composition where one is recorded.

The answer-position fault is also fixed. After each question, the top of the new answer moves to 16px below the measured sticky header. Browser measurements were 151px with a 135px desktop header for two consecutive answers, and 159px with a 143px phone header for two consecutive answers. The input releases focus when the question is sent, and Clear conversation still returns to the opening card.

## 21. Final public search and DSIP address correction

A final public search found several independent 70mg GLOW pen listings that use the same 50mg GHK-Cu, 10mg BPC-157 and 10mg TB-500 split. This supports the existing worked-out record, but it does not prove what is inside Windsor Glow's own plain Glow Pen. PEARL therefore keeps that split visibly unconfirmed until the Windsor Glow label or supplier sheet is checked.

No credible public result connected an exact ingredient list to Windsor Glow's Peptide Complex or PAG~NRG. Those two records still say the composition is not recorded. This is deliberate: a similarly named product from another seller is not evidence of the Windsor Glow formula.

The live 10mg DSIP product still uses the older `dsip-5mg` internal catalogue key. The local site now presents the accurate `/shop/dsip-10mg` address, redirects the old 5mg-looking address to it, and uses the corrected address in PEARL's product source link. Stock and order references are unchanged. Nothing has been deployed.

## 22. Final organisation and error check

PEARL is documented in the existing Windsor Glow project map. Its member page, protected routes, research engine, administrator controls, database record, safety order, tests and supporting documents now have one clear home in the current system.

The final spelling audit found and fixed one edge case. `DSIP 5mg` had been able to clash with the old internal key retained by the current DSIP 10 product. Customer wording now resolves the two strengths separately: `DSIP 5mg` points to the 5mg research record, while `DSIP 10mg` points to the current 10mg product. The internal stock and order key is unchanged.

Permanent tests now check:

- All 11 approved stack and blend definitions.
- All 64 canonical stack names, aliases and reviewed stack misspellings.
- All 85 automatically approved compound aliases, misspellings and phonetic forms.
- All 44 reviewed Windsor Glow product aliases, including separate DSIP 5mg and DSIP 10mg results.
- The correct component list for every recognised stack.
- All 77 audited Windsor Glow product identities.
- Numerical dosage evidence and research information for all 265 customer-facing research entries.
- Unknown formulas, safety boundaries, member access, administrator access and handoff rules.

The final results were:

- PEARL research and terminology: 75 of 75 passed.
- Member and administrator access: 20 of 20 passed.
- Concierge handoff: 20 of 20 passed.
- Privacy and safety: 13 of 13 passed.
- Escalation and route sharing: 35 of 35 passed.
- Website, Concierge and stored shipping knowledge: 17 of 17 passed.
- Administrator colour contrast: passed.
- Customer cost-data protection: passed.
- Type checking: passed.
- Clean production build: passed, including all 98 generated pages.
- Restored local PEARL preview: HTTP 200 on port 3401.

Nothing has been committed, pushed or deployed.

## 23. Research comparison upgrade

PEARL can now compare two or three recognised compounds in one answer. Each
compound receives the same four plain-English fields: research purpose,
evidence quality, half-life and development status. The comparison uses the
source-labelled records already held by PEARL and keeps differences visible
without deciding which compound is better, safer or suitable for a member.

Comparison recognition now covers ordinary wording such as `compare`, `versus`,
`what is the difference`, `which has stronger evidence` and `which lasts
longer`. Personal questions such as `Which should I use?` still stop at PEARL's
existing safety boundary rather than becoming recommendations.

The answer cards use the existing Windsor Glow white, stone and gold styling.
Two compounds sit in two columns and three compounds sit in three columns on a
wide screen. On a phone, the cards stack in a clear reading order.

Permanent checks cover two-compound and three-compound comparisons, broader
question wording, approved versus investigational status, equivalent half-life
formats and the important distinction between TB-500 and full-length Thymosin
Beta-4. After the PeptideDeck extension below, PEARL's research test total is 83 of 83 passed. The 13 safety
checks, 20 access checks and 20 handoff checks also passed. Type checking and
the clean 98-page production build passed. This task adds only the approved
comparison improvement. The other four suggested upgrades were not added.

Nothing in this comparison upgrade has been committed, pushed or deployed.

## 24. PeptideDeck evidence extension

PeptideDeck's 86 public compound profiles were mapped and compared with PEARL's existing library. Most were already covered. Ten genuine gaps were added: Argireline, Dulaglutide, Lanreotide, Lixisenatide, Matrixyl, Nesfatin-1, PACAP-38, PTD-DBM, Thymopentin and Vosoritide.

PeptideDeck was used as a discovery guide, not as final proof. Its supplier promotions, affiliate material, reconstitution, syringe units, injection technique, cycles, stacks and self-use schedules were excluded. Each added number now points to an original paper or official medicine information. Animal experiments remain clearly labelled and are never converted into human doses.

The audit found that PeptideDeck's PACAP-38 page linked PMID 19595407 as PACAP research even though it is an unrelated respiratory-virus paper. PEARL records that mismatch but does not show the bad link to members. It uses the verified PACAP-38 human migraine-provocation study at PMID 24501094 and clearly says the infusion provoked migraine-like attacks rather than treating them.

PEARL now contains 255 customer-facing research entries. All 255 return numerical dosage evidence and research information. The permanent research test set is now 83 of 83 passed, including checks for every new PeptideDeck entry, the PACAP-38 correction and the separation of mouse data from human treatment information. The type check, 13 safety checks, 20 member-access checks, 20 handoff checks and the full 98-page production build also passed. The local PEARL preview was restored on port 3401 and sample PACAP-38 and misspelled Vosoritide questions were checked on screen.

Nothing in this extension has been committed, pushed or deployed.

## 25. Deployment trigger agreed with Kieran

Kieran does not want this upgraded local PEARL library deployed yet. Keep the current live PEARL unchanged.

The exact trigger phrase **pearl upgrade** is Kieran's instruction to run the final checks, apply the complete saved local upgrade to PEARL and make it live. If a test, login, hosting or deployment problem appears, stop and explain it rather than publishing an incomplete version or losing existing PEARL functionality.

## 26. WikiPep evidence extension

WikiPep's public directory exposed 341 article links. They were mapped and compared with PEARL, but the site was treated as a discovery guide rather than final proof because it mixes educational pages with vendor promotions, calculators, reconstitution, administration guidance and stacks.

Ten missing prescription-peptide records were added after their numerical schedules and research context were independently checked against current official medicine information: Bivalirudin, Cetrorelix, Ganirelix, Goserelin, Histrelin, Nafarelin, Dasiglucagon, Enfuvirtide, Eptifibatide and Etelcalcetide. The entries cover hospital anticoagulation and antiplatelet care, monitored fertility treatment, hormone suppression, severe-hypoglycaemia rescue, specialist HIV treatment and haemodialysis care.

Two WikiPep problems were kept out of member answers. Its Matrixyl 3000 page transfers a pal-KTTKS Matrixyl study to a different two-peptide blend. Its C16 Peptide page pairs a 2 mg/kg EAE table with a cited BV-2 cell study that describes a different model. Neither claim was imported.

The local PEARL library now contains 265 customer-facing research entries. All 265 return numerical dosage evidence and research information. The permanent research set now has 87 checks, all passing, including coverage for every new medicine, the fertility category and both rejected WikiPep mismatches.

Nothing in this WikiPep extension has been committed, pushed or deployed. The **pearl upgrade** deployment gate remains unchanged.
