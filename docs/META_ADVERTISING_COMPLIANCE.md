# Meta advertising compliance — Windsor Glow

**What this is.** The working rulebook for advertising Windsor Glow on Facebook and Instagram.
Written in plain English so anyone on the team can use it without a legal background.

**What this is not.** Legal advice, and not a permanent truth. Every important rule below is
traceable to a live source with the date it was checked. Rules change. Re-check them.

> **Read this first.** The hardest limit on Windsor Glow advertising is **not** Meta. It is UK
> medicines law, which is stricter than any platform rule and carries criminal penalties rather
> than an account ban. Passing a Meta review does not make an ad lawful.

---

## Overview

Windsor Glow sells research peptides. A large part of the catalogue is either a **prescription-only
medicine** in the UK, an **unlicensed medicine** approved by no regulator anywhere, or a substance
**Meta names as prohibited**. That means:

- The products themselves can never be advertised to the UK public. Not with a disclaimer, not
  with a "research use only" label, not in an educational frame.
- Ads about the *company* and about *how peptide research works* may be possible, but they are
  judged on the whole picture, including the website they point at.
- Two pages on windsorglow.com would likely fail review on their own: `/calculator` and
  `/dosage-guide`.

---

## Last policy review

| | |
|---|---|
| **Date last reviewed** | 20 August 2026 |
| **Reviewed by** | Claude (research pass), for Kieran |
| **Next review due** | 20 November 2026, or sooner if an ad is rejected |
| **Confidence** | High on UK law. High on the named Meta policies. Medium on how a Meta reviewer treats a brand-only ad from a seller of these compounds, because that is a judgement call Meta makes and does not publish. |

**Re-check sooner than the due date if any of these happen:** an ad is rejected, the ad account is
restricted, the MHRA publishes a new warning about weight-management medicines, the ASA publishes a
new enforcement notice, or the catalogue changes.

---

## Official sources

All checked **20 August 2026** unless stated.

### Meta (primary)

| Source | URL |
|---|---|
| Introduction to the Advertising Standards | https://transparency.meta.com/policies/ad-standards/ |
| Drugs and Pharmaceuticals | https://transparency.meta.com/policies/ad-standards/restricted-goods-services/drugs-pharmaceuticals/ |
| Unsafe Substances / unsafe supplements | https://transparency.meta.com/policies/ad-standards/dangerous-content/unsafe-supplements |
| Health and Wellness | https://transparency.meta.com/policies/ad-standards/restricted-goods-services/health-wellness/ |
| Locally Illegal Content, Products, or Services | https://transparency.meta.com/policies/ad-standards/unacceptable-content/locally-illegal-products-services/ |
| Online Pharmacies | https://transparency.meta.com/policies/ad-standards/content-specific-restrictions/online-pharmacies/ |
| Ads review process | https://www.facebook.com/business/ads/review-policy-guidelines |
| About ad destinations | https://www.facebook.com/business/help/1174990279685960 |
| Verification requirements for advertisers | https://www.facebook.com/business/help/810450577622394 |
| Updates to detailed targeting | https://www.facebook.com/business/help/458835214668072 |

### UK regulators (primary)

| Source | URL |
|---|---|
| Human Medicines Regulations 2012, Part 14 (advertising) | https://www.legislation.gov.uk/uksi/2012/1916/part/14/made |
| MHRA Blue Guide — Advertising and Promotion of Medicines in the UK | https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/956846/BG_2020_Brexit_Final_version.pdf |
| MHRA — Advertise your medicines | https://www.gov.uk/guidance/advertise-your-medicines |
| MHRA warning on promoting weight-management medicines (published 18 June 2026) | https://www.gov.uk/government/news/warning-on-promoting-newly-licensed-prescription-only-medicines-and-unlicensed-medicines-for-weight-management |
| MHRA Guidance Note 8 — what is a medicinal product | https://www.gov.uk/guidance/borderline-products-how-to-tell-if-your-product-is-a-medicine |
| ASA/CAP — Weight control: prescription-only medicines | https://www.asa.org.uk/advice-online/weight-control-prescription-only-medicines.html |
| ASA/CAP — Prescription-only weight loss products: an enforcement notice | https://www.asa.org.uk/news/prescription-only-weight-loss-products-an-enforcement-notice.html |
| ASA/CAP — Prescription for Compliance: POMs and the Code | https://www.asa.org.uk/news/prescription-for-compliance-poms-and-the-code.html |

