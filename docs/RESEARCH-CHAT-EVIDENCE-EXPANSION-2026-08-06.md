# PEARL evidence expansion

> **Purpose:** Record what was added from the supplied research links, how conflicts were handled, and what was tested.
> **Status:** LIVE ON WINDSOR GLOW.
> **Related projects:** Windsor Glow PEARL.
> **Dependencies:** The original 105-entry research library and the ten additional links supplied by Kieran.
> **Key decisions:** Keep the original library intact, give every entry numerical dosage evidence, prefer official medicine information and published human research, label animal and community numbers clearly, and never promote calculators or stacking instructions into preferred evidence.
> **Next steps:** Monitor member questions and review any wording that PEARL cannot confidently match.
> **Last updated:** 2026-08-10

## What was processed

Eleven sources were processed, including the original PEARL reference:

1. The original Peptide Reference
2. The Peptide Handbook
3. PepCodex
4. Peptide Hub
5. Halflife Labs
6. Peptpedia
7. PeptideDosage.org
8. Peptide University Codex
9. PeptideGPT
10. PeptideDeck
11. WikiPep

The audit mapped 2,915 pages, 826 profile entries and 651 analysed records. Those records were compared and merged into 232 source-tracked research profiles. PeptideDosage.org contributed 173 fully reviewed protocol pages, but only four profiles were added or strengthened after their numbers were checked against original papers, registered trials or official product information. Every reachable PeptideDeck blog-index page and article was reviewed, alongside its 86 public profiles. Ten genuine profile gaps were imported after independent checks. WikiPep exposed 341 pages; ten medicine gaps were added only after their numbers were independently confirmed in current official product information. Peptide University's public selector added one mapped database page with 122 entries, but none were imported because the profiles mixed uncited claims with exact dosing and administration instructions. The supplied PeptideGPT page remained unavailable and exposed no source files or citations.

The live chatbot's original 105 entries were all preserved. The local chatbot now has 265 searchable entries after duplicate names and aliases were joined.

| Website | Profiles imported | Other useful pages mapped | Notes |
| --- | ---: | ---: | --- |
| Original Peptide Reference | 105 | Pinned baseline page | All original entries were preserved. |
| The Peptide Handbook | 117 | 10 | All public structured profiles were read. |
| PepCodex | 102 | 290 condition pages and 269 comparisons | Conditions now improve category questions. |
| Peptide Hub | 44 | 40 journal pages | 110 product-strength pages, calculators, mixing and stack instructions were not made preferred evidence. One stale CagriSema profile link returned 404. Other sources still cover CagriSema. |
| Halflife Labs | 44 | Database and method pages | Pharmacokinetic context was kept with route and species where stated. Calculators were excluded. |
| Peptpedia | 46 | 30 comparisons and 31 deep research pages | Every public markdown profile was read. |
| PeptideDosage.org | 4 | 382 mapped pages, including 173 protocol pages | All 173 protocols were reviewed. Glepaglutide, Efinopegdutide and PNC-27 were added, and DSIP was strengthened. The site's mixing, syringe, injection, supply, stack and modelled protocol content was excluded. |
| PeptideDeck | 10 | 459 pages, including 285 editorial articles | Every reachable blog-index page was checked. Category and goal wording improve topic questions. Affiliate links and self-use instructions were excluded. |
| WikiPep | 10 | 341 pages | Every page exposed by the main index was checked. Ten gaps were added after current official medicine checks. Calculators, reconstitution, injection guidance, stacks and vendor material were excluded. |
| Peptide University Codex | 0 | 1 database page with 122 entries | The full public selector was mapped. Three representative profiles were inspected across established, investigational and preclinical examples. No PubMed, DOI or trial citations were exposed, so the 122 entries remain discovery-only and their dosing, injection, reconstitution, cycle, washout and stack instructions were excluded. |
| PeptideGPT | 0 | 0 | The supplied link returned 404. No GPT knowledge files, source list or traceable citations were available, so no AI-generated claims were imported. |

The complete machine-readable audit is stored in `docs/research-chat-evidence-audit.generated.json`. It records the source page and a content fingerprint for each claim.

## 2026-08-09 category, spelling and context repair

