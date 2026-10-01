import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';
import { SITE_URL } from '../robots';

const DESCRIPTION = 'How refunds and cancellations work for skincare orders placed with Windsor Beauty, '
  + 'including how and when your money is returned.';

export const metadata: Metadata = {
  title: 'Refund Policy | Windsor Beauty',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/refund-policy` },
};

export default function RefundPolicyPage() {
  return (
    <PolicyPage
      contentKey="refund-policy"
      title="Refund Policy"
      intro="This page explains how refunds and cancellations are handled. It should be read alongside our Returns Policy."
    >
      <PolicySection heading="Refunds">
        <p>
          Refunds are made using the same payment method you used at checkout, unless we agree otherwise with you.
          If you cancel within your 14-day cancellation period, we will refund the price of the items and the
          standard delivery charge you paid, within 14 days of receiving the items back or of you showing us that
          you have sent them. Your bank or payment provider may then take a few days to show the money in your
          account.
        </p>
        <p>
          If an item is faulty, damaged or not as described, we will also cover the reasonable cost of returning it.
        </p>
      </PolicySection>

      <PolicySection heading="Cancellations">
        <p>
          If you wish to cancel an order, please contact us as soon as possible. If your order has not yet been
          dispatched, we will cancel it and refund you in full. Once an order has been dispatched, the process set
          out in our Returns Policy applies instead.
        </p>
      </PolicySection>

      <PolicySection heading="Your Statutory Rights">
        <p>
          Nothing in this policy affects your statutory rights as a consumer under UK law, including the Consumer
          Rights Act 2015 and the Consumer Contracts Regulations 2013. This policy should be read alongside our
          Terms and Conditions, Returns Policy and Product Disclaimer.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