**Rule for maintainers:** never write a rule in this file without a source row above. If you cannot
source it, mark it clearly as *interpretation*.

---

## Meta Verified vs Business Verification

These are three different things and they are often confused.

| Thing | What it is | Do we need it? |
|---|---|---|
| **Meta Verified for Business** | A paid monthly subscription. Gives a verified badge, impersonation protection, priority human support, faster appeal reviews. | **No, not to advertise.** It is a support and trust product, not an advertising permission. Meta's own materials position it as optional benefits. *Interpretation: the priority-support benefit has some real value for an account in a high-risk category, but buying it does not make a prohibited ad permitted and does not clear an underlying account flag.* |
| **Business verification** | Confirming the legal entity behind the Business Portfolio — company name, registration, address. Documents are real company records. | **Probably yes, eventually.** It is commonly required to unlock higher spend, certain API access, and it is requested automatically in regulated categories. Doing it early is legitimate and sensible. |
| **Advertiser / identity verification** | Confirming the identity of the person or entity paying for the ads. Triggered automatically by spend thresholds, or by advertising in a regulated industry. | **Assume yes.** Health-adjacent advertising is exactly the trigger case. |

**Everything entered must match the real company records.** Never invent or approximate a company
name, number or address to get through a form.

---

## Required account structure

The recommended structure, and why each part exists.

```
Meta Business Portfolio  (owned by the COMPANY, not a personal profile)
│   Legal entity: the real registered company behind Windsor Glow
│   Admins: at least 2 people, each with 2FA on
│
├── Facebook Page — Windsor Glow            (owned by the Portfolio)
├── Instagram professional account          (linked, owned by the Portfolio)
├── Ad account — Windsor Glow               (owned by the Portfolio, company billing)
├── Verified domain — windsorglow.com       (proves we control the destination)
└── Datasets / Pixel + Conversions API      (only if we actually measure something)
```

| Component | What it does | Do we need it? | Why |
|---|---|---|---|
| Business Portfolio owned by the company | The container that owns every other asset | **Yes** | If assets are owned by a personal profile, losing that profile loses the lot |
| Facebook Page | Required identity for Instagram ads | **Yes** | Ads run from a Page, even Instagram-only ones |
| Instagram professional account | The ad surface we care about | **Yes** | Reels is where the budget goes |
| Ad account owned by the Portfolio | Where campaigns and billing live | **Yes** | Personal ad accounts cannot be transferred cleanly |
| Domain verification | Proves we control windsorglow.com | **Yes** | Needed to control link editing and to configure web events; also a trust signal |
| Two-factor authentication on all admins | Stops account takeover | **Yes** | An advertising account with a payment card attached is a theft target |
| Meta Pixel / Conversions API | Measures what happens after the click | **Only if we advertise at all**, and only for aggregate traffic measurement at first | Do not install conversion tracking on peptide product pages. See "Targeting" below |
| Custom audiences from the website | Retargeting site visitors | **No, not at first** | Building an audience from people who browsed peptide pages is health-adjacent audience building. Avoid |
| Catalogue / Shops / Commerce | Selling on Meta | **No. Never.** | Would put prohibited products directly into Meta's commerce surfaces |
| Meta Verified subscription | Badge, support, faster appeals | **Optional** | Not required to advertise |

### Ownership and recovery rules

1. The Business Portfolio is owned by the **company**, never by one person's personal profile.
2. **At least two admins**, so a lost phone is not a lost business.
3. **Two-factor authentication on every admin**, without exception.
4. Business email addresses on the company domain, not personal Gmail, wherever Meta allows it.
5. Least privilege: give people the smallest role that lets them do their job. Most people need
   *Advertiser*, not *Admin*.
6. Billing is a company payment method, not a personal card.
7. Write down the recovery method for each admin (backup codes, recovery email) and store it where
   the company can reach it if one person is unavailable.

