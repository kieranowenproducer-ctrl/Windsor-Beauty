import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';
import { SITE_URL } from '../robots';

const DESCRIPTION = 'How to get in touch with the Windsor Beauty skincare shop, what to expect when you '
  + 'do, and how we handle the information you share with us.';

export const metadata: Metadata = {
  title: 'Contact Policy | Windsor Beauty',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/contact-policy` },
};

export default function ContactPolicyPage() {
  return (
    <PolicyPage
      contentKey="contact-policy"
      title="Contact Policy"
      intro="How to get in touch with us, what to expect when you do, and how we handle the information you share with us."
    >
      <PolicySection heading="How to Reach Us">
        <p>
          The quickest way to reach our support team is through the contact options listed on our Contact page. Please
          include your order number (if your enquiry relates to an order) and as much detail as possible so that we
          can help you in our first reply.
        </p>
      </PolicySection>

      <PolicySection heading="Replies">
        <p>
          We aim to respond to all enquiries as quickly as possible. During particularly busy periods, such as
          following a promotion or over public holidays, replies may take a little longer, but we will always get
          back to you.
        </p>
      </PolicySection>

      <PolicySection heading="Questions About Your Skin">
        <p>
          We are happy to help with questions about our products and how to use them. We cannot give medical advice.
          If you have a skin condition or a medical concern, please speak to a pharmacist, doctor or dermatologist.
        </p>
      </PolicySection>

      <PolicySection heading="What We Use Your Enquiry For">
        <p>
          Information you share with us when you get in touch is used to respond to your enquiry, resolve any issue
          you have raised, and keep a record of our conversation. Contacting us does not add you to a marketing
          list. See &ldquo;Marketing Communications&rdquo; below.
        </p>
      </PolicySection>

      <PolicySection heading="Marketing Communications">
        <p>
          We only send marketing emails or offers to people who have actively chosen to receive them, for example by
          ticking a consent box when registering or signing up for a discount code. Contacting our support team does
          not opt you in to marketing, and you can withdraw consent to marketing at any time.
        </p>
      </PolicySection>

      <PolicySection heading="Fair Use">
        <p>
          We are happy to help with genuine questions, order issues and feedback. We ask that contact with our team
          remains respectful and relevant. We may stop replying to messages that are abusive, unrelated to our
          business, or sent in a way designed to disrupt our support service.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
