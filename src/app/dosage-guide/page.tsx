import Link from 'next/link';
import BackToHome from '@/components/BackToHome';
import MemberOnlyNotice from '@/components/MemberOnlyNotice';
import { MEMBER_ONLY_ROBOTS, maySeeMemberOnlyTools } from '@/lib/memberOnlyPages';

export const metadata = {
  // Out of search results on purpose (task 98b6dcc6), for the reason given on the calculator.
  robots: MEMBER_ONLY_ROBOTS,
  title: 'Dosage Guide | Windsor Glow',
  description:
    'What the published human trials reported, which compounds have never been tested in people, and how to work out a concentration.',
};

/* The only compounds in the catalogue with a published, peer reviewed human
   trial. Every figure here is what researchers administered to participants in
   that study, written in the third person and the past tense, with the source
   named and linked. Nothing may be added to this list without the paper. */
const PUBLISHED = [
  {
    compound: 'Semaglutide',
    trial: 'STEP 1',
    administered: '2.4mg once weekly, for 68 weeks',
    reported:
      'Participants receiving semaglutide lost an average of 14.9 percent of their body weight, against 2.4 percent for those on placebo.',
    citation:
      'Wilding JPH et al. Once-Weekly Semaglutide in Adults with Overweight or Obesity. New England Journal of Medicine, 2021.',
    href: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2032183',
  },
  {
    compound: 'Tirzepatide',
    trial: 'SURMOUNT-1',
    administered: '5mg, 10mg or 15mg once weekly, for 72 weeks',
    reported:
      'Across 2,539 participants, the highest dose group lost close to a fifth of their body weight.',
    citation:
      'Jastreboff AM et al. Tirzepatide Once Weekly for the Treatment of Obesity. New England Journal of Medicine, 2022.',
    href: 'https://pubmed.ncbi.nlm.nih.gov/35658024/',
  },
  {
    compound: 'Tesamorelin',
    trial: 'Falutz phase 3',
    administered: '2mg daily, for 26 weeks',
    reported:
      'Visceral fat fell by 15.2 percent against 5.0 percent on placebo, across 412 participants. Tesamorelin is the one compound here that a regulator has licensed, as Egrifta.',
    citation:
      'Falutz J et al. Metabolic Effects of a Growth Hormone-Releasing Factor in Patients with HIV. New England Journal of Medicine, 2007.',
    href: 'https://www.nejm.org/doi/full/10.1056/NEJMoa072375',
  },
];

/* The honest state of the evidence for the compounds we are asked about most.
   No figures appear here on purpose: where no human trial exists there is no
   figure to report, and filling the gap from a supplier sheet or a forum is
   exactly what this page exists to argue against. */
const NO_HUMAN_DOSE = [
  {
    compound: 'BPC-157',
    status: 'No published human trial',
    detail:
      'There is no published, peer reviewed randomised controlled trial in humans, for any indication. What exists is a small intravenous safety pilot, a handful of case reports, and around 30 years of animal work. The first properly designed phase 2 trial is recruiting now, with results expected in 2027.',
  },
  {
    compound: 'TB-500',
    status: 'No human trial of the injected fragment',
    detail:
      'The strongest human research on thymosin beta 4 is a topical eye drop, tested for a different condition by a different route. Protocols circulating for the injected fragment are not built on a human study of it.',
  },
  {
    compound: 'GHK-Cu',
    status: 'Human data is topical, not injectable',
    detail:
      'A 2021 double blind trial tested a 0.5 percent cream in 41 people, and the result was genuine. A cream applied to skin and an injection are not the same thing, and a figure from one does not transfer to the other.',
  },
  {
    compound: 'MOTS-c',
    status: 'One trial, and it does not transfer',
    detail:
      'A 2021 randomised trial gave a single intravenous dose to 12 older adults. Twelve people, one dose, by a route almost nobody uses outside a hospital. That is not a basis for a protocol.',
  },
  {
    compound: 'Retatrutide',
    status: 'Phase 2 published, later results announced only',
    detail:
      'A phase 2 trial was published in the New England Journal of Medicine in 2023 and is worth reading in full. The much larger phase 3 figures you may have seen quoted have so far come from the manufacturer’s own announcements rather than a journal, so we do not repeat them.',
    href: 'https://pubmed.ncbi.nlm.nih.gov/37366315/',
    hrefLabel: 'Read the phase 2 trial',
  },
];

/* Four checks a reader can run on any protocol they find. Every one of these is
   a failure we have actually seen on protocol libraries currently online. */