**Current state, checked 20 August 2026:** a Meta app, a system-user token and an ads account ID are
already configured in the Social Engine (`META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN`,
`META_SYSTEM_USER_TOKEN`, `META_ADS_ACCOUNT_ID` are all set). These are used to **read** spend and
performance figures. Before any campaign runs, confirm **who owns** the portfolio and ad account
those credentials point at, because that ownership is what everything else hangs from.

---

## Drugs and pharmaceuticals policies

What Meta's published policy says, and what it means for us.

### Prohibited

- Ads may not promote the **sale or use of illicit or recreational drugs, or other unsafe
  substances, products or supplements**.
- The unsafe-supplement list explicitly names **anabolic steroids, chitosan, comfrey,
  dehydroepiandrosterone (DHEA), ephedra and human growth hormones**.
  → **Windsor Glow sells HGH. That is a named, explicit prohibition, not a grey area.**
- Ads may not solicit, buy, sell, trade, donate or gift these substances, encourage their
  consumption, or promote related paraphernalia.

### The awareness exception — verified, still in force

> Advertisers **can refer to prohibited drugs, products or supplements for the purposes of political
> advocacy, news, and awareness campaigns, as long as they do not promote the sale or consumption**
> of those substances.

This exception **does still exist** as of 20 August 2026. It is the only real opening for
educational advertising.

**But read the condition.** It requires that the ad does not promote sale or consumption. An ad run
by a company whose website sells the substance, pointing at that website, is promoting sale — the
frame around it does not change that. *Interpretation: the exception is built for news
organisations and advocacy groups, not for sellers. Treat any attempt to use it as a seller as high
risk.*

### Prescription drugs and online pharmacies

- Meta allows some prescription-drug advertising, but **only from advertisers who provide evidence
  that they are appropriately licensed**.
- Online pharmacies need **prior written permission and LegitScript certification**.
- Windsor Glow is neither. Neither route is available to us.

### Locally illegal products

Advertisers are responsible for complying with **all local laws** in the countries they advertise
in. Meta may cancel ads and terminate accounts for breaches. This is the policy under which the UK
medicines problem becomes a Meta problem too.

---

## Peptide-related considerations (the UK law part)

**This section matters more than the Meta section.**

### The prescription-only medicine ban

- Part 14 of the **Human Medicines Regulations 2012** makes it an offence to publish an
  advertisement likely to lead to the use of a **prescription-only medicine**, or likely to
  encourage the public to ask for a particular one.
- It applies to **websites and social media**, not only to paid ads.
- **There is no "research use only" exemption.** The MHRA's test is the *overall impression* the
  material gives.
- Penalties are criminal, not a banned account.

### The unlicensed medicine ban

- Under the same regulations, a medicinal product **without a UK licence may not be advertised for
  medicinal purposes at all**.
- **No efficacy claims** may be made for an unlicensed medicine, because no regulator has assessed
  it.
- MHRA guidance: referring to the *prescription* category of a product or ingredient is likely to
  identify it as **medicinal by presentation** and be treated as an advertisement for a medicine.

### The trap that catches "educational" peptide content

This is the single most useful thing in this document.

> A peptide sold as a research chemical, with no human claims, is not a medicine.
> The moment an ad says what it **does for a person**, it becomes a medicinal product *by
> presentation* — and advertising it is then either the POM offence or the unlicensed-medicine
> offence.

So the framing that keeps the shop lawful is exactly the framing that makes an educational ad
commercially useless. **An ad cannot be both interesting about effects and lawful.** Accept that,
or do not run the ad.

### What the ASA has specifically ruled is not allowed

Checked 20 August 2026, from the ASA's own guidance:

- Naming a POM brand, e.g. **Mounjaro**, **Wegovy**.
- Naming the ingredient, e.g. **semaglutide**, including inside a product name like "SemaPen".
- Naming the **drug class**, e.g. **GLP-1**. Referring to the class was itself ruled to be
  advertising POMs to the public.
- Colloquial terms such as **"skinny jab"**, because all injectable weight-loss medicines are POMs.
- **Before and after photographs** — treated as an advertising claim, which is not permitted for a
  POM.
- Indirect routes: an ad may offer "a consultation for weight loss", but must not indicate that the
  likely outcome is a POM prescription — **including through the linked landing page**.

