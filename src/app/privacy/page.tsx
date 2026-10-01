import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';
import { SITE_URL } from '../robots';

const DESCRIPTION = 'How the Windsor Beauty skincare shop collects, uses and looks after your personal '
  + 'information, and the rights you have under UK data protection law.';

export const metadata: Metadata = {
  title: 'Privacy Policy | Windsor Beauty',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPolicyPage() {
  return (
    <PolicyPage
      contentKey="privacy"
      title="Privacy Policy"
      intro="This page explains what personal information we collect, why we collect it, and how we look after it."
    >
      <PolicySection heading="Who We Are">
        <p>
          Windsor Beauty, operated by C&amp;S Holdings Group, is the data controller responsible for the personal
          information described in this policy. Any questions about this policy or how your data is handled can be
          directed to our support team via the Contact page.
        </p>
      </PolicySection>

      <PolicySection heading="Information We Collect">
        <p>We may collect and process the following types of information:</p>
        <ul className="list-disc list-outside pl-5 space-y-1.5">
          <li>Contact details you provide when creating an account, placing an order or contacting us, such as your name, email address, delivery address and phone number.</li>
          <li>Order and payment details, including the products you buy and confirmation that a payment was made. Payments are completed with the payment provider you choose at checkout. We do not receive or store your card or bank login details.</li>
          <li>Reviews, messages and other content you choose to send us.</li>
          <li>Marketing preferences, including whether you have opted in to receive offers or updates from us, and any discount codes issued to you.</li>
          <li>Technical and usage information, such as your IP address, device and browser type and the pages you visit, collected through cookies and similar technologies as described in our Cookie Policy.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="How We Use Your Information">
        <p>We use personal information to:</p>
        <ul className="list-disc list-outside pl-5 space-y-1.5">
          <li>Process and deliver your orders, and keep you updated about them.</li>
          <li>Manage your account and provide customer support.</li>
          <li>Understand how the shop is used so that we can fix problems and improve it.</li>
          <li>Keep the site secure and prevent fraud or misuse.</li>
          <li>Send you marketing emails, but only where you have clearly agreed to receive them. You can unsubscribe at any time using the link in any marketing email.</li>
          <li>Meet our legal, accounting and regulatory obligations.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="Our Legal Basis for Processing">
        <p>
          Under UK data protection law (the UK GDPR and the Data Protection Act 2018), we rely on different legal
          grounds depending on the activity: performing our contract with you (for example, fulfilling an order),
          our legitimate interests (for example, keeping the site secure and improving our service), your consent
          (for example, marketing emails), and compliance with our legal obligations (for example, keeping records
          for tax purposes).
        </p>
      </PolicySection>

      <PolicySection heading="How Long We Keep Information">
        <p>
          We keep personal information only for as long as we need it for the purposes described in this policy,
          including any legal, accounting or reporting requirements. You can ask us to review or delete your
          information at any time, subject to our legal obligations.
        </p>
      </PolicySection>

      <PolicySection heading="Sharing Your Information">
        <p>
          We do not sell personal information. We share it only with trusted providers who help us run the shop,
          such as payment providers, delivery couriers, website hosting and IT providers, and email services, and
          only to the extent they need it to provide their service to us. Some of these providers may process
          information outside the United Kingdom. Where they do, we rely on the safeguards that UK data protection
          law requires.
        </p>
      </PolicySection>

      <PolicySection heading="Keeping Your Information Secure">
        <p>
          We use appropriate technical and organisational measures to protect personal information against
          unauthorised access, loss, misuse or alteration.
        </p>
      </PolicySection>

      <PolicySection heading="Your Rights">
        <p>
          You have the right to ask for a copy of your personal information, to have it corrected or deleted, to
          restrict or object to how we use it, to receive it in a portable format, and to withdraw consent to
          marketing at any time. To use any of these rights, please contact our support team via the Contact page.
          We will respond within the time the law allows.
        </p>
        <p>
          If you are unhappy with how we have handled your information, please tell us first so we can try to put
          it right. You also have the right to complain to the Information Commissioner&rsquo;s Office (ICO), the
          UK data protection regulator, at ico.org.uk.
        </p>
      </PolicySection>

      <PolicySection heading="Changes to This Policy">
        <p>
          We may update this policy from time to time to reflect changes in our practices or in the law. The version
          published on this page is the current version.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
