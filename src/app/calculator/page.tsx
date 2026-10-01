import Link from 'next/link';
import MemberOnlyNotice from '@/components/MemberOnlyNotice';
import { MEMBER_ONLY_ROBOTS, maySeeMemberOnlyTools } from '@/lib/memberOnlyPages';
import BackToHome from '@/components/BackToHome';
import CalculatorTabs from '@/components/CalculatorTabs';
import FAQAccordion, { FAQItem } from '@/components/FAQAccordion';
import { searchableProducts } from '@/lib/shopServerData';
import { penPresets } from '@/lib/penPresets';
import { allBlendPresets } from '@/lib/blend';

/* The pen list is read from the shop on every request (task b0f86954), because the pens are
   maintained in the admin: adding, renaming or withdrawing one has to change this drop-down with
   no code change. searchableProducts is the cookie-free reader, which is what this page wants,
   and it falls back to the committed catalogue if the database cannot be reached, so a slow
   query costs the drop-down its newest entries rather than costing the page. */
export const dynamic = 'force-dynamic';

const PRECISE_DOSE_STEPS = [
  {
    step: '01',
    title: 'Reconstitute',
    sub: 'Mix Your Vial',
    desc: 'Add bacteriostatic water to your lyophilised (freeze-dried) peptide to bring it into solution. This is the foundation everything else is built on — get the volume right and the rest of the process becomes simple arithmetic.',
  },
  {
    step: '02',
    title: 'Calculate',
    sub: 'Find Your Volume',
    desc: 'Enter your peptide amount, the water volume you used, and your desired dose into the calculator above. It instantly works out the exact volume — and syringe reading — you need to draw for that dose.',
  },
  {
    step: '03',
    title: 'Draw',
    sub: 'Insulin Syringe',
    desc: 'Use a standard U-100 insulin syringe, where 100 units equals 1 millilitre and each single unit represents 0.01mL. Draw slowly and steadily to the exact mark in your result, checking it against the zoomed-in view before you stop.',
  },
  {
    step: '04',
    title: 'Store',
    sub: 'Keep It Cold',
    desc: 'Once reconstituted, keep your vial refrigerated between uses. Avoid repeated freeze-thaw cycles, which can degrade the peptide, and protect the vial from direct light to help preserve it for as long as possible.',
  },
];