The ASA issued a formal **enforcement notice** on prescription-only weight-loss products, and
non-compliant advertisers are **referred to the MHRA for further sanctions**. Rulings have run
against multiple companies through 2026. On **18 June 2026** the MHRA published a fresh warning
covering newly licensed oral GLP-1s, pipeline products and waiting lists.

### Catalogue classification

| Group | Examples in our catalogue | Can it be advertised to the UK public? |
|---|---|---|
| UK prescription-only medicines | Tirzepatide, Semaglutide, HGH, Tesamorelin, PT-141 | **Never.** Criminal offence |
| Approved by no regulator anywhere | Retatrutide, Cagrilintide | **Never.** Unlicensed medicine |
| MHRA has named unlawful to sell here | Melanotan II | **Never** |
| Named by Meta as an unsafe supplement | HGH | **Never.** Meta prohibition on top of the law |
| Unapproved research compounds | BPC-157, TB-500, MOTS-c, Ipamorelin, CJC-1295, Selank, Semax, AOD-9604, Epitalon, Kisspeptin, 5-Amino-1MQ | **In practice no.** Any human claim makes it an unlicensed medicine |
| Genuine lab consumables | Bacteriostatic water | Technically yes. No business case |

---

## Educational and awareness advertising

What *might* work, subject to review and never guaranteed.

**Permitted direction of travel:**
- How peptide research is conducted as a field, with no product named and no effect described.
- Laboratory standards, third-party testing, certificates of analysis as a *process*.
- Company transparency: who we are, how we handle quality, how orders are checked.
- Careful, general science education that never touches a compound we sell.

**Immediately fatal, even inside an "educational" ad:**
- Naming any compound we sell.
- Naming a drug class such as GLP-1.
- Describing any effect on a human body.
- Any dose, any quantity, any schedule.
- Any preparation or injection reference.
- Before/after imagery, body imagery, weight references.
- Any purchase language, price, discount or urgency.

---

## Health claims

- **No claim about what any compound does in a person.** Not with a citation, not in the past
  tense, not attributed to a trial. The Social Engine's organic rule allows an attributed,
  third-person report of a published finding. **For paid Meta advertising, that allowance is
  withdrawn.** Organic and paid are not judged the same way, and a trial result in a paid ad
  reads as an efficacy claim for an unlicensed medicine.
- No implied claim through imagery, music, transformation edits or testimonials.
- No negative self-perception — Meta's Health and Wellness policy prohibits content implying or
  generating negative self-perception to promote diet, weight-loss or health products, and
  prohibits presenting a particular body as idealised.
- Weight-loss ads may not use devices such as a tape measure around a body.
- Health and wellness ads must not target under-18s.

---

## Imagery and video rules

- **No product vials, pens, boxes, labels or packaging.** A vial on screen is a product ad.
- **No syringes, needles, injection scenes or reconstitution.**
- No bodies used as evidence: no before/after, no physique shots, no scales, no tape measures.
- No white-coat or clinical staging that implies medical authority we do not have.
- Laboratory and science imagery is acceptable **only** when it illustrates a process and shows no
  product.
- Every generated image must be checked against the same rules as filmed footage. An AI-generated
  vial is still a vial.
- Never fabricate a certificate, a lab value or a COA in any creative. (Standing workspace rule,
  unchanged.)

---

## Caption and headline rules

- No compound names. No drug class names. No colloquialisms ("skinny jab", "fat loss jab").
- No numbers that could read as a dose or a result (percentages of body weight, mg, units).
- No purchase language: "buy", "shop", "order", "in stock", "% off", "limited time".
- No urgency and no countdowns.
- No testimonials or user quotes about effects.
- **A disclaimer does not rescue a caption.** "Research use only" attached to a claim is still a
  claim. It changes nothing, legally or on review.
- Plain English throughout, per the workspace rule.

---

## Call-to-action rules

| CTA | Verdict |
|---|---|
| Learn More → educational article | Acceptable |
| Watch More / video views | Acceptable |
| Shop Now, Buy Now, Order Now, Get Offer | **Never** |
| Sign Up, Subscribe → newsletter | Caution. Only if the newsletter is genuinely educational and does not immediately sell |
| Send Message / WhatsApp | **Avoid.** Invites dosing and purchasing questions we must not answer in a DM |
| Book Now / consultation | **Never.** Implies a prescribing outcome |

---

## Landing page rules

