import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';

export default function ReturnsPolicyPage() {
  return (
    <PolicyPage
      contentKey="returns-policy"
      title="Returns Policy"
      intro="Because of the nature of our products, our approach to returns differs from a typical retail policy. Here is what you need to know."
    >
      <PolicySection heading="The Nature of Our Products">
        <p>
          Windsor Beauty supplies research compounds that are sealed, batch-referenced and supplied with supporting
          documentation such as a certificate of analysis. For reasons of safety, integrity and regulatory
          compliance, we are unable to accept returns of any product once its packaging or seal has been opened or
          tampered with.
        </p>
      </PolicySection>

      <PolicySection heading="Faulty or Incorrect Items">
        <p>
          If you receive an item that is faulty, damaged in transit, or different from what you ordered, please
          contact us within 14 days of delivery with your order number, a description of the issue, and photographs
          where possible. We will investigate promptly and, where the issue is confirmed, arrange a replacement or
          refund at no additional cost to you.
        </p>
      </PolicySection>

      <PolicySection heading="Unopened, Unused Items">
        <p>
          Where a product remains sealed, unused and in its original condition, we may at our discretion accept a
          return within 14 days of delivery. Please contact our support team before sending anything back, as items
          returned without prior agreement may not be eligible for a refund. Return postage costs in this situation
          are the responsibility of the customer unless the return is due to our error.
        </p>
      </PolicySection>

      <PolicySection heading="How to Start a Return or Report an Issue">
        <p>
          To begin a return or report a problem with your order, please email our support team with your order number
          and a brief explanation of the issue, and we will guide you through the next steps.
        </p>
      </PolicySection>

      <PolicySection heading="Your Statutory Rights">
        <p>
          Nothing in this policy affects your statutory rights as a consumer under applicable UK law. This policy
          should be read alongside our Terms and Conditions, Product Disclaimer and Refund Policy.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