const RECONSTITUTION_STEPS = [
  {
    number: '01',
    title: 'Prepare a Clean Workspace',
    body: 'Wash your hands thoroughly and work on a clean, flat surface. Lay out everything you will need before you start: your peptide vial, your bacteriostatic water, a mixing syringe for drawing the water, a separate insulin syringe for measuring doses later, and a supply of alcohol swabs. Having everything to hand reduces the temptation to touch anything you should not mid-process.',
  },
  {
    number: '02',
    title: 'Prepare Your Materials',
    body: 'Allow both vials to reach room temperature before you begin — mixing cold liquid with cold powder can cause clumping. Remove any plastic caps from the vials, then disinfect both rubber stoppers thoroughly with a fresh alcohol swab. This single step is one of the most important in the entire process, as it is your main barrier against introducing anything unwanted into the vial.',
  },
  {
    number: '03',
    title: 'Add the Water Carefully',
    body: 'Before drawing your bacteriostatic water, inject an equal volume of air into the water vial first — this equalises the pressure and makes drawing the liquid back out much easier. Draw the amount of water your calculation calls for, then insert the needle through the peptide vial’s stopper at an angle. Some peptide vials are vacuum-sealed, so expect a little resistance or a faint hiss as the seal releases — this is normal. Hold the plunger firmly to control the flow, and let the water run gently down the inside wall of the vial rather than spraying it directly onto the powder. Once the water is in, roll the vial gently between your palms to help the peptide dissolve — never shake it, as aggressive agitation can damage the peptide structure.',
  },
  {
    number: '04',
    title: 'Understand the Concentration',
    body: 'The amount of peptide (in mg) and the amount of liquid you added (in mL) together determine your vial’s concentration — how much peptide is present in every millilitre of solution. This is exactly what the calculator above does for you: enter those two figures alongside your desired dose, and it converts the result straight into a precise syringe reading, so you never have to work the maths out by hand.',
  },
  {
    number: '05',
    title: 'Store It Correctly',
    body: 'Unreconstituted (powder) peptide should be kept refrigerated for short-term storage, or in a freezer for longer-term storage, away from light. Once reconstituted, the solution should generally be kept refrigerated between 2-8°C, used within the timeframe recommended for that compound, protected from light, and ideally stored back in its original packaging. Avoid repeated freeze-thaw cycles, as these can break the peptide down over time. Storage guidance may vary by compound and supplier documentation, so always check the materials that came with your specific product before relying on these general guidelines.',
  },
];

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'How does this peptide calculator ensure accurate dosing?',
    answer: 'It uses the same maths a researcher would do by hand — combining your peptide amount, your bacteriostatic water volume and your desired dose to work out the exact concentration of your vial, then converting that into a precise syringe reading. Because the calculation runs instantly and consistently, it removes the small arithmetic slips that are easy to make when working it out manually.',
  },
  {
    question: 'What if my result is a decimal like 8.3 units?',
    answer: 'That is completely normal — concentrations rarely divide into perfectly round numbers. Our Smart Dosing Assistant automatically checks for this and, where possible, suggests an alternative water volume that produces a cleaner, easier-to-read syringe mark while keeping your final dose exactly the same.',
  },
  {
    question: 'Which syringe should I use?',
    answer: 'Most researchers use a standard U-100 insulin syringe, available in 0.3mL, 0.5mL and 1.0mL sizes. The right size depends on the volume you need to draw — a smaller syringe gives finer graduations for small draws, while a larger syringe is needed if your draw volume is bigger than a smaller barrel can hold. Select your syringe size in the calculator above and it will warn you if your draw exceeds its capacity.',
  },
  {
    question: 'What does U100 mean?',
    answer: 'U-100 refers to the scale printed on the syringe barrel: it is calibrated so that 100 units equals 1 millilitre, meaning each single unit on the syringe represents 0.01mL. This is the standard scale used on most insulin syringes and is what our calculator’s results are based on.',
  },
  {
    question: 'How much bacteriostatic water should I use?',
    answer: 'There is no single correct answer — it depends on the concentration you want and the equipment you are using. As a general starting point, many researchers find 2mL gives a forgiving, easy-to-measure concentration for a typical vial, which is why we mark it as the recommended standard in the calculator. You are free to use more or less depending on your own preferences and protocols.',
  },
  {
    question: 'What is the first step in reconstitution?',
    answer: 'The first step is preparing a clean workspace: washing your hands, working on a clean surface, and laying out everything you will need — your peptide vial, bacteriostatic water, mixing syringe, insulin syringe and alcohol swabs — before you begin. Getting this right reduces the chance of contamination at every later stage.',
  },
  {
    question: 'Does this calculator support IU-based products?',
    answer: 'Yes. On the insulin syringe side, choose “True product IU” and enter the IU amount in the product and the IU dose. The result shows the volume in mL and the separate U-100 syringe mark. Product IU measures biological activity; U-100 marks measure volume (100 marks = 1 mL). The calculator does not assume any IU-to-mg conversion.',
  },
  {
    question: 'Is my data private and secure?',
    answer: 'Yes. Every calculation runs directly in your browser — nothing you enter is sent to, or stored on, any Windsor Glow server. You can use the calculator as often as you like with complete privacy.',
  },
];

export const metadata = {
  title: 'Peptide Calculator | Windsor Glow',
  description: 'A reconstitution calculator for Windsor Glow members.',
  // Kept out of search results on purpose (task 98b6dcc6). A gated page that stays indexed is the
  // worst of both: still found by somebody searching for a dose calculator, and Google may ask to
  // be let in.
  robots: MEMBER_ONLY_ROBOTS,
};