const HOW_TO_READ = [
  {
    question: 'Does it name a specific study?',
    answer:
      'A protocol with no citation is somebody’s opinion, however confident and however well designed the page looks. Confidence is not evidence.',
  },
  {
    question: 'Does the citation actually match the claim?',
    answer:
      'Search the title on PubMed and read what it really says. We have seen a human injection amount backed by a review paper about blood vessel development in animals.',
  },
  {
    question: 'Does the page contradict itself?',
    answer:
      'Look for a stated amount sitting a line or two away from an admission that no human trial exists. Both sentences are often true, and only one of them is being read.',
  },
  {
    question: 'Who publishes it, and what do they sell?',
    answer:
      'A good many protocol libraries are run by suppliers, and exist to move you towards a basket. Check the footer, the domain, and whether there is a shop attached.',
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Know what you have',
    body:
      'Start with the label on your vial: the total peptide content in milligrams, and the batch or reference number. The same information is on your certificate of analysis. Nothing else can be worked out accurately until you know exactly what is in front of you.',
  },
  {
    number: '02',
    title: 'Choose your diluent and volume',
    body:
      'Decide how much bacteriostatic water you intend to add. That choice sets the final concentration. More liquid gives a more dilute solution, less liquid a more concentrated one. There is no single correct volume; it depends on your measuring equipment and how you prefer to work.',
  },
  {
    number: '03',
    title: 'Work out the concentration',
    body:
      'With the total peptide amount and the liquid volume, you can calculate how much peptide sits in each millilitre. This is the step that connects what is in the vial to what a single draw actually contains, and it is where small arithmetic slips cause the most confusion.',
  },
  {
    number: '04',
    title: 'Convert to a reading',
    body:
      'Finally, turn that concentration into a mark on the syringe, usually in IU on a standard U-100 barrel, or in millilitres. Writing the number down before you begin, and keeping a short log, is the simplest way to stay consistent.',
  },
];