Meta's review looks at **"images, video, text and targeting information, as well as an ad's
destination, such as a landing page or website."** The products and services promoted in the ad must
match those on the landing page. The ASA also looks at the linked landing page.

**So the destination is part of the ad.** This is where Windsor Glow's real problem sits.

### The two pages that would likely sink a review on their own

| Page | Problem |
|---|---|
| **`/calculator`** | Gives step-by-step reconstitution and self-injection instructions, including "use a standard U-100 insulin syringe" and "draw slowly and steadily to the exact mark". This is administration instruction for compounds we sell |
| **`/dosage-guide`** | Lists what trial participants were administered, compound by compound, including semaglutide 2.4mg weekly and tirzepatide 5/10/15mg weekly, alongside the weight lost. It is scrupulously written and correctly cited, and it still does not survive the overall-impression test on a seller's website |

Both sit on the domain any ad would point at.

**Interpretation, and a decision for Kieran, not a build task:** while those two pages are publicly
reachable from windsorglow.com, the risk of advertising *any* Windsor Glow destination on Meta is
materially higher, and the risk is regulatory as well as platform.

### Destination options, ranked

1. **A dedicated educational article on the blog** that names no compound and sells nothing. Best
   available option.
2. **A purpose-built educational page** that is genuinely educational, has no shop navigation in
   the immediate path, and no purchase call to action. Acceptable only if it is real education and
   not a sales funnel wearing an educational coat.
3. **The homepage.** Poor. One click from the shop.
4. **Any product page, `/shop`, `/calculator` or `/dosage-guide`.** Never.

---

## Targeting considerations

- **Broad targeting only.** No interest targeting on anything health, fitness, weight, body or
  medical.
- Meta removed sensitive detailed-targeting options (including health-related causes and
  organisations) from 19 January 2022. Do not look for substitutes.
- **18+ minimum age on every campaign**, always. The site is 18+ and health/wellness ads may not
  target under-18s.
- **UK only** at first. Advertising into other countries imports their medicines law as well.
- **No custom audiences built from website visitors** at the start. Building an audience out of
  people who browsed peptide pages is health-adjacent audience building.
- **No lookalikes** seeded from purchasers. Same reason.
- Video-viewer and page-engagement audiences are lower risk than website audiences, but hold them
  until the account has a clean record.

---

## Examples — lower risk

These are **candidates**, not approvals. Every one still needs human review.

1. **"How a peptide is tested before it reaches a shelf."** Laboratory process, no product shown,
   no compound named. Destination: educational blog article. CTA: Learn More.
2. **"What a certificate of analysis actually tells you."** Explains third-party testing as a
   concept. No compound named, no COA fabricated, no product on screen.
3. **"Who we are."** Straight company introduction: the people, the standards, the checks. No
   product, no claims, no science.
4. **"How to read a research paper."** General science literacy. Method, sample size, controls.
   Uses no example from our catalogue.
5. **"What 'research use only' means."** Explains the legal and practical meaning of the label
   honestly, including that it means not for human use. Genuinely educational, and it reinforces
   the correct framing.

---

## Examples — high risk or prohibited

1. **"What are GLP-1 peptides?"** — Names the drug class. The ASA has ruled that referring to the
   class is advertising POMs to the public. **Prohibited. Abandon the concept.**
2. **"The SURMOUNT-1 trial found participants lost 20.9% of body weight."** — Accurate, cited, past
   tense, and still an efficacy claim for a POM in a paid ad. **Prohibited as an ad.**
3. **A vial on a laboratory bench, no words.** — Product imagery for a prohibited product.
   **Prohibited.** Redesignable only by removing the product entirely.
4. **"Our BPC-157 is 99% pure, third-party tested."** — Names a compound and promotes the sale of
   an unlicensed medicine. **Prohibited.** Redesignable as example 2 in the lower-risk list, with
   the compound removed.
5. **"Free next-day delivery on all research peptides this week."** — Purchase language, urgency,
   and promotes sale of prohibited products. **Prohibited. Abandon.**

---

## Pre-publication checklist

Every box must be ticked before an ad is submitted. One "no" stops it.