- PEARL now recognises a much wider range of research topics, including anxiety, stress, mood, sexual health, fertility, hormones, pain, skin, hair, joints, bone, cardiovascular, liver, kidney, respiratory, cancer and neurological research.
- Topic questions are handled before compound spelling checks. Asking for the best peptide research for a goal no longer produces unrelated compound suggestions.
- A newly chosen category overrides an older answer. Clicking **Weight loss** after asking about Glow now returns weight-loss research rather than repeating the Glow answer.
- Long spelling mistakes such as `ratatouilletide` produce a cautious **Retatrutide** confirmation instead of a false answer.
- Selank, PT-141, Melanotan II and Kisspeptin records were strengthened with traceable published or official numerical evidence.
- Unknown goals fail safely. PEARL does not use an unrelated word from a study title to invent a category match.

## Major knowledge added

- New and emerging metabolic compounds, including Amycretin, CagriSema, Survodutide, Mazdutide and other pipeline compounds.
- Sleep and wakefulness research, including Alixorexton, Oveporexton, narcolepsy and daytime sleepiness.
- Better healing and recovery context for BPC-157, TB-500, thymosin beta-4, GHK-Cu and related compounds.
- Better pharmacokinetic context, including species, route and the difference between plasma half-life and reported biological effects.
- More condition links for muscle growth, healing, sleep, weight loss, cognition, immunity, metabolism and longevity.
- More aliases, abbreviations and common brand names.
- Published paper and trial links from the supplied sites.
- Source-labelled research ranges with route, frequency, duration, population and species retained when the source stated them.
- Glepaglutide phase 2 and phase 3 research, including the difference between the once-weekly and twice-weekly trial outcomes.
- Efinopegdutide obesity and fatty-liver study arms.
- PNC-27 preclinical mouse data, with no human dose claimed.
- A stronger DSIP record based on the six-person historical intravenous study rather than a community subcutaneous schedule.
- Corrected Dihexa papers and 2025 retraction notices.
- Official manufacturer leaflets for the Russian Thymogen intramuscular and nasal products.
- Ten independently verified PeptideDeck gaps covering cosmetic, metabolic, neurological, immune, growth and preclinical research.
- Official labels for Dulaglutide, Lanreotide, Lixisenatide and Vosoritide.
- A corrected PACAP-38 human provocation record, with PeptideDeck's unrelated PubMed link rejected.
- Ten official medicine records discovered through WikiPep, covering anticoagulation, fertility care, hormone suppression, severe hypoglycaemia, HIV treatment and haemodialysis care.

## Numerical dosage coverage

Every one of the 265 customer-facing entries now returns numerical dosage evidence and research information.

The strongest available number is shown in this order:

1. Official medicine information.
2. Published human studies.
3. Registered human trials.
4. Animal or laboratory studies, with the species or model stated.
5. Source-listed community protocols, clearly marked as low confidence.

The expanded library had 67 entries without a usable numerical protocol. Those gaps were checked against PubMed, ClinicalTrials.gov and official medicine labels. The resulting numerical records keep the dose, route, frequency, duration, population, species, evidence type and source link together.

Numbers from animal studies are never converted into human doses. Numbers for modified analogues are not borrowed silently from the parent compound. Where a parent-compound figure is the only available number, the answer says that it does not validate the modified analogue. Community-only bioregulator figures are shown as unvalidated source listings, not as established human doses.

## Conflicts resolved automatically