export default async function CalculatorPage() {
  /* Members only (task 98b6dcc6). Nothing here is deleted: a signed-in member gets exactly the
     page that was public before. */
  if (!(await maySeeMemberOnlyTools())) {
    return (
      <MemberOnlyNotice
        title="Peptide Calculator"
        what="The calculator works out concentrations and volumes for reconstituted research compounds."
      />
    );
  }

  // One read of the catalogue serves both: the pens the drop-down offers, and the blends the
  // breakdown panel offers. A blend added to the shop appears in the calculator on its own.
  const catalogue = await searchableProducts();
  const pens = penPresets(catalogue);
  const blends = allBlendPresets(catalogue);

  return (
    <>
      <BackToHome />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-20">

      <div className="text-center mb-12">
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Tools</p>
        <h1 className="font-serif text-4xl sm:text-5xl text-stone-800 tracking-wide mb-4">
          Peptide Calculator
        </h1>
        <p className="text-sm text-stone-500 leading-relaxed max-w-md mx-auto">
          Calculate reconstitution volumes and exact draw amounts for research peptides using standard bacteriostatic water.
        </p>
      </div>

      {/* Disclaimer */}
      <div className="border border-gold-200 bg-gold-50 px-5 py-3.5 mb-10 text-center">
        <p className="text-[9px] text-gold-700 leading-relaxed">
          For research reference only. Always verify calculations independently. Windsor Glow accepts no liability for errors arising from use of this tool.
          This tool does not provide medical advice and our products are not intended to diagnose, treat, cure, or prevent disease.
        </p>
      </div>

      <CalculatorTabs pens={pens} blendPresets={blends} />

      {/* Four Steps to a Precise Dose */}
      <div className="mt-16 border-t border-gold-100 pt-14">
        <div className="text-center mb-10">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">The Process</p>
          <h2 className="font-serif text-3xl text-stone-800 tracking-wide">Four Steps to a Precise Dose</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {PRECISE_DOSE_STEPS.map(({ step, title, sub, desc }) => (
            <div key={step} className="border border-gold-100 p-6 sm:p-7">
              <div className="flex items-baseline gap-3 mb-2.5">
                <span className="font-serif text-2xl text-gold-700 font-bold">{step}</span>
                <h3 className="text-sm font-semibold text-stone-800 tracking-wide">
                  {title} <span className="text-stone-500 font-normal">&mdash; {sub}</span>
                </h3>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Peptide Reconstitution Guide */}
      <div className="mt-16 border-t border-gold-100 pt-14">
        <div className="text-center mb-6">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">In Depth</p>
          <h2 className="font-serif text-3xl text-stone-800 tracking-wide mb-4">Peptide Reconstitution Guide</h2>
          <p className="text-sm text-stone-500 leading-relaxed max-w-xl mx-auto">
            Reconstitution is the process of returning a freeze-dried (lyophilised) peptide back into a liquid
            solution that can be measured and drawn into a syringe. Peptides are supplied in this freeze-dried form
            because it keeps them stable for far longer than a liquid would — but it means every vial needs to be
            carefully mixed with a diluent, almost always bacteriostatic water, before use. How you carry out that
            mixing matters: peptides are delicate molecules that can be affected by rough handling, and any
            contamination introduced at this stage stays in the vial for the rest of its life. Working cleanly and
            gently is therefore not optional — it is the difference between a vial that performs consistently and one
            that does not.
          </p>
        </div>

        <div className="space-y-8 mt-10">
          {RECONSTITUTION_STEPS.map(({ number, title, body }) => (
            <div key={number} className="flex gap-6 sm:gap-8 items-start border-b border-gold-100 pb-8 last:border-b-0 last:pb-0">
              <div className="font-serif text-2xl sm:text-3xl text-gold-700 font-bold shrink-0 w-10 sm:w-12">
                {number}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-stone-700 mb-2 tracking-wide">{title}</h3>
                <p className="text-sm text-stone-500 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="mt-16 border-t border-gold-100 pt-14">
        <div className="text-center mb-4">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Questions</p>
          <h2 className="font-serif text-3xl text-stone-800 tracking-wide">Frequently Asked Questions</h2>
        </div>
        <FAQAccordion items={FAQ_ITEMS} />
      </div>

      <div className="mt-14 text-center border-t border-gold-100 pt-10">
        <p className="text-xs text-stone-500 mb-3">
          Want a step-by-step walkthrough of the underlying maths first?
        </p>
        <Link
          href="/dosage-guide"
          className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:bg-gold-800 transition-colors"
        >
          View Dosage Guide
        </Link>
      </div>
      </div>
    </>
  );
}