**The creative**
- [ ] No compound name anywhere in video, audio, on-screen text, caption or headline
- [ ] No drug class named (GLP-1 and similar)
- [ ] No effect on a human body stated or implied
- [ ] No dose, quantity, schedule, mg or percentage
- [ ] No vial, pen, box, label, syringe or needle on screen
- [ ] No before/after, body, scales or tape measure
- [ ] No testimonial about results
- [ ] No purchase language, price, discount or urgency
- [ ] No fabricated certificate, lab value or COA
- [ ] Every AI-generated frame checked against these same rules

**The destination**
- [ ] Landing page names no compound and sells nothing
- [ ] Landing page is not `/calculator`, `/dosage-guide`, `/shop` or a product page
- [ ] Landing page carries no purchase call to action
- [ ] The path from the landing page does not lead straight into the shop

**The campaign**
- [ ] 18+ minimum age set
- [ ] UK only
- [ ] Broad targeting, no health or body interests
- [ ] No website custom audience, no lookalike
- [ ] CTA is Learn More or Watch More

**The record**
- [ ] Policy version recorded against this check
- [ ] Named human reviewer recorded
- [ ] Result and reasons recorded

---

## Human review requirements

**No Windsor Glow paid ad is ever submitted on an automated pass alone.**

- The automated check can return GREEN, but GREEN means "no rule was broken that we know how to
  test", not "safe".
- A **named person** approves every paid ad before submission. The name is recorded.
- Anything AMBER goes to a second person, and the default answer to genuine uncertainty is **no**.
- RED is not appealable internally. Redesign or abandon.
- Anything touching a named compound, a class name, a dose or a body claim goes to Kieran
  personally.

---

## Policy update procedure

1. **Quarterly**, or on any trigger listed under "Last policy review", one person re-reads every
   source URL in this document.
2. Record for each: date checked, whether it changed, and what changed.
3. Changed rules are written into this file **by a person**, with the source and the date.
4. **An AI system may draft the update and may flag that a check is overdue. It may not change a
   compliance rule without a named human approving it.** The rule file is a reviewed artefact.
5. Every change gets a row in the change log below.
6. If a source URL 404s, that is a signal the policy moved. Find the new page; do not delete the
   rule.

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-08-20 (rev 2) | **Correction and additions**, made while preparing the management presentation. **(1) Google's permanent-ban wording is narrower than the wider research quotes it.** "Suspended upon detection and without prior warning… not allowed to advertise with Google Ads again" is attached to the *egregious* healthcare breaches, namely unauthorised pharmacies and prescription opioids. For **unapproved pharmaceuticals and supplements**, the category Windsor Glow would sit in, the stated route is disapproval first, then suspension for repeated violations. Still severe. Not a reason to relax, and Google still renders and reads the whole destination page. **(2) Account inventory recorded**: Instagram `@windsorglowstore`, a live Facebook Page and the YouTube channel `@WindsorGlow` have all been publishing since 30 July 2026; the Meta ad account is connected read-only. **Ownership of all four is still unconfirmed and is the highest-consequence free check.** **(3) Meta Verified for Business priced**: £13.99/month on the web, £16.99/month in the app (UK), roughly £170 a year, and it grants no advertising permission. **(4) Caveat on this file's Meta quotations**: `transparency.meta.com` pages do not render for automated fetching, so every Meta quotation here rests on the manual check of 20 August 2026 and should be re-read by hand before any campaign launches. | Claude, for Kieran |
| 2026-08-20 | First version. Meta and UK sources checked live. Confirmed the Meta awareness exception still exists; confirmed the ASA position that naming the GLP-1 class is itself advertising a POM; recorded the MHRA warning of 18 June 2026. Recorded that HGH is explicitly named on Meta's unsafe-supplements list. | Claude, for Kieran |

---

## Related

- `_Planning-Library/09_marketing/2026-08-14-windsor-glow-paid-advertising-system.md` — the wider
  paid-advertising research this builds on, including budgets, YouTube and creative sizes.
- `03_Kierans-Media-Generator/projects/social-engine/src/lib/social/compliance.ts` — the existing
  organic compliance checker. The paid profile described here is stricter than the organic rules
  in that file, and deliberately so.
- `Windsor-Glow-Paid-Video-Advertising-Guide.pdf` (24 July 2026) — the earlier guide that first set
  status RED. Its conclusion still holds.