1. **BPC-157 half-life.** The preferred wording is about 15 minutes in a rat pharmacokinetic study. There is no validated human half-life. This is stronger than unsupported estimates of about 30 minutes or 4 hours.
2. **TB-500 identity.** TB-500 stays separate from full-length thymosin beta-4. Human evidence for thymosin beta-4 is not transferred to TB-500.
3. **CJC-1295 formulations.** The DAC and non-DAC forms stay separate because their pharmacokinetics are different.
4. **Uncited dose ranges.** A published study protocol takes priority when it states the species, route, population, frequency and duration. Product-strength and calculator ranges stay secondary and clearly labelled. Peptide University's uncited syringe, injection, reconstitution, cycle, washout and stack instructions were not imported.
5. **BPC-157 sport status.** The current official 2026 WADA list says BPC-157 is prohibited under S0. This replaces the older source note that said it was no longer prohibited.
6. **CagriSema approval status.** Peptide Hub contains conflicting statements. Official FDA and Novo Nordisk information showed that CagriSema remained investigational, with a US decision expected in Q4 2026. The claimed approval on 25 May 2026 was rejected.
7. **PeptideDosage route modelling.** The site's generic injection and reconstitution format was rejected where it was not the route used in the original study or official product information. This includes its modelled injection treatment of oral Ventfort.
8. **PNC-27 references and dose.** Several PubMed numbers on the source page resolved to unrelated PET, orchid and liver-transplant papers. They were rejected. PEARL uses the full primary mouse AML paper and shows 40 mg/kg and 100 mg/kg mouse experiments only.
9. **Dihexa evidence.** Incorrect PubMed links and community human-use ranges were removed from preferred dosage evidence. PEARL now shows the 2 mg/kg daily rat study and makes the 2025 retractions prominent.
10. **Thymogen formulation.** The site's modelled subcutaneous protocol was rejected. PEARL keeps the official Russian intramuscular and nasal products separate and cites their manufacturer leaflets.
11. **Svetinorm source.** The incorrect Ventfort link was removed. The low-confidence oral product figure now links to the actual Svetinorm product page.
12. **PeptideDeck PACAP-38 citation.** PeptideDeck labelled PMID 19595407 as PACAP research, but it resolves to an unrelated respiratory-virus paper. PEARL excludes it from customer answers and uses the verified human provocation study at PMID 24501094.
13. **WikiPep Matrixyl 3000 identity.** A pal-KTTKS study supports the single peptide commonly called Matrixyl, not the different two-peptide Matrixyl 3000 blend. The evidence was not transferred to the blend.
14. **WikiPep C16 citation.** The page's 2 mg/kg EAE table and its listed Han 2010 BV-2 cell-study reference describe different experimental models. PEARL does not show that number until the exact animal primary paper can be identified and checked.

## BPC-157 human evidence count decision

**BPC-157 human evidence count**

- The Peptide Handbook lists 2 human studies.
- PepCodex lists 3 human studies.
- Peptpedia says no completed peer-reviewed human clinical trial.

They count registered, unpublished, retrospective and pilot reports differently. The decision is not to choose one number. The chatbot says that published human evidence is sparse, small and not supported by completed large randomized efficacy trials. Confidence in that limitation is high. Confidence in any single count is low.

## Retrieval and safety testing

All local checks passed:

- 108 PEARL research and terminology checks.
- 13 Concierge safety checks.
- 20 Concierge-to-PEARL handoff checks.
- 20 members-only access checks.
- 35 escalation checks.
- Full production build.

The PEARL checks cover direct questions, difficult wording, spelling mistakes, aliases, category questions, comparisons, ambiguous CJC-1295 wording, conversational follow-ups, conflicting sources, dosage context, emergencies and personal treatment boundaries. One full-coverage check asks for dosage and research information for all 265 entries and fails if any answer lacks a number or returns the old vague placeholder. Dedicated checks protect the PeptideDeck and WikiPep additions, verify the expanded categories, test the Retatrutide spelling error, prevent unrelated category matches and prove that a new category clears old answer context.

The separate database-writing handover probe was not rerun because it would create and remove test data in the live external database. This knowledge update does not change that handover system.

## Areas where more primary research would help

- Full peer-reviewed human trials for BPC-157, TB-500, Epithalon, DSIP and other mostly preclinical compounds.
- Official medicine labels for every approved compound, including UK regulator sources.
- Primary pharmacokinetic papers for values that the supplied sites state without route or species.
- Completed trial results for newer metabolic and orexin compounds.
- A scheduled check of regulatory and WADA status because these can change.
- The original documents or traceable citations behind PeptideGPT.
- Primary references for Peptide University entries before any of its narrative or protocol claims can be used.
- Periodic PeptideDeck citation checks because the audit found one unrelated PubMed destination.
- Periodic WikiPep citation checks because the audit found two evidence-matching problems.

## Deployment status

Kieran approved the complete repair for live deployment on 2026-08-10. Commit `49cf0eb` was built successfully by the production host and published to Windsor Glow. The live domain and members-only gate were checked after deployment. The PEARL design is unchanged. The Concierge rules, member access, shop and checkout systems were not changed.
