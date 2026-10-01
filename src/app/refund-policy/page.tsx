import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';

export default function RefundPolicyPage() {
  return (
    <PolicyPage
      contentKey="refund-policy"
      title="Refund Policy"
      intro="This page explains how refunds and cancellations are handled. It should be read alongside our Returns Policy."
    >
      <PolicySection heading="Refunds">
        <p>
          Approved refunds are issued to the original payment method used at checkout. Please allow up to 10 working
          days for the refund to appear in your account, depending on your bank or card provider&rsquo;s processing
          times.
        </p>
      </PolicySection>

      <PolicySection heading="Cancellations">
        <p>
          If you wish to cancel an order, please contact us as soon as possible. If your order has not yet been
          dispatched, we will cancel it and issue a full refund. Once an order has been dispatched, the process set
          out in our Returns Policy for faulty, incorrect or unopened items will apply instead.
        </p>
      </PolicySection>

      <PolicySection heading="Your Statutory Rights">
        <p>
          Nothing in this policy affects your statutory rights as a consumer under applicable UK law. This policy
          should be read alongside our Terms and Conditions, Returns Policy and Product Disclaimer.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