export default async function DosageGuidePage() {
  /* Members only (task 98b6dcc6). Unchanged for anybody signed in. */
  if (!(await maySeeMemberOnlyTools())) {
    return (
      <MemberOnlyNotice
        title="Dosage Guide"
        what="The guide sets out what published trials reported, where nothing has been published, and how to work out a concentration."
      />
    );
  }

  return (
    <>
      <BackToHome />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-20">

        {/* 1. Hero */}
        <header className="text-center mb-14">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">
            Guidance
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl text-stone-800 tracking-wide mb-4">
            Dosage Guide
          </h1>
          <p className="text-sm text-stone-500 leading-relaxed max-w-md mx-auto">
            What the published research reported, what has never been tested in people, and how to
            work out a concentration.
          </p>
        </header>

        {/* 2. The straight answer. Deliberately the first thing after the hero:
            the question people arrive with deserves a real reply, not a
            disclaimer they have to scroll past. */}
        <section className="border border-gold-200 bg-gold-50 px-6 py-7 sm:px-8 sm:py-9 mb-16">
          <h2 className="font-serif text-2xl text-stone-800 mb-4">
            The honest answer to &ldquo;how much&rdquo;
          </h2>
          <div className="space-y-4 text-sm text-stone-600 leading-relaxed">
            <p>
              We cannot tell you what to take, and you deserve the reason rather than a disclaimer.
              Everything Windsor Glow supplies is sold strictly for laboratory research. None of it
              is licensed as a medicine, none of it has been assessed for human use, and none of it
              is supplied for personal use. A dose only exists for something intended to be taken,
              so there is no dose here for us to give.
            </p>
            <p>
              Anything about your own health belongs with a qualified healthcare professional who
              knows you. That is not us being cautious. It is the only person who can actually
              answer it.
            </p>
            <p className="text-stone-700">
              What we can do is set out exactly what the published trials reported, say plainly
              where nothing has been published at all, and show you the arithmetic. That is the
              rest of this page.
            </p>
          </div>
        </section>

        {/* 3. Published evidence */}
        <section className="mb-16">
          <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700 mb-3">
            Published Evidence
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl text-stone-800 mb-4">
            Three compounds have published human trial data
          </h2>
          <p className="text-sm text-stone-500 leading-relaxed mb-9">
            These are the only items in our catalogue with a published, peer reviewed human trial we
            can point you to. Each figure below is what researchers administered to participants in
            that study. It is a record of what a trial did in a studied population, and it is not a
            recommendation for anyone reading this page.
          </p>

          <div className="space-y-6">
            {PUBLISHED.map(({ compound, trial, administered, reported, citation, href }) => (
              <article key={compound} className="border-l-2 border-gold-300 pl-5 sm:pl-7 py-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                  <h3 className="font-serif text-xl text-stone-800">{compound}</h3>
                  <span className="text-[9px] tracking-[0.2em] uppercase text-gold-700">
                    {trial}
                  </span>
                </div>
                <p className="text-xs uppercase tracking-[0.12em] text-stone-500 mb-1">
                  What participants received
                </p>
                <p className="text-sm text-stone-700 mb-3">{administered}</p>
                <p className="text-sm text-stone-500 leading-relaxed mb-4">{reported}</p>
                <p className="text-xs text-stone-500 leading-relaxed">
                  {citation}{' '}
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-gold-700 hover:text-gold-800"
                  >
                    Read the paper
                  </a>
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* 4. Where nothing has been published. The most useful section on the
            page, and the one no supplier protocol library will print. */}
        <section className="mb-16">
          <h2 className="font-serif text-2xl sm:text-3xl text-stone-800 mb-4">
            For everything else, no human dose has been published
          </h2>
          <p className="text-sm text-stone-500 leading-relaxed mb-9">
            We supply around 110 compounds. Three of them have a published human trial. For the rest
            the honest answer is that the study has not been run yet, and no amount of searching
            changes that. Here is what genuinely exists for the ones we are asked about most.
          </p>

          <div className="grid sm:grid-cols-2 gap-5">
            {NO_HUMAN_DOSE.map(({ compound, status, detail, href, hrefLabel }) => (
              <article
                key={compound}
                className="border border-stone-200 bg-white p-5 flex flex-col"
              >
                <h3 className="font-serif text-lg text-stone-800 mb-1">{compound}</h3>
                <p className="text-[10px] tracking-[0.14em] uppercase text-gold-700 mb-3">
                  {status}
                </p>
                <p className="text-sm text-stone-500 leading-relaxed">{detail}</p>
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline text-gold-700 hover:text-gold-800 mt-3"
                  >
                    {hrefLabel}
                  </a>
                )}
              </article>
            ))}
          </div>

          <p className="text-sm text-stone-500 leading-relaxed mt-7">
            Saying so is not us being unhelpful. An amount invented to fill that gap would be worth
            less than the honest answer, because you would have no way of telling which one you had
            been given.
          </p>
        </section>

        {/* 5. How to read a protocol found elsewhere */}
        <section className="mb-16 border-t border-gold-100 pt-12">
          <h2 className="font-serif text-2xl sm:text-3xl text-stone-800 mb-4">
            Four questions to ask of any protocol you find
          </h2>
          <p className="text-sm text-stone-500 leading-relaxed mb-9">
            You will find protocol libraries online with a confident number for every compound,
            including all the ones above. Some are careful and some are not, and they look almost
            identical. These four checks separate them in about a minute.
          </p>

          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-7">
            {HOW_TO_READ.map(({ question, answer }, i) => (
              <div key={question}>
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="font-serif text-lg text-gold-700">{i + 1}</span>
                  <h3 className="text-sm font-semibold text-stone-700 tracking-wide">
                    {question}
                  </h3>
                </div>
                <p className="text-sm text-stone-500 leading-relaxed pl-8">{answer}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 6. Method */}
        <section className="mb-16">
          <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700 mb-3">Method</p>
          <h2 className="font-serif text-2xl sm:text-3xl text-stone-800 mb-4">
            Working out a concentration
          </h2>
          <p className="text-sm text-stone-500 leading-relaxed mb-10">
            This part is arithmetic rather than advice, and it is the same four steps whatever is in
            the vial.
          </p>

          <div className="space-y-10">
            {STEPS.map(({ number, title, body }) => (
              <div
                key={number}
                className="flex gap-6 sm:gap-8 items-start border-b border-gold-100 pb-10 last:border-b-0 last:pb-0"
              >
                <div className="font-serif text-3xl sm:text-4xl text-gold-700 font-bold shrink-0 w-12 sm:w-14">
                  {number}
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-stone-700 mb-2 tracking-wide">
                    {title}
                  </h3>
                  <p className="text-sm text-stone-500 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 7. Calculator */}
        <section className="border border-gold-100 bg-gold-50/40 p-8 sm:p-10 text-center">
          <h2 className="font-serif text-2xl text-stone-800 mb-3">Let the calculator do the sums</h2>
          <p className="text-sm text-stone-500 leading-relaxed max-w-md mx-auto mb-7">
            Enter your peptide amount, your mixing volume and the figure you are working to, and it
            will return the draw amount. It does the arithmetic for whatever numbers you put in, and
            it does not supply any of them.
          </p>
          <Link
            href="/calculator"
            className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-9 py-4 hover:bg-gold-800 transition-colors"
          >
            Open the Calculator
          </Link>
        </section>

        {/* 8. Closing note */}
        <footer className="mt-12 text-center border-t border-gold-100 pt-10">
          <h2 className="text-[9px] tracking-[0.25em] uppercase text-stone-500 font-semibold mb-3">
            A note on this guidance
          </h2>
          <p className="text-xs text-stone-500 leading-relaxed max-w-lg mx-auto">
            This page is general information for laboratory research use only and is not medical
            advice. It is not a substitute for professional training, your organisation&rsquo;s
            standard operating procedures, or advice from a qualified professional. Windsor Glow
            products are supplied strictly for research purposes, are not for human consumption, and
            are not intended to diagnose, treat, cure or prevent any disease. Studies are linked so
            you can read them at the source. We do not operate or endorse any third party protocol
            library, and cannot verify anything published on one. Figures from our calculator are
            estimates for reference only and should be checked independently.
          </p>
        </footer>
      </div>
    </>
  );
}
