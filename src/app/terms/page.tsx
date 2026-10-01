import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';

export default function TermsPage() {
  return (
    <PolicyPage
      contentKey="terms"
      title="Terms and Conditions"
      intro="These terms set out the basis on which you may access and use the Windsor Glow website and place an order with us. By using this site, you agree to them in full."
    >
      <PolicySection heading="1. Who We Are">
        <p>
          Windsor Glow is operated by C&amp;S Holdings Group (&ldquo;Windsor Glow&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;).
          References to &ldquo;you&rdquo; or &ldquo;the customer&rdquo; mean the person browsing this site or placing an order with us.
        </p>
      </PolicySection>

      <PolicySection heading="2. Acceptance of These Terms">
        <p>
          By entering this website, browsing our catalogue, creating an account, or placing an order, you confirm that
          you have read, understood, and agree to be bound by these Terms and Conditions, together with our Privacy
          Policy, Cookie Policy, Shipping Policy, Returns Policy, Product Disclaimer, Research Use Disclaimer, Payment
          Policy and Age Restriction Policy, each of which forms part of this agreement.
        </p>
      </PolicySection>

      <PolicySection heading="3. Eligibility to Use This Site">
        <p>
          This website and the products listed on it are intended exclusively for laboratory and research use by
          adults. You confirm, by using this site, that you are at least 18 years of age and that you are accessing
          the site for legitimate research purposes, in line with our Age Restriction Policy.
        </p>
      </PolicySection>

      <PolicySection heading="4. Products and Descriptions">
        <p>
          We take care to describe our products accurately, including purity figures and supporting documentation
          where applicable. However, product images, packaging and presentation may vary from those shown on the
          site. Please refer to our Product Disclaimer and Research Use Disclaimer for important information about
          the intended use of everything we sell.
        </p>
      </PolicySection>

      <PolicySection heading="5. Needle Usage Disclaimer">
        <p>
          Where needles, syringes or other sharps are supplied with a product, whether included in the package or
          offered as a separate accessory, they are provided solely to support the lawful handling, mixing and
          reconstitution of research compounds within a controlled laboratory or research setting. They are not
          intended for human or animal use, and no representation is made that they are suitable, sterile, or
          approved for use on or in a human or animal body.
        </p>
        <p>
          You are responsible for ensuring that the acquisition, storage, handling, use and disposal of any needles
          or sharps supplied with or alongside our products complies with the law in your jurisdiction, and for
          following appropriate sharps-handling and disposal procedures at all times.
        </p>
      </PolicySection>

      <PolicySection heading="6. Research Use Disclaimer">
        <p>
          <strong>Not for Human or Animal Consumption.</strong> All products listed on this website are sold
          exclusively for in-vitro laboratory research and experimental use. They are not for human or animal
          consumption in any form, by any route, and must not be ingested, injected, inhaled, applied to the body, or
          otherwise introduced into a human or animal under any circumstances.
        </p>
        <p>
          <strong>Sold to Qualified Researchers.</strong> By placing an order, you confirm that you are purchasing as
          a qualified individual or organisation conducting legitimate laboratory research, that you understand the
          handling and storage requirements of research compounds, and that you will use any product purchased from
          us solely within a controlled research environment.
        </p>
        <p>
          <strong>No Endorsement of Other Use.</strong> Windsor Glow does not endorse, encourage, or condone the use
          of any product sold on this site for purposes other than laboratory research. Any reference material we
          provide, including our Dosage Guide and calculator, exists only to support consistent handling and
          reconstitution of compounds for research purposes, and carries no implication that the product is suitable,
          safe, or approved for any other use.
        </p>
        <p>
          <strong>Compliance With Local Law.</strong> It is your responsibility to ensure that purchasing, possessing,
          and using any product from this site is lawful in your jurisdiction, and that you comply with any licensing,
          storage, or handling requirements that apply to research compounds where you are located.
        </p>
        <p>
          <strong>Acceptance of This Disclaimer.</strong> By using this website and placing an order, you confirm that
          you have read and understood this Research Use Disclaimer and agree to be bound by it, alongside our
          Product Disclaimer, Age Restriction Policy, and Terms and Conditions.
        </p>
      </PolicySection>

      <PolicySection heading="7. Research Use and Medical Disclaimer">
        <p>
          Every product listed on this website is supplied strictly for laboratory and scientific research purposes.
          None of our products are intended for human consumption, and they must not be ingested, injected, inhaled,
          applied to the body, or otherwise introduced into a human or animal under any circumstances.
        </p>
        <p>
          Nothing we sell is intended to diagnose, treat, cure or prevent any disease, condition or ailment, and no
          product should be regarded as a medicine, supplement or therapeutic substance. Windsor Glow does not provide
          medical advice, and nothing on this website — including product descriptions, dosage information, or any
          supporting guides or calculators — should be read or relied upon as such. Where we do publish reference
          material of this kind, it exists solely to support the accurate handling and reconstitution of compounds
          within a controlled research environment, for informational purposes only.
        </p>
        <p>
          You are responsible for satisfying yourself that purchasing, possessing and using any product from this
          site is lawful and appropriate in your circumstances and jurisdiction, and for ensuring it is handled only
          by suitably qualified persons in a proper research setting. If you have a medical question or concern,
          please seek guidance from a qualified healthcare professional rather than relying on anything published
          here. By entering this website, creating an account, or placing an order, you confirm that you understand
          and accept this disclaimer in full, in addition to our dedicated Research Use Disclaimer and Product
          Disclaimer.
        </p>
      </PolicySection>

      <PolicySection heading="8. Orders and Acceptance">
        <p>
          Placing an order through this website is an offer by you to purchase the listed products. We may accept or
          decline that offer at our discretion — for example, where stock is unavailable, where pricing has been
          displayed in error, or where we have reason to believe an order does not meet our eligibility requirements.
          A contract is only formed once we confirm that your order has been accepted and dispatched.
        </p>
      </PolicySection>

      <PolicySection heading="9. Pricing and Availability">
        <p>
          All prices are shown in pounds sterling and are correct at the time of publishing, but may change without
          notice. We make every effort to ensure stock levels shown on the site are accurate; occasionally an item
          may become unavailable after you have placed an order, in which case we will contact you to discuss
          alternatives, a partial refund, or a full refund.
        </p>
      </PolicySection>

      <PolicySection heading="10. Your Account">
        <p>
          If you create an account with us, you are responsible for keeping your login details confidential and for
          all activity that takes place under your account. Please let us know immediately if you believe your
          account has been accessed without your permission.
        </p>
      </PolicySection>

      <PolicySection heading="11. Intellectual Property">
        <p>
          All content on this site — including text, graphics, logos, product photography and layout — belongs to
          Windsor Glow or its licensors and is protected by copyright and other intellectual property laws. You may
          view and print pages for your own personal reference, but may not reproduce, redistribute or otherwise
          commercially exploit any part of this site without our written permission.
        </p>
      </PolicySection>

      {/* Added for task 4dea3c3d, after Kieran asked whether the Terms needed
          anything about reviews. Placed here because a review is user content
          with a licence attached, which is what the section above covers. */}
      <PolicySection heading="12. Customer Reviews">
        <p>
          Reviews published on this site are written by customers and reflect their personal opinions and
          experiences. They are not statements, claims or endorsements by Windsor Glow, and nothing in a customer
          review should be read as a claim by us about what any product does. All products are supplied strictly for
          laboratory and in vitro research purposes only.
        </p>
        <p>
          If you leave a review, you confirm that it is your own genuine and honest opinion, that you have actually
          purchased or used the product you are reviewing, and that you have not been paid or otherwise rewarded for
          writing it. You must not submit anything unlawful, offensive, misleading, or that infringes somebody
          else&rsquo;s rights, and you must not describe or suggest human or animal use, dosing, administration, or
          any medicinal, therapeutic or health benefit.
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
          Nothing in these terms limits or excludes our liability where it would be unlawful to do so. Subject to
          that, we are not liable for any indirect or consequential loss arising from your use of this site or our
          products, including any loss arising from use of our products outside of the research purposes for which
          they are sold.
        </p>
      </PolicySection>

      <PolicySection heading="14. Changes to These Terms">
        <p>
          We may update these terms from time to time to reflect changes in our business, our products, or relevant
          law. The version published on this page at the time you place an order is the version that applies to that
          order. We recommend checking this page periodically.
        </p>
      </PolicySection>

      <PolicySection heading="15. Governing Law">
        <p>
          These terms are governed by the laws of England and Wales, and any disputes relating to them will be
          subject to the exclusive jurisdiction of the courts of England and Wales.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
