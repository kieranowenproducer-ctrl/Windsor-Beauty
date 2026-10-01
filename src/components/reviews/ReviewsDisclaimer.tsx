// The reviews disclaimer, written once and shown in all three places a customer
// reads customer reviews: the Reviews page, the reviews section on a product
// page, and the carousel on the home page (task 62253915).
//
// THE WORDING IS KIERAN'S, SUPPLIED VERBATIM, AND IS A COMPLIANCE STATEMENT.
// Do not reword it, shorten it, or add to it. The only change made to what he
// wrote is the full stop at the end of the sentence. If it ever needs to change,
// change it HERE — the whole point of this component is that three copies of a
// compliance sentence cannot drift apart.

export const REVIEWS_DISCLAIMER_HEADING = 'Reviews Disclaimer';

export const REVIEWS_DISCLAIMER_TEXT =
  'Customer reviews reflect the personal opinions of individual reviewers and do not represent ' +
  'the views or claims of Windsor Beauty. All products are supplied strictly for laboratory and ' +
  'in vitro research purposes only.';

/**
 * `compact` drops the panel border for places that already sit inside one
 * (the home page carousel), so it reads as part of that block rather than as a
 * second box inside a box. The words are identical either way.
 */
export default function ReviewsDisclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      aria-label={REVIEWS_DISCLAIMER_HEADING}
      className={
        compact
          ? 'mx-auto max-w-3xl px-4 text-center'
          : 'mx-auto max-w-3xl border border-gold-200 bg-gold-50/40 px-6 py-5 sm:px-8'
      }
    >
      <h2 className="text-[10px] tracking-[0.22em] uppercase text-gold-700 mb-2">
        {REVIEWS_DISCLAIMER_HEADING}
      </h2>
      {/* stone-600 rather than a lighter grey: this has to be readable, and it
          is the colour the contrast check passes at this size. */}
      <p className="text-xs leading-relaxed text-stone-600">
        {REVIEWS_DISCLAIMER_TEXT}
      </p>
    </aside>
  );
}
