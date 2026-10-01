import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';

export default function ProductDisclaimerPage() {
  return (
    <PolicyPage
      contentKey="disclaimer"
      title="Product Disclaimer"
      intro="Please read this page carefully before purchasing or using any product listed on this website. It explains what our products are, and what they are not."
    >
      <PolicySection heading="Research Compounds Only">
        <p>
          Every product listed on this website is supplied strictly as a research compound, intended for laboratory
          and research purposes only. Nothing on this site is sold, marketed, labelled or intended as a medicine,
          supplement, cosmetic, or consumer good of any kind.
        </p>
      </PolicySection>

      <PolicySection heading="Not Intended to Diagnose, Treat, Cure or Prevent Disease">
        <p>
          No statement made on this website, in our product listings, or in any supporting material has been
          evaluated by a medical or regulatory authority. Our products are not intended to diagnose, treat, cure, or
          prevent any disease or medical condition, and should not be regarded, used, or relied upon as if they were.
        </p>
      </PolicySection>

      <PolicySection heading="Information Is General in Nature">
        <p>
          Any descriptions, guides, or reference material provided on this site — including our Dosage Guide and
          calculator tools — are provided purely to help researchers handle and reconstitute compounds consistently
          for laboratory purposes. They are general in nature, are not tailored to any individual, and must not be
          interpreted as instructions for human or animal use, medical advice, or a recommendation to use any product
          in a particular way.
        </p>
      </PolicySection>

      <PolicySection heading="Your Responsibility">
        <p>
          By purchasing from Windsor Beauty, you confirm that you understand the research-only nature of our products,
          that you are qualified and equipped to handle them appropriately, and that you take full responsibility for
          how they are stored, handled, and used. You should always follow the safety guidance applicable to your own
          research setting and any relevant local regulations.
        </p>
      </PolicySection>

      <PolicySection heading="Related Policies">
        <p>
          This disclaimer should be read alongside our Research Use Disclaimer, Age Restriction Policy, and Terms and
          Conditions, all of which form part of the agreement between you and Windsor Beauty.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
