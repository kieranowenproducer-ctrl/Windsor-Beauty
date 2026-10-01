import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';
import { SITE_URL } from '../robots';

const DESCRIPTION = 'How payments are taken and protected when you order skincare from Windsor Beauty, '
  + 'including the payment methods offered at checkout.';

export const metadata: Metadata = {
  title: 'Payment Policy | Windsor Beauty',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/payment-policy` },
};

export default function PaymentPolicyPage() {
  return (
    <PolicyPage
      contentKey="payment-policy"
      title="Payment Policy"
      intro="How payments are taken, processed and protected when you place an order with Windsor Beauty."
    >
      <PolicySection heading="Accepted Payment Methods">
        <p>
          We accept payment by the methods shown at checkout. These currently include Pay by Bank, a secure
          transfer you approve with your own bank, and PayPal. Any processing fee that applies to a payment method
          is shown at checkout before you pay.
        </p>
      </PolicySection>

      <PolicySection heading="When You Pay">
        <p>
          Payment is made at the time you place your order. Your order is not confirmed until your payment has been
          received and we have sent you an order confirmation.
        </p>
      </PolicySection>

      <PolicySection heading="Secure Processing">
        <p>
          Payments are completed on the secure pages of your bank or the payment provider you choose. We do not
          receive or store your card details or your bank login details.
        </p>
      </PolicySection>

      <PolicySection heading="Currency and Pricing">
        <p>
          All prices on this website are displayed in pounds sterling (GBP). Delivery charges are shown separately
          at checkout before you confirm your order.
        </p>
      </PolicySection>

      <PolicySection heading="Declined or Failed Payments">
        <p>
          If a payment is declined or does not complete, your order will not be dispatched. Please try again, or
          contact your bank or payment provider if the problem continues. If you believe a payment has been taken
          in error, please contact our support team straight away.
        </p>
      </PolicySection>

      <PolicySection heading="Discount Codes and Promotions">
        <p>
          Discount codes are subject to the conditions stated when they are issued. We may refuse or withdraw a
          discount code where we reasonably believe it is being misused.
        </p>
      </PolicySection>

      <PolicySection heading="Refunds">
        <p>
          Where a refund is due, for example following a cancelled order or an approved return, it will be made
          using the payment method you used at checkout. Please see our Refund Policy and Returns Policy for full
          details.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
