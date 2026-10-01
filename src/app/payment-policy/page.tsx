import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';

export default function PaymentPolicyPage() {
  return (
    <PolicyPage
      contentKey="payment-policy"
      title="Payment Policy"
      intro="How payments are taken, processed and protected when you place an order with Windsor Glow."
    >
      <PolicySection heading="Accepted Payment Methods">
        <p>
          We accept payment by the methods shown at checkout, which may include major debit and credit cards and
          other secure online payment options. Available methods may vary depending on your location and order value.
        </p>
      </PolicySection>

      <PolicySection heading="When You Are Charged">
        <p>
          Payment is taken at the time you place your order. Your order is not confirmed, and a contract is not
          formed, until payment has been successfully authorised and we have sent you confirmation that your order
          has been accepted.
        </p>
      </PolicySection>

      <PolicySection heading="Secure Processing">
        <p>
          All payments are handled through encrypted, industry-standard payment processing. We do not store your full
          card details on our servers — this information is processed directly by our payment provider under their
          own security standards.
        </p>
      </PolicySection>

      <PolicySection heading="Currency and Pricing">
        <p>
          All prices on this website are displayed in pounds sterling (GBP) and include any applicable taxes unless
          stated otherwise. Delivery charges, where they apply, are shown separately at checkout before you confirm
          your order.
        </p>
      </PolicySection>

      <PolicySection heading="Declined or Failed Payments">
        <p>
          If a payment is declined or cannot be processed, your order will not be placed and no goods will be
          dispatched. Please check your payment details and try again, or contact your card provider if the problem
          continues. If you believe a payment has been taken in error, please contact our support team straight away.
        </p>
      </PolicySection>

      <PolicySection heading="Discount Codes and Promotions">
        <p>
          Discount codes, including those issued through our first-order offer, are single-use, non-transferable, and
          subject to any conditions stated at the time they are issued. We reserve the right to refuse or withdraw a
          discount code where we reasonably believe it is being misused.
        </p>
      </PolicySection>

      <PolicySection heading="Refunds">
        <p>
          Where a refund is due — for example, following a cancelled order or an approved return — it will be issued
          to the original payment method used at checkout. Please see our Returns Policy for full details on how and
          when refunds are processed.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
