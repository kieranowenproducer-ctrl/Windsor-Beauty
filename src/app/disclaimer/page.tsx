import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';
import { SITE_URL } from '../robots';

const DESCRIPTION = 'Important information about Windsor Beauty skincare: our products are cosmetics, not '
  + 'medicines. Patch test before first use and stop use if irritation occurs.';

export const metadata: Metadata = {
  title: 'Product Disclaimer | Windsor Beauty',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/disclaimer` },
};

export default function ProductDisclaimerPage() {
  return (
    <PolicyPage
      contentKey="disclaimer"
      title="Product Disclaimer"
      intro="A few important points about our products and how to use them. Please read this page before using anything you buy from us."
    >
      <PolicySection heading="Cosmetics, Not Medicines">
        <p>
          The products sold on this website are cosmetic products for external use only. They are not medicines.
          They are not intended to diagnose, treat, cure or prevent any disease or medical condition.
        </p>
      </PolicySection>

      <PolicySection heading="Patch Test Before First Use">
        <p>
          We recommend a patch test before using any product for the first time. Apply a small amount to a small
          area of skin, such as the inner arm, and wait 24 hours. Check the ingredient list before use if you have a
          known allergy or sensitivity.
        </p>
      </PolicySection>

      <PolicySection heading="Stop Use if Irritation Occurs">
        <p>
          If you notice redness, itching, stinging or any other irritation, stop using the product. If the reaction
          is severe or does not settle, seek advice from a pharmacist or doctor. Avoid contact with the eyes unless
          the product is made for that area, and keep products out of the reach of children.
        </p>
      </PolicySection>

      <PolicySection heading="Results Vary">
        <p>
          Everyone&rsquo;s skin is different, so results vary from person to person. We do not promise a particular
          result from any product.
        </p>
      </PolicySection>

      <PolicySection heading="Information Is General in Nature">
        <p>
          The information on this website, including product descriptions and guides, is general. It is not
          tailored to you and it is not medical advice. If you have a skin condition or a medical concern, please
          speak to a pharmacist, doctor or dermatologist before using a new product.
        </p>
      </PolicySection>

      <PolicySection heading="Related Policies">
        <p>
          This disclaimer should be read alongside our Terms and Conditions and Returns Policy.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
