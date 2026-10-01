# PEARL terminology intelligence plan

> **Purpose:** Record the audit and implementation plan for renaming Research Chat to PEARL and adding controlled terminology recognition.
> **Status:** COMPLETE LOCALLY. NOT DEPLOYED.
> **Related projects:** Windsor Glow AI Assistance.
> **Dependencies:** The existing 242-entry research library, source audit, dosage priorities, member access gate and research question log.
> **Key decisions:** Keep retrieval deterministic. Resolve approved terms before research retrieval. Use conservative spelling correction. Ask for clarification when a term is ambiguous. Keep community blend names separate from scientific evidence.
> **Next steps:** Review the completed implementation record and separately approve any commit or live deployment.
> **Last updated:** 2026-08-06

## What the system does now

The member tool runs a deterministic research engine in the browser. It searches 242 source-tracked entries built from the original reference library and five imported research websites. Two further supplied sources are recorded but were not imported because one did not expose traceable evidence and the other was unavailable.

The engine currently:

- Removes punctuation and letter case before matching.
- Matches canonical names and aliases already present in source profiles.
- Uses a simple edit-distance check when no exact match is found.
- Uses the last named compound for short follow-up questions.
- Retrieves fixed research, dose, safety, mechanism and source records.
- Records each member question and answer for staff review.
- Applies emergency, personal-advice, administration and stack-recommendation boundaries before answering.

There is no embedding or vector-search service in PEARL. There is no language model choosing a compound. The live Concierge is a separate service and hands detailed research questions to this isolated member tool.

## Why terminology can fail

The current matcher has no approved record of why an alias is valid, how confident it is, whether it is ambiguous, or which source supports it. Its fuzzy check compares individual words with compact names and uses one broad threshold. It can recover some spelling errors, but it cannot reliably distinguish a safe correction from a similar unrelated name. Blend names are present only when a source happened to import them as a compound-style profile. Their components are not a separate searchable relationship.

## Selected architecture

PEARL will use this order:

1. Preserve the member's original question.
2. Normalise case, spacing, punctuation and hyphenation only for matching.
3. Check exact canonical names.
4. Check approved aliases, abbreviations, scientific names and brand names.
5. Check approved blend and stack records.
6. Apply recent conversation context only to genuinely incomplete follow-ups.
7. Run conservative typo matching against entity-like words and phrases.
8. Continue automatically only for a unique high-confidence result.
9. Ask a short question for a medium-confidence or ambiguous result.
10. Keep low-confidence terms unresolved and record them for staff review.
11. Expand retrieval only with the approved canonical term and approved blend components.
12. Run the existing evidence retrieval and safety rules.
13. Explain any alias or correction used and retain the sources behind it.

Known terminology will be deterministic. The present local research engine will remain the source of answers. A language model will not be allowed to invent aliases, blend components or evidence.

## False-match protection

- Exact phrase and token boundaries prevent short aliases appearing inside ordinary words.
- Short or ambiguous abbreviations are never fuzzy matched.
- Typo correction requires an entity-like term, a strict distance threshold, a clear lead over the next candidate and an approved destination.
- Similar formulations such as CJC-1295 with and without DAC remain separate.
- TB-500 remains separate from full-length thymosin beta-4.
- Medium-confidence matches show no research answer until the member confirms.
- A clarification presents at most two likely options.

## Blend and stack maintenance

Blend records will store their name, aliases, components, whether the composition is fixed, sources, confidence, approval state, verification date and conflict notes. Commercial or community names will be labelled as such. Research about each component will remain separate from evidence about the combination. A source-listed blend range will not be presented as a validated human regimen.

The initial approved set will use the supplied Peptide Hub pages for terminology only. It includes Wolverine, Glow, KLOW, Calm and Clarity, Gut Healing, Longevity Master, MCAS Protocol and Mito mappings. Scientific claims will continue to use the stronger sources already attached to each component.

## Administrator workflow and logging

The existing protected research-question page will highlight unresolved, ambiguous and corrected terms. PEARL will store interpretation metadata with the existing question record, without adding health details or a separate conversation transcript. Approved terminology will live in a structured configuration file with a validation test. This is the safe source of truth for initial production use. Proposed or disabled mappings remain inactive until reviewed.

## Rename strategy

Customer-facing headings, labels, buttons, messages, accessible names and member guidance will use **PEARL**. The expanded name, **Peptide Experimental Analysis Research Library**, will appear in the introduction. Existing internal component names, URL query values, database table names and API paths will stay unchanged where renaming would create migration risk. Comments and documentation will explain this compatibility choice.

## Test plan

Automated checks will cover:

- All 242 canonical entries and their existing dose and research answers.
- Missing, extra, repeated and transposed letters.
- Spacing, punctuation, hyphenation and capitalisation.
- Approved and ambiguous abbreviations.
- Exact, alternative and misspelled blend names.
- Blend components and conflicting definitions.
- Ordinary words and similar compound names that must not be auto-corrected.
- Recent conversation context and fresh-topic resets.
- Actual retrieval using the resolved canonical entry.
- Source links, research-only boundaries, personal-advice restrictions and access controls.
- Visible PEARL wording and the compatibility identifiers that must remain unchanged.

The final check will run the research, safety, access, handoff and escalation suites, then a production build and local browser review at desktop and mobile sizes.
