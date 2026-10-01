import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';
import { SITE_URL } from '../robots';

const DESCRIPTION = 'How to return a skincare order to Windsor Beauty: your 14-day right to change your '
  + 'mind on unopened items, and what to do if something arrives faulty or wrong.';

export const metadata: Metadata = {
  title: 'Returns Policy | Windsor Beauty',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/returns` },
};

export default function ReturnsPolicyPage() {
  return (
    <PolicyPage
      contentKey="returns-policy"
      title="Returns Policy"
      intro="We want you to be happy with your order. Here is how returns work, and what to do if something is not right."
    >
      <PolicySection heading="Changing Your Mind">
        <p>
          Under the Consumer Contracts Regulations 2013, you have 14 days from the day you receive your order to
          tell us you would like to cancel it. You do not need to give a reason. You then have a further 14 days to
          send the items back to us.
        </p>
      </PolicySection>

      <PolicySection heading="Opened or Unsealed Products">
        <p>
          Skincare is a personal product. For health protection and hygiene reasons, the right to change your mind
          does not apply to sealed cosmetic products once they have been opened or unsealed after delivery. Items
          returned under this section should be unopened, unused and in their original packaging. This does not
          affect your rights if an item is faulty or not as described.
        </p>
      </PolicySection>

      <PolicySection heading="Faulty or Incorrect Items">
        <p>
          Under the Consumer Rights Act 2015, your products must be as described, of satisfactory quality and fit
          for purpose. If an item arrives faulty, damaged, or different from what you ordered, please contact us
          with your order number, a short description of the problem, and photographs where possible. Where the
          problem is confirmed, we will arrange a replacement or refund and cover the reasonable cost of returning
          the item. You have 30 days from delivery to reject a faulty item for a full refund, and further rights
          after that.
        </p>
      </PolicySection>

      <PolicySection heading="If a Product Does Not Suit Your Skin">
        <p>
          If you experience irritation, stop using the product and contact us with your order number. We will do our
          best to help. If a reaction is severe or does not settle, please seek advice from a pharmacist or doctor.
        </p>
      </PolicySection>

      <PolicySection heading="How to Start a Return or Report an Issue">
        <p>
          Please contact our support team through the Contact page before sending anything back, with your order
          number and a brief explanation. We will confirm the return address and the next steps. If you are
          returning an item because you have changed your mind, the cost of return postage is yours to pay.
        </p>
      </PolicySection>

      <PolicySection heading="Your Statutory Rights">
        <p>
          Nothing in this policy affects your statutory rights as a consumer under UK law. This policy should be
          read alongside our Terms and Conditions, Product Disclaimer and Refund Policy.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
