import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';
import { SITE_URL } from '../robots';

const DESCRIPTION = 'The terms that apply when you browse the Windsor Beauty skincare shop or place an order '
  + 'with us, including your right to cancel and what happens if something is not right.';

export const metadata: Metadata = {
  title: 'Terms and Conditions | Windsor Beauty',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/terms` },
};

export default function TermsPage() {
  return (
    <PolicyPage
      contentKey="terms"
      title="Terms and Conditions"
      intro="These terms set out the basis on which you may use the Windsor Beauty website and place an order with us. Please read them before you order."
    >
      <PolicySection heading="1. Who We Are">
        <p>
          Windsor Beauty is operated by C&amp;S Holdings Group (&ldquo;Windsor Beauty&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;).
          References to &ldquo;you&rdquo; or &ldquo;the customer&rdquo; mean the person browsing this site or placing an order with us.
        </p>
      </PolicySection>

      <PolicySection heading="2. Acceptance of These Terms">
        <p>
          By browsing our shop, creating an account, or placing an order, you agree to these Terms and Conditions,
          together with our Privacy Policy, Cookie Policy, Shipping Policy, Returns Policy, Refund Policy, Payment
          Policy and Product Disclaimer, each of which forms part of this agreement.
        </p>
      </PolicySection>

      <PolicySection heading="3. Our Products">
        <p>
          We sell skincare and other cosmetic products. They are for external use only and should be used as
          directed on the packaging. They are not medicines.
        </p>
        <p>
          Skin differs from person to person. We recommend a patch test before you use a product for the first
          time. If irritation occurs, stop using the product. Please read our Product Disclaimer for more detail.
        </p>
      </PolicySection>

      <PolicySection heading="4. Product Descriptions">
        <p>
          We take care to describe and photograph our products accurately. Colours can look a little different from
          one screen to another, and packaging may be updated from time to time. Please check the ingredient list on
          the product page and on the packaging before use, particularly if you have a known allergy or sensitivity.
        </p>
      </PolicySection>

      <PolicySection heading="5. No Medical Advice">
        <p>
          Nothing on this website is medical advice. Our products are not intended to diagnose, treat, cure or
          prevent any disease or medical condition. If you have a skin condition or a medical concern, or you are
          unsure whether a product is suitable for you, please speak to a pharmacist, doctor or dermatologist.
        </p>
      </PolicySection>

      <PolicySection heading="6. Orders and Acceptance">
        <p>
          Placing an order through this website is an offer by you to buy the listed products. We may decline an
          order, for example where an item is out of stock or a price has been shown in error. If we do, we will
          tell you and refund anything you have paid. A contract is formed once we confirm that your order has been
          accepted and dispatched.
        </p>
      </PolicySection>

      <PolicySection heading="7. Pricing and Availability">
        <p>
          All prices are shown in pounds sterling. Prices may change, but a change will not affect an order we have
          already accepted. We make every effort to keep stock levels accurate. Occasionally an item may become
          unavailable after you have ordered, in which case we will contact you to offer an alternative or a refund.
        </p>
      </PolicySection>

      <PolicySection heading="8. Your Right to Cancel">
        <p>
          If you are a consumer buying online, the Consumer Contracts Regulations 2013 give you 14 days from the
          day you receive your order to change your mind and cancel. For hygiene reasons, this right does not apply
          to sealed cosmetic products once they have been opened or unsealed after delivery. Our Returns Policy
          explains how to cancel and how refunds work.
        </p>
      </PolicySection>

      <PolicySection heading="9. Faulty or Wrongly Described Items">
        <p>
          Under the Consumer Rights Act 2015, the products we sell must be as described, of satisfactory quality
          and fit for purpose. If an item arrives faulty, damaged or not as described, please contact us and we
          will put it right. Nothing in these terms affects your statutory rights.
        </p>
      </PolicySection>

      <PolicySection heading="10. Your Account">
        <p>
          If you create an account with us, you are responsible for keeping your login details confidential and for
          activity that takes place under your account. Please let us know straight away if you believe your account
          has been accessed without your permission.
        </p>
      </PolicySection>

      <PolicySection heading="11. Intellectual Property">
        <p>
          All content on this site, including text, graphics, logos, product photography and layout, belongs to
          Windsor Beauty or its licensors and is protected by copyright and other intellectual property laws. You may
          view and print pages for your own personal reference, but may not reproduce, redistribute or commercially
          exploit any part of this site without our written permission.
        </p>
      </PolicySection>

      <PolicySection heading="12. Customer Reviews">
        <p>
          Reviews published on this site are written by customers and reflect their personal opinions and
          experiences. They are not statements, claims or endorsements by Windsor Beauty. Results vary from person
          to person, and nothing in a customer review should be read as a claim by us about what any product does.
        </p>
        <p>
          If you leave a review, you confirm that it is your own genuine and honest opinion, that you have actually
          purchased or used the product you are reviewing, and that you have not been paid or otherwise rewarded for
          writing it. You must not submit anything unlawful, offensive, misleading, or that infringes somebody
          else&rsquo;s rights, and you must not claim that a product treats, cures or prevents any medical condition.
        </p>
        <p>
          Reviews are checked before they appear, and we may decline to publish, edit for length or clarity, or
          remove any review at our discretion, including where it does not meet the requirements above. By
          submitting a review you give us permission to publish it on this site and in our own marketing, together
          with your first name and the initial of your surname. You keep ownership of what you write. If you would
          like a review of yours removed, please contact us.
        </p>
      </PolicySection>

      <PolicySection heading="13. Limitation of Liability">
        <p>
          Nothing in these terms limits or excludes our liability where it would be unlawful to do so. This includes
          liability for death or personal injury caused by our negligence, for fraud, and for breach of your
          statutory rights as a consumer. Subject to that, we are not liable for losses that were not foreseeable
          when the contract was made, or for losses arising from a product being used other than as directed.
        </p>
      </PolicySection>

      <PolicySection heading="14. Changes to These Terms">
        <p>
          We may update these terms from time to time to reflect changes in our business, our products, or relevant
          law. The version published on this page at the time you place an order is the version that applies to that
          order.
        </p>
      </PolicySection>

      <PolicySection heading="15. Governing Law">
        <p>
          These terms are governed by the laws of England and Wales. Disputes may be brought in the courts of
          England and Wales. If you live in Scotland or Northern Ireland, you may also bring proceedings in the
          courts there.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
